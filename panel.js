'use strict';
const $=id=>document.getElementById(id),keyOf=i=>`${i.kind}:${i.windowId ?? ''}:${i.id}`;
if(location.hash.startsWith('#overlay'))document.body.classList.add('overlay');
const overlay=location.hash.startsWith('#overlay');
const modes=[['all','All'],['tabs','Tabs'],['bookmarks','Bookmarks'],['windows','Windows'],['workspaces','Spaces'],['active','Active']];
const icons={tabs:'▱',bookmarks:'☆',windows:'▣',workspaces:'◈',commands:'›'};
let items=[],mode='tabs',scope=null,visible=[],selected=0,limit=60,commandTarget=null,workspaceSupported=false;
let version=0,bookmarkVersion=0,bookmarksReady=false,coreReady=false,anchor=null,side=null,busy=false,refreshTimer;
let chosen=new Set();
const rowCache=new Map(),modeButtons=new Map(),iconCache=new Map(),iconQueue=new Set();
let iconTimer;
async function rpc(type,args={}){const r=await browser.runtime.sendMessage({type,...args});if(r.error)throw new Error(r.error);return r.data;}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function current(){return visible[selected] || null;}
function itemFor(key){return items.find(i=>keyOf(i)===key);}
async function dismiss(){await rpc('dismiss').catch(()=>{});if(!overlay)window.close();}
function shortURL(url){try{const u=new URL(url);return u.hostname+(u.pathname==='/'?'':u.pathname);}catch{return url || '';}}
function prepare(i){return ZenSearch.prepare(i);}
for(const [index,[key,label]] of modes.entries()){
  const b=node('button','mode');b.type='button';b.setAttribute('aria-pressed',String(mode===key));b.title=`${label} · Alt+${index+1}${key==='active'?' · All loaded tabs':''}`;
  b.append(node('span','',label),node('span','count','…'),node('small','',index+1));b.onclick=()=>setMode(key);modeButtons.set(key,b);$('modes').append(b);
}
function viewMatches(i,key){return key==='all'||(key==='active'?i.kind==='tabs'&&!i.discarded:i.kind===key);}
function render({preserve=false}={}){
  const previous=current(),scroll=$('results').scrollTop,q=$('query').value,isCommand=q.trimStart().startsWith('>');
  const matches=ZenSearch.search(items,isCommand?'':q,scope);
  for(const [key,b] of modeButtons){const count=matches.filter(i=>viewMatches(i,key)).length;b.querySelector('.count').textContent=key==='bookmarks'&&!bookmarksReady?'…':String(count);b.setAttribute('aria-pressed',String(mode===key));}
  visible=isCommand?ZenSearch.search(commands(),q.trimStart().slice(1)):matches.filter(i=>viewMatches(i,mode));
  if(preserve&&previous){const index=visible.findIndex(i=>keyOf(i)===keyOf(previous));if(index>=0)selected=index;}
  selected=Math.max(0,Math.min(selected,visible.length-1));
  const keys=new Set(visible.map(keyOf));chosen=new Set([...chosen].filter(k=>keys.has(k)));
  if(anchor&&!keys.has(anchor))anchor=null;
  updateSummary();
  $('scope').hidden=!scope;$('scope').textContent=scope?`${scope.title} ×`:'';
  $('results').hidden=!visible.length;$('empty').hidden=!!visible.length;
  const h=$('empty').querySelector('h2'),p=$('empty').querySelector('p');
  if(!coreReady || (mode==='bookmarks'&&!bookmarksReady)){h.textContent='Loading…';p.textContent='';}
  else if(mode==='workspaces'&&!workspaceSupported){h.textContent='Workspace integration unavailable';p.textContent='Enable the Zen Experiment API to search real workspaces.';}
  else{h.textContent='No matches yet';p.textContent='Try a shorter name, a domain, or another mode.';}
  renderRows();if(preserve)$('results').scrollTop=scroll;
}
function updateSummary(){const q=$('query').value;$('summary').textContent=(chosen.size>1?`${chosen.size} selected · `:'')+(q.trimStart().startsWith('>')?`${visible.length} commands`:`${visible.length} ${q?'matches':mode==='active'?'loaded tabs':'results'}`);}
function siteColor(url){let h=0;try{url=new URL(url).hostname;}catch{}for(const c of url || '')h=(h*31+c.charCodeAt(0))>>>0;const hue=h%360,s=.42,l=.64,a=s*Math.min(l,1-l),f=n=>{const k=(n+hue/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return `${f(0)} ${f(8)} ${f(4)}`;}
function iconColor(img){
  try{const canvas=document.createElement('canvas');canvas.width=canvas.height=12;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,12,12);const pixels=ctx.getImageData(0,0,12,12).data,buckets=new Map();
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(pixels[i+3]<180||Math.max(r,g,b)<45||Math.min(r,g,b)>235)continue;const key=[r>>5,g>>5,b>>5].join(',');const bin=buckets.get(key)||[0,0,0,0];const weight=1+(Math.max(r,g,b)-Math.min(r,g,b))/80;bin[0]+=weight;bin[1]+=r*weight;bin[2]+=g*weight;bin[3]+=b*weight;buckets.set(key,bin);}
    const best=[...buckets.values()].sort((a,b)=>b[0]-a[0])[0];if(best)return best.slice(1).map(v=>Math.round(v/best[0])).join(' ');
  }catch{}return null;
}
function applyIcon(row,data){
  if(!data||!/^data:image\//i.test(data)||row._iconData===data)return;
  row._iconData=data;const box=row.querySelector('.icon'),img=node('img','favicon');img.alt='';img.width=img.height=20;img.decoding='async';
  img.onload=()=>{if(!row.isConnected)return;const cached=iconCache.get(row._item.url),color=cached?.color||iconColor(img);if(color){row.style.setProperty('--site-rgb',color);if(cached)cached.color=color;}};
  img.onerror=()=>{if(img.parentNode)box.replaceChildren(node('span','',icons[row._item.kind]));};img.src=data;box.replaceChildren(img);
}
const iconObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){iconObserver.unobserve(e.target);const row=e.target;if(row._item.favIconUrl?.startsWith('data:image/'))continue;const entry=iconCache.get(row._item.url);if(entry){if(entry.color)row.style.setProperty('--site-rgb',entry.color);applyIcon(row,entry.data);}else if(/^https?:/i.test(row._item.url || '')){iconQueue.add(row._item.url);clearTimeout(iconTimer);iconTimer=setTimeout(loadIcons,0);}}},{root:$('results'),rootMargin:'60px'});
async function loadIcons(){const urls=[...iconQueue].slice(0,64);urls.forEach(u=>iconQueue.delete(u));if(!urls.length)return;
  try{for(const result of await rpc('favicons',{urls})){iconCache.set(result.url,{data:result.data});for(const row of rowCache.values())if(row._item.url===result.url)applyIcon(row,result.data);}while(iconCache.size>256)iconCache.delete(iconCache.keys().next().value);}catch{}
  if(iconQueue.size)iconTimer=setTimeout(loadIcons,0);
}
function makeRow(item){
  const row=node('div','row');row.setAttribute('role','option');row.append(node('span','check','✓'),node('span','icon',icons[item.kind]));
  const info=node('div','info');info.append(node('div','title'),node('div','subtitle'));row.append(info,node('div','badges'));
  const menu=node('button','row-action','•••');menu.onclick=e=>{e.stopPropagation();selectForMenu(row._item);showActions(row._item);};row.append(menu);
  row.onclick=e=>{const item=row._item,index=visible.findIndex(i=>keyOf(i)===keyOf(item));
    if(e.shiftKey&&item.kind==='tabs'){selectRange(index);return;}
    if((e.ctrlKey||e.metaKey)&&item.kind==='tabs'){const key=keyOf(item);if(!chosen.size&&current()?.kind==='tabs')chosen.add(keyOf(current()));chosen.has(key)?chosen.delete(key):chosen.add(key);selected=index;anchor=key;render();return;}
    selected=index;chosen.clear();anchor=null;openItem(item).catch(err=>status(err.message,true));
  };
  row.oncontextmenu=e=>{e.preventDefault();selectForMenu(row._item);showActions(row._item);};
  return row;
}
function renderRows(){
  const list=$('results'),wanted=visible.slice(0,Math.max(limit,selected+1)),keep=new Set();
  wanted.forEach((item,index)=>{
    const key=keyOf(item);keep.add(key);let row=rowCache.get(key);if(!row){row=makeRow(item);rowCache.set(key,row);}
    const old=row._item;row._item=item;row.id=`result-${index}`;row.dataset.kind=item.kind;row.dataset.key=key;
    row.classList.toggle('cursor',index===selected);row.classList.toggle('multi',chosen.size>1&&chosen.has(key));row.setAttribute('aria-selected',String(chosen.size?chosen.has(key):index===selected));
    if(!old||old.url!==item.url){row.style.setProperty('--site-rgb',siteColor(item.url));row._iconData=null;row.querySelector('.icon').textContent=icons[item.kind];iconObserver.observe(row);}
    const direct=item.favIconUrl;if(direct?.startsWith('data:image/'))applyIcon(row,direct);
    if(!old||old.title!==item.title)row.querySelector('.title').textContent=item.title;
    const subtitle=item.kind==='tabs'?[shortURL(item.url),item.workspaceName,item.essential?'Essential':''].filter(Boolean).join(' · '):item.subtitle;
    if(row._subtitle!==subtitle){row.querySelector('.subtitle').textContent=subtitle;row._subtitle=subtitle;}
    const badgeKey=[item.active,item.pinned,item.discarded,item.audible,mode].join(':');
    if(row._badges!==badgeKey){const badges=[];if(item.active)badges.push(node('span','badge active',item.kind==='tabs'?'Current':'Current'));
      if(item.pinned)badges.push(node('span','badge','Pinned'));if(item.discarded)badges.push(node('span','badge','Unloaded'));if(item.audible)badges.push(node('span','badge','Audio'));
      if(mode==='all'&&item.kind!=='commands')badges.push(node('span','badge kind',{tabs:'Tab',bookmarks:'Bookmark',windows:'Window',workspaces:'Space'}[item.kind]));
      row.querySelector('.badges').replaceChildren(...badges);row._badges=badgeKey;
    }
    const action=row.querySelector('.row-action');action.hidden=item.kind==='commands';action.setAttribute('aria-label',`Actions for ${item.title}`);
    if(list.children[index]!==row)list.insertBefore(row,list.children[index] || null);
  });
  for(const [key,row] of rowCache)if(!keep.has(key)){iconObserver.unobserve(row);row.remove();rowCache.delete(key);}
  let more=$('more');if(visible.length>wanted.length){if(!more){more=node('button','quiet');more.id='more';more.onclick=()=>{limit+=60;renderRows();};}more.textContent=`Show more · ${visible.length-wanted.length} remaining`;list.append(more);}else more?.remove();
  $('query').setAttribute('aria-activedescendant',visible.length?`result-${selected}`:'');
}
function selectRange(index){
  if(!anchor)anchor=current()?keyOf(current()):null;
  let start=visible.findIndex(i=>keyOf(i)===anchor);if(start<0)start=selected;
  selected=Math.max(0,Math.min(index,visible.length-1));chosen=new Set(visible.slice(Math.min(start,selected),Math.max(start,selected)+1).filter(i=>i.kind==='tabs').map(keyOf));
  limit=Math.max(limit,selected+1);updateSummary();renderRows();document.getElementById(`result-${selected}`)?.scrollIntoView({block:'nearest'});
}
function selectForMenu(item){selected=visible.findIndex(i=>keyOf(i)===keyOf(item));if(!chosen.has(keyOf(item))){chosen.clear();if(item.kind==='tabs')chosen.add(keyOf(item));}render({preserve:true});}
function setMode(key){if(!['tabs','active'].includes(key))scope=null;mode=key;selected=0;limit=60;chosen.clear();anchor=null;closeSide();render();$('results').scrollTop=0;$('query').focus();}
async function refresh(){const v=++version;try{const data=await rpc('snapshot');if(v!==version)return;items=[...data.items.map(prepare),...items.filter(i=>i.kind==='bookmarks')];workspaceSupported=data.workspaceSupported;coreReady=true;render({preserve:true});syncSide();}catch(e){status(e.message,true);}}
async function loadBookmarks(){const v=++bookmarkVersion;try{const data=await rpc('bookmarks');if(v!==bookmarkVersion)return;items=[...items.filter(i=>i.kind!=='bookmarks'),...data.items.map(prepare)];bookmarksReady=true;render({preserve:true});}catch(e){status('Bookmarks: '+e.message,true);}}
function applyDelta(data){
  version++; // An older snapshot must never overwrite a newer unload/pin result.
  const removed=new Set(data.removed || []),updates=new Map((data.updates || []).map(p=>[p.id,p]));
  items=items.filter(i=>i.kind!=='tabs'||!removed.has(i.id)).map(i=>{
    const patch=i.kind==='tabs'&&updates.get(i.id);if(!patch)return i;
    const next={...i,...patch};return ('title' in patch||'url' in patch)?prepare(next):next;
  });
  if(removed.size)updateGroupCounts();render({preserve:true});if(side?.keys?.some(k=>{const i=itemFor(k);return i?.kind==='tabs'&&updates.has(i.id)||!i;}))syncSide();
}
function updateGroupCounts(){const counts=new Map(),windowCounts=new Map();for(const i of items)if(i.kind==='tabs'){const k=i.windowId+':'+i.workspaceId;counts.set(k,(counts.get(k)||0)+1);windowCounts.set(i.windowId,(windowCounts.get(i.windowId)||0)+1);}
  items=items.map(i=>{if(i.kind==='workspaces')return prepare({...i,subtitle:`${counts.get(i.windowId+':'+i.id)||0} tabs · Window ${i.windowId}${i.active?' · Current workspace':''}`});if(i.kind==='windows')return prepare({...i,subtitle:`Window ${i.id} · ${windowCounts.get(i.id)||0} tabs${i.active?' · Current window':''}`});return i;});
}
let needsRefresh=false;
function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(busy)needsRefresh=true;else refresh();},80);}
const queuedUpdates=new Map(),queuedRemoved=new Set();let deltaTimer;
function queueDelta(m){for(const p of m.updates||[])queuedUpdates.set(p.id,{...queuedUpdates.get(p.id),...p});for(const id of m.removed||[])queuedRemoved.add(id);if(!deltaTimer)deltaTimer=setTimeout(flushDeltas,16);}
function flushDeltas(){clearTimeout(deltaTimer);deltaTimer=null;if(busy)return;if(queuedUpdates.size||queuedRemoved.size){const data={updates:[...queuedUpdates.values()],removed:[...queuedRemoved]};queuedUpdates.clear();queuedRemoved.clear();applyDelta(data);}}
async function mutate(action,targets){
  if(busy||!targets.length)return;busy=true;const focus=document.activeElement?.dataset.action;
  $('detail').querySelectorAll('button.action').forEach(b=>b.disabled=true);
  try{const result=await rpc('tabActions',{action,ids:targets.map(t=>t.id)});applyDelta(result);const count=(result.updates?.length||0)+(result.removed?.length||0),verb={pin:'Pinned',unpin:'Unpinned',unload:'Unloaded',close:'Closed'}[action];
    status(`${verb} ${count} tab${count===1?'':'s'}.${result.errors?.length?' '+result.errors.length+' skipped: '+result.errors[0].message:''}`,!!result.errors?.length);
  }catch(e){status(e.message,true);}finally{busy=false;flushDeltas();if(needsRefresh){needsRefresh=false;schedule();}syncSide();if(focus)$('detail').querySelector(`[data-action="${focus}"]:not(:disabled)`)?.focus();}
}
async function perform(type,args,message){try{const result=await rpc(type,args);if(result?.updates||result?.removed)applyDelta(result);else if(['bookmarkCurrent','editBookmark','deleteBookmark'].includes(type))await loadBookmarks();else await refresh();status(message);if(['editBookmark','deleteBookmark'].includes(type))closeSide();}catch(e){status(e.message,true);}}
async function openItem(item,modifier=false){
  if(!item)return;if(item.kind==='commands'){await item.run();return;}
  if(item.kind==='tabs'&&modifier){showDetails(item);return;}
  if(item.kind==='workspaces'){scope=item;mode='tabs';$('query').value='';selected=0;chosen.clear();anchor=null;closeSide();render();$('query').focus();return;}
  if(item.kind==='tabs'){await rpc('activate',{id:item.id});await dismiss();}
  if(item.kind==='bookmarks'){await rpc('openBookmark',{id:item.id,background:modifier});if(!modifier)await dismiss();else status('Opened in background.');}
  if(item.kind==='windows'){await rpc('focusWindow',{id:item.id});await dismiss();}
}
function closeSide(){side=null;$('detail').hidden=true;document.querySelector('.palette').classList.remove('has-side');}
function detail(title){$('detail').hidden=false;document.querySelector('.palette').classList.add('has-side');const head=node('div','side-head'),h=node('h2','',title),b=node('button','quiet','×');b.setAttribute('aria-label','Close side menu');b.onclick=()=>{closeSide();$('query').focus();};head.append(h,b);$('detail').replaceChildren(head);}
function addAction(label,handler,disabled=false,id=''){const b=node('button','action',label);b.disabled=disabled||busy;if(id)b.dataset.action=id;b.onclick=()=>Promise.resolve().then(handler).catch(e=>status(e.message,true));$('detail').append(b);return b;}
function focusAction(){$('detail').querySelector('button.action:not(:disabled),input')?.focus();}
function targetsFor(item){return item.kind==='tabs'&&chosen.has(keyOf(item))&&chosen.size>1?items.filter(i=>i.kind==='tabs'&&chosen.has(keyOf(i))):[item];}
function showActions(item){commandTarget=item;side={type:'actions',keys:targetsFor(item).map(keyOf)};drawActions();focusAction();}
function drawActions(){
  const targets=side.keys.map(itemFor).filter(Boolean),item=targets[0];detail(targets.length>1?`${targets.length} tabs selected`:item?.title || 'Selection updated');
  if(!item){$('detail').append(node('p','','The selected item was closed. Your search is unchanged.'));return;}
  if(item.kind==='tabs'){
    if(targets.length===1){addAction('Tab details · Ctrl Enter',()=>showDetails(item));addAction('Switch to tab',()=>openItem(item));}
    addAction(`Pin${targets.length>1?' selected tabs':' tab'}`,()=>mutate('pin',targets),targets.every(t=>t.pinned||t.essential),'pin');
    addAction(`Unpin${targets.length>1?' selected tabs':' tab'}`,()=>mutate('unpin',targets),targets.every(t=>!t.pinned||t.essential),'unpin');
    addAction(`Unload${targets.length>1?' selected tabs':' tab'}`,()=>mutate('unload',targets),targets.every(t=>t.active||t.discarded),'unload');
    if(targets.some(t=>t.active))$('detail').append(node('p','side-note','The current tab stays loaded.'));
    if(targets.length===1){addAction('Move to workspace…',()=>chooseMove(item,'workspaces'),!workspaceSupported||item.essential);addAction('Move to window…',()=>chooseMove(item,'windows'));}
    addAction(`Close${targets.length>1?' '+targets.length+' selected tabs':' tab'}`,()=>mutate('close',targets),false,'close');
  }else if(item.kind==='bookmarks'){
    addAction('Open bookmark',()=>openItem(item));addAction('Open in background',()=>openItem(item,true));addAction('Edit bookmark…',()=>editBookmark(item));
    addAction('Delete bookmark…',()=>{side={type:'form'};detail('Delete this bookmark?');$('detail').append(node('p','',item.title));addAction('Cancel',()=>showActions(item));addAction('Delete bookmark',()=>perform('deleteBookmark',{id:item.id},'Bookmark deleted.'));focusAction();});
  }else if(item.kind==='workspaces'){addAction('Search this workspace',()=>openItem(item));addAction('Switch to workspace',async()=>{await rpc('switchWorkspace',{id:item.id,windowId:item.windowId});await dismiss();});}
  else if(item.kind==='windows')addAction('Focus window',()=>openItem(item));
}
function showDetails(item){side={type:'details',keys:[keyOf(item)]};drawDetails();focusAction();}
function drawDetails(){const t=itemFor(side.keys[0]);detail('Tab details');if(!t){$('detail').append(node('p','','This tab was closed.'));return;}
  $('detail').append(node('h3','detail-title',t.title));const dl=node('dl','facts');
  for(const [label,value] of [['Address',t.url],['Workspace',t.essential?'Shared Essential':t.workspaceName || '—'],['Window',String(t.windowId)],['State',t.discarded?'Unloaded':t.status==='loading'?'Loading':'Loaded'],['Current tab',t.active?'Yes':'No'],['Pinned',t.pinned?'Yes':'No'],['Audio',t.audible?'Playing':'Silent'],['Last used',t.lastUsed?new Date(t.lastUsed).toLocaleString():'Unknown']])dl.append(node('dt','',label),node('dd','',value));
  $('detail').append(dl);addAction('Tab actions',()=>showActions(t));
}
function syncSide(){if(!side||busy)return;const scroll=$('detail').scrollTop,focus=document.activeElement?.dataset.action;if(side.type==='actions')drawActions();else if(side.type==='details')drawDetails();$('detail').scrollTop=scroll;if(focus)$('detail').querySelector(`[data-action="${focus}"]:not(:disabled)`)?.focus();}
function chooseMove(tab,kind){side={type:'form'};detail(kind==='workspaces'?'Move to workspace':'Move to window');const targets=items.filter(i=>i.kind===kind&&(kind==='workspaces'?i.windowId===tab.windowId&&i.id!==tab.workspaceId:i.id!==tab.windowId));if(!targets.length)$('detail').append(node('p','','No other destinations available.'));for(const t of targets)addAction(t.title,()=>perform(kind==='workspaces'?'moveWorkspace':'moveWindow',{tabId:tab.id,id:t.id},'Tab moved.'));addAction('Back',()=>showActions(tab));focusAction();}
function editBookmark(item){side={type:'form'};detail('Edit bookmark');const name=node('input'),url=node('input');name.id='edit-title';url.id='edit-url';name.value=item.title;url.value=item.url;const a=node('label','','Title'),b=node('label','','URL');a.htmlFor=name.id;b.htmlFor=url.id;$('detail').append(a,name,b,url);addAction('Save bookmark',()=>perform('editBookmark',{id:item.id,title:name.value,url:url.value},'Bookmark updated.'));addAction('Cancel',()=>showActions(item));name.focus();}
function showHelp(){side={type:'help'};detail('Keyboard guide');for(const text of ['Tabs opens by default. Type to fuzzy-search; each mode shows its matching count. Results stay in last-used order.','Alt+1 All · 2 Tabs · 3 Bookmarks · 4 Windows · 5 Spaces · 6 Active. Active includes every loaded tab.','↑ / ↓ navigate. Shift + ↑ / ↓ extends or shrinks a range of selected tabs. Ctrl-click toggles a tab; Shift-click selects a range.','Right-click, •••, or Ctrl+K opens actions on the right. Pin, unpin, unload or close multiple selected tabs together.','Ctrl+Enter on a single tab opens its details without switching or reloading it. Enter switches to the tab. Ctrl+Enter on a bookmark opens it in the background.','Commands are optional: > pin, > unpin, > unload, > close, > move, > bookmark, > restore.','Unloading never activates a tab. Current tabs are skipped. In Active mode, unloaded tabs disappear because they are no longer loaded. Your search and scroll position are retained.'])$('detail').append(node('p','',text));}
function cmd(id,title,run){return prepare({kind:'commands',id,title,subtitle:'Command · Enter to run',run});}
function commands(){const t=commandTarget || current(),targets=t?.kind==='tabs'?targetsFor(t):[];const list=[cmd('help','Help — keyboard shortcuts',showHelp),cmd('bookmark','Bookmark current page',()=>perform('bookmarkCurrent',{},'Bookmark saved.')),cmd('unload-others','Unload other tabs',()=>perform('unloadOthers',{},'Other eligible tabs unloaded.')),cmd('restore','Restore last closed tab',()=>perform('restore',{},'Restored.'))];if(t?.kind==='tabs'){for(const [action,label] of [['pin','Pin'],['unpin','Unpin'],['unload','Unload'],['close','Close']])list.unshift(cmd(action,`${label} — ${targets.length>1?targets.length+' tabs':t.title}`,()=>mutate(action,targets)));list.push(cmd('details',`Details — ${t.title}`,()=>showDetails(t)));}for(const w of items.filter(i=>i.kind==='workspaces')){list.push(cmd('switch:'+w.windowId+':'+w.id,`Switch workspace ${w.title}`,async()=>{await rpc('switchWorkspace',{id:w.id,windowId:w.windowId});await dismiss();}));if(t?.kind==='tabs'&&!t.essential&&w.windowId===t.windowId&&w.id!==t.workspaceId)list.push(cmd('move:'+w.id,`Move to workspace ${w.title}`,()=>perform('moveWorkspace',{tabId:t.id,id:w.id},'Tab moved.')));}return list;}
$('query').addEventListener('input',()=>{if($('query').value.trimStart().startsWith('>')){if(!commandTarget)commandTarget=current()?.kind==='tabs'?current():items.find(i=>i.kind==='tabs'&&i.active);}else commandTarget=null;chosen.clear();anchor=null;selected=0;limit=60;closeSide();status('');render();$('results').scrollTop=0;});
$('scope').onclick=()=>{scope=null;chosen.clear();anchor=null;selected=0;render();$('query').focus();};$('close').onclick=dismiss;$('help').onclick=showHelp;
document.addEventListener('keydown',e=>{
  if(e.altKey&&/^[1-6]$/.test(e.key)){e.preventDefault();setMode(modes[Number(e.key)-1][0]);return;}
  if(e.ctrlKey&&e.shiftKey&&e.code==='Space'){e.preventDefault();dismiss();return;}
  if(e.key==='Escape'){e.preventDefault();if(side){closeSide();$('query').focus();}else if(chosen.size>1){chosen.clear();anchor=null;render();}else if(scope){scope=null;render();}else dismiss();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(current()&&current().kind!=='commands')showActions(current());return;}
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!$('detail').contains(e.target)){e.preventDefault();if(chosen.size>1&&current())showActions(current());else openItem(current(),true).catch(err=>status(err.message,true));return;}
  if(side&&$('detail').contains(e.target)){if(['ArrowDown','ArrowUp'].includes(e.key)&&e.target.tagName==='BUTTON'){e.preventDefault();const buttons=[...$('detail').querySelectorAll('button.action:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}return;}
  if(e.target!==$('query')&&!$('results').contains(e.target))return;
  if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(e.key)){e.preventDefault();const step=e.key.includes('Page')?8:1,index=Math.max(0,Math.min(visible.length-1,selected+(e.key.endsWith('Down')?step:-step)));if(e.shiftKey)selectRange(index);else{chosen.clear();anchor=null;selected=index;limit=Math.max(limit,selected+1);updateSummary();renderRows();document.getElementById(`result-${selected}`)?.scrollIntoView({block:'nearest'});}return;}
  if(e.key==='Enter'&&e.target===$('query')){e.preventDefault();if(chosen.size>1)showActions(current());else openItem(current()).catch(err=>status(err.message,true));}
});
const livePort=browser.runtime.connect({name:'zen-glass-panel'});
livePort.onMessage.addListener(m=>{
  if(m.type==='delta'){if(coreReady)queueDelta(m);else schedule();}
  else if(m.type==='bookmarksChanged')loadBookmarks();
  else if(m.type==='activated'){if(coreReady)version++;items=items.map(i=>i.kind==='tabs'&&i.windowId===m.windowId?{...i,active:i.id===m.tabId,lastUsed:i.id===m.tabId?m.time:i.lastUsed}:i);render({preserve:true});syncSide();}
  else if(m.type==='windowFocused'){items=items.map(i=>i.kind==='windows'?{...i,active:i.id===m.id,lastUsed:i.id===m.id?m.time:i.lastUsed}:i);render({preserve:true});}
  else if(m.type==='changed')schedule();
});
window.addEventListener('unload',()=>{clearTimeout(refreshTimer);clearTimeout(iconTimer);clearTimeout(deltaTimer);iconObserver.disconnect();livePort.disconnect();});
render();refresh().then(loadBookmarks);$('query').focus();

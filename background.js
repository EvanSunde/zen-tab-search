'use strict';
const recentKey='recent-v1';
let statePromise,bookmarkCache,coreCache,coreFlight,containerCache,revision=0,saveTimer;
const panels=new Set(),iconCache=new Map();
const state=()=>statePromise ||= browser.storage.local.get(recentKey).then(x=>x[recentKey] || {});
function dirty(){revision++;coreCache=null;}
function publish(message){for(const port of panels)try{port.postMessage(message);}catch{panels.delete(port);}}
async function touch(key,time=Date.now()) {
  const s=await state();s[key]=time;
  if(Object.keys(s).length>2000)for(const [k] of Object.entries(s).sort((a,b)=>b[1]-a[1]).slice(2000))delete s[k];
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>browser.storage.local.set({[recentKey]:s}).catch(()=>{}),400);
}
async function toggle(){
  const [tab]=await browser.tabs.query({active:true,currentWindow:true});if(!tab?.id)return;
  try {
    const token=crypto.randomUUID();
    await browser.storage.session.set({['overlay:'+tab.id]:{token}});
    await browser.tabs.executeScript(tab.id,{code:'globalThis.__zenGlassToken='+JSON.stringify(token)});
    await browser.tabs.executeScript(tab.id,{file:'overlay.js'});
  }catch{await browser.browserAction.openPopup();}
}
browser.commands.onCommand.addListener(c=>{if(c==='toggle-palette')toggle().catch(console.error);});
function safeURL(url){if(!/^(https?|ftp|file):/i.test(url))throw new Error('This bookmark uses a URL type that cannot be opened here.');return url;}

async function bookmarks(){
  if(!bookmarkCache)bookmarkCache=browser.bookmarks.getTree().then(tree=>{
    const list=[];function walk(nodes,folder=''){for(const n of nodes){
      if(n.url)list.push({kind:'bookmarks',id:n.id,title:n.title || n.url,url:n.url,folder,subtitle:folder || n.url});
      else if(n.children)walk(n.children,[folder,n.title].filter(Boolean).join(' / '));
    }}walk(tree);return list;
  }).catch(e=>{bookmarkCache=null;throw e;});
  const [list,recent]=await Promise.all([bookmarkCache,state()]);
  return {items:list.map(b=>({...b,lastUsed:recent['url:'+b.url] || 0}))};
}
// Container identities are optional: without the permission, or with containers
// turned off, spaces and tabs simply fall back to generated colours.
async function containers(){
  if(containerCache)return containerCache;
  if(!browser.contextualIdentities)return containerCache=new Map();
  try{const list=await browser.contextualIdentities.query({});containerCache=new Map(list.map(c=>[c.cookieStoreId,{name:c.name || '',color:c.colorCode || c.color || ''}]));}
  catch{containerCache=new Map();}
  return containerCache;
}
async function snapshot(){
  if(coreCache)return coreCache;
  if(coreFlight){const pending=coreFlight;await pending;if(coreCache)return coreCache;}
  const serial=revision;
  const task=(async()=>{
    let data;
    if(browser.zenGlass)data=await browser.zenGlass.snapshot();
    else {const windows=await browser.windows.getAll({populate:true,windowTypes:['normal']});data={windows,tabs:windows.flatMap(w=>w.tabs || []),workspaces:[],supported:false};}
    const recent=await state(),ids=await containers(),groups=new Map(),byWindow=new Map();
    // `order` keeps the pills in the browser's own workspace order, whatever recency does.
    const spaces=new Map(data.workspaces.map((w,index)=>{const c=w.containerTabId?ids.get('firefox-container-'+w.containerTabId):null;
      return [w.windowId+':'+w.id,{...w,order:index,color:c?.color || '',containerName:c?.name || ''}];}));
    const items=data.tabs.map(t=>{
      const key=t.windowId+':'+t.workspaceId,w=spaces.get(key),c=t.cookieStoreId&&t.cookieStoreId!=='firefox-default'?ids.get(t.cookieStoreId):null;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);
      if(!byWindow.has(t.windowId))byWindow.set(t.windowId,[]);byWindow.get(t.windowId).push(t);
      return {...t,kind:'tabs',title:t.title || t.url || 'Untitled tab',workspaceName:w?.name || '',workspaceColor:w?.color || '',workspaceIcon:w?.icon || '',
        containerName:c?.name || '',containerColor:c?.color || '',lastUsed:t.lastAccessed || 0,subtitle:[t.url,w?.name,c?.name].filter(Boolean).join(' · ')};
    });
    for(const w of data.windows){const own=byWindow.get(w.id)||[],active=own.find(t=>t.active);
      items.push({kind:'windows',id:w.id,windowId:w.id,title:active?.title || 'Browser window',subtitle:`Window ${w.id} · ${own.length} tabs${w.focused?' · Current window':''}`,url:own.map(t=>t.title+' '+t.url).join(' '),lastUsed:recent['window:'+w.id] || Math.max(0,...own.map(t=>t.lastAccessed||0)),active:w.focused});
    }
    for(const w of spaces.values()){const own=groups.get(w.windowId+':'+w.id)||[];
      items.push({...w,kind:'workspaces',title:w.name,subtitle:[`${own.length} tabs`,`Window ${w.windowId}`,w.containerName&&`Container ${w.containerName}`,w.active&&'Current space'].filter(Boolean).join(' · '),lastUsed:Math.max(recent['workspace:'+w.id] || 0,...own.map(t=>t.lastAccessed||0))});
    }
    const result={items,workspaceSupported:data.supported};if(serial===revision)coreCache=result;return result;
  })();
  coreFlight=task;try{return await task;}finally{if(coreFlight===task)coreFlight=null;}
}
async function favicons(urls){
  const requested=[...new Set(urls)].filter(u=>typeof u==='string'&&/^https?:/i.test(u)).slice(0,64);
  const missing=requested.filter(u=>!iconCache.has(u));
  if(missing.length&&browser.zenGlass){for(const result of await browser.zenGlass.favicons(missing))iconCache.set(result.url,result.data);}
  const result=requested.map(url=>({url,data:iconCache.get(url)||''}));
  while(iconCache.size>256)iconCache.delete(iconCache.keys().next().value);
  return result;
}
// Return deltas. Never activate a tab or rebuild the list as part of a mutation.
async function mutateTabs(action,ids){
  if(!['pin','unpin','unload','close'].includes(action))throw new Error('Unknown tab action.');
  const targets=[...new Set(ids)];if(!targets.every(Number.isInteger))throw new Error('Invalid tab selection.');
  const updates=[],removed=[],errors=[];
  for(let i=0;i<targets.length;i+=4)await Promise.all(targets.slice(i,i+4).map(async id=>{
    try {
      const t=await browser.tabs.get(id);
      if(action==='unload'){
        if(t.active)throw new Error('Currently selected in its window; switch away before unloading.');
        if(!t.discarded)await browser.tabs.discard(id);
        if(!(await browser.tabs.get(id)).discarded)throw new Error('Zen kept this protected or busy tab loaded.');
        updates.push({id,discarded:true,status:'complete'});
      }else if(action==='close'){await browser.tabs.remove(id);removed.push(id);}
      else {const pinned=action==='pin';await browser.tabs.update(id,{pinned});updates.push({id,pinned});}
    }catch(e){errors.push({id,message:e.message});}
  }));
  dirty();return {updates,removed,errors};
}
async function handle(m,sender){
  if(sender.id!==browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('panel.html')))throw new Error('Untrusted request.');
  if(sender.tab){const key='overlay:'+sender.tab.id,entry=(await browser.storage.session.get(key))[key];if(!entry || new URL(sender.url).hash!=='#overlay='+entry.token)throw new Error('Open Zen Glass with its keyboard shortcut to use this panel.');}
  switch(m.type){
    case 'snapshot':return snapshot();
    case 'bookmarks':return bookmarks();
    case 'favicons':return favicons(m.urls || []);
    case 'tabActions':return mutateTabs(m.action,m.ids || []);
    case 'dismiss':if(sender.tab){await browser.tabs.sendMessage(sender.tab.id,{type:'zen-glass-close'}).catch(()=>{});await browser.storage.session.remove('overlay:'+sender.tab.id);}return {};
    case 'activate':if(browser.zenGlass)await browser.zenGlass.activate(m.id);else{const t=await browser.tabs.update(m.id,{active:true});await browser.windows.update(t.windowId,{focused:true});}return {};
    case 'pin':return mutateTabs(m.pinned?'pin':'unpin',[m.id]);
    case 'close':return mutateTabs('close',[m.id]);
    case 'unload':return mutateTabs('unload',[m.id]);
    case 'unloadOthers':{
      const [current]=await browser.tabs.query({active:true,currentWindow:true}),data=await snapshot();
      return mutateTabs('unload',data.items.filter(t=>t.kind==='tabs'&&t.windowId===current.windowId&&!t.active&&!t.discarded&&!t.audible&&!t.pinned&&!t.essential).map(t=>t.id));
    }
    case 'openBookmark':{const [b]=await browser.bookmarks.get(m.id),t=await browser.tabs.create({url:safeURL(b.url),active:!m.background});if(!t.incognito)await touch('url:'+b.url);return {};}
    case 'bookmarkCurrent':{const [t]=await browser.tabs.query({active:true,currentWindow:true});await browser.bookmarks.create({title:t.title,url:safeURL(t.url)});return {};}
    case 'editBookmark':await browser.bookmarks.update(m.id,{title:String(m.title).slice(0,500),url:safeURL(m.url)});return {};
    case 'deleteBookmark':await browser.bookmarks.remove(m.id);return {};
    case 'focusWindow':await browser.windows.update(m.id,{focused:true});return {};
    case 'switchWorkspace':if(!browser.zenGlass)throw new Error('Zen workspace integration is unavailable.');await browser.zenGlass.switchWorkspace(m.windowId,m.id);dirty();publish({type:'changed'});return {};
    case 'moveWorkspace':if(!browser.zenGlass)throw new Error('Zen workspace integration is unavailable.');await browser.zenGlass.moveToWorkspace(m.tabId,m.id);dirty();publish({type:'changed'});return {};
    case 'moveWindow':await browser.tabs.move(m.tabId,{windowId:m.id,index:-1});return {};
    case 'restore':await browser.sessions.restore();return {};
    default:throw new Error('Unknown action.');
  }
}
browser.runtime.onMessage.addListener((m,sender)=>handle(m,sender).then(data=>({data})).catch(e=>({error:e.message})));
browser.runtime.onConnect.addListener(port=>{
  if(port.name!=='zen-glass-panel'||port.sender?.id!==browser.runtime.id||!port.sender?.url?.startsWith(browser.runtime.getURL('panel.html'))){port.disconnect();return;}
  panels.add(port);port.onDisconnect.addListener(()=>panels.delete(port));
});
browser.tabs.onUpdated.addListener((id,change,t)=>{
  if(change.status==='complete'&&t.active&&!t.incognito&&t.url)touch('url:'+t.url).catch(()=>{});
  const patch={id};for(const key of ['title','url','pinned','discarded','audible','status','favIconUrl'])if(key in change)patch[key]=change[key];
  if(Object.keys(patch).length>1){dirty();if(change.favIconUrl)iconCache.delete(t.url);publish({type:'delta',updates:[patch]});}
});
browser.tabs.onRemoved.addListener(id=>{dirty();browser.storage.session.remove('overlay:'+id).catch(()=>{});publish({type:'delta',removed:[id]});});
browser.tabs.onActivated.addListener(async ({tabId,windowId})=>{
  dirty();publish({type:'activated',tabId,windowId,time:Date.now()});
  try{const t=await browser.tabs.get(tabId);if(!t.incognito&&t.url)await touch('url:'+t.url);}catch{}
});
for(const event of [browser.tabs.onCreated,browser.tabs.onAttached,browser.tabs.onDetached,browser.windows.onCreated,browser.windows.onRemoved])event.addListener(()=>{dirty();publish({type:'changed'});});
browser.windows.onFocusChanged.addListener(async id=>{dirty();if(id<0)return;publish({type:'windowFocused',id,time:Date.now()});try{const w=await browser.windows.get(id);if(!w.incognito)await touch('window:'+id);}catch{}});
for(const event of [browser.bookmarks.onCreated,browser.bookmarks.onRemoved,browser.bookmarks.onChanged,browser.bookmarks.onMoved])event.addListener(()=>{bookmarkCache=null;publish({type:'bookmarksChanged'});});
for(const event of [browser.contextualIdentities?.onCreated,browser.contextualIdentities?.onUpdated,browser.contextualIdentities?.onRemoved])event?.addListener(()=>{containerCache=null;dirty();publish({type:'changed'});});

browser.tabs.onMoved.addListener((id,info)=>{dirty();publish({type:"delta",updates:[{id,index:info.toIndex}]});});

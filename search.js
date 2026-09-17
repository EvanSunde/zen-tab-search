/* Matching and recency are separate: fuzzy relevance never overrides last use. */
(function(root) {
  const normalize = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  function near(a, b) {
    if (Math.abs(a.length-b.length)>1) return false;
    if (a.length===b.length) {
      const diff=[]; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) diff.push(i);
      return diff.length<=1 || (diff.length===2 && diff[1]===diff[0]+1 && a[diff[0]]===b[diff[1]] && a[diff[1]]===b[diff[0]]);
    }
    if(a.length>b.length) [a,b]=[b,a];
    let i=0,j=0,skip=0;
    while(i<a.length && j<b.length) {if(a[i]===b[j]) {i++;j++;} else {j++;if(++skip>1)return false;}}
    return true;
  }
  const split = text => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  function tokenMatch(token, text, words) {
    if(text.includes(token)) return true;
    if(token.length<3) return false;
    let pos=-1, first=-1;
    for(const ch of token) {pos=text.indexOf(ch,pos+1);if(pos<0)break;if(first<0)first=pos;}
    if(pos>=0 && pos-first<=token.length*3) return true;
    // The typo pass is the expensive one, so records carry their word list already split.
    return token.length>=4 && (words || split(text)).some(word=>near(token,word));
  }
  function prepare(item) {
    const search=normalize([item.title,item.url,item.subtitle,item.folder,item.workspaceName,item.containerName].filter(Boolean).join(" "));
    return {...item, search, words:split(search)};
  }
  const compare = (a,b) => (b.lastUsed||0)-(a.lastUsed||0) || a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id));
  /* A space filter narrows tabs only: bookmarks and windows belong to no space,
     and Zen Essentials are shared by every space. */
  function spaceList(spaces) {return spaces ? (Array.isArray(spaces) ? spaces : [spaces]) : [];}
  function inSpaces(item, spaces) {
    const list=spaceList(spaces);
    if(!list.length || item.kind!=='tabs' || item.essential) return true;
    return list.some(s=>item.windowId===s.windowId && item.workspaceId===s.id);
  }
  // `sorted` means the caller keeps its records in `compare` order already, so a
  // filtered slice is still ordered and no per-keystroke sort is needed.
  function search(items, query, spaces=null, {sorted=false}={}) {
    const list=spaceList(spaces), tokens=normalize(query).trim().split(/\s+/).filter(Boolean);
    const found=items.filter(i=>inSpaces(i,list) && tokens.every(t=>tokenMatch(t,i.search,i.words)));
    return sorted?found:found.sort(compare);
  }
  root.ZenSearch={normalize,prepare,search,tokenMatch,inSpaces,compare};
  if(typeof module!=="undefined") module.exports=root.ZenSearch;
})(globalThis);

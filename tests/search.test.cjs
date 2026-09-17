const {test}=require('node:test');const assert=require('node:assert/strict');const S=require('../search.js');
const records=[
 {kind:'tabs',id:1,title:'GitHub issues',url:'https://github.com',lastUsed:10,workspaceId:'a',windowId:1},
 {kind:'bookmarks',id:'2',title:'Github docs',lastUsed:20},
 {kind:'tabs',id:3,title:'Git Hub',lastUsed:30,workspaceId:'b',windowId:1},
 {kind:'tabs',id:4,title:'Café research',lastUsed:40,workspaceId:'a',windowId:2}
].map(S.prepare);
test('fuzzy matches across categories, sorted strictly by recency',()=>assert.deepEqual(S.search(records,'gthb').map(x=>x.id),[3,'2',1]));
test('transposition typo',()=>assert.deepEqual(S.search(records,'githbu').map(x=>x.id),['2',1]));
test('accent insensitive',()=>assert.equal(S.search(records,'cafe')[0].id,4));
test('a space filter uses both window and workspace identity, and narrows tabs only',()=>assert.deepEqual(S.search(records,'',{id:'a',windowId:1}).map(x=>x.id),['2',1]));
test('all query tokens must match',()=>assert.deepEqual(S.search(records,'github issues').map(x=>x.id),[1]));
test('blank query includes all records',()=>assert.equal(S.search(records,' ').length,4));
test('unrelated query matches nothing',()=>assert.equal(S.search(records,'zzqqxx').length,0));
test('large collection search',()=>{const rows=Array.from({length:11000},(_,i)=>S.prepare({id:i,title:'Project example '+i,url:'https://example.com/'+i,lastUsed:i}));const start=performance.now();assert.equal(S.search(rows,'example').length,11000);console.log('11,000 results search:',Math.round(performance.now()-start),'ms');});

const spaced=[
 {kind:'tabs',id:10,title:'Studio board',lastUsed:5,workspaceId:'a',windowId:1},
 {kind:'tabs',id:11,title:'Shared inbox',lastUsed:6,workspaceId:'',windowId:1,essential:true},
 {kind:'tabs',id:12,title:'Reading list',lastUsed:7,workspaceId:'b',windowId:1},
 {kind:'tabs',id:13,title:'Same space, other window',lastUsed:8,workspaceId:'a',windowId:2},
 {kind:'bookmarks',id:'14',title:'Docs',lastUsed:9}
].map(S.prepare);
test('one space keeps its own tabs plus shared essentials',()=>assert.deepEqual(S.search(spaced,'',[{id:'a',windowId:1}]).map(x=>x.id),['14',11,10]));
test('several spaces combine into one filter',()=>assert.deepEqual(S.search(spaced,'',[{id:'a',windowId:1},{id:'b',windowId:1}]).map(x=>x.id),['14',12,11,10]));
test('an empty space list filters nothing',()=>assert.equal(S.search(spaced,'',[]).length,5));
test('inSpaces leaves non-tab records alone',()=>{
  assert.equal(S.inSpaces(spaced[4],[{id:'a',windowId:1}]),true);
  assert.equal(S.inSpaces(spaced[2],[{id:'a',windowId:1}]),false);
  assert.equal(S.inSpaces(spaced[1],[{id:'b',windowId:9}]),true);
});

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
test('workspace scopes use both window and workspace identity',()=>assert.deepEqual(S.search(records,'',{id:'a',windowId:1}).map(x=>x.id),[1]));
test('all query tokens must match',()=>assert.deepEqual(S.search(records,'github issues').map(x=>x.id),[1]));
test('blank query includes all records',()=>assert.equal(S.search(records,' ').length,4));
test('unrelated query matches nothing',()=>assert.equal(S.search(records,'zzqqxx').length,0));
test('large collection search',()=>{const rows=Array.from({length:11000},(_,i)=>S.prepare({id:i,title:'Project example '+i,url:'https://example.com/'+i,lastUsed:i}));const start=performance.now();assert.equal(S.search(rows,'example').length,11000);console.log('11,000 results search:',Math.round(performance.now()-start),'ms');});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/ranked-series-ui-v1.js',import.meta.url),'utf8');
const rows=[{code:'V-008',name:'하늘',rank:'C'},{code:'V-003',name:'하늘',rank:'SSS'},{code:'V-002',name:'가람',rank:'SSS'},{code:'V-006',name:'나비',rank:'S'},{code:'V-004',name:'조은',rank:'SS',identityLabel:'할로윈 SS 리미티드'},{code:'V-005',name:'조은',rank:'SS',identityLabel:'블러드문 SS 리미티드'},{code:'V-007',name:'다온',rank:'A'}];
const key=id=>'cnine_ranked_mercenary_preferences_v1:'+id;
function fixture({storage=new Map(),failStorage=false}={}){
 const nodes=new Map(),node=(id,extra={})=>{if(!nodes.has(id))nodes.set(id,{id,focus(){},...extra});return nodes.get(id);};
 let user={serverUserId:41},posts=0;
 const context={window:{},Intl,console,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(failStorage)throw Error('blocked');storage.set(k,v);}},loadUser:()=>user,escapeHtml:s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),cards:[],pvpState:{rankedSeries:{cards:rows,codes:['V-002','V-004','V-003','V-005','V-006','V-007'],ownedCount:rows.length,ready:true,revision:3,mercenariesPerRound:2},deck:[],profile:{},energy:{}},document:{getElementById:id=>node(id),querySelectorAll:selector=>selector==='[data-rs-favorite]'?Array.from({length:6},(_,i)=>node('rsFavorite'+i,{dataset:{rsFavorite:String(i)}})):selector==='[data-rs-select]'?Array.from({length:6},(_,i)=>node('rsSelect'+i,{dataset:{rsSelect:String(i)},value:''})):[]},apiRequest:async()=>{posts++;return {rankedSeries:structuredClone(context.pvpState.rankedSeries)};}};
 context.renderPvpTab=()=>{context.window.CNineRankedSeries.render();context.window.CNineRankedSeries.bind();};vm.runInNewContext(source,context);context.renderPvpTab();
 return {context,storage,node,ui:context.window.CNineRankedSeries,setUser:id=>{user={serverUserId:id};context.renderPvpTab();},posts:()=>posts};
}
const select=(html,index=0)=>html.match(new RegExp('<select id="rsSelect'+index+'"[^>]*>([\\s\\S]*?)</select>'))[1];
const codes=html=>[...html.matchAll(/<option value="(V-\d{3})"/g)].map(m=>m[1]);
test('rank groups descend and Korean names sort without mutating the server roster',()=>{
 const f=fixture(),before=JSON.stringify(f.context.pvpState.rankedSeries),html=select(f.ui.render());
 assert.deepEqual(codes(html),['V-002','V-003','V-005','V-004','V-006','V-007','V-008']);assert.deepEqual([...html.matchAll(/<optgroup label="([A-Z]+) /g)].map(m=>m[1]),['SSS','SS','S','A','C']);assert.equal(JSON.stringify(f.context.pvpState.rankedSeries),before);assert.match(html,/블러드문 SS 리미티드/);assert.match(html,/할로윈 SS 리미티드/);
});
test('favorite changes preserve the draft and saved roster and make no server request',()=>{
 const f=fixture(),before=JSON.stringify(f.context.pvpState);f.node('rsFavorite0').onclick();assert.deepEqual(JSON.parse(f.storage.get(key(41))).favorites,['V-002']);assert.equal(JSON.stringify(f.context.pvpState),before);assert.equal(f.posts(),0);assert.equal(f.ui.ready(),true);assert.match(select(f.ui.render()),/★ SSS · 가람/);
 f.node('rsFavorite0').onclick();assert.deepEqual(JSON.parse(f.storage.get(key(41))).favorites,[]);
});
test('favorite and grade filters retain a selected card outside the filter',()=>{
 const f=fixture();f.node('rsFavorite0').onclick();f.node('rsFavoriteOnly').onclick();let html=f.ui.render();assert.deepEqual(codes(select(html)),['V-002']);assert.match(select(html,1),/<optgroup label="현재 선택">/);assert.deepEqual(codes(select(html,1)),['V-004','V-002']);
 f.node('rsGradeFilter').value='C';f.node('rsGradeFilter').onchange();html=f.ui.render();
 assert.equal(codes(select(html)).length,rows.length);assert.match(html,/선택한 조건에 맞는 용병이 없습니다. 전체 편성 가능 용병 7종을 표시합니다/);assert.equal(f.ui.ready(),true);
});
test('empty saved filters show the full roster in every slot and preserve the draft, preferences and eligibility',()=>{
 for(const prefs of [
   {grade:'',favoriteOnly:true,favorites:[]},
   {grade:'',favoriteOnly:true,favorites:['V-999']},
   {grade:'B',favoriteOnly:false,favorites:['V-008']},
   {grade:'C',favoriteOnly:true,favorites:['V-002']},
 ]){
   const stored=JSON.stringify(prefs),f=fixture({storage:new Map([[key(41),stored]])});
   const original=JSON.stringify(f.context.pvpState),html=f.ui.render();
   for(let i=0;i<6;i++){
     const menu=select(html,i);assert.equal(codes(menu).length,rows.length);
     assert.deepEqual(new Set(codes(menu)),new Set(rows.map(c=>c.code)));
     assert.match(menu,/전체 목록에서 선택하세요/);assert.doesNotMatch(menu,/label="현재 선택"/);
   }
   assert.equal(JSON.stringify(f.context.pvpState),original);assert.equal(f.storage.get(key(41)),stored);
   assert.match(select(html,1),/<option value="V-002"[^>]*disabled/);
   assert.match(select(html,0),/<option value="V-003"[^>]*disabled/);
   f.node('rsSelect0').value='V-008';f.node('rsSelect0').onchange();
   assert.equal(f.context.pvpState.rankedDraft[0],'V-008');assert.equal(f.context.pvpState.rankedSeries.codes[0],'V-002');
   assert.equal(f.posts(),0);assert.equal(f.storage.get(key(41)),stored);
 }
});
test('removing the last favorite restores options and adding an owned favorite reapplies the active filter',()=>{
 const f=fixture();f.node('rsFavorite0').onclick();f.node('rsFavoriteOnly').onclick();
 f.node('rsFavorite0').onclick();assert.equal(codes(select(f.ui.render())).length,rows.length);
 f.node('rsFavorite2').onclick();assert.deepEqual(codes(select(f.ui.render(),2)),['V-003']);
 assert.equal(f.ui.ready(),true);assert.equal(f.posts(),0);
});
test('an empty server roster does not turn stale saved codes or favorites into options',()=>{
 const f=fixture({storage:new Map([[key(41),JSON.stringify({grade:'SS',favoriteOnly:true,favorites:['V-004']})]])});
 Object.assign(f.context.pvpState.rankedSeries,{cards:[],ownedCount:0,ready:false});
 const html=f.ui.render();assert.match(html,/편성 가능한 보유 용병이 없습니다/);
 for(let i=0;i<6;i++)assert.deepEqual(codes(select(html,i)),[]);
 assert.doesNotMatch(html,/전체 목록에서 선택하세요/);assert.equal(f.posts(),0);
});
test('same-rank and duplicate restrictions still apply to filtered favorites',()=>{
 const f=fixture();f.node('rsFavorite0').onclick();f.node('rsFavoriteOnly').onclick();const html=select(f.ui.render(),1);assert.match(html,/<option value="V-002"[^>]*disabled/);const before=JSON.stringify(f.context.pvpState);f.node('rsSelect1').value='V-002';f.node('rsSelect1').onchange();assert.equal(JSON.stringify(f.context.pvpState),before);
});
test('favorites survive reload and stay isolated when switching accounts',()=>{
 const f=fixture();f.node('rsFavorite0').onclick();const reloaded=fixture({storage:f.storage});assert.match(select(reloaded.ui.render()),/★ SSS · 가람/);reloaded.setUser(42);assert.doesNotMatch(select(reloaded.ui.render()),/★/);reloaded.setUser(41);assert.match(select(reloaded.ui.render()),/★ SSS · 가람/);
});
test('malformed storage is ignored and unavailable storage still permits session favorites',()=>{
 const f=fixture({storage:new Map([[key(41),'{broken']]),failStorage:true});f.node('rsFavorite0').onclick();assert.match(f.ui.render(),/이번 접속에서만 유지/);assert.match(select(f.ui.render()),/★ SSS · 가람/);assert.equal(f.posts(),0);
 const normalized=fixture({storage:new Map([[key(41),JSON.stringify({favorites:['V-002','V-002',null,'<script>'],grade:'BAD',favoriteOnly:'yes'})]])});assert.match(select(normalized.ui.render()),/★ SSS · 가람/);assert.equal(codes(select(normalized.ui.render())).length,rows.length);
});
test('matching and save in progress block preference and selection mutations',()=>{
 const f=fixture();for(const flag of ['matching','rankedSaving']){f.context.pvpState[flag]=true;const before=JSON.stringify(f.context.pvpState);f.node('rsFavorite0').onclick();f.node('rsFavoriteOnly').onclick();f.node('rsGradeFilter').value='SS';f.node('rsGradeFilter').onchange();assert.equal(JSON.stringify(f.context.pvpState),before);assert.equal(f.storage.size,0);assert.match(f.ui.render(),/id="rsFavoriteOnly"[^>]*disabled/);f.context.pvpState[flag]=false;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const snippet=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function receipt(hits=[0,4,8]){
 return {requestId:'paid-ten-pack',count:10,cost:3_000_000_000,shardGained:1200,results:Array.from({length:10},(_,slot)=>({slot,hit:hits.includes(slot),card:{id:'STAR-'+slot,title:slot===0?'스타 <선수>':'스타 '+slot,image:'/assets/superstar/1.jpg'},duplicate:slot>0,shardGained:slot>0?600:0}))};
}
function fixture(){
 const classes=new Set(),nodes=Object.fromEntries(['header h2','header p','.superstar-opening-result','.superstar-opening-status','.superstar-opening-close','.superstar-swipe-wrap>small'].map(key=>[key,{innerHTML:'',textContent:'',disabled:true}]));
 nodes['.pack-half-left']={getAttribute:()=>'/assets/ui/packs/superstar-card-pack-v1.png'};
 const stage={dataset:{state:'processing'},classList:{add:(...names)=>names.forEach(name=>classes.add(name))},querySelector:key=>nodes[key]||null,append:node=>{nodes['.superstar-result-actions']=node}};
 const modal={className:'modal show',innerHTML:'',querySelector:()=>stage};
 let applied=0,rerenders=0,cleared=[],single=0,swipe;
 const ctx=vm.createContext({console,document:{getElementById:()=>modal,createElement:()=>{const button={focus(){this.focused=true}};return {innerHTML:'',querySelector:()=>button,remove(){}}}},
  escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  applySuperstarPackResultToUser:()=>{applied++},renderShell:()=>{rerenders++},
  superstarOpeningSleep:()=>{throw Error('Ten-pack must not wait on a cinematic')},revealSuperstarPackResult:async()=>{single++},
  superstarPackOpeningMarkup:()=>'<actual markup covered by browser verification>',bindSuperstarSwipe:(_stage,callback)=>{swipe=callback},
  requestAnimationFrame:callback=>callback(),clearPendingSuperstarDraw:id=>cleared.push(id),superstarPackOpeningBusy:true});
 vm.runInContext(snippet('async function revealSuperstarPackBatch(','async function openSuperstarPack('),ctx);
 return {ctx,stage,nodes,modal,classes,get applied(){return applied},get single(){return single},get rerenders(){return rerenders},get cleared(){return cleared},confirmSwipe:()=>swipe()};
}

for(const hits of [[],[0,4,8],Array.from({length:10},(_,i)=>i)])test(`${hits.length} wins: ten slots render immediately with one close action and no per-pack cinematic`,async()=>{
 const f=fixture();await f.ctx.revealSuperstarPackBatch(f.stage,receipt(hits));
 const html=f.nodes['.superstar-opening-result'].innerHTML;
 assert.equal((html.match(/role="listitem"/g)||[]).length,10);assert.equal((html.match(/<img /g)||[]).length,10);
 assert.equal((html.match(/<article class="is-win"/g)||[]).length,hits.length);
 assert.equal(f.applied,1);assert.equal(f.single,0);assert.equal(f.stage.dataset.state,'revealed');
 assert.equal(f.nodes['.superstar-opening-close'].disabled,false);assert.ok(f.classes.has('superstar-batch-summary'));
 assert.ok(html.includes('10번째 결과'));assert.doesNotMatch(html,/<선수>/);
 const button=f.nodes['.superstar-result-actions'].querySelector('button');assert.equal(button.focused,true);button.onclick();
 assert.equal(f.modal.className,'modal');assert.equal(f.rerenders,1);
});

test('old recovery positions reveal all ten original slots; preview never applies rewards',async()=>{
 const f=fixture();await f.ctx.revealSuperstarPackBatch(f.stage,receipt(),{preview:true,startIndex:6});
 assert.equal(f.applied,0);assert.equal(f.single,0);
 assert.equal((f.nodes['.superstar-opening-result'].innerHTML.match(/role="listitem"/g)||[]).length,10);
 assert.match(f.nodes['header p'].textContent,/실제 결제 없음/);
 f.nodes['.superstar-result-actions'].querySelector('button').onclick();assert.equal(f.rerenders,0);
});

test('confirmed ten-pack requests once and clears recovery after the board is shown; single opening retains its cinematic',async()=>{
 for(const count of [10,1]){
  const f=fixture();let calls=0;
  f.ctx.mountSuperstarPackOpening({},3_000_000_000,async()=>{calls++;return receipt()},{count,pending:{nextIndex:6}});
  assert.equal(calls,0);await f.confirmSwipe();assert.equal(calls,1);
  assert.deepEqual(f.cleared,['paid-ten-pack']);assert.equal(f.single,count===1?1:0);assert.equal(f.applied,count===10?1:0);
  assert.equal(f.ctx.superstarPackOpeningBusy,false);
 }
});

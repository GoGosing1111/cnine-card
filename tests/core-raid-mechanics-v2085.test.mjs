import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MECHANICS,cursorPosition,gradeTiming,circuitOrder,circuitTarget,safeCells,insidePort,summarize} from '../preview/core-raid-mechanics-v1/model.mjs';

test('timing meter is symmetric and reaches both ends at each round speed',()=>{
 for(const [round,period] of [1800,1560,1320].entries()){
  assert.equal(cursorPosition(0,round),0);
  assert.equal(cursorPosition(period/4,round),.5);
  assert.equal(cursorPosition(period/2,round),1);
  assert.equal(cursorPosition(period*.75,round),.5);
  assert.equal(cursorPosition(period,round),0);
 }
});
test('timing grade includes both visible boundaries and rejects out-of-range values',()=>{
 for(const p of [.455,.5,.545])assert.equal(gradeTiming(p),'PERFECT');
 for(const p of [.38,.45,.55,.62])assert.equal(gradeTiming(p),'GOOD');
 for(const p of [-1,0,.379,.621,1,2,NaN,Infinity])assert.equal(gradeTiming(p),'MISS');
});
test('two successful timing stops are required; missing grades are not successes',()=>{
 assert.equal(summarize('CENTER',[{grade:'GOOD'},{grade:'MISS'}]).success,false);
 assert.equal(summarize('CENTER',[{},{}]).success,false);
 assert.equal(summarize('CENTER',[{grade:'GOOD'},{grade:'PERFECT'},{grade:'MISS'}]).success,true);
 assert.equal(summarize('CENTER',Array.from({length:3},()=>({grade:'PERFECT'}))).perfect,true);
});
test('circuit layouts preserve three unique matching targets without straight-through solutions',()=>{
 for(let seed=0;seed<30;seed++){
  const order=circuitOrder(seed);
  assert.deepEqual([...order].sort(),[0,1,2]);
  assert.notDeepEqual(order,[0,1,2]);
  for(let source=0;source<3;source++)assert.equal(order[circuitTarget(source,order)],source);
  order[0]=99;assert.notEqual(circuitOrder(seed)[0],99);
 }
});
test('wrong or duplicate circuit connections cannot complete all circuits',()=>{
 assert.equal(summarize('CIRCUIT',[{source:0,correct:true},{source:0,correct:true},{source:1,correct:true}]).success,false);
 assert.equal(summarize('CIRCUIT',[{source:0,correct:true},{source:1,correct:true},{source:2,correct:false}]).success,false);
 assert.equal(summarize('CIRCUIT',[0,1,2].map(source=>({source,correct:true}))).success,true);
});
test('touch drop tolerance accepts the port edge but rejects outside releases',()=>{
 assert.equal(insidePort({x:141,y:100},{x:100,y:100},41),true);
 assert.equal(insidePort({x:142,y:100},{x:100,y:100},41),false);
 assert.equal(insidePort({x:130,y:130},{x:100,y:100},41),false);
});
test('each shelter wave has three distinct safe cells and changes the previous pattern',()=>{
 for(let seed=0;seed<5;seed++)for(let wave=0;wave<3;wave++){
  const safe=safeCells(wave,seed);assert.equal(new Set(safe).size,3);
  assert.ok(safe.every(id=>id>=0&&id<9));
  assert.notDeepEqual(safe,safeCells(wave+1,seed));
 }
});
test('shelter requires all three waves; partial progress and one hit fail',()=>{
 assert.equal(summarize('SHELTER',[{safe:true},{safe:true}]).success,false);
 assert.equal(summarize('SHELTER',[{safe:true},{safe:true},{safe:false}]).success,false);
 assert.equal(summarize('SHELTER',[{safe:true},{safe:true},{safe:true}]).success,true);
 assert.ok(MECHANICS.SHELTER.windowMs>=3*3500);
});
test('new mechanic modules remain isolated from live entry and resolve contracts',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const index=read('index.html'),app=read('js/app.js'),api=read('functions/api/[[path]].js');
 for(const source of [index,app,api])assert.doesNotMatch(source,/core-raid-mechanics-v1|previewMechanic/);
 for(const file of ['app.mjs','mechanics.mjs','model.mjs'])assert.doesNotMatch(read('preview/core-raid-mechanics-v1/'+file),/fetch\s*\(|apiRequest\s*\(|localStorage|sessionStorage/);
 const html=read('preview/core-raid-mechanics-v1/index.html');
 const adapters=['project-v-battle-art-adapter-v1','project-v-tier-battle-art-adapter-v1','project-v-monster-battle-art-adapter-v1','project-v-unassigned-battle-fallback-v1'];
 assert.deepEqual(adapters.map(name=>html.indexOf(name)),adapters.map(name=>html.indexOf(name)).sort((a,b)=>a-b));
 assert.ok(adapters.every(name=>html.includes(name)));
});

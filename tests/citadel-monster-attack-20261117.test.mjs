import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Container} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {ObjectPool} from '../preview/project-v-v3/source/battle/ObjectPool.js';
import {usesCitadelMonsterAttack,playCitadelMonsterAttack} from '../preview/project-v-v3/source/battle/CooperativeArkePlayback.js';
after(()=>gsap.ticker.sleep());
function harness(){
 const actor=(id,team,x)=>{const root=new Container();root.position.set(x,200);return{id,team,root,hp:100,restScale:.5,fullBodyHeight:180,state:'IDLE',setState(s){if(this.cooperativeActionActive&&['HIT','IDLE'].includes(s))return;this.state=s;}};};
 const a=actor('B:2:CITADEL','ENEMY',900),v=actor('A:1','ALLY',200);a.root.projectVMonsterArt={kind:'CITADEL_GUARD'};
 const damage=new ObjectPool({name:'damage',factory:()=>{const c=new Container();c.usesReceiptHud=()=>true;return c;},reset:c=>{c.alpha=0;}});
 const e={battleData:{sceneAssetKey:'LEGION_BURNING_CITADEL'},formationCoop:true,pendingTails:new Map(),simpleTimelines:new Set(),pools:{damage},uiLayer:new Container(),scene:{width:1200},timeline:BattleEngine.prototype.timeline,settlePendingTails:BattleEngine.prototype.settlePendingTails,actionPlaybackSpeed:()=>1,syncTargetHp:(c,h)=>c.hp=h,syncTargetShield:(c,s)=>c.shield=s};
 const play=options=>{let impacts=0;const promise=playCitadelMonsterAttack(e,a,v,{damage:10,targetHp:90,targetShield:7,onImpact:()=>impacts++,...options}),entry=e.pendingTails.get(a);entry.instance.pause();return{promise,entry,impacts:()=>impacts};};
 const close=()=>{e.settlePendingTails([a]);damage.destroy();e.uiLayer.destroy({children:true});a.root.destroy({children:true});v.root.destroy({children:true});};
 return {a,v,e,play,close};
}
test('only Citadel hostile monsters use the trail-free attack; allied/PVP/other PVE routing stays unchanged',()=>{
 const h=harness();try{assert(usesCitadelMonsterAttack(h.e,h.a));for(const field of ['PVP','COOP_ARKE_FORGE','CLAN_DOCKYARD',undefined])assert.equal(usesCitadelMonsterAttack({battleData:{sceneAssetKey:field}},h.a),false);assert.equal(usesCitadelMonsterAttack(h.e,h.v),false);h.a.root.projectVMonsterArt.kind='SEAL_DRAGON_SD';assert.equal(usesCitadelMonsterAttack(h.e,h.a),false);}finally{h.close();}
});
test('repeated attacks keep actor/HUD roots on their tile, apply one hit at .25 and release every label',async()=>{
 const h=harness();try{for(let i=0;i<50;i++){
  const p=h.play();p.entry.instance.time(.24);assert.equal(p.impacts(),0);assert.equal(h.a.root.x,900);assert.equal(h.a.root.y,200);
  p.entry.instance.time(.26);assert.equal(p.impacts(),1);assert.equal(h.v.hp,90);assert.equal(h.v.shield,7);
  p.entry.instance.progress(1);assert.equal(await p.promise,true);assert.equal(p.impacts(),1);assert.equal(h.a.root.x,900);assert.equal(h.a.state,'IDLE');assert.equal(h.v.state,'IDLE');assert.equal(h.e.pendingTails.size,0);assert.equal(h.e.simpleTimelines.size,0);assert.equal(h.e.pools.damage.inUse.size,0);assert.equal(h.e.uiLayer.children.length,0);assert.equal(h.a.root.filters?.length||0,0);
 }assert.equal(h.e.pools.damage.stats().total,1);}finally{h.close();}
});
test('cancellation before/after impact releases visuals without replaying damage; death remains dead',async()=>{
 const h=harness();try{for(const t of [.12,.3]){const p=h.play();p.entry.instance.time(t);h.a.hp=0;h.e.settlePendingTails([h.a]);assert.equal(await p.promise,false);assert.equal(p.impacts(),t<.25?0:1);assert.equal(h.a.state,'DEAD');assert.equal(h.e.pools.damage.inUse.size,0);h.a.hp=100;}}finally{h.close();}
});
test('a rebound enemy/target slot cannot receive stale attack damage or have its new pose reset',async()=>{
 const h=harness();try{for(const rebound of [h.a,h.v]){const p=h.play();p.entry.instance.time(.1);rebound.id+=':R1';rebound.state='ATTACK';p.entry.instance.progress(1);await p.promise;assert.equal(p.impacts(),0);assert.equal(rebound.state,'ATTACK');assert.equal(h.e.pools.damage.inUse.size,0);}}finally{h.close();}
});
test('current shipped consumers and main loader include the Citadel stationary attack version',()=>{
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json','utf8'));
 for(const {file}of report.outputs)assert(fs.readFileSync(file,'utf8').includes('CITADEL_MONSTER_STATION_ATTACK_V1'),file);
 for(const file of ['js/battle-v3-live.js','js/legion-citadel-v1.mjs'])assert(fs.readFileSync(file,'utf8').includes('citadel-clean-attack-20261117-v1'),file);
 const engine=fs.readFileSync('preview/project-v-v3/source/battle/BattleEngine.js','utf8');assert(engine.includes('if(usesCitadelMonsterAttack(this,actor))return playCitadelMonsterAttack'));
});

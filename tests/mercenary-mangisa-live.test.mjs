import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {MangisaSkillFX} from '../preview/mercenary-mangisa-v1/source/MangisaSkillFX.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {mangisaVisualPlan,MANGISA_BALANCE} from '../shared/mercenary-mangisa-v1.mjs';
import {resolveMangisaVolley} from '../functions/_mercenary_mangisa.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
const art=seed.catalog.cards.find(c=>c.code==='V-045'),skill=seed.document.skills.find(s=>s.id==='MS-045');
const snapshot={code:'V-045',name:'망이사',rank:'SS',role:'MARKSMAN',position:'MIDDLE',level:1,basePower:120000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
const legacy=()=>({...structuredClone(seed.document),mercenaries:structuredClone(seed.document.mercenaries.filter(c=>c.code!=='V-045')),skills:structuredClone(seed.document.skills.filter(s=>s.id!=='MS-045')),assignments:structuredClone(seed.document.assignments.filter(c=>c.code!=='V-045'))});
test('complete prior CMS appends only Mangisa and preserves saved settings, edits and explicit assignments',()=>{
 const old=legacy();old.mercenaries[0].name='운영 이름';old.skills[0].balance={damageRatio:9,cooldownTurns:8,cost:7};old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(old,before);assert.deepEqual(next.settings,before.settings);assert.deepEqual(next.skills.at(-1).balance,MANGISA_BALANCE);
 assert.deepEqual(next.assignments.at(-1).skillIds,['MS-045']);assert.equal(next.mercenaries.at(-1).rank,'SS');
 next.skills.at(-1).balance.cost=30;next.assignments.at(-1).skillIds=[];
 assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
});
function harness({mode='PVE',count=3,firstDodge=false,hp=100000,controlled=false,revive=false}={}){
 const actor=buildMercenaryFighter(snapshot,'A',mode);actor.stunned=controlled;
 const targets=Array.from({length:count},(_,i)=>({...actor,id:'B:'+i,side:'B',slot:i,isMercenary:false,stunned:false,hp:i?100000:hp,shield:i?0:100,damageDealt:0})),events=[],rolls=[];
 const hit=(_a,t,r,options)=>{rolls.push({id:t.id,ratio:r,...options});return {damage:1000*r,dodge:firstDodge&&rolls.length===1};};
 const damage=(t,n)=>{const absorbed=Math.min(t.shield||0,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};};
 const knockout=t=>{if(t.hp<=0){events.push({type:'KNOCKOUT',targetId:t.id});t.alive=false;if(revive){t.hp=t.maxHp;t.alive=true;events.push({type:'REVIVE',targetId:t.id});}}};
 const emit=(type,data)=>events.push({type,...data});
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit,damage,knockout,emit,clock:()=>0});
 return {actor,targets,events,rolls,runtime,hit,damage,knockout,emit};
}
test('six shots and two splash outcomes spend one cast, one bounded PVP cap and one cooldown in the first action',()=>{
 for(const mode of ['PVE','PVP'])for(const count of [1,2,3]){
  const h=harness({mode,count});h.actor.actions++;assert.equal(h.runtime.beforeAction(h.actor),true);
  const volley=h.events.find(e=>e.type==='MERCENARY_VOLLEY'),scale=mode==='PVP'?.82:1;
  assert.ok(volley);assert.equal(volley.impacts.length,5+count);assert.equal(h.runtime.state(h.actor).pending,null);
  assert.equal(h.runtime.state(h.actor).energy,75);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-045'),6);
  assert.ok(Math.abs(h.rolls.reduce((s,r)=>s+r.ratio,0)-(3.2+.4*(count-1))*scale)<1e-10);
  assert.ok(h.rolls.reduce((s,r)=>s+r.castShare,0)<=scale+1e-10);
  assert.ok(volley.impacts.every(i=>i.damage>=0&&i.absorbed>=0));assert.equal(volley.impacts[0].absorbed,100);
  h.actor.actions++;assert.equal(h.runtime.beforeAction(h.actor),false);assert.equal(h.runtime.state(h.actor).energy,75);
  const plan=mangisaVisualPlan(volley);assert.equal(plan.events.filter(e=>e.kind==='SHOT').length,6);assert.ok(plan.events.every(e=>!e.ratio));
 }
});
test('first dodge does not cancel followups; early primary death drops spare bullets and splash even when revived',()=>{
 const dodge=harness({firstDodge:true});dodge.actor.actions++;dodge.runtime.beforeAction(dodge.actor);
 assert.equal(dodge.rolls.length,8);assert.equal(dodge.events.find(e=>e.type==='MERCENARY_VOLLEY').impacts[0].dodge,true);
 const death=harness({hp:1,revive:true});death.actor.actions++;death.runtime.beforeAction(death.actor);
 assert.equal(death.rolls.length,1);assert.equal(death.targets[1].hp,100000);
 assert.deepEqual(death.events.filter(e=>['MERCENARY_VOLLEY','KNOCKOUT','REVIVE'].includes(e.type)).map(e=>e.type),['MERCENARY_VOLLEY','KNOCKOUT','REVIVE']);
 const disabled=harness({controlled:true});disabled.actor.actions++;disabled.runtime.beforeAction(disabled.actor);assert.equal(disabled.rolls.length,0);assert.equal(disabled.runtime.state(disabled.actor).energy,100);
 const lost=harness();lost.targets[0].hp=0;resolveMangisaVolley({...lost,skill});assert.equal(lost.rolls.length,0);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} SS opening, idempotent replay, separate loadout and approved skill`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2};
 const result=await openMercenaryCards(f.env,f.user,request,{randomInt:max=>max===2?1:0});
 assert.ok(result.draws.every(d=>d.mercenaryCode==='V-045'));assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);assert.equal(await f.coin(),before-2000);
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Repeated draw')}});assert.equal(await f.coin(),before-2000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-045',revision:0});
 const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(deployed.basePower,120000);assert.equal(deployed.rank,'SS');assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),['MS-045']);
});
test('canonical PVE and both PVP teams expose five ordinary cards plus one Mangisa and resolved volley snapshots',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'QA-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'})),merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,'V-045');
  const events=data.result.timeline.filter(e=>e.type==='MERCENARY_VOLLEY');assert.ok(events.length);
  for(const e of events){assert.equal(e.skillId,'MS-045');assert.ok(e.impacts.every(i=>Number.isFinite(i.targetHpAfter)&&Number.isFinite(i.damage)&&i.targetHpAfter>=0));}
 }
});
test('authoritative FX follows the shared clock, never changes HP, restores sprite size and releases views on cancel',()=>{
 const h=harness();h.actor.actions++;h.runtime.beforeAction(h.actor);const plan=mangisaVisualPlan(h.events.find(e=>e.type==='MERCENARY_VOLLEY'));
 const manifest=JSON.parse(fs.readFileSync(new URL('../preview/mercenary-mangisa-v1/manifest.json',import.meta.url),'utf8'));
 const stage=new Container(),effectLayer=new Container();stage.addChild(effectLayer);
 const makeActor=x=>{const root=new Container(),s=new Sprite(new Texture({source:new TextureSource({width:1024,height:1536})}));s.anchor.set(.502,.973);s.height=260;s.width=260/1.5;root.addChild(s);root.position.set(x,400);stage.addChild(root);return {root,fullBodySprite:s,fullBodyHeight:260,hp:77,animationController:{kill(){}},neutralAvatarPose:{mainSprite:{scaleX:s.scale.x,scaleY:s.scale.y}}};};
 const actor=makeActor(100),targets=[makeActor(500),makeActor(600),makeActor(700)],engine={effectLayer,simpleTimelines:new Set(),allies:[]};
 const source=new TextureSource({width:640,height:640}),assets={flash:Texture.EMPTY,smoke:Texture.EMPTY,motion:Array.from({length:6},()=>new Texture({source})),impact:Array.from({length:16},()=>new Texture({source}))};
 const before={width:actor.fullBodySprite.width,height:actor.fullBodySprite.height,texture:actor.fullBodySprite.texture};
 const fx=new MangisaSkillFX(engine,actor,targets,assets,manifest,plan,()=>{},{authoritative:true});
 fx.seek(1.41);assert.equal(fx.frame,5);assert.ok(fx.diagnostics().visibleSprites>0);assert.ok(targets.every(t=>t.hp===77));
 fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);fx.cancel();
 assert.equal(engine.simpleTimelines.size,0);assert.equal(actor.fullBodySprite.texture,before.texture);assert.ok(Math.abs(actor.fullBodySprite.height-before.height)<.001);assert.ok(Math.abs(actor.fullBodySprite.width-before.width)<.001);
 fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.ok(!source.destroyed,'atlas source remains shared');stage.destroy({children:true});source.destroy();
});

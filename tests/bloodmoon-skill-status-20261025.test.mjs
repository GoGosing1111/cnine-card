import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {withMercenaryBattle} from '../preview/project-v-v3/source/battle/MercenaryCombatPlayback.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
after(()=>gsap.ticker.sleep());
const cards=Array.from({length:5},(_,i)=>({id:String(i+1),rarity:'FUR',power:20000000,power_type:'ATTACK'}));
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});

function harness(code='V-961',side='A'){
 const actors=new Map(),actor={id:side+':MERCENARY:'+code,cardId:code,hp:100,team:side==='A'?'ALLY':'ENEMY',accent:0xeb4164,root:{visible:true,destroyed:false},animationController:{kill(){},setState(){}}};actors.set(actor.id,actor);
 const banners=[],hits=[],hpWrites=[],shieldWrites=[];let timelines=0,loads=0;
 class Base{
  constructor(){this.visible=true;this.playbackEpoch=1;this.mercenaryEpoch=1;}
  combatantById(id){return actors.get(id);}
  queueBanner(...args){banners.push(args);}
  eventHpPercent(target,hp,max){return hp/(max||target.serverMaxHp||100)*100;}
  syncTargetHp(target,hp){hpWrites.push([target.id,hp]);target.hp=hp;}
  syncTargetShield(target,shield){shieldWrites.push([target.id,shield]);target.shield=shield;}
  showAccountBattleUnitDamage(target,damage){hits.push({id:target.id,...damage});}
  async timeline(build,finish){timelines++;const calls=[];build({to(){},call(fn){calls.push(fn);}});calls.forEach(fn=>fn());finish();return true;}
 }
 const engine=new (withMercenaryBattle(Base))();engine.sequenceFor=async()=>{loads++;throw Error('Unexpected generic skill atlas');};
 engine.bloodmoonStates=new Map([[actor,{busy:false,stopped:false,fx:{plan:{contact:.1,duration:.2},begin(){},render(){},cancel(){}}}]]);
 const add=id=>{if(!actors.has(id))actors.set(id,{id,hp:100,shield:0,battleActive:true,root:{visible:true,destroyed:false},name:id,serverMaxHp:100});return actors.get(id);};
 return {engine,actor,actors,add,banners,hits,hpWrites,shieldWrites,counts:()=>({timelines,loads})};
}

test('actual Joeun PVE status records complete without a generic skill lookup or a second attack',async()=>{
 const battle=createPveBattleV2({cards,mercenary:snapshot('V-961'),monster:{id:1,battle_power:1.6e10},seed:77});
 const events=battle.result.timeline.filter(e=>e.actorId==='A:MERCENARY:V-961'&&e.type==='MERCENARY_DEBUFF');
 assert(events.some(e=>e.effect==='OFFENDER_MARK'));assert(events.some(e=>e.effect==='BASIC_WEAKENED'));
 const h=harness();for(const event of events){h.add(event.targetId);await h.engine.playMercenaryEvent(event);}
 assert.equal(h.banners.length,events.length);assert.deepEqual(h.hits,[]);assert.deepEqual(h.counts(),{timelines:0,loads:0});
});

test('status from either team preserves authoritative HP/shield once and ignores a lost or dead target',async()=>{
 for(const side of ['A','B'])for(const effect of ['OFFENDER_MARK','BASIC_WEAKENED','NEXT_BASIC_WEAKENED','OFFENSIVE_SKILL_ONLY']){
  const h=harness('V-961',side),target=h.add((side==='A'?'B':'A')+':TARGET');
  const event={type:'MERCENARY_DEBUFF',actorId:h.actor.id,targetId:target.id,skillId:'MS-961',skillName:'홍련의 속박',mechanic:'REPEAT_OFFENDER_RESTRAINT',effect,targetHpAfter:80,targetMaxHp:100,targetShieldAfter:7};
  await h.engine.playMercenaryEvent(event);assert.equal(target.hp,80);assert.equal(target.shield,7);assert.equal(h.banners.length,1);assert.equal(h.hpWrites.length,1);assert.equal(h.shieldWrites.length,1);assert.deepEqual(h.hits,[]);assert.deepEqual(h.counts(),{timelines:0,loads:0});
  target.hp=0;await h.engine.playMercenaryEvent(event);assert.equal(target.hp,0);assert.equal(h.banners.length,1);assert.equal(h.hpWrites.length,1);
  h.actors.delete(target.id);await h.engine.playMercenaryEvent(event);assert.equal(h.banners.length,1);
 }
});

for(const code of ['V-960','V-961','V-962','V-963','V-964'])test(code+' replays complete server skill streams in PVE, hunt and either PVP team',async()=>{
 const mercenary=snapshot(code),battles=[
  ['PVE','A',createPveBattleV2({cards,mercenary,monster:{id:1,battle_power:1.6e10},seed:77})],
  ['HUNT','A',createHuntSession({snapshot:{cards,mercenary},seed:77,limitMs:15000}).payload.battleV2],
  ...['A','B'].map(side=>['PVP',side,createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?mercenary:null,defenderMercenary:side==='B'?mercenary:null,seed:77})])
 ];
 for(const [mode,side,battle] of battles){
  const h=harness(code,side),events=battle.result.timeline.filter(e=>e.actorId===h.actor.id&&e.type.startsWith('MERCENARY_')),before=structuredClone(events);assert(events.length>0,code+' '+mode+' '+side+' must exercise a real skill stream');
  for(const event of events){if(event.targetId)h.add(event.targetId);await h.engine.playMercenaryEvent(event);}
  assert.deepEqual(events,before);assert.equal(h.hits.length,events.filter(e=>e.type==='MERCENARY_HIT'&&!e.dodge).length);assert.equal(h.counts().loads,0);
 }
});

import fs from 'node:fs';
import vm from 'node:vm';
import {play as playBlackwing} from './helpers/blackwing-scale-scenario.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {contentPayloads,snapshot,ownerSquads,pair} from './helpers/dual-content-fixture.mjs';
import {COMPANION_PREPARATION_REVIEW as REVIEW,COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {companionBattleOptions,continuedCompanionOptions,companionContinuationHealth} from '../shared/companion-battle-snapshot-v1.mjs';
import {createPveBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_DUAL_BALANCE} from '../shared/cooperative-dual-preparation-v1.mjs';
import {sealMercenaries} from '../functions/_seal_battle.js';
import {territoryFormationFromParts} from '../functions/_territory_war.js';
import {mercenarySnapshotPower} from '../functions/_mercenary_account.js';
import {duoStation,coopStation} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
import {createCoopRoom,coopCommand,coopView} from '../functions/_cooperative_room.js';
import {COOP_DUAL_RULES,validateCoopSelection} from '../shared/cooperative-battleground-v1.mjs';
import {companionCmsFixture} from './helpers/companion-preparation-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {selectedMercenaryBattleSnapshots} from '../functions/_mercenary_account.js';

const prepared=contentPayloads();
for(const [name,payload] of Object.entries(prepared))test(`${name}: actual content builder retains each mercenary, regular cards and distinct identities`,()=>{
 const b=payload.battleV2,expected=name==='COOP'?6:name==='DUO'?4:2,cards=name==='COOP'?6:name==='DUO'?10:5;
 assert.equal(b.teams.A.mercenaries.length,expected);assert.equal(b.teams.A.cards.length,cards);
 for(const side of name==='DUO'?['A','B']:['A']){
  const actors=[...b.teams[side].cards,...b.teams[side].mercenaries,...(b.teams[side].supports||[])];
  assert.equal(new Set(actors.map(a=>a.id)).size,actors.length);
  assert.equal(new Set(actors.map(a=>a.slot)).size,actors.length);
  assert.ok(actors.every(a=>Number.isFinite(a.hp)&&a.hp>=0&&a.hp<=a.maxHp));
  if(b.result.final?.mercenaries)assert.equal(b.result.final.mercenaries[side].length,expected);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(payload)).battleV2.teams.A.mercenaries,b.teams.A.mercenaries);
});
test('all content snapshots ignore unmarked injected arrays while release stays OFF',()=>{
 assert.equal(COMPANION_RELEASE.dualMercenaries,false);
 const s=snapshot({dual:false});assert.deepEqual(companionBattleOptions({...s,mercenaries:pair}),companionBattleOptions(s));
 const solo=contentPayloads({dual:false,legion:false});
 for(const [name,p]of Object.entries(solo))assert.equal(p.battleV2.teams.A.mercenaries?.length||0,name.startsWith('CORE_')?0:name==='COOP'?3:name==='DUO'?2:1,name);
});
test('cooperative and duo pairs enforce SS/SSS INCLUDING LIMITED per owner; shared codes across owners remain valid',()=>{
 for(const kind of ['COOP','DUO']){
  const squads=ownerSquads({count:kind==='COOP'?3:4,cards:kind==='COOP'?2:5});
  const run=()=>kind==='COOP'?createCooperativeBattle({squads,[REVIEW]:true}):createDuoBattleV2({attackerSquads:squads.slice(0,2),defenderSquads:squads.slice(2),[REVIEW]:true});
  assert.doesNotThrow(run);squads[0].mercenaries[1].rank='SS';assert.throws(run,/SS/);
  squads[0].mercenaries[0].rank='SSS';squads[0].mercenaries[1].rank='SSS';squads[0].mercenaries[1].edition='LIMITED';assert.throws(run,/SSS/);
 }
});
test('cooperative and duo owner layouts have no collisions at PC/mobile, including a missing first squad mercenary',()=>{
 for(const compact of [false,true])for(const [station,owners,regular]of [[coopStation,3,2],[duoStation,2,5]]){
  const points=[];for(const side of station===duoStation?['ALLY','ENEMY']:['ALLY']){
   for(let i=0;i<owners*regular;i++)points.push(station('cards',i,side,compact,2));
   for(let i=0;i<owners*2;i++)points.push(station('mercenaries',i,side,compact,2));
  }
  assert.equal(new Set(points.map(p=>p.x+':'+p.y)).size,points.length);
 }
});
test('escort continuation preserves each code health and allows the second survivor after JSON reconnect',()=>{
 const s=snapshot(),health=companionContinuationHealth(s,[{cardId:pair[0].code,hp:0,maxHp:100},{cardId:pair[1].code,hp:37,maxHp:100}]);
 assert.equal(health.livingMercenaries,1);const next=JSON.parse(JSON.stringify({...s,...health}));
 assert.deepEqual(continuedCompanionOptions(next).mercenaries.map(m=>m.startingHpPercent),[0,37]);
 next.mercenaries.reverse();assert.deepEqual(continuedCompanionOptions(next).mercenaries.map(m=>m.startingHpPercent),[37,0]);
 const b=createPveBattleV2({...continuedCompanionOptions(next),cards:s.cards,monster:{power:1e8},seed:2});
 assert.equal(b.teams.A.mercenaries.find(m=>m.cardId===pair[0].code).hp,0);
 assert.ok(!b.result.timeline.some(e=>e.actorId===b.teams.A.mercenaries.find(m=>m.cardId===pair[0].code).id&&e.type==='TURN'));
});
test('seal and territory use both canonical mercenary powers, with separate replay fighters',()=>{
 const s=snapshot(),fighters=sealMercenaries(s);assert.equal(fighters.length,2);assert.notEqual(fighters[0].id,fighters[1].id);
 const p=territoryFormationFromParts({cards:s.cards,loadoutBonus:s});
 assert.equal(p.breakdown.mercenaryPower,pair.reduce((n,m)=>n+mercenarySnapshotPower(m),0));
});
test('cooperative difficulty increases captured enemies, remains party-independent and leaves single rooms unchanged',()=>{
 const squads=ownerSquads(),config={squads,difficulty:'HARD',seed:19,[REVIEW]:true};
 const baseline=createCooperativeBattle({...config,dualBalance:{...COOP_DUAL_BALANCE,hp:1,attack:1}}),harder=createCooperativeBattle(config);
 for(let i=0;i<5;i++){
  const a=baseline.payload.cooperativeEncounter.instances[i],b=harder.payload.cooperativeEncounter.instances[i];
  assert.equal(b.maxHp,Math.round(a.maxHp*COOP_DUAL_BALANCE.hp));assert.equal(b.attack,Math.round(a.attack*COOP_DUAL_BALANCE.attack));
 }
 const stronger=createCooperativeBattle({...config,squads:squads.map(s=>({...s,equipmentBonus:1e9}))});
 assert.deepEqual(stronger.payload.cooperativeEncounter,harder.payload.cooperativeEncounter);
});

test('dual cooperative room freezes both selections and difficulty across restore; forfeiting removes precisely four owner actors',()=>{
 const squads=ownerSquads(),client=id=>'dual-qa-client-'+id,users=squads.map(s=>({id:s.ownerId,nickname:s.ownerName}));
 const tuning={...COOP_DUAL_BALANCE};let room=createCoopRoom({id:'123456789A',user:users[0],clientId:client(1),difficulty:'HARD',seed:28,now:1000,[REVIEW]:true,dualBalance:tuning});
 tuning.hp=4;assert.equal(room.dualBalance.hp,1.6);
 for(const user of users.slice(1))coopCommand(room,user,'join',{clientId:client(user.id)},1000);
 assert.throws(()=>coopCommand(room,users[0],'select',{clientId:client(1),loadout:{...squads[0],mercenaries:[pair[0]]}},1100),/편성 수/);
 for(const user of users)coopCommand(room,user,'ready',{clientId:client(user.id),loadout:squads[user.id-1]},2000);
 assert.equal(room.status,'LOADING');assert.equal(room.payload.battleV2.teams.A.mercenaries.length,6);
 squads[0].mercenaries.pop();room=JSON.parse(JSON.stringify(room));
 const before=coopView(room,users[0],2100);assert.equal(before.state.mercenariesPerOwner,2);assert.equal(before.state.members[0].selection.mercenaries.length,2);
 coopCommand(room,users[0],'connect',{clientId:client(1)},2200);assert.equal(room.members[0].result,undefined);
 for(const user of users)coopCommand(room,user,'loaded',{clientId:client(user.id)},3000);
 const initial=room.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<1000);
 coopCommand(room,users[0],'connect',{clientId:client(11)},room.startsAt+1000);
 assert.equal(room.members[0].result,'DEFEAT');assert.equal(room.members.filter(m=>m.result).length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(room.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<1000))),initial);
 const view=coopView(room,users[1],room.startsAt+1000),fallen=view.state.fighters.A.filter(f=>f.ownerId===1);
 assert.equal(fallen.length,4);assert.ok(fallen.every(f=>f.hp===0));assert.equal(view.state.fighters.A.filter(f=>f.ownerId!==1).length,8);
 assert.equal(room.payload.battleV2.result.timeline.filter(e=>e.withdrawn).length,4);
 assert.deepEqual(room.payload.battleV2.rules.dualBalance,COOP_DUAL_BALANCE);
});

test('cooperative two-slot selection requires two owned, distinct codes and retains the two-card contract',()=>{
 const value={cardIds:['a','b'],mercenaryCodes:pair.map(m=>m.code)};
 assert.deepEqual(validateCoopSelection(value,COOP_DUAL_RULES).mercenaryCodes,value.mercenaryCodes);
 for(const mercenaryCodes of [[],[pair[0].code],[pair[0].code,pair[0].code],['V-001','V-002','V-003']])assert.throws(()=>validateCoopSelection({...value,mercenaryCodes},COOP_DUAL_RULES));
 assert.throws(()=>validateCoopSelection({...value,cardIds:['a','b','c']},COOP_DUAL_RULES));
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: explicit prepared pair uses actual owned snapshots and cannot change saved account slots`,async t=>{
 const f=await mercenaryFixture(t,{postgres}),codes=['V-001','V-002'];
 for(const code of codes)await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
 const rows=await selectedMercenaryBattleSnapshots(f.env,f.user,codes);
 assert.deepEqual(rows.map(m=>m.code),codes);assert.ok(rows.every(m=>m.statMode==='RANK_FIXED'));
 await assert.rejects(selectedMercenaryBattleSnapshots(f.env,f.user,['V-001','V-003']),{code:'MERCENARY_NOT_OWNED'});
 await assert.rejects(selectedMercenaryBattleSnapshots(f.env,f.user,['V-001','V-001']));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_loadout_v1').first()).n),0);
});

test('OWNER cooperative and ranked-duo preparation APIs return per-owner pairs without DB writes',async()=>{
 const f=await companionCmsFixture();try{
  const opts={path:'admin/companions/preparation/dual',method:'POST'};
  for(const mode of ['COOP','DUO']){
   const body={codes:pair.map(m=>m.code),mode,seed:28,mercenaryRevision:7};
   assert.equal((await f.call(body,{...opts,role:'ADMIN'})).status,403);
   assert.equal((await f.call({...body,mercenaryRevision:6},opts)).status,409);
   const r=await f.call(body,opts);assert.equal(r.status,200,JSON.stringify(r.body));
   const battle=r.body.battle;assert.equal(battle.teams.A.mercenaries.length,mode==='COOP'?6:4);
   assert.equal(battle.rules.mercenariesPerOwner,2);
  }
  assert.equal((await f.pg.query('SELECT COUNT(*) n FROM app_meta')).rows[0].n,0);
 }finally{await f.close();}
});

for(const part of ['WING','BLADE'])test('blackwing v3 full mechanic clear preserves both mercenaries per owner: '+part,()=>{
 const r=playBlackwing(123,part,{deck:snapshot({power:10000000})});
 assert.equal(r.status,'CLEAR');assert.equal(r.fighters.filter(f=>f.isMercenary).length,12);
 for(const m of r.members){const rows=r.fighters.filter(f=>f.ownerId===m.id&&f.isMercenary);assert.equal(rows.length,2);assert.equal(new Set(rows.map(f=>f.id)).size,2);}
 const restored=JSON.parse(JSON.stringify(r));assert.equal(restored.fighters.filter(f=>f.ownerId==='1'&&f.isMercenary).length,2);
});
test('seal and dragon dual playback split one committed contribution without double damage',()=>{
 const context={console,setTimeout,clearTimeout,Image:class{}};context.window=context;
 vm.runInNewContext(fs.readFileSync('js/battle-v3-live.js','utf8'),context);
 const mercenaries=sealMercenaries(snapshot()),cards=snapshot().cards;
 for(const roleKey of ['ATTACK','GUARD','PURIFY','BOSS'])for(const result of ['WIN','LOSE']){
  const data={cards,mercenaries,result,playerPower:50000,totalBattleDamage:50000,mercenaryBattlePower:30000,contribution:17000,battlePhase:roleKey==='BOSS'?'BOSS':'SEALS',bossHpBefore:17000,bossHpAfter:0,bossMaxHp:200000,bossDefeated:roleKey==='BOSS'};
  const p=context.ProjectVBattleV3Live.sealPayload({roleKey,data}),hits=p.battleV2.result.timeline.filter(e=>e.targetId===p.monster.cardId&&['TURN','SKILL'].includes(e.type));
  assert.equal(p.battleV2.teams.A.mercenaries.length,2);assert.equal(hits.reduce((n,e)=>n+e.damage,0),17000);
  for(const m of mercenaries)assert.ok(hits.some(e=>e.actorId===m.id&&e.damage>0));
 }
});

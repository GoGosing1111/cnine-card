import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANION_RELEASE,COMPANION_PREPARATION_REVIEW as REVIEW} from '../shared/companion-loadout-v2.mjs';
import {RANKED_SERIES_RULES,RANKED_DUAL_SERIES_RULES as rules,rankedSeriesRoster,simulateRankedSeries,rankedSeriesReceipt} from '../shared/ranked-series-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {independentMercenaryTurnCadence,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {rankedSelectedMercenaries,battleConfig} from '../functions/_mercenary_account.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {readRankedRosters,saveRankedRoster,readRankedSeriesTicket,rankedTicketPreview,rankedOwnershipGuard} from '../functions/_ranked_series.js';
import {readRankedEnergy,commitRankedFight,rankedFightReceipt} from '../functions/_ranked_reform.js';
import {reviewMercenaries,companionCmsFixture} from './helpers/companion-preparation-fixture.mjs';
import {rankedFixture} from './helpers/ranked-series-fixture.mjs';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {occupiedStations} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';

const codes=['V-001','V-002','V-003','V-004','V-005','V-006'],ranks=['SS','SSS','A','S','B','C'];
const pair=reviewMercenaries().slice(0,2);
const document=structuredClone(seed.document);codes.forEach((code,i)=>{document.mercenaries.find(m=>m.code===code).rank=ranks[i];});
const six=codes.map(code=>battleConfig(document,code,1));

test('dual deployment remains OFF and a client cannot opt live battles into six selections',()=>{
 assert.equal(COMPANION_RELEASE.dualMercenaries,false);assert.equal(RANKED_SERIES_RULES.rosterSize,3);
 const input={cards:tierCards(1e6),mercenary:pair[0],monster:{power:3e6},seed:17};
 assert.deepEqual(createPveBattleV2({...input,mercenaries:pair}),createPveBattleV2(input));
 assert.throws(()=>rankedSeriesRoster(six));
});
for(const power of [1e6,2e7,1e8])test(`both companions act in canonical PVE and PVP at card power ${power}`,()=>{
 const cards=tierCards(power),pve=createPveBattleV2({cards,mercenaries:pair,battleSuit:{code:'QA',pvePower:power},monster:{power:power*100,isBoss:true},seed:17,[REVIEW]:true});
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenaries:pair,defenderMercenaries:pair,seed:17,[REVIEW]:true});
 for(const [battle,sides]of [[pve,['A']],[pvp,['A','B']]])for(const side of sides){
  assert.equal(battle.teams[side].cards.length,5);assert.equal(battle.teams[side].mercenaries.length,2);
  assert.equal(battle.result.final[side].length,5);assert.equal(battle.result.final.mercenaries[side].length,2);
  assert.deepEqual(battle.teams[side].mercenaries.map(m=>m.slot),[5,6]);
  for(const merc of battle.teams[side].mercenaries)assert.ok(battle.result.timeline.some(e=>e.actorId===merc.id&&e.type==='TURN'),merc.id);
 }
 assert.equal(pve.teams.A.supports[0].slot,7);
 const d=pve.result.damageBreakdown;assert.equal(d.total,d.cards+d.mercenary+d.battleSuit+d.skillChips+(d.battleSuitSkills||0)+d.ultimate);
 const mercIds=new Set(pve.teams.A.mercenaries.map(m=>m.id));
 const sum=pve.result.timeline.filter(e=>mercIds.has(e.sourceAttackerId||e.actorId)).reduce((n,e)=>n+Math.max(0,e.damage||0)+Math.max(0,e.absorbed||0),0);
 assert.equal(d.mercenary,sum);assert.ok(d.mercenary>0);
});
test('two slots reject repeated codes, repeated ranks and malformed regular decks',()=>{
 for(const rows of [[pair[0],pair[0]],[pair[0],{...pair[1],rank:pair[0].rank}],[...pair,pair[0]]])assert.throws(()=>createPveBattleV2({cards:tierCards(1e6),mercenaries:rows,[REVIEW]:true}));
 assert.throws(()=>createPvpBattleV2({attackerCards:tierCards(1e6).slice(1),defenderCards:tierCards(1e6),attackerMercenaries:pair,[REVIEW]:true}));
 assert.throws(()=>createPveBattleV2({cards:tierCards(1e6),mercenary:pair[0],mercenaries:pair,[REVIEW]:true}),/AMBIGUOUS/);
});
test('current premium cadence is earned independently without cross-credit or starvation',()=>{
 const card={id:'A:CARD',side:'A',hp:100,alive:true},actors=['V-970','V-960'].map((code,i)=>({...limitedDeploymentSnapshot(code),id:code,side:'A',slot:5+i,isMercenary:true,battleMode:'PVP',hp:100,alive:true}));
 const drain=(cadence,counts)=>{for(let i=0;i<100;i++){const actor=cadence.pending();if(!actor)return;counts[actor.id]=(counts[actor.id]||0)+1;cadence.acted(actor);}assert.fail('unbounded cadence');};
 const combined=independentMercenaryTurnCadence({A:[card,...actors],B:[]}),counts={};
 for(let i=0;i<25;i++){combined.acted(card);drain(combined,counts);}
 for(const actor of actors){const single=mercenaryTurnCadence({A:[card,actor],B:[]}),expected={};for(let i=0;i<25;i++){single.acted(card);drain(single,expected);}assert.equal(counts[actor.id],expected[actor.id]);assert.ok(counts[actor.id]>25);}
 actors[0].hp=0;combined.acted(card);assert.equal(combined.pending().id,actors[1].id);
 assert.equal(combined.pending(()=>false),null);
});
test('six unique selections form three rank-distinct pairs; each round starts fresh and stops at two wins',()=>{
 assert.equal(rankedSeriesRoster(six,rules).length,6);
 assert.throws(()=>rankedSeriesRoster([...six.slice(0,5),six[0]],rules));
 assert.throws(()=>rankedSeriesRoster(six.map((m,i)=>i===1?{...m,rank:six[0].rank}:m),rules),/1차전/);
 for(const outcomes of [['A','A'],['B','B'],['A','B','A'],['B','A','B']]){
  let index=0;const options={attackerCards:[{hp:100}],defenderCards:[{hp:100}]};
  const result=simulateRankedSeries({rules,options,seed:28,attackerMercenaries:six,defenderMercenaries:[...six].reverse(),createBattle:input=>{
   assert.equal(input.attackerCards[0].hp,100);input.attackerCards[0].hp=0;
   assert.deepEqual(input.attackerMercenaries.map(m=>m.code),codes.slice(index*2,index*2+2));
   return {result:{winner:outcomes[index++],reason:'ELIMINATION',actions:5}};
  }});
  assert.equal(result.rounds.length,outcomes.length);assert.equal(options.attackerCards[0].hp,100);
  assert.equal(result.rounds[0].attackerMercenaries.length,2);assert.equal(result.score[result.winner],2);
 }
});
test('real ranked pairs match individually simulated deterministic battles',()=>{
 const options={attackerCards:tierCards(1e6),defenderCards:tierCards(1e6)},input={rules,createBattle:createPvpBattleV2,options,seed:28,attackerMercenaries:six,defenderMercenaries:[...six].reverse()};
 const result=simulateRankedSeries(input);assert.deepEqual(result,simulateRankedSeries(input));
 for(const round of result.rounds){const i=(round.number-1)*2;assert.deepEqual(round.battleV2,createPvpBattleV2({...options,attackerMercenaries:six.slice(i,i+2),defenderMercenaries:[...six].reverse().slice(i,i+2),seed:(28+Math.imul(round.number,0x9e3779b9))>>>0,[REVIEW]:true}));}
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} dual roster, ticket privacy, ownership rollback and one settlement`,async t=>{
 const {env,q,settings,createTicket,queries}=await rankedFixture(t,postgres,{codes,ranks,rules});
 await saveRankedRoster(env,{id:1},{codes:codes.slice(0,3),revision:0});
 assert.equal((await readRankedRosters(env,[1],rules)).get(1).ready,false,'legacy roster is not migrated');
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:0,mercenariesPerRound:2}),/3종/,'client fields cannot unlock preparation');
 for(const id of [1,2])await saveRankedRoster(env,{id},{codes:id===1?codes:[...codes].reverse(),revision:0},rules);
 const concurrent=await Promise.allSettled([saveRankedRoster(env,{id:1},{codes,revision:1},rules),saveRankedRoster(env,{id:1},{codes,revision:1},rules)]);
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 const ticket=await createTicket();assert.equal(await createTicket('competing'),null);
 const preview=await rankedTicketPreview(env,ticket,rules);assert.deepEqual(preview.opponent.map(m=>m.code),codes);assert.equal(preview.mercenariesPerRound,2);assert.equal(preview.opponentOrderHidden,true);
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:2},rules),/매칭 중/);
 assert.equal(await readRankedSeriesTicket(env,ticket.token,1,2),null,'old ticket reader cannot accept dual');
 assert.deepEqual((await readRankedSeriesTicket(env,ticket.token,1,2,rules)).B,[...codes].reverse());
 await ensureMercenaryLevelSchema(env);
 await q('INSERT INTO app_meta VALUES(?,?,CURRENT_TIMESTAMP)','mercenary_level_policy_v1',JSON.stringify(mercenaryGrowthLaunchPolicy())).run();
 for(const id of [1,2])for(let i=0;i<codes.length;i++)await q('INSERT INTO user_mercenary_levels_v1 VALUES(?,?,?,?,?,?,?)',id,codes[i],i+2,0,i>=4?1:0,1,'qa').run();
 queries.length=0;const selected=await rankedSelectedMercenaries(env,new Map([[1,codes],[2,ticket.B]]),rules);
 assert.deepEqual(selected.get(1).map(m=>m.level),[2,3,4,5,6,7]);assert.deepEqual(selected.get(2).map(m=>m.level),[7,6,5,4,3,2]);
 assert.equal(queries.filter(sql=>sql.includes('user_mercenary_levels_v1')).length,1,'all twelve growth snapshots use one batched read');
 const series=simulateRankedSeries({rules,options:{},seed:1,attackerMercenaries:selected.get(1),defenderMercenaries:selected.get(2),createBattle:()=>({result:{winner:'A',actions:2,reason:'ELIMINATION'}})});
 const user={id:1},energy=await readRankedEnergy(env,user,settings.energy),commit=()=>commitRankedFight(env,{user,settings,ticket:{token:ticket.token},requestId:'dual-set',energy,beforeScore:1000,writes:[...rankedOwnershipGuard(env,new Map([[1,codes],[2,ticket.B]]),rules),q('UPDATE users SET coin=coin+50 WHERE id=1'),q('UPDATE pvp_profiles SET season_score=1024 WHERE user_id=1'),q('INSERT INTO pvp_match_history VALUES(1,?)','A')],response:{result:'WIN',rankedSeries:rankedSeriesReceipt(series)}});
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=2 AND mercenary_code=?',codes[5]).run();
 await assert.rejects(commit());assert.equal((await q('SELECT coin FROM users WHERE id=1').first()).coin,100);
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=2 AND mercenary_code=?',codes[5]).run();
 await commit();await assert.rejects(commit());const receipt=await rankedFightReceipt(env,1,'dual-set',ticket.token);
 assert.equal(receipt.energy.energy,9);assert.equal(receipt.coinAfter,150);assert.equal(receipt.rankedSeries.rounds[0].attackerMercenaries.length,2);
 assert.equal((await q('SELECT COUNT(*) n FROM pvp_match_history').first()).n,1);
 assert.deepEqual((await readRankedRosters(env,[1])).get(1).codes,codes.slice(0,3),'legacy saved order remains intact');
});
test('OWNER dual preview is read-only and rejects stale revisions and injected stats',async()=>{
 const fx=await companionCmsFixture();try{
  const body={codes:pair.map(m=>m.code),mode:'PVE',seed:28,mercenaryRevision:7},opts={path:'admin/companions/preparation/dual',method:'POST'};
  assert.equal((await fx.call(body,{...opts,role:'ADMIN'})).status,403);
  assert.equal((await fx.call({...body,mercenaryRevision:6},opts)).status,409);
  assert.equal((await fx.call({...body,stats:{attack:999999999}},opts)).status,400);
  const response=await fx.call(body,opts);assert.equal(response.status,200);assert.equal(response.body.battle.teams.A.mercenaries.length,2);
  assert.equal((await fx.pg.query('SELECT * FROM app_meta')).rows.length,0);
 }finally{await fx.close();}
});
test('OWNER ranked preview validates six canonical selections and returns two actors every round',async()=>{
 const fx=await companionCmsFixture({mercenaries:six});try{
  const body={codes,mode:'RANKED',seed:28,mercenaryRevision:7},opts={path:'admin/companions/preparation/dual',method:'POST'};
  const response=await fx.call(body,opts);assert.equal(response.status,200);
  for(const round of response.body.rankedSeries.rounds)for(const side of ['A','B'])assert.equal(round.battleV2.teams[side].mercenaries.length,2);
  assert.equal((await fx.call({...body,codes:[...codes.slice(0,5),codes[0]]},opts)).status,400);
  assert.equal((await fx.pg.query('SELECT * FROM app_meta')).rows.length,0);
 }finally{await fx.close();}
});
test('two mercenaries use unique occupied stations while every existing station stays fixed',()=>{
 for(const mobile of [false,true])for(const scenario of ['PVE','PVP']){
  const before=occupiedStations({mobile,scenario}),after=occupiedStations({mobile,scenario,allyMercenaries:2,enemyMercenaries:2});
  for(const station of before)assert.deepEqual(after.find(row=>row.id===station.id),station);
  assert.equal(new Set(after.map(p=>`${p.x}:${p.y}`)).size,after.length);
 }
});

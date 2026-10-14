import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryLevelDraft,validateMercenaryLevelPolicy,mercenaryLevelRequiredXp,mercenaryLevelXpMultiplier,initialMercenaryLevel,levelProgress,planMercenaryTraining,planMercenaryBreakthrough,attachMercenaryLevel,applyMercenaryLevelStats,MERCENARY_LEVEL_KEY,MERCENARY_LEVEL_RULES} from '../shared/mercenary-level-v1.mjs';
import {ensureMercenaryLevelSchema,readMercenaryLevelPolicy,readMercenaryLevelState} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel,handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const policy=()=>{const p=mercenaryLevelDraft();p.mode='ON';p.xpPerCard=Object.fromEntries(Object.keys(p.xpPerCard).map(rank=>[rank,100]));p.levels.forEach(row=>row.requiredXp=1000);p.milestones.forEach(row=>Object.assign(row,{successChancePpm:500000,bonus:{type:'COMBAT_STATS_PERCENT',value:500}}));return p;};
const cards=[{code:'V-049',name:'크라이베른',rank:'SSS'},{code:'V-055',name:'베르칸',rank:'SSS'},{code:'V-996',name:'발테르',rank:'SSS'}].map(row=>({...row,totalCopies:31,duplicates:30}));
const training=(target,materials,state=initialMercenaryLevel())=>planMercenaryTraining({policy:policy(),target,state,materials,owned:cards,catalog:cards});

test('same code gives exactly 3x XP; other SSS gives 1x regardless of limited edition',()=>{
 const cry=training(cards[0],[{code:'V-049',quantity:1}]);assert.equal(cry.xp,300);assert.equal(cry.after.experience,300);
 for(const code of ['V-055','V-996'])assert.equal(training(cards[0],[{code,quantity:1}]).xp,100);
 const limited=training(cards[2],[{code:'V-996',quantity:1},{code:'V-049',quantity:2}]);
 assert.equal(limited.xp,500);assert.equal(limited.after.level,1);assert.equal(levelProgress(policy(),limited.after,cards[2]).percent,10);
 assert.equal(limited.requiredXpMultiplier,5);assert.equal(cry.requiredXpMultiplier,1);
 for(const value of [null,1,2,2.5,4])assert.throws(()=>validateMercenaryLevelPolicy({...policy(),sameCardMultiplier:value}),{code:'MERCENARY_LEVEL_CONFIG'});
});

test('all required XP and cumulative XP are exactly 5x, determined from canonical identity',()=>{
 const p=policy();p.levels.forEach(row=>row.requiredXp=1000+row.level*37);
 for(const code of ['V-996','V-999','V-989','V-990']){
  const target={code,edition:'NORMAL'};assert.equal(mercenaryLevelXpMultiplier(target),5);
  for(let level=1;level<=20;level++)assert.equal(mercenaryLevelRequiredXp(p,level,target),mercenaryLevelRequiredXp(p,level,cards[0])*5);
  assert.equal(p.levels.reduce((n,r)=>n+mercenaryLevelRequiredXp(p,r.level,target),0),p.levels.reduce((n,r)=>n+r.requiredXp,0)*5);
 }
 assert.equal(mercenaryLevelXpMultiplier({...cards[0],edition:'LIMITED'}),1);
 const draft=mercenaryLevelDraft();assert.equal(mercenaryLevelRequiredXp(draft,1,cards[2]),null);
 const cap=policy();cap.levels[0].requiredXp=2e11;validateMercenaryLevelPolicy(cap);assert.equal(mercenaryLevelRequiredXp(cap,1,cards[2]),1e12);cap.levels[0].requiredXp++;assert.throws(()=>validateMercenaryLevelPolicy(cap));
});

test('limited checkpoints, overflow and failures use the 5x threshold through final level 20',()=>{
 const p=policy(),target=cards[2];
 for(const [i,level]of [5,10,15,20].entries()){
  const state={level,experience:4900,breakthroughMask:(1<<i)-1,revision:3};
  const trained=training(target,[{code:'V-996',quantity:1}],state);assert.equal(trained.after.experience,5000);assert.equal(trained.overflowXp,200);assert.equal(trained.appliedXp,100);assert.equal(trained.breakthroughReady,true);
  assert.throws(()=>planMercenaryBreakthrough({policy:p,target,state:{...state,experience:1000},roll:0}),{code:'MERCENARY_LEVEL_NOT_READY'});
  const failure=planMercenaryBreakthrough({policy:p,target,state:trained.after,roll:500000});assert.equal(failure.after.level,level);assert.equal(failure.after.experience,0);assert.equal(failure.after.breakthroughMask,state.breakthroughMask);
  const success=planMercenaryBreakthrough({policy:p,target,state:trained.after,roll:0});assert.equal(success.after.level,Math.min(20,level+1));assert.equal(success.complete,level===20);
 }
});

test('older OFF draft adapts without writes, preserving unsettled values and raw concurrency guard',async()=>{
 const old={...mercenaryLevelDraft(),version:'mercenary-level-20261005',sameCardMultiplier:null,revision:7};old.xpPerCard.SSS=19;
 const raw=JSON.stringify(old),env={DB:{prepare(){return {bind(){return {first:async()=>({value:raw})};}};}}};
 const result=await readMercenaryLevelPolicy(env);assert.equal(result.raw,raw);assert.equal(result.policy.version,MERCENARY_LEVEL_RULES.version);assert.equal(result.policy.sameCardMultiplier,3);assert.equal(result.policy.revision,7);assert.equal(result.policy.xpPerCard.SSS,19);assert.equal(result.policy.levels[0].requiredXp,null);assert.equal(result.policy.mode,'OFF');
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: limited training rolls back, replays once and remains unavailable through live routes`,async t=>{
 const f=await mercenaryFixture(t,{postgres});await ensureMercenaryLevelSchema(f.env);
 for(const c of f.document.mercenaries)if(cards.some(x=>x.code===c.code))c.rank='SSS';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.setting(MERCENARY_LEVEL_KEY,policy());
 for(const c of cards)await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,?,?)',c.code,31,30,'2026-10-14','2026-10-14').run();
 const body={requestId:crypto.randomUUID(),mercenaryCode:'V-996',revision:0,materials:[{code:'V-996',quantity:1},{code:'V-049',quantity:1}]};
 f.fail('INSERT INTO user_mercenary_levels_v1');await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,body,'TRAIN'),/INJECTED/);f.fail('');
 assert.equal((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-996'").first()).total_copies,31);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-996'),initialMercenaryLevel());
 const receipt=await runPreparedMercenaryLevel(f.env,f.user,body,'TRAIN');assert.equal(receipt.result.xp,400);assert.equal(receipt.result.after.level,1);assert.equal(receipt.result.after.experience,400);assert.equal(receipt.result.requiredXpMultiplier,5);
 assert.equal((await runPreparedMercenaryLevel(f.env,f.user,body,'TRAIN')).replayed,true);assert.equal((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-996'").first()).total_copies,30);
 const path='mercenaries/v3/leveling/state',response=await handleMercenaryLevel({path,request:new Request('https://qa.test/api/'+path,{headers:{authorization:'Bearer local-account-7'}}),env:f.env,deps:f.deps}),state=await response.json();assert.equal(response.status,200,JSON.stringify(state));
 assert.equal(state.enabled,false);const shown=state.cards.find(x=>x.code==='V-996');assert.equal(shown.name,'발테르');assert.equal(shown.rank,'SSS');assert.equal(shown.growth.level,1);assert.ok(shown.sourceArt);
});

test('prepared combat stat growth applies once and preserves wounds and pre-growth actors',()=>{
 const actor={isMercenary:true,maxHp:1000,hp:500,attack:100,defense:50,speed:20,stats:{speed:20},mercenaryLink:{attackFloor:200,hpFloor:1000},skills:[],mercenaryLevel:{version:1,level:6,breakthroughMask:1,bonuses:[{level:5,type:'COMBAT_STATS_PERCENT',value:100}]}};
 applyMercenaryLevelStats(actor);assert.deepEqual([actor.maxHp,actor.hp,actor.attack,actor.defense,actor.speed],[2000,1000,200,100,40]);assert.equal(actor.mercenaryLink.attackFloor,400);assert.equal(actor.stats.speed,40);
 const once=structuredClone(actor);applyMercenaryLevelStats(actor);assert.deepEqual(actor,once);
 const historical={...actor,mercenaryLevel:undefined,mercenaryLevelApplied:false},copy=structuredClone(historical);applyMercenaryLevelStats(historical);assert.deepEqual(historical,copy);
});

test('isolated level-20 Cryvern can defeat level-1 limited SSS with unchanged cards and real battle rules',()=>{
 // Feasibility sample only: these values are never saved in CMS or default policy.
 const p=policy(),regular=sssReferences.find(c=>c.code==='V-049'),grown=attachMercenaryLevel(regular,p,{level:20,experience:0,breakthroughMask:15,revision:1});
 for(const code of ['V-996','V-999'])for(const side of ['A','B']){
  const result=createPvpBattleV2({attackerCards:tierCards(180000),defenderCards:tierCards(180000),attackerMercenary:side==='A'?grown:limitedDeploymentSnapshot(code),defenderMercenary:side==='B'?grown:limitedDeploymentSnapshot(code),seed:104729}).result;
  assert.equal(result.winner,side);assert.equal(result.reason,'ELIMINATION');
 }
 assert.equal(mercenaryLevelDraft().milestones[0].bonus.value,null);assert.equal(mercenaryLevelDraft().mode,'OFF');
});

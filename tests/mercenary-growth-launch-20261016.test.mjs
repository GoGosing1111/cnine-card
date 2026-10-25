import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {MERCENARY_LEVEL_RELEASE_ENABLED,MERCENARY_LEVEL_KEY,mercenaryLevelDraft,mercenaryLevelRequiredXp,mercenaryGrowthSummary,initialMercenaryLevel,planMercenaryTraining,planMercenaryBreakthrough} from '../shared/mercenary-level-v1.mjs';
import {PVP_POWER_BALANCE_RELEASED,pvpPowerBonuses} from '../shared/pvp-power-balance-v1.mjs';
import {inspectGrowthLaunch,applyGrowthLaunch,OPERATION_KEY} from '../scripts/ops/mercenary-growth-launch-20261016.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema,attachReleasedMercenaryLevels} from '../functions/_mercenary_level_policy.js';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';

const cards=[{code:'V-049',rank:'SSS',name:'크라이베른',totalCopies:31,duplicates:30},{code:'V-055',rank:'SSS',name:'베르칸',totalCopies:31,duplicates:30},{code:'V-996',rank:'SSS',name:'발테르',totalCopies:31,duplicates:30}];
test('approved launch triples rising required XP only; both combat flags open and empty CMS stays empty',()=>{
 const p=mercenaryGrowthLaunchPolicy();
 assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);assert.equal(PVP_POWER_BALANCE_RELEASED,true);
 assert.equal(mercenaryLevelDraft().growth,null);assert.equal(mercenaryLevelDraft().xpPerCard.SSS,null);
 assert.deepEqual(p.levels.map(r=>r.requiredXp),[750,900,1050,1200,1350,1500,1650,1800,1950,2100,2250,2400,2550,2700,2850,3000,3150,3300,3450,3600]);
 for(const r of p.levels)assert.equal(mercenaryLevelRequiredXp(p,r.level,cards[2]),r.requiredXp*5);
 assert.ok(Object.values(p.xpPerCard).every(x=>x===100));assert.ok(p.milestones.every(m=>m.successChancePpm===100000));
 const train=(target,code,quantity)=>planMercenaryTraining({policy:p,state:initialMercenaryLevel(),target,owned:cards,catalog:cards,materials:[{code,quantity}]});
 assert.equal(train(cards[0],'V-049',1).xp,300);assert.equal(train(cards[0],'V-055',1).xp,100);
 assert.deepEqual(train(cards[0],'V-049',3).after,{level:2,experience:150,breakthroughMask:0,revision:1});
 assert.equal(train(cards[2],'V-049',3).after.level,1);assert.equal(train(cards[2],'V-049',3).after.experience,300);
 assert.deepEqual(pvpPowerBonuses(2,1),{ratio:2,damageMultiplier:1.3,tempoMultiplier:1.1});
 assert.deepEqual(pvpPowerBonuses(4,1),{ratio:4,damageMultiplier:1.6,tempoMultiplier:1.2});
});
test('all four breakthroughs use exact 10% boundaries, preserve earned growth on failure, and finish at 21',()=>{
 const policy=mercenaryGrowthLaunchPolicy();
 for(const [i,level]of [5,10,15,20].entries())for(const target of [cards[0],cards[2]]){
  const state={level,experience:mercenaryLevelRequiredXp(policy,level,target),breakthroughMask:(1<<i)-1,revision:4};
  const success=planMercenaryBreakthrough({policy,state,target,roll:99999}),failure=planMercenaryBreakthrough({policy,state,target,roll:100000});
  assert.equal(success.success,true);assert.equal(failure.success,false);
  assert.equal(success.after.level,Math.min(21,level+1));assert.equal(success.after.breakthroughMask,(1<<(i+1))-1);
  assert.deepEqual(failure.after,{...state,experience:0,revision:5});
  assert.deepEqual(mercenaryGrowthSummary(policy.growth,failure.after),mercenaryGrowthSummary(policy.growth,state));
 }
});
test('released authenticated state, training, receipt replay and server battle snapshot use the saved launch policy',async t=>{
 const f=await mercenaryFixture(t);await ensureMercenaryLevelSchema(f.env);
 const policy=mercenaryGrowthLaunchPolicy({revision:1});await f.setting(MERCENARY_LEVEL_KEY,policy);
 await f.p("INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,'V-049',31,30,'2026-10-16','2026-10-16')").run();
 const deps={json:(data,status=200)=>({data,status}),authenticate:async()=>f.user,withUserMutationLock:async(_env,_id,_path,fn)=>fn()};
 const call=(action,body)=>handleMercenaryLevel({path:'mercenaries/v3/leveling/'+action,request:new Request('https://qa.test/api/mercenaries/v3/leveling/'+action,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'https://qa.test'},...(body?{body:JSON.stringify(body)}:{})}),env:f.env,deps});
 const initial=await call('state');assert.equal(initial.status,200);assert.equal(initial.data.enabled,true);assert.equal(initial.data.cards[0].growth.level,1);
 const body={requestId:crypto.randomUUID(),mercenaryCode:'V-049',revision:0,materials:[{code:'V-049',quantity:3}],allowOverflow:false};
 const preview=await call('preview',body);assert.equal(preview.status,200);assert.equal(preview.data.after.level,2);
 const first=await call('train',body);assert.equal(first.status,200);assert.equal(first.data.result.after.experience,150);
 const replay=await call('train',body);assert.equal(replay.status,200);assert.deepEqual(replay.data.result,first.data.result);
 const owned=await f.p("SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-049'").first();assert.equal(owned.total_copies,28);assert.equal(owned.duplicate_count,27);
 const snapshots=await attachReleasedMercenaryLevels(f.env,new Map([[7,cards[0]]]));assert.equal(snapshots.get(7).mercenaryLevel.level,2);
 assert.deepEqual(snapshots.get(7).mercenaryLevel.growth,policy.growth);
 await f.setting(MERCENARY_LEVEL_KEY,{...policy,mode:'OFF'});
 const closed=await call('state');assert.equal(closed.data.enabled,false);assert.equal(closed.data.cards[0].growth.level,2,'OFF keeps earned progress visible');
 const denied=await call('preview',{...body,revision:1});assert.equal(denied.status,423);
});
test('launch installs only its empty table and audited policy once; dry-run/conflict roll back and replay never resets CMS',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP); CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT); INSERT INTO users VALUES(1,'OWNER','ACTIVE'); CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)");
 const before=await inspectGrowthLaunch(pg);assert.equal(before.schemaInstalled,false);
 await assert.rejects(()=>applyGrowthLaunch(pg,{expectedStateHash:'0'.repeat(64)}),/CMS changed/);assert.deepEqual(await inspectGrowthLaunch(pg),before);
 const dry=await applyGrowthLaunch(pg,{expectedStateHash:before.stateHash,dryRun:true});assert.equal(dry.verification.mode,'ON');assert.deepEqual(await inspectGrowthLaunch(pg),before);
 const live=await applyGrowthLaunch(pg,{expectedStateHash:before.stateHash});assert.equal(live.replayed,false);assert.equal(live.verification.growthRows,0);
 const again=await applyGrowthLaunch(pg,{expectedStateHash:before.stateHash});assert.equal(again.replayed,true);assert.deepEqual(again.receipt,live.receipt);
 assert.equal(Number((await pg.query('SELECT COUNT(*) AS n FROM admin_logs')).rows[0].n),1);
 const modified={...live.receipt.policyAfter,revision:2,mode:'OFF'};await pg.query('UPDATE app_meta SET value=$2 WHERE key=$1',[MERCENARY_LEVEL_KEY,JSON.stringify(modified)]);
 await assert.rejects(()=>applyGrowthLaunch(pg,{expectedStateHash:before.stateHash}),/CMS changed since launch/);
 assert.deepEqual((await inspectGrowthLaunch(pg)).policy,modified);
 assert.equal((await pg.query('SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
});

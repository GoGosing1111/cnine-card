import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaFixture} from './helpers/awakened-omega-craft-fixture.mjs';
import {AWAKENED_OMEGA_CRAFT as C,mercenaryCraftDefinition,validateMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {awakenedOmegaPityKey} from '../functions/_workshop_awakened_omega.js';
import {saveMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__workshopCraftTest,handleWorkshop} from '../functions/_workshop.js';
import {draft,apply,inspect,verify,hash,protectedState,OP} from '../scripts/ops/awakened-omega-craft-20261029.mjs';

test('approved recipe is fixed, card input cannot enter ordinary inventory crafting',()=>{
 const d=mercenaryCraftDefinition(C.recipeCode);assert.equal(d.limit,null);assert.equal(d.code,'V-972');assert.equal(d.power,2200000);
 for(const change of [{coinCost:1},{masterStarCost:1},{successRate:100},{pityAfter:9},{materials:[{itemCode:C.materialCode,quantity:49}]}])assert.throws(()=>validateMercenaryCraft({...draft(),...change},d));
 assert.throws(()=>validateMercenaryCraft(draft(),mercenaryCraftDefinition('WORKSHOP_JOKRO')),/전용/);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: ten failures then eleventh guaranteed; persisted account pity and replay charge once`,async t=>{
 const f=await omegaFixture(t,postgres),before=await f.coin();
 for(let i=1;i<=10;i++){
  const r=await f.omegaCraft('fail-'+i,()=>1000);assert.equal(r.success,false);assert.equal(r.pity.failures,i);assert.equal(r.guaranteed,false);assert.equal(r.pity.guaranteed,i===10);assert.equal(r.coinSpent,C.coinCost);
  assert.equal((await f.omegaState()).failures,i);assert.equal((await f.omegaState({id:8})).failures,0);
  assert.equal((await f.omegaCraft('fail-'+i,()=>{throw Error('reroll')})).replayed,true);
 }
 assert.equal(await f.copies(),500);assert.equal(await f.coin(),before-C.coinCost*10);
 await saveMercenaryCraft(f.env,f.user,{...draft(),craftRevision:1});assert.equal((await f.omegaState()).failures,10);
 const r=await f.omegaCraft('eleventh',()=>{throw Error('guarantee must not roll')});assert.equal(r.success,true);assert.equal(r.guaranteed,true);assert.equal(r.pity.failures,0);assert.equal(await f.copies('V-972'),1);assert.equal(await f.copies(),450);assert.equal(await f.coin(),before-C.coinCost*11);
 assert.equal((await f.omegaCraft('eleventh')).replayed,true);assert.equal(await f.copies('V-972'),1);
 const regular=await f.omegaCraft('regular-success',()=>999);assert.equal(regular.success,true);assert.equal(regular.guaranteed,false);assert.equal(await f.copies('V-972'),2);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM inventory_logs WHERE reason='WORKSHOP_AWAKENED_OMEGA'").first()).n),0);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM workshop_craft_logs_v1668 WHERE recipe_id=?",f.omegaId).first()).n),12);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: exactly fifty copies work, active formations protected, saved growth unchanged`,async t=>{
 const f=await omegaFixture(t,postgres),growth={...await f.p("SELECT * FROM user_mercenary_levels_v1 WHERE user_id=7 AND mercenary_code='V-021'").first()};
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=50,duplicate_count=49 WHERE user_id=7 AND mercenary_code='V-021'").run();
 await f.p("INSERT INTO user_mercenary_loadout_v1 VALUES(7,'V-021',1,'2026-10-29')").run();
 await assert.rejects(f.omegaCraft('equipped'),/편성/);assert.match((await f.omegaState()).blockedReason,/편성/);
 await f.p('UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=2 WHERE user_id=7').run();await f.setting('mercenary_pvp_loadout_v1:7',{mercenaryCode:'V-021',revision:2});await assert.rejects(f.omegaCraft('pvp-equipped'),/편성/);
 await f.setting('mercenary_pvp_loadout_v1:7',{mercenaryCode:null,revision:3});
 const r=await f.omegaCraft('last-fifty',()=>0);assert.equal(r.success,true);assert.equal(await f.copies(),0);assert.equal(await f.copies('V-972'),1);assert.deepEqual({...await f.p("SELECT * FROM user_mercenary_levels_v1 WHERE user_id=7 AND mercenary_code='V-021'").first()},growth);
 assert.equal((await f.omegaCraft('last-fifty')).replayed,true);await assert.rejects(f.omegaCraft('empty'),/50장/);
});
test('invalid costs, batch, insufficient currency/cards, locked recipe and generic-route bypass never charge',async t=>{
 const f=await omegaFixture(t),before=await f.coin();
 await assert.rejects(f.omegaCraft('batch',()=>0,f.user,{attempts:2}),/1회/);
 await assert.rejects(f.omegaCraft('stars',()=>0,f.user,{paymentType:'MASTER_STAR'}),/1회/);
 await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{recipeId:f.omegaId,requestId:'qa-generic-omega-bypass',paymentType:'BOTH'}),/전용/);
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=49,duplicate_count=48 WHERE user_id=7 AND mercenary_code='V-021'").run();await assert.rejects(f.omegaCraft('short'),/50장/);assert.equal(await f.coin(),before);
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=100,duplicate_count=99 WHERE user_id=7 AND mercenary_code='V-021'").run();await f.p('UPDATE users SET coin=? WHERE id=7',C.coinCost-1).run();await assert.rejects(f.omegaCraft('poor'),/100조/);
 await f.p('UPDATE users SET coin=? WHERE id=7',before).run();await saveMercenaryCraft(f.env,f.user,{...draft(),craftRevision:1,isActive:false});await assert.rejects(f.omegaCraft('off'),/잠겨/);
 assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',awakenedOmegaPityKey(7)).first()),null);assert.equal(await f.coin(),before);assert.equal(await f.copies('V-972'),0);
});
test('PostgreSQL: failure at final receipt rolls everything back; retry preserves the saved roll',async t=>{
 const f=await omegaFixture(t,true),before=await f.coin();let rolls=0;
 f.fail('INSERT INTO workshop_craft_receipts_v1668');await assert.rejects(f.omegaCraft('rollback',()=>{rolls++;return 999;}),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),before);assert.equal(await f.copies(),1000);assert.equal(await f.copies('V-972'),0);assert.equal((await f.omegaState()).failures,0);
 assert.equal((await f.omegaCraft('rollback',()=>{rolls++;return 9999;})).success,true);assert.equal(rolls,1);assert.equal(await f.copies(),950);assert.equal(await f.copies('V-972'),1);
});
test('lost commit acknowledgement, duplicate and competing requests preserve one grant and atomic pity',async t=>{
 const f=await omegaFixture(t);f.DB.afterCommit=()=>{throw Error('ACK_LOST');};assert.equal((await f.omegaCraft('ack',()=>0)).success,true);f.DB.afterCommit=null;
 assert.equal((await f.omegaCraft('ack')).replayed,true);assert.equal(await f.copies('V-972'),1);
 await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=50,duplicate_count=49 WHERE user_id=7 AND mercenary_code='V-021'").run();await f.setting(awakenedOmegaPityKey(7),{failures:10,revision:1});
 const result=await Promise.allSettled([f.omegaCraft('race-a'),f.omegaCraft('race-b')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(await f.copies('V-972'),2);assert.equal((await f.omegaState()).failures,0);
});
test('stale prepared plans cancel after ownership or policy changes without costs, grants or pity writes',async t=>{
 const f=await omegaFixture(t),before=await f.coin();f.fail('INSERT INTO workshop_craft_receipts_v1668');await assert.rejects(f.omegaCraft('stale-output',()=>0),/INJECTED/);f.fail('');
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(7,'V-972',1,0,'2026-10-29','2026-10-29')").run();await assert.rejects(f.omegaCraft('stale-output'),/보유 수량/);
 assert.equal((await f.p("SELECT status FROM joint_operations_v1 WHERE request_id='qa-omega-craft-stale-output'").first()).status,'CANCELLED');
 f.fail('INSERT INTO workshop_craft_receipts_v1668');await assert.rejects(f.omegaCraft('stale-policy'),/INJECTED/);f.fail('');await saveMercenaryCraft(f.env,f.user,{...draft(),craftRevision:1,isActive:false});await assert.rejects(f.omegaCraft('stale-policy'),/설정/);
 assert.equal(await f.coin(),before);assert.equal(await f.copies(),1000);assert.equal(await f.copies('V-972'),1);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',awakenedOmegaPityKey(7)).first(),null);
});
test('route requires authentication and account lock, rejects invalid request IDs before charging',async t=>{
 const f=await omegaFixture(t),request=token=>new Request('https://local/api/workshop/awakened-omega-craft',{method:'POST',headers:{origin:'https://local','content-type':'application/json',...(token?{authorization:token}:{})},body:JSON.stringify({requestId:'bad',recipeId:f.omegaId})});
 const call=(req,deps=f.deps)=>handleWorkshop({path:'workshop/awakened-omega-craft',request:req,env:f.env,deps});
 assert.equal((await call(request())).status,401);assert.equal((await call(request('Bearer local-account-7'),{...f.deps,withUserMutationLock:null})).status,503);assert.equal((await call(request('Bearer local-account-7'))).status,400);assert.equal(await f.copies(),1000);
});
test('registration preserves all existing crafts, rolls back, validates stale state and replays SELECT-only',async t=>{
 const f=await omegaFixture(t,true,{register:false});await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const before=await inspect(f.pg),expectedHash=hash(before),releaseCommit='a'.repeat(40),protectedBefore=await protectedState(f.pg);
 await assert.rejects(apply(f.pg,{expectedHash:'stale',releaseCommit}),/changed/);await assert.rejects(apply(f.pg,{expectedHash,releaseCommit,failAfter:1}),/INJECTED_OMEGA/);assert.deepEqual(await inspect(f.pg),before);
 assert((await apply(f.pg,{expectedHash,releaseCommit})).rolledBack);assert.deepEqual(await inspect(f.pg),before);
 await f.pg.exec("ALTER TABLE app_meta ADD CONSTRAINT reject_omega_receipt CHECK(key<>'"+OP+"')");await assert.rejects(apply(f.pg,{expectedHash,releaseCommit,dryRun:false}));await f.pg.exec('ALTER TABLE app_meta DROP CONSTRAINT reject_omega_receipt');assert.deepEqual(await inspect(f.pg),before);
 assert((await apply(f.pg,{expectedHash,releaseCommit,dryRun:false})).committed);assert((await verify(f.pg)).verified);assert.deepEqual(await protectedState(f.pg),protectedBefore);assert.equal(await f.copies(),1000);
 assert((await apply({query(sql,args){assert.match(sql,/^SELECT/);return f.pg.query(sql,args);}})).replayed);
});

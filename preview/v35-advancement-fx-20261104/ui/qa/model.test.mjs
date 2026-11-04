import test from 'node:test';import assert from 'node:assert/strict';
import {POLICY,amount,formatAmount,eligibility,quote} from '../model.mjs';
import {createFixtureAdapter,initialSnapshot} from '../fixture-adapter.mjs';
import {attachAdvancementEntry} from '../entry.mjs';
const request=(id,role='vanguard',revision=0)=>({idempotencyKey:id,mercenaryCode:'V-996',advancementId:role,expectedRevision:revision,expectedPolicyRevision:POLICY.revision});
test('host entry is disabled by default and never accesses the DOM or account',()=>{const entry=attachAdvancementEntry();assert.equal(entry.enabled,false);entry.destroy();});
test('eligibility is the owned mercenary rank and level, including Limited',()=>{
 const s=initialSnapshot();assert.equal(eligibility(s.cards[0]),'');assert.equal(eligibility(s.cards[1]),'');assert.match(eligibility(s.cards[2]),/16레벨/);assert.match(eligibility(s.cards[3]),/SS급/);assert.match(eligibility({...s.cards[0],totalCopies:0}),/보유/);
});
test('currency arithmetic retains precision beyond JavaScript safe integers',()=>{
 assert.equal(amount('900719925474099312345')-amount(POLICY.cost.coin),900719915474099312345n);
 assert.equal(formatAmount('10000000000000'),'10조');assert.equal(formatAmount('50000000'),'5,000만');assert.throws(()=>amount(1e13));assert.throws(()=>amount('-1'));
});
test('first and change spend both currencies and preserve growth, gear, copies',async()=>{
 const adapter=createFixtureAdapter(),before=await adapter.read();let result=await adapter.commit(request('first'));
 assert.deepEqual(result.snapshot.wallet,{coin:'25000000000000',MASTER_STAR:'70000000'});
 result=await adapter.commit(request('change','commander',1));assert.deepEqual(result.snapshot.wallet,{coin:'15000000000000',MASTER_STAR:'20000000'});
 for(const key of ['growth','equipment','totalCopies'])assert.deepEqual(result.snapshot.cards[0][key],before.cards[0][key]);
 assert.equal(result.snapshot.cards[0].advancement.id,'commander');assert.equal(adapter.audit().commits,2);
});
test('same class and insufficient either currency never spend',async()=>{
 const adapter=createFixtureAdapter();await adapter.commit(request('first'));
 await assert.rejects(adapter.commit(request('same','vanguard',1)),/이미/);adapter.setWallet({MASTER_STAR:'49999999'});
 const before=await adapter.read();assert.equal(quote(before,'V-996','healer').missing.MASTER_STAR,1n);
 await assert.rejects(adapter.commit(request('short','healer',before.revision)),/부족/);assert.deepEqual(await adapter.read(),before);
 adapter.setWallet({coin:'9999999999999',MASTER_STAR:'50000000'});const b=await adapter.read();assert.equal(quote(b,'V-996','healer').missing.coin,1n);
 await assert.rejects(adapter.commit(request('coinshort','healer',b.revision)),/부족/);assert.deepEqual(await adapter.read(),b);
});
test('duplicate requests coalesce and lost responses return the original receipt',async()=>{
 const adapter=createFixtureAdapter();adapter.setFault('lost-response');const r=request('recover');await assert.rejects(adapter.commit(r),/확인/);
 const [a,b]=await Promise.all([adapter.commit(r),adapter.commit(r)]);assert.deepEqual(a,b);assert.equal(adapter.audit().commits,1);assert.equal(adapter.audit().receipts,1);
 await assert.rejects(adapter.commit({...r,advancementId:'healer'}),/일치/);
});
test('concurrent distinct requests cannot both spend a stale snapshot',async()=>{
 const adapter=createFixtureAdapter(),results=await Promise.allSettled([adapter.commit(request('a')),adapter.commit(request('b','healer'))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(adapter.audit().commits,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/변경/);
});
test('a definitive failure is atomic and a fresh retry can succeed',async()=>{
 const adapter=createFixtureAdapter(),before=await adapter.read();adapter.setFault('reject');await assert.rejects(adapter.commit(request('fail')),/소모하지/);assert.deepEqual(await adapter.read(),before);await adapter.commit(request('retry'));assert.equal(adapter.audit().commits,1);
});

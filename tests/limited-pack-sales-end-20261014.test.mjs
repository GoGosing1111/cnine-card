import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {createLimitedPackService,handleLimitedPack,readLimitedPackState} from '../functions/_mercenary_limited_pack.js';
import {LIMITED_PACK} from '../shared/mercenary-limited-pack-v1.mjs';
import {endLimitedSales,limitedSalesState} from '../scripts/ops/limited-pack-sales-end-20261014.mjs';

test('ending only the limited mercenary pack blocks fresh and pending purchases while preserving Hyper and paid receipts',async t=>{
 const f=await limitedFixture(t);await f.configure();
 await f.pg.exec("ALTER TABLE users ADD COLUMN nickname text;ALTER TABLE users ADD COLUMN role text;ALTER TABLE users ADD COLUMN status text;ALTER TABLE app_meta ADD COLUMN updated_at text;UPDATE users SET nickname='핑크빛유두',role='OWNER',status='ACTIVE' WHERE id=1;");
 await f.setting('hyper_pack_opening_v2093',{revision:1,mode:'ON'});
 const service=createLimitedPackService({randomInt:()=>0}),state=await readLimitedPackState(f.env);
 const body=()=>({requestId:crypto.randomUUID(),count:1,expectedRevision:state.packRevision,expectedPolicyRevision:state.revision});
 const paid=body();await service.open(f.env,f.user,paid);
 const pending=body();f.fail('INSERT INTO coin_logs');await assert.rejects(service.open(f.env,f.user,pending));f.fail('');
 const coin=await f.coin(),stock=structuredClone((await limitedSalesState(f.pg)).stock),before=await limitedSalesState(f.pg);
 assert.equal((await endLimitedSales(f.pg,{dryRun:true})).dryRun,true);assert.deepEqual(await limitedSalesState(f.pg),before);
 const failed={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED_AUDIT_FAILURE');return f.pg.query(sql,args);}};
 await assert.rejects(endLimitedSales(failed),/INJECTED_AUDIT_FAILURE/);assert.deepEqual(await limitedSalesState(f.pg),before);
 const done=await endLimitedSales(f.pg);assert.equal(done.receipt.hyperMode,'ON');assert.equal(done.receipt.modeAfter,'OFF');
 assert.equal((await endLimitedSales(f.pg)).replayed,true);assert.equal((await readLimitedPackState(f.env)).userOpeningEnabled,false);
 for(const role of ['USER','OWNER']){
  const response=await handleLimitedPack({path:LIMITED_PACK.openPath,env:f.env,request:new Request('https://game.test/api/'+LIMITED_PACK.openPath,{method:'POST',headers:{'content-type':'application/json',origin:'https://game.test'},body:JSON.stringify(body())}),
   deps:{authenticate:async()=>({...f.user,role}),json:(value,status=200)=>Response.json(value,{status}),withUserMutationLock:async(_env,_id,_path,work)=>work()}});
  assert.equal(response.status,409);assert.equal((await response.json()).code,'MERCENARY_LIMITED_DISABLED');
 }
 await assert.rejects(service.open(f.env,f.user,pending),error=>error.code==='MERCENARY_LIMITED_POLICY_CHANGED');
 assert.equal((await service.receipt(f.env,f.user,paid.requestId)).status,'COMPLETED');
 assert.equal((await service.open(f.env,f.user,paid)).replayed,true);
 assert.equal(await f.coin(),coin);assert.deepEqual((await limitedSalesState(f.pg)).stock,stock);
 assert.equal(JSON.parse((await limitedSalesState(f.pg)).hyper).mode,'ON');
});

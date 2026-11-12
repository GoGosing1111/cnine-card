import test from 'node:test';
import assert from 'node:assert/strict';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {addApplicationFixture} from './helpers/supporter-application-fixture.mjs';

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' 1개월차 판매만 종료하고 기간·보상·2개월차 구매를 유지한다',async t=>{
  const f=await addApplicationFixture(await passFixture({postgres}),{postgres});t.after(()=>f.close());
  const uuid=()=>crypto.randomUUID(),info=async user=>(await f.call('server-support/info',{user})).body;
  const config=body=>f.call('admin/server-support/application',{body});
  const grant=(userId,expectedRevision,month)=>({userId,action:'GRANT',note:'격리 구매 확인',expectedRevision,requestId:uuid(),...(month?{month}:{})});
  const approve=body=>f.call('admin/server-support',{body});
  const doc=f.document([{code:'COIN:',quantity:7}]);await f.save(doc);
  assert.equal((await f.call('admin/server-support/pass',{body:{month:2,document:doc,expectedRevision:0,requestId:uuid()}})).status,200);
  assert.equal((await f.setting(true)).status,200);
  const issued=uuid();assert.equal((await f.issue(2,issued)).status,200);
  const first=grant(2,0);assert.equal((await approve(first)).status,200);
  const before=await info(2),setting={enabled:true,firstMonthSalesOpen:false,expectedRevision:1,requestId:uuid()};
  assert.equal((await config(setting)).body.config.firstMonthSalesOpen,false);
  assert.equal((await config(setting)).body.replayed,true);
  assert.equal((await config({...setting,firstMonthSalesOpen:true})).status,409);
  const closed=await info(3);assert.equal(closed.seasonPass.saleClosed,true);assert.equal(closed.application.enabled,true);
  assert.equal(closed.secondSeasonPass.canRequestPurchase,true);
  const n=async sql=>Number((await f.one(sql)).n);
  const counts=async()=>Promise.all(['SELECT COUNT(*) n FROM user_messages','SELECT COUNT(*) n FROM app_meta','SELECT COUNT(*) n FROM admin_logs'].map(n));
  const untouched=await counts();
  for(const month of [undefined,1]){
    for(const user of [2,3]){
      assert.equal((await f.issue(user,uuid(),month?{month}:{})).body.code,'SUPPORT_APPLICATION_MONTH1_CLOSED');
      assert.equal((await approve(grant(user,user===2?1:0,month))).body.code,'SUPPORT_APPLICATION_MONTH1_CLOSED');
    }
  }
  assert.equal((await approve(first)).body.replayed,true);
  assert.equal((await f.issue(2,issued)).body.replayed,true);
  assert.deepEqual(await counts(),untouched);
  assert.equal((await info(2)).seasonPass.expiresAt,before.seasonPass.expiresAt);
  assert.equal((await f.claim(null,2)).status,200);
  assert.equal((await f.setting(true,2)).body.config.firstMonthSalesOpen,false,'legacy settings preserve month-one closure');
  assert.equal((await f.call('admin/server-support/preview',{body:{recipientType:'ID',recipient:'3'}})).body.firstMonthSalesOpen,false);
  assert.equal((await f.issue(3,uuid(),{month:2})).status,200);
  assert.equal((await f.call('server-support/pass/purchase-request',{user:3,body:{requestId:uuid()}})).status,200);
  assert.equal((await approve(grant(3,0,2))).status,200);
  assert.equal((await info(3)).secondSeasonPass.active,true);
});

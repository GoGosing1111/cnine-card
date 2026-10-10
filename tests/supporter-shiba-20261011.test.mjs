import test from 'node:test';
import assert from 'node:assert/strict';
import {supportFixture} from './helpers/server-support-fixture.mjs';
import {readPetCollection} from '../functions/_pet_account.js';
import {readSupportRecord} from '../functions/_supporter_benefits.js';
import {SUPPORTER_PET_CODE as SHIBA} from '../functions/_supporter_pet_reward.js';
import {backfillSupporterPet,backfillKey} from '../scripts/ops/supporter-shiba-20261011.mjs';
import {emptySupport,supportKey} from '../shared/server-support-v1.mjs';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';

const admin={id:1,role:'OWNER'};
const body=(userId=2,expectedRevision=0,action='GRANT')=>({userId,expectedRevision,action,note:'후원 활성화 시바견 검수',requestId:crypto.randomUUID()});
const collection=async(f,id=2)=>(await readPetCollection(f.env,id)).state;
const subscription=async(f,id=2)=>(await readSupportRecord(f.env,id)).state;
const save=async(f,key,value)=>f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
const support=async(f,id,patch={})=>save(f,supportKey(id),{...emptySupport(),revision:1,startsAt:f.clock.now-1000,endsAt:f.clock.now+86400000,...patch});
const logs=async f=>f.all("SELECT after_data FROM admin_logs WHERE action_type='PET_GRANT'");
const mutateBeforeBatch=(f,work)=>{const original=f.DB.batch.bind(f.DB);f.DB.batch=async statements=>{f.DB.batch=original;await work();return original(statements);};};

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': 활성화 보상은 1마리, 동일 요청·기간 연장·보유자는 중복 지급하지 않는다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  const before=await collection(f),loadout=await f.one('SELECT value FROM app_meta WHERE key=?','pet_loadout_v1:2');
  const potentials={revision:4,pets:{[SHIBA]:{potential:'MAGNET',attempts:6}}};await save(f,'pet_potentials_v1:2',potentials);
  const grant=body(),first=await f.call('admin/server-support',{body:grant});
  assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.petReward.pet.code,SHIBA);assert.equal(first.body.petReward.quantity,1);
  assert.deepEqual(await collection(f),{...before,revision:before.revision+1,pets:{...before.pets,[SHIBA]:1}});
  assert.equal((await f.call('admin/server-support',{body:grant})).body.replayed,true);
  const renewal=await f.call('admin/server-support',{body:body(2,1)});assert.equal(renewal.status,200);assert.deepEqual(renewal.body.petReward,{petCode:SHIBA,quantity:0,alreadyOwned:true});
  assert.equal((await collection(f)).revision,before.revision+1);assert.equal((await logs(f)).length,1);
  assert.deepEqual(await f.one('SELECT value FROM app_meta WHERE key=?','pet_loadout_v1:2'),loadout);
  assert.deepEqual(JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?','pet_potentials_v1:2')).value),potentials);
  const page=await f.call('server-support/info',{user:2});assert.ok(page.body.pets.some(p=>p.code===SHIBA));
  const owned={revision:9,pets:{[SHIBA]:5,[f.pets[0].code]:2},extra:'preserve'};await save(f,'pet_collection_v1:3',owned);
  assert.equal((await f.call('admin/server-support',{body:body(3)})).status,200);assert.deepEqual(await collection(f,3),owned);
  assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234);
 });

 test(label+': 펫 보유 기록이 없어도 생성하고 중지·만료 시 펫을 회수하지 않는다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  const first=await f.call('admin/server-support',{body:body(3)});assert.equal(first.status,200);
  assert.deepEqual(await collection(f,3),{revision:1,pets:{[SHIBA]:1}});
  const revoked=await f.call('admin/server-support',{body:body(3,1,'REVOKE')});assert.equal(revoked.status,200);assert.equal(revoked.body.petReward,undefined);
  assert.deepEqual(await collection(f,3),{revision:1,pets:{[SHIBA]:1}});
  assert.equal((await f.call('admin/server-support',{body:body(3,2)})).body.petReward.quantity,0);
  f.clock.now=(await subscription(f,3)).endsAt;assert.equal((await f.call('server-support/info',{user:3})).body.subscription.active,false);
  assert.equal((await collection(f,3)).pets[SHIBA],1);assert.equal((await logs(f)).length,1);
 });

 test(label+': 영수증 실패는 후원 기간·펫·감사 전체 롤백, 재시도는 한 번만 지급',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());await save(f,supportKey(2),emptySupport());const before=await collection(f),sub=await subscription(f),grant=body();
  f.fail('INSERT INTO app_meta(key,value,updated_at)');
  assert.equal((await f.call('admin/server-support',{body:grant})).status,503);f.fail('');
  assert.deepEqual(await collection(f),before);assert.deepEqual(await subscription(f),sub);assert.equal((await logs(f)).length,0);
  assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?','server_support_receipt_v1:'+grant.requestId),null);
  assert.equal((await f.call('admin/server-support',{body:grant})).status,200);assert.equal((await f.call('admin/server-support',{body:grant})).body.replayed,true);
  assert.equal((await collection(f)).pets[SHIBA],1);assert.equal((await logs(f)).length,1);
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n),0);
 });

 test(label+': 동시 펫 변경을 덮어쓰지 않고 활성화 전체를 취소한다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());const before=await collection(f),sub=await subscription(f);
  const competing={...before,revision:before.revision+1,pets:{...before.pets,[SHIBA]:3}};
  mutateBeforeBatch(f,()=>save(f,'pet_collection_v1:2',competing));const grant=body();
  assert.equal((await f.call('admin/server-support',{body:grant})).status,503);
  assert.deepEqual(await collection(f),competing);assert.deepEqual(await subscription(f),sub);assert.equal((await logs(f)).length,0);
  assert.equal((await f.call('admin/server-support',{body:grant})).body.petReward.quantity,0);assert.deepEqual(await collection(f),competing);
 });

 test(label+': 펫 설정 누락 및 자격·권한 거부는 후원/보유권을 생성하지 않는다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  for(const userId of [4,5,6])assert.equal((await f.call('admin/server-support',{body:body(userId)})).status,403);
  assert.equal((await f.call('admin/server-support',{user:3,body:body()})).status,403);
  const cms=JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?',PET_CMS_KEY)).value);cms.document.pets=cms.document.pets.filter(p=>p.code!==SHIBA);await save(f,PET_CMS_KEY,cms);
  const r=await f.call('admin/server-support',{body:body()});assert.equal(r.status,503);assert.equal(r.body.code,'SUPPORT_PET_UNAVAILABLE');
  assert.equal((await subscription(f)).revision,0);assert.equal((await collection(f)).pets[SHIBA],undefined);assert.equal((await logs(f)).length,0);
 });

 test(label+': 기존 활성 후원자만 소급하고 보유자·만료·중지·예약 계정은 제외한다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  await support(f,1);await support(f,2);await support(f,3,{endsAt:f.clock.now});await support(f,4,{revokedAt:f.clock.now});await support(f,5,{startsAt:f.clock.now+1000});
  const existing={revision:2,pets:{[SHIBA]:2,[f.pets[0].code]:7}};await save(f,'pet_collection_v1:1',existing);
  const before=await collection(f),sub=await subscription(f);
  assert.equal((await backfillSupporterPet(f.env,admin,1,f.clock.now)).status,'ALREADY_OWNED');assert.deepEqual(await collection(f,1),existing);
  const first=await backfillSupporterPet(f.env,admin,2,f.clock.now);assert.equal(first.quantity,1);assert.equal(first.status,'GRANTED');
  const replay=await backfillSupporterPet(f.env,admin,2,f.clock.now);assert.deepEqual(replay,{...first,replayed:true});
  for(const id of [3,4,5,6])assert.equal((await backfillSupporterPet(f.env,admin,id,f.clock.now)).status,'INACTIVE');
  assert.deepEqual(await collection(f),{...before,revision:before.revision+1,pets:{...before.pets,[SHIBA]:1}});assert.deepEqual(await subscription(f),sub);
  assert.equal((await logs(f)).length,1);assert.equal((await f.all("SELECT key FROM app_meta WHERE key LIKE 'supporter_pet_backfill_v1:%'")).length,1);
  await assert.rejects(()=>backfillSupporterPet(f.env,{id:3,role:'OWNER'},2,f.clock.now));
 });

 test(label+': 소급 영수증 실패·후원 동시 중지는 펫 지급도 롤백한다',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());await support(f,2);const before=await collection(f),sub=await subscription(f);
  f.fail('INSERT INTO app_meta(key,value,updated_at)');
  await assert.rejects(()=>backfillSupporterPet(f.env,admin,2,f.clock.now));f.fail('');
  assert.deepEqual(await collection(f),before);assert.deepEqual(await subscription(f),sub);assert.equal((await logs(f)).length,0);
  assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',backfillKey(2)),null);
  mutateBeforeBatch(f,()=>save(f,supportKey(2),{...sub,revision:sub.revision+1,revokedAt:f.clock.now}));
  await assert.rejects(()=>backfillSupporterPet(f.env,admin,2,f.clock.now));assert.deepEqual(await collection(f),before);
  assert.equal((await backfillSupporterPet(f.env,admin,2,f.clock.now)).status,'INACTIVE');assert.equal((await logs(f)).length,0);
  await support(f,2);assert.equal((await backfillSupporterPet(f.env,admin,2,f.clock.now)).status,'GRANTED');
 });
}

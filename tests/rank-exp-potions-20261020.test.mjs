import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {RANK_POTIONS,nextRankPotion,rankPotionState,RANK_POTION_DURATION_MS as HOUR} from '../shared/rank-exp-potion-v1.mjs';
import {potionFixture} from './helpers/rank-exp-potion-fixture.mjs';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {useRankExpPotion,readRankExpPotion,rankPotionOptions,rankPotionReceipt,rankPotionKey,handleRankExpPotion} from '../functions/_rank_exp_potion.js';
import {accountRankAward,readAccountRank,MAX_RANK_TICKS} from '../functions/_account_rank.js';
import {ensureJointTransactionSchema} from '../functions/_joint_transactions.js';
import {registerRankPotions,OPERATION_KEY} from '../scripts/ops/rank-exp-potions-20261020.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const request=(multiplier=2,revision=0)=>({requestId:crypto.randomUUID(),itemCode:'RANK_EXP_POTION_'+multiplier+'X_60M',version:1,expectedRevision:revision});
const epoch=Date.parse('2026-10-20T01:00:00Z');

test('bounded delivery retains runtime potion art and keeps only its authoring sources in Git',()=>{
 const root='assets/items/rank-exp-potions-20261020/';
 for(const file of ['2x.webp','3x.webp','panel.webp'])assert.equal(isProductionFile(root+file),true);
 for(const file of ['2x-source.png','3x-source.png','panel-source.png','prompts.json','manifest.json'])assert.equal(isProductionFile(root+file),false);
 assert.equal(isProductionFile('docs/rank-exp-potions-20261020.md'),false);
 for(const file of ['docs/cooperative-energy-entry-20261020-release.json','docs/support-package-20261020-catalog.json','docs/support-package-20261020-release.json'])assert.equal(isProductionFile(file),false);
 for(const file of ['js/rank-exp-potion-v1.mjs','shared/rank-exp-potion-v1.mjs','css/rank-exp-potion-v1.css','assets/items/icon-card-choice-20261020/ticket.webp'])assert.equal(isProductionFile(file),true);
});

test('60 minutes, extension, replacement in both directions, exact expiry and malformed/future state',()=>{
 const one=nextRankPotion(null,2,epoch);assert.equal(Date.parse(one.expiresAt),epoch+HOUR);assert.equal(one.action,'START');
 const extended=nextRankPotion(one,2,epoch+20*60000);assert.equal(Date.parse(extended.expiresAt),epoch+2*HOUR);assert.equal(extended.startedAt,one.startedAt);
 const three=nextRankPotion(extended,3,epoch+30*60000);assert.equal(Date.parse(three.expiresAt),epoch+90*60000);assert.equal(three.action,'REPLACE');assert.equal(three.multiplier,3);
 const two=nextRankPotion(three,2,epoch+40*60000);assert.equal(Date.parse(two.expiresAt),epoch+100*60000);assert.equal(two.action,'REPLACE');assert.equal(two.multiplier,2);
 assert.equal(rankPotionState(one,epoch+HOUR-1).active,true);assert.equal(rankPotionState(one,epoch+HOUR).active,false);
 assert.equal(nextRankPotion(one,2,epoch+HOUR).action,'START');assert.equal(rankPotionState(one,epoch-1).active,false);
 for(const bad of [null,{...one,multiplier:6},{...one,expiresAt:'bad'},{...one,revision:1.5}])assert.equal(rankPotionState(bad,epoch).active,false);
});
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': consume, extend, replace, stale confirmation, ownership and replay',async t=>{
  const f=await potionFixture(t,{postgres});let now=epoch;t.mock.method(Date,'now',()=>now);
  const initial=await rankPotionOptions(f.env,f.user);assert.equal(initial.buff.active,false);assert.deepEqual(initial.items.map(x=>x.quantity),[5,5]);
  const firstRequest=request(),first=await useRankExpPotion(f.env,f.user,firstRequest);
  assert.equal(first.buff.multiplier,2);assert.equal(first.buff.remainingSeconds,3600);assert.equal(await f.stock(2),4);
  now+=20*60000;const extended=await useRankExpPotion(f.env,f.user,request(2,1));assert.equal(extended.applied.action,'EXTEND');assert.equal(extended.buff.remainingSeconds,6000);
  await assert.rejects(()=>useRankExpPotion(f.env,f.user,request(3,1)),{code:'RANK_POTION_CHANGED'});assert.equal(await f.stock(3),5);
  const replaced=await useRankExpPotion(f.env,f.user,request(3,2));assert.equal(replaced.applied.action,'REPLACE');assert.equal(replaced.buff.remainingSeconds,3600);assert.equal(replaced.buff.multiplier,3);
  now+=10*60000;const lower=await useRankExpPotion(f.env,f.user,request(2,3));assert.equal(lower.applied.action,'REPLACE');assert.equal(lower.buff.remainingSeconds,3600);
  const replay=await useRankExpPotion(f.env,f.user,firstRequest);assert.equal(replay.replayed,true);assert.deepEqual(replay.applied,first.applied);assert.equal(replay.buff.revision,4);assert.equal(await f.stock(2),2);
  await assert.rejects(()=>rankPotionReceipt(f.env,{id:8},firstRequest.requestId),{code:'JOINT_NOT_FOUND'});
  await assert.rejects(()=>useRankExpPotion(f.env,f.user,{...firstRequest,itemCode:RANK_POTIONS[1].code}),{code:'JOINT_REQUEST_CONFLICT'});
  assert.equal((await readRankExpPotion(f.env,8)).active,false);assert.equal(await f.coin(),10000000);
  now=Date.parse(lower.buff.expiresAt);assert.equal((await readRankExpPotion(f.env,7)).active,false);
  const restarted=await useRankExpPotion(f.env,f.user,request(3,4));assert.equal(restarted.applied.action,'START');assert.equal(restarted.buff.remainingSeconds,3600);
 });
 test(label+': rollback, delayed recovery starts a full hour, disabled stock and superseded plans',async t=>{
  const f=await potionFixture(t,{postgres});let now=epoch;t.mock.method(Date,'now',()=>now);const r=request();
  f.fail('UPDATE joint_operations_v1 SET plan_json');await assert.rejects(()=>useRankExpPotion(f.env,f.user,r));f.fail('');
  assert.equal(await f.stock(2),5);assert.equal((await readRankExpPotion(f.env,7)).active,false);assert.equal((await rankPotionReceipt(f.env,f.user,r.requestId)).status,'PENDING');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n),0);
  await assert.rejects(()=>useRankExpPotion(f.env,f.user,request(3)),{code:'RANK_POTION_PENDING'});
  now+=2*HOUR;await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',r.itemCode).run();
  await assert.rejects(()=>useRankExpPotion(f.env,f.user,r));assert.equal(await f.stock(2),5);
  await f.p('UPDATE inventory_items SET is_active=1 WHERE code=?',r.itemCode).run();
  const result=await useRankExpPotion(f.env,f.user,r);assert.equal(result.buff.remainingSeconds,3600);assert.equal(Date.parse(result.applied.startedAt),now);
  const next=request(3,1);f.fail('UPDATE joint_operations_v1 SET plan_json');await assert.rejects(()=>useRankExpPotion(f.env,f.user,next));f.fail('');
  await f.setting(rankPotionKey(7),nextRankPotion(result.applied,2,now));await assert.rejects(()=>useRankExpPotion(f.env,f.user,next),{code:'RANK_POTION_CHANGED'});assert.equal(await f.stock(3),5);
  await assert.rejects(()=>rankPotionReceipt(f.env,f.user,next.requestId),{code:'JOINT_OPERATION_SUPERSEDED'});
 });
 test(label+': all existing rank sources multiply once, expire precisely and preserve level cap',async t=>{
  const f=await potionFixture(t,{postgres});let now=epoch;t.mock.method(Date,'now',()=>now);
  await useRankExpPotion(f.env,f.user,request(3));
  const sources={HUNT:8,APOCALYPSE:24,RAID:20,ESCORT:30,SIEGE:120,SEAL:160,TOWER:10,SCRAPYARD:20,COW_ROOM:30,RIFT:30};
  let expected=0;
  for(const [source,xp] of Object.entries(sources)){await f.DB.batch(await accountRankAward(f.env,7,source,'potion-'+source));expected+=xp*600*3;}
  const ticks=async()=>Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks);
  assert.equal(await ticks(),expected);await f.DB.batch(await accountRankAward(f.env,7,'HUNT','blocked',{guard:'1=0'}));assert.equal(await ticks(),expected);
  now+=HOUR;await f.DB.batch(await accountRankAward(f.env,7,'HUNT','potion-HUNT'));assert.equal(await ticks(),expected);
  await f.DB.batch(await accountRankAward(f.env,7,'HUNT','after-expiry'));expected+=8*600;assert.equal(await ticks(),expected);
  await useRankExpPotion(f.env,f.user,request(2,1));await f.DB.batch(await accountRankAward(f.env,7,'HUNT','double'));expected+=8*600*2;assert.equal(await ticks(),expected);
  await f.DB.batch(await accountRankAward(f.env,8,'HUNT','other-user'));assert.equal((await readAccountRank(f.env,8)).progress.current,8);
  await assert.rejects(()=>accountRankAward(f.env,7,'PVP','forged'));assert.equal(await f.coin(),10000000);
  await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=7',MAX_RANK_TICKS-1).run();await f.DB.batch(await accountRankAward(f.env,7,'SEAL','cap'));assert.equal(await ticks(),MAX_RANK_TICKS);
 });
 test(label+': multiplier includes equipped pet and earned trophy XP bonuses',async t=>{
  const f=await collectionFixture(t,{postgres});await f.setting(rankPotionKey(7),nextRankPotion(null,3,Date.now()));
  await f.DB.batch(await accountRankAward(f.env,7,'HUNT','potion-collection'));
  assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),8*600*1.35*3);
 });
 test(label+': season pass catalog, claim, use both potions and inactive item rejection',async t=>{
  const f=await passFixture({postgres});t.after(()=>f.close());await ensureJointTransactionSchema(f.env);
  for(const item of RANK_POTIONS)await f.run('INSERT INTO inventory_items VALUES(?,?,?,?,1)',item.code,item.name,item.rarity,item.image);
  const catalog=(await f.call('admin/server-support/pass')).body.catalog;
  for(const item of RANK_POTIONS){const found=catalog.find(x=>x.ref===item.code);assert.equal(found.available,true);assert.equal(found.image,'/'+item.image);}
  const document=f.document(RANK_POTIONS.map(item=>({code:'INVENTORY_ITEM:'+item.code,quantity:1})));assert.equal((await f.save(document)).status,200);await f.grant();
  const state=await f.pass(),claim={cycle:state.cycle,day:state.currentDay,expectedRevision:state.revision};assert.equal((await f.claim(claim)).status,200);assert.equal((await f.claim(claim)).body.replayed,true);
  for(const [i,item] of RANK_POTIONS.entries()){assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',item.code)).quantity),1);const used=await useRankExpPotion(f.env,{id:2},request(item.multiplier,i));assert.equal(used.buff.multiplier,item.multiplier);}
  await f.run('UPDATE inventory_items SET is_active=0 WHERE code=?',RANK_POTIONS[0].code);assert.equal((await f.save(document)).status,400);
 });
}
test('routes authenticate, validate input/origin, isolate private status and serialize same/different requests',async t=>{
 const f=await potionFixture(t),deps={...f.deps,json:(body,status=200,headers={})=>Response.json(body,{status,headers})};
 const call=async(path='use',data=request(),token='local-account-7',origin='https://potion.test')=>{
  const method=path==='use'?'POST':'GET',response=await handleRankExpPotion({path:'rank-exp-potion/'+path,request:new Request('https://potion.test/api/rank-exp-potion/'+path,{method,headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{})}),env:f.env,deps});
  return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
 };
 assert.equal((await call('status',null,'')).status,401);assert.equal((await call('use',request(),'local-account-7','https://evil.test')).status,403);
 for(const bad of [{...request(),userId:8},{...request(),multiplier:100},{...request(),version:0},{...request(),expectedRevision:-1},{...request(),itemCode:'OTHER'}])assert.equal((await call('use',bad)).status,400);
 const r=request(),pair=await Promise.all([call('use',r),call('use',r)]);assert(pair.every(x=>x.status===200));assert.equal(pair.filter(x=>x.body.replayed).length,1);assert.equal(await f.stock(2),4);
 const other=await call('status',null,'local-account-8');assert.equal(other.body.buff.active,false);assert.equal(other.cache,'private, no-store');
 const raced=await Promise.all([call('use',request(2,1)),call('use',request(3,1))]);assert.deepEqual(raced.map(x=>x.status).sort(),[200,409]);
 assert.equal((await readRankExpPotion(f.env,7)).revision,2);assert.equal(await f.stock(2)+await f.stock(3),8);
});
test('lost commit acknowledgement returns saved result without extending or consuming twice',async t=>{
 const f=await potionFixture(t),r=request();f.DB.afterCommit=()=>{throw Error('ACK_LOST');};
 const one=await useRankExpPotion(f.env,f.user,r);f.DB.afterCommit=null;const replay=await useRankExpPotion(f.env,f.user,r);
 assert.equal(replay.replayed,true);assert.deepEqual(replay.applied,one.applied);assert.equal(await f.stock(2),4);
});
test('one-time registration is atomic, does not grant or rewrite pass and preserves later CMS edits',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE users(id INT,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);INSERT INTO app_meta VALUES('supporter_season_pass_v1','original pass',now());CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INT,is_active INT);CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,admin_id INT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)");
  await registerRankPotions(db);assert.equal((await db.query('SELECT * FROM inventory_items')).rows.length,0);
  const result=await registerRankPotions(db,{commit:true});assert.equal(result.granted,0);assert.equal(result.passUnchanged,true);assert.equal(result.itemCodes.length,2);
  await db.query('UPDATE inventory_items SET name=$1 WHERE code=$2',['CMS edited',RANK_POTIONS[0].code]);assert.equal((await registerRankPotions(db,{commit:true})).replayed,true);
  assert.equal((await db.query('SELECT name FROM inventory_items WHERE code=$1',[RANK_POTIONS[0].code])).rows[0].name,'CMS edited');assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);
  assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',['supporter_season_pass_v1'])).rows[0].value,'original pass');assert((await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {recruitmentGiftFixture as fixture} from './helpers/recruitment-gift-fixture.mjs';
import {RECRUITMENT_GIFT as gift,RECRUITMENT_GIFT_CATALOG_KEY as key,ensureRecruitmentGiftCatalog,grantRecruitmentGift,openRecruitmentGift} from '../functions/_recruitment_gift.js';
import {TOURNAMENT_GIFT,ensureTournamentGiftCatalog} from '../functions/_tournament_gift.js';
import {invalidateRuntimeData} from '../functions/_runtime_data_cache.js';
const REPAIR='PINGDU_REPAIR_COUPON',read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('catalog: independent recruitment gift and repair items, no grants, old tournament rewards and CMS edits preserved',async t=>{
 const f=await fixture(t);await ensureTournamentGiftCatalog(f.env);await ensureRecruitmentGiftCatalog(f.env);
 const row=await f.one('SELECT * FROM inventory_items WHERE code=$1',[gift.code]);
 assert.deepEqual([row.name,row.category,row.is_active,row.image_url],['영입전 사은품','GIFT_BOX',1,gift.image]);
 assert.equal(await f.quantity(),0);assert.equal(await f.quantity(REPAIR),0);assert.equal(await f.quantity('MASTER_STAR'),17);
 assert.equal(TOURNAMENT_GIFT.masterStar,2000000);assert.equal(TOURNAMENT_GIFT.coin,250000000000);
 assert.equal((await f.one('SELECT name FROM inventory_items WHERE code=$1',[TOURNAMENT_GIFT.code])).name,'대회 사은품');
 const count=f.queries();await ensureRecruitmentGiftCatalog(f.env);assert.equal(f.queries(),count);
 await f.pg.query("UPDATE inventory_items SET is_active=0,name='CMS edit' WHERE code=$1",[gift.code]);
 invalidateRuntimeData(f.env,key);await ensureRecruitmentGiftCatalog(f.env);
 assert.deepEqual(await f.one('SELECT name,is_active FROM inventory_items WHERE code=$1',[gift.code]),{name:'CMS edit',is_active:0});
});

test('one box pays 200 billion coins, 3 million stars, 1 repair and 1000 mystic energy exactly once',async t=>{
 const f=await fixture(t);await f.stock(1);await ensureRecruitmentGiftCatalog(f.env);
 await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,4,1)',[REPAIR]);
 const id=crypto.randomUUID(),count=f.queries(),result=await f.open(id);
 assert.deepEqual(result.rewards,{coin:200000000000,masterStar:3000000,repairCoupon:1,mysticEnergy:1000});
 assert.equal(await f.quantity(),0);assert.equal(await f.quantity('MASTER_STAR'),3000017);assert.equal(await f.quantity(REPAIR),5);assert.equal(await f.quantity('STARLIGHT_ARMOR_CORE'),1000);
 assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,200000000123);
 assert.equal((await f.one('SELECT unseen_quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',[REPAIR])).unseen_quantity,2);
 assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,4);
 assert.equal((await f.open(id)).replayed,true);assert.equal(await f.quantity(REPAIR),5);
 assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);assert.equal((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n,0);
 t.diagnostic('Open and replay SQL statements: '+(f.queries()-count));
});

test('simultaneous same receipt replays and competing requests cannot spend the last box twice',async t=>{
 for(const same of [true,false]){
  const f=await fixture(t);await f.stock(1);await ensureRecruitmentGiftCatalog(f.env);const id=crypto.randomUUID();
  const results=await Promise.allSettled([f.open(id),f.open(same?id:crypto.randomUUID())]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,same?2:1);
  assert.equal(await f.quantity(),0);assert.equal(await f.quantity(REPAIR),1);assert.equal(await f.quantity('MASTER_STAR'),3000017);assert.equal(await f.quantity('STARLIGHT_ARMOR_CORE'),1000);
  assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
 }
});

test('repair, coin ledger and completion errors roll back all rewards and consumption; same request retries',async t=>{
 for(const fault of [{pattern:'INSERT INTO cnine_user_inventory',itemCode:REPAIR},{pattern:'INSERT INTO cnine_user_inventory',itemCode:'STARLIGHT_ARMOR_CORE'},{pattern:'INSERT INTO inventory_logs',itemCode:'STARLIGHT_ARMOR_CORE'},{pattern:'INSERT INTO coin_logs'},{pattern:"UPDATE joint_operations_v1 SET status='COMPLETED'"}]){
  const f=await fixture(t);await f.stock(1);await ensureRecruitmentGiftCatalog(f.env);const id=crypto.randomUUID();f.fault(fault);
  await assert.rejects(f.open(id));assert.equal(await f.quantity(),1);assert.equal(await f.quantity('MASTER_STAR'),17);assert.equal(await f.quantity(REPAIR),0);
  assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);assert.equal(await f.quantity('STARLIGHT_ARMOR_CORE'),0);
  await f.open(id);await f.open(id);assert.equal(await f.quantity(),0);assert.equal(await f.quantity(REPAIR),1);assert.equal(await f.quantity('STARLIGHT_ARMOR_CORE'),1000);
 }
 const f=await fixture(t);await f.stock(1);await ensureRecruitmentGiftCatalog(f.env);const id=crypto.randomUUID();f.fault({ack:true});
 await f.open(id);await f.open(id);assert.equal(await f.quantity(REPAIR),1);assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
});

test('missing stock, invalid requests, inactive rewards and integer overflow never consume the box',async t=>{
 const f=await fixture(t);await assert.rejects(f.open(),/보유한/);await f.stock(1);
 for(const n of [0,2,-1,1.5])await assert.rejects(f.open(crypto.randomUUID(),n),/1개씩/);
 await assert.rejects(f.open('bad'),/요청 번호/);
 for(const code of [gift.code,'MASTER_STAR',REPAIR,'STARLIGHT_ARMOR_CORE']){
  await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[code]);await assert.rejects(f.open());
  await f.pg.query('UPDATE inventory_items SET is_active=1 WHERE code=$1',[code]);
 }
 await f.pg.query('UPDATE users SET coin=$1 WHERE id=1',[Number.MAX_SAFE_INTEGER]);await assert.rejects(f.open());await f.pg.query('UPDATE users SET coin=123 WHERE id=1');
 for(const code of ['MASTER_STAR',REPAIR,'STARLIGHT_ARMOR_CORE']){
  await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,$2,$2) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',[code,Number.MAX_SAFE_INTEGER]);
  await assert.rejects(f.open());await f.pg.query('UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0 WHERE user_id=1 AND item_code=$1',[code]);
 }
 assert.equal(await f.quantity(),1);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
});

test('admin grant is audited, idempotent and bound to recipient, admin and input; failure cannot partly grant',async t=>{
 const f=await fixture(t),id=crypto.randomUUID();await f.grant(id);await f.grant(id);
 assert.equal(await f.quantity(),2);assert.equal(await f.quantity(REPAIR),0);assert.equal(await f.quantity('MASTER_STAR'),17);
 assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,1);
 for(const args of [[id,3,1],[id,2,2]])await assert.rejects(f.grant(...args),/다른 내용/);
 await assert.rejects(grantRecruitmentGift(f.env,{id:8},{userId:1,amount:2,reason:'대회 검수',requestId:id}),/다른 내용/);
 await assert.rejects(f.open(id),/다른 내용/);await assert.rejects(f.grant(crypto.randomUUID(),10000),/수량/);
 const retry=crypto.randomUUID();f.fault({pattern:'INSERT INTO admin_logs'});await assert.rejects(f.grant(retry));assert.equal(await f.quantity(),2);await f.grant(retry);assert.equal(await f.quantity(),4);
 await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[gift.code]);await assert.rejects(f.grant());assert.equal(await f.quantity(),4);
});

test('live admin and opening routes retain permissions and account mutation locks',async t=>{
 const f=await fixture(t),api=read('functions/api/[[path]].js'),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const locks=[],deps={env:f.env,grantRecruitmentGift,openRecruitmentGift,isForgeTicketGrant:()=>false,readBody:r=>r.json(),json:(body,status=200)=>Response.json(body,{status}),withJointUserMutationLock:async(_env,id,path,work)=>{locks.push({id,path});return work();}};
 const source=api.slice(api.indexOf("    if(path==='admin/users/action'"),api.indexOf("    if(path==='admin/users/inventory-audit'"));
 const route=new AsyncFunction('deps',`const {env,grantRecruitmentGift,isForgeTicketGrant,readBody,json,withJointUserMutationLock,request,requirePermission}=deps;const path='admin/users/action';${source}`);
 const payload={userId:1,action:'INVENTORY',itemCode:gift.code,amount:1,reason:'영입전 지원',requestId:crypto.randomUUID()};
 const call=(admin,body=payload)=>route({...deps,request:new Request('https://qa.test/api/admin/users/action',{method:'POST',body:JSON.stringify(body)}),requirePermission:async()=>admin});
 assert.equal((await call(null)).status,403);assert.equal((await call({id:2,role:'ADMIN'},{...payload,userId:9})).status,403);
 assert.equal((await call({id:9,role:'OWNER'})).status,200);assert.equal(await f.quantity(),1);
 const openSource=api.slice(api.indexOf("    if(path==='inventory/use'"),api.indexOf('      if(itemCode===TOURNAMENT_GIFT.code)'))+'}';
 const openRoute=new AsyncFunction('deps',`const {env,openRecruitmentGift,readBody,json,withJointUserMutationLock,request,authenticate}=deps;const path='inventory/use';${openSource}`);
 const request=new Request('https://qa.test/api/inventory/use',{method:'POST',body:JSON.stringify({itemCode:gift.code,count:1,requestId:crypto.randomUUID()})});
 assert.equal((await openRoute({...deps,request:request.clone(),authenticate:async()=>null})).status,401);
 assert.equal((await openRoute({...deps,request,authenticate:async()=>({id:1})})).status,200);assert.equal(await f.quantity(REPAIR),1);
 assert.deepEqual(locks,[{id:1,path:'admin/recruitment-gift/grant'},{id:1,path:'inventory/recruitment-gift/open'}]);
});

test('CMS includes exact four rewards and retries the same grant ID after a lost response',async()=>{
 const admin=read('admin/admin-v1276.js'),store=new Map(),controls={'#selectedUserId':{value:'1'},'#inventoryItemCode':{value:gift.code},'#inventoryItemAmount':{value:'1'},'#inventoryItemReason':{value:'영입전 감사'},'#userDialog':{close(){}}};
 const sent=[],confirmed=[];let fail=true;
 const ctx={state:{admin:{id:9},users:[{id:1,nickname:'검수 유저'}]},crypto,$:s=>controls[s],localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},confirm:m=>(confirmed.push(m),true),alert:()=>{},loadUsers:async()=>{},api:async(_p,{body})=>{sent.push(JSON.parse(body));if(fail){fail=false;throw Error('lost response');}return {};}};
 vm.createContext(ctx);vm.runInContext(admin.slice(admin.indexOf('function tournamentGiftGrantKey'),admin.indexOf('function prisonAdminTime')),ctx);
 await assert.rejects(ctx.userAction('INVENTORY'),/lost response/);await ctx.userAction('INVENTORY');assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(store.size,0);
 for(const word of ['영입전 사은품','2,000억','300만','리페어권 1개','미스틱 에너지 1,000개'])assert(confirmed[0].includes(word));
 assert(admin.includes('<option value="RECRUITMENT_GIFT_BOX">'));assert(read('admin/index.html').includes('<option value="RECRUITMENT_GIFT_BOX">영입전 사은품</option>'));
 const html=read('index.html');assert(html.includes('js/recruitment-gift-v1.js?v=20260929'));assert(html.includes('recruitmentGift=20260929'));
 assert(read('js/app.js').includes("if(itemCode==='RECRUITMENT_GIFT_BOX')return window.RecruitmentGiftV1.open"));
});

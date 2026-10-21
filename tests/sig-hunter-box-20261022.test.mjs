import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sigHunterBoxFixture as fixture} from './helpers/sig-hunter-box-fixture.mjs';
import {SIG_HUNTER_BOX as gift,ensureSigHunterBoxCatalog,openSigHunterBox,grantSigHunterBox} from '../functions/_sig_hunter_box.js';
const rewards={coin:30_000_000_000_000,masterStar:20_000_000,repairCoupon:3,suitCore6:10,limitedShard:1};
async function paid(f){
 assert.equal(await f.quantity(),0);
 assert.equal(await f.quantity('MASTER_STAR'),20_000_017);
 assert.equal(await f.quantity('MERCENARY_SSS_LIMITED_SHARD'),1);
 assert.equal(await f.quantity('MERCENARY_SSS_CARD_SHARD'),0,'Ordinary SSS shards must not be substituted');
 assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),3);
 assert.equal(await f.quantity('SUIT_CORE_6'),10);
 assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,30_000_000_000_123);
}
test('catalog grants nothing; each gift pays exactly 30 trillion coins, 20 million stars, 3 repairs, 10 core 6 and 1 limited shard',async t=>{
 const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);
 assert.equal(await f.quantity(),0);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);
 assert.equal((await f.one('SELECT name FROM inventory_items WHERE code=$1',[gift.code])).name,'시그헌터 박스');
 await f.stock(1);const id=crypto.randomUUID();assert.deepEqual((await f.open(id)).rewards,rewards);await paid(f);
 assert.equal((await f.open(id)).replayed,true);await paid(f);
 assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
 assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,5);
});
test('same and distinct concurrent requests cannot double-spend the last box',async t=>{
 for(const same of [true,false]){
  const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);await f.stock(1);const id=crypto.randomUUID();
  const results=await Promise.allSettled([f.open(id),f.open(same?id:crypto.randomUUID())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,same?2:1);await paid(f);
 }
});
test('late inventory, coin-log and completion failures roll back every reward and box, then retry',async t=>{
 for(const fault of [{pattern:'INSERT INTO cnine_user_inventory',itemCode:'MERCENARY_SSS_LIMITED_SHARD'},{pattern:'INSERT INTO cnine_user_inventory',itemCode:'SUIT_CORE_6'},{pattern:'INSERT INTO coin_logs'},{pattern:"UPDATE joint_operations_v1 SET status='COMPLETED'"}]){
  const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);await f.stock(1);const id=crypto.randomUUID();f.fault(fault);
  await assert.rejects(f.open(id));assert.equal(await f.quantity(),1);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),0);assert.equal(await f.quantity('SUIT_CORE_6'),0);
  assert.equal(await f.quantity('MASTER_STAR'),17);assert.equal(await f.quantity('MERCENARY_SSS_LIMITED_SHARD'),0);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);await f.open(id);await paid(f);
 }
});
test('inactive contents, insufficient stock and balances exceeding safe integers reject without losing box',async t=>{
 const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);await assert.rejects(f.open(),/보유한/);await f.stock(1);
 for(const code of [gift.code,'MASTER_STAR','PINGDU_REPAIR_COUPON','SUIT_CORE_6','MERCENARY_SSS_LIMITED_SHARD']){
  await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[code]);await assert.rejects(f.open());await f.pg.query('UPDATE inventory_items SET is_active=1 WHERE code=$1',[code]);
 }
 for(const code of ['MASTER_STAR','PINGDU_REPAIR_COUPON','SUIT_CORE_6','MERCENARY_SSS_LIMITED_SHARD']){
  await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,$2,$2) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',[code,Number.MAX_SAFE_INTEGER]);
  await assert.rejects(f.open());await f.pg.query('DELETE FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',[code]);
 }
 await f.pg.query('UPDATE users SET coin=$1 WHERE id=1',[Number.MAX_SAFE_INTEGER-rewards.coin+1]);await assert.rejects(f.open());
 assert.equal(await f.quantity(),1);assert.equal(await f.quantity('SUIT_CORE_6'),0);
});
test('admin grant receipts survive retries and lost acknowledgements, isolate users, and reject payload reuse',async t=>{
 const f=await fixture(t),id=crypto.randomUUID();await f.grant(id,1);await f.grant(id,1);
 assert.equal(await f.quantity(),1);assert.equal(await f.quantity(gift.code,2),0);
 assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,1);
 await assert.rejects(f.grant(id,2),/다른 내용/);await assert.rejects(f.grant(id,1,2),/다른 내용/);
 const open=crypto.randomUUID();f.fault({ack:true});await f.open(open);await f.open(open);await paid(f);
 await assert.rejects(f.open(open,1,2),/다른 내용/);
 for(const n of [0,-1,2,1.5])await assert.rejects(f.open(crypto.randomUUID(),n));
 for(const n of [0,-1,1.5,10000])await assert.rejects(f.grant(crypto.randomUUID(),n));
});
test('grant audit failure rolls back the item and is retryable',async t=>{
 const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);const id=crypto.randomUUID();
 f.fault({pattern:'INSERT INTO admin_logs'});await assert.rejects(f.grant(id,1));assert.equal(await f.quantity(),0);
 await f.grant(id,1);assert.equal(await f.quantity(),1);
});
test('real user-management and use route require permission/authentication and use shared locks',async t=>{
 const f=await fixture(t),api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const route=new AsyncFunction('deps','const {env,request,requirePermission,readBody,json,isForgeTicketGrant,grantSigHunterBox,withJointUserMutationLock}=deps;const path="admin/users/action";'+api.slice(api.indexOf("    if(path==='admin/users/action'"),api.indexOf("    if(path==='admin/users/inventory-audit'")));
 const payload={userId:1,action:'INVENTORY',itemCode:gift.code,amount:1,requestId:crypto.randomUUID()},locks=[];
 const deps={env:f.env,readBody:r=>r.json(),json:(b,status=200)=>Response.json(b,{status}),isForgeTicketGrant:()=>false,grantSigHunterBox,withJointUserMutationLock:async(_e,id,key,work)=>{locks.push({id,key});return work();}};
 const call=admin=>route({...deps,request:new Request('https://qa/api/admin/users/action',{method:'POST',body:JSON.stringify(payload)}),requirePermission:async()=>admin});
 assert.equal((await call(null)).status,403);assert.equal((await call({id:9,role:'OWNER'})).status,200);
 assert.equal(locks[0].id,1);assert.match(locks[0].key,/sig-hunter-box/);assert.equal(await f.quantity(),1);
 const use=new AsyncFunction('deps','const {env,request,authenticate,readBody,json,openSigHunterBox}=deps;const path="inventory/use";'+api.slice(api.indexOf("    if(path==='inventory/use'"),api.indexOf("      if(itemCode==='WORM_CONTEST_GIFT_BOX')"))+'}');
 const request=new Request('https://qa/api/inventory/use',{method:'POST',body:JSON.stringify({itemCode:gift.code,count:1,requestId:crypto.randomUUID()})});
 assert.equal((await use({...deps,request:request.clone(),authenticate:async()=>null,openSigHunterBox})).status,401);
 assert.equal((await use({...deps,request:request.clone(),authenticate:async()=>({id:1}),openSigHunterBox})).status,200);await paid(f);
});
test('CMS retry preserves request ID only for the same account, amount and reason',()=>{
 const source=fs.readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function sigHunterBoxGrantKey('),source.indexOf('function reversecallStreamerGiftGrantKey('));
 const map=new Map(),ctx=vm.createContext({state:{admin:{id:9}},crypto,localStorage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}});
 vm.runInContext(code,ctx);const a={userId:1,amount:1,reason:'선물'};ctx.prepareSigHunterBoxGrant(a);
 const retry={userId:1,amount:1,reason:'선물'};ctx.prepareSigHunterBoxGrant(retry);assert.equal(retry.requestId,a.requestId);
 const other={userId:2,amount:1,reason:'선물'};ctx.prepareSigHunterBoxGrant(other);assert.notEqual(other.requestId,a.requestId);
 const changed={userId:1,amount:2,reason:'선물'};ctx.prepareSigHunterBoxGrant(changed);assert.notEqual(changed.requestId,a.requestId);
});


test('MATERIAL stays in materials and only the new box is usable, with real inventory SQL and client metadata',async t=>{
 const f=await fixture(t);await ensureSigHunterBoxCatalog(f.env);
 assert.equal((await f.one('SELECT category FROM inventory_items WHERE code=$1',[gift.code])).category,'MATERIAL');
 const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const inventory=api.slice(api.indexOf("    if(path==='inventory'){"),api.indexOf("    if(path==='inventory/seen'"));
 const expression=inventory.match(/CASE WHEN i.code='SIG_HUNTER_BOX'[\s\S]*?END AS usable/)[0];
 const rows=await f.env.DB.prepare("SELECT i.code,"+expression+" FROM inventory_items i WHERE i.category='MATERIAL'").bind(0).all();
 assert.equal(Number(rows.results.find(r=>r.code===gift.code).usable),1);
 assert.equal(Number(rows.results.find(r=>r.code==='MERCENARY_SSS_LIMITED_SHARD').usable),0);
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),ctx=vm.createContext({WORKSHOP_ONLY_ITEM_CODES:new Set(),RETIREMENT_REROLL_META:{},INVENTORY_RARITIES:{},INVENTORY_GROUPS:[['MATERIAL','재료']]});
 vm.runInContext(app.slice(app.indexOf('function inventoryItemGroup('),app.indexOf('function inventoryItemVisual(')),ctx);
 const item={code:gift.code,category:'MATERIAL',quantity:1,usable:true};
 assert.equal(ctx.inventoryItemMeta(item).group,'MATERIAL');assert.equal(ctx.inventoryItemMeta(item).usable,true);assert.equal(ctx.inventoryItemMeta(item).action,'상자 열기');
 assert.equal(ctx.inventoryItemMeta({...item,code:'MASTER_STAR'}).usable,false);
 assert.equal(ctx.inventoryItemMeta({...item,usable:false}).usable,false);
 await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[gift.code]);await ensureSigHunterBoxCatalog(f.env);
 assert.equal(Number((await f.one('SELECT is_active FROM inventory_items WHERE code=$1',[gift.code])).is_active),0,'Catalog initializer preserves operator OFF');
});

test('dedicated runtime art ships, originals are preserved by hash and Pages stays within its limit',async()=>{
 const {isProductionFile,sigHunterQaOnly}=await import('../scripts/prepare-production-assets.mjs');
 const {createHash}=await import('node:crypto'),{execFileSync}=await import('node:child_process');
 const manifest=JSON.parse(fs.readFileSync('preview/sig-hunter-box-20261022/manifest.json','utf8'));
 const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 for(const asset of manifest.assets){assert.equal(hash(asset.original),asset.sourceSha256);assert.equal(isProductionFile(asset.original),false);for(const output of asset.outputs){assert.equal(hash(output.file),output.sha256);assert.equal(isProductionFile(output.file),true);}}
 for(const file of ['js/sig-hunter-box-v1.js','css/sig-hunter-box-v1.css','shared/sig-hunter-box-v1.mjs'])assert.equal(isProductionFile(file),true);
 for(const file of sigHunterQaOnly){assert.equal(isProductionFile(file),false);assert.match(fs.readFileSync(file,'utf8'),/from ['"]node:/);}
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert.ok(count<=20000,'Pages assets: '+count);
});

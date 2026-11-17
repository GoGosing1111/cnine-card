import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {cnineStreamerBoxFixture as fixture} from './helpers/cnine-streamer-box-fixture.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
import {CNINE_STREAMER_BOX as gift,CNINE_STREAMER_BOX_CATALOG_KEY,ensureCnineStreamerBoxCatalog} from '../functions/_cnine_streamer_box.js';
import {SX_BODY_CORE_UPGRADE_KEY,ensureSxBodyCoreCatalog} from '../functions/_battle_suit_materials.js';

test('core 8 catalog creation rolls back with its gate and preserves existing CMS values and ownership on retry',async t=>{
 const f=await fixture(t);f.fault({pattern:'INSERT INTO app_meta'});
 await assert.rejects(ensureSxBodyCoreCatalog(f.env));assert.equal(await f.one("SELECT code FROM inventory_items WHERE code='SUIT_CORE_8'"),undefined);
 assert.equal(await f.one('SELECT value FROM app_meta WHERE key=$1',[SX_BODY_CORE_UPGRADE_KEY]),undefined);
 await ensureSxBodyCoreCatalog({DB:f.env.DB});
 const row=await f.one("SELECT * FROM inventory_items WHERE code='SUIT_CORE_8'");
 assert.equal(row.category,'MATERIAL');assert.equal(row.is_active,1);assert.match(row.description,/SX슈트/);assert.equal(row.image_url,'assets/items/suit-core-8-20261117.webp');
 await f.pg.query("UPDATE inventory_items SET name='OWNER title',is_active=0 WHERE code='SUIT_CORE_8'");
 await ensureSxBodyCoreCatalog({DB:f.env.DB});assert.equal((await f.one("SELECT name FROM inventory_items WHERE code='SUIT_CORE_8'")).name,'OWNER title');assert.equal(await f.quantity('SUIT_CORE_8'),0);
});

test('existing box catalog refreshes the reward description without changing CMS flags, ownership or old completion gate',async t=>{
 const f=await fixture(t);await f.pg.query("INSERT INTO inventory_items(code,name,description,category,is_active) VALUES($1,'OWNER box','old description','GIFT_BOX',0)",[gift.code]);
 await f.pg.query("INSERT INTO app_meta(key,value) VALUES('cnine_streamer_box_catalog_20261103_v1','1')");await f.stock(30);
 await ensureCnineStreamerBoxCatalog(f.env);const row=await f.one('SELECT * FROM inventory_items WHERE code=$1',[gift.code]);
 assert.equal(row.name,'OWNER box');assert.equal(row.is_active,0);assert.equal(row.description,gift.description);assert.equal(await f.quantity(),30);
 assert.equal((await f.one('SELECT value FROM app_meta WHERE key=$1',[CNINE_STREAMER_BOX_CATALOG_KEY])).value,'1');assert.equal((await f.one("SELECT value FROM app_meta WHERE key='cnine_streamer_box_catalog_20261103_v1'")).value,'1');
});

for(const status of ['PENDING','COMPLETED'])test(`old ${status} receipt keeps its four captured rewards and cannot acquire a new core by replay`,async t=>{
 const f=await fixture(t);await ensureCnineStreamerBoxCatalog(f.env);await f.stock(status==='PENDING'?1:0);const requestId=crypto.randomUUID();
 const old={itemCode:gift.code,count:1,coin:25_000_000_000_000,masterStar:200_000_000,repairCoupon:3,suitCore6:10};
 const input_hash=await jointHash({kind:'CNINE_STREAMER_BOX_OPEN',input:{itemCode:gift.code,count:1}});
 await f.pg.query('INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES($1,1,$2,$3,$4,$5,$6)',[requestId,'CNINE_STREAMER_BOX_OPEN',input_hash,JSON.stringify(old),status,new Date().toISOString()]);
 const result=await f.open(requestId);assert.equal(result.rewards.suitCore8,0);assert.equal(await f.quantity('SUIT_CORE_8'),0);assert.equal(await f.quantity(),0);
 const coin=(await f.one('SELECT coin FROM users WHERE id=1')).coin;assert.equal(coin,status==='PENDING'?25_000_000_000_123:123);assert.equal((await f.open(requestId)).replayed,true);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,coin);assert.equal(await f.quantity('SUIT_CORE_8'),0);
});

test('30 existing unopened boxes award exactly 30 new cores alongside unchanged original totals',async t=>{
 const f=await fixture(t);await ensureCnineStreamerBoxCatalog(f.env);await f.stock(30);
 for(let i=0;i<30;i++)assert.equal((await f.open()).rewards.suitCore8,1);
 assert.equal(await f.quantity(),0);assert.equal(await f.quantity('SUIT_CORE_8'),30);assert.equal(await f.quantity('SUIT_CORE_6'),300);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),90);assert.equal(await f.quantity('MASTER_STAR'),6_000_000_017);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,750_000_000_000_123);
 assert.equal((await f.one("SELECT COUNT(*) n FROM inventory_logs WHERE item_code='SUIT_CORE_8'")).n,30);
});

test('core 8 art preserves its transparent source and delivers the same independently cached 512px icon',async()=>{
 const base=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('docs/qa/sx-core8-cnine-box-20261117/art-manifest.json',base),'utf8'));
 for(const f of manifest.files){const bytes=readFileSync(new URL(f.path,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);const m=await sharp(bytes).metadata(),s=await sharp(bytes).stats();assert(m.hasAlpha);assert.equal(s.channels[3].min,0);assert.equal(s.channels[3].max,255);if(f.path.endsWith('.webp')){assert.equal(m.width,512);assert(bytes.length<100_000);}}
});

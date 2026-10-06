import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {BATTLE_SUIT_CORE_CATALOG,BATTLE_SUIT_CORE_UPGRADE_KEY,SZ_BODY_CORE_UPGRADE_KEY,X_BODY_CORE_UPGRADE_KEY,ensureBattleSuitCoreCatalog} from '../functions/_battle_suit_materials.js';
import {SZ_BODY_BY_CODE} from '../functions/_battle_suit_sz_body.js';
import {X_BODY_ITEM} from '../functions/_battle_suit_x_body.js';
import {__workshopBattleSuitTest} from '../functions/_workshop.js';

async function fixture(t,postgres){
 let DB,exec;
 if(postgres){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});exec=sql=>pg.exec(sql);
 }else{DB=new JointSQLiteDB();t.after(()=>DB.sql.close());exec=sql=>DB.sql.exec(sql);}
 await exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT);
 CREATE TABLE workshop_recipes_v1668(code TEXT PRIMARY KEY,success_rate REAL,coin_cost BIGINT,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 INSERT INTO workshop_recipes_v1668 VALUES('OWNER_CUSTOM',3.5,99999999999,0);
 INSERT INTO cnine_user_inventory VALUES(1,'SUIT_CORE_6',12);`);
 for(const key of [BATTLE_SUIT_CORE_UPGRADE_KEY,SZ_BODY_CORE_UPGRADE_KEY])await DB.prepare("INSERT INTO app_meta(key,value) VALUES(?,'1')").bind(key).run();
 for(let i=1;i<=6;i++)await DB.prepare("INSERT INTO inventory_items(code,name,category,rarity,image_url,sort_order,is_active) VALUES(?,'CMS edited','MATERIAL','EPIC','custom.png',999,0)").bind('SUIT_CORE_'+i).run();
 const rows=async table=>(await DB.prepare('SELECT * FROM '+table+' ORDER BY 1').all()).results;
 return {DB,rows};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: completed old catalog gates still add core 7 atomically; preserve CMS, inventory and recipes on retry`,async t=>{
 const {DB,rows}=await fixture(t,postgres),env={DB};
 const before=await rows('inventory_items'),recipes=await rows('workshop_recipes_v1668'),owned=await rows('cnine_user_inventory');
 const batch=DB.batch.bind(DB);let fail=true;
 DB.batch=statements=>batch(fail?[statements[0],DB.prepare('INSERT INTO missing_test_table(value) VALUES(1)'),...statements.slice(1)]:statements);
 await assert.rejects(ensureBattleSuitCoreCatalog(env));
 assert.deepEqual(await rows('inventory_items'),before);
 assert.equal(await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(X_BODY_CORE_UPGRADE_KEY).first(),null);
 fail=false;await ensureBattleSuitCoreCatalog(env);
 const after=await rows('inventory_items');assert.equal(after.length,7);
 assert.deepEqual(after.filter(item=>item.code!=='SUIT_CORE_7'),before);
 const core=after.find(item=>item.code==='SUIT_CORE_7');
 assert.deepEqual([core.name,core.category,core.rarity,core.is_active,core.sort_order],['슈트 코어 7','MATERIAL','MYTHIC',1,200407]);
 assert.equal(core.image_url,'assets/items/suit-core-7-20261006.png');assert.match(core.description,/X-BODY/);
 assert.equal((await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(X_BODY_CORE_UPGRADE_KEY).first()).value,'1');
 await DB.prepare("UPDATE inventory_items SET name='OWNER core',is_active=0,rarity='SPECIAL',sort_order=765 WHERE code='SUIT_CORE_7'").run();
 const edited=await rows('inventory_items');await ensureBattleSuitCoreCatalog({DB});
 assert.deepEqual(await rows('inventory_items'),edited);
 assert.deepEqual(await rows('workshop_recipes_v1668'),recipes);assert.deepEqual(await rows('cnine_user_inventory'),owned);
});

test('Z remains core 6; upper X is core 7, with preserved Z art, distinct transparent icon and no automatic recipes',async()=>{
 const z=SZ_BODY_BY_CODE.BATTLE_SUIT_Z_BODY,x=X_BODY_ITEM;
 assert.equal(z.coreCode,'SUIT_CORE_6');assert.equal(x.coreCode,'SUIT_CORE_7');assert.ok(x.sortOrder>z.sortOrder);
 const core6=BATTLE_SUIT_CORE_CATALOG.find(c=>c.code===z.coreCode),core7=BATTLE_SUIT_CORE_CATALOG.find(c=>c.code===x.coreCode);
 assert.ok(core7.sortOrder>core6.sortOrder);assert.notEqual(core7.image,core6.image);
 const record=JSON.parse(await readFile(new URL('../docs/battle-suit-core-7-20261006.json',import.meta.url),'utf8'));
 for(const item of record.mapping){
  const data=await readFile(new URL('../'+item.image,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex').toUpperCase(),item.sha256);
 }
 const image=sharp(new URL('../'+core7.image,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
 const meta=await image.metadata(),stats=await image.stats();
 assert.equal(meta.format,'png');assert.ok(meta.width>=1024&&meta.height>=1024);assert.equal(meta.hasAlpha,true);
 const alpha=stats.channels[3];assert.equal(alpha.min,0);assert.equal(alpha.max,255);assert.ok(alpha.mean>50&&alpha.mean<240);
 assert.ok(__workshopBattleSuitTest.BATTLE_SUIT_RECIPES.every(r=>![z.code,x.code].includes(r.equipmentCode)&&![z.coreCode,x.coreCode].includes(r.coreCode)));
});

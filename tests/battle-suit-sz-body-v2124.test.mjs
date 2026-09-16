import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {SZ_BODY_ITEMS,SZ_BODY_UPGRADE_KEY,ensureSzBodyEquipment} from '../functions/_battle_suit_sz_body.js';
import {BATTLE_SUIT_CORE_UPGRADE_KEY,SZ_BODY_CORE_UPGRADE_KEY,ensureBattleSuitCoreCatalog} from '../functions/_battle_suit_materials.js';
import {__equipmentTest} from '../functions/_equipment.js';
import {buildBattleSuitFighter} from '../functions/_battle_v2_preview.js';
import {resolveAccountBattleSuitAnimation,ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG} from '../preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js';

const file=p=>new URL('../'+p.replace(/^\//,''),import.meta.url);
const bytes=p=>readFile(file(p));
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const manifest=JSON.parse(await bytes('assets/ui/project-v/account-battle-suits/sz-body-v2124.json'));
const preview=JSON.parse(await bytes('preview/battle-suit-sz-v1/manifest.json'));
async function fixture(postgres){
  let DB,close,createSchema;
  if(postgres){
    const pg=new PGlite();
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
    close=()=>pg.close();
    createSchema=sql=>pg.exec(sql);
  }else{DB=new JointSQLiteDB();close=()=>DB.sql.close();createSchema=sql=>DB.sql.exec(sql);}
  for(const sql of [
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
    'CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,description TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER,is_public INTEGER,sort_order INTEGER,supply_enabled INTEGER,supply_weight REAL,updated_at TEXT)',
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT)'
  ])await createSchema(sql);
  return {DB,close,p:(sql,...args)=>DB.prepare(sql).bind(...args)};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: S/Z and cores 5/6 migrate atomically, preserve existing CMS policy, and retry`,async()=>{
  const {DB,p,close}=await fixture(postgres),env={DB};
  try{
    await p("INSERT INTO app_meta(key,value) VALUES(?,'1')",BATTLE_SUIT_CORE_UPGRADE_KEY).run();
    for(let i=1;i<=4;i++)await p("INSERT INTO inventory_items(code,name,image_url,rarity,sort_order,is_active,category) VALUES(?,'CMS original','custom.png','EPIC',999,0,'MATERIAL')",'SUIT_CORE_'+i).run();
    const before=(await p('SELECT * FROM inventory_items ORDER BY code').all()).results;
    const batch=DB.batch.bind(DB);let fail=true;
    DB.batch=statements=>batch(fail?[statements[0],DB.prepare('INSERT INTO nonexistent_qa_table(value) VALUES(1)'),...statements.slice(1)]:statements);
    await assert.rejects(ensureSzBodyEquipment(env));
    assert.equal(Number((await p('SELECT count(*) n FROM character_equipment_items').first()).n),0);
    assert.equal(await p('SELECT value FROM app_meta WHERE key=?',SZ_BODY_UPGRADE_KEY).first(),null);
    fail=false;
    await p("INSERT INTO character_equipment_items(code,pve_power,total_power,pvp_power,rarity,is_active,is_public,supply_enabled,supply_weight) VALUES('BATTLE_SUIT_S_BODY',765432,765432,99,'MYTHIC',0,0,0,0)").run();
    await ensureSzBodyEquipment(env);
    fail=true;
    await assert.rejects(ensureBattleSuitCoreCatalog(env));
    assert.equal(Number((await p("SELECT count(*) n FROM inventory_items WHERE code IN ('SUIT_CORE_5','SUIT_CORE_6')").first()).n),0);
    assert.equal(await p('SELECT value FROM app_meta WHERE key=?',SZ_BODY_CORE_UPGRADE_KEY).first(),null);
    fail=false;
    await ensureBattleSuitCoreCatalog(env);
    await ensureSzBodyEquipment(env);await ensureBattleSuitCoreCatalog(env);
    const rows=(await p('SELECT * FROM character_equipment_items ORDER BY code').all()).results;
    assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.name),['S-BODY','Z-BODY']);
    const s=rows[0],z=rows[1];
    assert.deepEqual([s.pve_power,s.total_power,s.pvp_power,s.is_active,s.is_public,s.rarity],[765432,765432,0,0,0,'MYTHIC']);
    assert.deepEqual([z.pve_power,z.pvp_power,z.supply_enabled,z.is_active,z.is_public,z.sort_order],[0,0,0,1,1,60]);
    assert.deepEqual((await p("SELECT * FROM inventory_items WHERE code IN ('SUIT_CORE_1','SUIT_CORE_2','SUIT_CORE_3','SUIT_CORE_4') ORDER BY code").all()).results,before);
    const cores=(await p("SELECT * FROM inventory_items WHERE code IN ('SUIT_CORE_5','SUIT_CORE_6') ORDER BY code").all()).results;
    assert.deepEqual(cores.map(c=>[c.name,c.category,c.is_active]),[['슈트 코어 5','MATERIAL',1],['슈트 코어 6','MATERIAL',1]]);
    for(const key of [SZ_BODY_UPGRADE_KEY,SZ_BODY_CORE_UPGRADE_KEY])assert.equal((await p('SELECT value FROM app_meta WHERE key=?',key).first()).value,'1');
  }finally{await close();}
});

test('approved S/Z full-body alpha and all twelve atlas profiles are byte-identical in production',async()=>{
  assert.equal(manifest.liveEnabled,true);assert.equal(manifest.scope,'PVE_ONLY');
  assert.deepEqual(manifest.approval.order,['H-BODY','S-BODY','Z-BODY']);
  assert.equal(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG).length,36);
  for(const suit of manifest.suits){
    const approved=preview.suits.find(s=>s.code===suit.code);
    assert.equal(suit.entries.length,6);assert.equal(sha(await bytes(suit.battleSprite)),suit.sha256);
    for(const entry of suit.entries){
      const prior=approved.entries.find(e=>e.weaponCode===entry.weaponCode);
      assert.equal(sha(await bytes(entry.image)),prior.sha256);
      const profile=resolveAccountBattleSuitAnimation(suit.code,entry.weaponCode);
      assert.deepEqual(profile,entry.profile);assert.ok(Object.isFrozen(profile.pivots));
      assert.ok(profile.sheetUrl.startsWith('/assets/ui/'));
      assert.equal(sha(await bytes(profile.sheetUrl)),prior.atlasSha256);
      assert.deepEqual(profile.pivots,prior.profile.pivots);assert.deepEqual(profile.muzzle,prior.profile.muzzle);
      const meta=await sharp(await bytes(profile.sheetUrl)).metadata();
      assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[1536,1024,true]);
    }
  }
  for(const item of manifest.items){
    const b=await bytes(item.image);assert.equal(sha(b),item.sha256);
    const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)clear++;
    assert.ok(clear>info.width*info.height*.10,item.code);
    for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
    for(let y=0;y<info.height;y++){assert.equal(data[(y*info.width)*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
    if(item.code.startsWith('SUIT_CORE'))assert.deepEqual([info.width,info.height],[1254,1254]);
  }
});

test('equipped S/Z resolve dedicated fallback art and keep H-BODY PVE damage policy',()=>{
  for(const item of SZ_BODY_ITEMS){
    const payload=__equipmentTest.publicEquippedItem({battle_suit_id:1,battle_suit_code:item.code,battle_suit_image:item.image,battle_suit_pve:456,battle_suit_pvp:99},'battle_suit',{pveOnly:true});
    assert.equal(payload.battleSprite,item.battleSprite);assert.equal(payload.pvpPower,0);
    const support=buildBattleSuitFighter({code:item.code,pvePower:300000,weaponCode:'EQ_1788486929132'});
    const h=buildBattleSuitFighter({code:'BATTLE_SUIT_H_BODY',pvePower:300000,weaponCode:'EQ_1788486929132'});
    assert.equal(support.independentFireInterval,h.independentFireInterval);
    assert.equal(support.independentAttackMultiplier,h.independentAttackMultiplier);
    assert.equal(buildBattleSuitFighter({code:item.code,pvePower:0}),null);
  }
});

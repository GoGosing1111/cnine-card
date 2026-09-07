import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {H_BODY_ITEM,H_BODY_UPGRADE_KEY,ensureHBodyEquipment} from '../functions/_battle_suit_h_body.js';
import {BATTLE_SUIT_CORE_CATALOG,BATTLE_SUIT_CORE_UPGRADE_KEY,ensureBattleSuitCoreCatalog} from '../functions/_battle_suit_materials.js';
import {__equipmentTest} from '../functions/_equipment.js';
import {resolveAccountBattleSuitAnimation,ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG} from '../preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js';
import {buildBattleSuitFighter} from '../functions/_battle_v2_preview.js';

const file=p=>new URL('../'+p.replace(/^\//,''),import.meta.url);
const read=p=>readFile(file(p),'utf8');
const manifest=JSON.parse(await read('assets/ui/project-v/account-battle-suits/h-body-v2066.json'));
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,description TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER,is_public INTEGER,sort_order INTEGER,supply_enabled INTEGER,supply_weight REAL,updated_at TEXT);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT);`);
  const DB={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this},async first(){return db.prepare(sql).get(...this.values)||null}}},
    async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>db.prepare(s.sql).run(...s.values));db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}};
  return {db,DB};
}

test('H-BODY and core 4 register idempotently without inventing power, grants, recipes or drop rates',async()=>{
  const {db,DB}=fixture();
  try{
    await ensureHBodyEquipment({DB});await ensureBattleSuitCoreCatalog({DB});
    await ensureHBodyEquipment({DB});await ensureBattleSuitCoreCatalog({DB});
    const row=db.prepare('SELECT * FROM character_equipment_items WHERE code=?').get(H_BODY_ITEM.code);
    assert.equal(row.name,'H-BODY');assert.equal(row.slot,'BATTLE_SUIT');
    assert.equal(row.pve_power,0);assert.equal(row.pvp_power,0);
    assert.equal(row.supply_enabled,0);assert.equal(row.supply_weight,0);
    assert.equal(db.prepare('SELECT count(*) n FROM character_equipment_items').get().n,1);
    const core=db.prepare("SELECT * FROM inventory_items WHERE code='SUIT_CORE_4'").get();
    assert.equal(core.name,'슈트 코어 4');assert.equal(core.category,'MATERIAL');assert.equal(core.is_active,1);
    assert.equal(core.image_url,'assets/items/suit-core-4-v2066.png');
    const source=await read('functions/_battle_suit_h_body.js');
    assert.doesNotMatch(source,/INSERT (?:INTO|OR IGNORE INTO) (?:user_equipment|cnine_user_inventory|workshop_recipes|prime_)/i);
  }finally{db.close()}
});

test('H-BODY resource refresh preserves OWNER-edited balance and availability',async()=>{
  const {db,DB}=fixture();
  try{
    db.prepare(`INSERT INTO character_equipment_items(code,name,pve_power,total_power,pvp_power,is_active,is_public,supply_enabled,supply_weight,rarity) VALUES(?,'old',876543,876543,123,0,0,0,0,'MYTHIC')`).run(H_BODY_ITEM.code);
    await ensureHBodyEquipment({DB});
    const row=db.prepare('SELECT * FROM character_equipment_items WHERE code=?').get(H_BODY_ITEM.code);
    assert.deepEqual([row.pve_power,row.total_power,row.pvp_power,row.is_active,row.is_public,row.rarity],[876543,876543,0,0,0,'MYTHIC']);
    assert.equal(row.image_url,H_BODY_ITEM.image);
  }finally{db.close()}
});

test('failed H-BODY registration never records a completed migration or poisons retry',async()=>{
  const {db,DB}=fixture(),batch=DB.batch;
  try{
    let fail=true;DB.batch=async statements=>{if(fail){fail=false;throw Error('transient DB failure')}return batch(statements)};
    await assert.rejects(ensureHBodyEquipment({DB}),/transient/);
    assert.equal(db.prepare('SELECT count(*) n FROM app_meta WHERE key=?').get(H_BODY_UPGRADE_KEY).n,0);
    await ensureHBodyEquipment({DB});
    assert.equal(db.prepare('SELECT value FROM app_meta WHERE key=?').get(H_BODY_UPGRADE_KEY).value,'1');
    assert.match(BATTLE_SUIT_CORE_UPGRADE_KEY,/v2066/);
  }finally{db.close()}
});

test('H-BODY item art and separate V3 fallback are true RGBA with clear margins',async()=>{
  assert.equal(manifest.liveEnabled,true);assert.equal(manifest.scope,'PVE_ONLY');
  assert.equal(manifest.suit.code,H_BODY_ITEM.code);
  for(const asset of [...manifest.items,{image:manifest.suit.battleSprite,sha256:manifest.suit.sha256}]){
    const bytes=await readFile(file(asset.image)),meta=await sharp(bytes).metadata();
    assert.equal(sha(bytes),asset.sha256);assert.equal(meta.hasAlpha,true);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0;for(let o=3;o<data.length;o+=4)if(data[o]===0)clear++;
    assert.ok(clear>info.width*info.height*.15);
    for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0)}
    for(let y=0;y<info.height;y++){assert.equal(data[(y*info.width)*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0)}
  }
  const payload=__equipmentTest.publicEquippedItem({battle_suit_id:1,battle_suit_code:H_BODY_ITEM.code,battle_suit_image:H_BODY_ITEM.image,battle_suit_pve:456,battle_suit_pvp:99},'battle_suit',{pveOnly:true});
  assert.equal(payload.image,H_BODY_ITEM.image);assert.equal(payload.battleSprite,H_BODY_ITEM.battleSprite);assert.equal(payload.pvpPower,0);
});

test('six H-BODY profiles bind the real V3 catalog to byte-identical approved preview atlas rows',async()=>{
  assert.equal(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG).length,24);
  const preview=JSON.parse(await read('preview/battle-suit-prestige-v1/manifest.json'));
  assert.equal(Object.keys(manifest.profiles).length,6);
  for(const entry of manifest.entries){
    const profile=resolveAccountBattleSuitAnimation('BATTLE_SUIT_H_BODY',entry.weaponCode);
    assert.deepEqual(profile,entry.profile);assert.ok(profile.sheetUrl.startsWith('/assets/ui/'));
    assert.ok(Object.isFrozen(profile.pivots));
    const bytes=await readFile(file(profile.sheetUrl));assert.equal(sha(bytes),entry.atlasSha256);
    assert.equal(sha(bytes),preview.suits[0].entries[entry.weaponIndex].atlasSha256);
    const raw=await sharp(bytes).extract({left:0,top:profile.row*512,width:384,height:512}).ensureAlpha().raw().toBuffer();
    let bottom=-1,sumX=0,n=0;
    for(let y=0;y<512;y++)for(let x=0;x<384;x++)if(raw[(y*384+x)*4+3]>=16)bottom=Math.max(bottom,y);
    for(let y=bottom-8;y<=bottom;y++)for(let x=0;x<384;x++)if(raw[(y*384+x)*4+3]>=16){sumX+=x;n++}
    assert.equal(profile.contentBottom,bottom/512);assert.ok(Math.abs(profile.pivots.ready.x-sumX/n/384)<1e-9);
    assert.ok(profile.muzzle.x>.4&&profile.muzzle.x<1);assert.ok(profile.muzzle.y>0&&profile.muzzle.y<.6);
  }
});

test('H-BODY gold AR is uniformly enlarged; approved M200, SKS and heavy sniper stay locked',()=>{
  const ar=manifest.entries[4];
  assert.equal(ar.authored.placement.width,900);assert.equal(ar.authored.uniformScaleOnly,true);assert.equal(ar.authored.weaponRasterCopied,true);
  assert.ok(ar.authored.weaponLengthToFigureHeight>.64);assert.ok(Math.abs(ar.authored.aimAxisDegrees)<.1);
  const locks={2:'92B9FB66C5C2160E05168C03617DBC31B8D377BCE726C6A1E00C8F7732278EAC',3:'463D446D2C9DF31F236DBC06718EFF6A28927E7DF238CA8174AA8051AB77B082',5:'B68271FBB54155A393F82378E57620F640C09AA2FDB2D700A083F7FCDEF6EEEA'};
  for(const [index,expected] of Object.entries(locks))assert.equal(manifest.entries[Number(index)].sha256,expected);
});

test('H-BODY preserves server PVE support damage and excludes zero-power unconfigured items',()=>{
  const built=buildBattleSuitFighter({code:H_BODY_ITEM.code,pvePower:300000,weaponCode:'EQ_1788486929132'});
  const old=buildBattleSuitFighter({code:'BATTLE_SUIT_03',pvePower:300000,weaponCode:'EQ_1788486929132'});
  assert.equal(built.weaponClass,old.weaponClass);assert.equal(built.independentFireInterval,old.independentFireInterval);
  assert.equal(built.independentAttackMultiplier,old.independentAttackMultiplier);
  assert.equal(buildBattleSuitFighter({code:H_BODY_ITEM.code,pvePower:0}),null);
  assert.equal(BATTLE_SUIT_CORE_CATALOG.at(-1).code,'SUIT_CORE_4');
});

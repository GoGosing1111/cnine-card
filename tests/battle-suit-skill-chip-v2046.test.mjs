import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import sharp from 'sharp';
import {ensureSkillChipFoundation,handleSkillChips,skillChipPayload} from '../functions/_skill_chips.js';
import {SKILL_CHIP_CATALOG,SKILL_CHIP_MAX_SLOTS,SKILL_CHIP_RUNTIME_ENABLED,SKILL_CHIP_BALANCE_STATUS,skillChipByCode,skillChipDamage} from '../shared/battle-suit-skill-chips.mjs';

const ROCKET='SKILL_CHIP_ROCKET_LAUNCHER',HELI='SKILL_CHIP_HELICOPTER_AIRSTRIKE';
class Statement {
  constructor(owner,sql,values=[]){Object.assign(this,{owner,sql,values});}
  bind(...values){return new Statement(this.owner,this.sql,values);}
  async first(){return this.owner.db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:this.owner.db.prepare(this.sql).all(...this.values)};}
  async run(){return this.execute();}
  execute(){
    if(/^\s*SELECT\b/i.test(this.sql))return {results:this.owner.db.prepare(this.sql).all(...this.values)};
    const result=this.owner.db.prepare(this.sql).run(...this.values);
    return {results:[],meta:{changes:Number(result.changes)}};
  }
}
class TestD1 {
  constructor(dialect='d1'){
    this.db=new DatabaseSync(':memory:');this.dialect=dialect;this.schemaCalls=[];this.batchSql=[];
    this.db.exec(`
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,item_code));
    `);
  }
  prepare(sql){return new Statement(this,sql);}
  async execSchema(statements){this.schemaCalls.push(...statements);for(const sql of statements)this.db.exec(sql);}
  async batch(statements){
    this.batchSql.push(...statements.map(s=>s.sql));this.db.exec('BEGIN');
    try{const result=statements.map(s=>s.execute());this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
async function setup(t,dialect='d1'){
  const env={DB:new TestD1(dialect)};t.after(()=>env.DB.db.close());
  await ensureSkillChipFoundation(env);return env;
}
function own(env,userId,code,quantity=1){
  env.DB.db.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity').run(userId,code,quantity);
}
async function call(env,path,body,{userId=7,method='POST'}={}){
  const response=await handleSkillChips({path:`character/skill-chips${path}`,env,
    request:new Request(`https://test.invalid/api/character/skill-chips${path}`,{method,...(method==='GET'?{}:{body:JSON.stringify(body)})}),
    deps:{authenticate:async()=>userId===null?null:{id:userId},readBody:request=>request.json(),json:(body,status=200)=>Response.json(body,{status})}});
  return {status:response.status,...await response.json()};
}

test('catalog fixes the approved multipliers and independent 3s / 15s intervals',()=>{
  assert.equal(SKILL_CHIP_MAX_SLOTS,3);
  assert.deepEqual(SKILL_CHIP_CATALOG.map(x=>[x.code,x.damageMultiplier]),[[ROCKET,2.5],[HELI,5]]);
  assert.ok(Object.isFrozen(SKILL_CHIP_CATALOG)&&SKILL_CHIP_CATALOG.every(Object.isFrozen));
  assert.equal(skillChipByCode('unknown'),null);
  assert.equal(SKILL_CHIP_RUNTIME_ENABLED,true);
  assert.equal(SKILL_CHIP_BALANCE_STATUS,null);
  assert.deepEqual(SKILL_CHIP_CATALOG.map(chip=>chip.intervalMs),[3000,15000]);
});
test('independent formula rounds once and rejects unsafe or invalid amounts',()=>{
  assert.equal(skillChipDamage(100,ROCKET),250);
  assert.equal(skillChipDamage(101,ROCKET),253);
  assert.equal(skillChipDamage(100,HELI),500);
  assert.equal(skillChipDamage(0,ROCKET),0);
  for(const base of [-1,0.5,NaN,Infinity,'100',Number.MAX_SAFE_INTEGER])assert.throws(()=>skillChipDamage(base,ROCKET),RangeError);
  assert.throws(()=>skillChipDamage(100,'unknown'),RangeError);
});
test('foundation creates only catalog entries and never grants or consumes a chip',async t=>{
  const env=await setup(t);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM inventory_items').get().n,2);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').get().n,0);
  const payload=await skillChipPayload(env,7);
  assert.deepEqual(payload.loadout,[null,null,null]);
  assert.ok(payload.catalog.every(chip=>!chip.owned&&!chip.equipped&&chip.quantity===0));
  assert.equal(payload.battleEnabled,true);assert.equal(payload.damageBase,'BATTLE_SUIT_SINGLE_SHOT');
});
test('foundation is idempotent and does not overwrite CMS state or existing inventory',async t=>{
  const env=await setup(t);own(env,7,ROCKET,10);
  env.DB.db.prepare('UPDATE inventory_items SET is_active=0,name=? WHERE code=?').run('관리자 이름',ROCKET);
  env.DB.db.exec('DELETE FROM app_meta');
  await ensureSkillChipFoundation(env);await ensureSkillChipFoundation(env);
  assert.deepEqual({...env.DB.db.prepare('SELECT is_active,name FROM inventory_items WHERE code=?').get(ROCKET)},{is_active:0,name:'관리자 이름'});
  assert.equal(env.DB.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?').get(ROCKET).quantity,10);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM inventory_items').get().n,2);
});
test('PostgreSQL uses the adapter schema escape hatch, not ignored prepared DDL',async t=>{
  const env=await setup(t,'postgres');
  assert.equal(env.DB.schemaCalls.length,1);
  assert.match(env.DB.schemaCalls[0],/^CREATE TABLE IF NOT EXISTS user_skill_chip_loadout_v2046/);
  assert.ok(env.DB.batchSql.every(sql=>!/^CREATE\b/.test(sql)));
  own(env,7,ROCKET);
  assert.equal((await call(env,'/equip',{slot:1,code:ROCKET})).status,200);
  await ensureSkillChipFoundation(env);assert.equal(env.DB.schemaCalls.length,1);
});
test('all chip endpoints require authentication before reading or creating the database',async()=>{
  for(const [path,method] of [['','GET'],['/equip','POST'],['/unequip','POST']]){
    const result=await call({DB:null},path,{slot:1,code:ROCKET},{userId:null,method});
    assert.equal(result.status,401);
  }
});
test('bad methods, codes, bodies and out-of-range slots are rejected without a write',async t=>{
  const env=await setup(t);own(env,7,ROCKET);
  for(const slot of [0,4,-1,1.5,'1',null])assert.equal((await call(env,'/equip',{slot,code:ROCKET})).status,400);
  for(const code of ['NOT_A_CHIP',null,ROCKET.toLowerCase(),`${ROCKET}' OR 1=1 --`])assert.equal((await call(env,'/equip',{slot:1,code})).status,400);
  for(const body of [null,[],42])assert.equal((await call(env,'/equip',body)).status,400);
  assert.equal((await call(env,'/equip',null,{method:'GET'})).status,404);
  assert.equal((await call(env,'/unknown',{})).status,404);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM user_skill_chip_loadout_v2046').get().n,0);
});
test('equipping and removing do not consume inventory and preserve all three slots',async t=>{
  const env=await setup(t);own(env,7,ROCKET,10);own(env,7,HELI);
  assert.deepEqual((await call(env,'/equip',{slot:1,code:ROCKET})).skillChips.loadout,[ROCKET,null,null]);
  const result=await call(env,'/equip',{slot:3,code:HELI});
  assert.deepEqual(result.skillChips.loadout,[ROCKET,null,HELI]);
  assert.equal(result.skillChips.catalog.find(c=>c.code===ROCKET).quantity,10);
  assert.equal(result.skillChips.catalog.find(c=>c.code===HELI).slot,3);
  assert.deepEqual((await call(env,'/unequip',{slot:1,code:ROCKET})).skillChips.loadout,[null,null,HELI]);
  assert.deepEqual(env.DB.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 ORDER BY item_code').all().map(x=>x.quantity),[1,10]);
});
test('same-slot retry is idempotent but duplicate chips in another slot fail atomically',async t=>{
  const env=await setup(t);own(env,7,ROCKET,10);own(env,7,HELI);
  await call(env,'/equip',{slot:1,code:ROCKET});await call(env,'/equip',{slot:2,code:HELI});
  assert.equal((await call(env,'/equip',{slot:1,code:ROCKET})).status,200);
  assert.equal((await call(env,'/equip',{slot:2,code:ROCKET})).status,409);
  assert.deepEqual((await skillChipPayload(env,7)).loadout,[ROCKET,HELI,null]);
  assert.throws(()=>env.DB.db.prepare('INSERT INTO user_skill_chip_loadout_v2046(user_id,slot_no,item_code) VALUES(7,3,?)').run(ROCKET),/UNIQUE/);
  assert.throws(()=>env.DB.db.prepare('INSERT INTO user_skill_chip_loadout_v2046(user_id,slot_no,item_code) VALUES(7,4,?)').run('FUTURE_CHIP'),/CHECK/);
});
test('unowned or inactive items cannot replace a valid loadout',async t=>{
  const env=await setup(t);own(env,7,ROCKET);await call(env,'/equip',{slot:1,code:ROCKET});
  assert.equal((await call(env,'/equip',{slot:1,code:HELI})).status,403);
  own(env,7,HELI,0);assert.equal((await call(env,'/equip',{slot:1,code:HELI})).status,403);
  own(env,7,HELI);env.DB.db.prepare('UPDATE inventory_items SET is_active=0 WHERE code=?').run(HELI);
  assert.equal((await call(env,'/equip',{slot:1,code:HELI})).status,403);
  assert.deepEqual((await skillChipPayload(env,7)).loadout,[ROCKET,null,null]);
});
test('revoked inventory and disabled chips are excluded from authoritative loadout snapshots',async t=>{
  const env=await setup(t);own(env,7,ROCKET);own(env,7,HELI);
  await call(env,'/equip',{slot:1,code:ROCKET});await call(env,'/equip',{slot:2,code:HELI});
  own(env,7,ROCKET,0);env.DB.db.prepare('UPDATE inventory_items SET is_active=0 WHERE code=?').run(HELI);
  const result=await skillChipPayload(env,7);
  assert.deepEqual(result.loadout,[null,null,null]);assert.ok(result.catalog.every(c=>!c.equipped&&c.slot===null));
});
test('ownership, equip and unequip are isolated to the authenticated user',async t=>{
  const env=await setup(t);own(env,7,ROCKET);await call(env,'/equip',{slot:1,code:ROCKET});
  assert.equal((await call(env,'/equip',{slot:1,code:ROCKET,userId:7},{userId:8})).status,403);
  await call(env,'/unequip',{slot:1,code:ROCKET,userId:7},{userId:8});
  assert.deepEqual((await skillChipPayload(env,7)).loadout,[ROCKET,null,null]);
  assert.deepEqual((await skillChipPayload(env,8)).loadout,[null,null,null]);
  own(env,8,ROCKET);assert.equal((await call(env,'/equip',{slot:1,code:ROCKET},{userId:8})).status,200);
});
test('stale-tab unequip cannot delete a different chip recently equipped into that slot',async t=>{
  const env=await setup(t);own(env,7,ROCKET);own(env,7,HELI);
  await call(env,'/equip',{slot:1,code:ROCKET});await call(env,'/equip',{slot:1,code:HELI});
  assert.deepEqual((await call(env,'/unequip',{slot:1,code:ROCKET})).skillChips.loadout,[HELI,null,null]);
  assert.deepEqual((await call(env,'/unequip',{slot:1,code:HELI})).skillChips.loadout,[null,null,null]);
});
test('live asset loader includes styles and puts skill chips immediately to the right of avatar',async()=>{
  const [ui,app,preview]=await Promise.all(['../js/character-loadout-v2.js','../js/app.js','../preview/battle-suit-skill-chip-v1/source/skill-chip-loadout-preview.mjs'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
  assert.match(ui,/\$\{avatarEntry\}\$\{chipEntry\}/);
  assert.match(app,/css\/character-skill-chips-v2046\.css\?v=1/);
  assert.match(app,/character-loadout-v2\.js\?v=16-skill-chip-runtime/);
  assert.doesNotMatch(preview,/\bfetch\s*\(/);
  assert.match(preview,/battleEnabled:true/);
});
test('inventory seeds the chip catalog but chips are equipped, never consumed through item-use',async()=>{
  const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/if\(path==='inventory'\)\{[\s\S]{0,220}await ensureSkillChipFoundation\(env\)/);
  assert.match(api,/WHEN i\.category='SKILL_CHIP' THEN 0/);
  assert.match(api,/장비 → 스킬칩 탭에서 장착/);
});
test('each registry icon has 512px transparent PNG and lossless WebP with recorded provenance',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/ui/project-v/skill-chips/manifest-v1.json',import.meta.url),'utf8'));
  assert.equal(manifest.assets.length,2);
  for(const chip of SKILL_CHIP_CATALOG){
    const path=new URL(`..${chip.image}`,import.meta.url),bytes=await readFile(path),metadata=await sharp(bytes).metadata();
    assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.hasAlpha,true);
    const stats=await sharp(bytes).stats();assert.equal(stats.channels[3].min,0);
    assert.match(JSON.stringify(manifest),new RegExp(createHash('sha256').update(bytes).digest('hex')));
    const png=await sharp(await readFile(new URL(path.href.replace(/\.webp$/,'.png')))).metadata();
    assert.equal(png.width,512);assert.equal(png.height,512);assert.equal(png.hasAlpha,true);
  }
});

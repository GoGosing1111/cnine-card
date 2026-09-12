import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleEquipmentForgePublic,FORGE_SETTINGS_KEY,FORGE_EXECUTION_IMPLEMENTED} from '../functions/_equipment_forge_public.js';
async function fixture(){
  const pg=new PGlite();await pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE admin_logs(id SERIAL,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT);INSERT INTO users VALUES(1,5000000000),(2,8000000000);
    CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,total_power INT,pve_power INT,pvp_power INT,is_active INT,is_public INT);
    CREATE TABLE user_equipment_instances(id BIGINT PRIMARY KEY,user_id BIGINT,equipment_id BIGINT,acquired_at TEXT);
    CREATE TABLE user_equipment_loadout(user_id BIGINT,slot TEXT,instance_id BIGINT,PRIMARY KEY(user_id,slot));
    INSERT INTO character_equipment_items VALUES(1,'RIFLE','검수 무기','WEAPON','RIFLE','MYTHIC','assets/rifle.png',100,50,50,1,1),(2,'TOP','검수 상의','TOP','TOP','MYTHIC','assets/top.png',100,50,50,1,1),(3,'BOTTOM','검수 하의','BOTTOM','BOTTOM','RARE','assets/bottom.png',70,35,35,1,1),(4,'SHOES','검수 신발','SHOES','SHOES','RARE','assets/shoes.png',50,25,25,1,1),(5,'ACCESSORY','검수 장신구','ACCESSORY','DUAL_DISK','RARE','assets/accessory.png',50,25,25,1,1),(6,'SUIT','배틀슈트','BATTLE_SUIT','BATTLE_SUIT','MYTHIC','assets/suit.png',300,300,0,1,1),(7,'SECRET','비공개','TOP','TOP','MYTHIC','assets/hidden.png',100,50,50,1,0),(8,'INACTIVE','비활성','SHOES','SHOES','MYTHIC','assets/inactive.png',100,50,50,0,1);
    INSERT INTO user_equipment_instances VALUES(11,1,1,'today'),(12,1,2,'today'),(13,1,2,'today'),(14,1,3,'today'),(15,1,4,'today'),(16,1,5,'today'),(17,1,6,'today'),(18,1,7,'today'),(19,1,8,'today'),(20,2,2,'today');
    INSERT INTO user_equipment_loadout VALUES(1,'TOP',13),(2,'TOP',12),(1,'SHOES',13);`);
  let fail='',calls=0;
  const client={async query(input){calls++;const sql=typeof input==='string'?input:input.text;if(fail&&sql.includes(fail))throw Error('audit fault');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const call=(action='state',options={})=>handleEquipmentForgePublic({env,path:action==='admin'?'admin/equipment-forge':'character/equipment/forge/'+action,request:new Request('https://qa.test/api/'+action+(options.query||''),{method:options.method||'GET',...(options.body?{body:JSON.stringify(options.body)}:{})}),deps:{authenticate:async()=>options.anonymous?null:{id:options.userId||1},requirePermission:async()=>options.denied?null:{id:1,role:options.role||'OWNER'},json:(body,status=200)=>({body,status})}});
  return {pg,env,call,count:()=>calls,rows:async sql=>(await pg.query(sql)).rows,failOn:s=>{fail=s;},close:()=>pg.close()};
}
const settings=(revision=0,extra={})=>({expectedRevision:revision,settings:{publicVisible:true,executionMode:'OFF',notice:'무기·방어구 공개',...extra}});
test('public disclosure defaults ON, approved power is available, execution OFF and other policies unset',async()=>{
  const f=await fixture();try{const r=await f.call('status',{anonymous:true});assert.equal(r.status,200);assert.equal(r.body.publicVisible,true);assert.equal(r.body.canEnhance,false);assert.equal(r.body.canRestore,false);assert.equal(r.body.executionMode,'OFF');assert.equal(r.body.rules.minimumSuccessPercent,10);assert.equal(r.body.rules.boxAcquisition,false);assert.equal(r.body.policy.rates,null);assert.deepEqual(r.body.supportedSlots,['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']);assert.equal((await f.rows('SELECT * FROM app_meta')).length,0);}finally{await f.close();}
});
test('approved power is identical in status and CMS while save preserves the execution lock',async()=>{
  const f=await fixture();try{
    const status=await f.call('status'),admin=await f.call('admin');
    assert.equal(status.body.policy.maxLevel,10);assert.deepEqual(status.body.policy.powerScaling.bonusPercentByLevel,[0,6,12,18,24,30,36,42,48,80,120]);
    assert.deepEqual(status.body.policy.powerScaling,admin.body.powerStandard);
    const saved=await f.call('admin',{method:'PATCH',body:settings()});assert.deepEqual(saved.body.powerStandard,admin.body.powerStandard);assert.equal(saved.body.executionReady,false);
    assert.equal((await f.call('enhance',{method:'POST'})).status,423);
  }finally{await f.close();}
});
test('read-only account inventory separates duplicates and includes every armor slot without hidden or foreign items',async()=>{
  const f=await fixture();try{const before=await f.rows('SELECT * FROM user_equipment_loadout');const r=await f.call();assert.equal(r.status,200);assert.deepEqual(r.body.items.map(x=>x.instanceId),['16','15','14','13','12','11']);assert.equal(r.body.wallet.coins,'5000000000');assert.deepEqual(r.body.items.filter(x=>x.equipped).map(x=>x.instanceId),['13']);assert.ok(r.body.items.every(x=>x.enhancement===null));
    const page=await f.call('state',{query:'?group=armor&limit=2'});assert.deepEqual(page.body.items.map(x=>x.instanceId),['15','14']);assert.equal(page.body.nextCursor,'14');const next=await f.call('state',{query:'?group=armor&limit=2&beforeId=14'});assert.deepEqual(next.body.items.map(x=>x.instanceId),['13','12']);assert.equal(next.body.nextCursor,null);
    assert.deepEqual((await f.call('state',{query:'?group=weapon'})).body.items.map(x=>x.slot),['WEAPON']);assert.deepEqual((await f.call('state',{query:'?group=accessory'})).body.items.map(x=>x.slot),['ACCESSORY']);
    assert.deepEqual(await f.rows('SELECT * FROM user_equipment_loadout'),before);assert.equal((await f.rows('SELECT coin FROM users WHERE id=1'))[0].coin,5000000000);
  }finally{await f.close();}
});
test('authentication and OWNER checks precede private queries or settings writes',async()=>{
  const f=await fixture();try{assert.equal((await f.call('state',{anonymous:true})).status,401);assert.equal((await f.call('enhance',{anonymous:true,method:'POST',body:{userId:2}})).status,401);for(const role of ['USER','ADMIN','SUPPORT','CARD_MANAGER'])assert.equal((await f.call('admin',{role,method:'PATCH',body:settings()})).status,403);assert.equal(f.count(),0);}finally{await f.close();}
});
test('all execution endpoints reject OFF and forged client flags without spending or changing equipment',async()=>{
  const f=await fixture();try{const tables=['users','user_equipment_instances','user_equipment_loadout'];const before=await Promise.all(tables.map(t=>f.rows('SELECT * FROM '+t)));for(const action of ['quote','enhance','restore','receipt']){const r=await f.call(action,{method:'POST',body:{userId:2,instanceId:'12',liveEnabled:true,executionMode:'ON',roll:0}});assert.equal(r.status,423);assert.equal(r.body.code,'FORGE_OFF');}assert.deepEqual(await Promise.all(tables.map(t=>f.rows('SELECT * FROM '+t))),before);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,0);}finally{await f.close();}
});
test('CMS cannot enable an unfinished engine and a manually changed DB ON fails closed',async()=>{
  const f=await fixture();try{assert.equal(FORGE_EXECUTION_IMPLEMENTED,false);assert.equal((await f.call('admin',{method:'PATCH',body:settings(0,{executionMode:'ON'})})).status,409);const forced={schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'forced'};await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[FORGE_SETTINGS_KEY,JSON.stringify(forced)]);assert.equal((await f.call('enhance',{method:'POST'})).status,503);assert.equal((await f.call('status')).body.canEnhance,false);assert.equal((await f.rows('SELECT count(*) AS count FROM user_equipment_instances'))[0].count,10);}finally{await f.close();}
});
test('settings persist atomically, stale revisions conflict and visibility OFF hides account inventory',async()=>{
  const f=await fixture();try{const saved=await f.call('admin',{method:'PATCH',body:settings()});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.settings.revision,1);assert.equal((await f.call('admin',{method:'PATCH',body:settings()})).status,409);f.failOn('INSERT INTO admin_logs');await assert.rejects(f.call('admin',{method:'PATCH',body:settings(1,{publicVisible:false})}),/audit fault/);f.failOn('');assert.equal((await f.call('status')).body.publicVisible,true);assert.equal((await f.call('admin')).body.settings.revision,1);assert.equal((await f.call('admin',{method:'PATCH',body:settings(1,{publicVisible:false})})).status,200);assert.equal((await f.call()).status,403);assert.equal((await f.rows('SELECT * FROM admin_logs')).length,2);}finally{await f.close();}
});
test('input limits and corrupted settings fail closed',async()=>{
  const f=await fixture();try{for(const query of ['?group=BATTLE_SUIT','?group=__proto__','?limit=101','?limit=0','?beforeId=0','?beforeId=1%20OR%201=1'])assert.equal((await f.call('state',{query})).status,400);assert.equal((await f.call('admin',{method:'PATCH',body:settings(0,{notice:'a'.repeat(501)})})).status,400);await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[FORGE_SETTINGS_KEY,'not-json']);assert.equal((await f.call('status')).body.publicVisible,false);assert.equal((await f.call()).status,403);}finally{await f.close();}
});
test('live host imports approved presentation only, has a real inventory entry and no simulator',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.match(read('equipment-forge/app.mjs'),/class EquipmentPresentation extends ForgeFX/);assert.doesNotMatch(read('equipment-forge/app.mjs'),/ForgeSimulation|DEFAULT_RATES|Math\.random|method:\s*['"]POST/);
  const html=read('equipment-forge/index.html');assert.match(html,/data-filter="armor"/);assert.doesNotMatch(html,/source\/app\.mjs|showcase|quick-success|rates-form|12,840,000|30%|금룡 돌격소총/);assert.match(html,/id="enhance-button"[^>]*disabled/);assert.match(read('js/character-loadout-v2-live.js'),/forgePublicEntry: true/);assert.match(read('js/character-loadout-v2.js'),/href="\/equipment-forge\/"/);assert.match(read('js/app.js'),/character-loadout-v2\.js\?v=2084-forge-public/);assert.match(read('index.html'),/js\/app\.js\?v=2088-land-rewards/);assert.match(read('service-worker.js'),/shell-v2088-land-rewards/);
});

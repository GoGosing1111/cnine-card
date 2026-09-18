import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {registerApocalypseLegion,OPERATION_KEY} from '../scripts/ops/apocalypse-legion-release-20260918.mjs';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';

test('Postgres registration rolls back preview, preserves existing CMS, requires assets, and is idempotent',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
   CREATE TABLE battle_monsters(id bigint PRIMARY KEY,name text,image_url text,battle_power bigint,reward_coin bigint,is_boss int,is_active int,sort_order int,pve_tab text,pve_display_order int,pve_enabled int,tower_enabled int,tower_only int,ultimate_enabled int,ultimate_name text,ultimate_description text);
   CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);
   CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
   INSERT INTO users VALUES(1,'OWNER','ACTIVE');
   INSERT INTO battle_monsters(id,name,pve_display_order) VALUES(74,'센쥬 하시라마',38);`);
  const settings={enabled:true,monsterProfiles:{74:{battlePower:5500000,rewardCoin:600000,rewardPercent:1000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:70,attackCount:2,forcedActionEvery:4}},unrelated:'keep'};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['battle_apocalypse_settings_v1',JSON.stringify(settings)]);
  const client={async query(sql,args){const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};}};
  const plan=await registerApocalypseLegion(client);assert.equal(plan.committed,false);assert.equal(plan.registered.length,2);
  assert.equal((await db.query('SELECT * FROM battle_monsters')).rows.length,1);assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,0);
  await assert.rejects(registerApocalypseLegion(client,{commit:true}),/Published asset not verified/);
  const assets=APOCALYPSE_LEGION_BOSSES.flatMap(b=>['-source.jpg','-sd-v1.png','-seal-sheet.png','-curse-sheet.png','-ultimate-sheet.png'].map(s=>({path:'/verified/'+b.key+s,verified:true})));
  const saved=await registerApocalypseLegion(client,{commit:true,assets});assert.equal(saved.committed,true);assert.deepEqual(saved.registered.map(r=>r.battlePower),[7500000,10000000]);assert(saved.registered.every(r=>r.effectiveRewardCoin===6000000&&r.minions===6));
  const after=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',['battle_apocalypse_settings_v1'])).rows[0].value);assert.deepEqual(after.monsterProfiles['74'],settings.monsterProfiles['74']);assert.equal(after.unrelated,'keep');
  const repeat=await registerApocalypseLegion(client,{commit:true,assets});assert.equal(repeat.replayed,true);assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await db.query('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
 }finally{await db.close();}
});

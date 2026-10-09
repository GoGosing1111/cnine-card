import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readCitySettings} from '../../functions/_jokgak_city_settings.js';
import {validateCitySettings} from '../../shared/jokgak-city-settings-v1.mjs';
import {cityShift} from '../../shared/jokgak-city-v1.mjs';
import {CITY_WEAPONS} from '../../shared/jokgak-city-expansion-v1.mjs';
export const CITY_HEALTH_OPERATION='ops:jokgak-city-expansion:20261010:health-v1';
export const CITY_EXPANSION_OPERATION='ops:jokgak-city-expansion:20261010:policy-v1';
const key='jokgak_city_settings_v1';
async function operation(client,id,apply,work){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='60s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
  const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(db.db,'cnine');assert.equal(db.recovery,false);
  const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[id])).rows[0];if(previous){await client.query('ROLLBACK');return {...JSON.parse(previous.value),replayed:true};}
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner,'an active owner must exist');
  const {result,backup,after,type,target}=await work(owner);
  await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[owner.id,type,'JOKGAK_CITY',target,JSON.stringify(backup),JSON.stringify(after)]);
  for(const [suffix,value] of [[':backup',backup],['',result]])await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[id+suffix,JSON.stringify(value)]);
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
// Phase 1 is backwards compatible: expand the city-only CHECK before publishing
// code capable of storing 150 HP. Do not activate the new policy in this phase.
export async function migrateCityHealth(client,{apply=false,now=Date.now()}={}){
 return operation(client,CITY_HEALTH_OPERATION,apply,async()=>{
  const rows=(await client.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='jokgak_city_players_v1'::regclass AND contype='c'")).rows;
  const health=rows.filter(r=>/\bhealth\b/.test(r.definition));assert.equal(health.length,1);assert.equal(health[0].conname,'jokgak_city_players_v1_health_check');
  assert.match(health[0].definition,/health >= 0/);assert.match(health[0].definition,/health <= (100|1000)\)/);
  const changed=!/health <= 1000\)/.test(health[0].definition);
  if(changed)await client.query('ALTER TABLE jokgak_city_players_v1 DROP CONSTRAINT jokgak_city_players_v1_health_check, ADD CONSTRAINT jokgak_city_players_v1_health_check CHECK (health BETWEEN 0 AND 1000)');
  return {result:{operation:CITY_HEALTH_OPERATION,at:new Date(now).toISOString(),maxStoredHealth:1000,changed,accountCashChanged:false},backup:health[0],after:{check:'health BETWEEN 0 AND 1000'},type:'JOKGAK_CITY_HEALTH_MIGRATION',target:'jokgak_city_players_v1'};
 });
}
// Phase 2 runs only after the new application is deployed. Preserve the latest
// operator mode and unrelated settings; no cash grants or free weapons.
export async function applyCityExpansion(client,{apply=false,now=Date.now()}={}){
 return operation(client,CITY_EXPANSION_OPERATION,apply,async owner=>{
  const health=(await client.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='jokgak_city_players_v1'::regclass AND conname='jokgak_city_players_v1_health_check'")).rows[0];assert.match(health?.definition||'',/health <= 1000\)/,'health migration must precede policy');
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0];assert.ok(saved);
  const {policy}=await readCitySettings({DB:{prepare:()=>({bind:()=>({first:async()=>saved})})}});
  const next=structuredClone(policy),oldMax=next.roles.find(r=>r.code==='POLICE').maxHealth;
  next.roles.find(r=>r.code==='POLICE').maxHealth=150;
  for(const w of next.arsenal.weapons)w.price=CITY_WEAPONS.find(c=>c.code===w.code).price;
  Object.assign(next.facilities.motel,{enabled:true,stayMs:900000,cooldownMs:3600000});next.facilities.hospital.maxStayMs=300000;
  validateCitySettings(next);
  const epoch=cityShift(now).id,players=(await client.query('SELECT * FROM jokgak_city_players_v1 WHERE epoch=$1 ORDER BY user_id FOR UPDATE',[epoch])).rows;
  const seed=(await client.query("SELECT value FROM app_meta WHERE key='jokgak_city_role_seed_v1'")).rows[0]?.value;
  const weightKey='jokgak_city_role_weights_v1:'+epoch,storedWeights=(await client.query('SELECT value FROM app_meta WHERE key=$1',[weightKey])).rows[0]?.value;
  const weights=storedWeights?JSON.parse(storedWeights):policy.roles.map(({code,weight})=>({code,weight}));
  if(players.length){assert.ok(seed);await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[weightKey,JSON.stringify(weights)]);}
  const backupPlayers=[];
  for(const player of players){
   let point=createHmac('sha256',seed).update(`${epoch}:${player.user_id}`).digest().readUInt32BE(0)%weights.reduce((n,r)=>n+r.weight,0);
   const role=weights.find(r=>(point-=r.weight)<0).code;if(role!=='POLICE')continue;
   const lifeRow=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',['jokgak_city_life_v1:'+player.user_id])).rows[0];
   const death=lifeRow?JSON.parse(lifeRow.value).death:null;
   if(Number(player.health)<=0||death&&!death.resolved)continue;
   const hp=Math.min(150,Math.max(1,Number(player.health)+150-oldMax));
   if(hp===Number(player.health))continue;
   backupPlayers.push(player);await client.query('UPDATE jokgak_city_players_v1 SET health=$1,revision=revision+1 WHERE user_id=$2',[hp,player.user_id]);
  }
  const stored={...JSON.parse(saved.value),...next,revision:policy.revision+1,updatedBy:Number(owner.id),updatedAt:new Date(now).toISOString(),writeToken:randomUUID()};
  await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(stored),key]);
  const result={operation:CITY_EXPANSION_OPERATION,at:stored.updatedAt,mode:stored.mode,revision:stored.revision,weaponPrices:next.arsenal.weapons.map(({code,price,power})=>({code,price,power})),basePower:next.arsenal.basePower,facilities:next.facilities,policeMaxHealth:150,policeHealthAdjusted:backupPlayers.length,accountCashChanged:false,otherSettingsPreserved:true};
  return {result,backup:{policy:saved.value,players:backupPlayers,weights:storedWeights??null},after:stored,type:'JOKGAK_CITY_EXPANSION',target:key};
 });
}

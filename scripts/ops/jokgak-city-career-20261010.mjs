import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCitySettings} from '../../functions/_jokgak_city_settings.js';
import {validateCitySettings} from '../../shared/jokgak-city-settings-v1.mjs';
import {defaultCityCareer} from '../../shared/jokgak-city-career-v1.mjs';
export const CITY_CAREER_OPERATION='ops:jokgak-city-career:20261010:v1';
// Settings activation only. User wallets are untouched until server settlement
// at the next common shift. Preserve the operator's latest OFF/TEST/ON choice.
export async function applyCityCareer(client,{apply=false,now=Date.now()}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[CITY_CAREER_OPERATION]);
  const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(db.db,'cnine');assert.equal(db.recovery,false);
  const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[CITY_CAREER_OPERATION])).rows[0];if(previous){await client.query('ROLLBACK');return {...JSON.parse(previous.value),replayed:true};}
  const key='jokgak_city_settings_v1',row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0];assert.ok(row);
  const {policy}=await readCitySettings({DB:{prepare:()=>({bind:()=>({first:async()=>row})})}});assert.equal(policy.career.enabled,false,'Career already enabled: preserve operator edits and review first.');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  const next={...JSON.parse(row.value),career:{...defaultCityCareer(),enabled:true,startedAt:now},revision:policy.revision+1,updatedBy:Number(owner.id),updatedAt:new Date(now).toISOString(),writeToken:randomUUID()};
  const {writeToken,...checked}=next;validateCitySettings(checked);
  await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(next),key]);
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'JOKGAK_CITY_CAREER','APP_META',$2,$3,$4)",[owner.id,key,row.value,JSON.stringify(next)]);
  const result={operation:CITY_CAREER_OPERATION,at:next.updatedAt,mode:next.mode,revision:next.revision,career:next.career,accountAssetsChanged:false,otherSettingsPreserved:true};
  for(const [suffix,value] of [[':backup',{policy:row.value}],['',result]])await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CITY_CAREER_OPERATION+suffix,JSON.stringify(value)]);
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

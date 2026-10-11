import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCitySettings} from '../../functions/_jokgak_city_settings.js';
import {validateCitySettings} from '../../shared/jokgak-city-settings-v1.mjs';
import {defaultCityCareer} from '../../shared/jokgak-city-career-v1.mjs';
import {cityShift} from '../../shared/jokgak-city-v1.mjs';
export const CITY_JOBS_OPERATION='ops:jokgak-city-jobs:20261011:v1';
// Change only the work catalog. Hourly income, wallets, mode, existing work
// durations/cooldowns and any operator-disabled jobs retain their saved values.
export async function applyCityJobsExpansion(client,{apply=false,now=Date.now()}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[CITY_JOBS_OPERATION]);
  const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(db.db,'cnine');assert.equal(db.recovery,false);
  const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[CITY_JOBS_OPERATION])).rows[0];
  if(previous){await client.query('ROLLBACK');return {...JSON.parse(previous.value),replayed:true};}
  const key='jokgak_city_settings_v1',row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0];assert.ok(row);
  const stored=JSON.parse(row.value),{policy}=await readCitySettings({DB:{prepare:()=>({bind:()=>({first:async()=>row})})}});
  assert.ok(stored.career?.enabled,'Review inactive career policy before updating jobs.');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  // Freeze both modes even when the city is OFF, so reopening it cannot change
  // wages halfway through this shift. Existing snapshots are never overwritten.
  const shift=cityShift(now);
  for(const mode of ['TEST','ON'])await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',['jokgak_city_career_policy_v1:'+mode+':'+shift.id,JSON.stringify(policy.career)]);
  const jobs=defaultCityCareer().jobs.map(base=>{
   const saved=stored.career.jobs.find(j=>j.code===base.code);
   return saved?{...saved,cash:Math.max(saved.cash,base.cash)}:base;
  });
  const next={...stored,career:{...stored.career,jobs},revision:policy.revision+1,updatedBy:Number(owner.id),updatedAt:new Date(now).toISOString(),writeToken:randomUUID()};
  const {writeToken,...checked}=next;validateCitySettings(checked);
  await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(next),key]);
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'JOKGAK_CITY_JOBS_EXPANSION','APP_META',$2,$3,$4)",[owner.id,key,row.value,JSON.stringify(next)]);
  const result={operation:CITY_JOBS_OPERATION,at:next.updatedAt,effectiveAt:new Date(shift.endsAt).toISOString(),mode:next.mode,revision:next.revision,beforeJobs:stored.career.jobs,jobs,accountAssetsChanged:false,otherSettingsPreserved:true};
  for(const [suffix,value] of [[':backup',{policy:row.value}],['',result]])await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CITY_JOBS_OPERATION+suffix,JSON.stringify(value)]);
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

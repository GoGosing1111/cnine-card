import assert from 'node:assert/strict';

export const CITY_TEST_OPERATION='ops:jokgak-city-test:20261009:v1';
export async function putCityInTest(client,{apply=false}={}){
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[CITY_TEST_OPERATION]);
    const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];
    assert.equal(db.db,'cnine');assert.equal(db.recovery,false);
    const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[CITY_TEST_OPERATION])).rows[0];
    if(saved){await client.query('ROLLBACK');return {...JSON.parse(saved.value),replayed:true};}
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
    const key='jokgak_city_settings_v1',raw=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value;
    const before=raw?JSON.parse(raw):{};
    // The currently deployed v1 reads enabled only. Close it immediately while
    // the explicit TEST/OWNER/tester access policy is being connected.
    const next={...before,mode:'TEST',enabled:false,testUserIds:before.testUserIds||[],revision:(before.revision||0)+1,updatedBy:Number(owner.id),updatedAt:new Date().toISOString()};
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[key,JSON.stringify(next)]);
    const result={operation:CITY_TEST_OPERATION,at:next.updatedAt,mode:'TEST',legacyEnabled:false,testUserCount:next.testUserIds.length,revision:next.revision,accountBalancesChanged:false};
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'JOKGAK_CITY_TEST','APP_META',$2,$3,$4)",[owner.id,key,raw||null,JSON.stringify(next)]);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CITY_TEST_OPERATION,JSON.stringify(result)]);
    await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

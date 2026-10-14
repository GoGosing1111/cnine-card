import assert from 'node:assert/strict';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {readTrophyHonors} from '../../functions/_trophy_honors.js';
import {parseTrophyManualGrants,trophyManualGrantsKey} from '../../functions/_trophy_manual_grants.js';
import {TROPHY_CATALOG} from '../../js/player-card-model-v2052.js';

// One explicitly authorized account and the eight trophy kinds existing today.
// Running this script later must never grant future additions automatically.
export const OPERATION_KEY='ops:all-trophies:1:20261014:v1';
export const AUTHORIZATION='핑크빛유두 모든 트로피 지급해';
export const TARGET={id:1,nickname:'핑크빛유두'};
export const TROPHY_CODES=Object.freeze(['DUO_CHALLENGER','CLAN_CHAMPION','CHALLENGER_STREAK_3','RANKED_CHAMPION','CLAN_CHAMPIONS_TROPHY','PREDICTION_STAKE_300T','CITY_TOP_25','LICH_KING_CLEAR_1000']);

export async function grantPinkAllTrophies(db,{dryRun=false}={}){
  assert.deepEqual(TROPHY_CATALOG.map(t=>t.code),TROPHY_CODES,'Recheck authorization if the trophy catalog changes');
  await db.query('BEGIN');
  try{
    const user=(await db.query('SELECT id,nickname,role,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id])).rows[0];
    assert.equal(user?.nickname,TARGET.nickname,'Target nickname must match exactly');
    assert.equal(user?.role,'OWNER');assert.equal(user?.status,'ACTIVE');
    const key=trophyManualGrantsKey(TARGET.id),env={DB:new __postgresCompatTest.PostgresD1Database(db)};
    const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    const raw=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value??null;
    const document=parseTrophyManualGrants(raw,TARGET.id),before=await readTrophyHonors(env,TARGET.id);
    if(previous){
      const receipt=JSON.parse(previous.value);
      assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
      assert.equal(receipt.userId,TARGET.id);assert.deepEqual(receipt.codes,TROPHY_CODES);
      assert.ok(TROPHY_CODES.every(code=>before[code].count>=1),'Recorded ownership is missing');
      const audit=(await db.query("SELECT id FROM admin_logs WHERE id=$1 AND action_type='TROPHY_MANUAL_GRANT' AND target_id=$2",[receipt.adminLogId,String(TARGET.id)])).rows;
      assert.equal(audit.length,1,'Recorded audit is missing');
      await db.query('ROLLBACK');return {dryRun,replayed:true,...receipt};
    }
    const completedAt=new Date().toISOString(),added=TROPHY_CODES.filter(code=>before[code].count<1);
    const afterDocument={...document,grants:[...document.grants,...added.map(code=>({code,grantedAt:completedAt,operationKey:OPERATION_KEY}))]};
    parseTrophyManualGrants(JSON.stringify(afterDocument),TARGET.id);
    await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(afterDocument)]);
    const after=await readTrophyHonors(env,TARGET.id);
    for(const code of TROPHY_CODES){
      assert.equal(after[code].count,Math.max(1,before[code].count));
      assert.equal(after[code].progress,before[code].progress,'Real milestone progress must not change');
    }
    const receipt={version:1,operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,userId:TARGET.id,nickname:TARGET.nickname,
      codes:TROPHY_CODES,added,preserved:TROPHY_CODES.filter(code=>!added.includes(code)),completedAt,before,after};
    const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'TROPHY_MANUAL_GRANT','USER',$2,$3,$4,$5) RETURNING id",
      [TARGET.id,String(TARGET.id),JSON.stringify({honors:before,manualGrants:document}),JSON.stringify(receipt),completedAt])).rows[0];
    assert.ok(audit?.id,'Grant audit required');receipt.adminLogId=String(audit.id);
    await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...receipt};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

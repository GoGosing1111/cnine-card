import {jointGuard, jointGuardEnd} from './_joint_atomic.js';
import {attendanceSql,comebackOwnedPower,COMEBACK_POWER_LIMIT} from './_comeback_power.js';
import {LOAN_PREFIX} from './_comeback_loans.js';
import {questPeriod} from './_quest_hub.js';

export const COMEBACK = Object.freeze({
  id: 'comeback-20261108-v1', days: 30, power: COMEBACK_POWER_LIMIT, coin: '3000000000000000',
  equipment: ['EMPEROR_TOP','EMPEROR_BOTTOM','EMPEROR_SHOES','EMPEROR_DUAL_DISK'],
  vehicle: 'BOREAS_OMEGA', followup: 'V-969'
});
const key = (kind,id) => COMEBACK.id + ':' + kind + ':' + id;
const utc = time => new Date(time).toISOString().slice(0,19).replace('T',' ');
const verifiedSql = `EXISTS(SELECT 1 FROM user_second_verifications v WHERE v.user_id=? AND v.provider IN ('PLAYDK','WAGO') AND TRIM(COALESCE(v.provider_user_id,''))<>'')`;
const normalSql = `EXISTS(SELECT 1 FROM users WHERE id=? AND role='USER' AND status='ACTIVE' AND (NULLIF(banned_until,'') IS NULL OR SUBSTR(REPLACE(banned_until,'T',' '),1,19)<=CURRENT_TIMESTAMP))`;
const clanSql = `EXISTS(SELECT 1 FROM organization_members_v1 m JOIN organization_rounds_v1 r ON r.id=m.round_id
  WHERE m.user_id=? AND r.scope='LIVE' AND r.phase='ASSIGNED' AND r.id=(SELECT id FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC,id DESC LIMIT 1))`;
const weeksSql = `SELECT DISTINCT week_key FROM quest_weekly_claims_v1 WHERE user_id=? AND status='COMPLETED' AND quest_id='POST'
  AND week_key>=? AND week_key<>? AND SUBSTR(REPLACE(created_at,'T',' '),1,19)>=? ORDER BY week_key LIMIT 2`;
const weekArgs=(id,g)=>[id,g.startWeek,g.alreadyCompletedWeek||'',g.startedAt];
const getReceipt=(env,type,id)=>env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key(type,id)).first();
const parseReceipt = row => row ? JSON.parse(row.value) : null;

const syncVersion='COALESCE((SELECT revision FROM account_sync_versions_v1 WHERE user_id=?),0)';
const duoVersion='COALESCE((SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=?),0)';
const policyVersion='COALESCE((SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1),0)';

export async function comebackState(env,id,deps={}){
  const DB=env.DB;
  const row=await DB.prepare(`SELECT
    (SELECT value FROM app_meta WHERE key=?) initial,(SELECT value FROM app_meta WHERE key=?) final,
    (SELECT value FROM app_meta WHERE key=?) dialogue_at,
    ${verifiedSql} verified,${normalSql} normal,${attendanceSql} days,
    ${syncVersion} sync_rev,${duoVersion} duo_rev,${policyVersion} policy_rev`).bind(key('initial',id),key('final',id),key('dialogue',id),id,id,id,id,id).first();
  if(!row||!Number(row.normal))return {phase:'INELIGIBLE'};
  const days=Number(row.days);
  if(!row.initial&&days<COMEBACK.days)return {phase:'INELIGIBLE',attendance:days,reason:'ATTENDANCE'};
  if(!Number(row.verified))return {phase:'VERIFY',attendance:days};
  if(!row.initial){
    const power=await (deps.ownedPower||comebackOwnedPower)(env,id,deps);
    const phase=power.total<=COMEBACK.power?'ELIGIBLE':'INELIGIBLE';
    return {phase,attendance:days,power,dialogueAt:row.dialogue_at,...(phase==='INELIGIBLE'?{reason:'POWER'}:{}),stamp:[row.sync_rev,row.duo_rev,row.policy_rev]};
  }
  const grant=JSON.parse(row.initial);
  if(row.final)return {phase:'COMPLETE',grant,final:JSON.parse(row.final)};
  const [weeks,clan]=await Promise.all([
    DB.prepare(weeksSql).bind(...weekArgs(id,grant)).all(),
    DB.prepare('SELECT '+clanSql+' AS member').bind(id).first()
  ]);
  return {phase:'MISSIONS',grant,weeks:weeks.results.map(r=>r.week_key),clan:!!Number(clan.member)};
}

async function grantInitial(env,id,now,qualifying) {
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
  const token=crypto.randomUUID(),startedAt=utc(now),expiresAt=utc(now+30*86400000),startWeek=questPeriod(now).weekKey;
  const prior=await p("SELECT week_key FROM quest_weekly_claims_v1 WHERE user_id=? AND week_key=? AND quest_id='POST' AND status='COMPLETED'",id,startWeek).first();
  const grant={dialogueStartedAt:qualifying.dialogueAt,attendance:qualifying.attendance,power:qualifying.power,startedAt,expiresAt,startWeek,alreadyCompletedWeek:prior?.week_key||null};
  const vehicle=COMEBACK.vehicle,items=COMEBACK.equipment,amount=COMEBACK.coin;
  const predicate=`${verifiedSql} AND ${normalSql} AND ${attendanceSql}>=30
    AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
    AND ${syncVersion}=? AND ${duoVersion}=? AND ${policyVersion}=?
    AND (SELECT COUNT(*) FROM quest_weekly_claims_v1 WHERE user_id=? AND week_key=? AND quest_id='POST' AND status='COMPLETED')=?
    AND (SELECT COUNT(*) FROM character_equipment_items WHERE code IN (?,?,?,?) AND is_active=1 AND is_public=1)=4
    AND EXISTS(SELECT 1 FROM character_garage_items WHERE code=? AND is_active=1 AND is_public=1)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin<=9223372036854775807-CAST(? AS BIGINT))`;
  const writes=[
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',id),p('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=? FOR UPDATE',id)]:[]),
    jointGuard(DB,token,predicate,[id,id,id,key('dialogue',id),qualifying.dialogueAt,id,qualifying.stamp[0],id,qualifying.stamp[1],qualifying.stamp[2],id,startWeek,prior?1:0,...items,vehicle,id,amount]),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?)',key('initial',id),JSON.stringify(grant),startedAt),
    p('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?',amount,id),
    p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,CAST(? AS BIGINT),coin,? FROM users WHERE id=?',amount,'컴백 유저 복귀 지원',id),
    p(`INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id,acquired_at)
       SELECT ?,id,'COMEBACK',?,? FROM character_garage_items WHERE code=?
       ON CONFLICT(user_id,garage_id) DO NOTHING`,id,COMEBACK.id,startedAt,vehicle)
  ];
  for(const code of items){
    const requestId=key('gear',id)+':'+code;
    const insert=`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id,acquired_at)
      SELECT ?,id,'COMEBACK',?,?,? FROM character_equipment_items WHERE code=?`;
    const inputs=[id,COMEBACK.id,requestId,startedAt,code];
    if(DB.dialect==='postgres'){
      writes.push(p(`WITH gear AS (${insert} RETURNING id,user_id)
        INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) SELECT id,user_id,10,1 FROM gear`,...inputs));
    }else{
      writes.push(p(insert,...inputs),p(`INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision)
        SELECT id,user_id,10,1 FROM user_equipment_instances WHERE id=last_insert_rowid() AND user_id=? AND request_id=?`,id,requestId));
    }
  }
  writes.push(p('DELETE FROM app_meta WHERE key=?',key('dialogue',id)),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?)',LOAN_PREFIX+id,expiresAt,startedAt),
    p('UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=?',id),
    jointGuardEnd(DB,token));
  try{await DB.batch(writes);return true;}catch(error){if(await getReceipt(env,'initial',id))return false;throw error;}
}

export async function grantComebackFinalIfReady(env,id){
  const initial=parseReceipt(await getReceipt(env,'initial',id));
  if(!initial || await getReceipt(env,'final',id))return false;
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),args=weekArgs(id,initial);
  const [weeks,clan]=await Promise.all([p(weeksSql,...args).all(),p('SELECT '+clanSql+' AS member',id).first()]);
  if(weeks.results.length!==2 || !Number(clan.member))return false;
  const token=crypto.randomUUID(),code=COMEBACK.followup,now=utc(Date.now()),receipt=key('final',id);
  const detail={at:now,code,weeks:weeks.results.map(r=>r.week_key)};
  const predicate=`${verifiedSql} AND ${normalSql} AND ${clanSql} AND (SELECT COUNT(*) FROM (${weeksSql}) w)=2`;
  try{
    await DB.batch([
      ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',id)]:[]),
      jointGuard(DB,token,predicate,[id,id,id,...args]),
      p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?)',receipt,JSON.stringify(detail),now),
      p(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
        VALUES(?,?,1,0,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
        duplicate_count=user_mercenary_cards_v1.total_copies,last_obtained_at=excluded.last_obtained_at`,id,code,now,now),
      p(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
        SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?`,receipt,now,id,code),
      jointGuardEnd(DB,token)
    ]);
    return true;
  }catch(error){if(await getReceipt(env,'final',id))return false;throw error;}
}

// The base quest or clan action already committed. Entering the event retries settlement.
export async function settleComebackMissions(env,id){
  try{return await grantComebackFinalIfReady(env,Number(id));}
  catch(error){console.warn('COMEBACK_SETTLEMENT_DEFERRED',String(error.code||error.name));return false;}
}

async function beginDialogue(env,id){
  const now=utc(Date.now());
  await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at)
    SELECT ?,?,? WHERE ${normalSql} AND ${verifiedSql} AND ${attendanceSql}>=?
      AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)
    ON CONFLICT(key) DO NOTHING`).bind(key('dialogue',id),now,now,id,id,id,COMEBACK.days,key('initial',id)).run();
  return !!await getReceipt(env,'dialogue',id);
}

export async function handleComeback({path,request,env,deps}){
  if(!['comeback/status','comeback/talk','comeback/claim','comeback/enter'].includes(path))return null;
  const json=(body,status=200)=>deps.json(body,status,{'Cache-Control':'no-store'});
  const user=await deps.authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(request.method!==(path==='comeback/status'?'GET':'POST'))return json({error:'요청 방식을 확인해 주세요.'},405);
  // Cached lobby clients used this endpoint to award supplies on sight.
  if(path==='comeback/enter')return json({error:'게임을 새로고침하고 컴백 유저 메뉴에서 서린과 대화해 주세요.'},409);
  try{
    const id=Number(user.id);
    if(path==='comeback/talk' && await deps.withUserMutationLock(env,id,path,()=>beginDialogue(env,id)))return json({phase:'DIALOGUE'});
    const state=path==='comeback/claim' ? await deps.withUserMutationLock(env,id,path,async()=>{
      const fresh=await comebackState(env,id,deps);
      if(fresh.phase==='ELIGIBLE'){
        if(!fresh.dialogueAt)return {phase:'DIALOGUE_REQUIRED'};
        const awarded=await grantInitial(env,id,Date.now(),fresh);
        return {...await comebackState(env,id,deps),awarded};
      }
      if(fresh.phase==='MISSIONS'&&fresh.weeks.length===2&&fresh.clan){
        await grantComebackFinalIfReady(env,id);
        return comebackState(env,id,deps);
      }
      return fresh;
    }) : await comebackState(env,id,deps);
    const {stamp,dialogueAt,...visible}=state;
    return json(visible);
  }catch(error){if(error.code==='JOINT_LOCK_BUSY')return json({error:'다른 계정 작업을 마치는 중입니다. 다시 확인해 주세요.'},409);console.error('comeback event',String(error.code||error.name));return json({error:'복귀 기록을 확인하지 못했습니다. 다시 시도해 주세요.'},503);}
}

import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {deliverChampionsRewards} from './_clan_champions.js';

export const clanChampionsFollowupKey=seasonId=>`clan_champions_followup_20260928:${Number(seasonId)}`;
export const clanChampionsFollowupReceiptKey=seasonId=>`${clanChampionsFollowupKey(seasonId)}:opened`;
const ms=value=>Date.parse(String(value||'').includes('T')?value:`${String(value||'').replace(' ','T')}Z`);
const iso=value=>new Date(value).toISOString();
const check=(condition,message)=>{if(!condition)throw new Error(message)};

export async function readClanChampionsFollowup(env,seasonId){
 if(!seasonId)return null;
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(clanChampionsFollowupKey(seasonId)).first();
 if(!row)return null;
 const plan=JSON.parse(row.value);
 check(plan.version===1&&Number(plan.seasonId)===Number(seasonId)&&plan.draftRule==='NEXT_DAY_21_KST'&&plan.registrationRule==='AFTER_CHAMPIONS_COMPLETE','클랜 후속 모집 일정 설정이 올바르지 않습니다.');
 return plan.enabled===true?{...plan,raw:row.value}:null;
}

export function clanChampionsFollowupTimes(completedAt,seasonDays){
 const completed=ms(completedAt);check(Number.isFinite(completed),'챔피언스리그 종료 시각을 확인할 수 없습니다.');
 const local=new Date(completed+9*3600000);
 const registration=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+1,21)-9*3600000;
 const draftEnd=registration+3600000;
 return {registrationEndsAt:iso(registration),draftEndsAt:iso(draftEnd),startsAt:iso(draftEnd),endsAt:iso(draftEnd+Math.max(7,Number(seasonDays)||28)*86400000)};
}

// Only a reviewed season plan enables unattended championship advancement.
// The current round's indexed row gives the next boundary; no battle/roster scans.
export async function clanChampionsFollowupCheckAt(env,seasonId,now=Date.now()){
 const state=await env.DB.prepare(`SELECT c.status AS cup_status,w.status AS war_status,w.starts_at,w.ends_at
  FROM clan_championships c LEFT JOIN clan_wars w ON w.season_id=c.season_id
  AND w.round_no=CASE WHEN c.status='SEMIFINAL' THEN 1001 ELSE 1002 END WHERE c.season_id=? LIMIT 1`).bind(seasonId).first();
 if(!state)return null;
 if(state.cup_status==='COMPLETED')return iso(now);
 const boundary=ms(state.war_status==='SCHEDULED'?state.starts_at:state.war_status==='ACTIVE'?state.ends_at:null);
 return iso(Number.isFinite(boundary)?boundary:now);
}

// Existing records remain untouched. The new season and its receipt commit together.
export async function openClanChampionsFollowup(env,previous,settings,knownPlan){
 const plan=knownPlan===undefined?await readClanChampionsFollowup(env,previous?.id):knownPlan;
 if(!plan)return null;
 if(settings.mode!=='ON'||previous.phase!=='COMPLETE')return previous;
 const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
 const receiptKey=clanChampionsFollowupReceiptKey(previous.id),saved=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();
 if(saved){
  const receipt=JSON.parse(saved.value);
  check(receipt.status==='COMPLETED'&&receipt.sourceSeasonId===Number(previous.id),'클랜 후속 모집 기록이 올바르지 않습니다.');
  const next=await p('SELECT * FROM clan_seasons WHERE season_no=?',receipt.nextSeasonNo).first();
  check(Boolean(next),'클랜 후속 모집 시즌을 확인할 수 없습니다.');return next;
 }
 const cup=await p('SELECT status,completed_at FROM clan_championships WHERE season_id=?',previous.id).first();
 if(cup?.status!=='COMPLETED')return previous;
 // Retry any interrupted existing champion reward delivery before switching seasons.
 await deliverChampionsRewards(env,previous.id,settings);
 const times=clanChampionsFollowupTimes(cup.completed_at,settings.seasonDays),nextNo=Number(previous.season_no)+1;
 const receipt={status:'COMPLETED',sourceSeasonId:Number(previous.id),nextSeasonNo:nextNo,championsCompletedAt:cup.completed_at,...times};
 const packed=JSON.stringify(receipt),token=crypto.randomUUID();
 await ensureJointAtomicSchema(env);
 const writes=[];
 if(DB.dialect==='postgres')writes.push(p('SELECT id FROM clan_seasons WHERE id=? FOR UPDATE',previous.id));
 writes.push(jointGuard(DB,token,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
  AND EXISTS(SELECT 1 FROM clan_seasons s JOIN clan_championships c ON c.season_id=s.id
    WHERE s.id=? AND s.phase='COMPLETE' AND c.status='COMPLETED' AND c.completed_at=?)`,
 [clanChampionsFollowupKey(previous.id),plan.raw,previous.id,cup.completed_at]));
 writes.push(p(`INSERT OR IGNORE INTO clan_seasons(season_no,phase,max_members,registration_ends_at,draft_ends_at,starts_at,ends_at)
  SELECT ?,'REGISTRATION',22,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM clan_seasons WHERE season_no>?)`,
  nextNo,times.registrationEndsAt,times.draftEndsAt,times.startsAt,times.endsAt,previous.season_no));
 writes.push(p('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',receiptKey,packed));
 writes.push(jointGuard(DB,`${token}:result`,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
  AND EXISTS(SELECT 1 FROM clan_seasons WHERE season_no=? AND registration_ends_at=? AND draft_ends_at=? AND starts_at=? AND ends_at=?)`,
  [receiptKey,packed,nextNo,times.registrationEndsAt,times.draftEndsAt,times.startsAt,times.endsAt]));
 writes.push(jointGuardEnd(DB,token),jointGuardEnd(DB,`${token}:result`));
 await DB.batch(writes);
 return p('SELECT * FROM clan_seasons WHERE season_no=?',nextNo).first();
}

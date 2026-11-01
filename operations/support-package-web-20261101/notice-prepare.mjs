import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {KEY,ACTION,TITLE,BODY,hash,counts,identities,eligible} from './notice-common.mjs';
const live=JSON.parse(fs.readFileSync(new URL('./live-verification.json',import.meta.url)));assert.equal(live.pages.status,'success');assert.equal(live.assets.length,12);assert.equal(live.workers.length,2);
const db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const recipients=await eligible(db);assert(recipients.length>0);assert.equal(new Set(recipients.map(r=>r.identityHash)).size,recipients.length);
 const [time]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst,CURRENT_TIMESTAMP::text timestamp");assert.equal(time.kst,'2026-11-01');
 assert.equal((await q('SELECT key FROM app_meta WHERE key=$1',[KEY])).length,0);
 assert.equal((await q('SELECT id FROM admin_logs WHERE target_id=$1 OR action_type=$2',[KEY,ACTION])).length,0);
 assert.equal((await q('SELECT id FROM user_messages WHERE campaign_key=$1 OR title=$2 OR body=$3',[KEY,TITLE,BODY])).length,0);
 const excluded=await q("SELECT u.status,COUNT(*)::int count FROM users u JOIN user_second_verifications v ON v.user_id=u.id WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))<>'ACTIVE' GROUP BY u.status");
 const plan={operationKey:KEY,authorization:'49800원 패키지 웹에서만 구매 가능하게 해놓고 1+1 11월 3일 0시 판매 종료 / 패키지 내용물 200조로 변경 / 2차인증 유저한태 메세지 보내 / 3일 자정까지 구매 가능하다고 / 최종 정정: 시즌패스 구매자한태만 보내 / 횟수 를 한번에 5회 10회 원하는만큼 최대 100개까지 신청 가능하게추가해',eligibility:'Current active season-pass purchasers who satisfy the existing package purchase eligibility; not all verified users.',dateKST:time.kst,title:TITLE,body:BODY,messageType:'SYSTEM',delivery:'MESSAGE',rewardAttachments:0,recipientCount:recipients.length,recipientHash:hash(identities(recipients)),roleCounts:counts(recipients,'role'),providerCounts:counts(recipients,'provider'),recipients,liveDeployment:live.pages,inspectedAt:new Date().toISOString()};
 await db.query('ROLLBACK');fs.writeFileSync(new URL('./notice-plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(new URL('./notice-plan-hash.json',import.meta.url),JSON.stringify({planHash:hash(plan),excluded},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({recipients:recipients.length,roleCounts:plan.roleCounts,providerCounts:plan.providerCounts,excluded,planHash:hash(plan),message:BODY,productionWrites:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}

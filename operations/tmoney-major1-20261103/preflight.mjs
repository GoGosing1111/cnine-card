import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {rankLevelTicks} from '../../output/revan-live-20261027/release-checkout/functions/_account_rank_curve.js';
import {publicAccountRank} from '../../output/revan-live-20261027/release-checkout/functions/_account_rank.js';
const OP='ops:tmoney-major1:20261103:v1',db=connect(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const target={userId:'5147',nickname:'T-Money™',status:'ACTIVE',role:'USER',identityHash:'35fe97106d5fff7ffeeb25a7c64196327dedda8f907ffd336af1f0baa5d75fed'};
db.connectionParameters.application_name='tmoney-major1-20261103-preflight';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const users=await q('SELECT id::text,nickname,role,status FROM users WHERE id=5147 OR nickname=$1 ORDER BY id',[target.nickname]);assert.equal(users.length,1);const user=users[0];assert.equal(user.id,target.userId);for(const k of ['nickname','role','status'])assert.equal(user[k],target[k]);
 const identities=await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=5147');assert.equal(identities.length,1);assert.equal(hash({provider:identities[0].provider,providerUserId:identities[0].provider_user_id}),target.identityHash);
 const progress=await q('SELECT user_id::text,total_ticks::text,updated_at FROM account_rank_progress_v1 WHERE user_id=5147');assert.equal(progress.length,1);
 const targetTicks=String(rankLevelTicks(170)),targetRank=publicAccountRank(targetTicks);assert.equal(targetRank.code,'MAJOR');assert.equal(targetRank.level,170);assert.equal(targetRank.progress.current,0);
 assert.equal((await q("SELECT key FROM app_meta WHERE key=$1 OR key LIKE 'ops:tmoney-major1:%'",[OP])).length,0);
 const triggers=await q("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,pg_get_functiondef(t.tgfoid) function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname='account_rank_progress_v1' ORDER BY t.tgname");
 const auditFloor=(await q('SELECT COALESCE(MAX(id),0)::text id FROM admin_logs'))[0].id;
 const codeHashes={};for(const f of ['functions/_account_rank.js','functions/_account_rank_curve.js','shared/account-ranks-v1.mjs'])codeHashes[f]=createHash('sha256').update(await fs.readFile(new URL('../../output/revan-live-20261027/release-checkout/'+f,import.meta.url))).digest('hex');
 const plan={operationKey:OP,recipientCount:1,recipients:[target],targetLevel:170,targetCode:'MAJOR',targetName:'소령',rankStep:1,targetTicks,sendMessages:false,auditFloor,codeHashes,authorization:'T-Money™ 소령 1레벨로 변경해'};
 const report={checkedAt:new Date().toISOString(),readOnly:true,user:target,before:progress[0],beforeRank:publicAccountRank(progress[0].total_ticks),targetTicks,targetRank,triggers,planHash:hash(plan)};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({before:report.beforeRank,targetTicks,targetRank,planHash:report.planHash,triggers:triggers.map(t=>({name:t.tgname,definition:t.definition}))}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}

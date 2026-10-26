import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.dirname(fileURLToPath(import.meta.url)),pg=createRequire(path.join(root,'package.json'))('pg'),key='ops:dk-quest-rewards:20261026:v1',prefix='dk-quest-rewards-20261026-v1:';
const connectionString=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:30000}).trim().replace(/^['"]|['"]$/g,'');
const db=new pg.Client({connectionString,application_name:'dk-quest-independent-readonly',connectionTimeoutMillis:15000}),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const r=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0].value);assert.equal(r.status,'COMPLETED');assert.equal(hash(r.plan),r.planHash);
 const stored=Object.fromEntries((await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[Object.keys(r.after)])).rows.map(row=>[row.key,JSON.parse(row.value)]));assert.deepEqual(stored,r.after);
 assert.equal(stored.playdk_daily_quest_settings_v1.requiredPosts,15);assert.equal(stored.playdk_daily_quest_settings_v1.postRewardCoin,5000000000000);assert.equal(stored.quest_weekly_settings_v20260924.quests.POST.rewardAmount,30000000000000);
 const daily=(await db.query('SELECT id::text,user_id::text,quest_date,reward_coin::text,post_count::text,claimed_at FROM wago_daily_quest_claims WHERE id=ANY($1::bigint[])',[r.plan.filter(p=>p.kind==='DAILY').map(p=>p.sourceId)])).rows;
 const weekly=(await db.query('SELECT q.claim_token,q.user_id::text,q.week_key,q.status,q.progress::text,q.reward_type,q.reward_amount::text,q.message_id::text,q.created_at,m.user_id::text message_user,a.user_id::text attachment_user,a.reward_type attachment_type,a.reward_amount::text attachment_amount FROM quest_weekly_claims_v1 q JOIN user_messages m ON m.id=q.message_id JOIN user_message_rewards a ON a.message_id=m.id WHERE q.claim_token=ANY($1::text[])',[r.plan.filter(p=>p.kind==='WEEKLY').map(p=>p.sourceId)])).rows;
 const messages=(await db.query('SELECT m.id::text,m.user_id::text,m.campaign_key,a.id::text reward_id,a.user_id::text reward_user,a.reward_type,a.reward_amount::text,a.claimed_at,c.reward_amount::text claim_amount,c.balance_before::text,c.balance_after::text FROM user_messages m JOIN user_message_rewards a ON a.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=a.id AND c.user_id=a.user_id WHERE m.campaign_key LIKE $1',[prefix+'%'])).rows;assert.equal(messages.length,r.plan.length);
 for(const p of r.plan){
  const source=(p.kind==='DAILY'?daily:weekly).find(x=>p.kind==='DAILY'?x.id===p.sourceId:x.claim_token===p.sourceId);assert(source);assert.equal(source.user_id,p.userId);assert.equal(p.kind==='DAILY'?source.reward_coin:source.reward_amount,p.original);assert.equal(p.kind==='DAILY'?source.post_count:source.progress,p.progress);
  if(p.kind==='WEEKLY'){assert.equal(source.status,'COMPLETED');assert.equal(source.message_id,p.originalMessageId);assert.equal(source.attachment_amount,p.original);assert.equal(source.attachment_user,p.userId);assert.equal(source.message_user,p.userId);assert.equal(source.attachment_type,'COIN');}
  const campaign=prefix+p.kind.toLowerCase()+':'+hash(p.sourceId).slice(0,24),found=messages.filter(m=>m.campaign_key===campaign&&m.user_id===p.userId);assert.equal(found.length,1);const m=found[0];assert.equal(m.reward_user,p.userId);assert.equal(m.reward_type,'COIN');assert.equal(m.reward_amount,p.delta);assert.equal(BigInt(p.original)+BigInt(m.reward_amount),p.kind==='DAILY'?5000000000000n:30000000000000n);
  if(m.claimed_at){assert.equal(m.claim_amount,p.delta);assert.equal(BigInt(m.balance_after)-BigInt(m.balance_before),BigInt(p.delta));}
 }
 const audit=(await db.query('SELECT id::text,action_type FROM admin_logs WHERE target_id=$1 ORDER BY id',[key])).rows;assert.equal(audit.length,2);assert.equal(audit[0].id,r.configAuditId);assert.equal(audit[1].id,r.deliveryAuditId);
 await db.query('ROLLBACK');
 const result={verifiedAt:new Date().toISOString(),readOnly:true,operationKey:key,planHash:r.planHash,summary:r.summary,totalMessages:messages.length,totalRewards:messages.length,totalCoin:String(messages.reduce((sum,m)=>sum+BigInt(m.reward_amount),0n)),alreadyCollected:messages.filter(m=>m.claimed_at).length,missing:0,duplicates:0,originalReceiptsAndAttachmentsPreserved:true,otherQuestSettingsPreserved:true,audit};
 fs.writeFileSync(path.join(out,'independent-verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}

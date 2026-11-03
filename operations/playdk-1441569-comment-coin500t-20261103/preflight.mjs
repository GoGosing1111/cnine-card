import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),source=JSON.parse(await fs.readFile(new URL('./source.json',import.meta.url),'utf8'));
const OP=source.operationKey,ACTION='OPS_PLAYDK_COMMENT_COIN500T',AMOUNT='500000000000000',db=connect();
try{
 db.connectionParameters.application_name='playdk-1441569-comment-coin500t-preflight';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const users=await q("SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,v.provider,v.provider_name,v.provider_user_id,v.verified_at FROM user_second_verifications v JOIN users u ON u.id=v.user_id WHERE v.provider='PLAYDK' AND v.provider_user_id=ANY($1::text[]) ORDER BY u.id",[source.selected.map(a=>a.uuid)]);
 const targets=[],excluded=[];
 for(const a of source.selected){const matches=users.filter(u=>u.provider_user_id===a.uuid);assert(matches.length<=1,'Ambiguous verified identity');const u=matches[0];if(!u||u.status!=='ACTIVE'||!u.verified_at){excluded.push({...a,reason:!u?'NO_MATCHING_PLAYDK_SECOND_VERIFICATION':u.status!=='ACTIVE'?'INACTIVE_ACCOUNT':'MISSING_VERIFIED_AT',userId:u?.id||null,status:u?.status||null});continue;}
  assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),`Unsupported resulting balance ${u.id}`);
  targets.push({id:u.id,nickname:u.nickname,role:u.role,status:u.status,identityHash:hash({provider:u.provider,providerUserId:u.provider_user_id}),provider:'PLAYDK',dkUuid:a.uuid,dkNames:a.names,commentIds:a.commentIds,verifiedAt:u.verified_at,amount:AMOUNT});
 }
 targets.sort((a,b)=>Number(a.id)-Number(b.id));assert(targets.length>0);assert.equal(new Set(targets.map(t=>t.id)).size,targets.length);
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE '%1441569%' ORDER BY key",[OP]);
 const audits=await q('SELECT id::text,action_type,target_id,created_at FROM admin_logs WHERE target_id=$1 OR target_id LIKE $2 ORDER BY id',[OP,'%1441569%']);
 const floor=(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM coin_logs) coins,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit'))[0];
 const existingCoins=await q("SELECT id::text,user_id::text,change_amount::text,reason,created_at FROM coin_logs WHERE id>$1::bigint AND reason LIKE '%1441569%' ORDER BY id",[String(BigInt(floor.coins)>1000000n?BigInt(floor.coins)-1000000n:0n)]);
 const storage=await q("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='coin') OR (table_name='coin_logs' AND column_name IN ('change_amount','balance_after'))) ORDER BY table_name,column_name");assert.equal(storage.length,3);assert(storage.every(x=>x.data_type==='bigint'));
 const sameNameCandidates=excluded.length?await q('SELECT u.id::text,u.nickname,u.status,v.provider,v.provider_name,v.verified_at FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.nickname=ANY($1::text[]) OR v.provider_name=ANY($1::text[]) ORDER BY u.id',[excluded.flatMap(a=>a.names)]):[];
 assert.equal(prior.length,0,'Prior post reward found; reconcile without a new operation key');assert.equal(audits.length,0);assert.equal(existingCoins.length,0);
 const plan={operationKey:OP,authorization:source.authorization,dateKst:'2026-11-03',delivery:'DIRECT',currency:'COIN',amountPerUser:AMOUNT,totalAmount:(BigInt(targets.length)*BigInt(AMOUNT)).toString(),recipientCount:targets.length,sendMessages:false,sourceHash:hash(source),sourceCutoff:source.collectedAt,sourcePostId:1441569,sourceCommentCount:source.commentCount,sourceUniqueAuthors:source.uniqueAuthors,targets,excluded,recipients:targets.map(t=>({userId:t.id})),logFloor:floor};
 const report={checkedAt:new Date().toISOString(),readOnly:true,matched:targets.length,excluded,sameNameCandidates,prior,audits,existingCoins,storage,balances:users.map(u=>({id:u.id,coin:u.coin})),planHash:hash(plan)};
 await db.query('ROLLBACK');for(const [name,data] of [['plan.json',plan],['preflight.json',report]])await fs.writeFile(new URL(name,import.meta.url),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({comments:source.commentCount,uniqueAuthors:source.uniqueAuthors,recipients:targets.length,totalAmount:plan.totalAmount,excluded,sameNameCandidates,planHash:hash(plan)},null,2));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}

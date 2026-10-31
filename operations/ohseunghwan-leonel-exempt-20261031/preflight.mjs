import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:ohseunghwan-leonel-exempt-grant:20261031:v1',ID='16',NAME='오승환이다',CODE='V-978';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>{assert.match(sql,/^SELECT\b/);return (await db.query(sql,args)).rows;};
 const rows=await q('SELECT u.id::text,u.nickname,u.role,u.status,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',[ID,NAME]);assert.equal(rows.length,1);
 const {provider,provider_user_id,...user}=rows[0];assert.deepEqual(user,{id:ID,nickname:NAME,role:'ADMIN',status:'ACTIVE'});assert(provider&&provider_user_id);
 const priorPlan=JSON.parse(await fs.readFile(new URL('../streamer-box-starball-difference-20261031/plan.json',import.meta.url),'utf8'));
 const known=priorPlan.targets.find(t=>t.userId===ID);assert(known);assert.equal(known.nickname,NAME);assert.equal(hash({provider,providerId:provider_user_id}),known.identityHash,'Known account identity changed');
 user.identityHash=hash({provider,providerUserId:provider_user_id});
 const holding=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[ID,CODE]);
 const acquisitions=await q('SELECT acquisition_id,user_id::text,mercenary_code,total_copies_after,created_at FROM mercenary_card_acquisitions_v1 WHERE user_id=$1 AND mercenary_code=$2 ORDER BY created_at DESC LIMIT 30',[ID,CODE]);
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%ohseunghwan%leonel%' ORDER BY key",[OP]);assert.equal(prior.length,0,'Previous operation exists; do not grant again');
 const codes=[CODE,'SSS_MIRACLE_CUBE:'+CODE];
 const stock=await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes]);assert.equal(stock.length,2);
 const issues=await q('SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[codes]);
 const settings=await q('SELECT key,value FROM app_meta WHERE key=$1',['mercenary_limited_shard_craft_v1:'+CODE]);
 const craft=await q("SELECT output_ref,COUNT(*)::text AS rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text AS crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=$1 GROUP BY output_ref",[CODE]);
 const plan={operationKey:OP,authorization:'오승환이다 레오넬 지급해 한도차감없이',stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',cost:0,automaticLoadout:false,sendMessages:false,totalQuantity:1,recipientCount:1,recipients:[user],grants:[{userId:ID,nickname:NAME,code:CODE,name:'레오넬',quantity:1}]};
 const report={checkedAt:new Date().toISOString(),readOnly:(await q("SELECT current_setting('transaction_read_only') value"))[0].value,user,holding,acquisitions,prior,stock,issues,settings,craft,productionWrites:0,planHash:hash(plan)};
 await db.query('ROLLBACK');
 for(const [name,value] of [['plan.json',plan],['preflight.json',report]])await fs.writeFile(new URL('./'+name,import.meta.url),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({userId:ID,nickname:NAME,code:CODE,name:'레오넬',quantity:1,currentlyOwned:holding[0]?.total_copies??0,stock:stock.map(s=>({code:s.code,limit:s.stock_limit,issued:s.issued})),serials:issues.length,craft,priorOperations:0,productionWrites:0,planHash:report.planHash}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}

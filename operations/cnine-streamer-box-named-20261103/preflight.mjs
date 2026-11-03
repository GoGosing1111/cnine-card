import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import source from './source.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const inputs=source.groups.flatMap(g=>g.names.filter(n=>!(g.marker===209&&n==='쟁이')).map(inputNickname=>({inputNickname,marker:g.marker,amount:g.amount})));
assert.equal(inputs.length,37);assert.equal(inputs.reduce((n,t)=>n+t.amount,0),222);
const db=connect();
try{
 db.connectionParameters.application_name='cnine-streamer-box-named-preflight';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const raw=await q('SELECT u.id::text,u.nickname,u.role,u.status,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.nickname ILIKE ANY($1::text[]) ORDER BY u.id',[inputs.map(e=>'%'+e.inputNickname+'%')]);
 const users=raw.map(({provider,provider_user_id,...u})=>({...u,identityHash:provider&&provider_user_id?hash({provider,providerId:provider_user_id}):null}));
 const matches=inputs.map((e,i)=>({...e,order:i+1,candidates:users.filter(u=>u.nickname===e.inputNickname),nearby:users.filter(u=>u.nickname.toLowerCase().includes(e.inputNickname.toLowerCase()))}));
 const item=await q('SELECT code,name,description,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1',[source.itemCode]);
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%streamer%20261103%' ORDER BY key",[source.operationKey]);
 const floors=(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) inventory,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit'))[0];
 const audits=await q("SELECT id::text,action_type,target_id,created_at FROM admin_logs WHERE id>$1::bigint AND (action_type LIKE '%STREAMER%' OR target_id LIKE 'ops:%streamer%') ORDER BY id",[(BigInt(floors.audit)-300n).toString()]);
 const report={checkedAt:new Date().toISOString(),operationKey:source.operationKey,inputs,matches,item,prior,audits,floors};
 await fs.writeFile(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await db.query('ROLLBACK');
 console.log(JSON.stringify({checkedAt:report.checkedAt,item,prior:prior.map(p=>({key:p.key,status:JSON.parse(p.value).status})),audits,targets:matches.map(m=>({name:m.inputNickname,amount:m.amount,exact:m.candidates.map(u=>({id:u.id,name:u.nickname,status:u.status,verified:!!u.identityHash})),nearby:m.candidates.length===1?undefined:m.nearby.map(u=>({id:u.id,name:u.nickname,status:u.status,verified:!!u.identityHash}))}))}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}

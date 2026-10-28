import assert from 'node:assert/strict';
import {SSS_CUBE_LIMITED_CODES,sssCubeStockCode} from '../../shared/sss-miracle-cube-stock-v1.mjs';
export const OPERATION_KEY='ops:sss-cube-independent-stock:20261028:v1';
export const POLICY_KEY='sss_miracle_cube_policy_20261021_v1';
export const ITEM_DESCRIPTION='SSS 일반·SSS 리미티드 용병 중 1장을 획득합니다. 리미티드는 큐브 전용 한도를 사용합니다.';
export async function applySssCubeIndependentStock(client,{expectedPolicy,releaseCommit,dryRun=true,failAfter=0}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const existing=(await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
 if(existing)return {replayed:true,receipt:JSON.parse(existing.value)};
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='15s'");
  const [lock]=await q('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[OPERATION_KEY]);assert.equal(lock.locked,true,'Operation busy');
  const repeated=(await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
  if(repeated){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(repeated.value)};}
  const [row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[POLICY_KEY]);assert(row,'Cube policy missing');assert.equal(row.value,expectedPolicy,'CMS changed; refresh the operation plan');
  const before=JSON.parse(row.value);assert.equal(before.policy.mode,'OFF','Keep opening OFF during independent stock registration');
  const codes=SSS_CUBE_LIMITED_CODES.map(sssCubeStockCode),prior=await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[codes]);assert.equal(prior.length,0,'Unexpected independent stock; inspect before adding capacity');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");assert(owner);
  const at=new Date().toISOString(),stockLimits=Object.fromEntries(SSS_CUBE_LIMITED_CODES.map(code=>[code,5]));
  let changed=0;
  for(const code of codes){await q('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued,revision,last_token) VALUES($1,5,0,0,$2)',[code,OPERATION_KEY]);if(++changed===failAfter)throw Error('INJECTED_CUBE_STOCK_FAILURE');}
  const next={...before,revision:before.revision+1,policy:{...before.policy,stockLimits},updatedAt:at,updatedBy:Number(owner.id)};
  await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(next),POLICY_KEY]);
  const [item]=await q('SELECT description FROM inventory_items WHERE code=$1 FOR UPDATE',['SSS_MIRACLE_CUBE']);assert(item);
  await q('UPDATE inventory_items SET description=$1 WHERE code=$2',[ITEM_DESCRIPTION,'SSS_MIRACLE_CUBE']);
  const receipt={operationKey:OPERATION_KEY,at,releaseCommit,beforeRevision:before.revision,revision:next.revision,mode:next.policy.mode,probabilities:next.policy.cards,stockLimits,addedCapacity:40,issued:0,accountGrants:0,sharedStockWrites:0,authorization:'SSS 미라클 큐브 한도는 별개로 지정하고 5개씩 추가. 은설·제너럴 족·프라임 레퀴엠·레오넬 획득 잠금 해제. 현재 CMS 확률표 공지용 작성.'};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'SSS_CUBE_INDEPENDENT_STOCK','APP_META',OPERATION_KEY,JSON.stringify({policy:before,stock:prior,itemDescription:item.description}),JSON.stringify(receipt)]);receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

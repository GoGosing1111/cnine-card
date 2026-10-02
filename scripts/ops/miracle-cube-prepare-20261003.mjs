// Prepare the new catalog and OFF policy only. No inventory grant or legacy conversion.
import {MIRACLE_CUBE,emptyMiraclePolicy} from '../../shared/miracle-cube-policy-v1.mjs';
import {MIRACLE_KEY} from '../../functions/_miracle_cube.js';
export async function prepareMiracleCube(client,{apply=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[MIRACLE_KEY]);
  const [retirement]=await q('SELECT value FROM app_meta WHERE key=$1',['ops:premium-cube-retirement:20261003:v1']);
  if(!retirement)throw Error('Premium retirement must already be complete');
  const [legacy]=await q("SELECT (SELECT COUNT(*) FROM inventory_items WHERE code='PREMIUM_CUBE') catalog,(SELECT COUNT(*) FROM cnine_user_inventory WHERE item_code='PREMIUM_CUBE') holdings");
  if(Number(legacy.catalog)||Number(legacy.holdings))throw Error('Retired premium inventory still exists');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  if(!owner)throw Error('Active audit owner required');
  const now=new Date().toISOString(),setting={revision:0,policy:emptyMiraclePolicy(),updatedBy:Number(owner.id),updatedAt:now};
  const catalog=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,29,1) ON CONFLICT(code) DO NOTHING RETURNING code',[MIRACLE_CUBE.code,MIRACLE_CUBE.name,'MIRACLE CUBE','C~SSS 등급의 용병 1장을 획득하는 최상위 용병 큐브입니다.','CUBE','MIRACLE',MIRACLE_CUBE.image]);
  const settings=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[MIRACLE_KEY,JSON.stringify(setting),now]);
  const [live]=await q('SELECT value FROM app_meta WHERE key=$1',[MIRACLE_KEY]);
  const current=JSON.parse(live.value),result={createdCatalog:catalog.length===1,createdPolicy:settings.length===1,revision:current.revision,mode:current.policy.mode,ranks:current.policy.ranks,assignedCards:Object.keys(current.policy.cards).length,granted:0,legacyRestored:false,at:now};
  if(catalog.length||settings.length){
   const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'MIRACLE_CUBE_PREPARE','APP_META',MIRACLE_KEY,JSON.stringify({catalogExisted:!catalog.length,policyExisted:!settings.length}),JSON.stringify({...result,actor:'CODEX_OPERATIONS',authorization:'미라클 큐브와 UI·연출·등급/용병별 CMS 확률 준비. 개봉 OFF, 확률 미설정.'})]);
   result.auditId=String(audit.id);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

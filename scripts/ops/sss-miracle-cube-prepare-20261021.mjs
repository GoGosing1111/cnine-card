import {SSS_CUBE,emptySssCubePolicy} from '../../shared/sss-miracle-cube-v1.mjs';
import {SSS_CUBE_KEY} from '../../functions/_sss_miracle_cube.js';
export async function prepareSssMiracleCube(client,{apply=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[SSS_CUBE_KEY]);
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  if(!owner)throw Error('Active audit owner required');
  const now=new Date().toISOString(),setting={revision:0,policy:emptySssCubePolicy(),updatedAt:now,updatedBy:Number(owner.id)};
  const item=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,30,1) ON CONFLICT(code) DO NOTHING RETURNING code',[SSS_CUBE.code,SSS_CUBE.name,'SSS MIRACLE CUBE','SSS 일반·SSS 리미티드 용병 중 1장을 획득합니다. 리미티드 기존 한정 수량을 공유합니다.','CUBE','MIRACLE',SSS_CUBE.image]);
  const saved=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[SSS_CUBE_KEY,JSON.stringify(setting),now]);
  const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[SSS_CUBE_KEY]),current=JSON.parse(row.value);
  const result={createdCatalog:item.length===1,createdPolicy:saved.length===1,revision:current.revision,mode:current.policy.mode,configuredCards:Object.values(current.policy.cards).filter(n=>n!==null).length,granted:0,stockChanges:0,at:now};
  if(item.length||saved.length){
   const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'SSS_MIRACLE_CUBE_PREPARE','APP_META',SSS_CUBE_KEY,JSON.stringify({catalogExisted:!item.length,policyExisted:!saved.length}),JSON.stringify({...result,authorization:'SSS 일반 + SSS 리미티드만, CMS에서 직접 설정하도록 준비. 확률 미설정·개봉 OFF.',actor:'CODEX_OPERATIONS'})]);result.auditId=String(audit.id);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

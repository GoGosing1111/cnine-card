import {SSS_REROLL,emptySssRerollPolicy} from '../../shared/mercenary-sss-reroll-v1.mjs';
const KEY='mercenary_sss_reroll_policy_v1';
// Idempotent catalog and blank OFF policy only. No automatic grants or odds.
export async function prepareSssReroll(client,{apply=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;await client.query('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY]);
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");if(!owner)throw Error('Active audit owner required');
  const now=new Date().toISOString(),setting={revision:0,policy:emptySssRerollPolicy(),updatedBy:Number(owner.id),updatedAt:now};
  const catalog=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,116,1) ON CONFLICT(code) DO NOTHING RETURNING code',[SSS_REROLL.code,SSS_REROLL.name,'SSS RECONTRACT','보유한 일반 SSS 용병 1장과 재뽑기권 1개를 소모해 다른 일반 SSS 용병 1장을 획득합니다.','REROLL','SSS',SSS_REROLL.image]);
  const settings=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[KEY,JSON.stringify(setting),now]);
  const [live]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]),current=JSON.parse(live.value);
  const result={createdCatalog:catalog.length===1,createdPolicy:settings.length===1,revision:current.revision,mode:current.policy.mode,assignedCards:Object.keys(current.policy.cards).length,granted:0,at:now};
  if(catalog.length||settings.length){const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'SSS_REROLL_PREPARE','APP_META',KEY,JSON.stringify({catalogExisted:!catalog.length,policyExisted:!settings.length}),JSON.stringify({...result,actor:'CODEX_OPERATIONS',authorization:'SSS 재뽑기권·연출·별도 CMS 확률 준비. 보유 일반 SSS 1장과 아이템 1개를 소모해 다른 일반 SSS로 교체. 최초 OFF, 확률 미입력, 지급 없음.'})]);result.auditId=String(audit.id);}
  await client.query(apply?'COMMIT':'ROLLBACK');return{...result,dryRun:!apply};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

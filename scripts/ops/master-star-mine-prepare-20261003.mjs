import {MINE_SCHEMA} from '../../functions/_master_star_mine.js';
import {MINE_KEY,MINE_DRILLS,emptyMinePolicy} from '../../shared/master-star-mine-v1.mjs';
export async function prepareMasterStarMine(client,{apply=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[MINE_KEY]);
  const [identity]=await q('SELECT current_database() database,pg_is_in_recovery() recovery');
  if(identity.database!=='cnine'||identity.recovery)throw Error('Expected cnine primary');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  if(!owner)throw Error('Active owner required');
  const [catalog]=await q("SELECT is_active FROM inventory_items WHERE code='MASTER_STAR'");if(Number(catalog?.is_active)!==1)throw Error('Master Star catalog is unavailable');
  for(const sql of MINE_SCHEMA)await q(sql);
  const now=new Date().toISOString(),policy={revision:0,policy:emptyMinePolicy(),updatedAt:now,updatedBy:Number(owner.id)},created=[];
  for(const drill of MINE_DRILLS){const inserted=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING RETURNING code',[drill.code,drill.name,drill.label,drill.description+' 마스터의 별 광산에서 사용하는 영구 장비입니다.','MINE_TOOL','SPECIAL',drill.image,40+MINE_DRILLS.indexOf(drill)]);if(inserted.length)created.push(drill.code);}
  const inserted=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[MINE_KEY,JSON.stringify(policy),now]);
  const [current]=await q('SELECT value FROM app_meta WHERE key=$1',[MINE_KEY]),setting=JSON.parse(current.value);
  const result={at:now,createdItems:created,createdPolicy:inserted.length===1,revision:setting.revision,mode:setting.policy.mode,acquisition:setting.policy.acquisition,rewards:setting.policy.rewards,durationHours:4,granted:0,paid:0};
  if(created.length||inserted.length){const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'MASTER_STAR_MINE_PREPARE','APP_META',MINE_KEY,JSON.stringify({newCatalog:created,policyExisted:!inserted.length}),JSON.stringify({...result,actor:'CODEX_OPERATIONS',authorization:'4시간당 전동 5000 · 태양광 15000 · 황금 30000 승인. CMS 수치 변경 가능. 획득 방식 미정, 운영 OFF, 지급 없음.'})]);result.auditId=String(audit.id);}
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

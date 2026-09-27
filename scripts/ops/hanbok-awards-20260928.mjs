import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const META_KEY='ops:hanbok-name-effects:20260928:v1';
export const NAMES=Object.freeze({T1_JOEUN:'한복 조은',KANGGUYEOL_DK:'한복 강구열',FM_ORIKKUNG:'한복 오리꿍',FM_DIMWOOS:'한복 디임2',DC_HI_HEEYA:'한복 하이희야',DK_NAMU_BONGSOON:'한복 나무늘봉순',LG_JUSEONG:'한복 주성',LOTTE_AYOON:'한복 아윤'});
const OLD={T1_JOEUN:'T1 조은',KANGGUYEOL_DK:'DK 강구열',FM_ORIKKUNG:'FM 오리꿍',FM_DIMWOOS:'FM 딤우스',DC_HI_HEEYA:'DC 하이희야',DK_NAMU_BONGSOON:'DK 나무늘봉순',LG_JUSEONG:'LG 주성',LOTTE_AYOON:'롯데 아윤'};
export const EFFECTS=Object.freeze([{option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},{option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},{option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},{option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}]);
const codes=Object.keys(NAMES).sort(),parse=v=>typeof v==='string'?JSON.parse(v):v;
const effectValues=rows=>rows.map(({option_order,effect_type,effect_value})=>({option_order,effect_type,effect_value}));
async function reserve(q,key){await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[key]);const [row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key]);const r=parse(row.value);if(r.status==='COMPLETED')return {...r.result,replayed:true};assert.equal(r.status,'PENDING');const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Active OWNER required');return null;}
async function finish(q,key,action,before,result){const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[action,'AVATAR',key,JSON.stringify(before),JSON.stringify(result)]);assert.ok(audit);result.adminLogId=String(audit.id);await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[key,JSON.stringify({status:'COMPLETED',result}),result.completedAt]);return {...result,replayed:false};}
// Caller owns a PostgreSQL transaction. These explicit operations are never
// invoked by normal game requests or deployments.
export async function configureHanbokAvatars(q){
 const replay=await reserve(q,META_KEY);if(replay)return replay;
 const before=await q('SELECT * FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[[...codes,'HANBOK_DIIM'].sort()]);assert.equal(before.length,9);
 const source=before.find(a=>a.code==='HANBOK_DIIM');assert.equal(source.name,'한복디임');assert.equal(source.effect_type,EFFECTS[0].effect_type);assert.equal(source.effect_value,EFFECTS[0].effect_value);
 const allEffects=await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=ANY($1::text[]) ORDER BY avatar_code,option_order',[[...codes,'HANBOK_DIIM']]);assert.deepEqual(effectValues(allEffects.filter(e=>e.avatar_code==='HANBOK_DIIM')),EFFECTS,'Reference options changed');
 const now=new Date().toISOString(),mutable=['name','role_label','description','effect_type','effect_value','version','updated_at'],protect=a=>Object.fromEntries(Object.entries(a).filter(([k])=>!mutable.includes(k)));
 for(const code of codes){const old=before.find(a=>a.code===code);assert.equal(old.name,OLD[code],'Catalog name changed');assert.equal(old.is_active,1);assert.equal(old.is_public,1);assert.match(old.equipment_image,/^preview\/avatar-clan-hanbok-v1\//);
  const [after]=await q('UPDATE avatar_catalog_v1 SET name=$1,role_label=$2,description=$3,effect_type=$4,effect_value=$5,version=version+1,updated_at=$6 WHERE code=$7 AND version=$8 RETURNING *',[NAMES[code],'한복 컬렉션',old.description.replace(old.name,NAMES[code]),EFFECTS[0].effect_type,EFFECTS[0].effect_value,now,code,old.version]);assert.ok(after);assert.deepEqual(protect(after),protect(old));
 }
 await q('DELETE FROM avatar_effect_options_v1 WHERE avatar_code=ANY($1::text[])',[codes]);
 await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) SELECT c.code,e.option_order,e.effect_type,e.effect_value FROM unnest($1::text[]) c(code) CROSS JOIN jsonb_to_recordset($2::jsonb) e(option_order integer,effect_type text,effect_value integer)',[codes,JSON.stringify(EFFECTS)]);
 const after=await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=ANY($1::text[]) ORDER BY avatar_code,option_order',[codes]);for(const code of codes)assert.deepEqual(effectValues(after.filter(e=>e.avatar_code===code)),EFFECTS);
 assert.deepEqual((await q("SELECT * FROM avatar_catalog_v1 WHERE code='HANBOK_DIIM'"))[0],source);
 return finish(q,META_KEY,'HANBOK_NAMES_OPTIONS',{avatars:before,effects:allEffects},{status:'COMPLETED',count:8,names:NAMES,source:'HANBOK_DIIM',effects:EFFECTS,completedAt:now});
}
export function canonicalTargets(targets){
 assert.ok(Array.isArray(targets)&&targets.length>0&&targets.length<=100);const seen=new Set();
 const sorted=targets.map(t=>{assert.match(String(t.userId),/^[1-9]\d*$/);assert.ok(typeof t.nickname==='string'&&t.nickname.length>0);assert.ok(NAMES[t.avatarCode]);const key=t.userId+':'+t.avatarCode;assert.ok(!seen.has(key),'Duplicate user/avatar');seen.add(key);return {userId:String(t.userId),nickname:t.nickname,avatarCode:t.avatarCode,...(t.providerId?{providerId:t.providerId}:{})};}).sort((a,b)=>Number(a.userId)-Number(b.userId)||a.avatarCode.localeCompare(b.avatarCode));
 return sorted;
}
export async function grantHanbokAwards(q,targets){
 const rows=canonicalTargets(targets),hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex'),key='ops:hanbok-awards:20260928:v1:'+hash.slice(0,24),replay=await reserve(q,key);if(replay)return replay;
 const ids=[...new Set(rows.map(r=>r.userId))],selectedCodes=[...new Set(rows.map(r=>r.avatarCode))].sort(),users=await q('SELECT id::text AS id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id FOR UPDATE',[ids]);assert.equal(users.length,ids.length);
 for(const target of rows){const user=users.find(u=>u.id===target.userId);assert.equal(user.nickname,target.nickname,'Recipient nickname changed');assert.equal(user.status,'ACTIVE');}
 const linkedTargets=rows.filter(t=>t.providerId);if(linkedTargets.length){const links=await q("SELECT user_id::text AS user_id,provider_user_id FROM user_second_verifications WHERE provider='PLAYDK' AND user_id=ANY($1::bigint[]) FOR SHARE",[[...new Set(linkedTargets.map(t=>t.userId))]]);for(const t of linkedTargets)assert.equal(links.find(l=>l.user_id===t.userId)?.provider_user_id,t.providerId,'PLAY DK identity changed');}
 const catalog=await q('SELECT code,name,is_active,is_public FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[selectedCodes]);assert.equal(catalog.length,selectedCodes.length);for(const a of catalog){assert.equal(a.name,NAMES[a.code]);assert.equal(a.is_active,1);assert.equal(a.is_public,1);}
 const before=await q('SELECT * FROM avatar_user_ownership_v1 WHERE user_id=ANY($1::bigint[]) AND avatar_code=ANY($2::text[]) ORDER BY user_id,avatar_code FOR UPDATE',[ids,selectedCodes]);
 const loadouts=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const now=new Date().toISOString(),pairs=rows.map(r=>({user_id:r.userId,avatar_code:r.avatarCode}));
 const changed=await q(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at)
  SELECT t.user_id,t.avatar_code,'ADMIN_GRANT',$2,$3,NULL FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,avatar_code text) ORDER BY t.user_id,t.avatar_code
  ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=EXCLUDED.source_type,source_ref=EXCLUDED.source_ref,acquired_at=EXCLUDED.acquired_at,expires_at=NULL
  WHERE avatar_user_ownership_v1.expires_at IS NOT NULL RETURNING user_id,avatar_code`,[JSON.stringify(pairs),key,now]);
 const after=await q('SELECT * FROM avatar_user_ownership_v1 WHERE user_id=ANY($1::bigint[]) AND avatar_code=ANY($2::text[]) ORDER BY user_id,avatar_code',[ids,selectedCodes]);
 const outcomes=rows.map(t=>{const old=before.find(o=>String(o.user_id)===t.userId&&o.avatar_code===t.avatarCode),a=after.find(o=>String(o.user_id)===t.userId&&o.avatar_code===t.avatarCode);assert.ok(a);assert.equal(a.expires_at,null);if(old?.expires_at===null)assert.deepEqual(a,old);return {...t,name:NAMES[t.avatarCode],outcome:!old?'NEW':old.expires_at===null?'ALREADY_PERMANENT':'PERMANENT_UPGRADE'};});
 const targeted=new Set(rows.map(t=>t.userId+':'+t.avatarCode)),unrelated=list=>list.filter(o=>!targeted.has(o.user_id+':'+o.avatar_code));assert.deepEqual(unrelated(after),unrelated(before));assert.deepEqual(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]),loadouts);
 assert.equal(changed.length,outcomes.filter(o=>o.outcome!=='ALREADY_PERMANENT').length);
 return finish(q,key,'HANBOK_PERMANENT_AWARDS',{ownership:before},{status:'COMPLETED',operationKey:key,recipientHash:hash,count:rows.length,accountCount:ids.length,new:outcomes.filter(o=>o.outcome==='NEW').length,upgraded:outcomes.filter(o=>o.outcome==='PERMANENT_UPGRADE').length,alreadyPermanent:outcomes.filter(o=>o.outcome==='ALREADY_PERMANENT').length,recipients:outcomes,completedAt:now});
}

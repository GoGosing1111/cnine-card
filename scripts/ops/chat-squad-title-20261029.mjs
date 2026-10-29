import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OP='ops:chat-squad-title:20261029:v1';
export const ACTION='OPS_CHAT_SQUAD_TITLE_CREATE';
export const TITLE=Object.freeze({code:'TITLE_CHAT_SQUAD',name:'채팅부대',description:'함께 채팅을 채우고 응원을 이어가는 채팅부대. 운영자가 지급합니다.',badge_text:'채팅부대',image_url:'/assets/ui/titles/chat-squad-v1.webp',pve_power:'475000',unlock_type:'MANUAL',unlock_config_json:'{"fontPreset":"DISPLAY"}',style_preset:'CHAT_SQUAD',is_active:'1',is_public:'1',sort_order:'911'});
const q=async(c,s,p=[])=>(await c.query(s,p)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function verify(c,r,{exact=false}={}){
  r??=await receipt(c);assert.equal(r?.operationKey,OP);assert.equal(r.status,'COMPLETED');
  const current=one(await q(c,'SELECT * FROM character_titles WHERE id=$1 AND code=$2',[r.title.id,TITLE.code]));
  const audit=one(await q(c,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
  assert.equal(audit.id,r.auditId);const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
  if(exact)assert.deepEqual(current,r.title);
  return {verified:true,titleId:String(current.id),name:current.name,power:Number(current.pve_power),image:current.image_url,style:current.style_preset,manual:current.unlock_type==='MANUAL',active:Number(current.is_active)===1,public:Number(current.is_public)===1,unchangedSinceCreation:hash(current)===hash(r.title),auditId:r.auditId};
}
// Caller owns BEGIN/COMMIT. A completed operation only reads; it never restores
// old catalog values over subsequent CMS edits or grants accounts this title.
export async function apply(c,{referenceHash}={}){
  const old=await receipt(c);if(old)return {replayed:true,receipt:old,verification:await verify(c,old)};
  assert.match(referenceHash||'',/^[a-f0-9]{64}$/,'Inspected reference hash required');
  await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
  await c.query('LOCK TABLE character_titles IN SHARE ROW EXCLUSIVE MODE');
  const before=await q(c,'SELECT * FROM character_titles ORDER BY id');
  const reference=one(before.filter(t=>t.code==='RAID_BUS_DRIVER'));
  assert.equal(hash(reference),referenceHash,'Bus driver changed after inspection');
  assert.equal(reference.name,'버스기사');assert.equal(String(reference.pve_power),TITLE.pve_power);
  assert.equal(Number(reference.is_active),1);assert.equal(reference.unlock_type,'MANUAL');
  assert(!before.some(t=>t.code===TITLE.code||t.name===TITLE.name),'Title already exists; inspect instead of duplicating');
  assert.equal((await q(c,'SELECT id FROM admin_logs WHERE target_id=$1',[OP])).length,0);
  one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const now=new Date().toISOString(),keys=Object.keys(TITLE);
  const title=one(await q(c,`INSERT INTO character_titles(${keys.join(',')},created_at,updated_at) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')},$${keys.length+1},$${keys.length+1}) RETURNING *`,[...Object.values(TITLE),now]));
  const after=await q(c,'SELECT * FROM character_titles WHERE id<>$1 ORDER BY id',[title.id]);assert.deepEqual(after,before);
  const r={status:'COMPLETED',operationKey:OP,authorization:'채팅부대 칭호 만들고 전투력 버스기사랑 동일하게 만들어. 칭호 이미지도 만들어라 기존것들 만든거 참고해서.',completedAt:now,title,reference,referenceHash,existingCatalogHash:hash(before),existingCatalogPreserved:true,accountGrants:0,automaticEquip:false,messages:0};
  r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'CHARACTER_TITLE',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({reference,existingCatalogHash:r.existingCatalogHash}),JSON.stringify(r),now])).id;
  one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
  return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}

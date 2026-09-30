// Explicit user-approved registration only. No user ownership or currency writes.
import {ICON_LIVE_CARDS,ICON_FUSION_DEFAULT_SETTINGS,ICON_FUSION_SETTINGS_KEY,ICON_FUSION_POLICY} from '../../shared/icon-fusion-policy-v1.mjs';
export const RECEIPT_KEY='release_icon_fusion_cards_20260930_v1';
const ids=ICON_LIVE_CARDS.map(c=>c.cardId),names=ICON_LIVE_CARDS.map(c=>c.name);
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
export async function inspect(client){
 const members=await q(client,'SELECT id,name,is_active FROM members WHERE name=ANY($1::text[]) ORDER BY id',[names]);
 const cards=await q(client,'SELECT id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,base_power,power_type,is_active,card_status,draw_weight,reroll_material_enabled,reroll_result_enabled FROM cards WHERE id=ANY($1::text[]) OR rarity_override=\'ICON\' ORDER BY id',[ids]);
 const settings=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[RECEIPT_KEY,ICON_FUSION_SETTINGS_KEY]]);
 const foundation=await q(client,"SELECT to_regclass('joint_operations_v1') transactions,to_regclass('joint_atomic_guards_v1') guards,to_regprocedure('sqlite_json_each(text)') json_each");
 return {members,cards,settings,foundation:foundation[0]};
}
function memberFor(state,card){const matches=state.members.filter(m=>m.name===card.name&&Number(m.is_active)===1);if(matches.length!==1)throw Error('Member not unique/active: '+card.name);return Number(matches[0].id);}
function verify(state){
 for(const card of ICON_LIVE_CARDS){const row=state.cards.find(r=>r.id===card.cardId);if(!row||Number(row.member_id)!==memberFor(state,card)||row.title!==card.name||row.rarity!=='FUR'||row.rarity_override!=='ICON'||row.image_url!==card.sourceArt||Number(row.base_power)!==180000||Number(row.is_active)!==1||row.card_status!=='PUBLIC'||Number(row.draw_weight)!==0||Number(row.reroll_material_enabled)!==0||Number(row.reroll_result_enabled)!==0)throw Error('Registration mismatch: '+card.cardId);}
 const settings=state.settings.find(s=>s.key===ICON_FUSION_SETTINGS_KEY);if(!settings)throw Error('Missing explicit fusion policy');
 return {count:7,cards:state.cards.filter(c=>ids.includes(c.id)),settings:JSON.parse(settings.value)};
}
export async function apply(client,{dryRun=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SELECT pg_advisory_xact_lock(hashtext('release-icon-fusion-20260930-v1'))");
  const before=await inspect(client);if(!before.foundation.transactions||!before.foundation.guards||!before.foundation.json_each)throw Error('Existing transaction foundation unavailable');
  if(before.settings.some(s=>s.key===RECEIPT_KEY)){const result=verify(before);await client.query('COMMIT');return {...result,replayed:true,dryRun};}
  if(before.cards.length)throw Error('Unexpected pre-existing ICON cards; review before registration');
  if(before.settings.length)throw Error('Unexpected fusion settings; review before registration');
  const drafts=(await q(client,"SELECT value FROM app_meta WHERE key='icon_cms_v1'"))[0]?.value??null;
  for(const card of ICON_LIVE_CARDS){
   // Same existing storage contract as SUPERSTAR/ZENITH: effective grade is the override.
   const inserted=await client.query("INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,batch_name,batch_date,base_power,reroll_material_enabled,reroll_result_enabled) VALUES($1,$2,$3,'FUR','ICON',$4,$5,$6,1,0,'PUBLIC','ICON 합성 7종','2026-09-30',180000,0,0) RETURNING id",[card.cardId,memberFor(before,card),card.name,card.sourceArt,card.focusX??50,card.focusY??50]);
   if(inserted.rows.length!==1)throw Error('Missing registration row');
  }
  const settings={...ICON_FUSION_DEFAULT_SETTINGS,approvedAt:'2026-09-30',approval:'USER_EXPLICIT_LIVE_RELEASE',policy:ICON_FUSION_POLICY};
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[ICON_FUSION_SETTINGS_KEY,JSON.stringify(settings)]);
  const after=verify(await inspect(client));
  if((await q(client,"SELECT value FROM app_meta WHERE key='icon_cms_v1'"))[0]?.value!==drafts)throw Error('Effect drafts changed unexpectedly');
  const receipt={operation:RECEIPT_KEY,approvedBy:'USER_REQUEST_IN_CODEX',registeredAt:new Date().toISOString(),before:{cardCount:0},after,policy:ICON_FUSION_POLICY,ownershipWrites:0,currencyWrites:0};
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RECEIPT_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...after,dryRun,replayed:false,effectDraftsPreserved:true,ownershipWrites:0,currencyWrites:0};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

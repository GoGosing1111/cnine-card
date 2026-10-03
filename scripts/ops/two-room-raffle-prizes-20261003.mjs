import assert from 'node:assert/strict';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';

export const OPERATION_KEY='ops:two-room-raffle-prizes:20261003:v1';
export const TARGETS=Object.freeze([
  {
    "id": 289,
    "nickname": "베베킹",
    "requestedName": "베베킹",
    "equipmentCode": "BATTLE_SUIT_S_BODY"
  },
  {
    "id": 1421,
    "nickname": "다시생각",
    "requestedName": "다시생각",
    "mercenaryCode": "V-055"
  },
  {
    "id": 4010,
    "nickname": "슈라",
    "requestedName": "슈라",
    "mercenaryCode": "V-049"
  },
  {
    "id": 4209,
    "nickname": "#유나랜드",
    "requestedName": "#유나랜드",
    "equipmentCode": "BATTLE_SUIT_S_BODY"
  },
  {
    "id": 4501,
    "nickname": "장씨아저씨",
    "requestedName": "장씨아저씨",
    "equipmentCode": "BATTLE_SUIT_S_BODY"
  },
  {
    "id": 4540,
    "nickname": "지아영",
    "requestedName": "지아영",
    "mercenaryCode": "V-049"
  },
  {
    "id": 4598,
    "nickname": "암살자..",
    "requestedName": "암살자..",
    "equipmentCode": "BATTLE_SUIT_S_BODY"
  },
  {
    "id": 4610,
    "nickname": "고라니ㅇ",
    "requestedName": "고라니ㅇ",
    "mercenaryCode": "V-049"
  },
  {
    "id": 4774,
    "nickname": "딤럼프",
    "requestedName": "딤럼프",
    "equipmentCode": "BATTLE_SUIT_S_BODY"
  }
].map(Object.freeze));
const ids=TARGETS.map(t=>t.id),mercenaryNames={'V-049':'크라이베른','V-055':'베르칸'},EQUIPMENT_ID=47;
const allocations=TARGETS.flatMap(t=>[...(t.mercenaryCode?[{...t,kind:'MERCENARY',code:t.mercenaryCode}]:[]),...(t.equipmentCode?[{...t,kind:'EQUIPMENT',code:t.equipmentCode}]:[])]);
const keyFor=a=>`${OPERATION_KEY}:${a.id}:${a.code}`,acquisitionKeys=allocations.filter(a=>a.kind==='MERCENARY').map(keyFor),equipmentKeys=allocations.filter(a=>a.kind==='EQUIPMENT').map(keyFor);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
assert.equal(ids.length,9);assert.equal(new Set(ids).size,9);assert.equal(allocations.length,9);

// One-time operation, never imported by live game routes. The caller holds every
// target's production USER_LOCK and a single PostgreSQL transaction.
export async function snapshot(q){
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.equal(users.length,9);for(const t of TARGETS){const u=users.find(u=>Number(u.id)===t.id);assert.equal(u.nickname,t.nickname);assert.equal(u.status,'ACTIVE');assert.equal(u.role,'USER');}
 const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'"),[draw]=await q('SELECT revision,payload_json FROM mercenary_draw_config_v1 WHERE id=1');assert.ok(cms&&draw);
 const document=parse(cms.payload_json),weights=parse(draw.payload_json).cardRules?.cardWeights||{};
 for(const [code,name] of Object.entries(mercenaryNames)){const cards=document.mercenaries.filter(c=>c.code===code);assert.equal(cards.length,1);assert.equal(cards[0].name,name);assert.equal(cards[0].rank,'SSS');assert.ok(Number(weights[code]??1)>0,'Requested mercenary acquisition is disabled');}
 const catalog=await q('SELECT id,code,name,slot,is_active,is_public FROM character_equipment_items WHERE code=$1',['BATTLE_SUIT_S_BODY']);assert.equal(catalog.length,1);assert.equal(Number(catalog[0].id),EQUIPMENT_ID);assert.equal(catalog[0].name,'S-BODY');assert.equal(catalog[0].slot,'BATTLE_SUIT');assert.equal(Number(catalog[0].is_active),1);assert.equal(Number(catalog[0].is_public),1);
 const [ready]=await q("SELECT value FROM app_meta WHERE key='equipment_counts_v1_ready'");assert.equal(ready?.value,'1');
 const holdings=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const counts=await q('SELECT user_id,equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,equipment_id',[ids]);
 const mercenaryLoadouts=await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const growth=await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const equipmentLoadouts=await q('SELECT * FROM user_equipment_loadout WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,slot',[ids]);
 const chips=await q('SELECT * FROM user_skill_chip_loadout_v2046 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,slot_no',[ids]);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY acquisition_id',[acquisitionKeys]);
 const equipment=await q('SELECT id,user_id,equipment_id,source_type,source_id,request_id,acquired_at FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 AND request_id=ANY($2::text[]) ORDER BY user_id',[TARGETS.filter(t=>t.equipmentCode).map(t=>t.id),equipmentKeys]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,cms,draw,catalog,holdings,counts,mercenaryLoadouts,growth,equipmentLoadouts,chips,acquisitions,equipment,receipt:saved?parse(saved.value):null};
}

export async function verify(q,receipt){
 assert.equal(receipt?.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.allocations.length,9);
 const state=await snapshot(q);assert.equal(state.acquisitions.length,4);assert.equal(state.equipment.length,5);
 const audits=await q('SELECT id,admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[receipt.allocations.map(a=>a.adminLogId)]);assert.equal(audits.length,9);
 for(const a of allocations){const r=receipt.allocations.find(r=>r.userId===a.id&&r.code===a.code);assert.ok(r);assert.equal(r.requestedName,a.requestedName);assert.equal(r.nickname,a.nickname);assert.equal(r.quantity,1);assert.equal(r.permanent,true);assert.equal(r.requestId,keyFor(a));const audit=audits.find(v=>String(v.id)===r.adminLogId);assert.equal(Number(audit.admin_id),receipt.adminId);assert.equal(audit.target_id,String(a.id));assert.equal(parse(audit.after_data).operationKey,OPERATION_KEY);
  if(a.kind==='MERCENARY'){const acquisition=state.acquisitions.find(v=>v.acquisition_id===r.requestId),owned=state.holdings.find(v=>Number(v.user_id)===a.id&&v.mercenary_code===a.code);assert.equal(Number(acquisition?.user_id),a.id);assert.equal(acquisition.mercenary_code,a.code);assert.equal(Number(acquisition.total_copies_after),r.afterQuantity);assert.ok(Number(owned.total_copies)>=r.afterQuantity);assert.equal(Number(owned.duplicate_count),Number(owned.total_copies)-1);assert.equal(r.rank,'SSS');assert.equal(audit.action_type,'OPS_MERCENARY_GRANT');}
  else{const instance=state.equipment.find(v=>v.request_id===r.requestId);assert.equal(String(instance?.id),r.instanceId);assert.equal(Number(instance.user_id),a.id);assert.equal(Number(instance.equipment_id),EQUIPMENT_ID);assert.equal(instance.source_type,'ADMIN');assert.equal(instance.source_id,String(receipt.adminId));assert.equal(audit.action_type,'OPS_EQUIPMENT_GRANT');assert.ok(Number(state.counts.find(v=>Number(v.user_id)===a.id&&Number(v.equipment_id)===EQUIPMENT_ID)?.quantity)>=r.afterQuantity);}
 }
 return {...receipt,status:'VERIFIED'};
}

export async function grant(q,{failAfter=0}={}){
 assert.equal((await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).length,9);
 await q("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");await q('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 await q('SELECT id FROM character_equipment_items WHERE id=$1 FOR SHARE',[EQUIPMENT_ID]);
 const before=await snapshot(q);if(before.receipt){await verify(q,before.receipt);return {...before.receipt,replayed:true};}
 assert.equal(before.acquisitions.length,0,'Unreceipted acquisitions');assert.equal(before.equipment.length,0,'Unreceipted equipment grants');
 for(const t of TARGETS){const exact=await q('SELECT id FROM users WHERE nickname=$1',[t.nickname]);assert.equal(exact.length,1);assert.equal(Number(exact[0].id),t.id);}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const [date]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(date.kst,'2026-10-03');
 const now=new Date().toISOString(),receipt={status:'COMPLETED',operationKey:OPERATION_KEY,drawId:'7c6f7477-c87b-40c9-9592-964521e3a5ac',adminId:Number(owner.id),actor:'SYSTEM_OPS',quantityEach:1,allocations:[],preserved:{balances:true,existingEquipment:true,loadouts:true,growth:true,otherMercenaries:true,cmsAndDrawPolicy:true},completedAt:now};
 const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
 for(const a of allocations){const requestId=keyFor(a),r={userId:a.id,nickname:a.nickname,requestedName:a.requestedName,kind:a.kind,code:a.code,name:a.kind==='MERCENARY'?mercenaryNames[a.code]:'S-BODY',quantity:1,permanent:true,requestId};let owned;
  if(a.kind==='MERCENARY'){owned=before.holdings.find(v=>Number(v.user_id)===a.id&&v.mercenary_code===a.code)||null;r.rank='SSS';r.beforeQuantity=Number(owned?.total_copies||0);for(const s of mercenaryCardAcquisitionStatements(adapter,{userId:a.id,mercenaryCode:a.code,acquisitionId:requestId,createdAt:now}))await q(s.sql,s.args);r.afterQuantity=r.beforeQuantity+1;}
  else{owned=before.counts.find(v=>Number(v.user_id)===a.id&&Number(v.equipment_id)===EQUIPMENT_ID)||null;r.beforeQuantity=Number(owned?.quantity||0);const instances=await q("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id,acquired_at) VALUES($1,$2,'ADMIN',$3,$4,$5) RETURNING id",[a.id,EQUIPMENT_ID,String(owner.id),requestId,now]);assert.equal(instances.length,1);r.instanceId=String(instances[0].id);r.afterQuantity=r.beforeQuantity+1;}
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,a.kind==='MERCENARY'?'OPS_MERCENARY_GRANT':'OPS_EQUIPMENT_GRANT','USER',String(a.id),JSON.stringify({operationKey:OPERATION_KEY,owned}),JSON.stringify({...r,operationKey:OPERATION_KEY,authorization:'사용자 지시: 양방 추첨권 가중치·중복 당첨 없음으로 확정된 최종 추첨 7c6f7477-c87b-40c9-9592-964521e3a5ac의 상품 지급. 크라이베른 3명, S바디 5명, 베르칸 1명, 각 1개 영구 직접 지급.'})]);assert.ok(audit);r.adminLogId=String(audit.id);receipt.allocations.push(r);
  if(failAfter===receipt.allocations.length)throw Error('EXPECTED_PARTIAL_GRANT_FAILURE');
 }
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 const after=await snapshot(q);for(const k of ['users','cms','draw','catalog','mercenaryLoadouts','growth','equipmentLoadouts','chips'])assert.deepEqual(after[k],before[k],`Unexpected ${k} change`);
 const unrelatedMerc=rows=>rows.filter(v=>!allocations.some(a=>a.kind==='MERCENARY'&&a.id===Number(v.user_id)&&a.code===v.mercenary_code));assert.deepEqual(unrelatedMerc(after.holdings),unrelatedMerc(before.holdings));
 const unrelatedEq=rows=>rows.filter(v=>!allocations.some(a=>a.kind==='EQUIPMENT'&&a.id===Number(v.user_id)&&Number(v.equipment_id)===EQUIPMENT_ID));assert.deepEqual(unrelatedEq(after.counts),unrelatedEq(before.counts));
 for(const a of receipt.allocations){const row=a.kind==='MERCENARY'?after.holdings.find(v=>Number(v.user_id)===a.userId&&v.mercenary_code===a.code):after.counts.find(v=>Number(v.user_id)===a.userId&&Number(v.equipment_id)===EQUIPMENT_ID);assert.equal(Number(row?.[a.kind==='MERCENARY'?'total_copies':'quantity']),a.afterQuantity);}
 await verify(q,receipt);return {...receipt,replayed:false};
}

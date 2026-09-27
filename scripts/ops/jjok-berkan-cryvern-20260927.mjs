import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import {validateMercenaryDraw} from '../../shared/mercenary-draw-policy-v1.mjs';

export const OPERATION_KEY='ops:jjok:berkan-to-cryvern:20260927';
export const TARGET=Object.freeze({id:303,nickname:'[C9]족쪽이'});
export const SOURCE_ACQUISITION='0bb9a57a-9e12-4b56-86bc-9fe09e77a550:6';
const FROM='V-055',TO='V-049',parse=x=>typeof x==='string'?JSON.parse(x):x;
export const DISABLE_KEY='ops:berkan-acquisition-off:20260927';
export async function disableBerkanAcquisition(q){
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[DISABLE_KEY]);
 if(prior){const r=parse(prior.value);assert.equal(r.status,'COMPLETED');assert.equal(r.code,FROM);return {...r,replayed:true};}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const [row]=await q('SELECT revision,payload_json FROM mercenary_draw_config_v1 WHERE id=1 FOR UPDATE');assert.ok(row);
 const before=validateMercenaryDraw(parse(row.payload_json)),next=structuredClone(before);next.cardRules.cardWeights[FROM]=0;validateMercenaryDraw(next);
 const requestId='berkan-acquisition-off-20260927-v1',reason='사용자 지시: 베르칸 신규 획득 OFF. CMS 용병별 획득 허용에서 직접 재설정 가능. 기존 등급 확률·다른 용병 가중치 유지.',payload=JSON.stringify(next),now=new Date().toISOString(),revision=Number(row.revision)+1;
 assert.equal((await q('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=$2,last_request_id=$3,updated_by=1,updated_at=$4 WHERE id=1 AND revision=$5 RETURNING id',[payload,revision,requestId,now,row.revision])).length,1);
 const hash=createHash('sha256').update('1:'+row.revision+':'+reason+':'+payload).digest('hex');
 await q('INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at) VALUES($1,1,$2,$3,$4,$5,$6,$7)',[requestId,hash,revision,reason,row.payload_json,payload,now]);
 const receipt={status:'COMPLETED',operationKey:DISABLE_KEY,code:FROM,name:'베르칸',weightBefore:before.cardRules.cardWeights[FROM]??null,weightAfter:0,drawRevision:revision,requestId,completedAt:now};
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_ACQUISITION_OFF','MERCENARY',FROM,JSON.stringify({revision:Number(row.revision),weight:receipt.weightBefore}),JSON.stringify(receipt)]);assert.ok(audit);receipt.adminLogId=String(audit.id);
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[DISABLE_KEY,JSON.stringify(receipt),now]);return {...receipt,replayed:false};
}
async function snapshot(q){
 const [user]=await q('SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
 return {user,holdings:await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]),
  loadouts:await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[TARGET.id]),
  growth:await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id])};
}
// Caller holds USER_LOCK and a single PostgreSQL transaction. Keep the original
// opening/acquisition history, and record this separate, retry-safe correction.
export async function replaceBerkanWithCryvern(q){
 const [user]=await q('SELECT id,nickname,role,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
 assert.ok(user);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved){const r=parse(saved.value);assert.equal(r.status,'COMPLETED');assert.equal(r.userId,TARGET.id);assert.equal(r.from,FROM);assert.equal(r.to,TO);assert.equal(r.quantity,1);
  const [acquired]=await q('SELECT user_id,mercenary_code FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]);assert.equal(Number(acquired?.user_id),TARGET.id);assert.equal(acquired.mercenary_code,TO);
  return {...r,replayed:true};}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const before=await snapshot(q),source=before.holdings.find(c=>c.mercenary_code===FROM),destination=before.holdings.find(c=>c.mercenary_code===TO);
 if(!source)return {status:'NOT_OWNED',userId:TARGET.id,from:FROM,to:TO,quantity:0};
 assert.equal(Number(source.total_copies),1,'Source ownership changed; inspect again');assert.equal(Number(source.duplicate_count),0);
 const [original]=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[SOURCE_ACQUISITION]);
 assert.equal(Number(original?.user_id),TARGET.id);assert.equal(original.mercenary_code,FROM);
 assert.equal((await q('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0);
 const now=new Date().toISOString(),priorCopies=Number(destination?.total_copies||0);
 const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args}}}}};
 for(const s of mercenaryCardAcquisitionStatements(adapter,{userId:TARGET.id,mercenaryCode:TO,acquisitionId:OPERATION_KEY,createdAt:now}))await q(s.sql,s.args);
 assert.equal((await q('DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 AND duplicate_count=0 RETURNING user_id',[TARGET.id,FROM])).length,1);
 const loadout=before.loadouts[0],loadoutReplaced=loadout?.mercenary_code===FROM;
 if(loadoutReplaced)assert.equal((await q('UPDATE user_mercenary_loadout_v1 SET mercenary_code=$1,revision=revision+1,updated_at=$2 WHERE user_id=$3 AND mercenary_code=$4 AND revision=$5 RETURNING user_id',[TO,now,TARGET.id,FROM,loadout.revision])).length,1);
 const after=await snapshot(q),owned=after.holdings.find(c=>c.mercenary_code===TO);
 assert.ok(!after.holdings.some(c=>c.mercenary_code===FROM));assert.equal(Number(owned.total_copies),priorCopies+1);assert.equal(Number(owned.duplicate_count),priorCopies);
 if(destination)assert.equal(owned.first_obtained_at,destination.first_obtained_at);
 assert.deepEqual(after.user,before.user);assert.deepEqual(after.growth,before.growth);
 const unrelated=rows=>rows.filter(c=>![FROM,TO].includes(c.mercenary_code));assert.deepEqual(unrelated(after.holdings),unrelated(before.holdings));
 if(loadoutReplaced){assert.equal(after.loadouts[0].mercenary_code,TO);assert.equal(Number(after.loadouts[0].revision),Number(loadout.revision)+1);}else assert.deepEqual(after.loadouts,before.loadouts);
 assert.deepEqual((await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[SOURCE_ACQUISITION]))[0],original);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,from:FROM,to:TO,fromName:'베르칸',toName:'크라이베른',rank:'SSS',quantity:1,permanent:true,sourceAcquisitionId:SOURCE_ACQUISITION,sourceCopiesAfter:0,destinationCopiesBefore:priorCopies,destinationCopiesAfter:priorCopies+1,loadoutReplaced,loadoutAfter:after.loadouts[0]||null,completedAt:now};
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_MERCENARY_REPLACE','USER',String(TARGET.id),JSON.stringify({source,destination:destination||null,loadout:loadout||null}),JSON.stringify({...receipt,actor:'SYSTEM_OPS',authorization:'[C9]족쪽이 베르칸 보유 시 교체. 후속 지시: 크라이베른으로 지급해 라그니엘 말고.'})]);assert.ok(audit);receipt.adminLogId=String(audit.id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 return {...receipt,replayed:false};
}

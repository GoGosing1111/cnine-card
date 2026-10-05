import assert from 'node:assert/strict';
import {inspectGrant as inspectOriginalGrant,OPERATION_KEY as SOURCE_GRANT_KEY,TARGET,CARD as SOURCE_CARD} from './eumsuni-icon-heeya-grant-20261006.mjs';
export {TARGET,SOURCE_GRANT_KEY,SOURCE_CARD};
export const OPERATION_KEY='ops:eumsuni-icon-heeya-to-diim:20261006:v1';
export const CARD=Object.freeze({id:'CN-1C000001',title:'디임',grade:'ICON'});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const row=(s,id)=>s.holdings.find(r=>r.card_id===id);
const quantity=(s,id)=>Number(row(s,id)?.quantity||0);
const normalize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));
const DECKS=['pve_decks','pvp_decks','pvp_deck_presets','account_rank_presets_v1'];
export async function inspectGrant(q){
 const source=await inspectOriginalGrant(q),grant=source.receipt;
 assert.ok(grant,'Original grant receipt required');
 for(const [key,value] of Object.entries({status:'COMPLETED',operationKey:SOURCE_GRANT_KEY,userId:65,cardId:SOURCE_CARD.id,quantity:1,quantityBefore:0,quantityAfter:1}))assert.equal(grant[key],value,'Original grant mismatch');
 assert.equal(source.audits.length,1);assert.equal(source.audits[0].action_type,'OPS_CARD_GRANT');assert.equal(source.audits[0].target_id,'65');assert.equal(parse(source.audits[0].after_data).operationKey,SOURCE_GRANT_KEY);
 const cards=await q("SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,m.name member_name,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1 OR (UPPER(c.rarity)='ICON' AND m.name=$2) ORDER BY c.id",[CARD.id,CARD.title]);
 assert.equal(cards.length,1,'Destination card must be unique');const [card]=cards;
 assert.deepEqual({id:card.id,title:card.title,grade:card.grade},CARD);assert.equal(Number(card.is_active),1);assert.equal(card.card_status,'PUBLIC');assert.equal(Number(card.member_active),1);
 const decks={};for(const table of DECKS)decks[table]=await q('SELECT * FROM '+table+' WHERE user_id=$1 ORDER BY card_ids',[TARGET.id]);
 const saved=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]),receipt=saved.length?parse(saved[0].value):null;
 const audits=receipt?await q('SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]):[];
 return {...source,sourceCard:source.card,sourceGrant:grant,sourceAudits:source.audits,card,decks,receipt,audits,sourceQuantity:quantity(source,SOURCE_CARD.id),quantity:quantity(source,CARD.id)};
}
export async function verifyGrant(q){
 const state=await inspectGrant(q),r=state.receipt;
 assert.ok(r,'Swap receipt missing');
 for(const [key,value] of Object.entries({status:'COMPLETED',operationKey:OPERATION_KEY,userId:65,nickname:'음순이',sourceGrantKey:SOURCE_GRANT_KEY,sourceCardId:SOURCE_CARD.id,cardId:CARD.id,quantity:1,permanent:true}))assert.equal(r[key],value);
 assert.equal(state.audits.length,1);const [audit]=state.audits;
 assert.equal(audit.action_type,'OPS_CARD_SWAP');assert.equal(audit.target_id,'65');assert.equal(parse(audit.after_data).operationKey,OPERATION_KEY);
 assert.equal(r.sourceQuantityBefore-r.sourceQuantityAfter,1);assert.equal(r.quantityAfter-r.quantityBefore,1);
 assert.ok(state.sourceQuantity>=r.sourceQuantityAfter);assert.ok(state.quantity>=r.quantityAfter);
 return {status:'VERIFIED',receipt:r,currentSourceQuantity:state.sourceQuantity,currentQuantity:state.quantity,currentLevel:Number(row(state,CARD.id)?.breakthrough_level||0),auditCount:1,sourceGrantPreserved:true};
}
// Explicit correction of the prior one-card grant; caller holds USER_LOCK + transaction.
export async function grantCard(q){
 const [day]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(day.kst,'2026-10-06','One-time operation expired');
 assert.equal((await q('SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id])).length,1);
 const before=await inspectGrant(q);
 if(before.receipt){const v=await verifyGrant(q);return {...v.receipt,replayed:true};}
 const sourceBefore=row(before,SOURCE_CARD.id),targetBefore=row(before,CARD.id);
 assert.ok(Number.isSafeInteger(before.sourceQuantity)&&before.sourceQuantity>=1,'Granted Heeya copy is no longer available');
 assert.ok(Number.isSafeInteger(before.quantity)&&before.quantity>=0&&before.quantity<Number.MAX_SAFE_INTEGER);
 // The reviewed grant is not equipped. Never leave an invalid deck after removal.
 if(before.sourceQuantity===1)for(const rows of Object.values(before.decks))for(const deck of rows)assert.ok(!parse(deck.card_ids).includes(SOURCE_CARD.id),'Source was equipped after lookup; review deck replacement first');
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const removed=await q('UPDATE user_cards SET quantity=quantity-1 WHERE user_id=$1 AND card_id=$2 AND quantity=$3 RETURNING *',[65,SOURCE_CARD.id,before.sourceQuantity]);
 assert.equal(removed.length,1);assert.deepEqual(normalize(removed[0]),normalize({...sourceBefore,quantity:before.sourceQuantity-1}),'Unexpected source change');
 const now=new Date().toISOString();
 const added=await q('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,0,$3,$3) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=excluded.last_obtained_at RETURNING *',[65,CARD.id,now]);
 assert.equal(added.length,1);assert.equal(Number(added[0].quantity),before.quantity+1);
 assert.equal(Number(added[0].breakthrough_level),Number(targetBefore?.breakthrough_level||0));assert.equal(Number(added[0].breakthrough_fail_count),Number(targetBefore?.breakthrough_fail_count||0));
 if(targetBefore)assert.deepEqual(normalize(added[0]),normalize({...targetBefore,quantity:added[0].quantity,last_obtained_at:added[0].last_obtained_at}));
 const after=await inspectGrant(q);
 assert.equal(after.sourceQuantity,before.sourceQuantity-1);assert.equal(after.quantity,before.quantity+1);
 for(const key of ['user','stars','decks','sourceGrant','sourceAudits'])assert.deepEqual(after[key],before[key],'Unexpected '+key+' change');
 const other=s=>s.holdings.filter(r=>![SOURCE_CARD.id,CARD.id].includes(r.card_id));assert.deepEqual(other(after),other(before));
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',userId:65,nickname:'음순이',sourceGrantKey:SOURCE_GRANT_KEY,sourceGrantAuditId:before.sourceGrant.adminLogId,sourceCardId:SOURCE_CARD.id,sourceCardTitle:SOURCE_CARD.title,cardId:CARD.id,cardTitle:CARD.title,grade:'ICON',quantity:1,permanent:true,sourceQuantityBefore:before.sourceQuantity,sourceQuantityAfter:after.sourceQuantity,quantityBefore:before.quantity,quantityAfter:after.quantity,levelAfter:Number(added[0].breakthrough_level),balancesPreserved:true,decksPreserved:true,otherCardsPreserved:true,historyPreserved:true,completedAt:now};
 const audits=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CARD_SWAP','USER','65',JSON.stringify({operationKey:OPERATION_KEY,source:sourceBefore,target:targetBefore||null}),JSON.stringify({...receipt,authorization:'아이콘 희야 회수하고 아이콘 디임으로 지급해'})]);assert.equal(audits.length,1);receipt.adminLogId=String(audits[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 await verifyGrant(q);return {...receipt,replayed:false};
}

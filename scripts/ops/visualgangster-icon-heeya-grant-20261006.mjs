import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:visualgangster-icon-heeya:20261006:v1';
export const TARGET=Object.freeze({id:81,nickname:'비쥬얼깡패'});
export const CARD=Object.freeze({id:'CN-1C000002',title:'하이희야',grade:'ICON'});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const normalize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));
const owned=s=>s.holdings.find(r=>r.card_id===CARD.id);
export async function inspectGrant(q){
 const matches=await q('SELECT id FROM users WHERE nickname=$1 ORDER BY id',[TARGET.nickname]);
 assert.equal(matches.length,1,'Nickname must identify one account');assert.equal(Number(matches[0].id),TARGET.id);
 const [user]=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
 assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const rows=await q("SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.is_active,c.card_status,m.name AS member_name,m.is_active AS member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1 OR (UPPER(c.rarity)='ICON' AND m.name=$2) ORDER BY c.id",[CARD.id,CARD.title]);
 assert.equal(rows.length,1,'ICON catalog must match exactly once');const [card]=rows;
 assert.deepEqual({id:card.id,title:card.title,grade:card.grade},CARD);
 assert.equal(Number(card.is_active),1);assert.equal(card.card_status,'PUBLIC');assert.equal(Number(card.member_active),1);
 const holdings=await q('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id',[TARGET.id]);
 const stars=await q("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code='MASTER_STAR'",[TARGET.id]);
 const saved=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const receipt=saved.length?parse(saved[0].value):null;
 const audits=receipt?await q('SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]):[];
 return {user,card,holdings,stars,receipt,audits,quantity:Number(holdings.find(r=>r.card_id===CARD.id)?.quantity||0)};
}
export async function verifyGrant(q){
 const state=await inspectGrant(q),r=state.receipt;
 assert.ok(r,'Grant receipt missing');
 for(const [key,val] of Object.entries({status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,cardId:CARD.id,cardTitle:CARD.title,grade:'ICON',quantity:1,permanent:true}))assert.equal(r[key],val);
 assert.equal(state.audits.length,1);const [audit]=state.audits;
 assert.equal(audit.action_type,'OPS_CARD_GRANT');assert.equal(audit.target_id,String(TARGET.id));assert.equal(parse(audit.after_data).operationKey,OPERATION_KEY);
 assert.ok(state.quantity>=r.quantityAfter,'Granted holding missing');
 return {status:'VERIFIED',receipt:r,currentQuantity:state.quantity,currentLevel:Number(owned(state)?.breakthrough_level||0),auditCount:state.audits.length};
}
// Caller holds the production USER_LOCK and one PostgreSQL transaction.
export async function grantCard(q){
 const [day]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(day.kst,'2026-10-06','One-time operation expired');
 assert.equal((await q('SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id])).length,1);
 const before=await inspectGrant(q);
 if(before.receipt){const verified=await verifyGrant(q);return {...verified.receipt,replayed:true};}
 const [operator]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(operator,'Audit owner unavailable');
 const previous=owned(before),quantity=Number(previous?.quantity||0);
 assert.ok(Number.isSafeInteger(quantity)&&quantity>=0&&quantity<Number.MAX_SAFE_INTEGER);
 const now=new Date().toISOString();
 const rows=await q('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,0,$3,$3) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=excluded.last_obtained_at RETURNING *',[TARGET.id,CARD.id,now]);
 assert.equal(rows.length,1);const [holding]=rows;
 assert.equal(Number(holding.quantity),quantity+1);
 assert.equal(Number(holding.breakthrough_level),Number(previous?.breakthrough_level||0));
 assert.equal(Number(holding.breakthrough_fail_count),Number(previous?.breakthrough_fail_count||0));
 if(previous)assert.deepEqual(normalize(holding),normalize({...previous,quantity:holding.quantity,last_obtained_at:holding.last_obtained_at}),'Unexpected holding field change');
 const after=await inspectGrant(q);
 assert.deepEqual(after.user,before.user,'Wallet changed');assert.deepEqual(after.stars,before.stars,'Master stars changed');
 assert.deepEqual(after.holdings.filter(r=>r.card_id!==CARD.id),before.holdings.filter(r=>r.card_id!==CARD.id),'Other cards changed');
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',userId:TARGET.id,nickname:TARGET.nickname,cardId:CARD.id,cardTitle:CARD.title,grade:CARD.grade,quantity:1,permanent:true,quantityBefore:quantity,quantityAfter:Number(holding.quantity),levelAfter:Number(holding.breakthrough_level),balancesPreserved:true,otherCardsPreserved:true,completedAt:now};
 const audits=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[operator.id,'OPS_CARD_GRANT','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,holding:previous||null}),JSON.stringify({...receipt,authorization:'비쥬얼깡패 계정에 아이콘 하이희야 지급해'})]);
 assert.equal(audits.length,1);receipt.adminLogId=String(audits[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 await verifyGrant(q);
 return {...receipt,replayed:false};
}

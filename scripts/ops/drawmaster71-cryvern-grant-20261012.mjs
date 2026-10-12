import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PLAN=Object.freeze({
 operationKey:'ops:drawmaster71-cryvern:20261012:v1',authorization:'뽑기고수71에 크라이베른 지급',
 userId:'850',nickname:'뽑기고수71',code:'V-049',name:'크라이베른',rank:'SSS',
 quantity:1,permanent:true,delivery:'DIRECT',
 settingsHash:'0ab09f1d3b87ae064d46f4a6f13c9c2d166966d067c7216442e12f46ded28431'
});
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_MERCENARY_GRANT';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const only=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};

export async function lockGrant(c){
 only(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 only(await q(c,"SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
 only(await q(c,'SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]);
}

export async function grantState(c){
 const user=only(await q(c,'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[PLAN.userId]));
 const cms=await q(c,"SELECT doc_key,revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");
 const draw=await q(c,'SELECT id,payload_json FROM mercenary_draw_config_v1 WHERE id=1');
 return {user,settings:{cms,draw},
  cards:await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId]),
  loadout:await q(c,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[PLAN.userId]),
  growth:await q(c,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId])};
}

export async function verifyCryvern(c,receipt,{exact=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,PLAN);
 assert.equal(receipt.copiesAfter,receipt.copiesBefore+1);
 assert.equal(receipt.duplicatesAfter,receipt.copiesAfter-1);
 const acquisition=only(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(String(acquisition.user_id),PLAN.userId);assert.equal(acquisition.mercenary_code,PLAN.code);
 assert.equal(Number(acquisition.total_copies_after),receipt.copiesAfter);
 assert.equal(Number(acquisition.duplicate_count_after),receipt.duplicatesAfter);
 assert.equal(Number(acquisition.is_duplicate),receipt.copiesBefore>0?1:0);
 assert.equal(acquisition.created_at,receipt.completedAt);
 const holding=only(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code]));
 assert.ok(Number(holding.total_copies)>=receipt.copiesAfter);
 assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 const audit=only(await q(c,'SELECT * FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]));
 assert.equal(String(audit.admin_id),receipt.adminId);assert.equal(audit.action_type,ACTION);
 assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,PLAN.userId);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.after_data),logged);
 assert.deepEqual(JSON.parse(audit.before_data),{operationKey:OPERATION_KEY,holding:receipt.holdingBefore});
 if(exact){assert.equal(Number(holding.total_copies),receipt.copiesAfter);assert.equal(holding.last_obtained_at,receipt.completedAt);}
 return {status:'VERIFIED',userId:PLAN.userId,nickname:PLAN.nickname,code:PLAN.code,rank:PLAN.rank,
  quantity:1,copiesAfter:receipt.copiesAfter,currentCopies:Number(holding.total_copies),
  acquisitionRecords:1,adminRecords:1,missing:0,duplicateOperationGrants:0};
}

// Caller owns one transaction. Ownership, acquisition, audit and receipt commit together.
export async function grantCryvern(c,approvedPlanHash){
 assert.equal(approvedPlanHash,PLAN_HASH,'Inspected plan hash required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyCryvern(c,receipt)};}
 await lockGrant(c);const before=await grantState(c);
 assert.equal(before.user.nickname,PLAN.nickname);assert.equal(before.user.status,'ACTIVE');assert.equal(before.user.role,'USER');
 assert.equal(String(only(await q(c,'SELECT id FROM users WHERE nickname=$1',[PLAN.nickname])).id),PLAN.userId);
 assert.equal(createHash('sha256').update(JSON.stringify(before.settings)).digest('hex'),PLAN.settingsHash,'Mercenary settings changed; inspect before grant');
 const config=JSON.parse(only(before.settings.cms).payload_json),draw=JSON.parse(only(before.settings.draw).payload_json);
 const card=only(config.mercenaries.filter(m=>m.code===PLAN.code));
 assert.equal(card.name,PLAN.name);assert.equal(card.rank,PLAN.rank);assert.equal(card.review,'REVIEWED');
 assert.ok(Number(draw.cardRules?.cardWeights?.[PLAN.code]??1)>0,'Mercenary acquisition is OFF');
 assert.equal((await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code])).length,0,'Limited stock requires separate handling');
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Orphan acquisition requires reconciliation');
 const owner=only(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const holdingBefore=before.cards.find(r=>r.mercenary_code===PLAN.code)||null,copiesBefore=Number(holdingBefore?.total_copies||0);
 if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),copiesBefore-1);
 assert.ok(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);
 const now=new Date().toISOString();
 const holding=only(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
  VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
  total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,
  last_obtained_at=excluded.last_obtained_at RETURNING *`,[PLAN.userId,PLAN.code,now]));
 assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
 assert.equal(holding.first_obtained_at,holdingBefore?.first_obtained_at||now);
 only(await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
  VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id`,[OPERATION_KEY,PLAN.userId,PLAN.code,copiesBefore>0?1:0,holding.total_copies,holding.duplicate_count,now]));
 const after=await grantState(c);
 for(const field of ['user','settings','loadout','growth'])assert.deepEqual(after[field],before[field],field+' changed unexpectedly');
 const other=cards=>cards.filter(r=>r.mercenary_code!==PLAN.code);assert.deepEqual(other(after.cards),other(before.cards));
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',adminId:owner.id,
  completedAt:now,holdingBefore,copiesBefore,copiesAfter:Number(holding.total_copies),
  duplicatesAfter:Number(holding.duplicate_count),preserved:{balances:true,settings:true,loadout:true,growth:true,otherMercenaries:true}};
 const audit=only(await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,$2,'USER',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,PLAN.userId,
  JSON.stringify({operationKey:OPERATION_KEY,holding:holdingBefore}),JSON.stringify(receipt)]));
 receipt.adminLogId=audit.id;
 only(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 return {receipt,replayed:false,verification:await verifyCryvern(c,receipt,{exact:true})};
}

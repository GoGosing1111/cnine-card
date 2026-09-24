import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../../shared/mercenary-cms-model-v1.mjs';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';

export const OPERATION_KEY='ops:pink:mercenary:V-049:1:20260924';
export const TARGET=Object.freeze({id:1,nickname:'핑크빛유두'});
const CODE='V-049';
const parse=value=>typeof value==='string'?JSON.parse(value):value;

// Operator-only helper, never a game route. Caller must use one authenticated
// PostgreSQL transaction for the grant, acquisition journal, audit and receipt.
export async function inspectPinkCryvern(q){
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE nickname=$1',[TARGET.nickname]);
 assert.equal(users.length,1,'Account must be unique');
 const user=users[0];
 assert.equal(Number(user.id),TARGET.id,'Wrong account');
 assert.equal(user.role,'OWNER');assert.equal(user.status,'ACTIVE');
 const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");
 assert.ok(cms,'Missing live CMS configuration');
 const config=expandMercenarySkillCatalog(parse(cms.payload_json),seed.document,seed.catalog);
 const mercenary=config.mercenaries.find(row=>row.code===CODE);
 assert.equal(mercenary?.name,'크라이베른');assert.equal(mercenary.rank,'SSS');
 assert.ok(config.assignments.find(row=>row.code===CODE)?.skillIds.includes('MS-049'),'Missing approved skill');
 const [owned]=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,CODE]);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE user_id=$1 AND mercenary_code=$2 ORDER BY created_at,acquisition_id',[TARGET.id,CODE]);
 const [loadout]=await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[TARGET.id]);
 const [growth]=await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,CODE]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {user,mercenary:{code:CODE,name:mercenary.name,rank:mercenary.rank},cmsRevision:Number(cms.revision),owned:owned||null,acquisitions,loadout:loadout||null,growth:growth||null,receipt:saved?parse(saved.value):null};
}

export async function grantPinkCryvern(q){
 const locked=await q('SELECT id,nickname,role,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
 assert.equal(locked.length,1);assert.equal(locked[0].nickname,TARGET.nickname);
 assert.equal(locked[0].role,'OWNER');assert.equal(locked[0].status,'ACTIVE');
 const before=await inspectPinkCryvern(q);
 if(before.receipt){
  const receipt=before.receipt;
  assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,TARGET.id);
  assert.equal(receipt.mercenaryCode,CODE);assert.equal(receipt.quantity,1);
  assert.equal(receipt.operationKey,OPERATION_KEY);
  assert.equal(before.acquisitions.filter(row=>row.acquisition_id===OPERATION_KEY).length,1,'Missing acquisition receipt');
  return {...receipt,replayed:true};
 }
 assert.equal((await q('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Acquisition without operation receipt');
 const copiesBefore=Number(before.owned?.total_copies||0);
 if(before.owned)assert.equal(Number(before.owned.duplicate_count),copiesBefore-1);
 const createdAt=new Date().toISOString();
 const adapter={
  dialect:'postgres',
  prepare(sql){
   return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args}}};
  }
 };
 for(const statement of mercenaryCardAcquisitionStatements(adapter,{userId:TARGET.id,mercenaryCode:CODE,acquisitionId:OPERATION_KEY,createdAt}))await q(statement.sql,statement.args);
 const after=await inspectPinkCryvern(q);
 assert.equal(Number(after.owned.total_copies),copiesBefore+1);
 assert.equal(Number(after.owned.duplicate_count),copiesBefore);
 assert.equal(after.acquisitions.length,before.acquisitions.length+1);
 assert.equal(after.acquisitions.filter(row=>row.acquisition_id===OPERATION_KEY).length,1);
 assert.deepEqual(after.user,before.user,'Account balance changed');
 assert.deepEqual(after.loadout,before.loadout,'Existing loadout changed');
 assert.deepEqual(after.growth,before.growth,'Existing growth changed');
 if(before.owned)assert.equal(after.owned.first_obtained_at,before.owned.first_obtained_at);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',userId:TARGET.id,nickname:TARGET.nickname,mercenaryCode:CODE,mercenaryName:'크라이베른',rank:'SSS',quantity:1,beforeCopies:copiesBefore,totalCopies:copiesBefore+1,duplicates:copiesBefore,balancesPreserved:true,loadoutPreserved:before.loadout?.mercenary_code||null,completedAt:createdAt};
 const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[
  TARGET.id,'OPS_MERCENARY_GRANT','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,owned:before.owned,loadout:before.loadout}),JSON.stringify({...receipt,authorization:'사용자 지시: 핑크빛유두에 크라이베른 지급'})
 ]);
 assert.equal(audit.length,1,'Missing administrator audit');receipt.adminLogId=String(audit[0].id);
 const saved=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),createdAt]);
 assert.equal(saved.length,1);
 return {...receipt,replayed:false};
}

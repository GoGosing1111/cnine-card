import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import approval from '../../assets/ui/pets/approved-nine-20261014/approval-20261014.json' with {type:'json'};
import {PET_ART_CATALOG} from '../../shared/pet-art-catalog-v1.mjs';
import {validatePetCmsDocument} from '../../shared/pet-cms-v1.mjs';

export const OPERATION_KEY='ops:pets-nine-live:20261014:v1';
export const additions=approval.assets.map(a=>{
 const art=PET_ART_CATALOG.find(p=>p.code===a.code);assert.equal(art?.sha256,a.sha256);
 return {code:a.code,name:a.name,sourceArt:a.sourceArt,battleSprite:a.sourceArt,enabled:true,liveEnabled:true,
  modes:['PVE','PVP'],target:'ALL_ALLIES',buffs:[{type:'ATTACK_PERCENT',percent:10}],notes:'2026-10-14 사용자 9종 전체 라이브 반영 승인 / 원본 보존'};
});
export function planPetRegistration(state){
 assert.equal(additions.length,9);assert(Number.isSafeInteger(state.revision));
 for(const p of additions)assert(!state.document.pets.some(old=>old.code===p.code),'Already registered: '+p.code);
 const document={...state.document,pets:[...state.document.pets,...additions]};
 assert.deepEqual(validatePetCmsDocument(document),document);
 return {document,expectedRevision:state.revision,requestId:'pets-nine-live-20261014-v1'};
}
export async function registerApprovedPets(client,{expectedRevision}={}){
 await client.query('BEGIN');
 try{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',['pet_cms_preparation_v1'])).rows[0];
  const before=JSON.parse(row.value);assert.equal(before.revision,expectedRevision,'CMS changed; inspect again');
  const plan=planPetRegistration(before);
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Active OWNER required');
  const now=new Date().toISOString(),revision=before.revision+1;
  const payloadHash=createHash('sha256').update(JSON.stringify([String(owner.id),before.revision,plan.document])).digest('hex');
  const next={...before,document:plan.document,revision,updatedAt:now,updatedBy:owner.id,
   audit:[{requestId:plan.requestId,payloadHash,actorId:owner.id,revision,createdAt:now},...(before.audit||[])].slice(0,50)};
  const receipt={operationKey:OPERATION_KEY,revision,previousRevision:before.revision,addedCodes:additions.map(a=>a.code),preservedRows:before.document.pets.length,completedAt:now,accountGrant:false,openingPoolChanged:false};
  const changed=await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),'pet_cms_preparation_v1',row.value]);assert.equal(changed.rowCount??changed.affectedRows,1);
  await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[owner.id,'OPS_PETS_NINE_LIVE','PET_CMS',OPERATION_KEY,JSON.stringify(before),JSON.stringify(next)]);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query('COMMIT');return receipt;
 }catch(e){await client.query('ROLLBACK');throw e;}
}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES as PETS} from '../../shared/pet-pumpkin-choice-v1.mjs';
import {PET_CMS_KEY,validatePetCmsDocument} from '../../shared/pet-cms-v1.mjs';
import {PET_OPENING_KEY} from '../../shared/pet-opening-v1.mjs';
import {PET_POTENTIAL_SETTINGS_KEY} from '../../shared/pet-potential-v1.mjs';

export const OPERATION_KEY='ops:pet-pumpkin-choice:20261023:v1';
const protectedKeys=[PET_CMS_KEY,PET_OPENING_KEY,PET_POTENTIAL_SETTINGS_KEY,'supporter_season_pass_v1'];
const digest=value=>createHash('sha256').update(value??'null').digest('hex');
export async function registerPetPumpkinChoiceItem(client,{commit=false,actorId=1}={}){
  assert.equal(typeof commit,'boolean');assert(Number.isSafeInteger(actorId)&&actorId>0);
  const q=async(sql,values=[])=>(await client.query(sql,values)).rows;
  await q('BEGIN');try{
    await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
    assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId])).length,'Active OWNER is required');
    assert(!(await q('SELECT code FROM inventory_items WHERE code=$1 FOR UPDATE',[ITEM.code])).length,'Unexpected existing item; inspect before replacing');
    const before=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[protectedKeys]);
    const cmsRaw=before.find(row=>row.key===PET_CMS_KEY)?.value;assert(cmsRaw,'Registered pet CMS is required');
    const cms=validatePetCmsDocument(JSON.parse(cmsRaw).document,{allowLegacy:true});
    for(const pet of PETS){const registered=cms.pets.find(row=>row.code===pet.code);assert(registered,'Pumpkin pet is not registered: '+pet.code);assert.equal(registered.sourceArt,pet.sourceArt,'Approved pet art must match');}
    const [item]=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,51,1) RETURNING *',[ITEM.code,ITEM.name,ITEM.subtitle,ITEM.description,ITEM.category,ITEM.rarity,ITEM.image]);
    const preservedHashes=Object.fromEntries(protectedKeys.map(key=>[key,digest(before.find(row=>row.key===key)?.value)]));
    const result={operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),itemCode:ITEM.code,name:ITEM.name,choices:PETS.map(pet=>pet.code),preservedHashes,granted:0,committed:commit};
    const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PET_PUMPKIN_CHOICE_REGISTER','INVENTORY_ITEM',$2,NULL,$3) RETURNING id",[actorId,ITEM.code,JSON.stringify({item,...result})]);result.auditId=String(audit.id);
    await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
    assert.deepEqual(await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedKeys]),before,'Pet settings, opening pool, potential settings and pass must stay unchanged');
    await q(commit?'COMMIT':'ROLLBACK');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

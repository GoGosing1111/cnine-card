import assert from 'node:assert/strict';
import {equipmentCraftPolicy,equipmentCraftInputName} from '../../shared/workshop-equipment-craft.mjs';

export const P90_REQUIREMENTS=Object.freeze({
  operationKey:'ops:eastern-p90:requirements:20261119:v1',code:'WORKSHOP_EASTERN_P90',
  outputId:53,coinCost:500000000000000,masterStarCost:1000000000,
  description:'금룡 대물저격 또는 금룡 대물소총 +15 중 1개 선택. 비밀무기 설계도 1장·2장·3장 각 1개, 코인 500조, 마스터의 별 10억 소모. 성공률 10%. 5회 실패 누적 후 6번째 확정 성공. 실패 시 무기 파괴, 리페어 가능. 공개 준비 중.',
  policy:Object.freeze({inputEquipmentId:40,inputEquipmentIds:Object.freeze([40,41]),requiredLevel:15,pityAfter:5,successRate:10,failureInputPolicy:'CONSUME',failureRepairable:true}),
  materials:Object.freeze([1,2,3].map(n=>Object.freeze({code:'SECRET_WEAPON_BLUEPRINT_CHAPTER_'+n,quantity:1,sort:n*10})))
});
const P=P90_REQUIREMENTS;
export async function configureP90Requirements(db,{expected,dryRun=true,injectAfter=''}={}){
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P.operationKey])).rows[0];
  if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  const inject=stage=>{if(injectAfter===stage)throw Error('INJECTED_'+stage)};
  try{
    await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='4s'");
    assert.equal((await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) locked',['ops:eastern-p90:recipe-preparation:20261119:v1'])).rows[0].locked,true);
    const again=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P.operationKey])).rows[0];
    if(again){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(again.value)}}
    const before=(await db.query('SELECT * FROM workshop_recipes_v1668 WHERE code=$1 FOR UPDATE',[P.code])).rows[0];
    assert.deepEqual(before,expected.recipe);assert.equal(before.output_ref,String(P.outputId));
    assert.deepEqual([before.is_active,before.is_public,before.owner_test_only],['0','0','1']);
    const key='WORKSHOP_EQUIPMENT_CRAFT_V1:'+P.code,old=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0].value;
    assert.equal(old,expected.policyRaw);
    const items=(await db.query('SELECT * FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[[40,41,53]])).rows;
    assert.deepEqual(items,expected.items);
    const materials=(await db.query('SELECT * FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[P.materials.map(m=>m.code)])).rows;
    assert.deepEqual(materials,expected.materials);assert.equal(materials.length,3);assert(materials.every(m=>Number(m.is_active)===1&&m.category==='MATERIAL'));
    const previousMaterials=(await db.query('SELECT * FROM workshop_recipe_materials_v1668 WHERE recipe_id=$1 ORDER BY item_code',[before.id])).rows;
    assert.deepEqual(previousMaterials,expected.recipeMaterials);
    const policy=equipmentCraftPolicy({...before,equipmentCraft:{...P.policy,revision:Number(JSON.parse(old).revision||0)+1}});
    const options=policy.inputEquipmentIds.map(id=>{const item=items.find(r=>Number(r.id)===id);assert(item);return {id,name:equipmentCraftInputName(item),image:item.image_url,rarity:item.rarity}});
    Object.assign(policy,{inputName:options[0].name,inputImage:options[0].image,inputRarity:options[0].rarity,inputOptions:options});
    const recipe=(await db.query('UPDATE workshop_recipes_v1668 SET description=$1,coin_cost=$2,master_star_cost=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *',[P.description,P.coinCost,P.masterStarCost,before.id])).rows[0];inject('recipe');
    assert.equal(previousMaterials.length,0);
    for(const m of P.materials)await db.query('INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) VALUES($1,$2,$3,$4)',[before.id,m.code,m.quantity,m.sort]);inject('materials');
    await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(policy),key]);inject('policy');
    const actor=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(actor);
    const receipt={operationKey:P.operationKey,status:'CONFIGURED_LOCKED',recipe,policy,materials:P.materials,pendingFields:[],accountWrites:0,messagesSent:0,completedAt:new Date().toISOString()};
    receipt.auditId=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_EASTERN_P90_REQUIREMENTS','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id::text",[actor.id,P.operationKey,JSON.stringify({recipe:before,policy:JSON.parse(old),materials:previousMaterials}),JSON.stringify(receipt)])).rows[0].id;inject('audit');
    await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[P.operationKey,JSON.stringify(receipt)]);inject('receipt');
    assert.deepEqual((await db.query('SELECT * FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id',[[40,41,53]])).rows,items);
    await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
  }catch(error){await db.query('ROLLBACK');throw error}
}

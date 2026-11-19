import assert from 'node:assert/strict';

export const P90_PREPARATION=Object.freeze({
  operationKey:'ops:eastern-p90:recipe-preparation:20261119:v1',
  code:'WORKSHOP_EASTERN_P90',outputId:'53',outputCode:'EASTERN_WEAPON_DRAFT_01',
  name:'P90 · 동방무기상 제작',
  description:'제작 조건 설정 대기. 투입 장비·강화 단계·재료 수량·코인·마스터의 별·천장을 설정한 후 공개합니다. 현재 제작 잠금.',
  // Existing Eastern equipment craft contract: 10%, consume on failure, repair archive.
  policy:Object.freeze({inputEquipmentId:null,requiredLevel:null,pityAfter:null,revision:0,
    successRate:10,failureInputPolicy:'CONSUME',failureRepairable:true}),
  pendingFields:Object.freeze(['inputEquipmentId','requiredLevel','materials','coinCost','masterStarCost','pityAfter'])
});
const P=P90_PREPARATION;
export async function prepareP90Recipe(db,{expected,dryRun=true,injectAfter=''}={}){
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P.operationKey])).rows[0];
  if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  const inject=stage=>{if(injectAfter===stage)throw Error('INJECTED_'+stage);};
  try{
    await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='4s'");
    assert.equal((await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) locked',[P.operationKey])).rows[0].locked,true);
    const again=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P.operationKey])).rows[0];
    if(again){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(again.value)};}
    const item=(await db.query('SELECT * FROM character_equipment_items WHERE id=$1 FOR SHARE',[P.outputId])).rows[0];
    assert.deepEqual(item,expected.items.find(r=>r.id===P.outputId),'P90 catalog changed');
    assert.equal(item.code,P.outputCode);assert.equal(item.slot,'WEAPON');
    const existing=(await db.query("SELECT * FROM workshop_recipes_v1668 WHERE output_type='EQUIPMENT' AND (output_ref=ANY($1::text[]) OR code=$2) ORDER BY id FOR SHARE",[['40','41','53','54','55'],P.code])).rows;
    assert.deepEqual(existing,expected.recipes,'Related recipes changed');
    assert(!existing.some(r=>r.output_ref===P.outputId||r.code===P.code));
    const policyKey='WORKSHOP_EQUIPMENT_CRAFT_V1:'+P.code;
    assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[policyKey])).rows.length,0);
    const actor=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(actor);
    // Zero cost columns are inert placeholders required by the existing schema.
    // OFF/private plus the incomplete policy prevent a free or usable recipe.
    const recipe=(await db.query(`INSERT INTO workshop_recipes_v1668
      (code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order)
      VALUES($1,'ITEM_SYNTHESIS',$2,$3,'EQUIPMENT',$4,1,'BOTH',0,0,10,0,0,0,1,100) RETURNING *`,[P.code,P.name,P.description,P.outputId])).rows[0];
    inject('recipe');
    await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[policyKey,JSON.stringify(P.policy)]);inject('policy');
    const receipt={operationKey:P.operationKey,status:'PREPARED_LOCKED',recipe,policy:P.policy,pendingFields:P.pendingFields,existingRecipeIds:existing.map(r=>r.id),accountWrites:0,messagesSent:0,completedAt:new Date().toISOString()};
    receipt.auditId=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_EASTERN_P90_PREPARE','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id::text",[actor.id,P.operationKey,JSON.stringify({recipe:null,policy:null}),JSON.stringify(receipt)])).rows[0].id;
    inject('audit');await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[P.operationKey,JSON.stringify(receipt)]);inject('receipt');
    assert.deepEqual((await db.query('SELECT * FROM character_equipment_items WHERE id=$1',[P.outputId])).rows[0],item);
    assert.deepEqual((await db.query('SELECT * FROM workshop_recipes_v1668 WHERE id=ANY($1::bigint[]) ORDER BY id',[existing.map(r=>r.id)])).rows,existing);
    await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
  }catch(error){await db.query('ROLLBACK');throw error;}
}

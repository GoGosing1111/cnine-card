import assert from 'node:assert/strict';
import {SUIT_CORE_BOX as product,SUIT_CORE_BOX_WEIGHTS as weights} from '../../shared/suit-core-box-v1.mjs';
import asset from '../../assets/ui/packs/suit-core-supply-box-20261008.json' with {type:'json'};

export const OPERATION_KEY='ops:suit-core-box:20261008:v1';
export const SETTINGS={shopEnabled:true,openEnabled:true,shopPrice:product.unitPrice,poolVersion:product.poolVersion,priceRatio:1};
const parse=value=>value?JSON.parse(value):null;

export async function readSuitCoreBoxState(client){
  const settings=(await client.query('SELECT value FROM app_meta WHERE key=$1',[product.settingsKey])).rows[0];
  const pool=(await client.query('SELECT reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,pool_version FROM prime_draw_extra_pool_v1987 WHERE product_kind=$1 ORDER BY reward_ref',[product.kind])).rows;
  const item=(await client.query('SELECT code,name,subtitle,description,category,rarity,image_url,sort_order,is_active FROM inventory_items WHERE code=$1',[product.itemCode])).rows[0]||null;
  return {settings:parse(settings?.value),pool,item};
}

export async function applySuitCoreBox(client,{proof,expectedState}){
  assert.equal(proof?.origin,'https://cnine-card.pages.dev');assert.match(proof?.commit||'',/^[a-f0-9]{40}$/);
  assert.equal(proof?.suitCoreRuntimeVerified,true);assert.equal(proof?.assetSha256,asset.sha256);
  const age=Date.now()-Date.parse(proof.checkedAt);assert.ok(age>=0&&age<600000,'Fresh deployed runtime and image verification required');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{
    await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(previous){const receipt=parse(previous.value);assert.equal(receipt.status,'COMPLETED');await client.query('COMMIT');return {replayed:true,receipt};}
    const before=await readSuitCoreBoxState(client);assert.deepEqual(before,expectedState,'Core box configuration changed since inspection');
    assert.equal(before.settings,null,'Do not overwrite an existing operator configuration');assert.equal(before.pool.length,0,'Do not replace an existing operator pool');
    const active=(await client.query('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) AND is_active=1 ORDER BY code',[weights.map(row=>row.code)])).rows;
    assert.deepEqual(active.map(row=>row.code),weights.map(row=>row.code),'All four core rewards must already be active');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
    const completedAt=new Date().toISOString();
    const item=await client.query('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,46,1,$8) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=excluded.updated_at RETURNING code',[product.itemCode,product.name,product.subtitle,product.description,product.category,product.rarity,product.image,completedAt]);
    assert.equal(item.rows[0]?.code,product.itemCode);
    for(const row of weights){
      const inserted=await client.query("INSERT INTO prime_draw_extra_pool_v1987(product_kind,reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,pool_version,updated_at) VALUES($1,'INVENTORY_ITEM',$2,$3,0,'STANDARD','NONE',$4,$5) RETURNING reward_ref",[product.kind,row.code,row.weight,product.poolVersion,completedAt]);
      assert.equal(inserted.rows[0]?.reward_ref,row.code);
    }
    const settings=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING value',[product.settingsKey,JSON.stringify(SETTINGS),completedAt]);assert.deepEqual(parse(settings.rows[0]?.value),SETTINGS);
    const after=await readSuitCoreBoxState(client);
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'슈트코어 전용 상자 제안 후 리소스·프라임 아머리 방식 간결한 연출·연속 개봉·대량 구매 구현 지시 및 프로젝트 기본 운영 반영 규칙',before,after,proof,completedAt};
    const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'SUIT_CORE_BOX_RELEASE','SETTINGS',$2,$3,$4,$5) RETURNING id",[owner.id,product.settingsKey,JSON.stringify(before),JSON.stringify(receipt),completedAt])).rows[0];assert.ok(audit);receipt.adminLogId=String(audit.id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),completedAt]);
    await client.query('COMMIT');return {replayed:false,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifySuitCoreBox(client){
  const receipt=parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0]?.value);assert.equal(receipt?.status,'COMPLETED');
  const current=await readSuitCoreBoxState(client);assert.deepEqual(current,receipt.after);assert.deepEqual(current.settings,SETTINGS);
  assert.deepEqual(current.pool.map(row=>[row.reward_ref,Number(row.draw_weight)]),weights.map(row=>[row.code,row.weight]));
  assert.ok(current.pool.every(row=>!Number(row.presentation_enabled)&&row.effect_key==='NONE'&&row.pool_version===product.poolVersion));
  const audit=(await client.query('SELECT after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId])).rows[0];assert.equal(parse(audit?.after_data)?.operationKey,OPERATION_KEY);
  return {verified:true,checkedAt:new Date().toISOString(),settings:current.settings,pool:current.pool,item:current.item,adminLogId:receipt.adminLogId};
}

import assert from 'node:assert/strict';

// Operator-only catalog registration. Never imported by runtime or migrations.
export const OPERATION_KEY = 'ops:arden-equipment-live:20261011:v1';
export const AUTHORIZATION = ['아르덴으로 하자', '반영이 아니라 라이브에 올려놔', '20만으로'];
export const ARDEN_ITEMS = Object.freeze([
  {code:'ARDEN_TOP',name:'아르덴 아머',slot:'TOP',subtype:'TOP',key:'armor',sha256:'860e8d703192a183147d45af0646160e92b74f0dfc8e7f3a34cbacbba36a71e8'},
  {code:'ARDEN_BOTTOM',name:'아르덴 그리브',slot:'BOTTOM',subtype:'BOTTOM',key:'pants',sha256:'bf98837de93edcb538ba87467a0e345e79c01a36952e2a1717510c9d83234205'},
  {code:'ARDEN_SHOES',name:'아르덴 부츠',slot:'SHOES',subtype:'SHOES',key:'boots',sha256:'522ff3648b7bca37fcb44347c09892455e6b1914736e783ec98865daeb7811eb'},
  {code:'ARDEN_DUAL_DISK',name:'아르덴 듀얼디스크',slot:'ACCESSORY',subtype:'DUAL_DISK',key:'dual-disk',sha256:'b8637a8ff3b999f576e9d8b77f1a944e8a25c40ceee6b9fac3e55a3d618b8c4d'}
].map(item => Object.freeze({...item,image:'/preview/mythic-emperor-successor-v1/assets/mythic-'+item.key+'-fantasy-v5.png'})));
export const ARDEN_SETTINGS = Object.freeze({
  rarity:'MYTHIC',total_power:200000,pve_power:180000,pvp_power:20000,
  is_active:1,is_public:1,supply_enabled:0,supply_weight:0
});
const codes = ARDEN_ITEMS.map(item=>item.code);

function assertAssets(assets) {
  assert.equal(assets?.length,4,'Exactly four published asset proofs required');
  assert.equal(new Set(assets.map(asset=>asset.url)).size,4,'Duplicate asset proof');
  for(const item of ARDEN_ITEMS) {
    const asset=assets.find(row=>row.url==='https://cnine-card.pages.dev'+item.image);
    assert.equal(asset?.status,200,'Approved image must be live: '+item.code);
    assert.equal(asset?.sha256,item.sha256,'Approved image hash mismatch: '+item.code);
  }
}

export async function inspectArdenEquipment(client) {
  const items=(await client.query('SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[]) OR image_url=ANY($3::text[]) ORDER BY id',
    [codes,ARDEN_ITEMS.map(item=>item.name),ARDEN_ITEMS.map(item=>item.image)])).rows;
  const marker=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  return {items,receipt:marker?JSON.parse(marker.value):null};
}

function assertRecorded(state) {
  assert.equal(state.receipt?.operationKey,OPERATION_KEY);
  assert.equal(state.receipt?.status,'COMPLETED');
  for(const expected of state.receipt.items) {
    assert.ok(state.items.some(item=>String(item.id)===String(expected.id)&&item.code===expected.code),
      'Recorded Arden equipment missing; manual review required');
  }
  assert.equal(state.receipt.items.length,4);
}

export async function registerArdenEquipment(client,assets) {
  assertAssets(assets);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const existing=await inspectArdenEquipment(client);
    if(existing.receipt) {
      assertRecorded(existing);
      await client.query('COMMIT');
      return {alreadyRegistered:true,...existing};
    }
    assert.equal(existing.items.length,0,'Matching Arden code/name/image exists without receipt; nothing overwritten');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(owner,'Active owner required for operation audit');
    const before=(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;
    const completedAt=new Date().toISOString();
    const items=[];
    for(const item of ARDEN_ITEMS) {
      const result=await client.query(
        "INSERT INTO character_equipment_items(code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight) VALUES($1,$2,$3,$4,'MYTHIC',$5,$6,200000,180000,20000,1,1,0,0,0) RETURNING *",
        [item.code,item.name,item.slot,item.subtype,item.image,'엠퍼러를 잇는 아르덴 장비. 백금과 금세공에 청록빛 보석을 더한 신화 장비.']);
      assert.equal(result.rows.length,1,'Catalog insert failed: '+item.code);
      const row=result.rows[0];
      for(const [key,value] of Object.entries(ARDEN_SETTINGS))assert.equal(key==='rarity'?row[key]:Number(row[key]),value,key);
      items.push(row);
    }
    const preserved=(await client.query('SELECT * FROM character_equipment_items WHERE NOT(code=ANY($1::text[])) ORDER BY id',[codes])).rows;
    assert.deepEqual(preserved,before,'Unrelated equipment changed');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,
      scope:'LIVE_PUBLIC_EQUIPMENT_CATALOG_AND_CMS_GRANT',setName:'아르덴',items,assets,
      totalPowerPerItem:200000,pvePowerPerItem:180000,pvpPowerPerItem:20000,
      powerSplit:'Existing equipmentPowerForSlot total-power 90% PVE / 10% PVP rule',
      raritySource:'Existing Emperor MYTHIC tier',cmsGrantEnabled:true,
      automaticGrants:false,recipesAdded:false,rewardPoolsModified:false,
      preservedEquipmentCount:before.length,completedAt,adminLogIds:[]};
    for(const item of items) {
      const audit=await client.query(
        "INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'EQUIPMENT_CREATE','EQUIPMENT',$2,NULL,$3,$4) RETURNING id",
        [owner.id,String(item.id),JSON.stringify({operationKey:OPERATION_KEY,authorization:AUTHORIZATION,item}),completedAt]);
      assert.equal(audit.rows.length,1,'Equipment audit missing');
      receipt.adminLogIds.push(String(audit.rows[0].id));
    }
    const marker=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',
      [OPERATION_KEY,JSON.stringify(receipt),completedAt]);
    assert.equal(marker.rows.length,1,'Operation receipt missing');
    await client.query('COMMIT');
    return {alreadyRegistered:false,items,receipt};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function verifyArdenEquipment(client) {
  const state=await inspectArdenEquipment(client);
  assertRecorded(state);
  const audits=(await client.query("SELECT id,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) AND action_type='EQUIPMENT_CREATE' AND target_type='EQUIPMENT'",[state.receipt.adminLogIds])).rows;
  assert.equal(audits.length,4,'Four audit records required');
  for(const item of state.receipt.items) {
    const audit=audits.find(row=>String(row.target_id)===String(item.id));
    assert.equal(JSON.parse(audit?.after_data||'{}').operationKey,OPERATION_KEY);
  }
  const catalog=(await client.query('SELECT * FROM character_equipment_items ORDER BY slot,sort_order,id')).rows;
  assert.equal(catalog.filter(item=>codes.includes(item.code)).length,4);
  return {verified:true,checkedAt:new Date().toISOString(),cmsVisible:true,
    publicAndActive:state.items.filter(item=>codes.includes(item.code)).every(item=>Number(item.is_active)===1&&Number(item.is_public)===1),
    ...state};
}

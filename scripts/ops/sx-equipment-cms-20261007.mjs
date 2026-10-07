import assert from 'node:assert/strict';

// Explicit, one-time CMS registration. Never imported by runtime startup.
export const OPERATION_KEY='ops:sx-equipment-cms:20261007:v1';
export const AUTHORIZATION='운영서버에 업로드 커밋해 / 왜 장비등록에 없냐';
export const SX_ITEM=Object.freeze({
  code:'BATTLE_SUIT_SX',name:'SX슈트',slot:'BATTLE_SUIT',subtype:'BATTLE_SUIT',
  image:'/preview/battle-suit-sx-v1/assets/sources/sx-standing-approved-20261007.png',
  sha256:'0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b',
  description:'푸른 사신 SX슈트. 코발트·은백색 갑주와 대검의 PVE 전용 배틀슈트. 능력치·획득 설정 및 실전 연결 준비 중.',
});
// CMS has no unset rarity/power values. Keep the item editable in the full
// equipment catalog without releasing an unconfigured suit to players.
export const SX_DEFAULTS=Object.freeze({rarity:'NORMAL',total_power:0,pve_power:0,pvp_power:0,is_active:0,is_public:0,supply_enabled:0,supply_weight:0});

function assertPublishedAsset(asset){
  assert.equal(asset?.url,'https://cnine-card.pages.dev'+SX_ITEM.image);
  assert.equal(asset?.status,200);
  assert.equal(asset?.sha256,SX_ITEM.sha256,'Approved standing image mismatch');
}

export async function inspectSxEquipment(client){
  const items=(await client.query('SELECT * FROM character_equipment_items WHERE code=$1 OR name=$2 OR image_url=$3 ORDER BY id',[SX_ITEM.code,SX_ITEM.name,SX_ITEM.image])).rows;
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  return {items,receipt:saved?JSON.parse(saved.value):null};
}

function assertRecorded(state){
  assert.equal(state.receipt?.operationKey,OPERATION_KEY);
  assert.equal(state.receipt?.status,'COMPLETED');
  const item=state.items.find(row=>row.code===SX_ITEM.code);
  assert.ok(item,'Recorded SX equipment is missing');
  assert.equal(String(item.id),String(state.receipt.item.id));
  return item;
}

export async function registerSxEquipment(client,asset){
  assertPublishedAsset(asset);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const state=await inspectSxEquipment(client);
    if(state.receipt){
      const item=assertRecorded(state);
      await client.query('COMMIT');
      return {alreadyRegistered:true,item,receipt:state.receipt};
    }
    assert.equal(state.items.length,0,'Matching SX equipment exists without a registration receipt; do not overwrite');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(owner,'Active owner required for authorized operation audit');
    const before=(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;
    const sortOrder=Math.max(80,...before.filter(row=>row.slot==='BATTLE_SUIT').map(row=>Number(row.sort_order)||0))+10;
    assert.ok(sortOrder<=100000,'CMS sort order bound exceeded');
    const item=(await client.query(`INSERT INTO character_equipment_items
      (code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight)
      VALUES($1,$2,$3,$4,'NORMAL',$5,$6,0,0,0,0,0,$7,0,0) RETURNING *`,
      [SX_ITEM.code,SX_ITEM.name,SX_ITEM.slot,SX_ITEM.subtype,SX_ITEM.image,SX_ITEM.description,sortOrder])).rows[0];
    assert.ok(item);
    for(const [key,value] of Object.entries(SX_DEFAULTS))assert.equal(key==='rarity'?item[key]:Number(item[key]),value);
    const preserved=(await client.query('SELECT * FROM character_equipment_items WHERE code<>$1 ORDER BY id',[SX_ITEM.code])).rows;
    assert.deepEqual(preserved,before,'Unrelated equipment changed');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',scope:'CMS_EQUIPMENT_REGISTRATION',authorization:AUTHORIZATION,
      item,asset,settingsPending:true,combatRuntimeConnected:false,automaticGrants:false,recipesAdded:false,
      preservedEquipmentCount:before.length,completedAt:new Date().toISOString()};
    const audit=(await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
      VALUES($1,'EQUIPMENT_CREATE','EQUIPMENT',$2,NULL,$3,$4) RETURNING id`,
      [owner.id,String(item.id),JSON.stringify(receipt),receipt.completedAt])).rows[0];
    assert.ok(audit,'Equipment audit missing');
    receipt.adminLogId=String(audit.id);
    assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).rows.length,1);
    await client.query('COMMIT');
    return {alreadyRegistered:false,item,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifySxEquipment(client){
  const state=await inspectSxEquipment(client),item=assertRecorded(state);
  const audit=(await client.query("SELECT id,after_data FROM admin_logs WHERE id=$1 AND action_type='EQUIPMENT_CREATE' AND target_type='EQUIPMENT' AND target_id=$2",[state.receipt.adminLogId,String(item.id)])).rows;
  assert.equal(audit.length,1);
  assert.equal(JSON.parse(audit[0].after_data).operationKey,OPERATION_KEY);
  // This is the same complete catalog query used by admin/equipment-system;
  // inactive drafts remain visible and editable in 장비 등록.
  const catalog=(await client.query('SELECT * FROM character_equipment_items ORDER BY slot,sort_order,id')).rows;
  assert.equal(catalog.filter(row=>String(row.id)===String(item.id)).length,1);
  return {verified:true,checkedAt:new Date().toISOString(),item,receipt:state.receipt,cmsVisible:true};
}

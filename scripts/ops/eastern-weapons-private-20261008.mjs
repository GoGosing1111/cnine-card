import assert from 'node:assert/strict';

export const OPERATION_KEY="ops:eastern-weapons-private:20261008:v1";
export const AUTHORIZATION="운영서버에 올려놔 비공개로 해놓고";
export const ITEMS=Object.freeze([
  {
    "number": 1,
    "name": "금은장 무기 01 · 베어",
    "sha256": "9f03736ca60c051dee3d6e2f710c4ee025cbb3e3ebe84e06286251f05d7901be",
    "code": "EASTERN_WEAPON_DRAFT_01",
    "slot": "WEAPON",
    "subtype": "RIFLE",
    "image": "/assets/items/eastern-weapons-gold-silver-v1/weapon-01-512.png",
    "description": "비공개 무기 리소스 1번. 고급 금장·은장 디자인. 임시 식별명이며 이름·등급·능력치·획득 조건 설정 대기."
  },
  {
    "number": 2,
    "name": "금은장 무기 02 · 코어",
    "sha256": "fb075bac4dcd178f626c4890595a4247f4584682e2bbf1b60a846495dda61894",
    "code": "EASTERN_WEAPON_DRAFT_02",
    "slot": "WEAPON",
    "subtype": "RIFLE",
    "image": "/assets/items/eastern-weapons-gold-silver-v1/weapon-02-512.png",
    "description": "비공개 무기 리소스 2번. 고급 금장·은장 디자인. 임시 식별명이며 이름·등급·능력치·획득 조건 설정 대기."
  },
  {
    "number": 3,
    "name": "금은장 무기 03 · 나비",
    "sha256": "1dcb4d7b7e2ce23924388393ea99c43406a539a1bba092aea9df946e2b54f8f2",
    "code": "EASTERN_WEAPON_DRAFT_03",
    "slot": "WEAPON",
    "subtype": "RIFLE",
    "image": "/assets/items/eastern-weapons-gold-silver-v1/weapon-03-512.png",
    "description": "비공개 무기 리소스 3번. 고급 금장·은장 디자인. 임시 식별명이며 이름·등급·능력치·획득 조건 설정 대기."
  },
  {
    "number": 4,
    "name": "원색 무기 04 · 진주",
    "sha256": "ec6954a6ece24f41951d68d9f7033ab3ff967984712e095bf64ce9a41c18d5b2",
    "code": "EASTERN_WEAPON_DRAFT_04",
    "slot": "WEAPON",
    "subtype": "RIFLE",
    "image": "/assets/items/eastern-weapons-gold-silver-v1/weapon-04-512.png",
    "description": "비공개 무기 리소스 4번. 백색·검정·금색과 진주 장식 원색 유지. 임시 식별명이며 이름·등급·능력치·획득 조건 설정 대기."
  }
].map(Object.freeze));
export const DEFAULTS=Object.freeze({"rarity":"NORMAL","total_power":0,"pve_power":0,"pvp_power":0,"is_active":0,"is_public":0,"supply_enabled":0,"supply_weight":0});
const CODES=ITEMS.map(item=>item.code);
const REWARD_KEYS=['black_miracle_pack_settings_v1485','prime_equipment_draw_settings_v1985','equipment_supply_box_settings_v1247'];

function assertAssets(assets){
  assert.equal(assets?.length,ITEMS.length,'All four published assets required');
  for(const item of ITEMS){
    const matches=assets.filter(asset=>asset.code===item.code);
    assert.equal(matches.length,1);
    assert.equal(matches[0].url,'https://cnine-card.pages.dev'+item.image);
    assert.equal(matches[0].status,200);
    assert.equal(matches[0].sha256,item.sha256,'Published image mismatch: '+item.code);
  }
}
function assertDraft(row,item){
  assert(row,'Missing '+item.code);
  for(const key of ['code','name','slot','subtype','description'])assert.equal(row[key],item[key]);
  assert.equal(row.image_url,item.image);
  for(const [key,value] of Object.entries(DEFAULTS))assert.equal(key==='rarity'?row[key]:Number(row[key]),value,item.code+'.'+key);
}
export async function inspectWeapons(client){
  const items=(await client.query('SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[]) OR image_url=ANY($3::text[]) ORDER BY id',
    [CODES,ITEMS.map(item=>item.name),ITEMS.map(item=>item.image)])).rows;
  const marker=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  return {items,receipt:marker?JSON.parse(marker.value):null};
}
export async function verifyWeapons(client){
  const state=await inspectWeapons(client);
  assert.equal(state.receipt?.status,'COMPLETED','Registration receipt missing');
  assert.equal(state.receipt.items.length,4);
  assert.equal(state.items.length,4);
  for(const item of ITEMS){
    const row=state.items.find(row=>row.code===item.code);
    assertDraft(row,item);
    const entry=state.receipt.items.find(entry=>entry.code===item.code);
    assert.equal(String(entry.id),String(row.id));
    const audit=(await client.query("SELECT id FROM admin_logs WHERE id=$1 AND action_type='EQUIPMENT_CREATE' AND target_type='EQUIPMENT' AND target_id=$2",[entry.adminLogId,String(row.id)])).rows;
    assert.equal(audit.length,1,'Missing equipment creation audit');
  }
  const ids=state.items.map(row=>row.id);
  const visible=(await client.query('SELECT count(*) count FROM character_equipment_items WHERE id=ANY($1::bigint[]) AND is_active=1 AND is_public=1',[ids])).rows[0];
  const owned=(await client.query('SELECT count(*) count FROM user_equipment_instances WHERE equipment_id=ANY($1::bigint[])',[ids])).rows[0];
  const drops=(await client.query('SELECT count(*) count FROM equipment_drop_entries WHERE equipment_id=ANY($1::bigint[])',[ids])).rows[0];
  for(const row of [visible,owned,drops])assert.equal(Number(row.count),0);
  const adminItems=(await client.query('SELECT id FROM character_equipment_items ORDER BY slot,sort_order,id')).rows;
  assert.equal(adminItems.filter(row=>ids.map(String).includes(String(row.id))).length,4,'CMS complete catalog missing drafts');
  return {ok:true,checkedAt:new Date().toISOString(),items:state.items,receipt:state.receipt,cmsVisibleCount:4,publicCount:0,ownedCount:0,dropEntryCount:0};
}
export async function registerWeapons(client,assets){
  assertAssets(assets);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const state=await inspectWeapons(client);
    if(state.receipt){
      assert.equal(state.receipt.status,'COMPLETED');
      assert.equal(state.items.filter(row=>CODES.includes(row.code)).length,4);
      await client.query('COMMIT');
      return {ok:true,replayed:true,...state};
    }
    assert.equal(state.items.length,0,'Matching equipment exists without receipt; do not overwrite');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert(owner,'Active owner required for authorized operation audit');
    const before=(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;
    const settingsBefore=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[REWARD_KEYS])).rows;
    const firstSort=Math.max(1000,...before.map(row=>Number(row.sort_order)||0))+1;
    assert(firstSort+3<=100000);
    const entries=[];
    for(const [index,item] of ITEMS.entries()){
      const row=(await client.query(`INSERT INTO character_equipment_items
        (code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight)
        VALUES($1,$2,$3,$4,'NORMAL',$5,$6,0,0,0,0,0,$7,0,0) RETURNING *`,
        [item.code,item.name,item.slot,item.subtype,item.image,item.description,firstSort+index])).rows[0];
      assertDraft(row,item);
      for(const setting of settingsBefore){
        const value=JSON.parse(setting.value),overrides=value.powerRewards?.equipment?.overrides||{};
        assert.notEqual(overrides[row.id]?.enabled,true,'Unexpected preselected reward id');
        assert.notEqual(overrides[row.code]?.enabled,true,'Unexpected preselected reward code');
      }
      const detail={...row,operationKey:OPERATION_KEY,authorization:AUTHORIZATION,executionSource:'AUTHORIZED_ONE_TIME_OPS',policyStatus:'DRAFT_UNCONFIGURED',temporaryName:true,rarityPlaceholder:true,powerPlaceholder:true};
      const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EQUIPMENT_CREATE','EQUIPMENT',$2,NULL,$3) RETURNING id",[owner.id,String(row.id),JSON.stringify(detail)])).rows[0];
      assert(audit,'Audit insert failed');
      entries.push({...row,adminLogId:String(audit.id)});
    }
    const existingAfter=(await client.query('SELECT * FROM character_equipment_items WHERE NOT(code=ANY($1::text[])) ORDER BY id',[CODES])).rows;
    assert.deepEqual(existingAfter,before,'Existing equipment changed');
    const settingsAfter=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[REWARD_KEYS])).rows;
    assert.deepEqual(settingsAfter,settingsBefore,'Reward settings changed');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,scope:'PRIVATE_CMS_WEAPON_DRAFTS',items:entries,assets,
      settingsPending:true,rarityPlaceholder:'NORMAL',powerPlaceholder:0,recipesAdded:false,automaticGrants:false,rewardSettingsUnchanged:true,preservedEquipmentCount:before.length,completedAt:new Date().toISOString()};
    assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).rows.length,1);
    const result=await verifyWeapons(client);
    await client.query('COMMIT');
    return {...result,replayed:false};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

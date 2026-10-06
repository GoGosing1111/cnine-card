import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:aura-vehicle-cms:20261007:v1';
export const AUTHORIZATION='전투기까지 해서 이름 짓고 다 커밋해서 CMS에 등록해놔';
// CMS requires a rarity and numeric power. These are inactive draft placeholders,
// not an approved gameplay rank or balance policy.
export const DRAFT_DEFAULTS=Object.freeze({
  rarity:'NORMAL',total_power:0,pve_power:0,pvp_power:0,
  is_active:0,is_public:0,draw_enabled:0,draw_weight:0,duplicate_shards:0,
});
export const VEHICLES=Object.freeze([
  Object.freeze({
    code:'AETHER_ZERO',name:'에테르 - 제로',kind:'전투기',
    image:'assets/tire/stealth-aero-fighter-scene-v1.png',
    sha256:'bcf89cd8774a266e869b7f6c22df2c1ca94b2b2db6a4fbba446cc295dae344f8',
    description:'라임빛 광류를 두르고 구름 위를 가르는 차세대 스텔스 전투기.',
  }),
  Object.freeze({
    code:'OBSIDIAN_RAVEN',name:'옵시디언 - 레이븐',kind:'흑철 장갑 차량',
    image:'assets/tire/black-armored-hypercar-aura-v2.png',
    sha256:'f824ebe728e9f34ffd2461b73234f5ccff31e22e97964d83db7b05c2fb31520f',
    description:'흑철 장갑과 날카로운 실루엣에 차가운 은백색 아우라를 두른 하이퍼카.',
  }),
  Object.freeze({
    code:'ASTRA_VOLT',name:'아스트라 - 볼트',kind:'은색·청색 코어 차량',
    image:'assets/tire/silver-cyan-hypercar-aura-v2.png',
    sha256:'698185bb958959552f4c012ecdd6e00cb2f1a0bbb2df791412723ee8c9ea6733',
    description:'은빛 차체와 푸른 코어를 연결하는 전류의 아우라로 질주하는 하이퍼카.',
  }),
  Object.freeze({
    code:'HELIOS_R',name:'헬리오스 - R',kind:'주황색 에어로 차량',
    image:'assets/tire/orange-aero-hypercar-aura-v1.png',
    sha256:'7638b9e3039dc94d801e498a7bfeedbc94fed2b3c65c229442b8d1ee7310d61f',
    description:'주황빛 에어로 바디와 검은 카본 구조를 황금빛 기류가 감싸는 하이퍼카.',
  }),
]);
const REWARD_KEYS=['black_miracle_pack_settings_v1485','prime_vehicle_draw_settings_v1985','vehicle_draw_settings_v1388'];
const CODES=VEHICLES.map(item=>item.code);

function assertDraft(row,item){
  assert(row,`Missing ${item.code}`);
  assert.equal(row.code,item.code);
  assert.equal(row.name,item.name);
  assert.equal(row.image_url,item.image);
  assert.equal(row.description,item.description);
  assert.equal(row.rarity,DRAFT_DEFAULTS.rarity);
  for(const [key,value] of Object.entries(DRAFT_DEFAULTS)){
    if(key!=='rarity')assert.equal(Number(row[key]),value,`${item.code}.${key}`);
  }
}

function assertPublishedAssets(assets){
  assert.equal(assets?.length,VEHICLES.length,'All four published assets required');
  for(const item of VEHICLES){
    const matches=assets.filter(asset=>asset.code===item.code);
    assert.equal(matches.length,1,`Asset missing/duplicated: ${item.code}`);
    assert.equal(matches[0].url,`https://cnine-card.pages.dev/${item.image}`);
    assert.equal(matches[0].status,200);
    assert.equal(matches[0].sha256,item.sha256,`Published image mismatch: ${item.code}`);
  }
}

async function getReceipt(client){
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  return row?JSON.parse(row.value):null;
}

async function preflight(client){
  const receipt=await getReceipt(client);
  if(receipt){
    assert.equal(receipt.status,'COMPLETED');
    assert.equal(receipt.items?.length,VEHICLES.length);
    return {alreadyApplied:true,receipt};
  }
  const duplicates=(await client.query(
    'SELECT id,code,name,image_url FROM character_garage_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[]) OR image_url=ANY($3::text[])',
    [CODES,VEHICLES.map(item=>item.name),VEHICLES.map(item=>item.image)],
  )).rows;
  assert.equal(duplicates.length,0,'Unreceipted matching vehicle exists; do not overwrite');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert(owner,'Active owner for authorized operation audit missing');
  const {max_sort:maxSort}=(await client.query('SELECT COALESCE(MAX(sort_order),0) AS max_sort FROM character_garage_items')).rows[0];
  const firstSortOrder=Math.max(1000,Number(maxSort))+1;
  assert(firstSortOrder+VEHICLES.length-1<=100000,'CMS sort order bound exceeded');
  return {alreadyApplied:false,ownerId:owner.id,firstSortOrder};
}

export async function planAuraVehicles(client,assets){
  assertPublishedAssets(assets);
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='10s'");
    const state=await preflight(client);
    const plan={operationKey:OPERATION_KEY,authorization:AUTHORIZATION,...state,
      drafts:state.alreadyApplied?[]:VEHICLES.map((item,index)=>({...item,...DRAFT_DEFAULTS,sort_order:state.firstSortOrder+index})),
    };
    await client.query('ROLLBACK');
    return plan;
  } catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifyAuraVehicles(client){
  const receipt=await getReceipt(client);
  assert.equal(receipt?.status,'COMPLETED','Registration receipt missing');
  assert.equal(receipt.items?.length,VEHICLES.length);
  const rows=(await client.query('SELECT * FROM character_garage_items WHERE code=ANY($1::text[]) ORDER BY sort_order,id',[CODES])).rows;
  assert.equal(rows.length,VEHICLES.length);
  for(const item of VEHICLES){
    const row=rows.find(candidate=>candidate.code===item.code);
    assertDraft(row,item);
    const saved=receipt.items.find(candidate=>candidate.code===item.code);
    assert.equal(String(saved.id),String(row.id));
    const logs=(await client.query('SELECT id FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_type=$3 AND target_id=$4',
      [saved.adminLogId,'GARAGE_CREATE','GARAGE',String(row.id)])).rows;
    assert.equal(logs.length,1,`Audit missing: ${item.code}`);
  }
  const ids=rows.map(row=>row.id);
  const owned=(await client.query('SELECT COUNT(*) AS count FROM user_garage_vehicles WHERE garage_id=ANY($1::bigint[])',[ids])).rows[0];
  const equipped=(await client.query('SELECT COUNT(*) AS count FROM user_garage_loadout WHERE garage_id=ANY($1::bigint[])',[ids])).rows[0];
  assert.equal(Number(owned.count),0,'Draft vehicle unexpectedly owned');
  assert.equal(Number(equipped.count),0,'Draft vehicle unexpectedly equipped');
  return {ok:true,operationKey:OPERATION_KEY,items:rows,receipt,ownedCount:0,equippedCount:0};
}

export async function registerAuraVehicles(client,assets){
  assertPublishedAssets(assets);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const state=await preflight(client);
    // Never overwrite subsequent CMS edits when this one-time operation is replayed.
    if(state.alreadyApplied){await client.query('COMMIT');return {ok:true,replayed:true,receipt:state.receipt};}
    const settingsBefore=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[REWARD_KEYS])).rows;
    const existingBefore=(await client.query('SELECT * FROM character_garage_items ORDER BY id')).rows;
    const entries=[];
    for(const [index,item] of VEHICLES.entries()){
      const result=(await client.query(`INSERT INTO character_garage_items
        (code,name,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,draw_enabled,draw_weight,duplicate_shards)
        VALUES($1,$2,$3,$4,$5,0,0,0,0,0,$6,0,0,0) RETURNING *`,
        [item.code,item.name,DRAFT_DEFAULTS.rarity,item.image,item.description,state.firstSortOrder+index])).rows[0];
      assertDraft(result,item);
      for(const settingsRow of settingsBefore){
        const settings=JSON.parse(settingsRow.value);
        assert.notEqual(settings.powerRewards?.vehicle?.overrides?.[result.id]?.enabled,true,'Unexpected preselected vehicle reward');
      }
      const after={...result,operationKey:OPERATION_KEY,authorization:AUTHORIZATION,executionSource:'AUTHORIZED_ONE_TIME_OPS',
        policyStatus:'DRAFT_UNCONFIGURED',rarityPlaceholder:true,powerPlaceholder:true,asset:assets.find(asset=>asset.code===item.code)};
      const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [state.ownerId,'GARAGE_CREATE','GARAGE',String(result.id),null,JSON.stringify(after)])).rows[0];
      assert(audit,'Audit insert failed');
      entries.push({...result,adminLogId:audit.id});
    }
    const settingsAfter=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[REWARD_KEYS])).rows;
    assert.deepEqual(settingsAfter,settingsBefore,'Reward settings changed');
    const existingAfter=(await client.query('SELECT * FROM character_garage_items WHERE NOT(code=ANY($1::text[])) ORDER BY id',[CODES])).rows;
    assert.deepEqual(existingAfter,existingBefore,'An existing vehicle changed');
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,items:entries,assets,
      policyStatus:'DRAFT_UNCONFIGURED',rarityPlaceholder:'NORMAL',powerPlaceholder:0,rewardSettingsUnchanged:true,
      existingVehiclesUnchanged:true,completedAt:new Date().toISOString()};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    const verified=await verifyAuraVehicles(client);
    await client.query('COMMIT');
    return {...verified,replayed:false};
  } catch(error){await client.query('ROLLBACK');throw error;}
}

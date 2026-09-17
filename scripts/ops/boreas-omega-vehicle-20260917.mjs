import assert from 'node:assert/strict';

export const BOREAS = Object.freeze({
  code:'BOREAS_OMEGA', name:'보레아스 - Ω', rarity:'MYTHIC',
  image:'assets/tire/boreas-omega-v1.png',
  sha256:'d103b3b78c02841c587d59ae3f52978ae016740f3865118817a3037e0c034f78',
  description:'북풍을 압축한 트윈 코어. 푸른 폭풍의 궤적으로 한계를 돌파한다.',
  totalPower:350000, pvePower:315000, pvpPower:35000,
});
export const OPERATION_KEY='ops:boreas-omega-vehicle:20260917';
const REWARD_KEYS=['black_miracle_pack_settings_v1485','prime_vehicle_draw_settings_v1985','vehicle_draw_settings_v1388'];
const assertRow=row=>{
  assert(row,'Boreas registration missing');
  assert.equal(row.code,BOREAS.code);assert.equal(row.name,BOREAS.name);
  assert.equal(row.rarity,BOREAS.rarity);assert.equal(row.image_url,BOREAS.image);
  for(const [key,value] of Object.entries({total_power:350000,pve_power:315000,pvp_power:35000,is_active:1,is_public:1,draw_enabled:0,draw_weight:0,duplicate_shards:0}))assert.equal(Number(row[key]),value,key);
};
export async function verifyBoreas(client){
  const rows=(await client.query('SELECT * FROM character_garage_items WHERE code=$1',[BOREAS.code])).rows;
  assert.equal(rows.length,1);assertRow(rows[0]);
  const receiptRow=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  assert(receiptRow,'Receipt missing');const receipt=JSON.parse(receiptRow.value);assert.equal(receipt.status,'COMPLETED');assert.equal(String(receipt.result.id),String(rows[0].id));
  const audit=(await client.query('SELECT id FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_id=$3',[receipt.adminLogId,'GARAGE_CREATE',String(rows[0].id)])).rows;
  assert.equal(audit.length,1);
  return {ok:true,item:rows[0],adminLogId:receipt.adminLogId,receiptKey:OPERATION_KEY};
}
export async function registerBoreas(client,asset){
  assert.equal(asset?.sha256,BOREAS.sha256,'Published asset hash mismatch');
  assert.equal(asset?.url,'https://cnine-card.pages.dev/'+BOREAS.image,'Wrong asset URL');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[OPERATION_KEY]);
    const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
    if(prior){const result=await verifyBoreas(client);await client.query('COMMIT');return {...result,replayed:true};}
    const reference=(await client.query("SELECT * FROM character_garage_items WHERE code='SOLARIS_OMEGA' FOR SHARE")).rows;
    assert.equal(reference.length,1,'Solaris reference missing');
    const solaris=reference[0];assert.equal(solaris.name,'솔라리스 - Ω');assert.equal(solaris.rarity,'MYTHIC');
    assert.equal(Number(solaris.total_power),350000);assert.equal(Number(solaris.pve_power),315000);assert.equal(Number(solaris.pvp_power),35000);
    const duplicates=(await client.query('SELECT id FROM character_garage_items WHERE code=$1 OR name=$2',[BOREAS.code,BOREAS.name])).rows;assert.equal(duplicates.length,0,'Unreceipted duplicate; review required');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Active owner missing');
    const rewardBefore=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[REWARD_KEYS])).rows;
    const result=(await client.query(`INSERT INTO character_garage_items
      (code,name,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,draw_enabled,draw_weight,duplicate_shards)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,1,$9,0,0,0) RETURNING *`,
      [BOREAS.code,BOREAS.name,BOREAS.rarity,BOREAS.image,BOREAS.description,BOREAS.totalPower,BOREAS.pvePower,BOREAS.pvpPower,Number(solaris.sort_order)+1])).rows[0];
    assertRow(result);
    const black=rewardBefore.find(row=>row.key===REWARD_KEYS[0]);
    if(black){const settings=JSON.parse(black.value);assert.notEqual(settings.powerRewards?.vehicle?.overrides?.[result.id]?.enabled,true,'Unexpected preselected Black Miracle reward');}
    const rewardAfter=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[REWARD_KEYS])).rows;
    assert.deepEqual(rewardAfter,rewardBefore,'Reward settings changed');
    const before={reference:solaris,rewardSettingsUnchanged:true};
    const after={...result,asset,authorization:'이름 지어서 등록 빠르게 해라 — 솔라리스와 동급',operationKey:OPERATION_KEY};
    const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [owner.id,'GARAGE_CREATE','GARAGE',String(result.id),JSON.stringify(before),JSON.stringify(after)])).rows[0];assert(audit,'Audit missing');
    const receipt={status:'COMPLETED',result,asset,adminLogId:audit.id,reference:solaris.code,rewardSettingsUnchanged:true,completedAt:new Date().toISOString()};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    const verified=await verifyBoreas(client);await client.query('COMMIT');return {...verified,replayed:false};
  }catch(error){await client.query('ROLLBACK');throw error;}
}


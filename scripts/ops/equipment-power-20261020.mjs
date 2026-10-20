import assert from 'node:assert/strict';

// One-time operator action; never imported by the game or a runtime migration.
export const OPERATION_KEY='ops:equipment-power:20261020:30-percent:v1';
export const AUTHORIZATION='미스틱부터 ~ 아르덴 , 동방무기상 전체 5종 전투력 30% 올려';
export const TARGETS=Object.freeze([
  ['EQ_1787156640727','미스틱 레깅스','BOTTOM',50000],
  ['EQ_1787156667357','미스틱 슈즈','SHOES',50000],
  ['EQ_1787156691265','미스틱 슈트','TOP',50000],
  ['EQ_1787156718021','미스틱 듀얼디스크','ACCESSORY',50000],
  ['EMPEROR_TOP','엠퍼러 슈트','TOP',100000],
  ['EMPEROR_BOTTOM','엠퍼러 레깅스','BOTTOM',100000],
  ['EMPEROR_SHOES','엠퍼러 슈즈','SHOES',100000],
  ['EMPEROR_DUAL_DISK','엠퍼러 듀얼디스크','ACCESSORY',100000],
  ['ARDEN_TOP','아르덴 아머','TOP',300000],
  ['ARDEN_BOTTOM','아르덴 그리브','BOTTOM',300000],
  ['ARDEN_SHOES','아르덴 부츠','SHOES',300000],
  ['ARDEN_DUAL_DISK','아르덴 듀얼디스크','ACCESSORY',300000],
  ['EQ_1788486888336','東方軍火商(동방무기상)','WEAPON',180000],
  ['EQ_1788486929132','東方軍火商(동방무기상)','WEAPON',180000],
  ['EASTERN_WEAPON_DRAFT_01','P90 · 東方軍火商(동방무기상)','WEAPON',350000],
  ['EASTERN_WEAPON_DRAFT_02','SCAR-東方軍火商(동방무기상)','WEAPON',350000],
  ['EASTERN_WEAPON_DRAFT_03','M14-EBR-東方軍火商(동방무기상)','WEAPON',350000]
].map(([code,name,slot,beforeTotal])=>Object.freeze({code,name,slot,beforeTotal,afterTotal:beforeTotal*13/10})));
const codes=TARGETS.map(row=>row.code);
const stableFields=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['total_power','pve_power','pvp_power','updated_at'].includes(key)));
const power=row=>[Number(row.total_power),Number(row.pve_power),Number(row.pvp_power)];
const expectedPower=total=>[total,Math.floor(total*.9),total-Math.floor(total*.9)];
const catalog=async client=>(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;

function assertReceipt(receipt){
  assert.equal(receipt.operationKey,OPERATION_KEY);
  assert.equal(receipt.status,'COMPLETED');
  assert.deepEqual(receipt.changes.map(row=>row.after.code).sort(),[...codes].sort());
  assert.equal(receipt.adminLogIds.length,TARGETS.length);
}

export async function applyEquipmentPowerIncrease(client,{dryRun=false}={}){
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(previous){
      const receipt=JSON.parse(previous.value);assertReceipt(receipt);
      await client.query('ROLLBACK');
      return {alreadyApplied:true,receipt};
    }
    const owner=(await client.query("SELECT id FROM users WHERE id=1 AND nickname='핑크빛유두' AND role='OWNER' AND status='ACTIVE'")).rows[0];
    assert.ok(owner,'Expected active OWNER required');
    const before=await catalog(client);
    const selected=before.filter(row=>codes.includes(row.code));
    assert.equal(selected.length,17,'Exactly 12 armor pieces and five Eastern weapons required');
    for(const target of TARGETS){
      const row=selected.find(row=>row.code===target.code);
      assert.equal(row?.name,target.name,'Equipment identity changed: '+target.code);
      assert.equal(row?.slot,target.slot,'Equipment slot changed: '+target.code);
      assert.deepEqual(power(row),expectedPower(target.beforeTotal),'Live power changed; inspect again: '+target.code);
      assert.equal(Number(row.is_active),1);assert.equal(Number(row.is_public),1);
    }
    const completedAt=new Date().toISOString(),changes=[],adminLogIds=[];
    for(const target of TARGETS){
      const old=selected.find(row=>row.code===target.code);
      const [total,pve,pvp]=expectedPower(target.afterTotal);
      const updated=(await client.query(
        'UPDATE character_equipment_items SET total_power=$1,pve_power=$2,pvp_power=$3,updated_at=$4 WHERE id=$5 AND code=$6 AND total_power=$7 AND pve_power=$8 AND pvp_power=$9 RETURNING *',
        [total,pve,pvp,completedAt,old.id,target.code,...power(old)]
      )).rows;
      assert.equal(updated.length,1,'Concurrent equipment edit: '+target.code);
      const after=updated[0];
      assert.deepEqual(power(after),[total,pve,pvp]);
      assert.deepEqual(stableFields(after),stableFields(old),'Non-power equipment field changed');
      changes.push({before:old,after});
      const audit=(await client.query(
        "INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'EQUIPMENT_UPDATE','EQUIPMENT',$2,$3,$4,$5) RETURNING id",
        [owner.id,String(old.id),JSON.stringify(old),JSON.stringify({operationKey:OPERATION_KEY,authorization:AUTHORIZATION,item:after}),completedAt]
      )).rows;
      assert.equal(audit.length,1,'Equipment audit missing');
      adminLogIds.push(String(audit[0].id));
    }
    const after=await catalog(client);
    assert.deepEqual(after.filter(row=>!codes.includes(row.code)),before.filter(row=>!codes.includes(row.code)),'Unrelated catalog changed');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,
      increasePercent:30,powerSplit:'PVE 90% / PVP 10%',changes,adminLogIds,completedAt,
      inventoryModified:false,enhancementPolicyModified:false,acquisitionSettingsModified:false,
      preservedCatalogCount:before.length-selected.length};
    assertReceipt(receipt);
    const saved=(await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),completedAt])).rows;
    assert.equal(saved.length,1,'Operation receipt missing');
    await client.query(dryRun?'ROLLBACK':'COMMIT');
    return {alreadyApplied:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifyEquipmentPowerIncrease(client){
  const marker=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  assert.ok(marker,'Power operation receipt missing');
  const receipt=JSON.parse(marker.value);assertReceipt(receipt);
  const rows=(await client.query('SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id',[codes])).rows;
  assert.equal(rows.length,TARGETS.length);
  for(const change of receipt.changes)assert.deepEqual(rows.find(row=>row.code===change.after.code),change.after,'Live catalog no longer matches receipt');
  const audits=(await client.query('SELECT id,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.adminLogIds])).rows;
  assert.equal(audits.length,TARGETS.length);
  for(const change of receipt.changes){
    const audit=audits.find(row=>String(row.target_id)===String(change.after.id));
    assert.deepEqual(JSON.parse(audit?.after_data||'{}').item,change.after,'Equipment audit mismatch');
  }
  return {verified:true,checkedAt:new Date().toISOString(),items:rows.map(row=>({id:row.id,code:row.code,name:row.name,totalPower:Number(row.total_power),pvePower:Number(row.pve_power),pvpPower:Number(row.pvp_power)})),adminLogIds:receipt.adminLogIds};
}

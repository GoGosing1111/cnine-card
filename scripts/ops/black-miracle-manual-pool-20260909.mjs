import {blackMiraclePowerRate,cleanBlackMiracleSettings} from '../../functions/_black_miracle_pack.js';

export const OPERATION_KEY='ops_black_miracle_manual_pool_20260909_v1';
export const SETTINGS_KEY='black_miracle_pack_settings_v1485';
export const TARGET={userId:359,nickname:'갓삼족삼',instanceId:78379196,fromCode:'EMPEROR_BOTTOM',fromName:'엠퍼러 레깅스',toCode:'EQ_1787156640727',toName:'미스틱 레깅스',requestId:'d8054bae-c673-4c7f-8ada-3c976ec8873e'};
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const id=value=>String(value);

// One-time snapshot of the old AUTO/HYBRID behavior. This is an operator action,
// never a runtime migration: later catalog inserts must not run this again.
export function freezeExistingPools(raw,{equipment,vehicle}){
  assert(raw?.powerRewards?.equipment&&raw?.powerRewards?.vehicle,'Existing pool settings are required');
  const next=structuredClone(raw),clean=cleanBlackMiracleSettings(raw),snapshot={};
  for(const [kind,rows] of Object.entries({equipment,vehicle})){
    const group={...clean.powerRewards[kind],mode:String(raw.powerRewards[kind].mode||'AUTO').toUpperCase()};
    const candidates=rows.filter(row=>Number(row.is_active)===1&&Number(row.is_public)===1&&row.rarity.toUpperCase()==='MYTHIC')
      .sort((a,b)=>Number(b.total_power)-Number(a.total_power)||Number(a.id)-Number(b.id));
    const floor=group.powerFloor>0?group.powerFloor:Math.min(...candidates.map(row=>Number(row.total_power)));
    const ceiling=group.powerCeiling>0?Math.max(floor,group.powerCeiling):Math.max(floor,...candidates.map(row=>Number(row.total_power)));
    let selected=candidates.filter(row=>{
      const override=group.overrides[id(row.id)]||group.overrides[row.code];
      return override?.enabled!==false&&(group.mode!=='MANUAL'||Boolean(override));
    });
    if(group.maxItems>0)selected=selected.slice(0,group.maxItems);
    const overrides=structuredClone(group.overrides);
    for(const row of selected){
      const override=group.overrides[id(row.id)]||group.overrides[row.code];
      overrides[id(row.id)]={enabled:true,rate:override?.rate??blackMiraclePowerRate(row.total_power,floor,ceiling,group.minRatePercent,group.maxRatePercent,group.curve)};
    }
    next.powerRewards[kind]={...next.powerRewards[kind],mode:'MANUAL',overrides};
    snapshot[kind]=selected.map(row=>({id:id(row.id),code:row.code,rate:overrides[id(row.id)].rate}));
  }
  return{settings:next,snapshot};
}

async function currentState(client){
  const [marker,setting,instance,counts,loadout]=await Promise.all([
    client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]),
    client.query('SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY]),
    client.query('SELECT x.*,i.code,i.name FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=$1 AND x.user_id=$2',[TARGET.instanceId,TARGET.userId]),
    client.query('SELECT i.code,COUNT(*) quantity FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.user_id=$1 AND i.code=ANY($2::text[]) GROUP BY i.code ORDER BY i.code',[TARGET.userId,[TARGET.fromCode,TARGET.toCode]]),
    client.query('SELECT * FROM user_equipment_loadout WHERE user_id=$1 AND instance_id=$2',[TARGET.userId,TARGET.instanceId])
  ]);
  return{receipt:marker.rows[0]?parse(marker.rows[0].value):null,settings:setting.rows[0]?parse(setting.rows[0].value):null,instance:instance.rows[0]||null,counts:counts.rows,loadout:loadout.rows};
}
export async function verifyBlackMiracleRepair(client){
  const state=await currentState(client);
  const pool=state.receipt?.pool?.snapshot;
  const approved=Boolean(pool&&['equipment','vehicle'].every(kind=>state.settings?.powerRewards?.[kind]?.mode==='MANUAL'&&pool[kind].every(row=>{
    const override=state.settings.powerRewards[kind].overrides[row.id];
    return override?.enabled===true&&Number(override.rate)===row.rate;
  })));
  const exchanged=state.instance?.code===TARGET.toCode&&state.instance?.source_id===OPERATION_KEY;
  return{...state,ownershipVerified:exchanged,poolVerified:approved};
}

export async function repairBlackMiracleAndLeggings(client){
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    const existing=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
    if(existing){
      const verified=await verifyBlackMiracleRepair(client);
      assert(verified.receipt?.status==='COMPLETED'&&verified.ownershipVerified,'Completed repair requires manual review');
      await client.query('COMMIT');return{...verified,replayed:true};
    }
    const users=(await client.query('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id FOR UPDATE',[TARGET.nickname])).rows;
    assert(users.length===1&&Number(users[0].id)===TARGET.userId&&users[0].status==='ACTIVE','Exact active target account was not found');
    const owner=(await client.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1 FOR UPDATE")).rows[0];
    assert(owner,'Active OWNER is required for the audit log');
    const catalog=(await client.query('SELECT id,code,name,slot,subtype,is_active,is_public FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id FOR UPDATE',[[TARGET.fromCode,TARGET.toCode]])).rows;
    const from=catalog.find(row=>row.code===TARGET.fromCode),to=catalog.find(row=>row.code===TARGET.toCode);
    assert(catalog.length===2&&from?.name===TARGET.fromName&&to?.name===TARGET.toName&&from.slot==='BOTTOM'&&to.slot==='BOTTOM'&&Number(to.is_active)===1&&Number(to.is_public)===1,'Exact source and replacement equipment must be valid');
    const instances=(await client.query('SELECT * FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=$2 ORDER BY id FOR UPDATE',[TARGET.userId,from.id])).rows;
    assert(instances.length===1&&Number(instances[0].id)===TARGET.instanceId&&instances[0].source_type==='BLACK_MIRACLE'&&instances[0].request_id===TARGET.requestId,'Expected single Black Miracle leggings instance changed');
    const before=instances[0];
    const loadout=(await client.query('SELECT * FROM user_equipment_loadout WHERE user_id=$1 AND instance_id=$2 FOR UPDATE',[TARGET.userId,TARGET.instanceId])).rows;
    assert(loadout.every(row=>row.slot==='BOTTOM'),'Unexpected equipment slot');
    const setting=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY])).rows[0];
    assert(setting,'Live Black Miracle settings were not found');
    const raw=parse(setting.value);
    assert(raw.powerRewards?.enabled===true,'Legacy reward mode needs separate review before freezing');
    const equipment=(await client.query("SELECT id,code,total_power,rarity,is_active,is_public FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND UPPER(rarity)='MYTHIC' ORDER BY id")).rows;
    const vehicle=(await client.query("SELECT id,code,total_power,rarity,is_active,is_public FROM character_garage_items WHERE is_active=1 AND is_public=1 AND UPPER(rarity)='MYTHIC' ORDER BY id")).rows;
    const frozen=freezeExistingPools(raw,{equipment,vehicle});
    assert(!frozen.snapshot.equipment.some(row=>row.code.startsWith('EMPEROR_')),'Emperor equipment must already be excluded from the operator-approved pool');
    const updated=(await client.query(`UPDATE user_equipment_instances SET equipment_id=$1,source_type='ADMIN_EXCHANGE',source_id=$2,request_id=$2 WHERE id=$3 AND user_id=$4 AND equipment_id=$5 AND source_type='BLACK_MIRACLE' AND request_id=$6 RETURNING *`,[to.id,OPERATION_KEY,TARGET.instanceId,TARGET.userId,from.id,TARGET.requestId])).rows;
    assert(updated.length===1,'Equipment exchange did not affect exactly one instance');
    const after=updated[0];
    assert(equal({...before,equipment_id:after.equipment_id,source_type:after.source_type,source_id:after.source_id,request_id:after.request_id},after),'Unrelated instance properties changed');
    const settingsChanged=await client.query('UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(frozen.settings),SETTINGS_KEY,setting.value]);
    assert(settingsChanged.rows.length===1,'Pool settings changed concurrently');
    const audit=[];
    for(const [action,type,target,beforeData,afterData] of [
      ['OPS_EQUIPMENT_EXCHANGE','USER_EQUIPMENT',id(TARGET.userId),{operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',instance:before,loadout},{operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',instance:after,loadout}],
      ['OPS_BLACK_MIRACLE_FREEZE','SETTINGS',SETTINGS_KEY,{operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',settings:raw},{operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',settings:frozen.settings,snapshot:frozen.snapshot}]
    ]){
      const inserted=await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,action,type,target,JSON.stringify(beforeData),JSON.stringify(afterData)]);
      assert(inserted.rows.length===1,'Audit log must be recorded');audit.push(id(inserted.rows[0].id));
    }
    const afterLoadout=(await client.query('SELECT * FROM user_equipment_loadout WHERE user_id=$1 AND instance_id=$2',[TARGET.userId,TARGET.instanceId])).rows;
    assert(equal(loadout,afterLoadout),'Equipped instance changed during the exchange');
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:(await client.query('SELECT clock_timestamp() now')).rows[0].now,exchange:{before,after,loadout},pool:{before:raw,after:frozen.settings,snapshot:frozen.snapshot},auditIds:audit};
    assert((await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).rows.length===1,'Repair receipt must be recorded');
    const verified=await verifyBlackMiracleRepair(client);
    assert(verified.ownershipVerified&&verified.poolVerified,'Final live repair verification failed');
    await client.query('COMMIT');return{...verified,replayed:false};
  }catch(error){await client.query('ROLLBACK');throw error}
}

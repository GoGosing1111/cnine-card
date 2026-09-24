import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:diim-mystic-shoes-plus10-grant:20260925:v1';
export const TARGET=Object.freeze({id:4773,nickname:'진짜디임'});
export const EQUIPMENT=Object.freeze([
 {id:33,code:'EQ_1787156667357',name:'미스틱 슈즈',slot:'SHOES'}
]);
const equipmentIds=EQUIPMENT.map(item=>item.id);
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const normalizeCounts=rows=>equipmentIds.map(equipmentId=>({equipmentId,quantity:String(rows.find(row=>Number(row.equipment_id)===equipmentId)?.quantity??0)}));

// Explicit one-time operator grant. Never imported by game request routes.
// Grants NEW copies; existing inventory, enhancements and loadout are preserved.
export async function grantDiimMysticShoesPlus10(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const users=await q('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id FOR UPDATE',[TARGET.nickname]);
  assert.equal(users.length,1,'Exactly one matching account required');
  assert.equal(Number(users[0].id),TARGET.id,'Reviewed account changed');
  assert.equal(users[0].status,'ACTIVE','Target account must be active');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);await client.query('COMMIT');return {...receipt,replayed:true};}
  const catalog=await q('SELECT id,code,name,slot,rarity,is_active,is_public FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[equipmentIds]);
  assert.deepEqual(catalog.map(item=>({id:Number(item.id),code:item.code,name:item.name,slot:item.slot})),EQUIPMENT,'Reviewed equipment catalog changed');
  assert.ok(catalog.every(item=>item.rarity==='MYTHIC'&&Number(item.is_active)===1&&Number(item.is_public)===1),'Equipment must be active and public');
  const [countsReady]=await q("SELECT value FROM app_meta WHERE key='equipment_counts_v1_ready'");
  assert.equal(countsReady?.value,'1','Live equipment counts must be ready');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner required for audit attribution');
  const walletBefore=(await q(walletSql,[TARGET.id]))[0];
  const loadoutBefore=await q('SELECT * FROM user_equipment_loadout WHERE user_id=$1 ORDER BY slot',[TARGET.id]);
  const countsBefore=normalizeCounts(await q('SELECT equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=$1 AND equipment_id=ANY($2::bigint[]) ORDER BY equipment_id FOR UPDATE',[TARGET.id,equipmentIds]));
  const now=new Date().toISOString();
  const instances=await q(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id,acquired_at)
   SELECT $1,id,'ADMIN',$3,$4||':'||id::text,$5 FROM unnest($2::bigint[]) AS id ORDER BY id RETURNING id,equipment_id`,[TARGET.id,equipmentIds,String(owner.id),OPERATION_KEY,now]);
  assert.deepEqual(instances.map(row=>Number(row.equipment_id)).sort((a,b)=>a-b),equipmentIds,'Partial equipment insert');
  const instanceIds=instances.map(row=>String(row.id));
  const forged=await q(`INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision)
   SELECT id,$2,10,1 FROM unnest($1::bigint[]) AS id RETURNING instance_id`,[instanceIds,TARGET.id]);
  assert.equal(forged.length,EQUIPMENT.length,'Partial enhancement insert');
  const granted=await q(`SELECT x.id,x.user_id,x.equipment_id,x.source_type,x.source_id,x.request_id,x.acquired_at,s.level,s.revision
   FROM user_equipment_instances x JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id
   WHERE x.id=ANY($1::bigint[]) ORDER BY x.equipment_id`,[instanceIds]);
  assert.equal(granted.length,EQUIPMENT.length);
  for(const [index,row] of granted.entries()){
   assert.equal(Number(row.equipment_id),equipmentIds[index]);assert.equal(Number(row.user_id),TARGET.id);
   assert.equal(row.source_type,'ADMIN');assert.equal(row.source_id,String(owner.id));
   assert.equal(row.request_id,OPERATION_KEY+':'+row.equipment_id);assert.equal(row.acquired_at,now);
   assert.equal(Number(row.level),10);assert.equal(Number(row.revision),1);
  }
  const countsAfter=normalizeCounts(await q('SELECT equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=$1 AND equipment_id=ANY($2::bigint[]) ORDER BY equipment_id',[TARGET.id,equipmentIds]));
  for(let n=0;n<EQUIPMENT.length;n++)assert.equal(BigInt(countsAfter[n].quantity),BigInt(countsBefore[n].quantity)+1n,'Equipment count trigger mismatch');
  assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore,'Account balances changed');
  assert.deepEqual(await q('SELECT * FROM user_equipment_loadout WHERE user_id=$1 ORDER BY slot',[TARGET.id]),loadoutBefore,'Equipment loadout changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:TARGET,quantityPerType:1,enhancementLevel:10,
   items:granted.map((row,n)=>({...EQUIPMENT[n],instanceId:String(row.id),level:10,quantity:1})),countsBefore,countsAfter,balancesPreserved:true,loadoutPreserved:true,completedAt:now};
  const [audit]=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'OPS_EQUIPMENT_PLUS10_GRANT','USER',$2,$3,$4) RETURNING id`,[owner.id,String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,counts:countsBefore,loadout:loadoutBefore}),JSON.stringify({...receipt,reason:'사용자 지시: 진짜디임 계정에 미스틱 슈즈 +10강 지급'})]);
  assert.ok(audit,'Grant audit missing');receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await client.query('COMMIT');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

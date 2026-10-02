// Explicit user deletion: PREMIUM_CUBE and FUR first-acquisition assistance.
// Run only after the runtime removal is deployed. The caller supplies a private backup.
export const RETIREMENT_KEY='ops:premium-cube-retirement:20261003:v1';
export const RETIRED_SETTINGS=[
 'inventory_cube_settings_v1','cube_drop_settings_v1072','cube_drop_boost_settings_v1072',
 'weekly_premium_cube_settings_v1129','fur_first_acquisition_settings_v1'
];
export const RETIRED_STATE_TABLES=[
 'cube_drop_boost_state','cube_drop_receipts','premium_cube_weekly_state',
 'premium_cube_weekly_attempt_receipts','user_fur_first_pity'
];
const LIVE_SETTINGS=[
 'raid_settings_v1','raid_weekly_boss_settings_v2141','seal_battle_settings_v1',
 'territory_war_settings_v3','territory_war_settings_v1','monster_siege_settings_v1',
 'quest_weekly_settings_v20260924'
];
const JSON_TARGETS=[
 {table:'raid_instance_v1293',column:'settings_json',keys:['instance_id']},
 {table:'raid_user_reward_v1293',column:'reward_json',keys:['instance_id','user_id'],where:"status<>'COMPLETED'"},
 {table:'seal_battle_events',column:'rank_rewards_json',keys:['id']},
 {table:'seal_battle_rank_claims',column:'reward_json',keys:['event_id','user_id'],where:"status<>'COMPLETED'"},
 {table:'territory_war_v3_rounds',column:'settings_json',keys:['id']},
 {table:'monster_siege_rounds',column:'settings_json',keys:['id']}
];
export function stripPremiumCube(value){
 if(Array.isArray(value))return value.map(stripPremiumCube).filter(row=>row!==undefined);
 if(!value||typeof value!=='object')return value;
 if(['type','itemCode','code','reward_ref'].some(key=>String(value[key]||'').toUpperCase()==='PREMIUM_CUBE'))return undefined;
 if(value.rewardType==='PREMIUM_CUBE')return {...value,enabled:false,rewardType:'COIN',rewardAmount:0};
 const output={};
 for(const [key,item] of Object.entries(value)){
  if(key==='PREMIUM_CUBE'||/^premiumCubes?$|^siegeParticipationCube/.test(key))continue;
  const clean=stripPremiumCube(item);if(clean!==undefined)output[key]=clean;
 }
 return output;
}
const rows=async(client,sql,params=[])=>{const result=await client.query(sql,params);return result.rows||[]};
export async function retirementPlan(client){
 const columns=await rows(client,"SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'");
 const exists=(t,c)=>columns.some(row=>row.table_name===t&&(!c||row.column_name===c));
 const state={};for(const table of RETIRED_STATE_TABLES)if(exists(table))state[table]=Number((await rows(client,`SELECT COUNT(*) count FROM ${table}`))[0].count);
 const inventory=await rows(client,"SELECT * FROM cnine_user_inventory WHERE item_code='PREMIUM_CUBE' ORDER BY user_id FOR UPDATE");
 const item=await rows(client,"SELECT * FROM inventory_items WHERE code='PREMIUM_CUBE' FOR UPDATE");
 const settings=await rows(client,'SELECT * FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[ [...RETIRED_SETTINGS,...LIVE_SETTINGS] ]);
 const metaChanges=[];
 for(const row of settings.filter(row=>LIVE_SETTINGS.includes(row.key))){
  const clean=stripPremiumCube(JSON.parse(row.value));if(JSON.stringify(clean)!==JSON.stringify(JSON.parse(row.value)))metaChanges.push({key:row.key,value:JSON.stringify(clean)});
 }
 const jsonChanges=[];
 for(const target of JSON_TARGETS){
  if(!exists(target.table,target.column))continue;
  const source=await rows(client,`SELECT ${target.keys.join(',')},${target.column} FROM ${target.table} WHERE ${target.column} IS NOT NULL${target.where?' AND '+target.where:''} AND (${target.column} LIKE '%PREMIUM_CUBE%' OR ${target.column} LIKE '%premiumCube%' OR ${target.column} LIKE '%siegeParticipationCube%') FOR UPDATE`);
  const updates=[];
  for(const row of source){const parsed=JSON.parse(row[target.column]),clean=stripPremiumCube(parsed);if(JSON.stringify(clean)!==JSON.stringify(parsed))updates.push({...row,clean:JSON.stringify(clean)});}
  if(updates.length)jsonChanges.push({...target,updates});
 }
 const messages=await rows(client,"SELECT * FROM user_message_rewards WHERE reward_type='PREMIUM_CUBE' AND claimed_at IS NULL FOR UPDATE");
 const messageRows=await rows(client,'SELECT * FROM user_messages WHERE id=ANY($1::bigint[]) FOR UPDATE',[messages.map(row=>String(row.message_id))]);
 const pendingUseReceipts=await rows(client,"SELECT * FROM inventory_use_receipts WHERE item_code='PREMIUM_CUBE' AND status<>'COMPLETED' FOR UPDATE");
 const coupons=await rows(client,"SELECT * FROM coupons WHERE reward_type='PREMIUM_CUBE' AND deleted_at IS NULL FOR UPDATE");
 const pool=await rows(client,"SELECT * FROM alchemy_reward_pool_v1 WHERE reward_ref='PREMIUM_CUBE' FOR UPDATE");
 const territory=await rows(client,'SELECT round_id,user_id,premium_cube_quantity FROM territory_war_v3_rewards WHERE premium_cube_quantity>0 AND claimed_at IS NULL FOR UPDATE');
 const auctions=await rows(client,"SELECT id,status FROM auctions_v1553 WHERE (item_type='PREMIUM_CUBE' OR item_ref='PREMIUM_CUBE') AND status IN ('SCHEDULED','ACTIVE') FOR UPDATE");
 if(auctions.length)throw Error('Retired cube auctions require bid refunds before deletion');
 return {state,inventory,item,settings,metaChanges,jsonChanges,messages,messageRows,pendingUseReceipts,coupons,pool,territory};
}
export function summarizeRetirement(plan){return {
 inventoryUsers:plan.inventory.length,inventoryQuantity:plan.inventory.reduce((sum,row)=>sum+Number(row.quantity),0),
 stateRows:plan.state,settingsRemoved:plan.settings.filter(row=>RETIRED_SETTINGS.includes(row.key)).length,
 settingsUpdated:plan.metaChanges.map(row=>row.key),snapshotsUpdated:Object.fromEntries(plan.jsonChanges.map(row=>[row.table,row.updates.length])),
 pendingMessages:plan.messages.length,coupons:plan.coupons.length,alchemyEntries:plan.pool.length,pendingTerritoryRewards:plan.territory.length
};}
async function updateJson(client,target){
 for(let start=0;start<target.updates.length;start+=500){
  const batch=target.updates.slice(start,start+500),parameters=[],values=batch.map(row=>{
   const fields=target.keys.map(key=>{parameters.push(String(row[key]));return '$'+parameters.length+'::bigint'});
   parameters.push(row.clean);fields.push('$'+parameters.length+'::text');return '('+fields.join(',')+')';
  });
  const join=target.keys.map(key=>`t.${key}=v.${key}`).join(' AND ');
  await client.query(`UPDATE ${target.table} t SET ${target.column}=v.clean FROM (VALUES ${values.join(',')}) v(${[...target.keys,'clean'].join(',')}) WHERE ${join}`,parameters);
 }
}
export async function retirePremiumCube(client,{backup,adminId=1,dryRun=false,now=new Date().toISOString(),onProgress=()=>{}}={}){
 if(typeof backup!=='function')throw Error('A private backup writer is required');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL TIME ZONE 'UTC'");await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[RETIREMENT_KEY]);
  const prior=(await rows(client,'SELECT value FROM app_meta WHERE key=$1',[RETIREMENT_KEY]))[0];
  if(prior){await client.query('ROLLBACK');return {replayed:true,...JSON.parse(prior.value)};}
  const owner=(await rows(client,"SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[adminId]))[0];
  if(!owner)throw Error('An active OWNER audit identity is required');
  const plan=await retirementPlan(client),summary=summarizeRetirement(plan);
  await backup({operationKey:RETIREMENT_KEY,at:now,summary,plan});onProgress({prepared:summary});
  if(dryRun){await client.query('ROLLBACK');return {dryRun:true,...summary};}
  const deleted=await rows(client,"DELETE FROM cnine_user_inventory WHERE item_code='PREMIUM_CUBE' RETURNING user_id,quantity");
  if(deleted.length!==plan.inventory.length)throw Error('Inventory changed during retirement');
  await client.query("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT x.user_id,'PREMIUM_CUBE',-x.quantity,0,'PREMIUM_CUBE_RETIREMENT','ADMIN_OPERATION',$1 FROM jsonb_to_recordset($2::jsonb) x(user_id bigint,quantity bigint) WHERE x.quantity<>0",[RETIREMENT_KEY,JSON.stringify(deleted)]);
  await client.query("DELETE FROM inventory_items WHERE code='PREMIUM_CUBE'");
  await client.query('DELETE FROM app_meta WHERE key=ANY($1::text[])',[RETIRED_SETTINGS]);
  for(const row of plan.metaChanges)await client.query("UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3",[row.value,now,row.key]);
  for(const target of plan.jsonChanges){await updateJson(client,target);onProgress({cleanedSnapshots:target.table,rows:target.updates.length});}
  await client.query("DELETE FROM alchemy_reward_pool_v1 WHERE reward_ref='PREMIUM_CUBE'");
  await client.query("UPDATE territory_war_v3_rewards SET premium_cube_quantity=0 WHERE premium_cube_quantity>0 AND claimed_at IS NULL");
  const messageIds=plan.messages.map(row=>String(row.message_id));
  await client.query("DELETE FROM user_message_rewards WHERE reward_type='PREMIUM_CUBE' AND claimed_at IS NULL");
  await client.query('DELETE FROM user_messages m WHERE m.id=ANY($1::bigint[]) AND NOT EXISTS(SELECT 1 FROM user_message_rewards r WHERE r.message_id=m.id)',[messageIds]);
  await client.query("UPDATE coupons SET is_active=0,deleted_at=$1,deleted_by=$2,updated_at=$1 WHERE reward_type='PREMIUM_CUBE' AND deleted_at IS NULL",[now,adminId]);
  await client.query("DELETE FROM inventory_use_receipts WHERE item_code='PREMIUM_CUBE' AND status<>'COMPLETED'");
  for(const table of Object.keys(plan.state))await client.query(`TRUNCATE ONLY ${table}`);
  const remaining=(await rows(client,"SELECT COUNT(*) count FROM cnine_user_inventory WHERE item_code='PREMIUM_CUBE'"))[0];
  if(Number(remaining.count))throw Error('Retired inventory remains');
  const result={operationKey:RETIREMENT_KEY,at:now,...summary,inventoryRowsDeleted:deleted.length};
  const audit=await rows(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PREMIUM_CUBE_RETIREMENT','INVENTORY',$2,$3,$4) RETURNING id",[adminId,RETIREMENT_KEY,JSON.stringify(summary),JSON.stringify(result)]);
  result.auditId=String(audit[0].id);
  await client.query("INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)",[RETIREMENT_KEY,JSON.stringify(result),now]);
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}
}

// Explicit one-time CMS correction. Not imported by runtime or a migration.
export const OPERATION_KEY='ops:eastern-craft-repair:20261004:v1';
const CODES=['EQ_1788486929132','EQ_1788486888336'];
const description='+10 장비와 재료·마스터의 별·코인을 사용합니다. 실패 시 +10 장비가 소모되며 리페어권으로 복구할 수 있습니다.';
export async function inspectEasternCraftRepair(client){
  return (await client.query("SELECT r.id,r.code,r.name,r.description,r.output_ref,r.is_active,r.is_public,r.owner_test_only,r.master_star_cost,e.code equipment_code,p.value policy_raw FROM workshop_recipes_v1668 r JOIN character_equipment_items e ON CAST(e.id AS TEXT)=r.output_ref LEFT JOIN app_meta p ON p.key='WORKSHOP_EQUIPMENT_CRAFT_V1:'||r.code WHERE r.category='ITEM_SYNTHESIS' AND r.output_type='EQUIPMENT' AND e.code=ANY($1::text[]) ORDER BY r.id",[CODES])).rows;
}
export async function applyEasternCraftRepair(client,{expected,actorId=1,dryRun=true}){
  if(!Array.isArray(expected)||!expected.length)throw Error('No inspected Eastern recipe');
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
    if(!(await client.query("SELECT id FROM users WHERE id=$1 AND role='OWNER'",[actorId])).rows.length)throw Error('OWNER required');
    await client.query('SELECT id FROM workshop_recipes_v1668 WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[expected.map(r=>r.id)]);
    const before=await inspectEasternCraftRepair(client);
    if(JSON.stringify(before)!==JSON.stringify(expected))throw Error('CMS changed; inspect again');
    for(const row of before){
      const policy=JSON.parse(row.policy_raw);
      if(policy.failureInputPolicy!=='CONSUME'||!Number.isSafeInteger(policy.revision))throw Error('Unexpected Eastern input policy');
      const next={...policy,failureRepairable:true,revision:policy.revision+1};
      const saved=await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(next),'WORKSHOP_EQUIPMENT_CRAFT_V1:'+row.code,row.policy_raw]);
      if(saved.rows.length!==1)throw Error('CMS policy conflict');
      await client.query('UPDATE workshop_recipes_v1668 SET description=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[description,row.id]);
    }
    const after=await inspectEasternCraftRepair(client);
    for(let i=0;i<before.length;i++)for(const key of ['id','code','name','output_ref','equipment_code','is_active','is_public','owner_test_only','master_star_cost'])if(before[i][key]!==after[i][key])throw Error('Unrequested CMS change: '+key);
    const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EASTERN_CRAFT_REPAIR_ENABLE','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id",[actorId,before.map(r=>r.id).join(','),JSON.stringify(before),JSON.stringify(after)])).rows[0];
    const receipt={operation:OPERATION_KEY,before,after,auditId:audit.id,completedAt:new Date().toISOString()};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

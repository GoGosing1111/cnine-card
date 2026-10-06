import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:user-role:5849:admin:20261007';
export const TARGET=Object.freeze({id:5849,nickname:'족다니',role:'ADMIN'});
const AUTHORIZATION='족다니 계정 ADMIN 으로 승격';
const userFields='id,nickname,role,status';

export async function promoteJokdani(client){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const receiptRow=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(receiptRow){
      const receipt=JSON.parse(receiptRow.value);
      assert.equal(receipt.status,'COMPLETED');
      assert.equal(Number(receipt.after.id),TARGET.id);
      // A completed operation never re-applies after a later role change.
      const current=(await client.query(`SELECT ${userFields} FROM users WHERE id=$1`,[TARGET.id])).rows[0];
      await client.query('COMMIT');
      return {ok:true,replayed:true,receipt,current};
    }
    const candidates=(await client.query(`SELECT ${userFields} FROM users WHERE nickname=$1 FOR UPDATE`,[TARGET.nickname])).rows;
    assert.equal(candidates.length,1,'Exact nickname must resolve to one account');
    const before=candidates[0];
    assert.equal(Number(before.id),TARGET.id,'Account identity changed');
    assert.equal(before.role,'USER','Unexpected role; do not overwrite');
    assert.equal(before.status,'ACTIVE','Unexpected account status');
    const actor=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert(actor,'Owner audit actor missing');
    const changed=await client.query(`UPDATE users SET role=$1 WHERE id=$2 AND nickname=$3 AND role='USER' AND status='ACTIVE' RETURNING ${userFields}`,
      [TARGET.role,TARGET.id,TARGET.nickname]);
    assert.equal(changed.rowCount,1,'Exactly one account must change');
    const after=changed.rows[0];
    assert.equal(after.role,TARGET.role);
    const auditAfter={...after,operationKey:OPERATION_KEY,authorization:AUTHORIZATION,executionSource:'AUTHORIZED_ONE_TIME_OPS'};
    const log=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [actor.id,'USER_ROLE_CHANGE','USER',String(TARGET.id),JSON.stringify(before),JSON.stringify(auditAfter)])).rows[0];
    assert(log,'Role audit missing');
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,before,after,
      adminLogId:log.id,completedAt:new Date().toISOString()};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await client.query('COMMIT');
    return {ok:true,replayed:false,receipt,current:after};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifyJokdani(client){
  const current=(await client.query(`SELECT ${userFields} FROM users WHERE id=$1 AND nickname=$2`,[TARGET.id,TARGET.nickname])).rows[0];
  assert.equal(current?.role,TARGET.role);
  assert.equal(current.status,'ACTIVE');
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  assert(saved,'Role receipt missing');
  const receipt=JSON.parse(saved.value);
  assert.equal(receipt.status,'COMPLETED');
  assert.deepEqual(current,receipt.after);
  const audit=(await client.query('SELECT id FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_type=$3 AND target_id=$4',
    [receipt.adminLogId,'USER_ROLE_CHANGE','USER',String(TARGET.id)])).rows;
  assert.equal(audit.length,1,'Role audit missing');
  return {ok:true,current,receipt,verifiedAt:new Date().toISOString()};
}

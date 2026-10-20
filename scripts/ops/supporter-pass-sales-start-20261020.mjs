import assert from 'node:assert/strict';
import {PASS_KEY} from '../../shared/supporter-season-pass-v1.mjs';

export const OPERATION_KEY='ops:supporter-pass-sales-start:20261020:v1';
export const SALES_STARTS_AT=1791647946414;
export const SALES_AUDIT_ID=44138;
export const AUTHORIZATION=['패스 첫 개방 시점부터 현재까지 수령','패스판매일 기준'];
const preserved=config=>Object.fromEntries(Object.entries(config).filter(([key])=>!['revision','writeToken','salesStartsAt'].includes(key)));
const decode=row=>JSON.parse(row.value);

export async function applyPassSalesStart(client,{dryRun=false}={}){
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(previous){
      const receipt=decode(previous);
      assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
      assert.equal(receipt.salesStartsAt,SALES_STARTS_AT);
      await client.query('ROLLBACK');return {alreadyApplied:true,receipt};
    }
    const owner=(await client.query("SELECT id FROM users WHERE id=1 AND nickname='핑크빛유두' AND role='OWNER' AND status='ACTIVE'")).rows[0];
    assert.ok(owner,'Expected active OWNER required');
    const evidence=(await client.query('SELECT id,action_type,before_data,after_data,created_at FROM admin_logs WHERE id=$1',[SALES_AUDIT_ID])).rows[0];
    assert.equal(evidence?.action_type,'SERVER_SUPPORT_APPLICATION_SETTINGS','First sales evidence changed');
    const beforeSale=JSON.parse(evidence.before_data),afterSale=JSON.parse(evidence.after_data);
    assert.equal(beforeSale.enabled,false);assert.equal(beforeSale.revision,0);
    assert.equal(afterSale.config.enabled,true);assert.equal(afterSale.config.revision,1);
    assert.equal(afterSale.processedAt,SALES_STARTS_AT);
    const row=(await client.query('SELECT key,value FROM app_meta WHERE key=$1 FOR UPDATE',[PASS_KEY])).rows[0];
    assert.ok(row,'Existing pass configuration required');
    const before=decode(row);
    assert.equal(before.version,1);assert.ok(Number.isSafeInteger(before.revision)&&before.revision>=0);
    assert.equal(before.days.length,30);assert.equal(before.salesStartsAt,undefined,'Sales anchor already set; inspect first');
    const after={...before,revision:before.revision+1,writeToken:crypto.randomUUID(),salesStartsAt:SALES_STARTS_AT};
    assert.deepEqual(preserved(after),preserved(before));
    const completedAt=new Date().toISOString();
    const updated=(await client.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),completedAt,PASS_KEY,row.value])).rows;
    assert.equal(updated.length,1,'Concurrent pass configuration update');
    const audit=(await client.query(
      "INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'SUPPORTER_PASS_SALES_START','APP_META',$2,$3,$4,$5) RETURNING id",
      [owner.id,PASS_KEY,JSON.stringify(before),JSON.stringify({operationKey:OPERATION_KEY,authorization:AUTHORIZATION,salesAuditId:SALES_AUDIT_ID,config:after}),completedAt]
    )).rows;
    assert.equal(audit.length,1,'Pass sales start audit missing');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,salesStartsAt:SALES_STARTS_AT,salesAuditId:SALES_AUDIT_ID,
      before,after,adminLogId:String(audit[0].id),completedAt,subscriptionsModified:false,rewardsGranted:false};
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),completedAt]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');
    return {alreadyApplied:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifyPassSalesStart(client){
  const marker=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  assert.ok(marker,'Pass sales start operation missing');
  const receipt=decode(marker);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.salesStartsAt,SALES_STARTS_AT);
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1',[PASS_KEY])).rows[0],config=decode(row);
  assert.equal(config.salesStartsAt,SALES_STARTS_AT);
  assert.ok(config.revision>=receipt.after.revision);
  const audit=(await client.query('SELECT action_type,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId])).rows[0];
  assert.equal(audit?.action_type,'SUPPORTER_PASS_SALES_START');
  assert.deepEqual(JSON.parse(audit.after_data).config,receipt.after);
  return {verified:true,checkedAt:new Date().toISOString(),salesStartsAt:config.salesStartsAt,revision:config.revision,enabled:config.enabled,adminLogId:receipt.adminLogId};
}

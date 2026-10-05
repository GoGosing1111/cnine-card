// Explicit schema preparation. No settings, inventory, coin or existing counters are reset.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_PACK_SCHEMA} from '../../functions/_mercenary_limited_pack.js';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
export const RECEIPT_KEY='mercenary_limited_pack_schema_20261006_v1';
const hash=s=>createHash('sha256').update(String(s)).digest('hex');
export async function prepare(client){
 const codes=LIMITED_MERCENARIES.map(c=>c.code);
 const before=(await client.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1') ORDER BY key")).rows;
 const existing=(await client.query('SELECT mercenary_code,SUM(total_copies) AS copies FROM user_mercenary_cards_v1 WHERE mercenary_code=ANY($1::text[]) GROUP BY mercenary_code',[codes])).rows;
 // Any pre-existing limited grant requires a reviewed reconciliation, not a silent reset.
 const table=(await client.query("SELECT to_regclass('mercenary_limited_stock_v1') AS name")).rows[0].name;
 if(existing.length&&!table)throw Error('Existing limited ownership requires issuance reconciliation.');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('mercenary-limited-pack-schema-20261006'))");
  for(const sql of LIMITED_PACK_SCHEMA)await client.query(sql);
  const after=(await client.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1') ORDER BY key")).rows;
  assert.deepEqual(after,before,'Schema preparation must not modify prices/probabilities/release mode');
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY])).rows[0];
  const receipt={version:1,preparedAt:new Date().toISOString(),schemaSha256:hash(LIMITED_PACK_SCHEMA.join('\n')),limitedExisting:existing,settingsSha256:hash(JSON.stringify(before)),releaseEnabled:false};
  if(row)assert.equal(JSON.parse(row.value).schemaSha256,receipt.schemaSha256);
  else await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[RECEIPT_KEY,JSON.stringify(receipt)]);
  await client.query('COMMIT');return {prepared:true,replayed:Boolean(row),existingLimitedRows:existing.length,schemaSha256:receipt.schemaSha256,releaseEnabled:false};
 }catch(e){await client.query('ROLLBACK');throw e;}
}

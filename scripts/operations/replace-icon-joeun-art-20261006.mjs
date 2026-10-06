// Explicit approval of ICON Joeun's image only. No balance or ownership writes.
import assert from 'node:assert/strict';
import {ICON_LIVE_CARDS} from '../../shared/icon-fusion-policy-v1.mjs';
export const RECEIPT_KEY='icon_joeun_medic_assets_20261006_v1';
const card=ICON_LIVE_CARDS.find(c=>c.cardId==='CN-1C000004');
const previous='assets/cards/ICON/oh-joeun-source-v1.png';
export async function apply(client,{dryRun=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[RECEIPT_KEY]);
  const before=(await client.query('SELECT * FROM cards WHERE id=$1 FOR UPDATE',[card.cardId])).rows[0];
  assert(before,'Registered ICON Joeun is required');assert.equal(before.rarity_override,'ICON');
  const stored=(await client.query('SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY])).rows[0];
  if(stored){assert.equal(before.image_url,card.sourceArt);await client.query(dryRun?'ROLLBACK':'COMMIT');return {...JSON.parse(stored.value),replayed:true,dryRun};}
  assert.equal(before.image_url,previous,'Unexpected current portrait: do not overwrite');
  const after=(await client.query('UPDATE cards SET image_url=$1,updated_at=sqlite_now() WHERE id=$2 AND image_url=$3 RETURNING *',[card.sourceArt,card.cardId,previous])).rows[0];
  assert(after,'Exactly one approved portrait must change');
  for(const key of Object.keys(before))if(!['image_url','updated_at'].includes(key))assert.deepEqual(after[key],before[key],key+' must be preserved');
  const receipt={operation:RECEIPT_KEY,appliedAt:new Date().toISOString(),cardId:card.cardId,approval:'USER_EXPLICIT_TWO_ATTACHMENTS',
   before:{image:before.image_url},after:{image:after.image_url},sourceSha256:card.sourceSha256,ownershipWrites:0,currencyWrites:0,combatChanges:0};
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RECEIPT_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

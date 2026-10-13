import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {STREAMER_SETTINGS_KEY,validateStreamerSettings} from '../../js/streamer-lounge-model-v2036.js';

export const RECEIPT_KEY = 'ops:streamer-namsudaeng:20261013:v1';
export const PROFILE = Object.freeze({
  id:'mew030709', name:'남수댕',
  stationUrl:'https://www.sooplive.com/station/mew030709',
  imageUrl:'https://stimg.sooplive.com/LOGO/me/mew030709/m/mew030709.webp',
  description:'', visible:true
});

// User-requested CMS addition. The caller supplies its existing authorized connection.
// Lock the same settings row the CMS updates; never reseed or replace another profile.
export async function addNamsudaeng(client, {ownerId, apply = false} = {}) {
  await client.query('BEGIN');
  try {
    const owner = await client.query('SELECT id FROM users WHERE id=$1 AND role=$2',[ownerId,'OWNER']);
    assert.equal(owner.rowCount,1,'An existing OWNER is required for the audit record');
    const locked = await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[STREAMER_SETTINGS_KEY]);
    assert.equal(locked.rowCount,1,'Existing live roster must be present');
    const before = JSON.parse(locked.rows[0].value);
    validateStreamerSettings(before.settings);
    const prior = await client.query('SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY]);
    if (prior.rowCount) {
      assert.equal(before.settings.profiles.filter(row=>row.id===PROFILE.id && row.stationUrl===PROFILE.stationUrl).length,1);
      await client.query('ROLLBACK');
      return {...JSON.parse(prior.rows[0].value),alreadyApplied:true};
    }
    assert.equal(before.settings.profiles.some(row=>row.id===PROFILE.id || row.stationUrl===PROFILE.stationUrl),false,'Review the existing duplicate before applying');
    const settings = validateStreamerSettings({...before.settings,profiles:[...before.settings.profiles,{...PROFILE}]});
    assert.deepEqual(settings.profiles.slice(0,-1),before.settings.profiles,'Existing roster must stay identical');
    assert.equal(settings.enabled,before.settings.enabled);
    const receipt = {operation:RECEIPT_KEY,at:new Date().toISOString(),beforeRevision:before.revision,revision:randomUUID(),beforeCount:before.settings.profiles.length,afterCount:settings.profiles.length,added:PROFILE,existingProfilesPreserved:true};
    if (!apply) {await client.query('ROLLBACK');return {...receipt,dryRun:true};}
    const saved = await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify({revision:receipt.revision,settings}),STREAMER_SETTINGS_KEY,locked.rows[0].value]);
    assert.equal(saved.rowCount,1);
    const audit = await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ownerId,'STREAMER_LOUNGE_UPDATE','SETTINGS',STREAMER_SETTINGS_KEY,JSON.stringify(before.settings),JSON.stringify(settings)]);
    receipt.adminLogId = String(audit.rows[0].id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[RECEIPT_KEY,JSON.stringify(receipt)]);
    assert.deepEqual(JSON.parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[STREAMER_SETTINGS_KEY])).rows[0].value).settings,settings);
    await client.query('COMMIT');
    return receipt;
  } catch (error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
}

import assert from 'node:assert/strict';
import manifest from '../../assets/bgm/soopketmon-ost-20261008.json' with {type:'json'};

export const SETTINGS_KEY='lobby_bgm_settings_v1803';
export const OPERATION_KEY='ops:lobby-bgm-playlist:20261008:v1';
export const TRACKS=manifest.tracks.map(({title,url})=>({title,url}));

export async function applyBgmPlaylist(client,{proof,expectedSettings}){
  assert.equal(proof?.origin,'https://cnine-card.pages.dev');
  assert.match(proof?.commit||'',/^[a-f0-9]{40}$/);
  assert.equal(proof?.playlistRuntimeVerified,true);
  assert.deepEqual(proof?.tracks,manifest.tracks.map(({file,bytes,sha256})=>({file,bytes,sha256})));
  const age=Date.now()-Date.parse(proof.checkedAt);
  assert.ok(age>=0&&age<600000,'Fresh deployed runtime and exact MP3 hashes required');
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    const row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY])).rows[0];
    assert.ok(row,'Current BGM settings required');
    const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');await client.query('COMMIT');return {replayed:true,receipt};}
    const before=JSON.parse(row.value);
    assert.deepEqual(before,expectedSettings,'BGM settings changed since inspection; re-read before applying');
    const after={...before,volumePercent:15,tracks:TRACKS};
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(owner,'Active owner required for the authorized audit');
    const completedAt=new Date().toISOString();
    const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 RETURNING value',[SETTINGS_KEY,JSON.stringify(after),completedAt]);
    assert.equal(updated.rows.length,1);assert.deepEqual(JSON.parse(updated.rows[0].value),after);
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'BGM 플레이리스트 선택 및 첨부 DEMO 8·9·10·12 추가, 파일명 숲켓몬 OST 순번 통일, 기본 음량 15%와 개인 조절',before,after,proof,completedAt};
    const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'LOBBY_BGM_UPDATE','SETTINGS','lobby_bgm',$2,$3,$4) RETURNING id",[owner.id,JSON.stringify(before),JSON.stringify(receipt),completedAt])).rows[0];
    assert.ok(audit);receipt.adminLogId=String(audit.id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),completedAt]);
    await client.query('COMMIT');
    return {replayed:false,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function verifyBgmPlaylist(client){
  const receiptRow=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  const receipt=JSON.parse(receiptRow?.value||'{}');assert.equal(receipt.status,'COMPLETED');
  const settings=JSON.parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY])).rows[0].value);
  assert.deepEqual(settings,receipt.after);
  const audit=(await client.query('SELECT after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId])).rows[0];
  assert.equal(JSON.parse(audit?.after_data||'{}').operationKey,OPERATION_KEY);
  return {verified:true,checkedAt:new Date().toISOString(),settings,adminLogId:receipt.adminLogId};
}

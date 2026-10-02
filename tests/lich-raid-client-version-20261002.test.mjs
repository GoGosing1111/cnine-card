import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
test('stale browser cannot spend a ticket or ready a new encounter; existing v1 lobby remains usable',async t=>{
 const h=await lichLiveFixture();t.after(()=>h.close());
 const old=await h.command('open',{clientRulesVersion:undefined});assert.equal(old.body.code,'LICH_CLIENT_UPDATE');
 assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'")).quantity),5);
 const roomId=await h.party();assert.equal((await h.command('ready',{roomId,ready:true,clientRulesVersion:undefined},2)).body.code,'LICH_CLIENT_UPDATE');
 const raw=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);raw.rulesVersion=1;
 await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(raw),roomId);
 assert.equal((await h.command('ready',{roomId,ready:true,clientRulesVersion:undefined},2)).status,200);
});

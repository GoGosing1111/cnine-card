import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {goldenAxeAdmin} from '../functions/_golden_axe.js';
import {ensureChuseok} from '../functions/_chuseok.js';
import {cleanChuseokSettings} from '../js/chuseok-model-v1.js';
import {inspect,preview,apply,verify,REOPEN_KEY} from '../scripts/ops/golden-axe-reopen-20261002.mjs';
async function setup(){
 const f=await fixture();await f.configure('COIN_500',{dailyLimit:5});await ensureChuseok(f.env);
 await f.pg.exec(`ALTER TABLE users ADD COLUMN role TEXT;UPDATE users SET role='OWNER' WHERE id=99;
 CREATE TABLE coupons(id BIGINT PRIMARY KEY,code TEXT,reward_type TEXT,is_active BIGINT,deleted_at TEXT,deleted_by BIGINT,updated_at TEXT);
 INSERT INTO coupons VALUES(1,'CHUSEOK','CHUSEOK_COIN',1,NULL,NULL,NULL),(2,'OLD-AXE','PINGDU_OLD_AXE',0,'2026-09-23',99,NULL),(3,'COIN','COIN',1,NULL,NULL,NULL);
 UPDATE inventory_items SET is_active=1 WHERE code='CHUSEOK_COIN';`);
 await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['chuseok_events_v1',JSON.stringify(cleanChuseokSettings())]);return {...f,client:{query:(s,v=[])=>f.pg.query(s,v)}};
}
test('seven-day reopen is atomic/idempotent and preserves receipts, prizes, economics and retired coupons',async t=>{
 const f=await setup();t.after(()=>f.close());const oldBody=await f.body(),old=await f.draw(oldBody);assert.equal((await f.state()).dailyUsed,1);
 await f.pg.query("UPDATE golden_axe_receipts_v1 SET created_at=CURRENT_TIMESTAMP-INTERVAL '1 minute'");
 const before=await inspect(f.client);assert.equal((await preview(f.client)).summary.dryRun,true);assert.deepEqual(await inspect(f.client),before);
 const {summary}=await apply(f.client);assert.equal(Date.parse(summary.endsAt)-Date.parse(summary.startsAt),7*86400000);
 const state=await f.state();assert.equal(state.dailyUsed,0);assert.deepEqual(state.history,[]);assert.equal(state.axes,9);assert.equal(state.coin,old.coin);assert.equal(state.roundId,summary.historyStartsAt);
 assert.equal((await f.draw(oldBody)).replayed,true);assert.equal((await f.state()).axes,9);await assert.rejects(f.draw({...oldBody,requestId:crypto.randomUUID()}),e=>e.code==='SETTINGS_CHANGED');
 const c=await goldenAxeAdmin(f.env,{id:99});await goldenAxeAdmin(f.env,{id:99},{...c.settings,revision:c.revision,historyStartsAt:'2000-01-01T00:00:00Z'});assert.equal((await f.state()).roundId,summary.historyStartsAt);
 for(let i=0;i<5;i++)await f.draw(await f.body());await assert.rejects(f.draw(await f.body()),e=>e.code==='DAILY_LIMIT');assert.equal((await f.state()).history.length,5);
 const replay=await apply(f.client);assert.equal(replay.summary.replayed,true);assert.equal(replay.summary.endsAt,summary.endsAt);assert.equal((await f.state()).dailyUsed,5);assert.equal((await verify(f.client)).verified,true);
 assert.equal(Number((await f.row('SELECT COUNT(*) n FROM golden_axe_receipts_v1')).n),6);assert.equal(Number((await f.row('SELECT is_active FROM coupons WHERE id=2')).is_active),0);assert.equal(Number((await f.row('SELECT is_active FROM coupons WHERE id=3')).is_active),1);
});
test('audit failure rolls back settings, catalog, coupons and reset marker together',async t=>{
 const f=await setup();t.after(()=>f.close());const before=await inspect(f.client);await assert.rejects(apply({query:(s,v)=>s.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('injected audit failure')):f.client.query(s,v)}),/injected audit failure/);assert.deepEqual(await inspect(f.client),before);assert.equal(await f.row('SELECT key FROM app_meta WHERE key=$1',[REOPEN_KEY]),undefined);
});

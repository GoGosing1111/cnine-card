import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as axeFixture} from './fixtures/golden-axe-v1.mjs';
import {LIMITED_PACK_SCHEMA} from '../functions/_mercenary_limited_pack.js';
import {prepareChickenEvent} from '../functions/_chicken_event.js';
import {chickenLimitedOnceKey} from '../functions/_chicken_limited_once.js';
import {OPERATION_KEY,applyValterChicken,verifyValterChicken} from '../scripts/ops/pink-valter-chicken-once-20261008.mjs';
const releaseCommit='a'.repeat(40);
async function fixture(){
 const f=await axeFixture();for(const sql of LIMITED_PACK_SCHEMA)await f.pg.exec(sql);await prepareChickenEvent(f.pg);
 await f.pg.exec(`ALTER TABLE users ADD COLUMN nickname TEXT;ALTER TABLE users ADD COLUMN role TEXT;ALTER TABLE users ADD COLUMN card_shards BIGINT DEFAULT 0;ALTER TABLE users ADD COLUMN magic_crystals BIGINT DEFAULT 0;
 UPDATE users SET nickname='핑크빛유두',role='OWNER' WHERE id=1;
 INSERT INTO users(id,nickname,role,status,coin) VALUES(81,'비쥬얼깡패','USER','ACTIVE',123456);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER);
 INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-049'),(81,'V-055');
 INSERT INTO user_mercenary_growth_v1 VALUES(1,'V-996',1),(81,'V-055',12);
 INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES('V-996',7),('V-990',7);`);
 for(const [key,value] of [['mercenary_limited_pack_v1',{settings:{stockLimits:{'V-996':7},mode:'OFF'}}],['mercenary_limited_draw_policy_v1',{policy:{acquisitionEnabled:false}}]])await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 const q=async(s,v=[])=>(await f.pg.query(s,v)).rows;
 return {...f,q,async apply(fault=null){await q('BEGIN');try{const run=async(s,v)=>{if(fault&&s.includes(fault)&&s.startsWith('INSERT'))throw Error('injected failure');if(s.includes("AS kst"))return [{kst:'2026-10-08'}];return q(s,v);};const result=await applyValterChicken(run,{releaseCommit});await q('COMMIT');return result;}catch(e){await q('ROLLBACK');throw e;}}};
}
test('authorized owner grant and next-order entitlement commit once with stock, journals and audit',async()=>{const f=await fixture();try{
 const before=await f.q('SELECT key,value FROM app_meta ORDER BY key');
 const first=await f.apply();assert.equal(first.replayed,false);assert.equal(first.grant.serial,1);assert.equal(first.grant.copiesAfter,1);assert.equal(first.guarantee.status,'ARMED');
 const verified=await verifyValterChicken(f.q);assert.equal(verified.ownerCopies,1);assert.equal(verified.guaranteeRemaining,1);assert.equal(Number(verified.stock.stock_limit),7);assert.equal(Number(verified.stock.issued),1);
 const snapshot=await f.q('SELECT * FROM user_mercenary_cards_v1');assert.equal((await f.apply()).replayed,true);assert.deepEqual(await f.q('SELECT * FROM user_mercenary_cards_v1'),snapshot);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM admin_logs')).n,2);assert.equal((await f.row('SELECT COUNT(*)::int n FROM mercenary_limited_issues_v1')).n,1);
 assert.deepEqual((await f.q('SELECT key,value FROM app_meta ORDER BY key')).filter(r=>r.key!==OPERATION_KEY&&r.key!==chickenLimitedOnceKey(81)),before);
 }finally{await f.close();}});
test('late audit failure rolls back both accounts, stock and entitlement; retry then succeeds',async()=>{const f=await fixture();try{
 await assert.rejects(f.apply('admin_logs'),/injected/);
 assert.equal((await f.row("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-996'")).issued,0);assert.equal((await f.row('SELECT COUNT(*)::int n FROM user_mercenary_cards_v1')).n,0);assert.equal((await f.row('SELECT COUNT(*)::int n FROM mercenary_limited_issues_v1')).n,0);assert.equal((await f.row('SELECT COUNT(*)::int n FROM mercenary_card_acquisitions_v1')).n,0);
 assert.equal((await f.q('SELECT value FROM app_meta WHERE key=ANY($1::text[])',[[OPERATION_KEY,chickenLimitedOnceKey(81)]])).length,0);assert.equal((await f.apply()).grant.serial,1);
 }finally{await f.close();}});
test('wrong identity or insufficient existing limited stock cannot grant or arm',async()=>{const f=await fixture();try{
 await f.pg.query("UPDATE users SET nickname='renamed' WHERE id=81");await assert.rejects(f.apply());await f.pg.query("UPDATE users SET nickname='비쥬얼깡패' WHERE id=81");
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=6 WHERE code='V-996'");await assert.rejects(f.apply(),/Both authorized rewards/);
 assert.equal((await f.q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length,0);assert.equal((await f.row('SELECT COUNT(*)::int n FROM user_mercenary_cards_v1')).n,0);
 }finally{await f.close();}});

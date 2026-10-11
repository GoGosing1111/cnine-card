import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as baseFixture} from './fixtures/golden-axe-v1.mjs';
import {LIMITED_PACK_SCHEMA} from '../functions/_mercenary_limited_pack.js';
import {prepareChickenEvent,chickenState,orderChicken} from '../functions/_chicken_event.js';
import {CHICKEN_KEY,CHICKEN_TICKET} from '../shared/chicken-event-v1.mjs';
import {armEuakValterOnce,verifyEuakValterOnce,OPERATION_KEY,ENTITLEMENT_KEY} from '../scripts/ops/euak-valter-chicken-once-20261011.mjs';

async function fixture(){
 const f=await baseFixture();for(const sql of LIMITED_PACK_SCHEMA)await f.pg.exec(sql);await prepareChickenEvent(f.pg);
 await f.pg.exec(`ALTER TABLE users ADD COLUMN nickname TEXT;ALTER TABLE users ADD COLUMN role TEXT;
  ALTER TABLE users ADD COLUMN card_shards BIGINT DEFAULT 0;ALTER TABLE users ADD COLUMN magic_crystals BIGINT DEFAULT 0;
  UPDATE users SET nickname='핑크빛유두',role='OWNER' WHERE id=1;
  INSERT INTO users(id,nickname,status,role,coin) VALUES(5010,'으악','ACTIVE','USER',123456);
  CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT);
  CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER);
  INSERT INTO user_mercenary_loadout_v1 VALUES(5010,'V-055');
  INSERT INTO user_mercenary_growth_v1 VALUES(5010,'V-055',10);
  INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-996',8,3);`);
 await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(5010,$1,0,0)',[CHICKEN_TICKET]);
 const settings={visible:true,enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),rewards:[{kind:'COIN',code:'COIN',quantity:100,chancePpm:1000000}]};
 await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({revision:'test-euak-chicken',settings}),CHICKEN_KEY]);
 for(const [key,value]of [['mercenary_limited_pack_v1',{settings:{stockLimits:{'V-996':8},mode:'ON'}}],['mercenary_limited_draw_policy_v1',{policy:{}}]])await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 let failure=null;
 const db={async query(sql,args=[]){
  if(sql.includes('current_database()'))return {rows:[{db:'cnine',recovery:false}]};
  if(sql.includes('to_char(CURRENT_TIMESTAMP'))return {rows:[{now:new Date(),kst:'2026-10-11'}]};
  if(failure&&sql.startsWith('INSERT INTO app_meta')&&args[0]===OPERATION_KEY)throw Error('injected receipt failure');
  return f.pg.query(sql,args);
 }};
 return {...f,db,fail:v=>{failure=v;},arm:options=>armEuakValterOnce(db,options),once:async()=>f.row('SELECT value FROM app_meta WHERE key=$1',[ENTITLEMENT_KEY])};
}

test('dry run rolls back; arm with zero tickets changes no ownership, inventory, stock or settings; retry is inert',async()=>{const f=await fixture();try{
 const dry=await f.arm();assert.equal(dry.committed,false);assert.equal(dry.remaining,1);assert.equal(dry.receipt.ticketsAtArm,0);assert.equal(await f.once(),undefined);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM admin_logs')).n,0);
 const applied=await f.arm({commit:true});assert.equal(applied.committed,true);assert.equal(applied.receipt.stock.issued,3);assert.equal(applied.receipt.noCardIssued,true);
 const before=await f.pg.query('SELECT * FROM app_meta ORDER BY key');assert.equal((await f.arm({commit:true})).replayed,true);assert.deepEqual(await f.pg.query('SELECT * FROM app_meta ORDER BY key'),before);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM admin_logs')).n,1);assert.equal((await f.row('SELECT COUNT(*)::int n FROM user_mercenary_cards_v1')).n,0);
 }finally{await f.close();}});

test('late operation receipt failure rolls back entitlement and audit together',async()=>{const f=await fixture();try{
 f.fail(true);await assert.rejects(f.arm({commit:true}),/injected receipt failure/);f.fail(false);
 assert.equal(await f.once(),undefined);assert.equal(await f.row('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]),undefined);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM admin_logs')).n,0);assert.equal((await f.arm({commit:true})).remaining,1);
 }finally{await f.close();}});

test('no ticket preserves entitlement; first valid order awards Valter once; consumed operation replay never rearms',async()=>{const f=await fixture();try{
 await f.arm({commit:true});const state=await chickenState(f.env,5010),body={requestId:crypto.randomUUID(),choice:'YANGNYEOM',revision:state.revision};
 await assert.rejects(orderChicken(f.env,5010,body),e=>e.code==='TICKET_REQUIRED');assert.equal(JSON.parse((await f.once()).value).status,'ARMED');
 await f.pg.query('UPDATE cnine_user_inventory SET quantity=2 WHERE user_id=5010 AND item_code=$1',[CHICKEN_TICKET]);
 const first=await orderChicken(f.env,5010,body);assert.equal(first.reward.code,'V-996');assert.equal(first.reward.quantity,1);assert.equal(first.reward.serial,4);assert.equal(first.tickets,1);
 assert.equal((await orderChicken(f.env,5010,body)).replayed,true);
 const replay=await f.arm({commit:true});assert.equal(replay.replayed,true);assert.equal(replay.remaining,0);assert.equal(replay.entitlement.status,'CONSUMED');
 const second=await orderChicken(f.env,5010,{...body,requestId:crypto.randomUUID()});assert.equal(second.reward.code,'COIN');assert.equal(second.grantKind,undefined);
 assert.equal((await verifyEuakValterOnce(f.db)).remaining,0);assert.equal((await f.row("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=5010 AND mercenary_code='V-996'")).total_copies,1);
 }finally{await f.close();}});

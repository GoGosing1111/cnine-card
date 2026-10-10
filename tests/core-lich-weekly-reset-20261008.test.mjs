import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {coreRaidWeeklyReward} from '../functions/_raid_core_protocol.js';
import {lichWeeklyReward} from '../functions/_raid_lich_rewards.js';
import {ensureLootShopSchema,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';
import {OPERATION_KEY,inspectRaidWeeklyReset,resetRaidWeeklyRewards,verifyRaidWeeklyReset} from '../scripts/ops/core-lich-weekly-reset-20261008.mjs';
const at=Date.parse('2026-10-08T10:00:00Z'),week='2026-10-05',prefix='raid_lich_weekly_v1:'+week+':';
async function dependencies(client){
 for(const sql of [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE'",
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS card_shards BIGINT DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS magic_crystals BIGINT DEFAULT 0',
  'CREATE TABLE IF NOT EXISTS admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
  'ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS id BIGSERIAL',
  'CREATE TABLE IF NOT EXISTS raid_lich_rooms_v1(room_id TEXT PRIMARY KEY,status TEXT,state_json TEXT,version INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS raid_core_reward_receipts_v2024(room_id TEXT,user_id BIGINT,request_id TEXT,status TEXT,response_json TEXT,updated_at TEXT,PRIMARY KEY(room_id,user_id))',
  'CREATE TABLE IF NOT EXISTS raid_core_weekly_rewards_v2112(user_id BIGINT,week_key TEXT,reward_count INTEGER,last_request_id TEXT,PRIMARY KEY(user_id,week_key))'
 ])await client.query(sql);
 for(const key of ['raid_core_protocol_settings_v2024','raid_core_choice_rewards_v1','loot_shop_policy_v1','raid_lich_settings_v1'])await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,'{}']);
}
async function fixture(t){
 const h=await lichLiveFixture({postgres:true});t.after(()=>h.close());await h.configure();
 await h.run("UPDATE cnine_user_inventory SET quantity=10,unseen_quantity=10 WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'");
 const client={query:(text,values=[])=>h.env.DB.client.query({text,values})};await dependencies(client);
 const q=async(s,v=[])=>(await client.query(s,v)).rows;
 return {...h,client,q};
}
async function snapshot(h){const out={};for(const table of ['users','cnine_user_inventory','inventory_logs','coin_logs','app_meta','admin_logs','raid_lich_rooms_v1','raid_core_reward_receipts_v2024','raid_core_weekly_rewards_v2112'])out[table]=await h.q('SELECT * FROM '+table+' ORDER BY 1,2');return out;}
async function seedCore(h){
 for(const [id,uid,json,updated] of [['current',1,{rewardWeekKey:week,coin:10},'2026-10-08 09:00:00'],['legacy-core',4,{coin:20,weeklyRewardReset:null},'2026-10-08 09:00:00'],['past',1,{rewardWeekKey:'2026-09-28',coin:30},'2026-10-01 09:00:00']])await h.q("INSERT INTO raid_core_reward_receipts_v2024(room_id,user_id,request_id,status,response_json,updated_at) VALUES($1,$2,$1,'COMPLETED',$3,$4)",[id,uid,JSON.stringify(json),updated]);
 await h.q("INSERT INTO raid_core_weekly_rewards_v2112 VALUES(1,$1,1,'current'),(4,$1,1,'legacy-core'),(1,'2026-09-28',3,'past')",[week]);
 await h.q("UPDATE users SET status='BANNED' WHERE id=4");
 await h.q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[prefix+4,JSON.stringify({count:2,roomId:'other',token:'old'})]);
 await h.q('INSERT INTO app_meta(key,value) VALUES($1,$2)',['raid_lich_weekly_v1:2026-09-28:1',JSON.stringify({count:3})]);
}
test('all accounts regain both quotas; historical payouts survive, old rooms never repay, new Lich clears cap at seven',async t=>{
 t.mock.method(Date,'now',()=>at);const h=await fixture(t);await seedCore(h);let old;
 for(let i=0;i<3;i++){old=await readyLichClear(h);assert.equal((await h.call('action',{body:old.body})).body.state.clearReward.granted,true);}
 const before=await snapshot(h),result=await resetRaidWeeklyRewards(h.client,{commit:true,at});assert.equal(result.totalAccounts,8);assert.equal(result.core.affectedUsers,2);assert.equal(result.lich.affectedUsers,4);
 for(const uid of [1,2,3,4,8]){assert.equal((await coreRaidWeeklyReward(h.env,uid,at)).used,0);assert.equal((await lichWeeklyReward(h.env,uid,at)).remaining,7);}
 const after=await snapshot(h);for(const table of ['users','cnine_user_inventory','inventory_logs','coin_logs','raid_lich_rooms_v1'])assert.deepEqual(after[table],before[table]);
 for(const key of ['raid_lich_weekly_v1:2026-09-28:1','raid_core_protocol_settings_v2024','raid_core_choice_rewards_v1','raid_lich_settings_v1','loot_shop_policy_v1'])assert.deepEqual(after.app_meta.find(r=>r.key===key),before.app_meta.find(r=>r.key===key));
 assert.equal((await h.q("SELECT reward_count FROM raid_core_weekly_rewards_v2112 WHERE week_key='2026-09-28'"))[0].reward_count,3);
 await h.call('action',{body:old.body});assert.equal((await lichWeeklyReward(h.env,1,at)).used,0);assert.deepEqual(await h.q('SELECT * FROM coin_logs ORDER BY 1,2'),before.coin_logs);
 await h.run("UPDATE cnine_user_inventory SET quantity=8 WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'");
 for(let i=0;i<8;i++){const next=await readyLichClear(h);const clear=await h.call('action',{body:next.body});assert.equal(clear.body.state.clearReward.status,i<7?'GRANTED':'WEEKLY_LIMIT');}
 assert.equal((await resetRaidWeeklyRewards(h.client,{commit:true,at})).replayed,true);assert.equal((await lichWeeklyReward(h.env,1,at)).used,7);assert.equal((await verifyRaidWeeklyReset(h.client)).status,'VERIFIED');
});
test('dry run and late write failures roll both resets back; active stale plans are invalidated without changing the battle',async t=>{
 t.mock.method(Date,'now',()=>at);const h=await fixture(t);await seedCore(h);const active=await readyLichClear(h),before=await snapshot(h);
 assert.equal((await resetRaidWeeklyRewards(h.client,{at})).committed,false);assert.deepEqual(await snapshot(h),before);
 for(const failure of ['UPDATE app_meta SET value=','INSERT INTO admin_logs','INSERT INTO app_meta(key,value,updated_at)']){
  const client={query(sql,args){if(sql.startsWith(failure))throw Error('injected reset failure');return h.client.query(sql,args);}};
  await assert.rejects(resetRaidWeeklyRewards(client,{commit:true,at}),/injected/);assert.deepEqual(await snapshot(h),before);
 }
 const saved=before.raid_lich_rooms_v1.find(r=>r.room_id===active.roomId);const result=await resetRaidWeeklyRewards(h.client,{commit:true,at});assert.equal(result.lich.invalidatedActivePlans,1);
 const current=(await h.q('SELECT * FROM raid_lich_rooms_v1 WHERE room_id=$1',[active.roomId]))[0];assert.equal(current.state_json,saved.state_json);assert.equal(Number(current.version),Number(saved.version)+1);
 assert.equal((await h.q('UPDATE raid_lich_rooms_v1 SET version=version+1 WHERE room_id=$1 AND version=$2 RETURNING room_id',[active.roomId,saved.version])).length,0);
 assert.equal((await h.call('action',{body:active.body})).body.state.clearReward.granted,true);
});
test('unexpected legacy Lich payment and wrong week fail without any reset',async t=>{
 t.mock.method(Date,'now',()=>at);const h=await fixture(t);await seedCore(h);
 await h.q("INSERT INTO raid_lich_rooms_v1(room_id,host_id,host_name,status,state_json,created_at,expires_at) VALUES('legacy',1,'old','CLEAR',$1,$2,$2)",[JSON.stringify({finishedAt:at,clearRewardSettlement:null}),at]);
 await h.q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reference_type,reference_id) VALUES(1,'PET_ESSENCE',5,5,'LICH_RAID_CLEAR','legacy')");
 const before=await snapshot(h);await assert.rejects(resetRaidWeeklyRewards(h.client,{commit:true,at}),/Legacy Lich/);assert.deepEqual(await snapshot(h),before);
 await assert.rejects(resetRaidWeeklyRewards(h.client,{commit:true,at:Date.parse('2026-10-12T00:00:00Z')}),/authorized/);assert.equal((await inspectRaidWeeklyReset(h.client,{at})).receipt,null);
});
test('real Core settlement grants three fresh base, choice and pig rewards after reset, with old-room replay preserved',async t=>{
 t.mock.method(Date,'now',()=>at);const f=await coreRewardFixture('postgres');t.after(()=>f.close());await dependencies(f.db);await ensureLootShopSchema(f.env);
 const policy=structuredClone(LOOT_SHOP_DEFAULTS);policy.rewardsEnabled=true;policy.sources.find(r=>r.code==='CORE_RAID').enabled=true;await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),LOOT_SHOP_KEY);
 const seed=async id=>{await f.run('INSERT INTO raid_core_rooms_v2024(room_id,room_code,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at) SELECT ?,?,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at FROM raid_core_rooms_v2024 WHERE room_id=?',id,id,f.roomId);await f.run('INSERT INTO raid_core_members_v2024(room_id,user_id) VALUES(?,1)',id);return f.setChoices([{rewardType:'MERCENARY',rewardRef:'V-021',quantity:1}],id);};
 let old;for(let i=0;i<3;i++){old=await seed('BEFORE-'+i);assert.equal((await f.claim(old)).status,200);}
 await resetRaidWeeklyRewards(f.db,{commit:true,at});assert.equal((await coreRaidWeeklyReward(f.env,1,at)).remaining,3);assert.equal((await f.claim(old)).body.replayed,true);
 const offers=[];for(let i=0;i<4;i++)offers.push(await seed('AFTER-'+i));
 for(let i=0;i<4;i++){const result=await f.claim(offers[i]);assert.equal(result.status,i<3?200:409);if(i<3)assert.equal(result.body.pigCoins,30);}
 assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),60000000000);assert.equal(Number((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')).balance),180);assert.equal(Number((await f.row("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-021'")).total_copies),6);
 assert.equal((await resetRaidWeeklyRewards(f.db,{commit:true,at})).replayed,true);assert.equal((await coreRaidWeeklyReward(f.env,1,at)).used,3);
});

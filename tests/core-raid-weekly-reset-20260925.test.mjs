import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {coreRaidWeeklyReward} from '../functions/_raid_core_protocol.js';
import {ensureLootShopSchema,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';
import {OPERATION_KEY,resetCoreWeeklyRewards,inspectCoreWeeklyReset} from '../scripts/ops/core-raid-weekly-reset-20260925.mjs';
const receipts='raid_core_reward_receipts_v2024',weekly='raid_core_weekly_rewards_v2112';
async function seedRoom(f,id,user=1){
  await f.run('INSERT INTO raid_core_rooms_v2024(room_id,room_code,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at) SELECT ?,?,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at FROM raid_core_rooms_v2024 WHERE room_id=?',id,id,f.roomId);
  await f.run('INSERT INTO raid_core_members_v2024(room_id,user_id) VALUES(?,?)',id,user);
  return f.setChoices([{rewardType:'MERCENARY',rewardRef:'V-021',quantity:1}],id,user);
}
async function setup(dialect){
  const f=await coreRewardFixture(dialect);await ensureLootShopSchema(f.env);
  const config=structuredClone(LOOT_SHOP_DEFAULTS);config.rewardsEnabled=true;config.sources.find(row=>row.code==='CORE_RAID').enabled=true;
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',LOOT_SHOP_KEY,JSON.stringify(config));
  if(dialect==='postgres')await f.db.exec('CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)');
  f.client={query:async(sql,args=[])=>{const result=await f.db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  return f;
}
async function resetFixture(f,dialect){
  if(dialect==='postgres')return resetCoreWeeklyRewards(f.client,{commit:true});
  const week=await coreRaidWeeklyReward(f.env,1),rows=(await f.DB.prepare(`SELECT room_id,user_id,response_json FROM ${receipts} WHERE status='COMPLETED'`).all()).results;
  await f.DB.batch([...rows.map(row=>f.DB.prepare(`UPDATE ${receipts} SET response_json=? WHERE room_id=? AND user_id=?`).bind(JSON.stringify({...JSON.parse(row.response_json),weeklyRewardReset:{operationKey:OPERATION_KEY,weekKey:week.weekKey}}),row.room_id,row.user_id)),f.DB.prepare(`UPDATE ${weekly} SET reward_count=0 WHERE week_key=?`).bind(week.weekKey)]);
}
for(const dialect of ['sqlite','postgres'])test(`${dialect}: reset permits exactly three fresh base/choice/pig rewards and never repays old rooms`,async t=>{
  t.mock.method(Date,'now',()=>Date.parse('2026-09-25T08:00:00Z'));
  const f=await setup(dialect);try{
    const old=[];for(let i=0;i<3;i++){old.push(await seedRoom(f,'OLD-'+i));const paid=await f.claim(old.at(-1));assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.pigCoins,30);}
    const colleague=await seedRoom(f,'COLLEAGUE',2);assert.equal((await f.claim(colleague,0,{},2)).status,200);
    assert.equal((await coreRaidWeeklyReward(f.env,1)).used,3);
    assert.equal((await f.open('OLD-2')).body.result.replayed,true);
    const savedSettings=(await f.admin()).body.policy;
    // Legacy completed rows without rewardWeekKey also belong to the reset.
    const row=await f.row(`SELECT response_json FROM ${receipts} WHERE room_id='OLD-0'`),legacy=JSON.parse(row.response_json);delete legacy.rewardWeekKey;await f.run(`UPDATE ${receipts} SET response_json=?,updated_at='2026-09-25 08:00:00' WHERE room_id='OLD-0'`,JSON.stringify(legacy));
    await resetFixture(f,dialect);
    for(const user of [1,2]){assert.equal((await coreRaidWeeklyReward(f.env,user)).used,0);assert.equal((await coreRaidWeeklyReward(f.env,user)).remaining,3);}
    const replay=await f.claim(old[0],2,{requestId:crypto.randomUUID()});assert.equal(replay.body.replayed,true);assert.equal((await coreRaidWeeklyReward(f.env,1)).used,0);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),30000000000);
    assert.equal(Number((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')).balance),90);
    const offers=[];for(let i=0;i<4;i++)offers.push(await seedRoom(f,'NEW-'+i));
    const first=await f.claim(offers[0]);assert.equal(first.body.weeklyReward.used,1);assert.equal(first.body.pigCoins,30);
    if(dialect==='postgres'){const repeated=await resetCoreWeeklyRewards(f.client,{commit:true});assert.equal(repeated.replayed,true);assert.equal((await coreRaidWeeklyReward(f.env,1)).used,1);}
    assert.equal((await f.claim(offers[1])).body.weeklyReward.used,2);
    const last=await Promise.all([f.claim(offers[2]),f.claim(offers[3])]);assert.equal(last.filter(r=>r.status===200).length,1,JSON.stringify(last));assert.equal(last.find(r=>r.status!==200).body.code,'CORE_RAID_WEEKLY_LIMIT');
    assert.equal((await coreRaidWeeklyReward(f.env,1)).used,3);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),60000000000);
    assert.equal(Number((await f.row('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1')).total_copies),6);
    assert.equal(Number((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')).balance),180);
    assert.equal(Number((await f.row("SELECT COUNT(*) n FROM pig_coin_ledger_v1 WHERE user_id=1 AND source='CORE_RAID'")).n),6);
    assert.equal(Number((await f.row(`SELECT COUNT(*) n FROM ${receipts} WHERE user_id=1 AND status='COMPLETED'`)).n),6);
    assert.deepEqual((await f.admin()).body.policy,savedSettings);
    assert.equal((await f.open(offers[3].roomId)).body.completed||false,last[1].status===200);
  }finally{await f.close();}
});

test('PostgreSQL operational reset is audited, rollback-safe, preserves settings and refuses a different week',async t=>{
  t.mock.method(Date,'now',()=>Date.parse('2026-09-25T08:00:00Z'));
  const f=await setup('postgres');try{
    const offer=await seedRoom(f,'AUDIT');await f.claim(offer);
    const before=await inspectCoreWeeklyReset(f.client);
    const dry=await resetCoreWeeklyRewards(f.client);assert.equal(dry.committed,false);assert.equal((await coreRaidWeeklyReward(f.env,1)).used,1);assert.equal((await inspectCoreWeeklyReset(f.client)).receipt,null);
    const failing={query:(sql,args)=>{if(sql.startsWith('UPDATE '+weekly))throw Error('Injected reset failure');return f.client.query(sql,args);}};
    await assert.rejects(resetCoreWeeklyRewards(failing,{commit:true}),/Injected reset failure/);
    assert.equal((await coreRaidWeeklyReward(f.env,1)).used,1);assert.equal((await inspectCoreWeeklyReset(f.client)).receipt,null);
    const paid=await resetCoreWeeklyRewards(f.client,{commit:true}),after=await inspectCoreWeeklyReset(f.client);
    assert.equal(paid.affectedUsers,1);assert.equal(paid.markedReceipts,1);assert.equal(after.cmsDigest,before.cmsDigest);assert.equal(after.unresetReceipts,0);
    const audit=await f.row('SELECT before_data,after_data FROM admin_logs');assert.equal(JSON.parse(audit.before_data).receipts.length,1);assert.equal(JSON.parse(audit.after_data).weeklyRewardLimit,3);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),10000000000);
    await assert.rejects(resetCoreWeeklyRewards(f.client,{commit:true,at:Date.parse('2026-09-28T00:00:00Z')}),/authorized/);
  }finally{await f.close();}
});

test('approved player and CMS flows use the same isolated renderer with refreshed caches',()=>{
  const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const file of ['js/core-protocol-raid-v1924.js','admin/core-raid-rewards-v1.mjs'])assert.match(read(file),/core-raid-reward-picker-v2\.mjs\?v=20260925-live/);
  assert.match(read('admin/core-raid-rewards-v1.mjs'),/showCoreRewardPicker\(\{preview:true/);
  assert.match(read('js/core-raid-reward-picker-v2.mjs'),/preview=false/);
  assert.match(read('js/core-raid-reward-picker-v2.mjs'),/주간 최대 3회/);
  assert.doesNotMatch(read('css/core-raid-reward-picker-v2.css'),/(^|\n)(?::root|body|button|\*)[,{]/);
  for(const file of ['index.html','admin/index.html','admin/raid-overhaul-v1293.js'])assert.match(read(file),/rewards=20260925-live/);
  assert.match(read('preview/core-raid-rewards-v2/picker.mjs'),/\/js\/core-raid-reward-picker-v2/);
});

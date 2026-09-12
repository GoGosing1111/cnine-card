import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {applyAvatarDropRate, avatarDropIncreasePercent, resolveAvatarDropRate, withAvatarDropScope} from '../functions/_avatar_drop.js';
import {applyAvatarCoinGain, ensureAvatarFoundation, grantAvatarOwnership} from '../functions/_avatar.js';
import {__avatarDropPoolTest} from '../functions/_drop_pool.js';
import {resolveMagicCrystalReward} from '../functions/_magic.js';

test('coin and drop bonuses reach 100% while chance and rounding boundaries remain valid',()=>{
  assert.deepEqual(applyAvatarCoinGain(1001,{effects:[{type:'COIN_GAIN_PERCENT',value:100}]}),{base:1001,percent:100,bonus:1001,total:2002});
  for(const [base,bonus,total] of [[10,50,15],[10,100,20],[75,100,100],[0,100,0],[100,100,100],[10,-1,10],[10,999,20],[10,50.9,15],[NaN,50,0],[10,NaN,10]]){
    assert.equal(applyAvatarDropRate(base,bonus).total,total);
  }
});

test('pool boosts only probability, retaining weights, quantities, roll counts and conditions',()=>{
  const {rollPool}=__avatarDropPoolTest;
  const entry={id:1,is_enabled:1,chance_percent:10,weight:1,reward_type:'INVENTORY_ITEM',reward_ref:'QA',reward_name:'QA',min_quantity:2,max_quantity:2,daily_limit:4};
  const pool={id:1,code:'QA',rolls:1,roll_mode:'INDEPENDENT'};
  assert.equal(rollPool(pool,[entry],{},()=>.12).length,0);
  const boosted=rollPool(pool,[entry],{avatarDropPercent:50},()=>.12);
  assert.equal(boosted.length,1);assert.equal(boosted[0].quantity,2);assert.equal(boosted[0].dailyLimit,4);
  assert.equal(rollPool(pool,[{...entry,chance_percent:0}],{avatarDropPercent:100},()=>0).length,0);
  assert.equal(rollPool(pool,[{...entry,is_enabled:0}],{avatarDropPercent:100},()=>0).length,0);
  const weighted={...pool,roll_mode:'WEIGHTED_ONE',no_drop_weight:16};
  const entries=[entry,{...entry,id:2,weight:3}]; // 20% total, reward ratio 1:3.
  assert.equal(rollPool(weighted,entries,{},()=>.3).length,0);
  assert.equal(rollPool(weighted,entries,{avatarDropPercent:100},()=>.3)[0].entryId,2);
  let counts=[0,0,0];
  for(let i=0;i<1000;i++){
    const reward=rollPool(weighted,entries,{avatarDropPercent:100},()=>(i+.5)/1000)[0];
    counts[reward?.entryId||0]++;
  }
  assert.deepEqual(counts,[600,100,300]);
  assert.deepEqual(rollPool({...weighted,no_drop_weight:0},entries,{},()=>.6),rollPool({...weighted,no_drop_weight:0},entries,{avatarDropPercent:100},()=>.6));
  assert.equal(rollPool({...pool,rolls:3},[{...entry,chance_percent:100}],{avatarDropPercent:100,rollsMultiplier:2},()=>.5).length,6);
});

test('multiple boosted rolls share the remaining daily allowance within one settlement',async()=>{
  const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[{entry_id:1,amount:1}]})})})}};
  const reward={entryId:1,quantity:2,dailyLimit:4};
  const result=await __avatarDropPoolTest.applyDailyLimits(env,1,[reward,reward,reward]);
  assert.deepEqual(result.map(r=>r.quantity),[2,1]);
});

test('PostgreSQL ownership, expiry and mode gates govern real reward rolls without changing caps or receipts',async t=>{
  const pg=new PGlite();let queries=[];
  try{
    await pg.exec(`
      CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
      CREATE FUNCTION sqlite_date(value text, modifier text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(value::timestamp + modifier::interval,'YYYY-MM-DD')$$;
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
      CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT,magic_crystals BIGINT DEFAULT 0);
      INSERT INTO users(id,nickname,role,coin) VALUES(1,'QA','USER',100),(2,'QA OWNER','OWNER',100);
      INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":1}',NULL);
      CREATE TABLE magic_crystal_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,created_at TEXT DEFAULT sqlite_now());
      CREATE TABLE magic_crystal_reward_receipts(receipt_id TEXT PRIMARY KEY,user_id BIGINT,source TEXT,reference_id TEXT,status TEXT,roll_value REAL,configured_chance REAL,configured_amount BIGINT,granted_amount BIGINT,response_json TEXT,error_message TEXT,created_at TEXT DEFAULT sqlite_now(),updated_at TEXT DEFAULT sqlite_now());
      INSERT INTO app_meta VALUES('safe_runtime_upgrade_v1205_magic_reward_foundation_gate','1',NULL);
    `);
    const client={async query(input){
      const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
      queries.push(sql);const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};
    }};
    const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
    await ensureAvatarFoundation(env);
    await pg.exec("UPDATE avatar_catalog_v1 SET is_active=1,is_public=1 WHERE code='HANBOK_DIIM'; INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES('HANBOK_DIIM',1,'DROP_RATE_PERCENT',50);");
    for(const id of [1,2]){
      await grantAvatarOwnership(env,{userId:id,avatarCode:'HANBOK_DIIM',sourceType:'EVENT',sourceRef:'qa-only'});
      await pg.query("INSERT INTO avatar_user_loadout_v1(user_id,avatar_code) VALUES($1,'HANBOK_DIIM')",[id]);
    }
    const fresh=()=>withAvatarDropScope(env);
    const percent=()=>avatarDropIncreasePercent(fresh(),1);
    await t.test('request-owned promises share queries but a later request sees CMS changes',async()=>{
      queries=[];const request=fresh();
      assert.deepEqual(await Promise.all(Array.from({length:10},()=>resolveAvatarDropRate(request,1,10))),Array.from({length:10},()=>({base:10,percent:50,total:15})));
      assert.equal(queries.length,2);
      await pg.exec("UPDATE avatar_effect_options_v1 SET effect_value=100 WHERE avatar_code='HANBOK_DIIM'");
      assert.equal(await percent(),100);
      assert.equal(await avatarDropIncreasePercent(request,1),50);
      queries=[];assert.equal((await resolveAvatarDropRate(fresh(),1,0)).total,0);assert.equal((await resolveAvatarDropRate(fresh(),1,100)).total,100);assert.equal(queries.length,0);
    });
    await t.test('only currently owned, unexpired, active, public and equipped avatars contribute',async()=>{
      for(const sql of ["UPDATE avatar_catalog_v1 SET is_active=0 WHERE code='HANBOK_DIIM'","UPDATE avatar_catalog_v1 SET is_public=0 WHERE code='HANBOK_DIIM'"]){
        await pg.exec(sql);assert.equal(await percent(),0);await pg.exec("UPDATE avatar_catalog_v1 SET is_active=1,is_public=1 WHERE code='HANBOK_DIIM'");
      }
      await pg.exec("UPDATE avatar_user_ownership_v1 SET expires_at='2000-01-01 00:00:00' WHERE user_id=1");assert.equal(await percent(),0);
      await pg.exec("UPDATE avatar_user_ownership_v1 SET expires_at='2999-01-01 00:00:00' WHERE user_id=1");assert.equal(await percent(),100);
      await pg.exec("UPDATE avatar_user_loadout_v1 SET avatar_code='SAENGBYUWANG' WHERE user_id=1");assert.equal(await percent(),0);
      await pg.exec("UPDATE avatar_user_loadout_v1 SET avatar_code='HANBOK_DIIM' WHERE user_id=1");
      assert.equal(await avatarDropIncreasePercent(fresh(),999),0);
    });
    await t.test('OFF denies everyone and TEST admits only the owner',async()=>{
      await pg.exec(`UPDATE app_meta SET value='{"mode":"OFF"}' WHERE key='avatar_settings_v1'`);assert.equal(await percent(),0);assert.equal(await avatarDropIncreasePercent(fresh(),2),0);
      await pg.exec(`UPDATE app_meta SET value='{"mode":"TEST"}' WHERE key='avatar_settings_v1'`);assert.equal(await percent(),0);assert.equal(await avatarDropIncreasePercent(fresh(),2),100);
      await pg.exec(`UPDATE app_meta SET value='{"mode":"ON"}' WHERE key='avatar_settings_v1'`);
    });
    await t.test('real crystal rewards use boosted chance and preserve daily cap and idempotent replay',async()=>{
      const oldRandom=Math.random;Math.random=()=>.15;
      try{
        const grant=referenceId=>resolveMagicCrystalReward(fresh(),{userId:1,source:'AVATAR_QA',referenceId,chance:10,amount:3,dailyLimit:5});
        const first=await grant('one');assert.equal(first.chance,20);assert.equal(first.amount,3);
        const second=await grant('two');assert.equal(second.amount,2);assert.equal(second.limited,true);
        assert.equal((await grant('three')).amount,0);
        await pg.exec("UPDATE avatar_user_ownership_v1 SET expires_at='2000-01-01 00:00:00' WHERE user_id=1");
        assert.deepEqual(await grant('one'),first);
        assert.equal((await grant('four')).chance,10);
        assert.equal(Number((await pg.query('SELECT magic_crystals FROM users WHERE id=1')).rows[0].magic_crystals),5);
        assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM magic_crystal_logs')).rows[0].n),2);
      }finally{Math.random=oldRandom;}
    });
  }finally{await pg.close();}
});

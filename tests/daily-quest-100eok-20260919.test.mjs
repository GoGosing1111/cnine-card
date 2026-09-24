import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('functions/api/[[path]].js');
const config=server.slice(server.indexOf('const DAILY_QUEST_MAX_REWARD_COIN='),server.indexOf('function extractWagoMemberNoFromAuthorRow'));
const adminRoute=server.slice(server.indexOf("    if(path==='admin/daily-quests')"),server.indexOf("    if(path==='admin/dashboard')"));
const claimRoute=server.slice(server.indexOf("    if((path==='playdk-daily-quest/claim'"),server.indexOf("    if(path==='messages')"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

test('CMS daily reward display preserves an explicitly saved zero',()=>{
  const assignment=read('admin/admin-v1276.js').split('\n').find(line=>line.includes("$('#dqPostRewardCoin').value="));
  assert.ok(assignment);
  for(const [settings,expected] of [[{postRewardCoin:0,rewardCoin:1200},0],[{postRewardCoin:10000000000},10000000000],[{},1200]]){
    const field={};vm.runInNewContext(assignment,{$:()=>field,s:settings});assert.equal(field.value,expected);
  }
});

test('CMS saves 100억 and blocks 100억+1 before a request',async()=>{
  const fields={saveDailyQuestBtn:{dataset:{}},refreshDailyQuestBtn:{dataset:{}},dqPostRewardCoin:{value:'10000000000'},dqEnabled:{value:'1'},dqPostEnabled:{value:'1'},dqRequiredPosts:{value:'15'},dqCooldown:{value:'20'},dqAdminTestAllowed:{value:'1'}};
  const requests=[],alerts=[],context={document:{readyState:'complete',getElementById:id=>fields[id]},api:async(path,options)=>requests.push({path,body:JSON.parse(options.body)}),alert:m=>alerts.push(m),setBusy:(button,busy)=>button.disabled=busy,loadDailyQuestAdmin:async()=>{}};context.window=context;
  vm.runInNewContext(read('admin/daily-quest-admin-v1270.js'),context);
  await fields.saveDailyQuestBtn.onclick();assert.equal(requests.length,1);assert.equal(requests[0].body.settings.postRewardCoin,10000000000);
  fields.dqPostRewardCoin.value='10000000001';await fields.saveDailyQuestBtn.onclick();assert.equal(requests.length,1);assert.match(alerts.at(-1),/10000000000/);
  assert.match(read('admin/index.html'),/id="dqPostRewardCoin"[^>]*max="10000000000"/);
  assert.match(read('admin/index.html'),/daily-quest-admin-v1270\.js\?[^"']*coinCap=100eok-20260919/);
});

test('PostgreSQL persists and pays 100억 once; OWNER and cap restrictions hold',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    CREATE TABLE users(id bigint PRIMARY KEY,coin bigint);
    INSERT INTO users VALUES(1,9000000000);
    CREATE TABLE user_second_verifications(user_id bigint,provider text,provider_user_id text,provider_name text,verified_at text);
    INSERT INTO user_second_verifications VALUES(1,'PLAYDK','test-uuid','tester','2026-09-19');
    CREATE TABLE wago_daily_post_progress_v2(user_id bigint,quest_date text,post_count bigint,post_ids_json text,last_checked_at text,PRIMARY KEY(user_id,quest_date));
    CREATE TABLE wago_daily_quest_claims(id bigserial PRIMARY KEY,user_id bigint,quest_date text,reward_coin bigint,post_count bigint,claimed_at text DEFAULT sqlite_now(),UNIQUE(user_id,quest_date));
    CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text);
  `);
  const original={enabled:true,postEnabled:true,requiredPosts:15,postRewardCoin:1000000000,rewardCoin:1000000000,boardSlugs:['skm'],adminTestAllowed:true};
  await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['playdk_daily_quest_settings_v1',JSON.stringify(original)]);
  const client={async query(input){const result=await pg.query(input.text,input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)},json=(data,status=200)=>Response.json(data,{status}),noop=async()=>{},readBody=r=>r.json();
  const admin=new AsyncFunction('path','request','env','requirePermission','readBody','writeAdminLog','json',config+adminRoute);
  const save=(amount,role='OWNER')=>admin('admin/daily-quests',new Request('https://qa.invalid/',{method:'PATCH',body:JSON.stringify({settings:{...original,postRewardCoin:amount}})}),env,async()=>({id:99,role}),readBody,noop,json);
  assert.equal((await save(10000000000,'ADMIN')).status,403);
  for(const amount of [10000000001,-1,1.5,'Infinity'])assert.equal((await save(amount)).status,400);
  const saved=await save(10000000000);assert.equal(saved.status,200);assert.equal((await saved.json()).settings.rewardCoin,10000000000);
  const claim=new AsyncFunction('path','request','env','authenticate','ensureWagoDailyPostProgressTable','ensureSecondVerificationFoundation','readBody','playdkConfigured','dailyQuestAdminExcluded','kstDate','inspectPlaydkDailyPosts','profile','json',config+claimRoute);
  const claimOnce=()=>claim('playdk-daily-quest/claim',new Request('https://qa.invalid/',{method:'POST',body:'{"questType":"POST"}'}),env,async()=>({id:1,role:'USER'}),noop,noop,readBody,()=>true,()=>false,()=> '2026-09-19',async()=>({ok:true,postCount:15,posts:[]}),async(_env,user)=>user,json);
  const first=await claimOnce();assert.equal(first.status,200);assert.equal((await first.json()).rewardCoin,10000000000);assert.equal((await claimOnce()).status,409);
  const stored=await pg.query('SELECT * FROM wago_daily_quest_claims');assert.equal(stored.rows.length,1);assert.equal(Number(stored.rows[0].reward_coin),10000000000);
  assert.equal(Number((await pg.query('SELECT coin FROM users')).rows[0].coin),19000000000);
  const logs=(await pg.query('SELECT * FROM coin_logs')).rows;assert.equal(logs.length,1);assert.equal(Number(logs[0].change_amount),10000000000);assert.equal(logs[0].reason,'PLAYDK_DAILY_QUEST');
});

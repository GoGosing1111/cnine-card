import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {retirePremiumCube,stripPremiumCube,RETIRED_STATE_TABLES} from '../scripts/ops/premium-cube-retirement-20261003.mjs';
import {cleanRaidSettingsV1293,raidInventoryGrantStatementsV1293,raidRewardPlanV1293,raidRewardDisplayV1293} from '../functions/_raid_overhaul.js';
import {WEEKLY_RAID_BOSSES_V1} from '../functions/_raid_weekly_bosses_v1.js';
import {normalizeStoredWeeklyRaidConfig,normalizeWeeklyRaidConfig} from '../functions/_raid_weekly_cms_v2141.js';
import {QUEST_REWARDS,validateQuestSettings,defaultQuestSettings} from '../functions/_quest_hub.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const api=read('functions/api/[[path]].js'),app=read('js/app.js');
function section(source,start,end){const i=source.indexOf(start),j=source.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,start);return source.slice(i,j);}

test('retired cube opening is rejected before a saved receipt or inventory debit; other fixed-grade openings remain',()=>{
 const use=section(api,"if(path==='inventory/use'","if(path==='draw'&&request.method==='POST')");
 const codes=use.match(/const usableCodes=\[([^;]+)\];/)[1];
 assert.doesNotMatch(codes,/PREMIUM_CUBE|CUBE_CODES/);assert.match(codes,/GUARANTEED_MA_PACK/);assert.match(codes,/GUARANTEED_LIMITED_PACK/);assert.match(codes,/RETIREMENT_REROLL_CODES/);
 assert.ok(use.indexOf('if(!usableCodes.includes(itemCode))')<use.indexOf('SELECT status,response_json FROM inventory_use_receipts'));
 assert.match(use,/if\(openCount!==1\)/);assert.doesNotMatch(use,/openPremiumCubeBulk|cubeSettings/);
});
test('FUR assistance and cube grants are absent from PVE, PVP, tower, captain, profile and pack transactions',()=>{
 for(const text of [api,read('functions/_captain.js')])assert.doesNotMatch(text,/grantBattleCube|grantWeeklyPremiumCube|premiumCubeWeeklyStatus|ensureFurFirstPity|user_fur_first_pity|furFirstAssist|drawOneWithPityAndFur|activeFurCardIds/);
 const draw=section(api,"if(path==='draw'&&request.method==='POST')","if(path==='raid/status')");
 assert.match(draw,/packPityCount\(env,user\.id,pack\.id\)/);assert.match(draw,/drawOneWithPityFromContext\(drawContext,pack,pity\.rate/);
 assert.match(draw,/count===100&&index%10===9\?pack\.guarantee_10/);assert.match(draw,/count===20\?pack\.guarantee_20/);
 assert.match(draw,/statements\.unshift\(\.\.\.drawCoinDebitStatements/);assert.match(draw,/INSERT INTO user_pack_pity/);
 assert.match(api,/function koreanWeekKey/);assert.match(api,/pve_rift_weekly/);
});
test('ordinary SSR pity preserves FUR base candidates and never reads user ownership',()=>{
 const fn=section(api,'function drawOneWithPityFromContext(',"async function drawNormalCardByRarity(");
 const source=fn.slice(0,fn.indexOf('\n}')+2),calls=[],context=vm.createContext({Math:{...Math,random:()=>.99},LIMITED_DRAW_PACKS:new Set(),drawNormalFromContext:(_ctx,_pack,grade)=>{calls.push(grade);return {id:grade,grade}},drawGradeHasCandidate:()=>true,weightedPick:rows=>rows.find(row=>row.rarity==='FUR'),applyCriticalRateBonus:rows=>rows,drawOneFromContext:()=>({id:'FUR',grade:'FUR'})});
 vm.runInContext(source+';globalThis.draw=drawOneWithPityFromContext;',context);
 const cfg={allowed:['SSR','FUR'],rateRows:[{rarity:'SSR',rate:90},{rarity:'FUR',rate:10}],limitedRate:0};
 assert.equal(context.draw(cfg,{id:'pickup'},50).grade,'FUR');assert.deepEqual(calls,['FUR']);
 assert.doesNotMatch(source,/owned|knownFur|first|assist/i);
});
test('retired cube rewards are dropped from legacy raid settings, saved plans and grant statements',async()=>{
 const raw={rewards:{participation:[{type:'COIN',amount:100}],clear:[],minionClear:[{type:'PREMIUM_CUBE',amount:2}],damageMilestones:[],rankRewards:[],rareDrops:[{type:'PREMIUM_CUBE',amount:1,chance:100}]}};
 const cfg=cleanRaidSettingsV1293(raw);assert.deepEqual(cfg.rewards.minionClear,[]);assert.deepEqual(cfg.rewards.rareDrops,[]);
 const plan=raidRewardPlanV1293({cfg,instanceId:1,userId:2,totalDamage:0,finalRank:1,cleared:false,minionsDefeated:1});assert.equal(plan.coin,100);assert.deepEqual(plan.inventoryRewards,[]);
 const stored=raidRewardDisplayV1293({inventoryRewards:[{itemCode:'PREMIUM_CUBE',amount:10},{itemCode:'MASTER_STAR',amount:2}],entries:[{type:'PREMIUM_CUBE',amount:1}],rareDrops:[{type:'PREMIUM_CUBE',amount:1}]});assert.deepEqual(stored.inventoryRewards,[{itemCode:'MASTER_STAR',amount:2}]);assert.deepEqual(stored.entries,[]);assert.deepEqual(stored.rareDrops,[]);
 const grant=await raidInventoryGrantStatementsV1293({DB:{prepare(){throw Error('retired reward must not query stock')}}},{userId:2,instanceId:1,inventoryRewards:[{itemCode:'PREMIUM_CUBE',amount:10}]});assert.deepEqual(grant,{statements:[],balances:[]});
 assert.doesNotMatch(JSON.stringify(WEEKLY_RAID_BOSSES_V1),/PREMIUM_CUBE/);
 const storedConfig=normalizeWeeklyRaidConfig();storedConfig.bosses.NAGATO.powerRating=4_000_000;storedConfig.bosses.NAGATO.rewards.rareDrops.push({type:'PREMIUM_CUBE',amount:1,chance:100});
 assert.throws(()=>normalizeWeeklyRaidConfig(storedConfig),/지원하지 않는/);
 const adapted=normalizeStoredWeeklyRaidConfig(JSON.stringify(storedConfig));assert.equal(adapted.bosses.NAGATO.powerRating,4_000_000);assert.doesNotMatch(JSON.stringify(adapted),/PREMIUM_CUBE/);
 assert.equal(QUEST_REWARDS.PREMIUM_CUBE,undefined);const quests=defaultQuestSettings();quests.quests.POST={enabled:true,rewardType:'PREMIUM_CUBE',rewardAmount:1};assert.throws(()=>validateQuestSettings(quests,defaultQuestSettings()));
});
test('client and CMS have no cube controls, acquisition animations or FUR assist settings',()=>{
 for(const text of [app,read('admin/admin-v1276.js'),read('admin/index.html'),read('index.html'),read('js/battle-v2-live.js'),read('js/captain.js'),read('js/tower-v1038.js')])assert.doesNotMatch(text,/weekly-premium-cube-status|showCubeDropAcquisition|furFirstManager|cubeManagementMount|data-view="cubes"|PREMIUM_CUBE|cube-drop-v1072|fur-first-pity-admin/);
});
test('stripping cube entries retains every other reward and does not mutate the input',()=>{
 const input={rewards:[{type:'PREMIUM_CUBE',amount:1},{type:'COIN',amount:8},{itemCode:'EQUIPMENT_SUPPLY_BOX',amount:2}],premiumCube:5,siegeParticipationCubeQuantity:10,inventory:{PREMIUM_CUBE:2,MASTER_STAR:7},quest:{enabled:true,rewardType:'PREMIUM_CUBE',rewardAmount:3},mode:'ON'};
 const before=structuredClone(input);assert.deepEqual(stripPremiumCube(input),{rewards:[{type:'COIN',amount:8},{itemCode:'EQUIPMENT_SUPPLY_BOX',amount:2}],inventory:{MASTER_STAR:7},quest:{enabled:false,rewardType:'COIN',rewardAmount:0},mode:'ON'});assert.deepEqual(input,before);
});
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',100),(2,'USER','ACTIVE',200);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT);INSERT INTO user_cards VALUES(2,'FUR_EXISTING',4);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT);INSERT INTO inventory_items VALUES('PREMIUM_CUBE','큐브'),('MASTER_STAR','별');
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,PRIMARY KEY(user_id,item_code));INSERT INTO cnine_user_inventory VALUES(1,'PREMIUM_CUBE',10,3),(2,'PREMIUM_CUBE',5,0),(2,'MASTER_STAR',999,9);
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT);INSERT INTO user_messages VALUES(11,2),(12,2),(13,2);
 CREATE TABLE user_message_rewards(id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);INSERT INTO user_message_rewards VALUES(21,11,2,'PREMIUM_CUBE',1,NULL),(22,12,2,'PREMIUM_CUBE',1,NULL),(23,12,2,'COIN',77,NULL),(24,13,2,'PREMIUM_CUBE',1,'past');
 CREATE TABLE coupons(id BIGINT PRIMARY KEY,reward_type TEXT,is_active BIGINT,deleted_at TEXT,deleted_by BIGINT,updated_at TEXT);INSERT INTO coupons VALUES(1,'PREMIUM_CUBE',1,NULL,NULL,NULL),(2,'COIN',1,NULL,NULL,NULL);
 CREATE TABLE alchemy_reward_pool_v1(reward_id TEXT PRIMARY KEY,reward_ref TEXT);INSERT INTO alchemy_reward_pool_v1 VALUES('CUBE','PREMIUM_CUBE'),('STAR','MASTER_STAR');
 CREATE TABLE territory_war_v3_rewards(round_id BIGINT,user_id BIGINT,premium_cube_quantity BIGINT,coin BIGINT,claimed_at TEXT);INSERT INTO territory_war_v3_rewards VALUES(1,2,10,700,NULL),(2,2,20,800,'past');
 CREATE TABLE inventory_use_receipts(request_id TEXT,item_code TEXT,status TEXT);INSERT INTO inventory_use_receipts VALUES('pending','PREMIUM_CUBE','PENDING'),('done','PREMIUM_CUBE','COMPLETED'),('other','MASTER_STAR','PENDING');
 CREATE TABLE auctions_v1553(id BIGINT,item_type TEXT,item_ref TEXT,status TEXT);
 CREATE TABLE raid_user_reward_v1293(instance_id BIGINT,user_id BIGINT,status TEXT,reward_json TEXT,PRIMARY KEY(instance_id,user_id));
 INSERT INTO raid_user_reward_v1293 VALUES(1,2,'READY','{"coin":100,"inventoryRewards":[{"itemCode":"PREMIUM_CUBE","amount":2},{"itemCode":"MASTER_STAR","amount":1}]}'),(2,2,'COMPLETED','{"inventoryRewards":[{"itemCode":"PREMIUM_CUBE","amount":2}]}');
 `);
 for(const table of RETIRED_STATE_TABLES)await pg.exec(`CREATE TABLE ${table}(user_id BIGINT);INSERT INTO ${table} VALUES(2)`);
 await pg.query("INSERT INTO app_meta VALUES('weekly_premium_cube_settings_v1129','{}',NULL),('fur_first_acquisition_settings_v1','{}',NULL),('icon_fusion_settings_v1','{\"enabled\":false}',NULL),('seal_battle_settings_v1','{\"mode\":\"ON\",\"rankRewards\":{\"tiers\":[{\"premiumCube\":1,\"coin\":8,\"equipmentBox\":2}]} }',NULL)");
 const client={async query(sql,parameters){const r=await pg.query(sql,parameters);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 return {pg,client,rows:async sql=>(await pg.query(sql)).rows};
}
test('PostgreSQL purge removes all owned cubes and assistance, preserves cards, coins, mixed messages and other items; retry is idempotent',async()=>{
 const f=await fixture();try{
  const backups=[],result=await retirePremiumCube(f.client,{backup:async value=>backups.push(value)});
  assert.equal(result.inventoryQuantity,15);assert.equal(result.inventoryRowsDeleted,2);assert.equal(backups.length,1);
  assert.deepEqual(backups[0].plan.messageRows.map(row=>row.id).sort(),[11,12]);assert.deepEqual(backups[0].plan.pendingUseReceipts.map(row=>row.request_id),['pending']);
  assert.deepEqual(await f.rows('SELECT * FROM cnine_user_inventory'),[{user_id:2,item_code:'MASTER_STAR',quantity:999,unseen_quantity:9}]);
  assert.deepEqual(await f.rows('SELECT coin FROM users ORDER BY id'),[{coin:100},{coin:200}]);assert.deepEqual(await f.rows('SELECT * FROM user_cards'),[{user_id:2,card_id:'FUR_EXISTING',quantity:4}]);
  assert.deepEqual((await f.rows('SELECT id FROM user_messages ORDER BY id')).map(x=>x.id),[12,13]);assert.deepEqual((await f.rows('SELECT id FROM user_message_rewards ORDER BY id')).map(x=>x.id),[23,24]);
  assert.equal((await f.rows('SELECT is_active FROM coupons WHERE id=1'))[0].is_active,0);assert.equal((await f.rows('SELECT is_active FROM coupons WHERE id=2'))[0].is_active,1);
  assert.deepEqual((await f.rows('SELECT premium_cube_quantity,coin FROM territory_war_v3_rewards ORDER BY round_id')),[{premium_cube_quantity:0,coin:700},{premium_cube_quantity:20,coin:800}]);
  for(const table of RETIRED_STATE_TABLES)assert.equal((await f.rows(`SELECT COUNT(*) count FROM ${table}`))[0].count,0);
  const plans=await f.rows('SELECT * FROM raid_user_reward_v1293 ORDER BY instance_id');assert.doesNotMatch(plans[0].reward_json,/PREMIUM_CUBE/);assert.match(plans[1].reward_json,/PREMIUM_CUBE/);
  const retry=await retirePremiumCube(f.client,{backup:async()=>{throw Error('no second backup or mutation')}});assert.equal(retry.replayed,true);assert.equal(retry.auditId,result.auditId);
  assert.equal((await f.rows('SELECT COUNT(*) count FROM inventory_logs'))[0].count,2);assert.equal((await f.rows('SELECT COUNT(*) count FROM admin_logs'))[0].count,1);
 }finally{await f.pg.close();}
});
test('backup failure or a late audit failure rolls back the entire purge, including truncated assistance tables',async()=>{
 const f=await fixture();try{
  await assert.rejects(retirePremiumCube(f.client,{backup:async()=>{throw Error('backup failed')}}),/backup failed/);
  const client={query:(sql,parameters)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit failed')):f.client.query(sql,parameters)};
  await assert.rejects(retirePremiumCube(client,{backup:async()=>{}}),/audit failed/);
  assert.equal(Number((await f.rows("SELECT SUM(quantity) count FROM cnine_user_inventory WHERE item_code='PREMIUM_CUBE'"))[0].count),15);
  for(const table of RETIRED_STATE_TABLES)assert.equal((await f.rows(`SELECT COUNT(*) count FROM ${table}`))[0].count,1);
  assert.equal((await f.rows('SELECT COUNT(*) count FROM inventory_logs'))[0].count,0);assert.equal((await f.rows('SELECT COUNT(*) count FROM user_message_rewards'))[0].count,4);
  const dry=await retirePremiumCube(f.client,{backup:async()=>{},dryRun:true});assert.equal(dry.inventoryQuantity,15);assert.equal(dry.dryRun,true);
  await assert.rejects(retirePremiumCube(f.client,{backup:async()=>{},adminId:2}),/OWNER/);
 }finally{await f.pg.close();}
});

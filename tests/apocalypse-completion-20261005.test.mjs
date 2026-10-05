import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: Apocalypse cannot clear on failure, refresh, exit or stale page; grants and clear commit once`,async t=>{
 const f=await apocalypseFixture({postgres});t.after(()=>f.close());const now=Date.now(),runToken=crypto.randomUUID();
 const act=(action,id,extra={},at=now)=>apocalypseChallengeAction(f.env,f.user,action,{requestId:id,runToken,...extra},at);
 const register=async(id,{won=true,plan=f.plan}={})=>{await reserveApocalypseBattle(f.env,{userId:1,requestId:id,runToken,monsterId:75},now);return registerApocalypseChallenge(f.env,{userId:1,requestId:id,runToken,monsterId:75,won,battleV2:f.battle,plan,log:{ids:['1','2','3','4','5'],playerPower:500,monsterPower:200}},now)};
 const money=async()=>Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin);
 const count=async(table,where='')=>Number((await f.p(`SELECT COUNT(*) n FROM ${table} ${where}`).first()).n);
 await assert.rejects(reserveApocalypseBattle(f.env,{userId:1,requestId:'no-page-token',monsterId:75}),e=>e.status===400);
 await register('fail-wrong-zone');const opened=await act('open','fail-wrong-zone');
 await assert.rejects(act('claim','fail-wrong-zone',{played:true},now+1000),/먼저/);
 assert.equal(await money(),100);assert.equal(await count('battle_logs'),0);assert.equal(await count('user_cards'),0);
 await assert.rejects(reserveApocalypseBattle(f.env,{userId:1,requestId:'fail-wrong-zone',runToken,monsterId:75},now),/이미/);
 await assert.rejects(apocalypseChallengeAction(f.env,{id:2},'open',{requestId:'fail-wrong-zone',runToken},now),e=>e.status===404);
 const wrong=await act('answer','fail-wrong-zone',{zone:(opened.safeZone+1)%3},now+500);
 assert.equal(wrong.status,'FAILED');assert.equal(wrong.settlement.result,'LOSE');assert.equal(wrong.settlement.reward,0);
 assert.equal(wrong.settlement.battleV2.result.final.A.length,6);assert.ok(wrong.settlement.battleV2.result.final.A.every(c=>c.hp===0));assert.equal(wrong.settlement.battleV2.result.winner,'B');
 assert.equal((await act('claim','fail-wrong-zone',{played:true},now+10000)).status,'FAILED');
 assert.equal((await act('answer','fail-wrong-zone',{zone:opened.safeZone},now+1000)).status,'FAILED');
 for(const [id,action,extra,at] of [['fail-no-input','answer',{zone:-1},6000],['fail-timeout','status',{},7001],['fail-refresh','abandon',{},500],['fail-exit','abandon',{},500]]){
  await register(id);await act('open',id);assert.equal((await act(action,id,extra,now+at)).status,'FAILED');
 }
 await register('fail-disconnected');let row=await act('open','fail-disconnected');await act('answer','fail-disconnected',{zone:row.safeZone},now+200);
 await assert.rejects(act('claim','fail-disconnected',{runToken:crypto.randomUUID(),played:true},now+10000),/화면/);
 assert.equal((await act('claim','fail-disconnected',{played:true},now+20201)).status,'FAILED');
 await register('refresh-unload-lost');row=await act('open','refresh-unload-lost');await act('answer','refresh-unload-lost',{zone:row.safeZone},now+200);
 await assert.rejects(act('abandon','refresh-unload-lost',{runToken:undefined},now+500),/시작한 화면/);
 await assert.rejects(act('claim','refresh-unload-lost',{runToken:undefined,played:true},now+10000),/화면/);
 assert.equal((await act('status','refresh-unload-lost',{},now+20201)).reason,'DISCONNECTED','lost unload still cannot clear from a refreshed page');
 assert.equal(await money(),100);assert.equal(await count('user_cards'),0);assert.equal(await count('inventory_logs'),0);assert.equal(await count('battle_logs',"WHERE result='WIN'"),0);

 await f.p('INSERT INTO user_cards(user_id,card_id,quantity) VALUES(1,?,1)','A').run();
 await register('success-atomic');row=await act('open','success-atomic');await act('answer','success-atomic',{zone:row.safeZone},now+500);
 await assert.rejects(act('claim','success-atomic',{played:true},now+6500),/끝난/);
 const early=await act('open','success-atomic',{},now+600);assert.equal(early.openedAt,now);
 await f.p("UPDATE inventory_items SET is_active=0 WHERE code='STARLIGHT_ARMOR_CORE'").run();
 await assert.rejects(act('claim','success-atomic',{played:true},now+8000));
 assert.equal(await money(),100);assert.equal(await count('inventory_logs'),0);assert.equal((await act('status','success-atomic')).status,'ANSWERED');
 await f.p("UPDATE inventory_items SET is_active=1 WHERE code='STARLIGHT_ARMOR_CORE'").run();
 f.setFailure('INSERT INTO battle_logs');await assert.rejects(act('claim','success-atomic',{played:true},now+8000),/INJECTED/);f.setFailure('');
 assert.equal(await money(),100);assert.equal(await count('account_rank_receipts_v1'),0);assert.equal(await count('inventory_logs'),0);
 const done=await act('claim','success-atomic',{played:true,result:'WIN',reward:999999},now+8000);
 assert.equal(done.status,'CLAIMED');assert.equal(done.settlement.reward,400);assert.equal(done.settlement.cardReward.shardGained,120);
 assert.equal(await money(),600);assert.equal(await count('account_rank_receipts_v1'),1);assert.equal(await count('battle_logs',"WHERE result='WIN'"),1);
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'").first()).quantity),301);
 assert.equal(Number((await f.p('SELECT magic_crystals FROM users WHERE id=1').first()).magic_crystals),2);
 for(const action of ['claim','status','abandon'])assert.equal((await act(action,'success-atomic',{played:true,runToken:undefined},now+30000)).status,'CLAIMED');
 assert.equal(await money(),600);assert.equal(await count('account_rank_receipts_v1'),1);

 await register('race-abandon');row=await act('open','race-abandon');await act('answer','race-abandon',{zone:row.safeZone},now+500);
 const batch=f.DB.batch;f.DB.batch=async function(list){f.DB.batch=batch;await act('abandon','race-abandon',{},now+8000);return batch.call(this,list)};
 assert.equal((await act('claim','race-abandon',{played:true},now+8000)).status,'FAILED');assert.equal(await money(),600);
 await register('success-race');row=await act('open','success-race');await act('answer','success-race',{zone:row.safeZone},now+500);
 f.DB.batch=async function(list){f.DB.batch=batch;await act('claim','success-race',{played:true},now+8000);return batch.call(this,list)};
 assert.equal((await act('claim','success-race',{played:true},now+8000)).status,'CLAIMED');assert.equal(await money(),1100);assert.equal(await count('account_rank_receipts_v1'),2);
 assert.equal(Number((await f.p('SELECT magic_crystals FROM users WHERE id=1').first()).magic_crystals),3,'daily cap reapplied at completion');
 await register('battle-defeat',{won:false,plan:{...f.plan,reward:0,bonuses:{coin:0,masterStars:0,mysticEnergy:0}}});row=await act('open','battle-defeat');await act('answer','battle-defeat',{zone:row.safeZone},now+500);
 assert.equal((await act('claim','battle-defeat',{played:true},now+8000)).settlement.result,'LOSE');assert.equal(await money(),1100);
});

test('manual Apocalypse defers every award and log; legacy/automatic calls cannot bypass required nonce',()=>{
 const source=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),fight=source.slice(source.indexOf("    if(path==='battle/fight'"),source.indexOf("    if(path==='tower/",source.indexOf("    if(path==='battle/fight'")));
 for(const name of ['settleRankedHunt','safeEquipmentDrop','rollBlackMiracleDrop','resolveMagicCrystalReward'])assert.ok(fight.includes("!deferred&&result==='WIN'?"+name));
 assert.ok(fight.includes('!deferred&&cardDropHit?grantBattleCard'));assert.ok(fight.includes("if(!deferred)deferWrite('battle_logs'"));assert.ok(fight.includes('deferred?null:discoverCowPortal'));assert.ok(fight.includes("result:deferred?'PENDING':result"));
 assert.ok(fight.indexOf('reserveApocalypseBattle')<fight.indexOf('consumePveEnergyForDifficulty'));assert.ok(fight.includes('APOCALYPSE_MANUAL_REQUIRED'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {validateRewardBonuses,rewardAmountWithBonus,rewardDropWithBonus,ZERO_REWARD_BONUSES} from '../shared/collection-bonuses-v1.mjs';
import {emptyTrophyBonuses,TROPHY_BONUSES_KEY,trophyBonusProjection} from '../shared/trophy-bonuses-v1.mjs';
import {PET_CMS_KEY,validatePetDefinition,emptyPetDraft,emptyPetCmsDocument} from '../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
import {readCollectionBonuses,collectionRewardCoin,withCollectionBonusScope} from '../functions/_collection_bonuses.js';
import {handleTrophyBonusCms} from '../functions/_trophy_bonus_cms.js';
import {handlePetCompanionCms} from '../functions/_pet_companion_cms.js';
import {accountRankAward,accountRankBenefits,rankCoin,MAX_RANK_TICKS} from '../functions/_account_rank.js';
import {resolveAvatarDropRate,withAvatarDropScope} from '../functions/_avatar_drop.js';
import {__avatarDropPoolTest,resolveUnifiedDrops} from '../functions/_drop_pool.js';
import {discoverCowPortalReady} from '../functions/_cow_room_portal.js';
import {raidRewardPlanV1293} from '../functions/_raid_overhaul.js';
import {CORE_REWARD_DEFAULT} from '../shared/core-raid-reward-policy-v1.mjs';
import {CORE_REWARD_KEY,openCoreRewardOffer,selectCoreReward,prepareCoreChoiceGrant} from '../functions/_core_raid_rewards.js';

test('neutral defaults, strict percentages, decimal sums, relative drop cap and exact safe-integer coin math',()=>{
  for(const row of emptyTrophyBonuses().trophies)assert.deepEqual(row.rewardBonuses,ZERO_REWARD_BONUSES);
  assert.deepEqual(validateRewardBonuses({dropPercent:0.01,accountXpPercent:1000,coinPercent:2.25}),{dropPercent:0.01,accountXpPercent:1000,coinPercent:2.25});
  for(const bad of [-1,1000.01,NaN,Infinity,'10',null,0.001])assert.throws(()=>validateRewardBonuses({...ZERO_REWARD_BONUSES,coinPercent:bad}));
  assert.throws(()=>validateRewardBonuses({...ZERO_REWARD_BONUSES,other:0}));
  assert.equal(rewardAmountWithBonus(101,2.25),103);assert.equal(rewardAmountWithBonus(Number.MAX_SAFE_INTEGER,100),Number.MAX_SAFE_INTEGER);assert.equal(rewardAmountWithBonus(98,50,100),100);
  assert.equal(rewardDropWithBonus(0,1000),0);assert.equal(rewardDropWithBonus(0.5,20),0.6);assert.equal(rewardDropWithBonus(90,1000),100);
  const doc=emptyTrophyBonuses();doc.trophies[0].rewardBonuses={dropPercent:10,accountXpPercent:10,coinPercent:10};
  assert.deepEqual(trophyBonusProjection(doc,{DUO_CHALLENGER:{count:999}}).totals,doc.trophies[0].rewardBonuses);
});

for(const postgres of [false,true]){
  const label=postgres?'Postgres':'SQLite';
  test(label+': only owned equipped live pet + earned distinct trophies; request scope refreshes on next request',async t=>{
    const f=await collectionFixture(t,{postgres}),env=withCollectionBonusScope(f.env);
    const first=await readCollectionBonuses(env,7);assert.deepEqual(first.totals,{dropPercent:17,accountXpPercent:35,coinPercent:50});assert.equal(first.trophies.find(t=>t.code==='RANKED_CHAMPION').count,2);
    assert.deepEqual((await readCollectionBonuses(f.env,8)).totals,ZERO_REWARD_BONUSES);
    await f.write('pet_loadout_v1:7',{revision:2,petCode:null,audit:[]});
    assert.deepEqual((await readCollectionBonuses(env,7)).totals,first.totals);
    assert.deepEqual((await readCollectionBonuses(withCollectionBonusScope(f.env),7)).totals,{dropPercent:7,accountXpPercent:15,coinPercent:20});
    await f.write('pet_loadout_v1:7',{revision:3,petCode:f.pet.code,audit:[]});await f.write('pet_collection_v1:7',{revision:2,pets:{[f.pet.code]:0}});
    assert.equal((await readCollectionBonuses(f.env,7)).totals.coinPercent,20);
    await f.write('pet_collection_v1:7',{revision:3,pets:{[f.pet.code]:10}});f.pet.liveEnabled=false;await f.write(PET_CMS_KEY,f.pets);
    assert.equal((await readCollectionBonuses(f.env,7)).totals.coinPercent,20);
    assert.equal(await collectionRewardCoin(f.env,7,1000,'MESSAGE'),1000);assert.equal(await collectionRewardCoin(f.env,7,1000,'REFUND'),1000);
  });
  test(label+': account XP, coins and percentage drops use one combined bonus; rollback/replay and level cap survive',async t=>{
    const f=await collectionFixture(t,{postgres}),env=withAvatarDropScope(f.env);
    const writes=await accountRankAward(env,7,'HUNT','bonus-one');await env.DB.batch(writes);
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),6480);
    await f.write('pet_loadout_v1:7',{revision:2,petCode:null,audit:[]});await env.DB.batch(await accountRankAward(f.env,7,'HUNT','bonus-one'));
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),6480,'old receipt never recalculates XP');
    const bad=await accountRankAward(env,7,'HUNT','rollback');f.fail('UPDATE account_rank_progress_v1');await assert.rejects(()=>env.DB.batch(bad));f.fail('');
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM account_rank_receipts_v1 WHERE event_id='rollback'").first()).n),0);
    assert.equal(rankCoin(1000,await accountRankBenefits(env,7,'HUNT')),1500);assert.equal(await collectionRewardCoin(env,7,1000,'RAID'),1500);
    assert.ok(Math.abs((await resolveAvatarDropRate(env,7,10,'PVE')).total-11.7)<1e-9);
    await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=7',MAX_RANK_TICKS-1).run();await env.DB.batch(await accountRankAward(env,7,'HUNT','max'));assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),MAX_RANK_TICKS);
  });
  test(label+': OWNER CMS validates all three values, saves once, rejects stale/forged requests and reads do not grant',async t=>{
    const f=await collectionFixture(t,{postgres});
    const call=async(path,body,role='OWNER')=>{
      const request=new Request('https://qa.test/api/'+path,{method:body?'PATCH':'GET',headers:{origin:'https://qa.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      return (path==='admin/pets'?handlePetCompanionCms:handleTrophyBonusCms)({path,request,env:f.env,deps:{requirePermission:async()=>({id:9,role}),authenticate:async()=>({id:7,role}),json:(v,status=200)=>Response.json(v,{status})}});
    };
    assert.equal((await call('admin/trophy-bonuses',null,'USER')).status,403);
    const body={expectedRevision:1,document:f.trophies,requestId:crypto.randomUUID()};body.document.trophies[0].rewardBonuses.coinPercent=12.5;
    assert.equal((await call('admin/trophy-bonuses',body)).status,200);assert.equal((await (await call('admin/trophy-bonuses',body)).json()).replayed,true);
    assert.equal((await call('admin/trophy-bonuses',{...body,requestId:crypto.randomUUID()})).status,409);
    const forged=structuredClone(body);forged.document.trophies[0].rewardBonuses.coinPercent=2000;assert.equal((await call('admin/trophy-bonuses',forged)).status,400);
    const changed=structuredClone(body);changed.document.trophies[0].rewardBonuses.coinPercent=20;assert.equal((await call('admin/trophy-bonuses',changed)).status,409);
    const petBody={expectedRevision:1,document:f.pets.document,requestId:crypto.randomUUID()};petBody.document.pets[0].rewardBonuses.accountXpPercent=12.34;
    assert.equal((await call('admin/pets',petBody)).status,200);assert.equal((await (await call('admin/pets',petBody)).json()).replayed,true);
    assert.deepEqual(validatePetDefinition(f.pet).buffs,[{type:'ATTACK_PERCENT',percent:10}]);
    const coin=await f.coin();await call('collection-bonuses');await call('admin/trophy-bonuses');assert.equal(await f.coin(),coin);
  });
  test(label+': portal bonus freezes rate on first roll; no retry reroll after unequip',async t=>{
    const f=await collectionFixture(t,{postgres});
    const event={battleMode:'PVE',sourceType:'HUNT',sourceRef:'bonus-portal',result:'WIN',isApocalypse:false};
    const first=await discoverCowPortalReady(f.env,f.user,event,{randomInt:()=>5500});assert.ok(first);assert.ok(Math.abs(first.ratePercent-.585)<1e-10);
    await f.write('pet_loadout_v1:7',{revision:2,petCode:null,audit:[]});
    assert.deepEqual(await discoverCowPortalReady(f.env,f.user,event,{randomInt:()=>999999}),first);
  });
  test(label+': boosted coin drops roll back with logs, replay unchanged and stop at the daily limit',async t=>{
    const f=await collectionFixture(t,{postgres}),before=await f.coin();
    if(postgres)await f.pg.exec("ALTER TABLE inventory_items ADD COLUMN updated_at TEXT; CREATE FUNCTION sqlite_date(text,text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char((CASE WHEN $1='now' THEN sqlite_now() ELSE $1 END)::timestamp+$2::interval,'YYYY-MM-DD')$$;");else await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
    await f.p("INSERT INTO unified_drop_pools_v1667(id,code,name) VALUES(5501,'BONUS_QA','보너스 검수')").run();
    await f.p("INSERT INTO unified_drop_entries_v1667(pool_id,reward_type,chance_percent,min_quantity,max_quantity,daily_limit) VALUES(5501,'COIN',100,100,100,225)").run();
    await f.p("INSERT INTO unified_drop_bindings_v1667(source_type,trigger_type,pool_id) VALUES('HUNT','WIN',5501)").run();
    const args={userId:7,requestId:'bonus-drop-first',sourceType:'HUNT',triggerType:'WIN'};
    f.fail('INSERT INTO coin_logs');await assert.rejects(()=>resolveUnifiedDrops(f.env,args),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.coin(),before);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM unified_drop_ledger_v1667 WHERE pool_id=5501').first()).n),0);
    const first=await resolveUnifiedDrops(f.env,args);assert.equal(first.rewards[0].quantity,150);assert.equal(await f.coin(),before+150);
    await f.write('pet_loadout_v1:7',{revision:2,petCode:null,audit:[]});
    const replay=await resolveUnifiedDrops(f.env,args);assert.equal(replay.replayed,true);assert.equal(replay.rewards[0].quantity,150);assert.equal(await f.coin(),before+150);
    const next=await resolveUnifiedDrops(f.env,{...args,requestId:'bonus-drop-second'});assert.equal(next.rewards[0].quantity,75);assert.equal(await f.coin(),before+225);
  });
  test(label+': core reward seals freeze boosted choices and minimum without repricing old offers',async t=>{
    const f=await collectionFixture(t,{postgres}),sql='CREATE TABLE raid_core_receipts_v2024(request_id TEXT PRIMARY KEY,room_id TEXT,user_id INTEGER,action_type TEXT,status TEXT,response_json TEXT,updated_at TEXT)';
    if(postgres)await f.env.DB.execSchema([sql]);else await f.p(sql).run();
    await f.write(CORE_REWARD_KEY,{...CORE_REWARD_DEFAULT,enabled:true,minimum:{rewardType:'COIN',quantity:100,weight:1},entries:[{rewardType:'COIN',rewardRef:'',quantity:100,weight:1,enabled:true}]});
    const offer=await openCoreRewardOffer(f.env,f.user,'core-bonus');assert.ok(!('choices' in offer));
    await f.write('pet_loadout_v1:7',{revision:2,petCode:null,audit:[]});assert.deepEqual(await openCoreRewardOffer(f.env,f.user,'core-bonus'),offer);
    const selected=await selectCoreReward(f.env,f.user,'core-bonus',{offerId:offer.offerId,selectedIndex:0});assert.equal(selected.minimum.quantity,150);
    const grant=await prepareCoreChoiceGrant(f.env,f.user,selected);assert.equal(grant.reward.quantity,150);await f.env.DB.batch(grant.statements);
    const old=await prepareCoreChoiceGrant(f.env,f.user,{...selected,choices:[{rewardType:'COIN',rewardRef:'',quantity:77}]});assert.equal(old.reward.quantity,77);
  });
}

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'}: duo bonus freezes on admission and survives failed settlement, unequip and retry`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.active();
  const art=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON'),pet={...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt,battleSprite:art.sourceArt,liveEnabled:true,rewardBonuses:{...ZERO_REWARD_BONUSES,coinPercent:50}};
  const write=(key,value)=>f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
  await write(PET_CMS_KEY,{revision:1,audit:[],document:{...emptyPetCmsDocument(),pets:[pet]}});
  await write('pet_collection_v1:2',{revision:1,pets:{[pet.code]:1}});await write('pet_loadout_v1:2',{revision:1,petCode:pet.code,audit:[]});
  const team=(await f.call('ranked-duo/status',{user:2})).data.team;
  for(const m of team.members)await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id=?',m.userId).run();
  const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data,body={requestId:'duo-bonus-frozen-retry-0001',matchToken:ticket.token};
  f.fail('INSERT INTO coin_logs');assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).status,500);f.fail('');
  assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),0);
  await write('pet_loadout_v1:2',{revision:2,petCode:null,audit:[]});f.advance(31000);
  const result=(await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data;assert.equal(result.rewardCoin,375000);
  assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data.rewardCoin,375000);
  assert.equal(Number((await f.p('SELECT coin n FROM users WHERE id=2').first()).n),375000);assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users WHERE id<>2').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});

test('weighted item odds consume only empty outcomes, preserve coin odds and one reward; quantities/daily budgets remain separate',()=>{
  const pool={id:1,code:'QA',roll_mode:'WEIGHTED_ONE',rolls:1,no_drop_weight:100};
  const entries=[{id:1,reward_type:'INVENTORY_ITEM',reward_ref:'A',weight:50,min_quantity:1,max_quantity:1,is_enabled:1},{id:2,reward_type:'COIN',weight:50,min_quantity:100,max_quantity:100,is_enabled:1}];
  const counts=context=>{const c={COIN:0,INVENTORY_ITEM:0,NONE:0};for(let i=0;i<200;i++){const r=__avatarDropPoolTest.rollPool(pool,entries,context,()=>i/200);assert.ok(r.length<=1);c[r[0]?.rewardType||'NONE']++;if(r[0]?.rewardType==='COIN')assert.equal(r[0].quantity,context.collectionBonuses?150:100);}return c;};
  assert.deepEqual(counts({}),{COIN:50,INVENTORY_ITEM:50,NONE:100});assert.deepEqual(counts({collectionBonuses:{dropPercent:100,coinPercent:50}}),{COIN:50,INVENTORY_ITEM:100,NONE:50});
  const independent={...pool,roll_mode:'INDEPENDENT'},rows=entries.map(e=>({...e,chance_percent:10}));
  assert.equal(__avatarDropPoolTest.rollPool(independent,rows,{collectionBonuses:{dropPercent:100,coinPercent:50}},()=>.15)[0].rewardType,'INVENTORY_ITEM');
});

test('fixed raid plan applies owned bonuses without a second roll; independent of the joint mercenary growth release',()=>{
  const args={instanceId:1,userId:7,totalDamage:100,finalRank:1,cleared:true,cfg:{rewards:{participation:[{type:'COIN',amount:100}],clear:[],minionClear:[],damageMilestones:[],rankRewards:[],rareDrops:[]},clearMysticEnergy:0}};
  assert.equal(raidRewardPlanV1293(args).coin,100);assert.equal(raidRewardPlanV1293({...args,collectionBonuses:{coinPercent:50}}).coin,150);
  const rare=raidRewardPlanV1293({...args,cfg:{...args.cfg,rewards:{...args.cfg.rewards,rareDrops:[{type:'MASTER_STAR',amount:1,chance:10}]}},collectionBonuses:{dropPercent:20}});assert.equal(rare.rareDrops[0].chance,12);
  assert.match(readFileSync(new URL('../shared/mercenary-level-v1.mjs',import.meta.url),'utf8'),/MERCENARY_LEVEL_RELEASE_ENABLED\s*=\s*true/);
});

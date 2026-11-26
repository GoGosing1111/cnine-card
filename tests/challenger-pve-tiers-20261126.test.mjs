import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {spendCoopEnergy} from '../functions/_cooperative_energy.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {additionalChallengerResources} from '../functions/_challenger_pve_resources.js';
import {claimRewardReveal} from '../functions/_reward_reveal.js';
import {challengerChoiceReward,CHALLENGER_REWARD_MULTIPLIER,inheritedCitadelDrops} from '../shared/challenger-pve-rewards-v1.mjs';
import {regionKillLoot,regionBossGuarantee} from '../shared/legion-region-loot-v1.mjs';
import {farmView,personalFarm} from '../functions/_legion_citadel_loot.js';
import {defaultCoopSettings,validateCoopCombat} from '../shared/cooperative-settings-v1.mjs';
import {defaultCoopRewards,freezeCoopReward,COOP_SETTINGS_KEY} from '../shared/cooperative-rewards-v1.mjs';
import {legionRegionDefaults,LEGION_REGIONS_KEY,RUIN_DIFFICULTY} from '../shared/legion-regions-v1.mjs';
import {legionCoinPolicy,createLegionCoins,earnedLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';
import {COOP_SPECIES,coopEnemyTraits} from '../shared/cooperative-roster-v3.mjs';
import {createCoopRoom} from '../functions/_cooperative_room.js';
import {regionBootstrap,validateRegionPolicy} from '../functions/_legion_regions.js';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {legionBalanceSnapshot,profiles} from '../scripts/measure-legion-regions-20261008.mjs';
import {transcendCombat} from '../scripts/ops/coop-transcend-20261102.mjs';
import {OPERATION,expandedPolicies,inspectPolicies,releaseChallengerTiers} from '../scripts/ops/challenger-pve-tiers-20261126.mjs';

const priorChoice='reward_reveal_policy_v1:COOP_TRANSCEND';
function sourceRows(){
  const coop={...defaultCoopSettings(),mode:'ON',encounterVersion:3,rewards:defaultCoopRewards()};
  coop.combat=transcendCombat(coop.combat);
  coop.rewards.enabled=true;
  coop.rewards.difficulties.push({id:'TRANSCEND',coin:400_000_000_000,masterStars:4000000,items:[{code:'EMPEROR_ENERGY',quantity:2},{code:'PET_SEAL_ORB',quantity:6},{code:'PET_POTENTIAL_POTION',quantity:2}]});
  const region={...legionRegionDefaults(),mode:'ON'};
  region.regions[0].fieldDrops={items:[],difficulties:region.difficulties.map(d=>({id:d.id,dropPercent:6.3,bossDropPercent:80,lifetimeSeconds:10}))};
  const choice={version:1,revision:9,enabled:true,minimum:{rewardType:'COIN',quantity:30_000_000_000,weight:1},entries:[]};
  return [[COOP_SETTINGS_KEY,coop],[LEGION_REGIONS_KEY,region],[priorChoice,choice]].map(([key,doc])=>({key,value:JSON.stringify(doc)}));
}

test('tier rollout preserves previous CMS rows and room snapshots and handles each new reward destination',()=>{
  const rows=sourceRows(),old=JSON.parse(rows[0].value),oldRegion=JSON.parse(rows[1].value);
  const room=combat=>createCoopRoom({id:'0000000011',clientId:'a'.repeat(20),user:{id:1,nickname:'검수'},seed:13,now:1000,difficulty:'ECLIPSE',combat});
  assert.throws(()=>room(old.combat),{code:'COOP_DIFFICULTY'});
  assert.equal(regionBootstrap(oldRegion,{}).difficulties.some(d=>d.id==='ruin'),false);
  const {coop,region,choice}=expandedPolicies(rows);
  assert.deepEqual(coop.combat.difficulties.slice(0,-1),old.combat.difficulties);
  assert.deepEqual(coop.rewards.difficulties.slice(0,-1),old.rewards.difficulties);
  assert.deepEqual(region.difficulties.slice(0,-1),oldRegion.difficulties);
  const captured=room(coop.combat);
  const budget=coop.combat.difficulties.at(-1).monsters.at(-1);
  assert.ok(budget.power>old.combat.difficulties.at(-1).monsters.at(-1).power);
  budget.power=100;
  assert.notEqual(captured.combat.difficulties.at(-1).monsters.at(-1).power,100);
  assert.throws(()=>validateCoopCombat(coop.combat),{code:'COOP_SETTINGS'});
  for(const spec of COOP_SPECIES)assert.ok(Object.values(coopEnemyTraits(spec,3,'ECLIPSE')).filter(v=>typeof v==='number').every(Number.isFinite));
  assert.equal(freezeCoopReward(coop,'ECLIPSE').coin,old.rewards.difficulties.at(-1).coin*2.5);
  assert.equal(freezeCoopReward(coop,'ECLIPSE').masterStars,10_000_000);
  assert.deepEqual({...choice,revision:9},JSON.parse(rows[2].value));
  assert.deepEqual(region.difficulties.at(-1).loot,{...oldRegion.difficulties.at(-1).loot,bossStones:50});
  assert.deepEqual(region.regions[0].fieldDrops.difficulties.at(-1),{...oldRegion.regions[0].fieldDrops.difficulties.at(-1),id:'ruin'});
  assert.equal(regionBootstrap(region,{}).difficulties.at(-1).id,'ruin');
  const missing=structuredClone(region);missing.regions[0].fieldDrops.difficulties.pop();
  assert.throws(()=>validateRegionPolicy(missing));
  assert.deepEqual(legionCoinPolicy('coast','ruin'),{...legionCoinPolicy('coast','calamity'),cap:75_000_000_000,paceDurationMs:300000});
  assert.throws(()=>legionCoinPolicy(null,'ruin'));
});

test('ruin spawns its boss on the new seven-minute schedule and the fourth Citadel tier fields a stronger commander',()=>{
  const run=createHuntSession({snapshot:legionBalanceSnapshot(profiles.at(-1)),regionId:'coast',difficulty:'ruin',seed:7919,regionDifficulty:{power:1000,bossPower:1000}});
  const boss=run.payload.battleV2.result.timeline.find(e=>e.finalBoss);
  assert.equal(boss.combatAtMs,RUIN_DIFFICULTY.huntDurationMs);
  assert.equal(run.payload.huntPolicy.limitMs-boss.combatAtMs,30000);
  const prior={drops:{normalPercent:6},tierDrops:{throne:{normalPercent:9}}};
  assert.deepEqual(inheritedCitadelDrops(prior,'crucible'),prior.tierDrops.throne);
  assert.deepEqual(inheritedCitadelDrops(prior,'keep'),prior.drops);
  const old=citadelEnemies('throne'),next=citadelEnemies('crucible');
  assert.ok(next.initial[0].maxHp>old.initial[0].maxHp);
  assert.ok(next.sustained.finalBoss.maxHp>old.sustained.finalBoss.maxHp);
  assert.equal(next.sustained.durationMs,old.sustained.durationMs);
});

test('activation checks current settings, rolls back partial writes and replays one release receipt',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at timestamptz);
    CREATE TABLE users(id integer,role text,status text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id integer,action_type text,target_type text,target_id text,before_data text,after_data text);`);
  for(const {key,value} of sourceRows())await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,value]);
  let failAudit=false;
  const db={query:async(sql,params)=>{
    if(failAudit&&sql.startsWith('INSERT INTO admin_logs'))throw Error('injected audit failure');
    const r=await pg.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};
  }};
  const base=await inspectPolicies(db),args={sourceCommit:'a'.repeat(40),expectedHash:base.hash};
  await assert.rejects(releaseChallengerTiers(db,{...args,expectedHash:'0'.repeat(64)}),/changed/);
  assert.equal((await releaseChallengerTiers(db,args)).dryRun,true);
  failAudit=true;await assert.rejects(releaseChallengerTiers(db,{...args,dryRun:false}),/injected/);
  assert.equal((await inspectPolicies(db)).hash,base.hash);
  failAudit=false;await releaseChallengerTiers(db,{...args,dryRun:false});
  const replay=await releaseChallengerTiers(db,{...args,dryRun:false});
  assert.equal(replay.replayed,true);
  assert.equal((await pg.query('SELECT key FROM app_meta WHERE key=$1',[OPERATION])).rows.length,1);
  assert.equal((await pg.query('SELECT id FROM admin_logs')).rows.length,1);
});

test('Eclipse posts multiplied base and choice amounts once to real reward ledgers',async t=>{
  const f=await legionFixture({postgres:true,inventoryBigInt:true});t.after(()=>f.close());
  const {coop,choice}=expandedPolicies(sourceRows()),at=Date.parse('2026-11-26T09:21:00Z');
  for(const [key,value] of [[COOP_SETTINGS_KEY,coop],['reward_reveal_policy_v1:COOP_ECLIPSE',choice]]){
    await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
  }
  for(const code of ['MASTER_STAR','EMPEROR_ENERGY','PET_SEAL_ORB','PET_POTENTIAL_POTION']){
    await f.DB.prepare('INSERT INTO inventory_items VALUES(?,?,?,?,1)').bind(code,code,'NORMAL','').run();
  }
  const room={id:'1123456789',minPlayers:2,creationRequest:'eclipse-entry-1',createdAt:at-1000,finishedAt:at+150000,
    status:'VICTORY',difficulty:'ECLIPSE',rewardPolicy:{...freezeCoopReward(coop,'ECLIPSE'),revealPolicy:choice},
    members:[1,2].map(id=>({id,result:'VICTORY'}))};
  await spendCoopEnergy(f.env,room,at);
  const rewards=await settleCoopRewards(f.env,room);
  assert.deepEqual(await settleCoopRewards(f.env,room),rewards);
  for(const id of [1,2]){
    assert.equal(rewards[id].coin,1_000_000_000_000);assert.equal(rewards[id].masterStars,10_000_000);
    assert.deepEqual(rewards[id].items.map(row=>row.quantity),[5,15,5]);
    const offerId=rewards[id].choiceOffer.offerId;
    const result=await claimRewardReveal(f.env,{id},{offerId,selectedIndex:0});
    assert.deepEqual(await claimRewardReveal(f.env,{id},{offerId,selectedIndex:0}),result);
    const wallet=await f.DB.prepare('SELECT coin FROM users WHERE id=?').bind(id).first();
    assert.equal(Number(wallet.coin),1_075_000_000_000);
    const rows=(await f.DB.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=?').bind(id).all()).results;
    assert.deepEqual(Object.fromEntries(rows.map(r=>[r.item_code,Number(r.quantity)])),{MASTER_STAR:10_000_000,EMPEROR_ENERGY:5,PET_SEAL_ORB:15,PET_POTENTIAL_POTION:5});
  }
});

test('stackable loot gets 2.5 times the quantity and retains rare gear, mercenary and chip rolls',()=>{
  const stone={code:'stone',type:'INVENTORY_ITEM',ref:'EQUIPMENT_POLISH_STONE',kind:'STONE'};
  const chip={code:'chip',type:'INVENTORY_ITEM',ref:'SKILL_CHIP_OCTA_SEEKER',enabled:true,weight:1,minQuantity:1,maxQuantity:1};
  const equipment={code:'gear',type:'EQUIPMENT',ref:'902',regionId:'coast',kind:'SET'};
  const policy={id:'ruin',regionId:'coast',items:[stone,equipment],regionLoot:{stonePercent:100,eliteStonePercent:100,eliteSetPercent:100,bossStones:50},
    fieldDrops:{items:[chip],dropChance:1,bossDropChance:1}};
  const event={boss:false,elite:true};
  for(const roll of [0.25,0.75]){
    const amounts=regionKillLoot(policy,event,()=>roll).map(i=>i.quantity);
    assert.deepEqual(amounts,[roll<.5?3:2,1,1]);
    const rare=['MERCENARY','EQUIPMENT','VEHICLE'].map(rewardType=>({rewardType,rewardRef:'123',quantity:1}));
    rare.push({rewardType:'INVENTORY_ITEM',rewardRef:chip.ref,quantity:1});
    for(const r of rare)assert.deepEqual(challengerChoiceReward(r,()=>roll),r);
    assert.equal(challengerChoiceReward({rewardType:'INVENTORY_ITEM',rewardRef:'SUIT_CORE_5',quantity:1},()=>roll).quantity,roll<.5?3:2);
    const pool={goods:[],armory:[],chance:0,resourceMultiplier:2.5,rates:{normalPercent:0,elitePercent:0,bossPercent:0,bossMultiplier:1},
      calamity:{guarantee:{item:stone,quantity:20},groups:[[],[],[[{item:chip,percent:100,min:1,max:1},{item:equipment,percent:100,min:1,max:1},{item:{type:'INVENTORY_ITEM',ref:'SUIT_CORE_4'},percent:100,min:1,max:1}]]]}};
    const farm=personalFarm(pool,[[300000,2]],true,()=>roll);
    const result=farmView(farm,420000,false).drops;
    assert.equal(result.find(r=>r.ref===stone.ref).quantity,50);
    assert.equal(result.find(r=>r.ref===chip.ref).quantity,1);
    assert.equal(result.find(r=>r.ref===equipment.ref).quantity,1);
    assert.equal(result.find(r=>r.ref==='SUIT_CORE_4').quantity,roll<.5?3:2);
    assert.deepEqual(farmView(farm,420000,false).drops,result);
  }
  assert.equal(regionBossGuarantee(policy).quantity,50);
  const baseline=createLegionCoins('coast','calamity'),ruin=createLegionCoins('coast','ruin');
  for(const [units,at] of [[50,15000],[1100,30000],[800,300000]]){
    assert.ok(Math.abs(earnedLegionCoins(ruin,units,at,395000)-earnedLegionCoins(baseline,units,at,300000)*CHALLENGER_REWARD_MULTIPLIER)<2.5);
  }
});

test('new CMS consumables inherit the bonus and permanent inventory equipment stays a single item',async t=>{
  const f=await legionFixture();t.after(()=>f.close());
  await f.DB.prepare('ALTER TABLE inventory_items ADD COLUMN category TEXT').run();
  for(const [code,category] of [['NEW_CMS_POTION','POTION'],['NEW_CMS_GEAR','MINE_TOOL']]){
    await f.DB.prepare('INSERT INTO inventory_items(code,name,rarity,image_url,is_active,category) VALUES(?,?,?,?,1,?)').bind(code,code,'NORMAL','',category).run();
  }
  const refs=await additionalChallengerResources(f.DB,['NEW_CMS_POTION','NEW_CMS_GEAR','NEW_CMS_POTION','SKILL_CHIP_OCTA_SEEKER']);
  assert.deepEqual(refs,['NEW_CMS_POTION']);
  const choice=ref=>challengerChoiceReward({rewardType:'INVENTORY_ITEM',rewardRef:ref,quantity:2},()=>0,refs).quantity;
  assert.equal(choice('NEW_CMS_POTION'),5);assert.equal(choice('NEW_CMS_GEAR'),2);
});

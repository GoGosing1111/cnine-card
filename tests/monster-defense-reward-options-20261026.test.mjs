import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDefenseSettings,validateDefenseSettings,DEFENSE_KEY} from '../shared/monster-defense-v1.mjs';
import {defaultDefenseReward,validateDefenseReward,hasDefenseReward,freezeDefenseReward} from '../shared/monster-defense-rewards-v1.mjs';
import {resolveDefenseRewardItems,settleDefenseRewards} from '../functions/_monster_defense_rewards.js';
import {defenseRewardFixture} from './helpers/monster-defense-reward-db.mjs';
const config=()=>{const s=defaultDefenseSettings();s.mode='ON';s.rewardsEnabled=true;s.difficulties.forEach((d,i)=>d.clearReward={coin:(i+1)*1e8,masterStars:i+1,items:[{code:'PET_ESSENCE',chancePercent:50,minQuantity:2,maxQuantity:5},{code:'EMPEROR_ENERGY',chancePercent:100,minQuantity:1,maxQuantity:3}]});return s;};
const room=(id='ABCDEF123456')=>({id,creationRequest:'defense-random-reward-qa',createdAt:100,startedAt:200,finishedAt:300,phase:'VICTORY',difficulty:'NORMAL',accountRoster:true,capacity:3,wave:30,coreHp:1,encounter:{waves:30,name:'보통'},players:[1,2,3].map(id=>({id:String(id)})),rewardParticipants:['1','2','3'],rewardPolicy:{...freezeDefenseReward(config(),'NORMAL'),rollSeed:'00112233445566778899aabbccddeeff'}});

test('legacy fixed quantities round-trip, while probability and inclusive ranges are strictly bounded',()=>{
 const old={coin:10,masterStars:1,items:[{code:'PET_ESSENCE',quantity:3}]};assert.deepEqual(validateDefenseReward(old),old);assert.deepEqual(validateDefenseSettings(config()),config());
 assert.deepEqual(validateDefenseReward({coin:10,masterStars:1,items:[{code:'PET_ESSENCE',chancePercent:100,minQuantity:3,maxQuantity:3}]}),old);
 for(const patch of [{chancePercent:-1},{chancePercent:100.01},{chancePercent:.001},{chancePercent:NaN},{minQuantity:0},{maxQuantity:1},{maxQuantity:100001},{minQuantity:2.5},{quantity:99}])assert.throws(()=>validateDefenseReward({...old,items:[{code:'PET_ESSENCE',chancePercent:50,minQuantity:2,maxQuantity:3,...patch}]}));
 assert.equal(hasDefenseReward({...defaultDefenseReward(),items:[{code:'PET_ESSENCE',chancePercent:0,minQuantity:1,maxQuantity:1}]}),false);
 const disabled=defaultDefenseSettings();disabled.rewardsEnabled=true;disabled.difficulties[0].clearReward.items=[{code:'PET_ESSENCE',chancePercent:0,minQuantity:1,maxQuantity:1}];assert.throws(()=>validateDefenseSettings(disabled));
 const full=config();full.difficulties.forEach(d=>d.clearReward.items=Array.from({length:20},(_,i)=>({code:'QA_'+String(i).padStart(77,'A'),chancePercent:.01,minQuantity:1,maxQuantity:100000})));
 assert(Buffer.byteLength(JSON.stringify({settings:validateDefenseSettings(full),requestId:crypto.randomUUID()}))<32768);
});

test('private frozen entropy yields stable independent player/item draws and all inclusive quantity values',async()=>{
 const r=room(),again=structuredClone(r),before=structuredClone(r);again.seed=999;again.rewardPolicy.items.reverse();
 const a=await resolveDefenseRewardItems(r,1),b=await resolveDefenseRewardItems(again,1);assert.deepEqual(a.items,[...b.items].reverse());assert.deepEqual(r,before);
 const quantities=new Set();let wins=0;const patterns=new Set();
 for(let uid=1;uid<=1000;uid++){const result=await resolveDefenseRewardItems(r,uid);const pet=result.rolls.find(i=>i.code==='PET_ESSENCE');wins+=Number(pet.quantity>0);if(pet.quantity)assert(pet.quantity>=2&&pet.quantity<=5);const energy=result.items.find(i=>i.code==='EMPEROR_ENERGY');quantities.add(energy.quantity);patterns.add(JSON.stringify(result.items));}
 assert(wins>440&&wins<560,`seeded 50% check ${wins}`);assert.deepEqual([...quantities].sort(),[1,2,3]);assert(patterns.size>6);
 const other=structuredClone(r);other.rewardPolicy.rollSeed='ffffffffffffffffffffffffffffffff';assert.notDeepEqual(await resolveDefenseRewardItems(other,1),a);
 const legacy={...r,rewardPolicy:{version:1,coin:0,masterStars:0,items:[{code:'PET_ESSENCE',quantity:4}]}};assert.deepEqual(await resolveDefenseRewardItems(legacy,1),{items:[{code:'PET_ESSENCE',quantity:4}],rolls:[]});
 const invalid=structuredClone(r);delete invalid.rewardPolicy.rollSeed;await assert.rejects(resolveDefenseRewardItems(invalid,1),/private defense reward seed/);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} probabilistic rewards commit atomically and retries preserve every player's first draw`,async()=>{
 const f=await defenseRewardFixture(postgres);try{
  await f.writeSettings(config());const r=room(),expected=new Map();for(const uid of [1,2,3])expected.set(uid,await resolveDefenseRewardItems(r,uid));
  const batch=f.env.DB.batch.bind(f.env.DB);let failed=false;
  f.env.DB.batch=async rows=>{if(!failed&&rows.some(s=>(s.sql||s.source)?.includes('INSERT INTO app_meta'))){failed=true;return batch([...rows.slice(0,5),f.env.DB.prepare('INSERT INTO missing_reward_failure_injection VALUES(1)'),...rows.slice(5)]);}return batch(rows);};
  await assert.rejects(settleDefenseRewards(f.env,r));assert(failed);assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1000);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),0);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  f.env.DB.batch=batch;const result=await settleDefenseRewards(f.env,r);
  for(const uid of [1,2,3]){assert.deepEqual(result[uid].items.map(({code,quantity})=>({code,quantity})),expected.get(uid).items);assert.deepEqual(result[uid].itemRolls.map(({name,...row})=>row),expected.get(uid).rolls);assert.equal(Number((await f.first(`SELECT coin FROM users WHERE id=${uid}`)).coin),1000+2e8);}
  const settingsBefore=(await f.first(`SELECT value FROM app_meta WHERE key='${DEFENSE_KEY}'`)).value;
  assert.deepEqual(await settleDefenseRewards(f.env,{...r,seed:12345}),result);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),3);
  assert.equal((await f.first(`SELECT value FROM app_meta WHERE key='${DEFENSE_KEY}'`)).value,settingsBefore);
  const receipt=JSON.parse((await f.first(`SELECT value FROM app_meta WHERE key='monster_defense_reward_receipt_v1:${r.id}'`)).value);assert.equal(receipt.rewardPolicy.rollSeed,r.rewardPolicy.rollSeed);assert(!JSON.stringify(result).includes('rollSeed'));
 }finally{await f.close();}
});

test('0% items never grant, all-miss clears still finalize once, and catalog lookups stay batched',async()=>{
 const f=await defenseRewardFixture();try{
  const s=config();s.difficulties.forEach(d=>d.clearReward={coin:0,masterStars:0,items:[{code:'PET_ESSENCE',chancePercent:.01,minQuantity:1,maxQuantity:1},{code:'EMPEROR_ENERGY',chancePercent:0,minQuantity:1,maxQuantity:3}]});await f.writeSettings(s);
  const r=room();r.rewardPolicy={...freezeDefenseReward(s,'NORMAL'),rollSeed:'00112233445566778899aabbccddeeff'};
  let reads=0,batches=0;const prepare=f.env.DB.prepare.bind(f.env.DB),batch=f.env.DB.batch.bind(f.env.DB);
  f.env.DB.prepare=sql=>{if(sql.includes('SELECT code,name,image_url FROM inventory_items'))reads++;return prepare(sql);};f.env.DB.batch=async rows=>{batches++;return batch(rows);};
  const result=await settleDefenseRewards(f.env,r);assert.equal(reads,1);assert.equal(batches,1);
  for(const reward of Object.values(result)){assert.equal(reward.status,'GRANTED');assert.deepEqual(reward.items,[]);assert(reward.itemRolls.every(i=>i.quantity===0));}
  assert.deepEqual(await settleDefenseRewards(f.env,r),result);assert.equal(reads,1);assert.equal(batches,1);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM inventory_logs')).n),0);
 }finally{await f.close();}
});

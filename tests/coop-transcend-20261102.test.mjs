import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import baseline from '../docs/qa/coop-transcend-20261102/baseline.json' with {type:'json'};
import {COOP_EXPANSION_OP as OP,COOP_EXPANSION_KEYS as KEYS,buildCoopExpansionPlan,applyCoopExpansion,inspectCoopExpansion,coopExpansionHash as hash} from '../scripts/ops/coop-transcend-20261102.mjs';
import {createCoopRoom,coopCommand} from '../functions/_cooperative_room.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {validateCoopCombat} from '../shared/cooperative-settings-v1.mjs';
import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {reviewSnapshot,REVIEW} from './helpers/tower-expansion-20261102.mjs';
import {currentSquads} from './helpers/cooperative-current.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {saveCoopFavorite,readCoopFavorites} from '../functions/_cooperative_favorites.js';
import {coopEnergy,coopEnergyKey,spendCoopEnergy,coopEntryKey} from '../functions/_cooperative_energy.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {freezeCoopReward} from '../shared/cooperative-rewards-v1.mjs';
import {prepareRewardRevealOffer,claimRewardReveal} from '../functions/_reward_reveal.js';
const before={mode:'ON',testUserIds:[],encounterVersion:3,revision:baseline.revision,combat:baseline.combat,rewards:baseline.rewards};
const rows=[{key:KEYS[0],value:JSON.stringify(before)},{key:KEYS[1],value:JSON.stringify(baseline.reveal)}];
const plan=buildCoopExpansionPlan(rows),at=Date.parse('2026-11-02T12:00:00+09:00');
const put=(f,key,value)=>f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
const read=async(f,key)=>{const row=await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null;};
const pairs=()=>currentSquads().map(s=>({...s,mercenary:undefined,mercenaries:reviewSnapshot().mercenaries,[REVIEW]:true}));
const client=id=>'transcend-qa-client-'+id;
function lobby({dual=false,legacy=false}={}){
 const room=createCoopRoom({id:'0123456789',user:{id:1,nickname:'선봉'},clientId:client(1),difficulty:dual?'TRANSCEND':'NORMAL',combat:dual?plan.settings.combat:baseline.combat,seed:19,now:at,...(dual?{[REVIEW]:true}:{})});
 if(legacy)delete room.minPlayers;
 return room;
}
const cmd=(room,id,kind,body={})=>coopCommand(room,{id,nickname:'분대 '+id},kind,{clientId:client(id),...body},at+1);
test('prepared tier preserves every previous combat/reward row and doubles only base extreme quantities',()=>{
 assert.equal(COMPANION_RELEASE.dualMercenaries,false);
 assert.deepEqual(plan.settings.combat.difficulties.slice(0,3),before.combat.difficulties);
 assert.deepEqual(plan.settings.rewards.difficulties.slice(0,3),before.rewards.difficulties);
 const old=before.rewards.difficulties[2],next=plan.settings.rewards.difficulties[3];
 assert.equal(next.coin,400000000000);assert.equal(next.coin,old.coin*2);assert.equal(next.masterStars,old.masterStars*2);
 assert.deepEqual(next.items,old.items.map(i=>({...i,quantity:i.quantity*2})));
 assert.deepEqual(plan.reveal.entries,baseline.reveal.entries);assert.deepEqual(plan.reveal.minimum,baseline.reveal.minimum);assert.equal(plan.choiceQuantityMultiplier,1);
 const invalid=structuredClone(plan.settings.combat);invalid.difficulties[2].monsters[0].hpPercent=1201;
 assert.throws(()=>validateCoopCombat(invalid));assert.equal(validateCoopCombat(plan.settings.combat).difficulties[3].monsters[4].hpPercent,7200);
 assert.throws(()=>createCoopRoom({id:'0123456789',user:{id:1},clientId:client(1),difficulty:'TRANSCEND',combat:plan.settings.combat,seed:1,now:at}),{code:'COOP_PREPARING'});
});
test('two-player departure requires both ready and the host; join locks at departure',()=>{
 const room=lobby({dual:true}),squads=pairs();
 assert.throws(()=>cmd(room,1,'start'),{code:'COOP_NOT_READY'});cmd(room,2,'join');
 cmd(room,1,'ready',{loadout:squads[0]});assert.equal(room.status,'LOBBY');
 assert.throws(()=>cmd(room,1,'start'),{code:'COOP_NOT_READY'});cmd(room,2,'ready',{loadout:squads[1]});
 assert.equal(room.status,'LOBBY');assert.throws(()=>cmd(room,2,'start'),{code:'COOP_HOST'});
 cmd(room,1,'start');assert.equal(room.status,'LOADING');
 const actors=[...room.payload.battleV2.teams.A.cards,...room.payload.battleV2.teams.A.mercenaries];assert.equal(actors.length,8);assert.equal(new Set(actors.map(a=>a.slot)).size,8);
 assert.throws(()=>cmd(room,3,'join'),{code:'COOP_STARTED'});
 cmd(room,1,'leave');assert.equal(room.members[0].result,'DEFEAT');assert.equal(room.withdrawals.length,1);
 const state=room.states.at(-1);assert.ok(state.A.filter(a=>a.ownerId===1).every(a=>a.hp===0));
});
test('three-player auto departure and old serialized room minimum remain intact; two players also work with one mercenary',()=>{
 for(const legacy of [false,true]){
  const room=lobby({legacy}),squads=coopSquads();cmd(room,2,'join');
  for(const id of [1,2])cmd(room,id,'ready',{loadout:squads[id-1]});assert.equal(room.status,'LOBBY');
  if(legacy)assert.throws(()=>cmd(room,1,'start'),{code:'COOP_NOT_READY'});
  cmd(room,3,'join');cmd(room,3,'ready',{loadout:squads[2]});assert.equal(room.status,'LOADING');assert.equal(room.payload.battleV2.teams.A.cards.length+room.payload.battleV2.teams.A.mercenaries.length,9);
 }
 const room=lobby(),squads=coopSquads();cmd(room,2,'join');for(const id of [1,2])cmd(room,id,'ready',{loadout:squads[id-1]});cmd(room,1,'start');assert.equal(room.payload.battleV2.teams.A.cards.length+room.payload.battleV2.teams.A.mercenaries.length,6);
});
test('upper-tier HP is applied beyond generic 1200% cap; previous tiers stay byte-identical',()=>{
 const squads=pairs(),combat=structuredClone(plan.settings.combat),options={squads,difficulty:'TRANSCEND',seed:31,[REVIEW]:true,combat};
 const high=createCooperativeBattle(options);combat.difficulties[3].monsters.forEach(m=>m.hpPercent=1200);const low=createCooperativeBattle(options);
 high.payload.cooperativeEncounter.instances.forEach((m,i)=>assert.equal(m.maxHp,Math.round(low.payload.cooperativeEncounter.instances[i].maxHp*plan.settings.combat.difficulties[3].monsters[i].hpPercent/1200)));
 for(const difficulty of ['NORMAL','HARD','EXTREME'])assert.deepEqual(createCooperativeBattle({...options,difficulty,combat:plan.settings.combat}),createCooperativeBattle({...options,difficulty,combat:before.combat}));
 assert.throws(()=>createCooperativeBattle({...options,squads:squads.slice(0,1)}));
});
test('favorites persist per account/type, stay idempotent, require ownership and cap each type',async()=>{
 const f=await legionFixture();let owns=true;
 const save=(user,kind,id,favorite=true,origin='https://game.test')=>saveCoopFavorite({request:new Request('https://game.test/api/coop/favorites',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({kind,id,favorite})}),env:f.env,user,deps:f.deps,owned:async()=>owns});
 try{
  for(let i=0;i<2;i++){await save(f.owner,'card','CN-TEST');await save(f.owner,'mercenary','V-021');}
  assert.deepEqual(await readCoopFavorites(f.env,f.owner),{cards:['CN-TEST'],mercenaries:['V-021']});
  assert.deepEqual(await readCoopFavorites(f.env,f.player),{cards:[],mercenaries:[]});
  await assert.rejects(save(f.owner,'card','x',true,'https://evil.test'),{status:403});
  await assert.rejects(save(f.owner,'__proto__','x'),{status:400});
  owns=false;await assert.rejects(save(f.owner,'card','unowned'),{status:403});await save(f.owner,'card','CN-TEST',false);
  owns=true;for(let i=0;i<100;i++)await save(f.owner,'card','card-'+i);
  await assert.rejects(save(f.owner,'card','overflow'),{status:400});await save(f.owner,'card','card-0');
  assert.equal((await readCoopFavorites(f.env,f.owner)).cards.length,100);
 }finally{await f.close();}
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} two-player energy, doubled base and unchanged choice settlement and rollback are atomic and replay safe`,async()=>{
 const f=await legionFixture({postgres,inventoryBigInt:true});const settings=structuredClone(plan.settings),reveal={...plan.reveal,entries:[],minimumWeight:100};
 const room={id:'1123456789',minPlayers:2,creationRequest:'transcend-entry-1',createdAt:at-1000,finishedAt:at+10000,status:'VICTORY',difficulty:'TRANSCEND',rewardPolicy:{...freezeCoopReward(settings,'TRANSCEND'),revealPolicy:reveal},members:[1,2].map(id=>({id,result:'VICTORY'}))};
 try{
  await f.DB.prepare("INSERT INTO users(id,nickname) VALUES(3,'미참가자')").run();
  for(const code of ['MASTER_STAR',...settings.rewards.difficulties[3].items.map(i=>i.code)])await f.DB.prepare('INSERT INTO inventory_items VALUES(?,?,?,?,1)').bind(code,code,'NORMAL','').run();
  await put(f,KEYS[0],settings);await put(f,KEYS[2],reveal);
  await put(f,coopEnergyKey(2),{version:1,current:0,updatedAt:at});
  await assert.rejects(spendCoopEnergy(f.env,room,at),{code:'COOP_ENERGY_EMPTY'});assert.equal((await coopEnergy(f.env,1,at)).current,3);assert.equal(await read(f,coopEntryKey(room.id)),null);
  await put(f,coopEnergyKey(2),{version:1,current:3,updatedAt:at});
  f.fail('UPDATE app_meta SET value');await assert.rejects(spendCoopEnergy(f.env,room,at));f.fail('');assert.equal((await coopEnergy(f.env,1,at)).current,3);
  const entry=await spendCoopEnergy(f.env,room,at);assert.deepEqual(await spendCoopEnergy(f.env,room,at+1),entry);
  f.fail('INSERT INTO inventory_logs');await assert.rejects(settleCoopRewards(f.env,room));f.fail('');
  assert.equal(Number((await f.DB.prepare('SELECT coin FROM users WHERE id=1').first()).coin),0);assert.equal(await read(f,'coop_reward_receipt_v1:'+room.id),null);
  const rewards=await settleCoopRewards(f.env,room);assert.deepEqual(await settleCoopRewards(f.env,room),rewards);assert.deepEqual(Object.keys(rewards),['1','2']);
  for(const id of [1,2]){
   assert.equal((await coopEnergy(f.env,id,at)).current,2);assert.equal(rewards[id].coin,400000000000);
   const offerId=rewards[id].choiceOffer.offerId,saved=await read(f,`reward_reveal_offer_v1:${id}:${offerId}`);assert.equal(saved.minimum.quantity,30000000000);assert.ok(saved.choices.every(c=>c.quantity===30000000000));
   const result=await claimRewardReveal(f.env,{id},{offerId,selectedIndex:0});assert.deepEqual(await claimRewardReveal(f.env,{id},{offerId,selectedIndex:0}),result);
   assert.equal(Number((await f.DB.prepare('SELECT coin FROM users WHERE id=?').bind(id).first()).coin),430000000000);
   for(const item of [{code:'MASTER_STAR',quantity:4000000},...settings.rewards.difficulties[3].items])assert.equal(Number((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(id,item.code).first()).quantity),item.quantity);
  }
  assert.equal(await read(f,coopEnergyKey(3)),null);assert.equal(Number((await f.DB.prepare('SELECT coin FROM users WHERE id=3').first()).coin),0);
  await assert.rejects(spendCoopEnergy(f.env,{...room,minPlayers:undefined,id:'legacy0001'},at),/Invalid/);
 }finally{await f.close();}
});
test('choice draws and fallback match extreme for every weighted outcome, including single mercenary copies',async()=>{
 const f=await legionFixture(),random=crypto.getRandomValues;
 try{
  const total=plan.reveal.minimum.weight+plan.reveal.entries.filter(e=>e.enabled).reduce((sum,e)=>sum+e.weight,0);
  const observed=new Set();
  for(let value=0;value<total;value++){
   crypto.getRandomValues=a=>{a.fill(value);return a;};
   const saved=[];
   for(const [content,policy] of [['COOP_EXTREME',baseline.reveal],['COOP_TRANSCEND',plan.reveal]]){
    const result=prepareRewardRevealOffer(f.env,{enabled:true,content,policy},{userId:1,roomId:'1123456789',baseReward:{},quota:{},finishedAt:at});
    await f.DB.batch(result.statements);saved.push(await read(f,'reward_reveal_offer_v1:1:'+result.offer.offerId));
   }
   assert.deepEqual(saved[1].choices,saved[0].choices);assert.deepEqual(saved[1].minimum,saved[0].minimum);
   for(const choice of saved[1].choices){observed.add(choice.rewardType);if(choice.rewardType==='MERCENARY')assert.equal(choice.quantity,1);}
  }
  assert.ok(observed.has('MERCENARY'));assert.ok(observed.has('INVENTORY_ITEM'));assert.ok(observed.has('COIN'));
 }finally{crypto.getRandomValues=random;await f.close();}
});
test('activation dry run, every partial failure, stale hashes and SELECT-only replay preserve existing data',async()=>{
 const pg=new PGlite();let failAt='',writes=0;const queries=[];
 const db={query:async(q,args=[])=>{queries.push(q);if(/^(INSERT|UPDATE)/.test(q)){writes++;if(failAt==='write-'+writes)throw Error('INJECTED_FAILURE');}const r=await pg.query(q,args);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 try{
  await pg.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',777);CREATE TABLE admin_logs(id SERIAL PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);");
  for(const row of rows)await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[row.key,row.value]);
  const inspected=await inspectCoopExpansion(db),opts={expectedHash:inspected.hash,expectedPlanHash:hash(plan),sourceCommit:'f1cdcaa0c469a133c39374b7ffc7a534afa9ee55'};
  await assert.rejects(applyCoopExpansion(db,{...opts,dryRun:false}),/authorization/);
  assert.equal((await applyCoopExpansion(db,opts)).dryRun,true);assert.equal((await inspectCoopExpansion(db)).hash,inspected.hash);
  for(let i=1;i<=4;i++){failAt='write-'+i;writes=0;await assert.rejects(applyCoopExpansion(db,opts),/INJECTED_FAILURE/);failAt='';assert.equal((await inspectCoopExpansion(db)).hash,inspected.hash);assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,0);}
  await assert.rejects(applyCoopExpansion(db,{...opts,expectedHash:'0'.repeat(64)}),/CMS changed/);
  await assert.rejects(applyCoopExpansion(db,{...opts,expectedPlanHash:hash({...plan,choiceQuantityMultiplier:2})}),/Prepared plan changed/);
  const applied=await applyCoopExpansion(db,{...opts,dryRun:false,authorization:OP,dualMercenariesReleased:true});assert.equal(applied.receipt.revision,14);assert.equal(applied.receipt.choiceQuantityMultiplier,1);
  await pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({...plan.settings,revision:99}),KEYS[0]]);
  queries.length=0;const replay=await applyCoopExpansion(db,opts);assert.equal(replay.replayed,true);assert.ok(queries.every(q=>q.startsWith('SELECT')));
  assert.equal(JSON.parse((await pg.query('SELECT value FROM app_meta WHERE key=$1',[KEYS[0]])).rows[0].value).revision,99);assert.equal(Number((await pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin),777);
 }finally{await pg.close();}
});

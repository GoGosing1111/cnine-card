import test from 'node:test';
import assert from 'node:assert/strict';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {petGrowthState,executePetGrowth,handlePetGrowth} from '../functions/_pet_growth.js';
import {PET_GROWTH_COSTS,PET_GROWTH_CAPS,initialPetGrowth,petGrowthCoinBonus,savedPetGrowth} from '../shared/pet-growth-live-v2.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {applyPetOpeningBuff} from '../shared/companion-opening-v1.mjs';
import {equipmentHitMultiplier} from '../shared/equipment-combat-growth-v1.mjs';
import {readCollectionBonuses} from '../functions/_collection_bonuses.js';
const user={id:2},code='PET-PEPEGU';
const command=(command,revision,extra={})=>({command,expectedRevision:revision,requestId:crypto.randomUUID(),...extra});
test('existing effects descending order determines all six species caps',()=>{
 assert.deepEqual(['PET-PEPEGU','PET-HEUKGU','PET-CRIMSON-DEMON','PET-DAENGSORYONG','PET-MALTESE-DIIM','PET-HEADSET-SHIBA'].map(code=>PET_GROWTH_CAPS[code]),['SSS','SS','S','A','B','C']);
 assert.equal(Object.keys(PET_GROWTH_CAPS).length,25);assert.equal(PET_GROWTH_CAPS['PET-BAZZI-BONGSOON'],'SSS');assert.equal(PET_GROWTH_CAPS['PET-JJANGGU-HEEYA'],'SS');
});
async function fixture(t){
 const f=await petLiveFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN coin BIGINT NOT NULL DEFAULT 90000000000000007; CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT); INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'MASTER_STAR',1000000000,1000000000)");
 const cms=await f.record('pet_cms_preparation_v1');cms.document.pets.push({...f.pet,code,name:'흑구',buffs:[{type:'ATTACK_PERCENT',percent:50}]});await f.write('pet_cms_preparation_v1',cms);
 await f.write('pet_collection_v1:2',{revision:1,pets:{[code]:2,'PET-BONGSOON':1}});
 return {...f,state:()=>petGrowthState(f.env,2),run:(body,options)=>executePetGrowth(f.env,user,body,options),wallet:async()=>({coin:(await f.pg.query('SELECT coin::text FROM users WHERE id=2')).rows[0].coin,stars:Number((await f.pg.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).rows[0].quantity)})};
}
test('live costs, four independent grades, keep/apply and exact BIGINT balances',async t=>{
 const f=await fixture(t),before=await f.wallet(),initial=await f.state();assert.equal(initial.instances.length,3);assert.deepEqual(initial.policy.costs,PET_GROWTH_COSTS);
 let tickets=[30,55,75,99],rolled=await f.run(command('ROLL_STATS',0,{instanceId:code+':1'}),{randomInt:()=>tickets.shift()});
 assert.deepEqual(rolled.pending.candidate,{attack:'B',defense:'A',hp:'S',speed:'SSS'});assert.deepEqual(await f.wallet(),{coin:(BigInt(before.coin)-5000000000000n).toString(),stars:before.stars-10000000});
 const applied=await f.run(command('APPLY',1,{pendingId:rolled.pending.id}));assert.equal(applied.instances[1]?.stats.attack,'B');
 rolled=await f.run(command('ROLL_TRAIT',2,{instanceId:code+':1'}),{randomInt:total=>total-1});assert.deepEqual(rolled.pending.candidate,{id:'LUCK',grade:'SSS'});
 await f.run(command('KEEP',3,{pendingId:rolled.pending.id}));assert.deepEqual(await f.wallet(),{coin:(BigInt(before.coin)-35000000000000n).toString(),stars:before.stars-60000000});
 assert.equal((await f.pg.query('SELECT count(*) FROM coin_logs')).rows[0].count,2);
});
test('duplicate retry, lost commit acknowledgement, injected failure and pending lock never double charge',async t=>{
 const f=await fixture(t),body=command('ROLL_STATS',0,{instanceId:code+':1'}),before=await f.wallet();
 f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>f.run(body),e=>e.code==='RETRY');assert.deepEqual(await f.wallet(),before);assert.equal((await f.state()).revision,0);
 f.fail('');f.loseCommit();const result=await f.run(body);assert.equal(result.replayed,true);const paid=await f.wallet();assert.equal(paid.stars,before.stars-10000000);
 assert.equal((await f.run(body)).replayed,true);assert.deepEqual(await f.wallet(),paid);
 await assert.rejects(()=>f.run({...body,instanceId:code+':2'}),e=>e.code==='REQUEST_REUSED');
 await assert.rejects(()=>f.run(command('ROLL_STATS',1,{instanceId:code+':2'})),e=>e.code==='PENDING_RESULT');assert.deepEqual(await f.wallet(),paid);
});
test('insufficient coin or stars and stale revision preserve account data',async t=>{
 const f=await fixture(t),body=command('ROLL_TRAIT',0,{instanceId:code+':1'});await f.pg.exec('UPDATE users SET coin=29999999999999 WHERE id=2');
 const before=await f.wallet();await assert.rejects(()=>f.run(body),e=>e.code==='INSUFFICIENT');assert.deepEqual(await f.wallet(),before);
 await f.pg.exec("UPDATE users SET coin=30000000000000 WHERE id=2; UPDATE cnine_user_inventory SET quantity=49999999 WHERE item_code='MASTER_STAR'");
 await assert.rejects(()=>f.run(body),e=>e.code==='INSUFFICIENT');await assert.rejects(()=>f.run({...body,expectedRevision:8}),e=>e.code==='STALE_REVISION');assert.equal((await f.state()).revision,0);
});
test('mode equipment persists the chosen instance without changing the other mode or base buffs',async t=>{
 const f=await fixture(t);let s=await f.run(command('ROLL_STATS',0,{instanceId:code+':2'}),{randomInt:n=>n-1});
 s=await f.run(command('APPLY',s.revision,{pendingId:s.pending.id}));s=await f.run(command('EQUIP',s.revision,{instanceId:code+':2',mode:'PVE'}));
 const snapshot=await loadPetBattleSnapshot(f.env,user,'PVE');assert.equal(snapshot.growth.id,code+':2');assert.deepEqual(snapshot.definition.buffs,[{type:'ATTACK_PERCENT',percent:50}]);assert.equal(await loadPetBattleSnapshot(f.env,user,'PVP'),null);
 const old=structuredClone(snapshot);s=await f.run(command('ROLL_TRAIT',s.revision,{instanceId:code+':2'}),{randomInt:n=>n-1});await f.run(command('APPLY',s.revision,{pendingId:s.pending.id}));assert.deepEqual(snapshot,old);
 const bonus=await readCollectionBonuses(f.env,2,'PVE');assert.equal(bonus.petBonuses.coinPercent,10);
});
test('battle applies extra stats and trait once, hunter only damages bosses and old pets retain balance',()=>{
 const instance=initialPetGrowth(code);instance.stats={attack:'B',defense:'A',hp:'S',speed:'SSS'};instance.trait={id:'HUNTER',grade:'SSS'};
 const actor={id:'A:1',alive:true,hp:100,maxHp:100,attack:100,defense:100,speed:100,shield:0,battleMode:'PVE'},raw={definition:{code,name:'흑구',battleSprite:'assets/a.png',enabled:true,modes:['PVE','PVP'],target:'ALL_ALLIES',notes:'',buffs:[{type:'ATTACK_PERCENT',percent:50}]},growth:instance,ownerId:2};
 const opening=applyPetOpeningBuff([actor],raw,'A','PVE');assert.equal(actor.attack,151);assert.equal(actor.defense,102);assert.equal(actor.maxHp,103);assert.equal(actor.speed,105);assert.equal(opening.petTrait.percent,10);assert.equal(equipmentHitMultiplier(actor,{isBoss:true},false),1.1);assert.equal(equipmentHitMultiplier(actor,{isBoss:false},false),1);assert.equal(applyPetOpeningBuff([actor],raw,'A','PVE'),null);
 assert.equal(petGrowthCoinBonus({...instance,trait:{id:'LUCK',grade:'SSS'}},'PVP'),0);
 assert.equal(savedPetGrowth({pets:{[instance.id]:instance},loadouts:{PVE:instance.id}},code,'PVE',{permanent:false,quantity:1}),null);
});
test('expired/lost ownership can dismiss pending result but cannot apply it',async t=>{
 const f=await fixture(t),s=await f.run(command('ROLL_STATS',0,{instanceId:code+':1'}));await f.write('pet_collection_v1:2',{revision:2,pets:{}});
 await assert.rejects(()=>f.run(command('APPLY',s.revision,{pendingId:s.pending.id})),e=>e.code==='NOT_OWNED');assert.equal((await f.run(command('KEEP',s.revision,{pendingId:s.pending.id}))).pending,null);
});
test('route requires authentication and rejects injected grades',async t=>{
 const f=await fixture(t),deps={authenticate:async()=>null,json:(body,status=200)=>Response.json(body,{status}),withUserMutationLock:async(_e,_u,_p,work)=>work()};
 const request=new Request('https://qa.test/api/pets/v2/growth');assert.equal((await handlePetGrowth({path:'pets/v2/growth',request,env:f.env,deps})).status,401);
 await assert.rejects(()=>f.run({...command('ROLL_STATS',0,{instanceId:code+':1'}),stats:{attack:'SSS'}}),e=>e.code==='INVALID_REQUEST');
 deps.authenticate=async()=>user;
 const body=command('ROLL_STATS',0,{instanceId:code+':1'}),post=origin=>new Request('https://qa.test/api/pets/v2/growth',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handlePetGrowth({path:'pets/v2/growth',request:post('https://outside.test'),env:f.env,deps})).status,403);
 const response=await handlePetGrowth({path:'pets/v2/growth',request:post('https://qa.test'),env:f.env,deps});assert.equal(response.status,200);assert.equal((await response.json()).pending.id,body.requestId);
});

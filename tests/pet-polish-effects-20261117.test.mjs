import test from 'node:test';
import assert from 'node:assert/strict';
import {PET_GROWTH_POLICY,initialPetGrowth,petGrowthBonuses,petGrowthCoinBonus,savedPetGrowth} from '../shared/pet-growth-live-v2.mjs';
import {applyGrowthRequest} from '../shared/pet-growth-v2.mjs';
import {applyPetOpeningBuff} from '../shared/companion-opening-v1.mjs';
import {equipmentHitMultiplier,applyPveEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {equipmentGrowthFromRows} from '../functions/_equipment_growth.js';
import {createPvpBattleV2,createDuoBattleV2,buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buffPolishSettings,rebasePolishRecord,POLISH_INCREMENTS} from '../scripts/ops/pet-growth-polish-effects-20261117.mjs';
import {polishDefaults,polishRates} from '../shared/equipment-polish-v1.mjs';
import {polishFixture} from './helpers/equipment-polish-db.mjs';
import {readPolishSettings} from '../functions/_equipment_polish.js';
import {executePolish} from '../functions/_equipment_polish_transactions.js';
import {restoredPolishStatements,polishStateKey} from '../functions/_equipment_growth.js';

const code='PET-PEPEGU',pet=()=>({...initialPetGrowth(code),stats:{attack:'SSS',defense:'SSS',hp:'SSS',speed:'SSS'},trait:{id:'GUARD',grade:'SSS'}});
const raw=growth=>({ownerId:7,growth,definition:{code,name:'페페구',enabled:true,modes:['PVE','PVP'],target:'ALL_ALLIES',battleSprite:'assets/pet.png',notes:'',buffs:[{type:'SPEED_PERCENT',percent:55}]}});
const actor=()=>({id:'A:1',alive:true,hp:500,maxHp:1000,attack:100,defense:200,speed:100,shield:0,battleMode:'PVE'});

test('saved grades gain new effects once; HP ratio, base pet buff and old snapshots are preserved',()=>{
 const growth=pet(),record={pets:{[growth.id]:growth},loadouts:{PVE:growth.id}},before=structuredClone(record);
 const loaded=savedPetGrowth(record,code,'PVE',{permanent:true,quantity:1}),a=actor();
 const opening=applyPetOpeningBuff([a],raw(loaded),'A','PVE');
 assert.equal(a.attack,150);assert.equal(a.defense,300);assert.equal(a.maxHp,1500);assert.equal(a.hp,750);assert.equal(a.speed,180);assert.equal(a.shield,750);
 assert.equal(applyPetOpeningBuff([a],raw(loaded),'A','PVE'),null);assert.deepEqual(record,before);
 const snapshot=structuredClone(opening);loaded.stats.attack='B';assert.deepEqual(opening,snapshot);
 const untouched=actor();applyPetOpeningBuff([untouched],raw(null),'A','PVE');assert.equal(untouched.attack,100);assert.equal(untouched.speed,155);
});

test('all grades increase meaningfully without changing costs, odds, species limits or unopened traits',()=>{
 assert.deepEqual(PET_GROWTH_POLICY.weights,{C:30,B:25,A:20,S:15,SS:7,SSS:3});
 assert.deepEqual(PET_GROWTH_POLICY.costs,{stats:{coin:'5000000000000',masterStars:10000000},trait:{coin:'30000000000000',masterStars:50000000}});
 const expected={C:[0,0],B:[5,3],A:[10,6],S:[20,10],SS:[35,16],SSS:[50,25]};
 for(const [grade,[main,speed]] of Object.entries(expected)){
  const g={...pet(),stats:{attack:grade,defense:grade,hp:grade,speed:grade},trait:{id:'ASSAULT',grade,activated:false}},fx=petGrowthBonuses(g);
  const v=type=>fx.buffs.find(b=>b.type===type)?.percent||0;
  assert.equal(v('ATTACK_PERCENT'),main);assert.equal(v('DEFENSE_PERCENT'),main);assert.equal(v('MAX_HP_PERCENT'),main);assert.equal(v('SPEED_PERCENT'),speed);
  assert.equal(fx.trait.active,false);
 }
});

test('paid revision-one pending roll can still apply or keep for free after the effect update',()=>{
 const g=initialPetGrowth(code),state={ownerId:7,revision:0,instances:[g],loadouts:{PVE:g.id,PVP:null},pending:null,wallet:{coin:'100000000000000',masterStars:100000000},receipts:{}};
 const roll={command:'ROLL_STATS',expectedRevision:0,instanceId:g.id,requestId:'effects-buff-old-pending-01'};
 const old=applyGrowthRequest(state,roll,{...PET_GROWTH_POLICY,revision:1},{randomInt:n=>n-1}).state,copy=structuredClone(old);
 for(const command of ['APPLY','KEEP']){
  const r=applyGrowthRequest(old,{command,expectedRevision:1,pendingId:old.pending.id,requestId:'effects-buff-'+command+'-00001'},PET_GROWTH_POLICY);
  assert.deepEqual(r.state.wallet,old.wallet);assert.equal(r.state.pending,null);
  assert.equal(petGrowthBonuses(r.state.instances[0]).buffs.find(b=>b.type==='ATTACK_PERCENT')?.percent||0,command==='APPLY'?50:0);
 }
 assert.deepEqual(old,copy);
});

test('hunter remains PvE boss-only, luck coin-only, and strength/speed traits keep their scopes',()=>{
 const h={...pet(),trait:{id:'HUNTER',grade:'SSS'}},a=actor();applyPetOpeningBuff([a],raw(h),'A','PVE');
 assert.equal(equipmentHitMultiplier(a,{isBoss:true},false),1.5);assert.equal(equipmentHitMultiplier(a,{isBoss:false},false),1);
 assert.equal(petGrowthBonuses(h,'PVP').trait.active,false);
 const l={...pet(),trait:{id:'LUCK',grade:'SSS'}};assert.equal(petGrowthCoinBonus(l,'PVE'),25);assert.equal(petGrowthCoinBonus(l,'PVP'),0);
 for(const [id,key,value] of [['ASSAULT','attack',200],['VITALITY','maxHp',2000],['HASTE','speed',205]]){
  const f=actor();applyPetOpeningBuff([f],raw({...pet(),trait:{id,grade:'SSS'}}),'A','PVE');assert.equal(f[key],value);
 }
});

const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'성장 검수',rarity:'FUR',power:100000,power_type:'ATTACK'}));
test('real PvP and duo use current pet values and restrict each owner buff to its own squad',()=>{
 const p=raw(pet()),b=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:p,seed:31});
 assert(b.result.timeline.length>0);
 for(let i=0;i<5;i++)assert.equal(b.teams.A.cards[i].attack,Math.round(b.teams.B.cards[i].attack*1.5));
 const squad=(ownerId,pet)=>({ownerId,cards:cards.map((c,i)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]})),pet});
 const d=createDuoBattleV2({attackerSquads:[squad(7,p),squad(8,null)],defenderSquads:[squad(9,null),squad(10,null)],seed:31});
 const own=d.teams.A.cards.filter(c=>c.ownerId===7),other=d.teams.A.cards.filter(c=>c.ownerId===8);assert.equal(own.length,5);assert.equal(other.length,5);
 for(let i=0;i<5;i++)assert.equal(own[i].attack,Math.round(other[i].attack*1.5));
});

const previous=()=>{const s=polishDefaults();return {...s,publicVisible:true,executionMode:'ON',successRate:10,maxAttempts:50,options:s.options.map((o,i)=>({...o,increment:[2,.5,3,2,.5][i],maxLevel:20})),costs:Array.from({length:50},(_,i)=>({attempt:i+1,coins:10000000000000,masterStars:30000000,stones:1}))};};
const record=levels=>({key:'equipment_polish_instance_v1:7:72',value:JSON.stringify({schemaVersion:1,userId:7,instanceId:'72',attempts:levels.reduce((a,b)=>a+b),rolls:500,levels,values:levels.map((n,i)=>n*[2,.5,3,2,.5][i]),retainedAudit:'preserve'})});
test('polish rebase triples existing growth while preserving levels, rolls, metadata and all economic settings',()=>{
 const old=previous(),next=buffPolishSettings(old);assert.deepEqual(next.options.map(o=>o.increment),POLISH_INCREMENTS);
 const strip=s=>({...s,notice:'',options:s.options.map(o=>({...o,increment:0}))});assert.deepEqual(strip(next),strip(old));assert.deepEqual(polishRates(next),polishRates(old));
 const row=record([20,10,10,10,0]),original=JSON.parse(row.value),updated=rebasePolishRecord(row);assert.deepEqual(updated.values,[120,15,90,60,0]);assert.deepEqual({...updated,values:original.values},original);
 assert.throws(()=>rebasePolishRecord({...row,value:JSON.stringify(updated)}),/Unexpected historical/);
 assert.throws(()=>rebasePolishRecord({...row,value:JSON.stringify({...original,values:[41,5,30,20,0]})}),/Unexpected historical/);
});

test('rebased gear and pet growth raise actual boss damage, without applying account gear to PvP',()=>{
 const row=record([20,10,10,10,0]),next={...row,value:JSON.stringify(rebasePolishRecord(row))};
 const run=r=>{const a=buildFighter(cards[0],0,'A',null,'PVE'),boss=buildMonsterFighter({id:1,name:'검수 보스',battle_power:100000000});Object.assign(boss,{isBoss:true,hp:1000000,maxHp:1000000,attack:1,defense:1000,speed:1});
  const s=JSON.parse(r.value),runtime=equipmentGrowthFromRows([{id:s.instanceId,code:'QA_GEAR',value:r.value}],7);applyPveEquipmentGrowth([a],runtime);applyPetOpeningBuff([a],raw(pet()),'A','PVE');
  const result=simulateBattleV2Preview({teamA:[a],teamB:[boss],seed:19,maxActions:5});return {attack:a.attack,damage:result.timeline.filter(e=>e.type==='TURN'&&e.actorId===a.id).reduce((n,e)=>n+(e.damage||0),0),runtime};};
 const old=run(row),after=run(next);assert(after.attack>old.attack*1.5);assert(after.damage>old.damage*1.5,JSON.stringify({old,after}));
 const pvp={...actor(),battleMode:'PVP'};applyPveEquipmentGrowth([pvp],after.runtime);assert.equal(pvp.attack,100);
});

test('new policy rejects a stale paid action, continues rebased growth and restores the new values',async t=>{
 const f=await polishFixture(t,{postgres:true});
 assert.equal((await f.call('',{admin:true,method:'PATCH',body:{settings:previous(),expectedRevision:0}})).status,200);
 const old=await readPolishSettings(f.env),row=record([19,0,0,0,0]),rebased=rebasePolishRecord(row);
 assert.equal((await f.call('',{admin:true,method:'PATCH',body:{settings:buffPolishSettings(old.settings),expectedRevision:1}})).status,200);
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',row.key,JSON.stringify(rebased)).run();
 await f.p('UPDATE users SET coin=100000000000000 WHERE id=7').run();await f.p("UPDATE cnine_user_inventory SET quantity=300000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 const wallet=async()=>String((await f.p('SELECT coin FROM users WHERE id=7').first()).coin),before=await wallet();
 const body={instanceId:'72',expectedAttempts:19,revision:1,requestId:'effects-buff-stale-00001'};
 await assert.rejects(executePolish(f.env,{id:7,role:'OWNER'},old,body,{unit:0}),e=>e.code==='POLISH_RETRY');assert.equal(await wallet(),before);
 const current=await readPolishSettings(f.env),request={...body,revision:current.settings.revision,requestId:'effects-buff-success-0001'};
 const result=await executePolish(f.env,{id:7,role:'OWNER'},current,request,{unit:0});assert.equal(result.values[0],120);assert.equal(result.total,20);
 const paid=await wallet();await executePolish(f.env,{id:7,role:'OWNER'},current,request,{unit:0});assert.equal(await wallet(),paid);assert.equal(BigInt(before)-BigInt(paid),10000000000000n);
 await f.p("INSERT INTO equipment_forge_destroyed_v1 VALUES('effects-buff-repair',7,'72','74')").run();await f.env.DB.batch(await restoredPolishStatements(f.env.DB,7,'effects-buff-repair'));
 const restored=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',polishStateKey('74',7)).first()).value);assert.equal(restored.values[0],120);assert.equal(restored.levels[0],20);
});

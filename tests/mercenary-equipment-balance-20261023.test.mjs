import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {REGION_EQUIPMENT,REGION_DIFFICULTIES,regionEquipmentEffects,legionRegionDefaults,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {applyPveEquipmentGrowth,equipmentHitMultiplier,equipmentAfterBasic,normalizedEquipmentEffects} from '../shared/equipment-combat-growth-v1.mjs';
import {sustainedEncounterPlan} from '../functions/_sustained_encounter.js';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {saveRegionPolicy} from '../functions/_legion_regions.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {OPERATION_KEY,EQUIPMENT_RATES,raiseEquipmentRates,equipmentChancePerClear,applyMercenaryEquipmentBalance,verifyMercenaryEquipmentBalance} from '../scripts/ops/mercenary-equipment-balance-20261023.mjs';

const oldPowers={WEAPON:100000,TOP:70000,BOTTOM:65000,SHOES:50000,ACCESSORY:60000};
function previousPolicy(){
 const p=legionRegionDefaults();p.mode='ON';p.revision=7;
 p.difficulties.forEach((d,i)=>Object.assign(d.loot,{eliteSetPercent:i<3?0:.0015,bossSetPercent:.0015,bossUniquePercent:.0015}));
 return p;
}
const unique=region=>normalizedEquipmentEffects(regionEquipmentEffects(['HUNT_'+region+'_UNIQUE']).effects);
test('all 30 gear powers double and all five unique effects improve real damage, cadence or survival',()=>{
 assert.equal(REGION_EQUIPMENT.length,30);
 for(const i of REGION_EQUIPMENT)assert.equal(i.totalPower,2*(i.kind==='UNIQUE'?(i.slot==='WEAPON'?145000:100000):oldPowers[i.slot]));
 const coast=unique('COAST'),desert=unique('DESERT'),sky=unique('SKY');
 assert.equal(equipmentHitMultiplier({equipmentEffects:coast},{shield:10},false),1.3);assert.equal(coast.penetrationPoints,5);
 assert.equal(equipmentHitMultiplier({equipmentEffects:desert},{isBoss:true,shield:0},false),1.24);assert.equal(desert.penetrationPoints,6);
 assert.equal(equipmentHitMultiplier({equipmentEffects:sky},{shield:0},true),1.15);assert.equal(sky.criticalChancePoints,8);assert.equal(sky.criticalDamagePoints,20);
 const actor={id:'mercenary',battleMode:'PVE',attack:100,maxHp:10000,hp:1000,speed:10,shield:0,maxShield:0,damageDealt:0};
 const queen=structuredClone(actor);applyPveEquipmentGrowth([queen],{effects:unique('VISCERA')});
 assert.equal(queen.maxHp,11200);assert.equal(queen.equipmentEffects.damageReductionPercent,7);
 let heal=0;equipmentAfterBasic(queen,{hp:1},1000,{emit:(_t,e)=>heal+=e.amount,damage:()=>{},knockout:()=>{}});assert.equal(heal,50);
 const mask={...actor,equipmentEffects:unique('THEATRE')},hits=[];
 for(let n=0;n<6;n++)equipmentAfterBasic(mask,{hp:10000},1000,{damage:(_target,amount)=>{hits.push(amount);return {hpDamage:amount,absorbed:0};},emit:()=>{},knockout:()=>{}});
 assert.deepEqual(hits,[400,400],'two stronger echoes replace the previous single 25% echo');
 const pvp={...actor,battleMode:'PVP'},before=structuredClone(pvp);applyPveEquipmentGrowth([pvp],{effects:unique('VISCERA')});assert.deepEqual(pvp,before);
});
test('per-clear equipment odds meet the target across zero to four elites, with no extra loot pool or pity',()=>{
 const original=previousPolicy(),{policy,changes}=raiseEquipmentRates(original);assert.equal(changes.length,12);
 const protectedBefore=structuredClone(original),protectedAfter=structuredClone(policy);
 for(let i=0;i<5;i++)for(const key of Object.keys(EQUIPMENT_RATES)){
  assert.ok(policy.difficulties[i].loot[key]>=original.difficulties[i].loot[key]);
  if(original.difficulties[i].loot[key]===0)assert.equal(policy.difficulties[i].loot[key],0);
  delete protectedBefore.difficulties[i].loot[key];delete protectedAfter.difficulties[i].loot[key];
 }
 protectedAfter.revision=protectedBefore.revision;assert.deepEqual(protectedAfter,protectedBefore);
 assert.deepEqual(raiseEquipmentRates(policy),{policy,changes:[]});
 for(const d of policy.difficulties)for(let elites=0;elites<=4;elites++){
  const mean=1/equipmentChancePerClear(d.loot,elites);assert.ok(mean>=750&&mean<=1000,JSON.stringify({id:d.id,elites,mean}));
 }
 const base={id:'enemy',isMonster:true,side:'B',hp:100,maxHp:100,alive:true,speed:100,attack:10};
 for(const d of REGION_DIFFICULTIES){
  const initial=Array.from({length:12},(_,slot)=>({...base,id:'enemy:'+slot,slot})),enemies=structuredClone(initial);
  const plan=sustainedEncounterPlan({regionId:'coast',durationMs:d.huntDurationMs,templates:[base],finalBoss:{...base,id:'boss',isBoss:true}},initial,12);
  while(!plan.bossSpawned){for(const e of enemies){e.hp=0;e.alive=false;}plan.advance(plan.nextAt,enemies,()=>{});}
  assert.equal(plan.instances.filter(e=>e.huntElite).length,4);
  assert.equal(plan.instances.filter(e=>e.isBoss).length,1);
 }
 for(const region of policy.regions){
  const items=REGION_EQUIPMENT.filter(i=>i.regionId===region.id),input={regionId:region.id,regionLoot:policy.difficulties[4].loot,items};
  const rolls=[EQUIPMENT_RATES.bossSetPercent/100-1e-9,.5,1];
  assert.equal(regionKillLoot(input,{boss:true},()=>rolls.shift())[0].kind,'SET');
  assert.deepEqual(regionKillLoot(input,{boss:true},()=>.99),[]);
  const uniqueRolls=[.99,EQUIPMENT_RATES.bossUniquePercent/100-1e-9];
  assert.equal(regionKillLoot(input,{boss:true},()=>uniqueRolls.shift())[0].kind,'UNIQUE');
 }
});
test('public lobby and start hide equipment odds while saved rolls and OWNER CMS keep exact policy',async t=>{
 const f=await legionFixture({regions:true});t.after(f.close);await seedRegionalCatalog(f);
 const source=await f.configure();source.mode='ON';
 assert.equal((await f.call('admin/legion-hunt',{policy:source},{method:'PATCH'})).status,200);
 const policy=raiseEquipmentRates(previousPolicy()).policy;policy.revision=0;const saved=await saveRegionPolicy(f.env,f.owner,policy);
 const admin=await f.call('admin/legion-hunt/regions');assert.deepEqual(admin.body.policy.difficulties,saved.difficulties);
 f.setUser(f.player);
 const lobby=await f.call('legion-hunt/bootstrap');assert.equal(lobby.status,200);
 const start=await f.call('legion-hunt/start',{version:5,regionId:'coast',difficulty:'normal'});assert.equal(start.status,200,JSON.stringify(start.body));
 for(const response of [lobby.body,start.body])for(const key of Object.keys(EQUIPMENT_RATES))assert.ok(!JSON.stringify(response).includes(key),key);
 assert.equal(start.body.payload.huntPolicy.regionLoot.bossStones,5);
 const record=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:2').first()).value);
 for(const key of Object.keys(EQUIPMENT_RATES))assert.equal(record.state.policy.loot[key],saved.difficulties[0].loot[key]);
 assert.equal(record.state.policy.regionLoot.bossSetPercent,saved.difficulties[0].loot.bossSetPercent);
 const ui=fs.readFileSync(new URL('../js/legion-hunt-entry-v1.mjs',import.meta.url),'utf8');
 for(const key of Object.keys(EQUIPMENT_RATES))assert.ok(!ui.includes(key));
 assert.ok(ui.includes('용병 장비 드랍률이 상향되었습니다.'));
});
test('one-time catalog and policy update rolls back on failure, validates all powers, and replays without doubling again',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id INTEGER,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);
 CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,slot TEXT,total_power BIGINT,pve_power BIGINT,pvp_power BIGINT,description TEXT,is_active INTEGER,is_public INTEGER,supply_enabled INTEGER,updated_at TIMESTAMPTZ);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const [n,i] of REGION_EQUIPMENT.entries()){
  const total=i.totalPower/2,pve=total*.9;
  await db.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,1,0,NULL)',[n+1,i.code,i.name,i.slot,total,pve,total-pve,'previous '+i.code]);
 }
 await db.query("INSERT INTO character_equipment_items VALUES(999,'OTHER','other','WEAPON',100,90,10,'unchanged',1,1,1,NULL)");
 for(const [key,value] of [[LEGION_REGIONS_KEY,previousPolicy()],[LEGION_HUNT_SETTINGS_KEY,defaultLegionHuntPolicy()],['equipment_polish_settings_v1',{executionMode:'ON'}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 const client={query:(sql,args=[])=>sql.includes('current_database()')?Promise.resolve({rows:[{db:'cnine',recovery:false}]}):db.query(sql,args)};
 const snapshot=async()=>({gear:(await db.query('SELECT * FROM character_equipment_items ORDER BY id')).rows,meta:(await db.query('SELECT * FROM app_meta ORDER BY key')).rows});
 const before=await snapshot(),dry=await applyMercenaryEquipmentBalance(client);
 assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit failed')):client.query(sql,args)};
 await assert.rejects(applyMercenaryEquipmentBalance(failing,{apply:true}),/audit failed/);assert.deepEqual(await snapshot(),before);
 const applied=await applyMercenaryEquipmentBalance(client,{apply:true});assert.equal(applied.receipt.equipment.length,30);
 assert.equal((await verifyMercenaryEquipmentBalance(client)).verified,true);
 const after=await snapshot();assert.equal((await applyMercenaryEquipmentBalance(client,{apply:true})).replayed,true);assert.deepEqual(await snapshot(),after);
 await db.query("UPDATE character_equipment_items SET total_power=123 WHERE id=1");
 assert.equal((await applyMercenaryEquipmentBalance(client,{apply:true})).replayed,true);
 assert.equal(Number((await db.query('SELECT total_power FROM character_equipment_items WHERE id=1')).rows[0].total_power),123);
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),1);
 assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
});

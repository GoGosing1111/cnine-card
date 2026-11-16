import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
import {forgeQuote} from '../functions/_equipment_forge_transactions.js';
import {MERCENARY_EQUIPMENT_CATALOG} from '../shared/mercenary-equipment-v1.mjs';
import {ensureMercenaryRuntimeSchema} from '../functions/_mercenary_account.js';
import {equipmentSlots} from '../functions/_mercenary_equipment_model.js';
import {handleForgeRuntimeReady} from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic} from '../functions/_equipment_forge_public.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: mercenary filter finds new +0 drops before pagination and preserves exact owned instances`,async t=>{
 const f=await forgeFixture(t,{postgres});
 await ensureMercenaryRuntimeSchema(f.env);
 await f.p('CREATE INDEX qa_mercenary_forge_inventory ON user_equipment_instances(user_id,equipment_id,id)').run();
 // Reproduce the report: many stronger general items bury the new +0 shoes.
 await f.p('UPDATE character_equipment_items SET total_power=600000,pve_power=540000,pvp_power=60000 WHERE id=1').run();
 for(let id=200;id<365;id++)await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(?,7,1,?)",id,'general-'+id).run();
 const codes=['HUNT_THEATRE_SHOES','HUNT_THEATRE_WEAPON','MERC_ASC_01_TOP','MERC_UQ_11_WEAPON'];
 for(const [i,code]of codes.entries()){
  const gear=MERCENARY_EQUIPMENT_CATALOG.find(item=>item.code===code);assert(gear,code);
  const total=gear.totalPower,pve=Math.floor(total*.9);
  await f.p('INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,?,?,?,?)',10+i,code,gear.name,gear.slot,'MERCENARY',gear.rarity,gear.image,total,pve,total-pve).run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(?,7,?,?)",100+i,10+i,'mercenary-'+i).run();
 }
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(101,7,10,3)').run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(102,7,10,2)').run();
 const loadout={schemaVersion:2,revision:5,loadouts:{'V-001':{PVE:{...equipmentSlots(),WEAPON:'101'},PVP:{...equipmentSlots(),WEAPON:'101'}}}};
 await f.setting('mercenary_equipment_v2:7',loadout);
 // Same catalog entry, separate unenhanced instance, and a foreign account copy.
 await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(104,7,10,'duplicate'),(105,8,10,'foreign')").run();
 const read=options=>readForgePreparationInventory(f.DB,7,{includeEnhancement:true,...options});
 assert(!(await read({limit:40})).items.some(item=>item.instanceId==='100'));
 const filtered=await read({group:'mercenary',limit:40});
 assert.equal(filtered.nextCursor,null);assert.equal(filtered.items.length,5);
 assert(filtered.items.some(item=>item.instanceId==='100'&&item.enhancement.level===0));
 assert.equal(filtered.items.find(item=>item.instanceId==='101').enhancement.level,10);
 assert.deepEqual(filtered.items.find(item=>item.instanceId==='101').mercenaryModes,['PVE','PVP']);
 assert.equal(filtered.items.find(item=>item.instanceId==='101').equipped,true);
 assert.equal(filtered.items.find(item=>item.instanceId==='100').equipped,false);
 const expected=filtered.items.map(item=>item.instanceId);
 assert.deepEqual(new Set(expected),new Set(['100','101','102','103','104']));
 for(const limit of [1,2,4]){
  let cursor=null,ids=[];do{const page=await read({group:'mercenary',limit,beforeId:cursor});ids.push(...page.items.map(item=>item.instanceId));cursor=page.nextCursor;assert(ids.length<=5);}while(cursor);
  assert.deepEqual(ids,expected);
 }
 const plain=await readForgePreparationInventory(f.DB,7,{group:'mercenary'});assert.equal(plain.items.length,5);assert(plain.items.every(item=>item.enhancement===null));
 assert.deepEqual((await read({group:'mercenary',focusId:f.instanceId})).items,[]);
 assert.deepEqual((await read({group:'mercenary',focusId:'105'})).items,[]);
 assert.deepEqual((await read({group:'mercenary',beforeId:'105'})).items,[]);
 assert.deepEqual((await read({group:'armor'})).items.map(item=>item.instanceId),['102','104','100']);
 await assert.rejects(read({group:'mercenary OR 1=1'}),/종류/);
 await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=11').run();
 await f.p('UPDATE character_equipment_items SET is_active=0 WHERE id=12').run();
 assert.deepEqual((await read({group:'mercenary'})).items.map(item=>item.instanceId),expected.filter(id=>!['101','102'].includes(id)));
 assert.deepEqual((await read({group:'mercenary',focusId:'101'})).items,[]);
 assert.deepEqual((await read({group:'mercenary',focusId:'102'})).items,[]);
 await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:2,publicVisible:true,executionMode:'ON',notice:'ISOLATED QA'});
 // Exercise both HTTP handlers, not just the inventory helper: direct selection
 // must reach the lower-power owned item without paging or exposing another owner.
 for(const handler of [handleForgeRuntimeReady,handleEquipmentForgePublic]){
  const route=focusId=>handler({path:'character/equipment/forge/state',request:new Request('https://qa.test/api/character/equipment/forge/state?group=mercenary&focusId='+focusId),env:f.env,deps:{authenticate:async()=>({...f.user,role:'USER'}),json:(body,status=200)=>({body,status})}});
  const focused=await route('100');assert.equal(focused.status,200);assert.deepEqual(focused.body.items.map(i=>i.instanceId),['100']);assert.equal(focused.body.nextCursor,null);
  for(const id of [f.instanceId,'105','101','102'])assert.deepEqual((await route(id)).body.items,[]);
 }
 const quote=await forgeQuote(f.env,{...f.user,role:'USER'},{kind:'ENHANCE',instanceId:'100',requestId:crypto.randomUUID()});
 assert.equal(quote.item.instanceId,'100');assert.equal(quote.item.code,'HUNT_THEATRE_SHOES');
 assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
 assert.deepEqual(JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='mercenary_equipment_v2:7'").first()).value),loadout);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=7').first()).n),171);
});

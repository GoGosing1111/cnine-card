import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {jointFixture} from './helpers/joint-db.mjs';
import {equipmentPreviewRows,equipmentQuantities} from '../functions/_equipment_inventory.js';
import {ensureRuntimeFoundation} from '../functions/_runtime_foundation.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: fast equipment list preserves owned representatives; exact counts track grants and removals`,async t=>{
  const f=await jointFixture(t,{postgres});
  if(postgres)await f.pg.exec('ALTER TABLE character_equipment_items ADD COLUMN sort_order INTEGER DEFAULT 0');
  else f.DB.sql.exec('ALTER TABLE character_equipment_items ADD COLUMN sort_order INTEGER DEFAULT 0');
  for(const [id,slot,active,visible] of [[1,'WEAPON',1,1],[2,'TOP',1,1],[3,'SHOES',0,1],[4,'BOTTOM',1,0],[5,'ACCESSORY',1,1]])
    await f.p('INSERT INTO character_equipment_items(id,code,name,slot,is_active,is_public) VALUES(?,?,?,?,?,?)',id,'ITEM_'+id,'장비 '+id,slot,active,visible).run();
  for(const [id,user,item,date] of [[101,7,1,'2026-09-01'],[102,7,1,'2026-09-10'],[103,7,2,'2026-09-11'],[104,7,3,'2026-09-12'],[105,7,4,'2026-09-13'],[106,8,5,'2026-09-14']])
    await f.p('INSERT INTO user_equipment_instances(id,user_id,equipment_id,acquired_at) VALUES(?,?,?,?)',id,user,item,date).run();
  await f.p("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'WEAPON',101),(7,'ACCESSORY',106)").run();
  let rows=(await equipmentPreviewRows(f.env,7)).results;
  assert.equal(rows.length,2);assert.equal(Number(rows.find(r=>Number(r.id)===1).instance_id),101);
  assert.equal(rows.find(r=>Number(r.id)===1).acquired_at,'2026-09-10');
  assert.ok(rows.every(r=>r.quantity===null));
  assert.deepEqual((await equipmentQuantities(f.env,7)).quantities.sort((a,b)=>a.equipmentId-b.equipmentId),[{equipmentId:1,quantity:2},{equipmentId:2,quantity:1},{equipmentId:5,quantity:0}]);
  await f.p('DELETE FROM user_equipment_instances WHERE id=102').run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,acquired_at) VALUES(107,7,2,'2026-09-15')").run();
  rows=(await equipmentPreviewRows(f.env,7)).results;
  assert.equal(Number(rows.find(r=>Number(r.id)===2).instance_id),107);
  assert.deepEqual((await equipmentQuantities(f.env,7)).quantities.sort((a,b)=>a.equipmentId-b.equipmentId),[{equipmentId:1,quantity:1},{equipmentId:2,quantity:2},{equipmentId:5,quantity:0}]);
  assert.equal((await equipmentPreviewRows(f.env,7,{admin:true})).results.length,4);
  assert.deepEqual((await equipmentPreviewRows(f.env,999)).results,[]);
  for(let id=6;id<=10;id++)await f.p("INSERT INTO character_equipment_items(id,code,name,slot,is_active,is_public) VALUES(?,?,?,'TOP',1,1)",id,'PAGE_'+id,'추가 장비').run();
  const page1=await equipmentQuantities(f.env,7),page2=await equipmentQuantities(f.env,7,page1.nextEquipmentId),end=await equipmentQuantities(f.env,7,page2.nextEquipmentId);
  assert.deepEqual(page1.quantities.map(r=>r.equipmentId),[1,2,5,6]);assert.equal(page1.nextEquipmentId,6);
  assert.deepEqual(page2.quantities.map(r=>r.equipmentId),[7,8,9,10]);assert.equal(end.nextEquipmentId,null);assert.deepEqual(end.quantities,[]);
});

test('foundation coalesces within a request, retries failure, and never shares a pending connection between requests',async()=>{
  let reads=0,finish;const waiting=new Promise(r=>{finish=r;});
  const DB={prepare(){return {bind(){return this;},async all(){reads++;await waiting;return {results:[{key:'ready',value:'1'}]};}};}};
  const env={DB},otherRequest={DB};
  const a=ensureRuntimeFoundation(env,'test',['ready'],()=>assert.fail('Already ready'));
  const b=ensureRuntimeFoundation(env,'test',['ready'],()=>assert.fail('Already ready'));
  const c=ensureRuntimeFoundation(otherRequest,'test',['ready'],()=>assert.fail('Already ready'));
  assert.equal(reads,2);finish();await Promise.all([a,b,c]);
  await ensureRuntimeFoundation(env,'test',['ready'],()=>assert.fail('Already ready'));assert.equal(reads,2);
  let attempts=0;const missing={DB:{prepare(){return {bind(){return this;},async all(){return {results:[]};}};}}};
  await assert.rejects(()=>ensureRuntimeFoundation(missing,'test',['ready'],async()=>{attempts++;throw Error('Transient');}),/Transient/);
  await ensureRuntimeFoundation(missing,'test',['ready'],async()=>{attempts++;});assert.equal(attempts,2);
});

const source=await fs.readFile(new URL('../js/character-loadout-v2.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fixture=()=>({instances:[{instanceId:11,quantity:null,item:{id:1,name:'테스트 무기',slot:'WEAPON',rarity:'RARE',pvePower:90,pvpPower:10}}],loadout:{},titles:[],vehicles:[],equipmentTotalQuantity:null,equipmentQuantitiesPending:true});
function mount(request){
  const listeners=new Map(),total={innerHTML:''};let renders=0,html='';
  const root={get innerHTML(){return html;},set innerHTML(v){html=v;renders++;},classList:{add(){},remove(){}},contains(){return true;},addEventListener(t,h){listeners.set(t,h);},removeEventListener(t){listeners.delete(t);},querySelector(s){return s==='[data-equipment-total]'?total:null;},querySelectorAll(){return [];}};
  const window={location:{href:'https://game.test/?tab=equipment'},setTimeout(){return 1;},clearTimeout(){}};
  vm.runInNewContext(source,{window,URL,structuredClone,console,history:{replaceState(){}}});
  const controller=window.SoopketmonCharacterLoadoutV2.create(root,{request,profile:{nickname:'검수'}});
  const click=(dataset={},attributes=[])=>{const target={dataset,closest(){return this;},hasAttribute(a){return attributes.includes(a);}};listeners.get('click')?.({target});};
  return {root,total,controller,click,renders:()=>renders};
}
test('equipment is usable before counts, and late counts preserve an equipment action and selected tab',async()=>{
  const counts=deferred(),equip=deferred();
  const m=mount(path=>path==='character/loadout'?Promise.resolve(fixture()):path==='character/equipment/quantities'?counts.promise:equip.promise);
  await tick();assert.match(m.root.innerHTML,/장비 시스템/);assert.match(m.root.innerHTML,/수량 확인 중/);
  assert.equal(m.controller.getState().instances[0].quantity,null);
  m.click({equip:'11'});m.click({tab:'garage'});const renders=m.renders();
  counts.resolve({quantities:[{equipmentId:1,quantity:2780786}]});await tick();
  assert.equal(m.renders(),renders);assert.match(m.root.innerHTML,/data-active-tab="garage"/);
  assert.equal(m.controller.getState().loadout.WEAPON,11);assert.equal(m.controller.getState().equipmentTotalQuantity,2780786);
  equip.resolve({ok:true});await tick();assert.equal(m.controller.getState().loadout.WEAPON,11);
});
test('count failure leaves equipment usable and offers a working retry',async()=>{
  let attempts=0;const m=mount(async path=>{if(path==='character/loadout')return fixture();if(++attempts===1)throw Error('Timeout');return {quantities:[{equipmentId:1,quantity:42}]};});
  await tick();assert.match(m.root.innerHTML,/장비 시스템/);assert.match(m.total.innerHTML,/수량 다시 확인/);
  m.click({},['data-quantities-retry']);await tick();assert.equal(m.controller.getState().equipmentTotalQuantity,42);assert.match(m.total.innerHTML,/42개/);
});
test('paged counts keep verified quantities and retry only the failed page',async()=>{
  const calls=[];let failed=false;
  const m=mount(async path=>{calls.push(path);if(path==='character/loadout'){const data=fixture();data.instances.push({instanceId:17,quantity:null,item:{id:7,name:'신발',slot:'SHOES'}});return data;}
    if(path==='character/equipment/quantities')return {quantities:[{equipmentId:1,quantity:2000000}],nextEquipmentId:4};
    if(!failed){failed=true;throw Error('Temporary timeout');}return {quantities:[{equipmentId:7,quantity:123}],nextEquipmentId:null};});
  await tick();assert.equal(m.controller.getState().instances[0].quantity,2000000);assert.equal(m.controller.getState().instances[1].quantity,null);
  m.click({},['data-quantities-retry']);await tick();assert.equal(m.controller.getState().equipmentTotalQuantity,2000123);
  assert.equal(calls.filter(p=>p==='character/equipment/quantities').length,1);
  assert.equal(calls.filter(p=>p==='character/equipment/quantities?after=4').length,2);
});
test('responses from older loads or a destroyed screen cannot overwrite the current screen',async()=>{
  const first=deferred(),second=deferred();let loads=0;
  const m=mount(path=>path==='character/loadout'?(++loads===1?first.promise:second.promise):Promise.resolve({quantities:[]}));
  const reloading=m.controller.reload();const latest={...fixture(),equipmentQuantitiesPending:false,equipmentTotalQuantity:1};latest.instances[0].item.name='최신 무기';latest.instances[0].quantity=1;
  second.resolve(latest);await reloading;first.resolve(fixture());await tick();assert.match(m.root.innerHTML,/최신 무기/);
  m.controller.destroy();assert.equal(m.root.innerHTML,'');await tick();assert.equal(m.root.innerHTML,'');
});

test('enhanced duplicate is sorted first, selectable, keeps enhanced power and does not duplicate late total counts',async()=>{
  const counts=deferred(),calls=[];
  const data=fixture();data.equipmentTypeCount=1;data.loadout.WEAPON=11;
  data.instances[0].quantityOffset=2;data.instances[0].enhancement={level:0};data.instances[0].item.totalPower=100;
  for(const instanceId of [12,13])data.instances.push({instanceId,quantity:1,quantityFixed:true,enhancement:{level:9},item:{...data.instances[0].item,totalPower:180,pvePower:162,pvpPower:18}});
  const m=mount(async(path,init)=>{calls.push({path,init});if(path==='character/loadout')return data;if(path==='character/equipment/quantities')return counts.promise;return {ok:true,bonuses:{equipmentPve:162,equipmentPvp:18}};});
  await tick();assert.ok(m.root.innerHTML.indexOf('data-equip="12"')<m.root.innerHTML.indexOf('data-equip="11"'));
  assert.match(m.root.innerHTML,/테스트 무기 \+9/);
  m.click({equip:'12'});await tick();assert.equal(m.controller.getState().loadout.WEAPON,12);
  assert.equal(m.controller.getState().bonuses.equipmentPve,162);assert.equal(m.controller.getState().bonuses.equipmentPvp,18);
  counts.resolve({quantities:[{equipmentId:1,quantity:5}]});await tick();
  assert.deepEqual(Array.from(m.controller.getState().instances,r=>r.quantity),[3,1,1]);
  assert.equal(m.controller.getState().equipmentTotalQuantity,5);assert.match(m.total.innerHTML,/1종 · 5개/);
  assert.equal(calls.filter(c=>c.path==='character/equipment/equip').length,1);
});

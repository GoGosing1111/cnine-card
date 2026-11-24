import assert from 'node:assert/strict';
import test from 'node:test';
import {drawBlueprintDrop,blueprintDropItem} from '../functions/_blueprint_drop.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';


test('one base roll per result and six equally likely chapters only on a hit',()=>{
 for(const [source,threshold] of [['LEGION',6],['APOCALYPSE',6],['NOX',200]]){
  const wins=Array.from({length:10000},(_,sample)=>drawBlueprintDrop(source,bound=>bound===10000?sample:0)).filter(Boolean);
  assert.equal(wins.length,threshold);
  assert.equal(drawBlueprintDrop(source,bound=>{assert.equal(bound,10000);return threshold;}),null);
  const codes=Array.from({length:6},(_,index)=>drawBlueprintDrop(source,bound=>bound===6?index:threshold-1));
  assert.equal(new Set(codes).size,6);
  for(const code of codes){
   const item=blueprintDropItem(code,'receipt');
   assert.equal(item.quantity,1);
   assert.equal(item.ref,code);
   assert.match(item.image,/^(\/assets\/items\/)(scar|m14)-blueprint-chapter-[123]-v1\.webp$/);
  }
 }
});
const scar='SCAR_BLUEPRINT_CHAPTER_1';
const forceFirst=(t)=>t.mock.method(crypto,'getRandomValues',buffer=>{buffer.fill(0);return buffer;});
test('solo terminal settlement saves a picked blueprint and retries without another grant',async t=>{
 const f=await legionFixture({postgres:true});
 t.after(f.close);
 const exec=(sql,...args)=>f.DB.prepare(sql).bind(...args).run();
 await exec('INSERT INTO app_meta(key,value) VALUES(?,?)',LEGION_HUNT_SETTINGS_KEY,JSON.stringify({...defaultLegionHuntPolicy(),mode:'ON'}));
 await exec('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',scar,'SCAR 설계도 1장','SPECIAL',blueprintDropItem(scar).image);
 f.deps.createSession=options=>Object.assign(restoreHuntSession({
  id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
  timeLimit:1000,eventTimes:[1000],timeline:[{seq:1,combatAtMs:1000,type:'RESULT',winner:'A'}],outcome:{}
 },{now:options.now}),{payload:{}});
 f.setUser(f.player);
 const start=await f.call('legion-hunt/start',{difficulty:'normal'});
 assert.equal(start.status,200);
 const {id}=start.body;
 assert.equal((await f.call('legion-hunt/begin',{id})).status,200);
 f.clock.now+=1001;
 forceFirst(t);
 const finish=()=>f.call('legion-hunt/finish',{id,seq:1});
 const result=await finish();
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.reason,'CLEAR');
 assert.ok(result.body.inventory.some(item=>item.ref===scar&&item.quantity===1));
 assert.deepEqual((await finish()).body,result.body);
 assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=?').bind(scar).first()).n),1);
});

test('party settlement shows and grants only its saved personal blueprint once',async t=>{
 const f=await citadelFixture({postgres:true});
 t.after(f.close);
 await f.exec('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',scar,'SCAR 설계도 1장','SPECIAL',blueprintDropItem(scar).image);
 const state=async(user,action,body)=>{
  const r=await f.action(user,action,body);
  assert.equal(r.status,200,JSON.stringify(r.body));
  return r.body.state;
 };
 const {id}=await state(1,'create',{requestId:'party-blueprint-fixture',tier:'keep'});
 await state(2,'join',{id});
 for(const user of [1,2])await state(user,'ready',{id,...f.selection(user-1)});
 await state(1,'start',{id});
 await state(1,'loaded',{id});
 const mocked=forceFirst(t);
 const ready=await state(2,'loaded',{id});
 mocked.mock.restore();
 assert.equal(ready.status,'ACTIVE');
 assert.ok(!ready.drops.some(item=>item.ref===scar));
 f.clock.now=ready.startsAt+ready.duration+1;
 for(const user of [1,2]){
  const result=await state(user,'state?id='+id);
  assert.ok(result.drops.some(item=>item.ref===scar&&item.quantity===1));
  assert.equal((await state(user,'claim',{id})).claimed,true);
  assert.equal((await state(user,'claim',{id})).claimed,true);
 }
 assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=?').bind(scar).first()).n),2);
});

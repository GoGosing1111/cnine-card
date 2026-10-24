import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {GroundDrops} from '../preview/sustained-hunt-v2/source/GroundDrops.js';
import {Assets,Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';

const source=fs.readFileSync('preview/sustained-hunt-v2/app.js','utf8');
const reveal=source.slice(source.indexOf('  function queueDropReveal('),source.indexOf('  function buttons()'));
test('a stalled drop image cannot block later KO requests or the settlement queue',async()=>{
 const calls=[];let release;
 const image=new Promise(resolve=>release=resolve);
 const context={setTimeout,Promise,Map,Number,engine:{instances:new Map(),groundDrops:{add:()=>image}},
  epoch:1,session:'same-run',pendingReveals:[],reveals:Promise.resolve(),playing:true,finishing:false,
  showCoins(){},inventory(){},message(){},errorText:e=>e.message,
  request:async(action,body)=>{calls.push({action,...body});return {drops:[{id:'drop'}]};}};
 const queue=vm.runInNewContext(reveal+';queueDropReveal',context);
 try{
  queue({seq:1});await new Promise(r=>setTimeout(r,30));queue({seq:2});
  const drained=await Promise.race([context.reveals.then(()=>true),new Promise(r=>setTimeout(()=>r(false),150))]);
  assert.equal(drained,true,'finish awaits this exact queue; cosmetic loading must not hold it');
  assert.deepEqual(calls.flatMap(c=>Array.from(c.seqs)),[1,2]);
 }finally{release();await context.reveals;}
});

test('manual pickup and magnet receipts work before texture resolution; late loads cannot revive cleared drops',async t=>{
 let release;const pending=new Promise(resolve=>release=resolve);t.mock.method(Assets,'load',()=>pending);
 const oldDocument=globalThis.document,node=()=>({dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},remove(){},append(){},querySelector(){return node();}});
 globalThis.document={createElement:node};let picked=0,claimed=0;
 const drops=Object.assign(Object.create(GroundDrops.prototype),{rows:new Map(),absorbed:new Set(),revision:0,host:node(),render(){},
  engine:{huntPaused:false,effectLayer:new Container()},claim:async()=>{claimed++;return {item:{quantity:3}};},onPicked:()=>picked++});
 const drop={id:'manual',state:'GROUND',expiresAt:Date.now()+10000,position:{x:.5,y:.5},item:{name:'확정 아이템',quantity:3,image:'pending.webp'}};
 try{
  const added=drops.add(drop,Date.now());assert.equal(drops.rows.size,1,'pickup exists immediately, without awaiting its art');await added;
  await drops.rows.get(drop.id).button.onclick({isTrusted:true});assert.equal(claimed,1);assert.equal(picked,1);assert.equal(drops.rows.size,0);
  const auto={...drop,id:'automatic',state:'CLAIMED'},receipt={automatic:true};await drops.add(auto,Date.now(),receipt);assert.equal(picked,2);await drops.add(auto,Date.now(),receipt);assert.equal(picked,2);
  drops.clear();release(Texture.EMPTY);await new Promise(r=>setTimeout(r,20));assert.equal(drops.rows.size,0);assert.equal(picked,2);
 }finally{drops.clear();drops.engine.effectLayer.destroy({children:true});globalThis.document=oldDocument;gsap.ticker.sleep();}
});

const key='legion_hunt_owner_session_v1:2';
const saved=async f=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value);
const write=async(f,run)=>f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(run),key).run();
const wallet=async f=>Number((await f.DB.prepare('SELECT coin FROM users WHERE id=2').first()).coin);
const count=async f=>Number((await f.DB.prepare('SELECT COALESCE(SUM(quantity),0) n FROM cnine_user_inventory WHERE user_id=2').first()).n);
async function fixture(postgres){
 const f=await legionFixture({postgres});f.clock.now=Date.parse('2026-10-24T12:00:00+09:00');
 f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},timeLimit:1000,
  eventTimes:[100,200,900],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,huntKill:true},{seq:3,combatAtMs:900,type:'RESULT',winner:'A'}],outcome:{winner:'A'}},{now:options.now}),{payload:{}});
 await f.configure(3);const {body}=await f.call('admin/legion-hunt');body.policy.mode='ON';await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'});f.setUser(f.player);
 const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200);f.id=r.body.id;
 await f.call('legion-hunt/begin',{id:f.id});f.clock.now+=300;
 const drop=(await f.call('legion-hunt/reveal',{id:f.id,seq:1})).body.drop;
 await f.call('legion-hunt/claim',{id:f.id,dropId:drop.id,token:drop.token,...drop.position});return f;
}
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+': paid interrupted runs settle only the saved bag once, retaining entry and coins',async()=>{
  const f=await fixture(postgres);try{
   const paid=await wallet(f);assert.ok(paid>0);assert.equal(await count(f),0);
   let run=await saved(f);run.state.magnet=true;run.state.ended=true;run.interruption={kind:'INTERRUPTED',refunded:false};await write(f,run);
   f.clock.now+=31*60000;
   f.fail('INSERT INTO inventory_logs');const failed=await f.call('legion-hunt/recover',{});assert.equal(failed.status,503);
   assert.equal(await count(f),0);assert.equal((await saved(f)).rewardStatus,'PENDING');
   assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,503);
   f.fail('');f.loseReply();assert.equal((await f.call('legion-hunt/recover',{})).status,503);
   const result=await f.call('legion-hunt/recover',{});assert.equal(result.status,200);
   run=await saved(f);assert.equal(run.rewardStatus,'SETTLED');assert.equal(run.state.receipt.reason,'RETREAT');assert.equal(run.state.lastAck,1);
   assert.equal(await count(f),3);assert.equal(await wallet(f),paid);assert.equal(result.body.entries.current,9);
   assert.equal((await f.call('legion-hunt/finish',{id:f.id,seq:3})).body.inventory[0].quantity,3);
   await f.call('legion-hunt/cancel',{id:f.id});assert.equal(await count(f),3);assert.equal(await wallet(f),paid);
  }finally{await f.close();}
 });
}
test('recovery honors the reward OFF gate and never rerolls a missing magnet drop below the saved cursor',async()=>{
 const f=await fixture(true);try{
  const paid=await wallet(f),run=await saved(f);run.state.magnet=true;run.state.lastAck=2;await write(f,run);
  f.setUser(f.owner);const {body}=await f.call('admin/legion-hunt');body.policy.mode='OFF';await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'});f.setUser(f.player);
  assert.equal((await f.call('legion-hunt/recover',{})).status,423);assert.equal(await count(f),0);
  const pending=await saved(f);assert.equal(pending.rewardStatus,'PENDING');assert.equal(pending.state.receipt.inventory[0].quantity,3);
  f.setUser(f.owner);const current=(await f.call('admin/legion-hunt')).body.policy;current.mode='ON';assert.equal((await f.call('admin/legion-hunt',{policy:current},{method:'PATCH'})).status,200);f.setUser(f.player);
  assert.equal((await f.call('legion-hunt/recover',{})).status,200);assert.equal(await count(f),3);assert.equal(await wallet(f),paid);
 }finally{await f.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {emptyPetDraft,emptyPetCmsDocument} from '../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {COMPANION_REVIEW_CARDS} from '../functions/_companion_preparation.js';

test('owned magnet snapshot uses real Legion API; bag, finish rollback, replay and interruption never duplicate or prematurely grant',async t=>{
  const f=await legionFixture({postgres:true});t.after(()=>f.close());
  const art=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON'),pet={...emptyPetDraft(art.code),name:art.name,buffs:[{type:'SPEED_PERCENT',percent:10}]};
  for(const [key,value] of [['pet_cms_preparation_v1',{revision:1,audit:[],document:{...emptyPetCmsDocument(),pets:[pet]}}],['pet_collection_v1:2',{revision:1,pets:{[pet.code]:1}}],['pet_loadout_v1:2',{revision:1,petCode:pet.code,audit:[]}],['pet_potentials_v1:2',{revision:1,pets:{[pet.code]:{potential:'MAGNET',attempts:1}}}]]){
    await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(key,JSON.stringify(value)).run();
  }
  let snapshots=[];f.deps.createSession=options=>{
    snapshots.push(options.snapshot.pet);return Object.assign(restoreHuntSession({id:crypto.randomUUID(),magnet:options.snapshot.pet?.magnet===true,policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
    timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,type:'RESULT',winner:'A'}],outcome:{winner:'A'}},{now:options.now}),{payload:{}});
  };
  const configured=await f.call('admin/legion-hunt'),policy=configured.body.policy;
  policy.mode='ON';policy.items=[{...configured.body.catalog.find(i=>i.type==='INVENTORY_ITEM'),enabled:true,weight:1,minQuantity:3,maxQuantity:3}];
  policy.difficulties.forEach(d=>{d.dropPercent=100;d.bossDropPercent=100;d.lifetimeSeconds=9;});
  assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);f.setUser(f.player);
  assert.equal((await f.call('legion-hunt/start',{difficulty:'normal',magnet:true})).status,400);
  const start=async()=>{const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal((await f.call('legion-hunt/begin',{id:r.body.id})).status,200);f.clock.now+=300;return r.body.id;};
  const count=async()=>Number((await f.DB.prepare('SELECT COALESCE(SUM(quantity),0) n FROM cnine_user_inventory WHERE user_id=2').first()).n);
  const id=await start();assert.equal(snapshots[0].magnet,true);
  let r=await f.call('legion-hunt/reveal',{id,seqs:[1]});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.autoClaims.length,1);assert.equal(r.body.pendingRewards,true);assert.equal(await count(),0);
  const drop=r.body.drops[0];assert.equal((await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position})).status,200);assert.equal(await count(),0);
  f.fail('INSERT INTO inventory_logs');r=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(r.status,503,JSON.stringify(r.body));f.fail('');assert.equal(await count(),0);
  r=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.picked,1);assert.equal(r.body.inventory[0].quantity,3);assert.equal(await count(),3);
  assert.deepEqual((await f.call('legion-hunt/finish',{id,seq:2})).body,r.body);assert.equal(await count(),3);
  const interrupted=await start();assert.equal((await f.call('legion-hunt/reveal',{id:interrupted,seqs:[1]})).body.picked,1);
  assert.equal((await f.call('legion-hunt/cancel',{id:interrupted})).status,200);assert.equal(await count(),3);
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM inventory_logs').first()).n),1);
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM joint_atomic_guards_v1').first()).n),0);
});

test('multiple owner pets only buff their own squad and preserve the unowned squad',()=>{
  const pet=ownerId=>({ownerId,definition:{...emptyPetDraft('PET-BONGSOON'),enabled:true,battleSprite:PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON').sourceArt,buffs:[{type:'ATTACK_PERCENT',percent:10}]}});
  const team=COMPANION_REVIEW_CARDS.map((c,i)=>({...buildFighter(c,i,'A',null,'PVP'),id:'A:OWNER:'+ (i<2?1:i<4?2:3) +':CARD:'+i,ownerId:i<2?1:i<4?2:3}));
  const result=simulateBattleV2Preview({teamA:team,teamB:COMPANION_REVIEW_CARDS.map((c,i)=>buildFighter(c,i,'B',null,'PVP')),pets:{A:[pet(1),pet(2)]},petMode:'PVP',seed:7,maxActions:1});
  const buffs=result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');assert.equal(buffs.length,2);
  for(const e of buffs){assert.equal(e.hits.length,2);assert(e.hits.every(h=>h.targetId.includes(':OWNER:'+e.ownerId+':')));for(const h of e.hits)assert.equal(h.after.attack,Math.round(h.before.attack*1.1));}
  assert(!buffs.some(e=>e.hits.some(h=>h.targetId.includes(':OWNER:3:'))));
});

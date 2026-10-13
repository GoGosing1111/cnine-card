import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {defaultIconRoles,iconRoleSnapshot,validateIconRoles} from '../shared/icon-roles-v1.mjs';
import {emptyIconCmsDocument,validateIconCmsDocument} from '../shared/icon-cms-model-v1.mjs';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_FUSION_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {runIconFusion} from '../functions/_icon_fusion.js';
const id='CN-1C000009',code='ICON-GUSUDAENG';
const card=(mode='PVE',tuning={})=>{const document=defaultIconRoles();Object.assign(document.cards.find(c=>c.code===code).tuning,tuning);return {id,title:'구수댕',grade:'ICON',power:180000,iconRole:iconRoleSnapshot({id,grade:'ICON'},document,mode)};};
function harness(count=3,mode='PVE',dodge=false,tuning={}){
 const actor=buildFighter(card(mode,tuning),0,'A',null,mode),ally=buildFighter({id:'ally',grade:'FUR',power:180000},1,'A',null,mode);
 const foes=Array.from({length:count},(_,i)=>buildFighter({id:'foe-'+i,grade:'FUR',power:180000},i,'B',null,mode));
 for(const f of [actor,ally,...foes])Object.assign(f,{hp:100000,maxHp:100000,attack:1000,shield:0,maxShield:0,damageDealt:0});
 const events=[];let runtime,sealed=false;
 const raw=(t,n,o)=>{const hp=t.hp,shield=t.shield,absorbed=Math.min(shield,n);t.shield-=absorbed;t.hp=Math.max(0,hp-n+absorbed);const r={hpDamage:hp-t.hp,absorbed};runtime.onDamage(t,r,o);return r;};
 const damage=(t,n,o={})=>raw(t,runtime.beforeDamage(t,n,o),o);
 runtime=createIconCombatRuntime({teams:{A:[actor,ally],B:foes},hit:(a,t,m)=>({damage:Math.round(a.attack*m),dodge}),rawDamage:raw,damage,knockout:t=>{if(t.hp>0)return false;t.alive=false;return true;},emit:(type,e)=>events.push({type,...e}),sealed:a=>a===actor&&sealed});
 const cast=n=>{actor.actions=n;const used=runtime.beforeAction(actor);runtime.endAction(actor);return used;};cast(2);
 return {actor,ally,foes,events,runtime,cast,damage,seal:v=>{sealed=v;},echo:()=>events.filter(e=>e.type==='ICON_ECHO')};
}
test('Gusudaeng adds a ninth distinct LINK identity and extends exact historical settings without mutating input',()=>{
 assert.ok(ICON_FUSION_CARDS.some(c=>c.code===code));assert.equal(new Set(defaultIconRoles().cards.map(c=>c.code)).size,9);
 for(const n of [7,8])for(const [make,validate] of [[defaultIconRoles,validateIconRoles],[emptyIconCmsDocument,validateIconCmsDocument]]){
  const doc=make();doc.cards=doc.cards.slice(0,n);const before=JSON.stringify(doc),expanded=validate(doc,{allowLegacy:true});
  assert.equal(expanded.cards.length,9);assert.deepEqual(expanded.cards.slice(0,n),doc.cards);assert.equal(JSON.stringify(doc),before);assert.throws(()=>validate(doc));
  doc.cards[0]=doc.cards[1];assert.throws(()=>validate(doc,{allowLegacy:true}));
 }
});
test('one direct allied action echoes to other marks once, respects PVE/PVP scale and never recurses',()=>{
 for(const mode of ['PVE','PVP']){
  const h=harness(3,mode);assert.equal(h.foes.filter(t=>t.iconLink).length,3);h.ally.actions=1;
  h.damage(h.foes[0],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,2);
  assert.ok(h.echo().every(e=>e.damage===Math.round(300*(mode==='PVE'?1.05:.9))&&e.linkedFromId===h.foes[0].id));
  h.damage(h.foes[0],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,2);
  h.ally.actions++;h.damage(h.foes[0],1000,{actor:h.ally,direct:true,iconSecondary:true});h.damage(h.foes[0],1000,{actor:h.ally,iconIndirect:true});assert.equal(h.echo().length,2);
  h.damage(h.foes[0],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,4);
 }
});
test('solo boss receives bounded focused extra damage; each cast has a finite total budget',()=>{
 const h=harness(1);h.foes[0].isBoss=true;
 for(let i=1;i<20;i++){h.ally.actions=i;h.damage(h.foes[0],100,{actor:h.ally,direct:true});}
 assert.equal(h.echo().length,19);assert.ok(h.echo().every(e=>e.solo&&e.damage===47));
 const many=harness(3);for(let i=1;i<40;i++){many.ally.actions=i;many.damage(many.foes[i%3],1000,{actor:many.ally,direct:true});}
 assert.ok(many.echo().reduce((n,e)=>n+e.damage+e.absorbed,0)<=6300);assert.equal(many.runtime.snapshot()[0].echoRemaining,0);
});
test('PVE-only tuning improves strikes and solo echoes while old snapshots and PVP retain their damage',()=>{
 for(const mode of ['PVE','PVP']){
  const old=harness(1,mode,false,{pveScale:100}),next=harness(1,mode);
  for(const h of [old,next]){h.ally.actions=1;h.damage(h.foes[0],1000,{actor:h.ally,direct:true});}
  assert.equal(old.echo()[0].damage,mode==='PVE'?450:405);
  assert.equal(next.echo()[0].damage,mode==='PVE'?473:405);
  const strike=h=>h.events.find(e=>e.type==='ICON_SKILL').hits[0].damage;
  assert.equal(strike(old),mode==='PVE'?1700:1530);assert.equal(strike(next),mode==='PVE'?1785:1530);
 }
});
test('cleanse, expiry, seals, caster death and evasion suppress links; cooldown and cast counts remain finite',()=>{
 const h=harness(3);assert.ok(h.runtime.hasDebuff(h.foes[0]));assert.equal(h.runtime.cleanse(h.foes[0]),true);h.ally.actions=1;
 h.damage(h.foes[0],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,0);
 h.seal(true);h.damage(h.foes[1],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,0);h.seal(false);
 h.actor.alive=false;h.damage(h.foes[1],1000,{actor:h.ally,direct:true});assert.equal(h.echo().length,0);h.actor.alive=true;
 h.cast(5);assert.ok(h.foes.every(t=>!t.iconLink));assert.equal(h.cast(5),false);
 for(let i=6;i<=70;i++)h.cast(i);assert.equal(h.events.filter(e=>e.type==='ICON_SKILL').length,6);
 assert.ok(harness(3,'PVE',true).foes.every(t=>!t.iconLink));
 const capped=harness(3);capped.foes[1].maxHp=1000;capped.ally.actions=1;capped.damage(capped.foes[0],10000,{actor:capped.ally,direct:true});assert.ok(capped.echo().find(e=>e.targetId===capped.foes[1].id).damage<=60);
});
test('real PVE/PVP authority emits link and echo events, deterministic and bounded',()=>{
 const rows=mode=>[...Array.from({length:4},(_,i)=>({id:'plain-'+i,grade:i<2?'FUR':'ZENITH',power:180000})),card(mode)];
 for(const mode of ['PVE','PVP']){
  const run=()=>mode==='PVE'?createPveBattleV2({cards:rows(mode),monster:{id:'boss',name:'Boss',power:1400000,is_boss:1},seed:92}):createPvpBattleV2({attackerCards:rows(mode),defenderCards:rows(mode),seed:92});
  const result=run();assert.deepEqual(result,run());assert.ok(result.result.timeline.some(e=>e.type==='ICON_SKILL'&&e.iconCode===code));assert.ok(result.result.timeline.some(e=>e.type==='ICON_ECHO'),mode+' has real direct-hit callbacks');assert.ok(result.result.timeline.length<1500);
 }
});
test('new ICON uses the existing paid fusion transaction and replay receipt',async t=>{
 const f=await iconFusionFixture(t,{postgres:true}),body={...f.body(),targetCode:code};
 const result=await runIconFusion(f.env,f.user,body,{randomInt:()=>0});assert.equal(result.target.cardId,id);assert.equal(result.success,true);
 const before=await f.snapshot();assert.equal((await runIconFusion(f.env,f.user,body)).replayed,true);assert.deepEqual(await f.snapshot(),before);
});
test('separate original portrait, matte SD and both distinct sixteen-frame effect atlases are preserved',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
 const m=JSON.parse(read('preview/icon-battle-assets-v1/manifest.json')),sd=m.characters.find(c=>c.code===code);
 assert.equal(hash(read('preview/icon-battle-assets-v1/'+sd.source)),sd.sourceSha256);assert.equal(sd.runtimeAlpha.edgeMax,0);assert.ok(sd.runtimeAlpha.transparentFraction>.6);
 assert.notEqual(sd.sourceArt,'preview/icon-battle-assets-v1/'+sd.runtime);
 for(const name of [sd.hitEffect,sd.skillEffect]){const fx=m.effects.find(e=>e.id===name);assert.equal(fx.frameCount,16);assert.equal(new Set(fx.frames.map(f=>f.rawSha256)).size,16);assert.ok(fx.frames.every(f=>f.edgeMax<=12));}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ICON_LIVE_CARDS,ICON_FUSION_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {defaultIconRoles,validateIconRoles,iconDefinition,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {emptyIconCmsDocument,validateIconCmsDocument,ICON_CMS_KEY} from '../shared/icon-cms-model-v1.mjs';
import {readIconRoleState} from '../functions/_icon_roles.js';
import {iconCmsFixture} from './helpers/icon-cms-fixture.mjs';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {iconFusionOverview,runIconFusion} from '../functions/_icon_fusion.js';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
const code='ICON-ZEUS-CHEOLGU',id='CN-1C000008';
test('ordinary fusion excludes Zeus and rejects forged selection before DB, RNG or payment',async t=>{
 assert.ok(ICON_LIVE_CARDS.some(c=>c.cardId===id));assert.equal(ICON_FUSION_CARDS.length,7);assert.ok(!ICON_FUSION_CARDS.some(c=>c.cardId===id));
 let queries=0;
 await assert.rejects(()=>runIconFusion({DB:{prepare(){queries++;throw Error('Must not read');}}},{id:7},{requestId:crypto.randomUUID(),policyVersion:2,superstarId:'CN-SUPER',furId:'CN-FUR',targetCode:code},{randomInt(){throw Error('Must not roll');}}),e=>e.code==='ICON_FUSION_INPUT');
 assert.equal(queries,0);
 const f=await iconFusionFixture(null,{postgres:true});try{
  const before=await f.snapshot(),overview=await iconFusionOverview(f.env,f.user);
  assert.equal(overview.enabled,true);assert.equal(overview.catalog.length,7);assert.ok(!overview.catalog.some(c=>c.cardId===id));
  await assert.rejects(()=>runIconFusion(f.env,f.user,{...f.body(),targetCode:code}),e=>e.code==='ICON_FUSION_INPUT');assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close();}
});
test('previous seven-role and CMS documents are extended only on read without changing stored settings',async()=>{
 const f=await iconCmsFixture();try{
  const roles=defaultIconRoles();roles.cards.pop();roles.cards[0].tuning.damagePercent=237;roles.cards[4].enabled=false;roles.scopes.pvp=false;
  const cms=emptyIconCmsDocument();cms.cards.pop();cms.cards[0].notes='keep previous draft';cms.cards[0].draft.effects[0].value=23;
  const roleRaw=JSON.stringify({revision:19,document:roles,audit:[],updatedAt:null,updatedBy:1}),cmsRaw=JSON.stringify({revision:7,document:cms,audit:[],updatedAt:null,updatedBy:1});
  for(const [key,value] of [['icon_role_settings_v1',roleRaw],[ICON_CMS_KEY,cmsRaw]])await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,value]);
  const result=await readIconRoleState(f.env);assert.equal(result.raw,roleRaw);assert.equal(result.state.revision,19);
  assert.deepEqual(result.state.document.cards.slice(0,7),roles.cards);assert.deepEqual(result.state.document.scopes,roles.scopes);
  assert.equal(result.state.document.cards[7].code,code);assert.equal(iconRoleSnapshot({id,grade:'ICON'},result.state.document,'PVP'),null);
  const response=await f.call();assert.equal(response.status,200);assert.equal(response.body.revision,7);assert.deepEqual(response.body.document.cards.slice(0,7),cms.cards);assert.equal(response.body.document.cards[7].code,code);
  assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[ICON_CMS_KEY])).rows[0].value,cmsRaw);
  assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',['icon_role_settings_v1'])).rows[0].value,roleRaw);
  assert.throws(()=>validateIconRoles(roles));assert.throws(()=>validateIconCmsDocument(cms));
  const bad=structuredClone(roles);bad.cards[1]=bad.cards[0];assert.throws(()=>validateIconRoles(bad,{allowLegacy:true}));
  const badCms=structuredClone(cms);badCms.cards[0].code='UNKNOWN';assert.throws(()=>validateIconCmsDocument(badCms,{allowLegacy:true}));
 }finally{await f.close();}
});
test('Zeus channels, respects seals, uses bounded multi-target lightning and finite casts in PVE/PVP',()=>{
 for(const mode of ['PVE','PVP']){
  const def=iconDefinition(id),snapshot=iconRoleSnapshot({id,grade:'ICON'},defaultIconRoles(),mode,2);
  const actor=buildFighter({id,title:def.name,grade:'ICON',power:180000,iconRole:snapshot},0,'A',null,mode);
  const foes=Array.from({length:4},(_,i)=>({...buildFighter({id:'enemy-'+i,grade:'FUR',power:180000},i,'B',null,mode),hp:1e12,maxHp:1e12}));
  const events=[];let blocked=false;
  const runtime=createIconCombatRuntime({teams:{A:[actor],B:foes},sealed:()=>blocked,hit:(a,t,m,o)=>{assert.equal(o.s2DefenseIgnore,.25);return {damage:Math.round(a.attack*m),dodge:false};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,e)=>events.push({type,...e})});
  actor.actions=2;runtime.beforeAction(actor);assert.ok(events.some(e=>e.status==='CHANNEL'&&e.label==='뇌신의 권능'));assert.equal(events.filter(e=>e.type==='ICON_SKILL').length,0);
  blocked=true;actor.actions=3;runtime.beforeAction(actor);assert.ok(events.some(e=>e.status==='INTERRUPTED'));blocked=false;
  for(let n=4;n<=65;n++){actor.actions=n;runtime.beforeAction(actor);runtime.endAction(actor);}
  const casts=events.filter(e=>e.type==='ICON_SKILL');assert.equal(casts.length,6);
  for(const e of casts){assert.equal(e.iconCode,code);assert.equal(e.label,'올림포스의 심판');assert.equal(new Set(e.hits.map(h=>h.targetId)).size,3);assert.ok(e.hits.every(h=>h.damage<=h.targetMaxHp*.46));}
 }
});
test('original photo bytes, separate transparent SD and both 16-frame effects are registered',async()=>{
 const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
 const card=ICON_LIVE_CARDS.find(c=>c.cardId===id),manifest=JSON.parse(await read('preview/icon-battle-assets-v1/manifest.json')),sd=manifest.characters.find(c=>c.code===code);
 assert.equal(hash(await read(card.originalArt)),card.originalSha256);assert.equal(hash(await read(card.sourceArt)),card.sourceSha256);assert.equal(card.sourceWidth,1254);assert.equal(sd.runtimeAlpha.edgeMax,0);assert.ok(sd.runtimeAlpha.transparentFraction>.5);
 const live=JSON.parse(await read('assets/ui/project-v/characters/icon/manifest-v1.json')).characters.find(c=>c.cardId===id);assert.equal(live.sourceArt,card.sourceArt);assert.equal(live.sha256,sd.runtimeSha256);
 for(const name of [sd.hitEffect,sd.skillEffect]){const fx=manifest.effects.find(e=>e.id===name);assert.equal(fx.frameCount,16);assert.equal(new Set(fx.frames.map(f=>f.rawSha256)).size,16);assert.ok(fx.frames.every(f=>f.edgeMax<=12));assert.equal(hash(await read('preview/icon-battle-assets-v1/'+fx.runtime)),fx.runtimeSha256);}
});


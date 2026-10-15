import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {defaultIconRoles,validateIconRoles,iconRoleSnapshot,ICON_ROLES_KEY} from '../shared/icon-roles-v1.mjs';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {PATCHES,inspectBuff,applyBuff} from '../scripts/ops/icon-joeun-healing-buff-20261015.mjs';
import {buffDocument} from '../scripts/ops/icon-joeun-healing-buff-20261015.mjs';

const code='ICON-OH-JOEUN',cardId='CN-1C000004';
function beforeDocument(){const d=defaultIconRoles();Object.assign(d.cards.find(c=>c.code===code).tuning,{firstAction:2,cooldownActions:4,maxCasts:6,pveScale:125,pvpScale:150,healPercent:25,resonancePercent:3,maxStacks:8,healBudgetPercent:150,nextAttackPercent:35,durationActions:3});return d;}
async function fixture(){const db=new PGlite();await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);const f={db,query:(sql,args=[])=>db.query(sql,args)};const legacy=beforeDocument();legacy.cards.pop();await f.query('INSERT INTO app_meta VALUES($1,$2,$3)',[ICON_ROLES_KEY,JSON.stringify({revision:2,document:legacy,audit:[]}),null]);return f;}
const snapshot=async f=>({meta:(await f.query('SELECT * FROM app_meta ORDER BY key')).rows,audit:(await f.query('SELECT * FROM admin_logs ORDER BY id')).rows});

test('only five Joeun healing fields change; all other roles, powers, flags and old snapshots remain valid',()=>{
 const before=beforeDocument(),after=buffDocument(before);assert.deepEqual(validateIconRoles(before),before);assert.deepEqual(validateIconRoles(after),after);
 assert.deepEqual(after.cards.filter(c=>c.code!==code),before.cards.filter(c=>c.code!==code));assert.deepEqual(after.scopes,before.scopes);assert.equal(after.enabled,before.enabled);
 const old=before.cards.find(c=>c.code===code).tuning,next=after.cards.find(c=>c.code===code).tuning;
 assert.deepEqual(Object.keys(next).filter(k=>next[k]!==old[k]).sort(),Object.keys(PATCHES[code]).sort());
 const invalid=structuredClone(after);invalid.cards.find(c=>c.code===code).tuning.healPercent=41;assert.throws(()=>validateIconRoles(invalid));
 assert.equal(old.healPercent,25);assert.equal(old.healBudgetPercent,150);
});
test('authorized CMS update handles the legacy roster, is atomic and replays without another audit',async()=>{
 const f=await fixture();try{const plan=await inspectBuff(f),initial=await snapshot(f);assert.equal(plan.documentBefore.cards.length,9);
  await applyBuff(f,{expectedStateHash:plan.stateHash,dryRun:true});assert.deepEqual(await snapshot(f),initial);
  const saved=await applyBuff(f,{expectedStateHash:plan.stateHash});assert.equal(saved.receipt.revisionAfter,3);assert.deepEqual(saved.receipt.documentAfter,plan.documentAfter);
  const after=await snapshot(f);assert.equal((await applyBuff(f,{expectedStateHash:plan.stateHash})).replayed,true);assert.deepEqual(await snapshot(f),after);
 }finally{await f.db.close();}
});
test('stale CMS plans and audit failures never overwrite configuration or leave a pending operation',async()=>{
 const f=await fixture();try{const plan=await inspectBuff(f),before=await snapshot(f);
  const failing={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('audit failure');return f.query(sql,args);}};
  await assert.rejects(()=>applyBuff(failing,{expectedStateHash:plan.stateHash}),/audit failure/);assert.deepEqual(await snapshot(f),before);
  const changed={revision:5,document:beforeDocument(),audit:[]};changed.document.cards[0].tuning.damagePercent=199;
  await f.query('UPDATE app_meta SET value=$2 WHERE key=$1',[ICON_ROLES_KEY,JSON.stringify(changed)]);const concurrent=await snapshot(f);
  await assert.rejects(()=>applyBuff(f,{expectedStateHash:plan.stateHash}),/CMS changed/);assert.deepEqual(await snapshot(f),concurrent);
 }finally{await f.db.close();}
});
for(const mode of ['PVE','PVP'])test(`${mode}: stronger actual healing, faster casts, finite total, lowest HP ratio and overtime remain enforced`,()=>{
 const results=[];
 for(const document of [beforeDocument(),buffDocument(beforeDocument())]){
  const input={id:cardId,grade:'ICON',power:180000},joeun=buildFighter({...input,iconRole:iconRoleSnapshot(input,document,mode)},0,'A',null,mode);
  const target=buildFighter({id:'injured-mercenary',grade:'FUR',power:180000},1,'A',null,mode),other=buildFighter({id:'injured-card',grade:'FUR',power:180000},2,'A',null,mode),enemy=buildFighter({id:'enemy',power:180000},0,'B',null,mode);
  joeun.maxHp=joeun.hp=10000;target.maxHp=10000;target.hp=1;target.isMercenary=true;other.maxHp=1000;other.hp=500;
  const events=[],runtime=createIconCombatRuntime({teams:{A:[joeun,target,other],B:[enemy]},hit:()=>{throw Error('Healing must not attack');},damage:()=>{},rawDamage:()=>{},knockout:()=>false,emit:(type,row)=>events.push({type,...row})});
  const tuning=joeun.iconRole.tuning;joeun.actions=tuning.firstAction;assert.equal(runtime.beforeAction(joeun),true);
  const first=events.find(e=>e.type==='ICON_SKILL');assert.equal(first.targetId,target.id);assert.equal(first.targets[0].amount,10000*tuning.healPercent/100*(mode==='PVE'?1.25:1.5));assert.equal(other.hp,500);
  joeun.actions++;assert.equal(runtime.beforeAction(joeun),false);target.hp=1;
  for(let i=1;i<12;i++){joeun.actions=tuning.firstAction+i*tuning.cooldownActions;runtime.beforeAction(joeun);target.hp=1;}
  const healing=events.filter(e=>e.type==='ICON_SKILL').reduce((sum,e)=>sum+e.targets.reduce((n,t)=>n+t.amount,0),0);
  assert.equal(healing,joeun.maxHp*tuning.healBudgetPercent/100);assert.equal(runtime.snapshot()[0].healRemaining,0);assert.ok(runtime.snapshot()[0].casts<=tuning.maxCasts);
  assert.equal(runtime.beforeAction(joeun,{healingAllowed:false}),false);assert.ok([joeun,target,other].every(c=>Number.isFinite(c.hp)&&c.hp>=0&&c.hp<=c.maxHp));
  results.push({first:first.targets[0].amount,total:healing});
 }
 assert.equal(results[1].first/results[0].first,1.2);assert.equal(results[1].total/results[0].total,1.5);
});
test('cute medic SD has transparent padding and separate unchanged original portrait',async()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url)),hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
 const spec=JSON.parse(read('preview/icon-battle-assets-v1/joeun-medic-chibi-20261015.json')),manifest=JSON.parse(read('preview/icon-battle-assets-v1/manifest.json')),row=manifest.characters.find(c=>c.code===code),live=JSON.parse(read('assets/ui/project-v/characters/icon/manifest-v1.json')).characters.find(c=>c.cardId===cardId);
 assert.equal(row.source,spec.source);assert.equal(row.runtime,spec.runtime);assert.equal(hash(read('preview/icon-battle-assets-v1/'+row.source)),spec.sourceSha256);assert.equal(hash(read('preview/icon-battle-assets-v1/'+row.runtime)),row.runtimeSha256);
 assert.equal(live.battleSprite,'preview/icon-battle-assets-v1/'+spec.runtime);assert.equal(live.sha256,row.runtimeSha256);
 const original=JSON.parse(read('preview/icon-battle-assets-v1/joeun-medic-approval-20261006.json'));assert.equal(hash(read(original.sourceArt.path)),original.sourceArt.sha256);assert.equal(hash(read(original.battleSd.path)),original.battleSd.sha256);
 const meta=await sharp(read(live.battleSprite)).metadata();assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[768,768,true]);assert.equal(row.runtimeAlpha.edgeMax,0);assert.ok(row.runtimeAlpha.transparentFraction>.4);assert.ok(row.footAnchor.y>.85&&row.footAnchor.y<.96);
});

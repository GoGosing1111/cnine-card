import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {gsap} from 'gsap';
import {defaultIconRoles,iconRoleSnapshot,ICON_ROLES_KEY} from '../shared/icon-roles-v1.mjs';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {buildFighter,simulateBattleV2Preview,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {skillChipCombatEventMs} from '../shared/battle-suit-skill-chips.mjs';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {playIconEvent} from '../preview/project-v-v3/source/battle/IconRolePlayback.js';
import {PATCHES,buffDocument,inspectBuff,applyBuff,verifyBuff} from '../scripts/ops/icon-cheolgu-balance-20261017.mjs';
after(()=>gsap.ticker.sleep());
const code='ICON-ZEUS-CHEOLGU',id='CN-1C000008';
const doc=()=>buffDocument(defaultIconRoles());
function actor(mode='PVP',cardId=id){
 const card={id:cardId,title:'검수',grade:'ICON',power:180000};
 return buildFighter({...card,iconRole:iconRoleSnapshot(card,doc(),mode,4)},0,'A',null,mode);
}
function fixture(mode='PVP',cardId=id){
 const a=actor(mode,cardId),foes=Array.from({length:4},(_,i)=>({...buildFighter({id:'enemy-'+i,power:1000,grade:'FUR'},i,'B',null,mode),hp:1e12,maxHp:1e12}));
 const events=[];let blocked=false;
 const runtime=createIconCombatRuntime({teams:{A:[a],B:foes},sealed:()=>blocked,hit:()=>({damage:1e15,dodge:false}),
 damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,e)=>events.push({type,...e})});
 return {a,foes,events,runtime,block:value=>{blocked=value;}};
}
test('Zeus charges and performs the existing basic path, then casts on his second own action in PVE and PVP',()=>{
 for(const mode of ['PVE','PVP']){
  const {a,foes,events,runtime}=fixture(mode);a.actions=1;
  assert.equal(runtime.beforeAction(a),false);
  assert.equal(events.length,1);assert.equal(events[0].status,'CHANNEL');assert.equal(events[0].continuesBasic,true);
  assert.equal(runtime.snapshot()[0].casts,0);assert(foes.every(t=>t.hp===t.maxHp));
  a.actions=2;assert.equal(runtime.beforeAction(a),true);
  const cast=events.find(e=>e.type==='ICON_SKILL');assert(cast);assert.equal(cast.hits.length,3);
  assert.equal(new Set(cast.hits.map(h=>h.targetId)).size,3);
  for(const hit of cast.hits)assert.equal(hit.damage,hit.targetMaxHp*.46);
  assert.equal(runtime.snapshot()[0].nextAction,6);
 }
});
test('channel notices do not become extra battle actions or scheduled animation time',()=>{
 for(const mode of ['PVE','PVP']){
  const a=actor(mode),b=buildFighter({id:'durable',power:1000},0,'B',null,mode);
  a.speed=1e6;a.hp=a.maxHp=1e12;b.speed=1;b.hp=b.maxHp=1e12;
  const r=simulateBattleV2Preview({teamA:[a],teamB:[b],seed:1717,maxActions:12,maxCombatDurationMs:60000});
  const notices=r.timeline.filter(e=>e.actorId===a.id&&e.status==='CHANNEL');
  assert(notices.length>1);
  for(const notice of notices){
   assert.equal(notice.continuesBasic,true);
   assert.equal(skillChipCombatEventMs(notice),0);
   assert.equal(r.timeline.filter(e=>e.actorId===a.id&&e.type==='TURN'&&e.combatGroup===notice.combatGroup).length,1);
  }
  const realActions=r.timeline.filter(e=>e.type==='TURN'||e.type==='ICON_SKILL');
  assert.equal(realActions.length,r.actions);
 }
 const pace={formationCoop:false,paceActions:39,paceScale:1};
 BattleEngine.prototype.advancePace.call(pace,'ICON_STATUS',{status:'CHANNEL',continuesBasic:true});assert.equal(pace.paceActions,39);
 BattleEngine.prototype.advancePace.call(pace,'TURN');assert.equal(pace.paceActions,40);
 assert(skillChipCombatEventMs({type:'ICON_STATUS',status:'CHANNEL'})>0);
});
test('new channel notice shows the existing banner without a blocking status animation; old receipts retain their timing',async()=>{
 const target={updateState(){}},banners=[];
 const engine={visible:true,combatantById:()=>target,queueBanner:(...v)=>banners.push(v),timeline(){throw Error('No second animation');}};
 await playIconEvent(engine,{type:'ICON_STATUS',status:'CHANNEL',continuesBasic:true,iconCode:code,actorId:'a',targetId:'a'});
 assert.equal(banners.length,1);assert.equal(banners[0][0],'뇌신의 권능');
});
test('both kinds of seal cancel Zeus charging, consume no cast, and require a fresh charge',()=>{
 for(const kind of ['timed','magic']){
  const {a,events,runtime,block}=fixture();a.actions=1;runtime.beforeAction(a);
  if(kind==='timed')block(true);else a.magicSealCharges=1;
  a.actions=2;assert.equal(runtime.beforeAction(a),false);assert.equal(runtime.snapshot()[0].casts,0);
  if(kind==='timed')block(false);else assert.equal(a.magicSealCharges,0);
  a.actions=3;assert.equal(runtime.beforeAction(a),false);
  assert.equal(events.filter(e=>e.type==='ICON_SKILL').length,0);
  a.actions=4;assert.equal(runtime.beforeAction(a),true);assert.equal(runtime.snapshot()[0].casts,1);
 }
});
test('Zeus retains six casts, three targets, four-action cooldown and the 46-percent whole-cast cap',()=>{
 const {a,foes,events,runtime}=fixture();
 for(let action=1;action<=80;action++){
  for(const f of foes)f.hp=f.maxHp;
  a.actions=action;runtime.beforeAction(a);runtime.endAction(a);
 }
 const casts=events.filter(e=>e.type==='ICON_SKILL');assert.equal(casts.length,6);
 assert(casts.every(c=>c.hits.length===3&&c.hits.every(h=>h.damage<=h.targetMaxHp*.46)));
 assert.equal(events.filter(e=>e.status==='CHANNEL').length,6);
 a.alive=false;a.hp=0;a.actions++;runtime.beforeAction(a);assert.equal(events.filter(e=>e.type==='ICON_SKILL').length,6);
});
test('the other mage retains the original separate charge action and all other ICON tuning is preserved',()=>{
 const {a,events,runtime}=fixture('PVP','CN-1C000003');a.actions=2;
 assert.equal(runtime.beforeAction(a),true);assert.equal(events[0].status,'CHANNEL');assert.equal(events[0].continuesBasic,undefined);
 const before=defaultIconRoles();before.cards[0].tuning.damagePercent=211;
 const next=buffDocument(before);assert.deepEqual(next.cards.filter(c=>c.code!==code),before.cards.filter(c=>c.code!==code));
 const row=next.cards.find(c=>c.code===code);assert.deepEqual(Object.fromEntries(Object.keys(PATCHES[code]).map(k=>[k,row.tuning[k]])),PATCHES[code]);
 for(const key of ['cooldownActions','maxCasts','maxTargets','damageCapPercent','pveScale','pvpScale'])assert.equal(row.tuning[key],before.cards.find(c=>c.code===code).tuning[key]);
 assert.deepEqual(next.scopes,before.scopes);
});
async function database(){
 const db=new PGlite();
 await db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);");
 const document=defaultIconRoles();Object.assign(document.cards.find(c=>c.code===code).tuning,{firstAction:2,damagePercent:180,focusPercent:20,penetrationPercent:25});
 document.cards[0].tuning.damagePercent=211;
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[ICON_ROLES_KEY,JSON.stringify({revision:3,document,audit:[],updatedAt:null,updatedBy:1}),'before']);
 return {db,query:(sql,args=[])=>db.query(sql,args)};
}
const snapshot=async f=>({meta:(await f.query('SELECT * FROM app_meta ORDER BY key')).rows,logs:(await f.query('SELECT * FROM admin_logs ORDER BY id')).rows});
test('CMS update is audited once, changes only Zeus and replays without writes',async()=>{
 const f=await database();try{
  const plan=await inspectBuff(f),result=await applyBuff(f,{expectedStateHash:plan.stateHash});
  assert.equal(result.receipt.revisionAfter,4);assert.equal((await verifyBuff(f,result.receipt)).status,'VERIFIED');
  const state=await snapshot(f);assert.equal((await applyBuff(f,{expectedStateHash:plan.stateHash})).replayed,true);assert.deepEqual(await snapshot(f),state);
  assert.equal(result.receipt.documentAfter.cards[0].tuning.damagePercent,211);
 }finally{await f.db.close();}
});
test('dry run and failure of the audit write roll back tuning and receipt together',async()=>{
 const f=await database();try{
  const plan=await inspectBuff(f),before=await snapshot(f);
  await applyBuff(f,{expectedStateHash:plan.stateHash,dryRun:true});assert.deepEqual(await snapshot(f),before);
  const failing={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('injected audit failure');return f.query(sql,args);}};
  await assert.rejects(()=>applyBuff(failing,{expectedStateHash:plan.stateHash}),/injected/);assert.deepEqual(await snapshot(f),before);
 }finally{await f.db.close();}
});
test('stale CMS plans are rejected and an interrupted commit response is recovered by the same receipt',async()=>{
 const f=await database();try{
  const plan=await inspectBuff(f);await f.query("UPDATE app_meta SET value=replace(value,'211','212') WHERE key=$1",[ICON_ROLES_KEY]);
  const before=await snapshot(f);await assert.rejects(()=>applyBuff(f,{expectedStateHash:plan.stateHash}),/CMS changed/);assert.deepEqual(await snapshot(f),before);
  const fresh=await inspectBuff(f),uncertain={query:async(sql,args)=>{const result=await f.query(sql,args);if(sql==='COMMIT')throw Error('lost commit response');return result;}};
  await assert.rejects(()=>applyBuff(uncertain,{expectedStateHash:fresh.stateHash}),/lost commit response/);
  const committed=await snapshot(f);assert.equal((await applyBuff(f,{expectedStateHash:fresh.stateHash})).replayed,true);assert.deepEqual(await snapshot(f),committed);
 }finally{await f.db.close();}
});


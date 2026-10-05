import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryLevelDraft,mercenaryLevelReadiness,validateMercenaryLevelPolicy,initialMercenaryLevel,mercenaryLevelState,levelProgress,planMercenaryTraining,planMercenaryBreakthrough,attachMercenaryLevel,applyMercenaryLevelStats,MERCENARY_LEVEL_RELEASE_ENABLED,MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema,readMercenaryLevelState,saveMercenaryLevelPolicy,attachReleasedMercenaryLevels} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel,mercenaryLevelReceipt} from '../functions/_mercenary_level.js';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {battleConfig,loadMercenaryBattleSnapshot,mercenaryAccountState} from '../functions/_mercenary_account.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {createLevelClient} from '../mercenary-codex/leveling/client.mjs';

const policy=()=>{const p=mercenaryLevelDraft();p.mode='ON';p.sameCardMultiplier=2.5;p.xpPerCard=Object.fromEntries(Object.keys(p.xpPerCard).map(r=>[r,40]));p.levels.forEach(r=>r.requiredXp=100);p.milestones.forEach((m,i)=>Object.assign(m,{successChancePpm:500000,bonus:{type:['HP_PERCENT','ATTACK_PERCENT','SKILL_POWER_PERCENT','SKILL_COOLDOWN_TURNS'][i],value:i===3?1:10}}));return p;};
const cards=[{code:'V-004',name:'대상',rank:'SS',totalCopies:31,duplicates:30},{code:'V-009',name:'동급',rank:'SS',totalCopies:31,duplicates:30},{code:'V-013',name:'다른 등급',rank:'S',totalCopies:31,duplicates:30}];
const train=(overrides={})=>planMercenaryTraining({policy:policy(),state:initialMercenaryLevel(),target:cards[0],owned:cards,catalog:cards,materials:[{code:'V-004',quantity:1}],...overrides});

test('live draft keeps every economy value unset and execution closed',()=>{
 assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,false);const p=mercenaryLevelDraft();assert.equal(p.mode,'OFF');assert.equal(mercenaryLevelReadiness(p).missing.length,35);assert.equal(mercenaryLevelReadiness(p).ready,false);
 assert.throws(()=>train({policy:p}),{code:'MERCENARY_LEVEL_UNCONFIGURED'});
 for(const change of [p=>p.sameCardMultiplier=1,p=>p.levels[0].requiredXp=-1,p=>p.milestones[0].successChancePpm=1000001,p=>p.xpPerCard.NORMAL=100,p=>p.milestones[3].bonus={type:'SKILL_COOLDOWN_TURNS',value:1.5}]){const p=policy();change(p);assert.throws(()=>validateMercenaryLevelPolicy(p));}
});
test('same mercenary earns the multiplier; only same-rank mercenary extras are accepted',()=>{
 assert.equal(train().xp,100);assert.equal(train({materials:[{code:'V-009',quantity:1}]}).xp,40);
 assert.throws(()=>train({materials:[{code:'V-013',quantity:1}]}),{code:'MERCENARY_LEVEL_RANK'});
 assert.throws(()=>train({materials:[{code:'MEMBER_004',quantity:1}]}));
 assert.throws(()=>train({materials:[{code:'V-004',quantity:31}]}),{code:'MERCENARY_LEVEL_DUPLICATES'});
 assert.throws(()=>train({owned:[{...cards[0],totalCopies:1,duplicates:0}]}),{code:'MERCENARY_LEVEL_DUPLICATES'});
 const merged=train({materials:[{code:'V-004',quantity:1},{code:'V-004',quantity:1}]});assert.equal(merged.consumed.length,1);assert.equal(merged.consumed[0].quantity,2);assert.equal(merged.after.level,3);
});
test('ordinary levels carry XP but every milestone caps XP and reports exact overflow',()=>{
 const r=train({materials:[{code:'V-004',quantity:7}]});assert.deepEqual(r.after,{level:5,experience:100,breakthroughMask:0,revision:1});assert.equal(r.appliedXp,500);assert.equal(r.overflowXp,200);assert.equal(r.breakthroughReady,true);
 assert.throws(()=>train({state:r.after}),{code:'MERCENARY_LEVEL_BREAKTHROUGH_REQUIRED'});
 for(const [i,level] of [5,10,15,20].entries()){
  const s={level,experience:60,breakthroughMask:(1<<i)-1,revision:5},r=train({state:s,materials:[{code:'V-009',quantity:2}]});assert.equal(r.after.level,level);assert.equal(r.after.experience,100);assert.equal(r.overflowXp,40);
 }
});
test('all four failures retain level and earlier effects; success is once, exact odds, max 20',()=>{
 for(const [i,level] of [5,10,15,20].entries()){
  const state={level,experience:100,breakthroughMask:(1<<i)-1,revision:i};
  const fail=planMercenaryBreakthrough({policy:policy(),state,roll:500000});assert.equal(fail.success,false);assert.deepEqual(fail.after,{...state,experience:0,revision:i+1});assert.equal(fail.reward,null);assert.throws(()=>planMercenaryBreakthrough({policy:policy(),state:fail.after,roll:0}),{code:'MERCENARY_LEVEL_NOT_READY'});
  const success=planMercenaryBreakthrough({policy:policy(),state,roll:499999});assert.equal(success.success,true);assert.equal(success.after.level,Math.min(20,level+1));assert.equal(success.after.breakthroughMask,(1<<(i+1))-1);assert.equal(success.complete,level===20);
  assert.throws(()=>planMercenaryBreakthrough({policy:policy(),state:success.after,roll:0}),{code:'MERCENARY_LEVEL_NOT_READY'});
  if(level===20)assert.throws(()=>train({state:success.after}),{code:'MERCENARY_LEVEL_MAX'});
 }
});
test('invalid persisted states cannot skip gates, retain EXP after final completion, or exceed new XP policy',()=>{
 for(const state of [{level:6,experience:0,breakthroughMask:0,revision:0},{level:10,experience:0,breakthroughMask:2,revision:0},{level:20,experience:1,breakthroughMask:15,revision:0},{level:5,experience:0,breakthroughMask:1,revision:0}])assert.throws(()=>mercenaryLevelState(state));
 assert.throws(()=>levelProgress(policy(),{level:1,experience:100,breakthroughMask:0,revision:0}));
});
async function fixture(t,postgres=false,{schema=true}={}){
 const f=await mercenaryFixture(t,{postgres});if(schema)await ensureMercenaryLevelSchema(f.env);
 for(const c of f.document.mercenaries)c.rank=cards.find(x=>x.code===c.code)?.rank||c.rank;
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 for(const c of cards)await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,?,?)',c.code,c.totalCopies,c.duplicates,'2026-10-05','2026-10-05').run();
 await f.p("INSERT INTO user_mercenary_loadout_v1 VALUES(7,'V-004',17,'2026-10-05')").run();await f.setting(MERCENARY_LEVEL_KEY,policy());return f;
}
const body=(props={})=>({requestId:crypto.randomUUID(),mercenaryCode:'V-004',revision:0,materials:[{code:'V-004',quantity:1}],...props});
const inventory=async f=>(await f.p('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results;
for(const postgres of [false,true]){
 const label=postgres?'Postgres':'SQLite';
 test(`${label}: atomic consumption, replay, account isolation, no wallet/loadout change`,async t=>{
  const f=await fixture(t,postgres),b=body(),coin=await f.coin(),r=await runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN');assert.equal(r.result.after.level,2);assert.equal((await inventory(f))[0].total_copies,30);
  assert.equal(await f.coin(),coin);assert.equal((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first()).quantity,100);assert.equal((await f.p('SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=7').first()).revision,17);
  assert.equal((await runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN')).replayed,true);assert.equal((await inventory(f))[0].total_copies,30);
  await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,{...b,materials:[{code:'V-009',quantity:1}]},'TRAIN'),{code:'JOINT_REQUEST_CONFLICT'});
  await assert.rejects(()=>mercenaryLevelReceipt(f.env,{id:8},b.requestId),{code:'JOINT_NOT_FOUND'});assert.deepEqual((await mercenaryLevelReceipt(f.env,f.user,b.requestId)).result,r.result);
 });
 test(`${label}: failed writes roll back materials and XP; stale other request is cancelled`,async t=>{
  const f=await fixture(t,postgres),b=body(),before=await inventory(f);f.fail('INSERT INTO user_mercenary_levels_v1');await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'),/INJECTED/);assert.deepEqual(await inventory(f),before);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-004'),initialMercenaryLevel());
  f.fail('');const other=body();await runPreparedMercenaryLevel(f.env,f.user,other,'TRAIN');await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'),{code:'MERCENARY_LEVEL_CONFLICT'});assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',b.requestId).first()).status,'CANCELLED');
 });
 test(`${label}: overflow requires explicit consent; failed breakthrough retry keeps its first random draw`,async t=>{
  const f=await fixture(t,postgres),training=body({materials:[{code:'V-004',quantity:6}]});await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,training,'TRAIN'),{code:'MERCENARY_LEVEL_OVERFLOW'});assert.equal((await inventory(f))[0].total_copies,31);
  await runPreparedMercenaryLevel(f.env,f.user,{...training,allowOverflow:true},'TRAIN');const b=body({revision:1});f.fail('INSERT INTO user_mercenary_levels_v1');let rolls=0;await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'BREAKTHROUGH',{randomInt:()=>{rolls++;return 999999;}}),/INJECTED/);
  const pending=await mercenaryLevelReceipt(f.env,f.user,b.requestId);assert.deepEqual(Object.keys(pending).sort(),['replayed','requestId','status']);f.fail('');const r=await runPreparedMercenaryLevel(f.env,f.user,b,'BREAKTHROUGH',{randomInt:()=>assert.fail('rerolled')});assert.equal(rolls,1);assert.equal(r.result.success,false);assert.equal(r.result.after.level,5);assert.equal(r.result.after.experience,0);
 });
 test(`${label}: policy revision and CMS revision races cannot spend stale materials`,async t=>{
  const f=await fixture(t,postgres),before=await inventory(f),b=body();f.fail('INSERT INTO user_mercenary_levels_v1');await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'));f.fail('');const p=policy();p.revision=1;await f.setting(MERCENARY_LEVEL_KEY,p);await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'),{code:'MERCENARY_LEVEL_CONFLICT'});assert.deepEqual(await inventory(f),before);
  const c=body();f.fail('INSERT INTO user_mercenary_levels_v1');await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,c,'TRAIN'));f.fail('');await f.p("UPDATE mercenary_cms_documents_v1 SET revision=revision+1 WHERE doc_key='config'").run();await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,c,'TRAIN'),{code:'MERCENARY_LEVEL_CONFLICT'});assert.deepEqual(await inventory(f),before);
 });
 test(`${label}: final success persists level 20 and its bonus exactly once without spending more cards`,async t=>{
  const f=await fixture(t,postgres);await f.p("INSERT INTO user_mercenary_levels_v1 VALUES(7,'V-004',20,100,7,6,'2026-10-05')").run();const before=await inventory(f),b=body({revision:6}),r=await runPreparedMercenaryLevel(f.env,f.user,b,'BREAKTHROUGH',{randomInt:()=>0});assert.equal(r.result.complete,true);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-004'),{level:20,experience:0,breakthroughMask:15,revision:7});assert.deepEqual(await inventory(f),before);assert.deepEqual((await runPreparedMercenaryLevel(f.env,f.user,b,'BREAKTHROUGH',{randomInt:()=>assert.fail()})).result,r.result);
  await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,body({revision:7}),'BREAKTHROUGH'),{code:'MERCENARY_LEVEL_NOT_READY'});
 });
}
test('lost commit acknowledgement and serialized concurrent requests never double consume',async t=>{
 const f=await fixture(t),b=body();let lost=false;f.DB.afterCommit=()=>{if(!lost){lost=true;throw Error('LOST_ACK');}};
 const attempts=await Promise.allSettled([b,body()].map(x=>f.deps.withUserMutationLock(f.env,7,'level',()=>runPreparedMercenaryLevel(f.env,f.user,x,'TRAIN'))));assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(lost,true);assert.equal((await inventory(f))[0].total_copies,30);assert.equal((await runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN')).replayed,true);
});
test('batch predicate rejects inventory or policy changes after the preparation reads',async t=>{
 const f=await fixture(t),batch=f.DB.batch.bind(f.DB);let inject=true;
 f.DB.batch=async statements=>{if(inject&&statements.some(s=>s.source.includes('INSERT INTO user_mercenary_levels_v1'))){inject=false;await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-1,duplicate_count=duplicate_count-1 WHERE user_id=7 AND mercenary_code='V-004'").run();}return batch(statements);};
 const b=body();await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'),/CHECK/);assert.equal((await inventory(f))[0].total_copies,30);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-004'),initialMercenaryLevel());await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,b,'TRAIN'),{code:'MERCENARY_LEVEL_CONFLICT'});
 inject=true;f.DB.batch=async statements=>{if(inject&&statements.some(s=>s.source.includes('INSERT INTO user_mercenary_levels_v1'))){inject=false;await f.setting(MERCENARY_LEVEL_KEY,{...policy(),mode:'OFF'});}return batch(statements);};
 await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,body(),'TRAIN'),/CHECK/);assert.equal((await inventory(f))[0].total_copies,30);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-004'),initialMercenaryLevel());
});
const request=(path,{method='GET',data,origin='https://qa.test',auth=true}={})=>new Request('https://qa.test/api/'+path,{method,headers:{origin,'content-type':'application/json',...(auth?{authorization:'Bearer local-account-7'}:{})},...(data?{body:JSON.stringify(data)}:{})});
test('live gate rejects all growth writes before DB access, including OWNER',async()=>{
 let touches=0;const env={DB:new Proxy({},{get(){touches++;throw Error('DB touched');}})},deps={json:(data,status=200)=>({data,status}),authenticate:async()=>({id:7,role:'OWNER'})};
 for(const action of ['train','breakthrough','preview']){const path='mercenaries/v3/leveling/'+action,r=await handleMercenaryAccount({path,request:request(path,{method:'POST',data:body()}),env,deps});assert.equal(r.status,423);assert.equal(r.data.code,'MERCENARY_LEVEL_PREPARATION');}
 const path='mercenaries/v3/leveling/feature',r=await handleMercenaryAccount({path,request:request(path),env,deps});assert.equal(r.data.releaseEnabled,false);assert.equal(touches,0);const map=new Map([[7,{code:'V-004',level:1}]]);assert.equal(await attachReleasedMercenaryLevels(env,map),map);
});
test('OFF needs no new schema, ignores legacy growth, and CMS saves cannot activate it',async t=>{
 const f=await fixture(t,false,{schema:false});await f.p('DELETE FROM app_meta WHERE key=?',MERCENARY_LEVEL_KEY).run();
 await f.p("INSERT INTO user_mercenary_growth_v1 VALUES(7,'V-004',9,99,3)").run();assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user)).level,1);assert.equal((await mercenaryAccountState(f.env,f.user)).cards[0].level,1);
 let path='mercenaries/v3/leveling/state',r=await handleMercenaryAccount({path,request:request(path),env:f.env,deps:f.deps});assert.equal(r.status,200);let value=await r.json();assert.equal(value.enabled,false);assert.equal(value.cards[0].growth.level,1);
 path='admin/mercenaries/leveling';r=await handleMercenaryAccount({path,request:request(path),env:f.env,deps:f.deps});value=await r.json();assert.equal(value.revision,0);assert.equal(value.readiness.ready,false);
 r=await handleMercenaryAccount({path,request:request(path,{method:'PATCH',data:{policy:policy()}}),env:f.env,deps:f.deps});assert.equal(r.status,423);
 const draft=mercenaryLevelDraft();draft.sameCardMultiplier=3;const saved=await saveMercenaryLevelPolicy(f.env,f.user,draft);assert.equal(saved.revision,1);assert.equal((await saveMercenaryLevelPolicy(f.env,f.user,draft)).revision,1);await assert.rejects(()=>saveMercenaryLevelPolicy(f.env,f.user,{...draft,sameCardMultiplier:4}),{code:'MERCENARY_LEVEL_CONFLICT'});
 for(const options of [{auth:false},{method:'PATCH',data:{policy:draft},origin:'https://evil.test'}]){r=await handleMercenaryAccount({path,request:request(path,options),env:f.env,deps:f.deps});assert.equal(r.status,options.auth===false?401:403);}
 r=await handleMercenaryAccount({path,request:request(path),env:f.env,deps:{...f.deps,authenticate:async()=>({id:8,role:'ADMIN'})}});assert.equal(r.status,403);
});
const snapshot=()=>{const d=structuredClone(seed.document);d.mercenaries.find(c=>c.code==='V-004').rank='SS';return {...battleConfig(d,'V-004',1),combat,skills:[{id:'QA',balance:{damageRatio:100,cooldownTurns:4,cost:0}}]};};
const party=()=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),power:1000000,power_type}));
test('battle bonuses apply once after linkage, preserve wounds and base rank power, and freeze skill effects',()=>{
 const old=snapshot(),grown=attachMercenaryLevel(old,policy(),{level:20,experience:0,breakthroughMask:15,revision:10});
 const base=buildMercenaryFighter(old,'A','PVE',buildFighter),m=buildMercenaryFighter({...grown,startingHpPercent:50},'A','PVE',buildFighter),regular=party().map((c,i)=>buildFighter(c,i,'A',null,'PVE'));
 applyMercenaryCombatLink([[...regular,base]]);applyMercenaryCombatLink([[...regular,m]]);assert.equal(m.maxHp,Math.floor(base.maxHp*1.1));assert.equal(m.hp,Math.floor(m.maxHp*.5));assert.equal(mercenaryEffectiveAttack(m),Math.floor(mercenaryEffectiveAttack(base)*1.1));assert.equal(m.power,base.power);assert.equal(m.level,20);assert.equal(m.skills[0].balance.damageRatio,110.00000000000001);assert.equal(m.skills[0].balance.cooldownTurns,3);
 const before=structuredClone(m);applyMercenaryCombatLink([[...regular,m]]);assert.deepEqual(m,before);assert.equal(old.skills[0].balance.cooldownTurns,4);
 const naked={...base,mercenaryLevel:undefined};const copy=structuredClone(naked);applyMercenaryLevelStats(naked);assert.deepEqual(naked,copy);
});
test('PVE, PVP and two-card co-op linkage carry server-frozen growth without changing historical snapshots',()=>{
 const old={...snapshot(),skills:[]},grown=attachMercenaryLevel(old,policy(),{level:11,experience:0,breakthroughMask:3,revision:8});
 for(const mode of ['PVE','PVP']){const battle=mode==='PVE'?createPveBattleV2({cards:party(),mercenary:grown,monster:{id:1,battle_power:10000000},seed:7}):createPvpBattleV2({attackerCards:party(),defenderCards:party(),attackerMercenary:grown,defenderMercenary:old,seed:7});const m=battle.teams.A.mercenaries[0];assert.equal(m.level,11);assert.equal(m.mercenaryLevel.breakthroughMask,3);assert.equal(m.mercenaryLevelApplied,true);if(mode==='PVP')assert.equal(battle.teams.B.mercenaries[0].level,1);}
 const regular=party().slice(0,2).map((c,i)=>({...buildFighter(c,i,'A',null,'PVE'),ownerId:7})),m={...buildMercenaryFighter(grown,'A','PVE',buildFighter),ownerId:7};applyMercenaryCombatLink([[...regular,m]],{regularCardsPerOwner:2});assert.equal(m.level,11);assert.equal(m.mercenaryLevelApplied,true);
});
test('client retains request through timeout and reload; receipt recovery sends no new POST',async()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};let posts=0,receipt=null;
 const options={accountId:7,storage,token:'same',currentToken:()=> 'same',locks:null,request:async(path,opts)=>{if(path.includes('/receipt')){if(receipt)return receipt;throw Object.assign(Error('missing'),{code:'JOINT_NOT_FOUND'});}posts++;receipt={requestId:opts.body.requestId,status:'COMPLETED',action:'TRAIN',mercenaryCode:'V-004',result:train()};throw Error('TIMEOUT');}};
 const client=createLevelClient(options);await assert.rejects(()=>client.run('train',body()),/TIMEOUT/);assert.equal(posts,1);assert.ok(client.pending());
 const reloaded=createLevelClient(options),recovered=await reloaded.run(null,null,{submit:false});assert.equal(recovered.status,'COMPLETED');assert.equal(posts,1);reloaded.acknowledge(recovered.requestId);assert.equal(reloaded.pending(),null);
 let changed='old';const swapped=createLevelClient({...options,token:'old',currentToken:()=>changed});changed='new';await assert.rejects(()=>swapped.run('train',body()),/계정이 변경/);assert.equal(posts,1);
});

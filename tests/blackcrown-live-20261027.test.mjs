import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {BLACKCROWN_COMBAT,BLACKCROWN_EVENT} from '../shared/mercenary-blackcrown-combat-v1.mjs';
import {BLACKCROWN_MERCENARIES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLOODMOON_COMBAT} from '../shared/mercenary-bloodmoon-combat-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {ssLimitedProfile,mercenaryCombatRank} from '../shared/mercenary-ss-limited-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {blackcrownTargets,resolveBlackcrownCast} from '../functions/_mercenary_blackcrown.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
import {handleMercenaryLevel,runPreparedMercenaryLevel} from '../functions/_mercenary_level.js';
import {attachReleasedMercenaryLevels} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,mode='PVE',side='A')=>buildMercenaryFighter(snapshot(code),side,mode,buildFighter);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('six SS Limited profiles retain SS growth and original costs while applying the approved independent buff',()=>{
 for(const p of Object.values(BLACKCROWN_COMBAT)){
  const ref=BLOODMOON_COMBAT[p.referenceCode];
  for(const key of ['basePower','actionEnergy','pveSkillMinimumDamage'])assert.deepEqual(p[key],ref[key],p.code+':'+key);
  for(const key of ['scale','speedScale','actionCredit','pvpSkillCapScale','basicCapScale'])assert(p[key]>ref[key],p.code+':'+key);
  for(const key of ['attackPercent','hpPercent','shieldPercent'])assert(p.link[key]>ref.link[key]);
  for(const mode of ['PVE','PVP']){
   const a=fighter(p.code,mode),b=fighter(p.referenceCode,mode);
   for(const key of ['maxHp','attack','defense','speed'])assert(a[key]>b[key],p.code+':'+mode+':'+key);
   for(const key of ['power','rank'])assert.equal(a[key],b[key]);
   assert.equal(a.skills.length,2);assert.equal(mercenaryCombatRank(a),'SSS');assert.equal(ssLimitedProfile(a),p);
  }
  assert.equal(mercenaryLevelXpMultiplier({code:p.code}),5);
  for(const s of p.skills){assert(s.balance.damageRatio>ref.skill.balance.damageRatio);assert.equal(s.balance.cost,ref.skill.balance.cost);assert.equal(s.balance.cooldownTurns,ref.skill.balance.cooldownTurns);}
 }
});
test('all twelve casts share one total budget and mutate each legal enemy once in PVE/PVP',()=>{
 for(const p of Object.values(BLACKCROWN_COMBAT))for(const mode of ['PVE','PVP'])for(const skill of p.skills)for(const count of [1,5,13]){
  const actor=fighter(p.code,mode),targets=Array.from({length:count},(_,i)=>({id:'t'+i,side:'B',hp:1e12,maxHp:1e12,alive:true}));
  const calls=[],mutations=[],events=[],dead={id:'dead',side:'B',hp:0},friend={id:'friend',side:'A',hp:1e12};
  const mixed=[dead,friend,{id:'hidden',hp:9,side:'B',untargetable:true},{id:'suit',hp:9,side:'B',isBattleSuit:true},...targets,targets[0]];
  const hits=resolveBlackcrownCast({actor,skill:{...skill,balance:{...skill.balance,damageRatio:9999}},targets:mixed,
   hit:(a,t,ratio,options)=>{calls.push({ratio,options});return {damage:100}},damage:(t,n)=>{mutations.push(t.id);t.hp-=n;return {hpDamage:n,absorbed:0}},knockout(){},emit:(type,row)=>events.push({type,...row})});
  assert.equal(hits.length,Math.min(skill.targetCount,count));assert.equal(new Set(mutations).size,mutations.length);
  assert(Math.abs(calls.reduce((n,c)=>n+c.ratio,0)-skill.balance.damageRatio)<1e-10);
  assert(Math.abs(calls.reduce((n,c)=>n+c.options.capScale,0)-1)<1e-10);
  assert(calls.every(c=>c.options.rangedSkill===(p.attackStyle==='RANGED')));assert.equal(events.length,1);assert.equal(events[0].type,BLACKCROWN_EVENT);
  for(const invalid of [{...actor,code:'V-001'}, {...actor,isMercenary:false}, {...actor,stunned:true}, {...actor,silenced:true}, {...actor,hp:0}])assert.deepEqual(resolveBlackcrownCast({actor:invalid,skill,targets:mixed}),[]);
  assert.deepEqual(blackcrownTargets(actor,{...skill,id:'MS-001'},targets),[]);
 }
});
test('two skills alternate with one payment and the Bloodmoon shared reuse interval',()=>{
 for(const p of Object.values(BLACKCROWN_COMBAT))for(const mode of ['PVE','PVP']){
  const actor=fighter(p.code,mode),targets=Array.from({length:5},(_,i)=>({...buildFighter({id:'t'+i,power:1e8,type:'NONE'},i,'B',null,mode),hp:1e12,maxHp:1e12})),events=[];
  const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:()=>({damage:1}),damage:(t,n)=>({hpDamage:n,absorbed:0}),knockout(){},emit:(type,row)=>events.push({type,...row,action:actor.actions}),clock:()=>0});
  for(let action=1;action<=7;action++){actor.actions=action;runtime.beforeAction(actor);}
  const casts=events.filter(e=>e.type===BLACKCROWN_EVENT),starts=events.filter(e=>e.type==='MERCENARY_WINDUP'),cd=p.skill.balance.cooldownTurns;
  assert.deepEqual(casts.map(e=>e.action),cd===2?[1,3,5,7]:[1,2,3,4,5,6,7]);
  assert.deepEqual(casts.map(e=>e.skillId),casts.map((_,i)=>p.skills[i%2].id));
  assert.equal(starts.length,casts.length);assert(starts.every(e=>e.energyAfter>=0));assert.equal(starts[0].energyAfter,80);
 }
});
test('canonical PVE/PVP emits twelve skills with five regular slots and one mercenary',()=>{
 for(const p of Object.values(BLACKCROWN_COMBAT))for(const mode of ['PVE','PVP']){
  const cards=tierCards(2e7),result=mode==='PVE'?createPveBattleV2({cards,monster:{id:1,battle_power:1.6e10},seed:7919,mercenary:snapshot(p.code)}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(p.code),seed:7919});
  assert.equal(result.teams.A.cards.length,5);assert.equal(result.teams.A.mercenaries[0].cardId,p.code);
  const events=result.result.timeline.filter(e=>e.type===BLACKCROWN_EVENT);assert(events.length>1,p.code+mode);
  assert.deepEqual([...new Set(events.map(e=>e.skillId))],p.skills.map(s=>s.id));
 }
});
test('isolated ownership/loadouts permit all six in PVE/PVP, without bypassing ownership or granting cards',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 for(const p of Object.values(BLACKCROWN_COMBAT))for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:p.code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const p of Object.values(BLACKCROWN_COMBAT))await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,p.code,'2026-10-27','2026-10-27').run();
 for(const mode of ['PVE','PVP']){
  let revision=0;
  for(const p of Object.values(BLACKCROWN_COMBAT)){
   await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:p.code,revision:revision++});
   const s=await loadMercenaryBattleSnapshot(f.env,f.user,mode);assert.equal(s.basePower,356400);assert.equal(s.skills.length,2);assert.equal(s.code,p.code);
  }
 }
 const state=await mercenaryAccountState(f.env,f.user);assert.equal(state.cards.length,6);assert(state.cards.every(c=>c.canDeploy&&c.totalCopies===1));
});
test('approved art and all live atlas bytes match provenance, including the corrected Sudaeng hand',()=>{
 const root='assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/';
 const manifest=JSON.parse(fs.readFileSync(root+'motion-manifest.json'));
 for(const c of manifest.characters){assert.equal(hash(c.sourceArt),c.sourceSha256);assert.equal(c.bodyHeight,285);
  for(const file of [c.motion.idle,c.motionAtlas,c.effects,c.secondaryEffects])assert.equal(hash(root+file.file),file.sha256);
  const catalog=BLACKCROWN_MERCENARIES.find(a=>a.code===c.code);assert.equal(catalog.battleSprite,root+c.motion.idle.file);
 }
 assert.equal(hash(root+'sudaeng-idle.png'),'449ec1af3126c2ea20efb93240a950d4f69193943591f2646ee54e592dbeec67');
});
test('all six owned cards appear in growth; normal SS materials train once and preserve the original',async t=>{
 const f=await transferFixture(t,true);
 for(const code of [...Object.keys(BLACKCROWN_COMBAT),'V-962'])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,?,?,?,?)',f.user.id,code,code==='V-962'?31:1,code==='V-962'?30:0,'2026-10-27','2026-10-27').run();
 const response=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',env:f.env,deps:f.deps,request:new Request('https://qa.test/api/mercenaries/v3/leveling/state',{headers:{authorization:'Bearer local-account-7'}})});
 assert.equal(response.status,200);const state=await response.json();
 for(const code of Object.keys(BLACKCROWN_COMBAT)){const c=state.cards.find(c=>c.code===code);assert(c);assert.equal(c.rank,'SS');assert.equal(c.edition,'LIMITED');}
 const body={requestId:crypto.randomUUID(),mercenaryCode:'V-950',revision:0,materials:[{code:'V-962',quantity:15}]};
 const result=await runPreparedMercenaryLevel(f.env,f.user,body,'TRAIN');assert.equal(result.result.after.level,2);
 const replay=await runPreparedMercenaryLevel(f.env,f.user,body,'TRAIN');assert(replay.replayed);
 const growth=await attachReleasedMercenaryLevels(f.env,new Map([[7,limitedDeploymentSnapshot('V-950')]]));assert.equal(growth.get(7).level,2);
 const rows=(await f.p('SELECT mercenary_code,total_copies FROM user_mercenary_cards_v1 WHERE user_id=?',7).all()).results;
 assert.equal(Number(rows.find(r=>r.mercenary_code==='V-950').total_copies),1);assert.equal(Number(rows.find(r=>r.mercenary_code==='V-962').total_copies),16);
});

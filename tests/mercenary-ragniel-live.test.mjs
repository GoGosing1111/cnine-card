import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {RAGNIEL_BALANCE} from '../shared/mercenary-ragniel-v1.mjs';
import {resolveRagnielJudgment} from '../functions/_mercenary_ragniel.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
const art=seed.catalog.cards.find(c=>c.code==='V-046'),skill=seed.document.skills.find(s=>s.id==='MS-046');
const snapshot={code:'V-046',name:'라그니엘',rank:'SSS',role:'VANGUARD',position:'FRONT',level:1,basePower:180000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
test('approved originals and SSS defaults register once while prior CMS edits survive',()=>{
 const old=structuredClone(seed.document);old.mercenaries=old.mercenaries.filter(c=>c.code!=='V-046');old.skills=old.skills.filter(s=>s.id!=='MS-046');old.assignments=old.assignments.filter(c=>c.code!=='V-046');
 old.mercenaries[0].name='운영 이름';old.skills[0].balance={damageRatio:9,cooldownTurns:8,cost:7};old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const k of ['mercenaries','skills','assignments'])assert.deepEqual(next[k].slice(0,-1),before[k]);
 assert.deepEqual(old,before);assert.deepEqual(next.settings,before.settings);assert.deepEqual(next.skills.at(-1).balance,RAGNIEL_BALANCE);
 assert.equal(next.mercenaries.at(-1).rank,'SSS');assert.deepEqual(next.assignments.at(-1).skillIds,['MS-046']);
 next.skills.at(-1).balance.cost=40;next.assignments.at(-1).skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
 for(const [file,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
});
function harness({count=2,mode='PVE',dodge=false,hp=100000,controlled=false,revive=false}={}){
 const actor=buildMercenaryFighter(snapshot,'A',mode);actor.stunned=controlled;
 const targets=Array.from({length:count},(_,i)=>({...actor,id:'B:'+i,side:'B',slot:i,isMercenary:false,stunned:false,hp:i?100000:hp,shield:i?0:100,damageDealt:0})),events=[],rolls=[];
 const hit=(_a,t,ratio,options)=>{rolls.push({id:t.id,ratio,...options});return {damage:1000*ratio,dodge:dodge&&rolls.length===1};};
 const damage=(t,n)=>{const absorbed=Math.min(t.shield||0,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};};
 const knockout=t=>{if(t.hp<=0){events.push({type:'KNOCKOUT',targetId:t.id});t.alive=false;if(revive){t.hp=t.maxHp;t.alive=true;events.push({type:'REVIVE',targetId:t.id});}}};
 const emit=(type,data)=>events.push({type,...data});
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit,damage,knockout,emit,clock:()=>0});return {actor,targets,events,rolls,runtime,hit,damage,knockout,emit};
}
test('two contacts share one SSS action/cap/budget, preserve shield results and spend one cooldown',()=>{
 for(const mode of ['PVE','PVP'])for(const count of [1,2]){
  const h=harness({mode,count});h.actor.actions++;assert.equal(h.runtime.beforeAction(h.actor),true);
  const event=h.events.find(e=>e.type==='MERCENARY_JUDGMENT');assert.ok(event);assert.equal(event.impacts.length,2*count);
  assert.deepEqual([...new Set(event.impacts.map(i=>i.at))],[1.58,2.42]);assert.equal(event.impacts[0].absorbed,100);
  assert.ok(Math.abs(h.rolls.reduce((s,r)=>s+r.ratio,0)-5.6)<1e-10);assert.ok(Math.abs(h.rolls.reduce((s,r)=>s+r.castShare,0)-1)<1e-10);
  assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-046'),6);assert.equal(h.runtime.state(h.actor).pending,null);
  h.actor.actions++;assert.equal(h.runtime.beforeAction(h.actor),false);
 }
});
test('dodged or killed targets receive no spare second strike, redistribution or strike after revival',()=>{
 for(const options of [{dodge:true},{hp:1,revive:true}]){
  const h=harness(options);h.actor.actions++;h.runtime.beforeAction(h.actor);assert.deepEqual(h.rolls.map(r=>r.id),['B:0','B:1','B:1']);
  assert.ok(Math.abs(h.rolls.at(-1).ratio-1.68)<1e-10);assert.ok(h.rolls.reduce((s,r)=>s+r.castShare,0)<1);
  if(options.revive)assert.deepEqual(h.events.filter(e=>['MERCENARY_JUDGMENT','KNOCKOUT','REVIVE'].includes(e.type)).map(e=>e.type),['MERCENARY_JUDGMENT','KNOCKOUT','REVIVE']);
 }
 const h=harness({controlled:true});h.actor.actions++;h.runtime.beforeAction(h.actor);assert.equal(h.rolls.length,0);assert.equal(h.runtime.state(h.actor).energy,100);
 const lost=harness();lost.targets[0].hp=0;resolveRagnielJudgment({...lost,skill});assert.ok(lost.rolls.every(r=>r.id==='B:1'));assert.ok(Math.abs(lost.rolls.reduce((s,r)=>s+r.ratio,0)-2.8)<1e-10);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} SSS acquisition is uniform, repeat-safe and deploys through the separate mercenary slot`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SSS'?1000000:0;await f.setDraw(f.draw);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2};
 const result=await openMercenaryCards(f.env,f.user,request,{randomInt:max=>max===2?1:0});assert.ok(result.draws.every(d=>d.mercenaryCode==='V-046'));assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Repeated draw')}});assert.equal(await f.coin(),before-2000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-046',revision:0});
 const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(deployed.basePower,180000);assert.equal(deployed.rank,'SSS');assert.equal(deployed.sourceArt,art.sourceArt);assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),['MS-046']);
});
test('canonical PVE and both PVP sides include five regular cards, separate Ragniel, and server-resolved contacts',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'QA-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'})),merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,'V-046');
  const events=data.result.timeline.filter(e=>e.type==='MERCENARY_JUDGMENT');assert.ok(events.length);
  for(const e of events){assert.equal(e.skillId,'MS-046');assert.ok(e.impacts.length<=4);assert.ok(e.impacts.every(i=>Number.isFinite(i.targetHpAfter)&&i.targetHpAfter>=0&&Number.isFinite(i.damage)));}
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {AZANT_CODE,AZANT_BALANCE,AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL,AZANT_SOURCE_ART,AZANT_BATTLE_SPRITE} from '../shared/mercenary-azant-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickFusionResult} from '../functions/_mercenary_fusion.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const ids=[AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL],skills=seed.document.skills.filter(s=>ids.includes(s.id));
const snapshot={code:AZANT_CODE,name:'아잔트',rank:'SSS',role:'CONTROLLER',position:'REAR',level:1,power:180000,basePower:180000,statMode:'RANK_FIXED',stats:{hp:100000,attack:1000,defense:100,speed:100},skills,combat,sourceArt:AZANT_SOURCE_ART,battleSprite:AZANT_BATTLE_SPRITE};
test('previous complete CMS adds only Azant; existing and later operator edits survive',()=>{
 const old=structuredClone(seed.document);old.mercenaries=old.mercenaries.filter(c=>c.code!==AZANT_CODE);old.assignments=old.assignments.filter(c=>c.code!==AZANT_CODE);old.skills=old.skills.filter(s=>!ids.includes(s.id));
 old.mercenaries[0].name='운영 이름';old.skills[0].balance.cost=37;old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 assert.deepEqual(old,before);for(const key of ['mercenaries','assignments'])assert.deepEqual(next[key].slice(0,-1),old[key]);assert.deepEqual(next.skills.slice(0,-2),old.skills);assert.deepEqual(next.settings,old.settings);
 assert.deepEqual(next.assignments.at(-1).skillIds,ids);for(const s of next.skills.slice(-2))assert.deepEqual(s.balance,AZANT_BALANCE);
 next.skills.at(-1).balance.cost=31;next.assignments.at(-1).skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.shift();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
});
test('public codex exposes approved name, normal SSS power, art and ready localized skills',()=>{
 const card=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1}).cards.find(c=>c.code===AZANT_CODE);
 assert.equal(card.name,'아잔트');assert.equal(card.rank,'SSS');assert.equal(card.basePower,180000);assert.equal(card.title,'');assert.deepEqual(card.skills.map(s=>s.id),ids);assert.ok(card.skills.every(s=>s.ready));assert.equal(card.skills[1].target,'적 전체');assert.equal(card.sourceArt,AZANT_SOURCE_ART);
 const m=JSON.parse(fs.readFileSync('preview/mercenary-sapphire-archmage-battle-v1/manifest.json'));
 for(const [file,hash]of [[AZANT_SOURCE_ART,m.sourceArtSha256],[AZANT_BATTLE_SPRITE,m.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
});
test('normal SSS pack/fusion uses existing weights and per-card OFF excludes Azant',()=>{
 const rows=seed.document.mercenaries.map(c=>({...c,rank:c.rank||'C'})),pools=mercenaryGradePools(rows,seed.catalog.cards.map(c=>c.code)),weights={'V-021':8991,'V-046':999,'V-049':10,'V-055':10};
 assert.ok(pools.SSS.includes(AZANT_CODE));const odds=mercenaryCardChances(50,pools.SSS,{cardWeights:weights});assert.equal(odds.find(c=>c.code===AZANT_CODE).weight,1);
 const only=Object.fromEntries(pools.SSS.map(c=>[c,c===AZANT_CODE?1:0]));assert.equal(pickFusionResult({rank:'SS',pools,rules:{cardWeights:only},randomInt:n=>n===10000?9999:0}).mercenaryCode,AZANT_CODE);
 assert.equal(mercenaryCardChances(50,pools.SSS,{cardWeights:{...weights,[AZANT_CODE]:0}}).find(c=>c.code===AZANT_CODE).weight,0);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} acquisition retries do not charge twice; owned PVE/PVP slots persist independently`,async t=>{
 const f=await mercenaryFixture(t,{postgres});
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:AZANT_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SSS'?1000000:0;
 f.draw.cardRules.cardWeights=Object.fromEntries(seed.document.mercenaries.filter(c=>c.rank==='SSS').map(c=>[c.code,c.code===AZANT_CODE?1:0]));await f.setDraw(f.draw);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2},result=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>0});
 assert.ok(result.draws.every(d=>d.mercenaryCode===AZANT_CODE));assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('REROLL');}});assert.equal(await f.coin(),before-2000);
 for(const mode of ['PVE','PVP']){const body={requestId:crypto.randomUUID(),mode,mercenaryCode:AZANT_CODE,revision:0};await saveMercenaryLoadout(f.env,f.user,body);assert.equal((await saveMercenaryLoadout(f.env,f.user,body)).replayed,true);
  const s=await loadMercenaryBattleSnapshot(f.env,f.user,mode),batch=await releasedMercenarySnapshots(f.env,[7,8],mode);assert.deepEqual(batch.get(7),s);assert.equal(batch.has(8),false);assert.equal(s.basePower,180000);assert.equal(mercenaryAttackStyle(s),'CAST');assert.deepEqual(s.skills.map(x=>x.id),ids);
 }
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:null,revision:1});assert.equal(await loadMercenaryBattleSnapshot(f.env,f.user,'PVE'),null);assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,'PVP')).code,AZANT_CODE);assert.equal((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===AZANT_CODE).totalCopies,2);
});
test('one cast budget across 1/2/12 targets; no extra hits, illegal modes or controlled casts',()=>{
 for(const mode of ['PVE','PVP'])for(const count of [0,1,2,12])for(const control of ['normal','stunned','silenced','dead','dodge']){
  const actor=buildMercenaryFighter({...snapshot,statMode:'CMS'},'A',mode);actor.stunned=control==='stunned';actor.silenced=control==='silenced';if(control==='dead'){actor.hp=0;actor.alive=false;}
  const targets=Array.from({length:count},(_,i)=>({id:'B:'+i,alive:true,hp:100000,maxHp:100000,shield:100,maxShield:100,slot:i,row:'FRONT'})),events=[],ratios=[];
  const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:(_a,_t,ratio)=>{ratios.push(ratio);return {damage:1000*ratio,dodge:control==='dodge'};},damage:(t,n)=>{const absorbed=Math.min(t.shield,n);t.shield-=absorbed;const hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;return {hpDamage,absorbed};},knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  runtime.state(actor).energy=100;actor.actions++;runtime.beforeAction(actor);
  const active=count>0&&['normal','dodge'].includes(control),expected=active?(mode==='PVE'?count:Math.min(2,count)):0;
  assert.equal(ratios.length,expected);assert.equal(runtime.state(actor).energy,active?65:100);
  const cast=events.filter(e=>e.type==='MERCENARY_AZANT_AREA'||e.type==='MERCENARY_AZANT_VOLLEY');assert.equal(cast.length,active?1:0);
  if(active){assert.ok(Math.abs(ratios.reduce((n,r)=>n+r,0)-5.6)<1e-9);assert.equal(cast[0].hits.length,expected);assert.equal(cast[0].skillId,mode==='PVE'?AZANT_AREA_SKILL:AZANT_VOLLEY_SKILL);assert.equal(new Set(cast[0].targetIds).size,expected);if(control==='dodge')assert.ok(targets.every(t=>t.hp===100000&&t.shield===100));}
 }
});
test('real PVE/PVP generators use the intended Azant event with five cards plus a separate mercenary',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'}));
 for(const mode of ['PVE','PVP']){const data=mode==='PVE'?createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,name:'검수',battle_power:1000000},seed:17}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot,defenderMercenary:snapshot,seed:12});
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries[0].cardId,AZANT_CODE);assert.ok(data.result.timeline.some(e=>e.type===(mode==='PVE'?'MERCENARY_AZANT_AREA':'MERCENARY_AZANT_VOLLEY')));
 }
});
test('all production consumers and main loaders include Azant playback and a fresh matching cache version',()=>{
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));assert.ok(report.sources.some(s=>s.file.endsWith('/AzantCombatPlayback.js')));
 for(const {file}of report.outputs){const b=fs.readFileSync(file,'utf8');assert.ok(b.includes('MERCENARY_AZANT_AREA')&&b.includes('AZANT_MOTION_ASSETS'),file);}
 for(const p of ['js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert.ok(fs.readFileSync(p,'utf8').includes('azant-live-20261014-v1'),p);
 assert.ok(fs.readFileSync('index.html','utf8').includes('20261014-azant-balance-v1'));
});

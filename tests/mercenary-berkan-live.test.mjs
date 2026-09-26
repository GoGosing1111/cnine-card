import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {BERKAN_CODE,BERKAN_SKILL_ID,BERKAN_BALANCE,berkanSelectionWeights} from '../shared/mercenary-berkan-v1.mjs';
import {mercenaryCardChances,mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {pickFusionResult} from '../functions/_mercenary_fusion.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {suggestedMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
const art=seed.catalog.cards.find(c=>c.code===BERKAN_CODE),skill=seed.document.skills.find(s=>s.id===BERKAN_SKILL_ID);
const snapshot={code:BERKAN_CODE,name:'베르칸',rank:'SSS',role:'SNIPER',position:'REAR',level:1,basePower:180000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
test('previous complete CMS adds only approved Berkan, and later operator edits remain authoritative',()=>{
 const old=structuredClone(seed.document);old.mercenaries=old.mercenaries.filter(c=>c.code!==BERKAN_CODE);old.assignments=old.assignments.filter(c=>c.code!==BERKAN_CODE);old.skills=old.skills.filter(s=>s.id!==BERKAN_SKILL_ID);
 old.mercenaries[0].name='기존 운영 이름';old.skills[0].balance.cost=37;old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(old,before);assert.deepEqual(next.settings,old.settings);assert.deepEqual(next.skills.at(-1).balance,BERKAN_BALANCE);assert.deepEqual(next.assignments.at(-1).skillIds,[BERKAN_SKILL_ID]);
 next.skills.at(-1).balance.cost=31;next.assignments.at(-1).skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
});
test('exact draw and fusion ticket boundaries give Berkan the same rare weight as Cryvern',()=>{
 const policy=suggestedMercenaryDraw();policy.cardRules.cardWeights={'V-021':8991,'V-046':999,'V-049':10};
 const mercenaries=seed.document.mercenaries.map((c,i)=>({...c,rank:c.rank||['C','B','A','S','SS'][i%5]})),pools=mercenaryGradePools(mercenaries,seed.catalog.cards.map(c=>c.code));
 assert.deepEqual(pools.SSS,['V-021','V-046','V-049','V-055']);
 const odds=mercenaryCardChances(50,pools.SSS,policy.cardRules);assert.deepEqual(odds.map(c=>c.weight),[8991,999,10,10]);assert.equal(odds[2].percent,odds[3].percent);
 const rankTicket=policy.outcomes.slice(0,5).reduce((n,r)=>n+r.chancePpm,0),counts=Object.fromEntries(pools.SSS.map(c=>[c,0]));
 for(let ticket=0;ticket<10010;ticket++){const r=pickMercenaryDraw({policy,mercenaries,randomInt:max=>max===1000000?rankTicket:ticket});counts[r.mercenaryCode]++;}
 assert.deepEqual(counts,{'V-021':8991,'V-046':999,'V-049':10,'V-055':10});
 assert.equal(pickFusionResult({rank:'SS',pools,rules:policy.cardRules,randomInt:max=>max===10000?9999:10000}).mercenaryCode,BERKAN_CODE);
 const later={...policy.cardRules.cardWeights,[BERKAN_CODE]:7};assert.equal(berkanSelectionWeights(pools.SSS,later),later);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} rare SSS acquisition is atomic/retry-safe and uses the separate mercenary slot`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SSS'?1000000:0;
 f.draw.cardRules.cardWeights={'V-021':8991,'V-046':999,'V-049':10};await f.setDraw(f.draw);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2};
 const result=await openMercenaryCards(f.env,f.user,request,{randomInt:n=>n===1000000?0:10009});assert.ok(result.draws.every(d=>d.mercenaryCode===BERKAN_CODE));assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Duplicate reroll')}});assert.equal(await f.coin(),before-2000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:BERKAN_CODE,revision:0});const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);
 assert.equal(deployed.rank,'SSS');assert.equal(deployed.basePower,180000);assert.equal(deployed.sourceArt,art.sourceArt);assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),[BERKAN_SKILL_ID]);
});
test('PVE and both PVP sides use five cards plus Berkan and the one simultaneous server cast',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'})),merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,BERKAN_CODE);assert.ok(data.result.timeline.some(e=>e.skillId===BERKAN_SKILL_ID&&e.type==='MERCENARY_STARFALL'));
 }
});
test('golden particles add no rolls: one hit, dodge preserves HP, absent target spends no energy',()=>{
 for(const outcome of ['hit','dodge','lost']){
  const actor=buildMercenaryFighter(snapshot,'A','PVE'),enemy=buildMercenaryFighter({...snapshot,code:'V-001',skills:[]},'B','PVE'),events=[];let rolls=0;
  enemy.isMercenary=false;enemy.row='BACK';enemy.slot=0;const runtime=mercenaryCombat({teams:{A:[actor],B:[enemy]},hit:(_a,_t,m)=>{rolls++;return {damage:1000*m,dodge:outcome==='dodge'};},damage:(t,d)=>{const hpDamage=Math.min(t.hp,d);t.hp-=hpDamage;return {hpDamage,absorbed:0};},knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  runtime.state(actor).energy=100;if(outcome==='lost'){enemy.hp=0;enemy.alive=false;}actor.actions++;runtime.beforeAction(actor);
  assert.equal(rolls,outcome==='lost'?0:1);assert.equal(events.filter(e=>e.type==='MERCENARY_STARFALL').length,outcome==='lost'?0:1);
  if(outcome!=='lost')assert.equal(enemy.hp,outcome==='hit'?100000-1000*BERKAN_BALANCE.damageRatio:100000);
  assert.equal(runtime.state(actor).energy,outcome==='lost'?100:65);
 }
});

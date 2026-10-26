import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildFighter,createPvpBattleV2,createDuoBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryPvpTierGuard,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {RAZAK_SKILLS} from '../shared/mercenary-razak-v1.mjs';
import {roster,snapshot,scenarios} from '../scripts/measure-razak-balance-20261026.mjs';
const targets=roster.filter(c=>(c.rank==='SS'&&c.edition==='LIMITED')||c.code==='V-057');
const fighter=(code,side='A',level=1,gear=0,mode='PVP')=>buildMercenaryFighter(snapshot(code,level,mode,gear),side,mode,buildFighter);
const team=(code,side='A',level=1,gear=0,mode='PVP')=>[...scenarios[1].cards.map((c,i)=>buildFighter(c,i,side,null,mode)),fighter(code,side,level,gear,mode)];

test('merged release fits Pages while the original duo scheduler remains in its Worker bundle',async()=>{
 const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,`Pages asset count ${count}`);
 const file='workers/clan-draft/src/duo-schedule.js';assert.equal(isProductionFile(file),false);
 assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'));
 assert.match(fs.readFileSync('workers/clan-draft/src/index.js','utf8'),/import .* from '\.\/duo-schedule\.js'/);
 for(const p of ['shared/mercenary-razak-v1.mjs','assets/ui/project-v/mercenaries/razak-20261024/idle.png','assets/items/prime-requiem-blueprint-v1.webp'])assert.equal(isProductionFile(p),true);
});

test('priority guard uses all 21 released SS limited identities and Kangyun, never a forged name or edition',()=>{
 assert.equal(targets.length,22);
 for(const side of ['A','B'])for(const c of targets){const a=fighter('V-058',side),b=fighter(c.code,side==='A'?'B':'A');assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),16,c.code);}
 const a=fighter('V-058'),b=fighter('V-963','B');
 for(const other of [fighter('V-996','B'),fighter('V-976','B'),{...fighter('V-021','B'),name:'신궁 강윤',edition:'LIMITED'},{...b,code:'V-021',cardId:'V-963',rank:'SSS'}])assert.equal(mercenaryPvpTierGuard(a,[[a],[other]]),1);
 for(const opponents of [[],[{...b,hp:0}],[{...b,alive:false}],[{...b,isMercenary:false}],[{...b,statMode:'CARD'}]])assert.equal(mercenaryPvpTierGuard(a,[[a],opponents]),1);
 assert.equal(mercenaryPvpTierGuard({...a,isMercenary:false},[[b]]),1);
 assert.equal(mercenaryPvpTierGuard({...a,code:'V-021',name:'라자크'},[[b]]),1);
 assert.equal(mercenaryPvpTierGuard(fighter('V-058','A',1,0,'PVE'),[[fighter('V-963','B',1,0,'PVE')]]),1);
});

test('real link applies attack, durability and cap advantage once, retaining growth, gear and injured entry',()=>{
 for(const level of [1,11,21])for(const gear of [0,1e6]){
  const teams=[team('V-058','A',level,gear),team('V-963','B',level,gear)],a=teams[0].at(-1);a.hp=Math.round(a.maxHp/2);
  const cards=structuredClone(teams.map(t=>t.slice(0,5))),ratio=a.hp/a.maxHp;applyMercenaryCombatLink(teams);
  assert.deepEqual(teams.map(t=>t.slice(0,5)),cards);assert.equal(a.mercenaryLink.tierGuard,16);assert.equal(a.mercenaryLink.tierOffense,4);
  assert(Math.abs(a.hp/a.maxHp-ratio)<1e-5);assert.equal(a.mercenaryLevel.level,level);
  assert.equal(mercenarySkillCapActions(a,RAZAK_SKILLS[0],false),12);
  assert(Number.isFinite(mercenaryDamageCapHp(a)));assert(mercenaryDamageCapHp(a)<(a.maxHp+a.mercenaryLink.openingShield)/10);
  for(const key of ['controlImmune','counterImmune','poisonImmune'])assert.equal(a[key],false);
  const once=structuredClone(teams);teams[1].at(-1).hp=0;const stable=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,stable);assert.deepEqual(a,once[0].at(-1));
 }
});

test('actual duo isolates owner linkage and disables priority whenever an opposing SSS limited is present',()=>{
 const squad=(ownerId,code,powerScale=1)=>({ownerId,cards:scenarios[1].cards.map(c=>({...c,power:c.power*powerScale})),mercenary:snapshot(code,11,'PVP',1e6)});
 const run=code=>createDuoBattleV2({attackerSquads:[squad(101,'V-058'),squad(102,'V-021',.1)],defenderSquads:[squad(201,'V-963'),squad(202,code)],seed:763819});
 const priority=run('V-057'),mixed=run('V-976');
 const a=priority.teams.A.mercenaries.find(m=>m.code==='V-058'),other=priority.teams.A.mercenaries.find(m=>m.code==='V-021');
 assert.equal(a.mercenaryLink.tierGuard,16);assert.equal(other.mercenaryLink.tierGuard,1);assert.equal(a.ownerId,101);
 assert.equal(mixed.teams.A.mercenaries.find(m=>m.code==='V-058').mercenaryLink.tierGuard,1);
 assert.equal(priority.result.winner,'A');assert(priority.result.timeline.some(e=>e.type==='MERCENARY_RAZAK_ASSASSINATION'));
});

test('all priority opponents lose equal-condition canonical team battles and linked isolated duels on both sides',()=>{
 let games=0;
 for(const c of targets)for(const f of [scenarios[0],scenarios[1],scenarios[9],scenarios[12]])for(const side of ['A','B'])for(let i=1;i<=4;i++){
  const a=snapshot('V-058',f.level,'PVP',f.gear),b=snapshot(c.code,f.level,'PVP',f.gear),seed=190001+i*7919;
  const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='A'?b:a,seed});
  assert.equal(battle.result.winner,side,`${c.code}/${f.id}/${side}/${i}/team`);
  const teams=[side==='A'?'V-058':c.code,side==='B'?'V-058':c.code].map((code,index)=>{const s=index?'B':'A';return [...f.cards.map((c,j)=>buildFighter(c,j,s,null,'PVP')),fighter(code,s,f.level,f.gear)];});
  applyMercenaryCombatLink(teams);
  const duel=simulateBattleV2Preview({teamA:[teams[0].at(-1)],teamB:[teams[1].at(-1)],seed,maxActions:300,suddenDeathAfter:240});
  assert.equal(duel.winner,side,`${c.code}/${f.id}/${side}/${i}/duel`);games+=2;
 }
 assert.equal(games,1408);
});

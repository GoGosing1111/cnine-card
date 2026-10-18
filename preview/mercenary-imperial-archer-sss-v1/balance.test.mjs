import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildFighter,buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence,createPvpBattleV2,createDuoBattleV2} from './balance-engine.mjs';
import {IMPERIAL_ARCHER_COMBAT as policy,IMPERIAL_ARCHER_SKILLS as skills,ARCHER_RAIN,ARCHER_VOLLEY} from './balance.mjs';
import {baseline,candidate,tierCards,fixture} from './measure-balance.mjs';
const {MERCENARY_CMS_SEED:seed}=await import('../../functions/_mercenary_cms_seed.js');
const root=fileURLToPath(new URL('../../',import.meta.url));

function harness(mode='PVP',count=5){
 const actor=buildMercenaryFighter(candidate(),'A',mode,buildFighter),hits=[],events=[];
 const targets=Array.from({length:count},(_,i)=>({id:'T'+i,side:'B',slot:i,row:i<2?'FRONT':'BACK',attack:50+i,openingAttack:100-i,
  hp:1e9,maxHp:1e9,shield:100,maxShield:100,alive:true}));
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},
  hit(a,t,ratio,options){hits.push({target:t.id,ratio,...options});return {damage:1000*ratio,dodge:t.id==='T3'};},
  damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};},
  knockout(t){if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,targets,hits,events,runtime,act(){actor.actions++;return runtime.beforeAction(actor);}};
}
test('released upper-SSS policy matches live V-057 catalog and measured canonical combat',()=>{
 assert.equal(policy.runtimeEnabled,true);
 const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.json',import.meta.url)));
 for(const [key,value]of Object.entries(policy))assert.deepEqual(manifest.balance[key],value);
 assert.deepEqual(manifest.balance.skills,skills);assert.equal(manifest.runtimeEnabled,true);
 for(const rows of [seed.catalog.cards,seed.document.mercenaries])assert.ok(!rows.some(c=>c.code==='V-000'));
 assert.ok(!seed.document.skills.some(s=>s.id.startsWith('PREVIEW-ARCHER')));
 for(const mode of ['PVP','PVE'])for(const gear of [0,1000000]){
  const prepared=candidate(),berkan=baseline('V-055'),azant=baseline('V-056');
  for(const snapshot of [prepared,berkan,azant])if(gear)snapshot.equipment={schemaVersion:1,mode,power:gear};
  const a=buildMercenaryFighter(prepared,'A',mode,buildFighter),b=buildMercenaryFighter(berkan,'A',mode,buildFighter),c=buildMercenaryFighter(azant,'A',mode,buildFighter);
  assert.equal(a.basePower,324000+gear);assert.ok(a.speed>b.speed);assert.equal(b.speed,c.speed);assert.ok(a.attack>b.attack);assert.ok(a.maxHp>b.maxHp);
 }
 const report=JSON.parse(fs.readFileSync(new URL(manifest.balance.comparison,import.meta.url)));
 assert.deepEqual(report.policies.kangyun,policy);assert.deepEqual(report.policies.kangyunSkills,skills);
 const row=report.summaries.find(r=>r.code==='V-057');assert.equal(row.total,8064);assert.ok(row.winRate>.85);
 for(const match of Object.values(row.opponents))assert.ok(match.winRate>.65);
});
test('single cast locks one rear threat, spends energy once, shares one cap and respects control, dodge and shield',()=>{
 const h=harness();h.act();
 assert.equal(h.hits.length,1);assert.equal(h.hits[0].target,'T4');assert.equal(h.hits[0].ratio,8.4);assert.equal(h.hits[0].capScale,2.7);
 assert.equal(h.runtime.state(h.actor).energy,75);assert.equal(h.runtime.state(h.actor).cooldown.get(skills[0].id),3);
 const event=h.events.find(e=>e.mechanic===ARCHER_VOLLEY&&e.hits);assert.equal(event.hits.length,1);assert.equal(event.hits[0].absorbed,100);assert.equal(event.hits[0].damage,8300);assert.equal(event.visualContacts.length,6);
 h.act();assert.equal(h.hits.length,1);h.act();assert.equal(h.hits.length,2);assert.equal(h.runtime.state(h.actor).energy,70);
 assert.equal(h.runtime.beforeBasicDamage(h.actor,h.targets[0],1000),900);
 for(const status of ['stunned','silenced']){const x=harness();x.actor[status]=true;x.act();assert.equal(x.hits.length,0);assert.equal(x.runtime.state(x.actor).energy,100);}
 const dodge=harness();dodge.targets[4].alive=false;dodge.act();assert.equal(dodge.hits[0].target,'T3');assert.equal(dodge.hits.length,1);assert.equal(dodge.actor.damageDealt,0);
 const empty=harness();for(const t of empty.targets)t.alive=false;empty.act();assert.equal(empty.runtime.state(empty.actor).energy,100);assert.equal(empty.hits.length,0);
 const suppressed=harness();suppressed.runtime.debuffs.set(suppressed.actor.id,{veil:{percent:25}});suppressed.act();
 assert.equal(suppressed.hits[0].ratio,8.4*.75);assert.equal(suppressed.hits[0].capScale,2.7*.75);
});
test('PVE area divides one 1200% budget across 1, 5 and 12 enemies and is never selected in PVP',()=>{
 for(const count of [1,5,12]){
  const h=harness('PVE',count);h.actor.skills=[structuredClone(skills[1])];h.act();
  assert.equal(h.hits.length,count);assert.ok(Math.abs(h.hits.reduce((n,r)=>n+r.ratio,0)-12)<1e-12);assert.equal(new Set(h.hits.map(r=>r.target)).size,count);
  assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get(skills[1].id),5);
  assert.equal(h.events.filter(e=>e.mechanic===ARCHER_RAIN&&e.hits).length,1);
 }
 const pve=harness('PVE');pve.act();pve.act();assert.deepEqual(pve.events.filter(e=>e.hits).map(e=>e.mechanic),[ARCHER_VOLLEY,ARCHER_RAIN]);assert.equal(pve.runtime.state(pve.actor).energy,50);
 const pvp=harness();pvp.actor.skills=[structuredClone(skills[1])];pvp.act();assert.equal(pvp.hits.length,0);assert.equal(pvp.runtime.state(pvp.actor).energy,100);
});
test('twelve reserved archer turns per four allied card actions; same-owner duo credit only',()=>{
 const a=buildMercenaryFighter(candidate(),'A','PVP',buildFighter),regular={id:'card',side:'A',hp:10,alive:true},enemy={id:'other',side:'B',hp:10,alive:true};
 const cadence=mercenaryTurnCadence({A:[a,regular],B:[enemy]});let turns=0;
 for(let i=0;i<4;i++){cadence.acted(regular);let pending;while((pending=cadence.pending())){assert.equal(pending,a);cadence.acted(pending);assert.ok(++turns<=12);}}
 assert.equal(turns,12);
 const b=buildMercenaryFighter(candidate(),'A','PVP',buildFighter);a.ownerId=1;b.ownerId=2;regular.ownerId=1;
 const duo=mercenaryTurnCadence({A:[a,b,regular],B:[enemy]});duo.acted(regular);for(let i=0;i<3;i++){assert.equal(duo.pending(),a);duo.acted(a);}assert.equal(duo.pending(),null);
});
test('actual duo battle creates dedicated archer receipts; unselected live combat stays byte-identical',()=>{
 const cards=tierCards(2e7),squads=(id,merc)=>[{ownerId:id,cards,mercenary:merc},{ownerId:id+1,cards,mercenary:baseline('V-049')}];
 const duel=createDuoBattleV2({attackerSquads:squads(1,candidate()),defenderSquads:squads(3,baseline('V-055')),seed:314159}).result;
 assert.ok(duel.timeline.some(e=>e.type==='MERCENARY_IMPERIAL_ARROW_VOLLEY'&&e.hits?.length===1));
 const source=`import {createHash} from 'node:crypto';import {createPvpBattleV2} from './functions/_battle_v2_preview.js';import {azantBalanceCandidate as c} from './scripts/measure-azant-berkan-20261014.mjs';import {tierCards,fixture} from './tests/helpers/mercenary-operating-roster-v2144.mjs';const out=[];for(const n of [7,97])for(const code of ['V-055','V-056','V-049']){const cards=tierCards(2e7),b=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:c(code),defenderMercenary:c('V-046'),singleHealerBonus:fixture.singleHealerBonus,seed:n*7919});out.push(createHash('sha256').update(JSON.stringify(b)).digest('hex'));}console.log(JSON.stringify(out));`;
 const original=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:root,encoding:'utf8'})),current=[];
 for(const n of [7,97])for(const code of ['V-055','V-056','V-049']){
  const battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:baseline(code),defenderMercenary:baseline('V-046'),singleHealerBonus:fixture.singleHealerBonus,seed:n*7919});
  current.push(createHash('sha256').update(JSON.stringify(battle)).digest('hex'));
 }
 assert.deepEqual(current,original);
});

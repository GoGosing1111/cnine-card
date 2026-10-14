import test from 'node:test';
import assert from 'node:assert/strict';
import {AZANT_CODE,AZANT_COMBAT} from '../shared/mercenary-azant-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {buildFighter,createDuoBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {azantBalanceCandidate as candidate} from '../scripts/measure-azant-berkan-20261014.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {mercenaryCombatLinkText} from '../shared/mercenary-combat-link-v2103.mjs';

const actor=(id,side,extra={})=>({id,side,hp:100,maxHp:100,alive:true,...extra});
const merc=(code,side,extra={})=>actor(side+code,side,{isMercenary:true,statMode:'RANK_FIXED',battleMode:'PVP',code,...extra});
const drain=clock=>{let n=0,m;while((m=clock.pending())){assert.ok(++n<5,'recursive action');clock.acted(m);}return n;};

test('Azant receives five reserved turns per four ally cards on either side, with isolated duo owners',()=>{
 for(const side of ['A','B'])for(const code of [AZANT_CODE,'V-055','V-049']){
  const card=actor('card',side),m=merc(code,side),other=side==='A'?'B':'A',clock=mercenaryTurnCadence({[side]:[card,m],[other]:[]});
  const turns=[];for(let i=0;i<8;i++){clock.acted(card);turns.push(drain(clock));}
  assert.deepEqual(turns,code==='V-049'?Array(8).fill(1):[1,1,1,2,1,1,1,2]);
  for(const extra of [{isBattleSuit:true},{actorKind:'BATTLE_SUIT'},{isMonster:true},{hp:0}])clock.acted({...card,...extra});assert.equal(drain(clock),0);
 }
 const a=actor('a','A',{ownerId:1}),b=actor('b','A',{ownerId:2}),m=merc(AZANT_CODE,'A',{ownerId:1}),n=merc('V-049','A',{ownerId:2}),clock=mercenaryTurnCadence({A:[a,b,m,n],B:[]});
 for(let i=0;i<4;i++){clock.acted(b);assert.equal(clock.pending(),n);assert.equal(drain(clock),1);}
 let count=0;for(let i=0;i<4;i++){clock.acted(a);assert.equal(clock.pending(),m);count+=drain(clock);}assert.equal(count,5);
 clock.acted(a);clock.acted(m);assert.equal(clock.pending(),null);m.hp=0;m.alive=false;clock.acted(a);assert.equal(clock.pending(),null);
});

test('Azant speed matches Berkan with and without personal gear; base power, health, attack and defense stay fixed',()=>{
 for(const mode of ['PVP','PVE'])for(const power of [0,1000000]){
  const equipment={schemaVersion:1,mode,power},a=buildMercenaryFighter({...candidate(AZANT_CODE),equipment},'A',mode,buildFighter),b=buildMercenaryFighter({...candidate('V-055'),equipment},'A',mode,buildFighter);
  const base=buildFighter({id:AZANT_CODE,power:180000+power,type:'NONE'},5,'A',null,mode);
  assert.equal(a.speed,b.speed);assert.equal(a.speed,Math.round(base.speed*1.25));assert.equal(a.stats.speed,a.speed);assert.equal(a.basePower,180000+power);
  for(const key of ['attack','defense','maxHp'])assert.equal(a[key],base[key]);
 }
 const cms={...candidate(AZANT_CODE),statMode:'CMS',stats:{hp:10000,attack:100,defense:100,speed:100}};assert.equal(buildMercenaryFighter(cms,'A','PVP').speed,100);
});

test('PVP cap and existing variance apply once; raw budget, PVE budget, cost, cooldown and zero damage remain intact',()=>{
 for(const mode of ['PVP','PVE'])for(const count of [1,2,12])for(const tierOffense of [1,2])for(const zero of [false,true]){
  const prepared=structuredClone(candidate(AZANT_CODE));if(mode==='PVE')prepared.skills=prepared.skills.filter(s=>s.id==='MS-058');
  const a=buildMercenaryFighter(prepared,'A',mode,buildFighter);a.mercenaryLink={tierOffense};if(zero)for(const s of a.skills)s.balance.damageRatio=0;
  const targets=Array.from({length:count},(_,i)=>({...actor('T'+i,'B'),hp:1e6,maxHp:1e6,shield:1000,row:'FRONT',slot:i})),hits=[],events=[];
  const runtime=mercenaryCombat({teams:{A:[a],B:targets},hit(_a,t,ratio,options){hits.push({id:t.id,ratio,...options});return {damage:ratio*1000,dodge:t.id==='T0'};},damage(t,damage){const absorbed=Math.min(t.shield,damage),hpDamage=Math.min(t.hp,damage-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};},knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  a.actions++;runtime.beforeAction(a);const expected=mode==='PVP'?Math.min(count,2):count;
  assert.equal(hits.length,zero?0:expected);assert.equal(runtime.state(a).energy,65);const skillId=mode==='PVP'?'MS-057':'MS-058';assert.equal(runtime.state(a).cooldown.get(skillId),6);
  const cast=events.find(e=>e.type===(mode==='PVP'?'MERCENARY_AZANT_VOLLEY':'MERCENARY_AZANT_AREA'));assert.ok(cast);assert.equal(cast.hits.length,expected);assert.equal(new Set(cast.targetIds).size,expected);
  for(const hit of hits){assert.equal(hit.varyDamageCap,mode==='PVP');assert.equal(hit.capScale,mode==='PVP'?AZANT_COMBAT.pvpSkillCapScale*tierOffense:1);assert.equal(hit.castShare,1/expected);assert.equal(hit.rangedSkill,false);}
  if(!zero)assert.ok(Math.abs(hits.reduce((s,h)=>s+h.ratio,0)-5.6)<1e-9);
  assert.equal(targets[0].hp,1e6);assert.equal(targets[0].shield,1000);assert.equal(runtime.beforeBasicDamage(a,targets[0],1000),mode==='PVP'?500:1000);
  if(zero)assert.equal(a.damageDealt,0);
 }
});

test('actual solo, duo and twelve-target hunt remain deterministic with authoritative single hit receipts',()=>{
 const cards=tierCards(2e7),a=candidate(AZANT_CODE),b=candidate('V-055');
 const input={attackerCards:cards,defenderCards:cards,attackerMercenary:a,defenderMercenary:b,seed:7919};const first=createPvpBattleV2(input);assert.deepEqual(createPvpBattleV2(input),first);
 const squads=(id,m)=>[{ownerId:id,cards,mercenary:m},{ownerId:id+1,cards,mercenary:candidate('V-049')}];
 const duo=createDuoBattleV2({attackerSquads:squads(1,a),defenderSquads:squads(3,b),seed:7919});assert.equal(duo.teams.A.cards.length,10);assert.equal(duo.teams.A.mercenaries.length,2);
 for(const battle of [first,duo]){const events=battle.result.timeline.filter(e=>e.type==='MERCENARY_AZANT_VOLLEY');assert.ok(events.length);assert.ok(events.every(e=>e.hits.length<=2&&new Set(e.targetIds).size===e.hits.length));assert.ok(battle.result.timeline.length<4000);assert.ok(!battle.result.timeline.some(e=>e.type==='MERCENARY_AZANT_AREA'));}
 const hunt=createHuntSession({snapshot:{cards,mercenary:a,accountNickname:'검수'},seed:7919,limitMs:15000}),events=hunt.payload.battleV2.result.timeline.filter(e=>e.type==='MERCENARY_AZANT_AREA');
 assert.ok(events.some(e=>e.hits.length===12));for(const e of events){assert.equal(e.battleMode,'PVE');assert.equal(new Set(e.targetIds).size,e.hits.length);assert.equal(e.damage,e.hits.reduce((s,h)=>s+h.damage,0));}
});

test('public combat description explains Azant cadence and PVP cap without rewriting other mercenaries',()=>{
 const azant=mercenaryCombatLinkText('SSS','REAR',{code:AZANT_CODE});assert.match(azant,/25%/);assert.match(azant,/카드 4회당 용병 추가 행동 5회/);assert.match(azant,/1\.865배/);assert.match(azant,/후열 우선 최대 2명/);assert.match(azant,/PVE에서는 결정창 포격과 적 전체 청옥 강림/);
 const other=mercenaryCombatLinkText('SSS','REAR',{code:'V-055'});assert.doesNotMatch(other,/아잔트|결정창/);assert.match(other,/아군 카드 1회 행동마다 추가 행동/);
});

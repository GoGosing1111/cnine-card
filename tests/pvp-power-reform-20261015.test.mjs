import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFighter,createPvpBattleV2,createDuoBattleV2,createPveBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {mercenarySnapshotPower} from '../functions/_mercenary_account.js';
import {createCityBattle} from '../functions/_jokgak_city_battle.js';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {PVP_POWER_BALANCE,PVP_POWER_BALANCE_RELEASED,pvpPowerBonuses,applyPvpPowerBalance,pvpPolicySnapshot,pvpReplayInput,pvpPowerEnabled,pvpPowerDamageMultiplier} from '../shared/pvp-power-balance-v1.mjs';
import {__territoryLoadoutTest} from '../functions/_territory_war.js';
import {mercenaryModeSnapshot,mercenaryModePresentation,mercenaryPvpIncomingDamage} from '../shared/mercenary-pvp-balance-v1.mjs';
import {snapshot,tierCards,reviewOptions,matchup} from './helpers/pvp-power-reform-20261015.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const merc=(code='V-996',options=reviewOptions,gear=0)=>buildMercenaryFighter({...snapshot(code),...(gear?{equipment:{schemaVersion:1,mode:'PVP',power:gear}}:{})},'A','PVP',buildFighter,options);
const rawTeam=(side,power=1000,attack=1e8,hp=1e5)=>Array.from({length:5},(_,i)=>({...buildFighter({id:i,power,type:'NONE'},i,side),attack,defense:1,maxHp:hp,hp,shield:0,maxShield:0,speed:100,gauge:0}));
const oneHit=(options={})=>simulateBattleV2Preview({teamA:rawTeam('A',2000),teamB:rawTeam('B'),seed:11,maxActions:1,...options}).timeline.find(e=>e.type==='TURN');
const pvp=(options={})=>createPvpBattleV2({attackerCards:tierCards(2e7),defenderCards:tierCards(2e7),attackerMercenary:snapshot('V-996'),defenderMercenary:snapshot('V-055'),seed:7919,...options});

test('release stays OFF; JSON flags, forged card power effects and mercenary flags cannot enable it',()=>{
 assert.equal(PVP_POWER_BALANCE_RELEASED,false);
 const baseline=pvp(),forged=pvp({...JSON.parse('{"PVP_POWER_BALANCE_REVIEW":true,"powerReview":true,"pvpPowerBalance":true}'),
  attackerMercenary:{...snapshot('V-996'),pvpBalanceVersion:PVP_POWER_BALANCE.version,pvpPowerBalance:{version:PVP_POWER_BALANCE.version,damageMultiplier:100}},
  attackerCards:tierCards(2e7).map(c=>({...c,pvpPowerBalance:{version:PVP_POWER_BALANCE.version,damageMultiplier:100}}))});
 assert.deepEqual(forged,baseline);assert.equal(baseline.result.pvpPowerBalance,undefined);
 assert.equal(baseline.teams.A.mercenaries[0].power,1080000);
 assert.equal(pvp(reviewOptions).teams.A.mercenaries[0].power,180000);
});

test('saved battles retain their own version through release/rollback; ordinary JSON cannot select the review policy',async()=>{
 const input={attackerCards:tierCards(2e7),defenderCards:tierCards(2e7),attackerMercenary:snapshot('V-996'),defenderMercenary:snapshot('V-055'),seed:7919};
 const old=createPvpBattleV2(input),review=createPvpBattleV2({...input,...reviewOptions});
 assert.deepEqual(pvpPolicySnapshot(),{});assert.equal(pvpPolicySnapshot(reviewOptions).pvpBalanceVersion,PVP_POWER_BALANCE.version);
 assert.equal(pvpPowerEnabled(pvpPolicySnapshot(reviewOptions)),false,'untrusted JSON version cannot turn the released flag on');
 assert.deepEqual(createPvpBattleV2({...input,...reviewOptions,pvpBalanceVersion:'LEGACY'}),old);
 assert.deepEqual(createPvpBattleV2(pvpReplayInput(JSON.parse(JSON.stringify(input)))),old);
 const saved=JSON.parse(JSON.stringify({...input,...pvpPolicySnapshot(reviewOptions)}));
 assert.deepEqual(createPvpBattleV2(pvpReplayInput(saved)),review,'a server-stored reviewed battle can replay even during rollback');
 assert.throws(()=>createPvpBattleV2({...input,pvpBalanceVersion:'UNKNOWN'}),/UNKNOWN_PVP_BALANCE_VERSION/);
 for(const [replayInput,expected] of [[input,old],[saved,review]]){
  const receipt={attackerWon:expected.result.winner==='A'},hydrated=await __territoryLoadoutTest.hydrateBattleReplay({}, {createPvpBattleV2}, {}, {battle_meta_json:JSON.stringify({replayInput})},receipt);
  assert.deepEqual(hydrated.battleV2,expected);assert.equal(hydrated.replayedBattle,true);
 }
 const squad=ownerId=>({ownerId,cards:tierCards(2e7),mercenary:snapshot('V-996')});
 const duo={attackerSquads:[squad(1),squad(2)],defenderSquads:[squad(3),squad(4)],seed:7919};
 assert.deepEqual(createDuoBattleV2(pvpReplayInput(duo)),createDuoBattleV2(duo));
 assert.deepEqual(createDuoBattleV2(pvpReplayInput({...duo,...pvpPolicySnapshot(reviewOptions)})),createDuoBattleV2({...duo,...reviewOptions}));
});

test('bonus is continuous, symmetric by swapping sides, scale independent, monotonic and capped',()=>{
 assert.deepEqual(pvpPowerBonuses(1,1),{ratio:1,damageMultiplier:1,tempoMultiplier:1});
 assert.equal(pvpPowerBonuses(2,1).damageMultiplier,1.3);
 assert.equal(pvpPowerBonuses(2,1).tempoMultiplier,1.15);
 for(const n of [1,5,100,1e6,1e9]){
  let previous=pvpPowerBonuses(n,n);
  for(let bp=1;bp<=30000;bp++){
   const next=pvpPowerBonuses(n*(1+bp/10000),n);
   assert.ok(next.damageMultiplier>=previous.damageMultiplier&&next.tempoMultiplier>=previous.tempoMultiplier);
   assert.ok(next.damageMultiplier-previous.damageMultiplier<.00005&&next.tempoMultiplier-previous.tempoMultiplier<.000025);
   assert.ok(next.damageMultiplier<=1.35&&next.tempoMultiplier<=1.18);
   previous=next;
  }
 }
 for(const ratio of [1.00001,1.1,1.25,1.5,2,3,100]){
  assert.deepEqual(pvpPowerBonuses(ratio*1e6,1e6),pvpPowerBonuses(ratio*1e9,1e9));
  assert.equal(pvpPowerBonuses(1e6,ratio*1e6).damageMultiplier,1);
  assert.equal(pvpPowerBonuses(1e6,ratio*1e6).tempoMultiplier,1);
 }
 for(const bad of [0,-1,NaN,Infinity,'100'])assert.throws(()=>pvpPowerBonuses(bad,1),/INVALID/);
});

test('power boost reaches actual capped damage once and still consumes shields before HP',()=>{
 assert.equal(oneHit().damage,60000);
 assert.equal(oneHit(reviewOptions).damage,78000);
 const enemy=rawTeam('B');enemy[0].shield=20000;enemy[0].maxShield=20000;
 const hit=oneHit({...reviewOptions,teamB:enemy});
 assert.equal(hit.absorbed,20000);assert.equal(hit.damage,58000);assert.equal(hit.targetHpAfter,42000);
 assert.equal(hit.targetShieldAfter,0);
 const defend=rawTeam('B',1000,100,1e8);for(const c of defend)c.defense=1e7;
 const unarmored=rawTeam('B',1000,100,1e8);
 const opts={...reviewOptions,teamA:rawTeam('A',2000,100000,1e8)};
 assert.ok(oneHit({...opts,teamB:defend}).damage<oneHit({...opts,teamB:unarmored}).damage,'defense is still meaningful');
});

test('mercenary protection preserves the scaled damage budget including overflow from a dying guard',()=>{
 for(const guardHp of [10000,100]){
  const skill={...MERCENARY_CMS_SEED.document.skills.find(s=>s.mechanic==='INTERCEPT_ONE_HIT'),balance:{damageRatio:0,cost:15,cooldownTurns:3}};
  const guard=buildMercenaryFighter({code:'V-003',rank:'S',role:'GUARDIAN',position:'FRONT',basePower:70000,level:1,stats:{hp:10000,attack:1000,defense:100,speed:100},combat:snapshot('V-049').combat,skills:[skill]},'A','PVP');
  const ally={...rawTeam('A')[0],id:'ally',hp:5000,maxHp:10000,row:'BACK'},enemy={...rawTeam('B')[0],id:'enemy',damageDealt:0,pvpPowerBalance:{version:PVP_POWER_BALANCE.version,damageMultiplier:1.3}};
  guard.hp=guardHp;const events=[];
  const damage=(target,n,options={})=>{const amount=Math.round(n*pvpPowerDamageMultiplier(options.actor)),hpDamage=Math.min(target.hp,amount);target.hp-=hpDamage;return {hpDamage,absorbed:0};};
  const rt=mercenaryCombat({teams:{A:[guard,ally],B:[enemy]},hit:()=>({damage:1000,dodge:false}),damage,knockout:t=>{if(!t.hp)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  guard.actions++;rt.beforeAction(guard);
  const rest=rt.beforeBasicDamage(enemy,ally,1000);damage(ally,rest,{actor:enemy});
  assert.equal((guardHp-guard.hp)+(5000-ally.hp),1300);
  assert.equal(events.filter(e=>e.type==='MERCENARY_INTERCEPT').length,1);
 }
});

const icon=(role,side,slot)=>{
 const def=ICON_ROLES.find(d=>d.role===role),row={id:def.cardId,grade:'ICON',power:1000};
 row.iconRole=iconRoleSnapshot(row,defaultIconRoles(),'PVP');return buildFighter(row,slot,side,null,'PVP');
};
test('ICON multihit damage scales the whole cast once instead of spending a boosted hit against an unboosted budget',()=>{
 const run=scale=>{
  const actor=icon('ATTACK','A',0),target={...rawTeam('B')[0],hp:1e6,maxHp:1e6};
  actor.pvpPowerBalance={version:PVP_POWER_BALANCE.version,damageMultiplier:scale};actor.iconRole.tuning.damageCapPercent=10;
  const events=[],damage=(t,n)=>{const hpDamage=Math.round(n*scale);t.hp-=hpDamage;return {hpDamage,absorbed:0};};
  const rt=createIconCombatRuntime({teams:{A:[actor],B:[target]},hit:()=>({damage:40000,dodge:false}),damage,rawDamage:damage,knockout:()=>false,emit:(type,data)=>events.push({type,...data})});
  actor.actions=actor.iconRole.tuning.firstAction;assert.equal(rt.beforeAction(actor),true);
  const cast=events.find(e=>e.type==='ICON_SKILL');assert.equal(cast.hits.length,3);return cast.hits.reduce((n,h)=>n+h.damage+h.absorbed,0);
 };
 assert.equal(run(1),100000);assert.equal(run(1.3),130000);
});

test('the real ICON guard receives part of the already boosted hit without a second multiplier',()=>{
 const run=review=>{
  const a=rawTeam('A',2000,10000,1e8),b=rawTeam('B',1000,1,1e8);
  a[0].speed=1e6;a[0].gauge=95;for(const c of a.slice(1))c.speed=1;
  b[0].hp=1e6;const guard=icon('DEFENSE','B',4);Object.assign(guard,{power:1000,maxHp:1e8,hp:1e8,speed:1,attack:1,defense:1,shield:0,maxShield:0});b[4]=guard;
  for(const c of b)c.speed=1;
  const r=simulateBattleV2Preview({teamA:a,teamB:b,maxActions:1,seed:11,...(review?reviewOptions:{})});
  const hit=r.timeline.find(e=>e.type==='TURN'),redirect=r.timeline.find(e=>e.type==='ICON_GUARD');assert.ok(redirect);
  return hit.damage+hit.absorbed+redirect.damage+redirect.absorbed;
 };
 assert.ok(Math.abs(run(true)-Math.round(run(false)*1.3))<=1);
});

test('tempo improves real action opportunities with equal stats and does not grant an automatic action',()=>{
 const options={teamA:rawTeam('A',2000,100,1e12),teamB:rawTeam('B',1000,100,1e12),maxActions:200,seed:11};
 const counts=r=>['A','B'].map(side=>r.timeline.filter(e=>e.type==='TURN'&&e.actorId.startsWith(side+':')).length);
 assert.deepEqual(counts(simulateBattleV2Preview(options)),[100,100]);
 const result=simulateBattleV2Preview({...options,...reviewOptions}),[a,b]=counts(result);
 assert.ok(a>100&&b<100&&a+b===200);
 assert.equal(result.openingTeams.A[0].speed,115);assert.equal(result.openingTeams.B[0].speed,100);
 assert.equal(result.actions,200);
});

test('formation power is frozen, excludes derived combat link, and includes each piece of equipment once',()=>{
 const battle=pvp({...reviewOptions,attackerEquipmentBonus:300000,attackerMercenary:{...snapshot('V-996'),equipment:{schemaVersion:1,mode:'PVP',power:700000}}});
 assert.equal(battle.result.pvpPowerBalance.A[0].formationPower,5*2e7+300000+180000+700000);
 assert.equal(battle.teams.A.mercenaries[0].power,880000);
 const first=battle.result.pvpPowerBalance.A[0];
 assert.ok(battle.result.final.A.some(c=>c.hp<c.maxHp));
 assert.ok(battle.result.final.A.every(c=>c.pvpPowerBalance.formationPower===first.formationPower));
 assert.ok(battle.teams.A.mercenaries[0].mercenaryLink.hpFloor>880000,'derived link is not added to displayed power a second time');
 const armed=merc('V-996',reviewOptions,700000),bare=merc();
 for(const actor of [armed,bare])applyMercenaryCombatLink([rawTeam('A',2e7,2e7,1e8).concat(actor),rawTeam('B',2e7,2e7,1e8)]);
 assert.equal(armed.mercenaryLink.hpFloor-bare.mercenaryLink.hpFloor,armed.equipmentStats.hp);
 assert.equal(armed.mercenaryLink.attackFloor-bare.mercenaryLink.attackFloor,armed.equipmentStats.attack);
});

test('upper limited premium is retained without million-power bases or immunity to a named mercenary',()=>{
 const valter=merc(),helios=merc('V-999'),jinmu=merc('V-989'),kairon=merc('V-988'),shiranui=merc('V-987');
 for(const m of [valter,helios,jinmu,kairon,shiranui]){
  assert.equal(m.power,180000);assert.equal(m.controlImmune,false);assert.equal(m.counterImmune,false);assert.equal(m.poisonImmune,false);
  assert.equal(mercenaryPvpIncomingDamage(m,10000,merc('V-055')),8000);
  assert.equal(mercenaryPvpIncomingDamage(m,10000,merc('V-056')),8000);
 }
 assert.equal(helios.stats.attack,Math.round(valter.stats.attack*1.04));
 assert.ok(Math.abs(jinmu.stats.attack/helios.stats.attack-1.2)<.00001);
 assert.deepEqual(kairon.stats,jinmu.stats);assert.deepEqual(shiranui.stats,jinmu.stats);
 const old=merc('V-996',{});assert.equal(old.controlImmune,true);assert.equal(old.power,1080000);
 const lastStand=tierCards(2e7).map(c=>({...c,startingHpPercent:0}));
 const b=pvp({...reviewOptions,attackerCards:lastStand,defenderCards:lastStand}),hits=b.result.timeline.filter(e=>e.actorId==='B:MERCENARY:V-055').flatMap(e=>e.impacts||[e]).filter(e=>e.targetId==='A:MERCENARY:V-996');
 assert.ok(hits.some(e=>e.damage+e.absorbed>0),'Berkan can actually damage Valter');
});

test('PVP display/account totals follow the normalized base; PVE and locked release display are preserved',()=>{
 for(const code of ['V-049','V-055','V-056','V-990','V-996','V-999','V-989','V-988','V-987']){
  const source=snapshot(code),pvpSnapshot=mercenaryModeSnapshot(source,'PVP',reviewOptions);
  assert.equal(mercenarySnapshotPower(pvpSnapshot,reviewOptions),merc(code).power);
  assert.equal(mercenaryModePresentation(source,'PVP',reviewOptions).basePower,merc(code).power);
  assert.equal(mercenaryModeSnapshot(source,'PVE',reviewOptions),source);
  assert.equal(mercenaryModeSnapshot(source,'PVP'),source);
  assert.equal(mercenaryModePresentation(source,'PVP'),source);
  assert.equal(mercenaryModePresentation(source,'PVE',reviewOptions),source);
  const gear={...pvpSnapshot,equipment:{schemaVersion:1,mode:'PVP',power:700000}};
  assert.equal(mercenarySnapshotPower(gear,reviewOptions),merc(code).power+700000);
 }
 const hidden={code:'V-980',rank:'SS',artOnly:true,basePower:null};
 assert.equal(mercenaryModePresentation(hidden,'PVP',reviewOptions),hidden,'unreleased art-only cards are not assigned combat stats');
});

test('duo power and linked stats are owner scoped; a stronger teammate cannot lend a power bonus',()=>{
 const squad=(ownerId,power)=>({ownerId,cards:tierCards(power),equipmentBonus:12345,mercenary:snapshot('V-996')});
 const battle=createDuoBattleV2({attackerSquads:[squad(1,4e7),squad(2,1e7)],defenderSquads:[squad(3,2e7),squad(4,2e7)],seed:7919,...reviewOptions});
 const [strong,weak]=battle.result.pvpPowerBalance.A;
 assert.equal(strong.formationPower,5*4e7+12345+180000);assert.equal(weak.formationPower,5*1e7+12345+180000);
 assert.equal(strong.opponentPower,5*2e7+12345+180000);
 assert.ok(strong.damageMultiplier>1);assert.equal(weak.damageMultiplier,1);assert.equal(weak.tempoMultiplier,1);
 for(const actor of [...battle.teams.A.cards,...battle.teams.A.mercenaries])assert.equal(actor.pvpPowerBalance.formationPower,actor.ownerId===1?strong.formationPower:weak.formationPower);
 assert.ok(battle.teams.A.mercenaries[0].mercenaryLink.attackFloor>battle.teams.A.mercenaries[1].mercenaryLink.attackFloor*3.9);
});

test('reserved actions are earned by own cards, not an ally or enemy, and last stands have natural speed',()=>{
 const r=(id,side='A')=>({id:String(id),ownerId:id,side,hp:10,alive:true});
 const a=r(1),ally=r(2),b=r(3,'B'),ma={...merc(),ownerId:1},mb={...merc(),id:'ally-merc',ownerId:2};
 const cadence=mercenaryTurnCadence({A:[a,ally,ma,mb],B:[b]});
 for(let i=0;i<20;i++)cadence.acted(b);assert.equal(cadence.pending(),null);
 cadence.acted(a);assert.equal(cadence.pending(),null);cadence.acted(a);assert.equal(cadence.pending(),ma);
 cadence.acted(ma);assert.equal(cadence.pending(),null);
 cadence.acted(ally);cadence.acted(ally);assert.equal(cadence.pending(),mb);
 cadence.acted(mb);a.hp=0;ally.hp=0;
 for(let i=0;i<20;i++)cadence.acted(b);assert.equal(cadence.pending(),null);
 const opened=pvp(reviewOptions);assert.ok(opened.teams.A.mercenaries[0].speed>=opened.teams.A.cards.reduce((s,c)=>s+c.speed,0)/5*.6*1.5-1);
 const normal=rawTeam('A',2e7,2e7,1e8),last=merc();applyMercenaryCombatLink([normal.concat(last),rawTeam('B')]);
 for(const c of normal){c.hp=0;c.alive=false;}
 const result=simulateBattleV2Preview({teamA:normal.concat(last),teamB:rawTeam('B',2e7,1,1e12),seed:7,maxActions:30,...reviewOptions});
 assert.ok(result.timeline.some(e=>e.actorId===last.id&&e.type==='TURN'),'last mercenary continues through its own speed gauge');
});

test('derived power rejects malformed/duplicate application and never applies to PVE or suits',()=>{
 const a=rawTeam('A'),b=rawTeam('B');applyPvpPowerBalance([a,b]);assert.throws(()=>applyPvpPowerBalance([a,b]),/ALREADY_APPLIED/);
 assert.throws(()=>applyPvpPowerBalance([rawTeam('A').slice(1),rawTeam('B')]),/INVALID/);
 assert.throws(()=>applyPvpPowerBalance([rawTeam('A',Number.MAX_SAFE_INTEGER),rawTeam('B')]),/INVALID/);
 assert.equal(applyPvpPowerBalance([rawTeam('A').map(c=>({...c,battleMode:'PVE'})),rawTeam('B')]),null);
 assert.equal(applyPvpPowerBalance([rawTeam('A').map(c=>({...c,isBattleSuit:true})),rawTeam('B')]),null);
 const city=createCityBattle({attackerCards:tierCards(2e7),defenderCards:tierCards(1e7),attackerPower:120000,defenderPower:100000});
 assert.equal(city.result.pvpPowerBalance,undefined);assert.equal(city.rules.accountGrowthApplied,false);
});

test('growth helps a normal SSS overcome a limited, while a lower-power counter formation can still win',()=>{
 const base=matchup({code:'V-049',opponent:'V-996',ratio:1,seeds:48});
 const grown=matchup({code:'V-049',opponent:'V-996',ratio:1.25,seeds:48});
 assert.ok(grown.winRate>base.winRate+.5);
 const upset=matchup({code:'V-055',opponent:'V-996',ratio:.9,deck:'speed',enemyDeck:'attack',seeds:48});
 assert.ok(upset.wins>0,'a weaker normal SSS formation can counter the opposing deck');
 const limited=matchup({code:'V-989',opponent:'V-055',ratio:1,seeds:48});
 assert.ok(limited.winRate>.5,'new limited keeps an advantage at equal growth');
});

// Captured from the unmodified HEAD before implementing the gated reform.
const pveHashes={
 'V-049':'207e3138edada7cd798a685dda579727cf2d2b8393926b844272627c06aa500f',
 'V-055':'25abf89b6645c00f6f9afa45db584a2212a6796e37be47b1269d055846fe9db0',
 'V-990':'edbd2b6baf4a369f21d531625811f675b5bd2f14e6eb42ac0cb55d831da1bb1c',
 'V-996':'4489ab12374e526db6cf1df5bef2608d6d51ef7de794b9f4c786601cac9e49de',
 'V-999':'c56413cb9a1e413242764d0b3aa957cc5fbf1da3a504c0d5d1e8ebb35f3708a4',
 'V-989':'7ef9fb0f06aa45f714ee991c655325528fa82eac8dfcca5c0b12ec432265696f',
 'V-988':'c2559c6e2bdbf6e1729d07cc3016d8969e7d77156eaa187babb45f1ecb782480',
 'V-987':'809d5f1ee29bd9925c1712a428f23c288e20e98b8ac3998946a143b7d370e8d5',
};
for(const [code,hash] of Object.entries(pveHashes))test(`${code}: PVE full result/timeline is byte-for-byte unchanged`,()=>{
 assert.equal(digest(createPveBattleV2({cards:tierCards(2e7),mercenary:snapshot(code),monster:{id:1,name:'PVE preservation',battle_power:6e8},seed:7919,...reviewOptions})),hash);
});

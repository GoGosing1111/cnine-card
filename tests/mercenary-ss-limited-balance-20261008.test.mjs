import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_TARGET,mercenaryCombatRank,ssLimitedProfile} from '../shared/mercenary-ss-limited-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {MERCENARY_LEVEL_RELEASE_ENABLED} from '../shared/mercenary-level-v1.mjs';
import {applyMercenaryCombatLink,mercenaryPvpTierGuard} from '../shared/mercenary-combat-link-v2103.mjs';
import {rangedMercenaryPvpScale,rangedMercenaryPvpRule} from '../shared/mercenary-ranged-balance-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot,sssReferences,ssLimitedFormations,measureSSLimitedBalance} from '../scripts/measure-ss-limited-balance-20261008.mjs';
import {tierCards,tierDecks} from './helpers/mercenary-operating-roster-v2144.mjs';
import {matchupPolicyFingerprint,measureSSLimitedMatchups} from '../scripts/measure-ss-limited-matchups-20261010.mjs';

const codes=Object.keys(SS_LIMITED_COMBAT);
const fighter=(snapshot,side='A',mode='PVP')=>buildMercenaryFighter(snapshot,side,mode,buildFighter);
test('all seven SS limited identities use a distinct server policy without altering rank, growth or release flags',()=>{
 const limited=LIMITED_MERCENARIES.filter(c=>c.rank==='SS');assert.deepEqual(codes,[...limited.map(c=>c.code)]);assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,false);
 for(const c of limited){
  const input=ssLimitedSnapshot(c.code),before=structuredClone(input),actor=fighter({...input,rank:'C',basePower:1,position:'FRONT',skills:[]});
  assert.deepEqual(input,before);assert.equal(actor.rank,'SS');assert.equal(actor.grade,'SS');assert.equal(mercenaryCombatRank(actor),'SSS');assert.equal(actor.basePower,180000);
  assert.equal(actor.position,SS_LIMITED_COMBAT[c.code].position);assert.equal(actor.skills[0].id,'MS-'+c.code.slice(2));
  assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.equal(c.artOnly,true);assert.deepEqual(c.skills,[]);assert.equal(mercenaryAcquisitionEnabled(c.code),false);
  actor.skills[0].balance.damageRatio=0;assert.equal(fighter(input).skills[0].balance.damageRatio,5.6,'one battle cannot mutate the policy or another battle');
  assert.equal(ssLimitedProfile({...actor,isMercenary:false}),null);assert.equal(mercenaryCombatRank({...actor,isMercenary:false}),'SS');
 }
 assert.equal(ssLimitedProfile({isMercenary:true,code:'V-055',rank:'SS',edition:'LIMITED',name:'나무늘봉순'}),null);
 for(const code of ['constructor','toString','__proto__','V-996','V-999'])assert.equal(ssLimitedProfile({isMercenary:true,code}),null);
});

test('SS limited and ordinary SSS have no grade handicap in either direction, including duo owners',()=>{
 for(const code of codes)for(const opponent of sssReferences){
  const a=fighter(ssLimitedSnapshot(code)),b=fighter(opponent,'B');
  assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),1);assert.equal(mercenaryPvpTierGuard(b,[[a],[b]]),1);
  a.ownerId=1;b.ownerId=2;assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),1);assert.equal(mercenaryPvpTierGuard(b,[[a],[b]]),1);
 }
 for(const aRank of ['S','SS','SSS'])for(const bRank of ['S','SS','SSS']){
  const a={isMercenary:true,code:'V-001',rank:aRank,statMode:'RANK_FIXED',side:'A',battleMode:'PVP',hp:1},b={...a,code:'V-003',rank:bRank,side:'B'};
  assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),1+Math.max(0,['S','SS','SSS'].indexOf(aRank)-['S','SS','SSS'].indexOf(bRank))*5);
 }
});

test('SS limited linkage remains owner-local, finite and idempotent; ordinary SS sniper rules are preserved',()=>{
 for(const code of codes){
  const m=fighter(ssLimitedSnapshot(code)),ordinary=tierCards(2e7).map((c,i)=>buildFighter(c,i,'A',null,'PVP')),before=structuredClone(ordinary),team=[...ordinary,m];
  applyMercenaryCombatLink([team]);const once=structuredClone(team);applyMercenaryCombatLink([team]);assert.deepEqual(team,once);assert.deepEqual(ordinary,before);
  for(const key of ['attackFloor','hpFloor','openingShield'])assert.ok(Number.isSafeInteger(m.mercenaryLink[key])&&m.mercenaryLink[key]>0);
  assert.equal(rangedMercenaryPvpScale(m,m.skills[0]),1);assert.equal(rangedMercenaryPvpRule(m.skills[0],m),'');
 }
 const skill={mechanic:'LOCKED_THREAT_SHOT'},regular={code:'V-004',rank:'SS',role:'SNIPER',attackStyle:'RANGED',isMercenary:true,battleMode:'PVP'};
 assert.equal(rangedMercenaryPvpScale(regular,skill),.86);assert.match(rangedMercenaryPvpRule(skill,regular),/86%/);
});

test('prepared skills use actual server events, one resource charge, and bounded PVE and PVP damage',()=>{
 for(const code of codes)for(const mode of ['PVP','PVE']){
  const a=fighter(ssLimitedSnapshot(code),'A',mode),b={...buildFighter({id:'target',power:1e9},0,'B',null,mode),hp:1e10,maxHp:1e10},events=[];
  const runtime=mercenaryCombat({teams:{A:[a],B:[b]},hit:()=>({damage:100,dodge:false}),damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  a.actions=1;runtime.beforeAction(a);assert.equal(runtime.state(a).energy,80);assert.equal(runtime.state(a).cooldown.get(a.skills[0].id),3);
  a.actions=2;runtime.beforeAction(a);
  assert.equal(runtime.state(a).energy,90);assert.equal(events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length,1);
  assert.ok(events.some(e=>e.type==='MERCENARY_HIT'&&e.damage>0));assert.ok(b.hp>0);
 }
 for(const code of codes){const battle=createPveBattleV2({cards:tierCards(2e7),mercenary:ssLimitedSnapshot(code),monster:{id:1,battle_power:6e8},seed:7919});
  assert.ok(battle.result.timeline.some(e=>e.actorId?.includes(code)&&e.type==='MERCENARY_HIT'&&e.damage>0));
 }
});

test('duo owner snapshots remain unique, deterministic and in the SSS combat tier',()=>{
 const cards=tierCards(2e7).map((c,i)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]})),squad=(ownerId,mercenary)=>({ownerId,cards,mercenary});
 const data={attackerSquads:[squad(1,ssLimitedSnapshot('V-990')),squad(2,ssLimitedSnapshot('V-997'))],defenderSquads:[squad(3,sssReferences[2]),squad(4,sssReferences[3])],seed:7919},before=structuredClone(data);
 const result=createDuoBattleV2(data);assert.deepEqual(data,before);assert.deepEqual(createDuoBattleV2(data),result);
 const mercenaries=[...result.teams.A.mercenaries,...result.teams.B.mercenaries];assert.equal(new Set(mercenaries.map(m=>m.id)).size,4);assert.ok(mercenaries.every(m=>m.mercenaryLink.tierGuard===1));
});

test('Valter retains supremacy over all seven SS limited fighters on either side',()=>{
 const valter=ssLimitedSnapshot('V-996');
 for(const code of codes)for(const power of [10000,2e7,2e9])for(const types of Object.values(tierDecks))for(const side of ['A','B'])for(const seed of [7919,65537]){
  const cards=tierCards(power,types),limited=ssLimitedSnapshot(code),result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?valter:limited,defenderMercenary:side==='B'?valter:limited,seed}).result;
  assert.equal(result.winner,side,`${code}/${power}/${types}/${side}/${seed}`);
 }
});

test('the independent full report meets the requested tier band and retains matchup/sides/formation denominators',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../docs/ss-limited-buff-report-20261010.json',import.meta.url),'utf8'));
 assert.equal(report.profileFingerprint,createHash('sha256').update(JSON.stringify(SS_LIMITED_COMBAT)).digest('hex'));
 assert.equal(report.policyFingerprint,matchupPolicyFingerprint());
 assert.equal(report.cmsRevision,61);assert.equal(report.count,64);assert.equal(report.formationCount,35);assert.equal(report.total,125440);
 assert.deepEqual(report.rows.map(r=>r.code),codes);assert.deepEqual(report.excludes,['V-996','V-999']);
 for(const row of report.rows){
  assert.equal(row.total,17920);assert.equal(row.winRate,row.wins/row.total);assert.equal(row.wins+row.losses+row.draws,row.total);
  assert.equal(row.validationSeedStart,report.seedStarts[row.code]);assert.ok(row.validationSeedStart>=470001,'independent from calibration seeds');
  assert.ok(row.winRate>=SS_LIMITED_TARGET.minWinRate&&row.winRate<=SS_LIMITED_TARGET.maxWinRate,`${row.name}: ${row.winRate}`);
  assert.equal(row.opponents.length,4);assert.equal(row.formations.length,140);assert.equal(row.opponents.reduce((n,r)=>n+r.wins,0),row.wins);
  for(const opponent of row.opponents){const band=SS_LIMITED_TARGET.matchups[opponent.code];assert.equal(opponent.total,4480);assert.equal(opponent.winRate,opponent.wins/opponent.total);assert.ok(opponent.winRate>=band.min&&opponent.winRate<=band.max,`${row.name} vs ${opponent.name}: ${opponent.winRate}`);}
  assert.equal(row.sides.A.total,row.sides.B.total);assert.equal(row.sides.A.wins+row.sides.B.wins,row.wins);
  assert.equal(row.groups.BASIC.total+row.groups.EQUIPPED.total,row.total);
 }
});

test('a small canonical replay reproduces saved holdout formation results exactly',()=>{
 const saved=JSON.parse(fs.readFileSync(new URL('../docs/ss-limited-buff-report-20261010.json',import.meta.url),'utf8'));
 const ids=[ssLimitedFormations[0].id,ssLimitedFormations.at(-1).id];
 const replay=measureSSLimitedMatchups({count:saved.count,start:saved.start,seedStarts:saved.seedStarts,codes:['V-990','V-992','V-997'],formationIds:ids});
 for(const row of replay.rows)for(const f of row.formations){const original=saved.rows.find(r=>r.code===row.code).formations.find(r=>r.opponent===f.opponent&&r.formation===f.formation);assert.deepEqual(f,original);}
});

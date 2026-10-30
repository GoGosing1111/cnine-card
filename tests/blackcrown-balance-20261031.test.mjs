import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BLACKCROWN_COMBAT,BLACKCROWN_COMBAT_VERSION,BLACKCROWN_PLAYBACK_RATE} from '../shared/mercenary-blackcrown-combat-v1.mjs';
import {ssLimitedProfile} from '../shared/mercenary-ss-limited-v1.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {balanceSnapshot} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {simulateRankedSeries} from '../shared/ranked-series-v1.mjs';
const cards=tierCards(2e7),codes=Object.keys(BLACKCROWN_COMBAT),hash=value=>createHash('sha256').update(value).digest('hex');
const snapshot=(code,level=1,mode='PVP')=>({...balanceSnapshot(code,level),equipment:{schemaVersion:1,mode,power:level===1?0:1e8}});

test('all six use server-owned independent tuning even with old or forged snapshots',()=>{
 for(const code of codes)for(const mode of ['PVE','PVP'])for(const level of [1,11,21]){
  const source=snapshot(code,level,mode),forged={...structuredClone(source),basePower:9e12,scale:999,speedScale:999,actionCredit:999,battleMode:mode==='PVP'?'PVE':'PVP',skills:[],blackcrownPolicyVersion:'obsolete'};
  const before=structuredClone(forged),expected=buildMercenaryFighter(source,'A',mode,buildFighter),actual=buildMercenaryFighter(forged,'A',mode,buildFighter);
  for(const key of ['maxHp','attack','defense','speed','power','skills'])assert.deepEqual(actual[key],expected[key],`${code} ${mode} ${key}`);
  assert.equal(ssLimitedProfile(actual),BLACKCROWN_COMBAT[code]);assert.equal(actual.rank,'SS');assert.equal(actual.skills.length,2);assert.deepEqual(forged,before);
  assert(actual.skills.every(s=>s.balance.cost===20));assert.equal(BLACKCROWN_PLAYBACK_RATE,2);
 }
});

test('all six resolve real PVE and mirrored PVP with equal growth/equipment and preserve input',()=>{
 const winners=new Set();
 for(const [i,code] of codes.entries())for(const level of [1,11,21]){
  const mercenary=snapshot(code,level,'PVE'),input={cards,mercenary,monster:{id:1,name:'회귀 검수',battle_power:1.6e10},seed:731},before=structuredClone(input);
  const pve=createPveBattleV2(input);assert.deepEqual(input,before);assert.equal(pve.teams.A.mercenaries[0].level,level);assert(pve.result.timeline.some(e=>e.type==='MERCENARY_BLACKCROWN_CAST'));
  for(const side of ['A','B']){
   const own=snapshot(code,level),other=snapshot('V-'+(960+i),level),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?own:other,defenderMercenary:side==='A'?other:own,seed:731});
   const actor=battle.teams[side].mercenaries[0];assert.equal(actor.code,code);assert.equal(actor.level,level);assert.equal(actor.skills.length,2);assert(actor.mercenaryLevelApplied);winners.add(battle.result.winner===side?'BLACKCROWN':'BLOODMOON');
   assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.B.cards.length,5);
  }
 }
 assert.deepEqual([...winners].sort(),['BLACKCROWN','BLOODMOON'],'normal combat retains wins and losses');
});

test('ranked rounds and mixed duo keep each owner profile, while codex exposes the same skill budget',()=>{
 const series=simulateRankedSeries({createBattle:createPvpBattleV2,options:{attackerCards:cards,defenderCards:cards},attackerMercenaries:codes.slice(0,3).map(c=>snapshot(c,11)),defenderMercenaries:['V-960','V-961','V-962'].map(c=>snapshot(c,11)),seed:311});
 assert(series.rounds.length>=2);assert.equal(Math.max(series.score.A,series.score.B),2);
 const squad=(ownerId,code)=>({ownerId,cards,mercenary:snapshot(code,11)});
 const duo=createDuoBattleV2({attackerSquads:[squad(7,'V-950'),squad(8,'V-953')],defenderSquads:[squad(9,'V-961'),squad(10,'V-965')],seed:811});
 assert.deepEqual(duo.teams.A.mercenaries.map(m=>[m.ownerId,m.code,m.level]),[[7,'V-950',11],[8,'V-953',11]]);assert(duo.result.timeline.length);
 const codex=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61}));
 for(const code of codes){const card=codex.cards.find(c=>c.code===code),profile=BLACKCROWN_COMBAT[code];assert.equal(card.basePower,356400);assert.equal(card.rank,'SS');assert.equal(card.blackcrownPolicyVersion,BLACKCROWN_COMBAT_VERSION);assert.deepEqual(card.skills.map(s=>s.balance),profile.skills.map(s=>s.balance));assert(card.combatLinkDescription.includes(String(profile.speedScale)));}
});

test('independent 50688-battle holdout matches shipped profiles and all six satisfy the 60% target band',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../docs/qa/blackcrown-balance-20261031/after.json',import.meta.url)));
 assert.equal(report.profileSha256,hash(JSON.stringify(BLACKCROWN_COMBAT)));assert.equal(report.start,41001);assert.equal(report.count,64);assert.equal(report.total,50688);assert.equal(report.formations.length,11);
 assert.deepEqual(report.summaries.map(r=>r.code),codes);
 for(const row of report.summaries){assert.equal(row.total,8448);assert.equal(row.wins+row.losses+row.draws,row.total);assert.equal(row.sides.A.total,row.sides.B.total);assert(row.winRate>=.58&&row.winRate<=.62,row.code+' measured win rate');assert.equal(Object.keys(row.opponents).length,6);}
});

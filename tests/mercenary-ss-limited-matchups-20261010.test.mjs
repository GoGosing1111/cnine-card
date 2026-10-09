import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import baseline from './fixtures/ss-limited-unchanged-20261010.json' with {type:'json'};
import {SS_LIMITED_COMBAT,SS_LIMITED_PVP_LINK_SCALES,SS_LIMITED_TEMPO,ssLimitedPvpLinkScale} from '../shared/mercenary-ss-limited-v1.mjs';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot,sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
const fighter=(snapshot,side='A',mode='PVP')=>buildMercenaryFighter(snapshot,side,mode,buildFighter);
const ordinary=side=>tierCards(2e7).map((card,i)=>buildFighter(card,i,side,null,'PVP'));

test('SS limited matchup linkage is symmetric, immutable after entry and never affects opposing ordinary SSS',()=>{
 for(const code of Object.keys(SS_LIMITED_COMBAT))for(const reference of sssReferences)for(const side of ['A','B']){
  const other=side==='A'?'B':'A',actor=fighter(ssLimitedSnapshot(code),side),enemy=fighter(reference,other),allies=ordinary(side),opponents=ordinary(other),teams=[[...allies,actor],[...opponents,enemy]];
  const originalCards=structuredClone([...allies,...opponents]),ordinaryOnly=[...ordinary(other),fighter(reference,other)];applyMercenaryCombatLink([ordinaryOnly]);
  assert.equal(ssLimitedPvpLinkScale(actor,teams),SS_LIMITED_PVP_LINK_SCALES[code][reference.code]);applyMercenaryCombatLink(teams);
  assert.deepEqual(enemy,ordinaryOnly.at(-1));assert.deepEqual([...allies,...opponents],originalCards);
  assert.equal(actor.mercenaryLink.ssLimitedMatchupScale,SS_LIMITED_PVP_LINK_SCALES[code][reference.code]);
  const entered=structuredClone(actor);enemy.hp=0;enemy.alive=false;applyMercenaryCombatLink(teams);assert.deepEqual(actor,entered,'opponent KO cannot remove or reapply the entry modifier');
  assert.equal(actor.stats.speed,Math.round(buildFighter({id:code,power:180000,type:'NONE'},5,side,null,'PVP').speed*SS_LIMITED_TEMPO.speedScale));
 }
});

test('PVE, SSS limited, ordinary SS, forged names and unavailable opponents cannot acquire a matchup bonus',()=>{
 const limited=fighter(ssLimitedSnapshot('V-990')),enemy=fighter(sssReferences[0],'B');
 for(const actor of [{...limited,battleMode:'PVE'},{...limited,isMercenary:false},{...limited,statMode:'CUSTOM'},fighter(ssLimitedSnapshot('V-996')),fighter({...sssReferences[0],rank:'SS',name:'나무늘봉순',edition:'LIMITED'})])assert.equal(ssLimitedPvpLinkScale(actor,[[actor],[enemy]]),1);
 for(const code of ['V-996','V-999','V-004','constructor','__proto__'])assert.equal(ssLimitedPvpLinkScale(limited,[[limited],[{...enemy,code}]]),1);
 for(const extra of [{alive:false},{hp:0},{isMercenary:false},{statMode:'CUSTOM'}])assert.equal(ssLimitedPvpLinkScale(limited,[[limited],[{...enemy,...extra}]]),1);
 assert.equal(ssLimitedPvpLinkScale(limited,[[limited]]),1);
});

test('duo averages the opposing lineup and keeps linkage owner-local without account-specific coefficients',()=>{
 const a={...fighter(ssLimitedSnapshot('V-990')),ownerId:1},b={...fighter(ssLimitedSnapshot('V-998')),ownerId:2},x={...fighter(sssReferences[0],'B'),ownerId:3},y={...fighter(sssReferences[3],'B'),ownerId:4};
 const cards=(side,id)=>ordinary(side).map(card=>({...card,ownerId:id}));
 const teams=[[...cards('A',1),a,...cards('A',2),b],[...cards('B',3),x,...cards('B',4),y]];
 for(const actor of [a,b])assert.equal(ssLimitedPvpLinkScale(actor,teams),(SS_LIMITED_PVP_LINK_SCALES[actor.code][x.code]+SS_LIMITED_PVP_LINK_SCALES[actor.code][y.code])/2);
 const renamed=structuredClone(teams).map(team=>team.map(actor=>({...actor,ownerId:actor.ownerId+1000,name:'same-name'})));
 applyMercenaryCombatLink(teams);applyMercenaryCombatLink(renamed);
 for(const [index,actor]of teams[0].entries())if(actor.isMercenary)assert.deepEqual(actor.mercenaryLink,renamed[0][index].mercenaryLink);
});

test('canonical PVE and ordinary SSS combat results remain identical apart from policy metadata',()=>{
 assert.deepEqual(baseline.excludedMetadata,['ssLimitedPolicyVersion','ssLimitedMatchupScale']);
 const cards=tierCards(2e7),hash=result=>createHash('sha256').update(JSON.stringify(result,(key,value)=>baseline.excludedMetadata.includes(key)?undefined:value)).digest('hex');
 for(const row of baseline.cases){
  const result=row.mode==='PVE'?createPveBattleV2({cards,mercenary:ssLimitedSnapshot(row.code),monster:{id:1,battle_power:8e9},seed:row.seed}).result:
   createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:sssReferences.find(c=>c.code===row.attacker),defenderMercenary:sssReferences.find(c=>c.code===row.defender),seed:row.seed}).result;
  assert.equal(hash(result),row.resultSha256,JSON.stringify(row));
 }
});

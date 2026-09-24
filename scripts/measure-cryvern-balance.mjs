import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries,tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {CRYVERN_BALANCE,CRYVERN_CAP_SCALE,CRYVERN_CODE,CRYVERN_NAME,CRYVERN_SKILL_ID,CRYVERN_MECHANIC,CRYVERN_PREVIEW,CRYVERN_ASSETS} from '../shared/mercenary-cryvern-v1.mjs';
export const ragniel=operatingMercenaries.find(c=>c.code==='V-046');
export const cryvern={...ragniel,code:CRYVERN_CODE,name:CRYVERN_NAME,title:'',rank:'SSS',
 ...CRYVERN_ASSETS,
 skills:[{...ragniel.skills[0],id:CRYVERN_SKILL_ID,name:'극빙 왕관',mechanic:CRYVERN_MECHANIC,balance:{...CRYVERN_BALANCE}}]};
export function measure({count=128,powers=[1e6,2e7,1e8,2e9],starts=[1,1001]}={}){
 const results=[];
 for(const start of starts)for(const power of powers)for(const [deck,types] of Object.entries(tierDecks)){
  let wins=0,draws=0,total=0;const sides={A:0,B:0};
  for(const side of ['A','B'])for(let n=start;n<start+count;n++){
   const cards=tierCards(power,types),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,
    attackerMercenary:side==='A'?cryvern:ragniel,defenderMercenary:side==='B'?cryvern:ragniel,
    seed:n*7919,singleHealerBonus:fixture.singleHealerBonus});
   const won=battle.result.winner===side;wins+=Number(won);sides[side]+=Number(won);
   draws+=Number(!['A','B'].includes(battle.result.winner));total++;
  }
  results.push({start,power,deck,total,wins,draws,sides,rate:wins/total});
 }
 const groups=starts.map(start=>{const group=results.filter(r=>r.start===start),total=group.reduce((n,r)=>n+r.total,0),wins=group.reduce((n,r)=>n+r.wins,0);return {start,total,wins,rate:wins/total};});
 const pve=powers.map(power=>{const damage={};for(const [name,m] of [['cryvern',cryvern],['ragniel',ragniel]]){
  const battle=createPveBattleV2({cards:tierCards(power),mercenary:m,monster:{id:1,name:'검수 보스',battle_power:power*20},seed:7919});
  damage[name]=battle.result.timeline.filter(e=>e.actorId?.includes(m.code)&&Array.isArray(e.impacts)).flatMap(e=>e.impacts).reduce((n,i)=>n+i.damage+i.absorbed,0);
 }return {power,...damage,ratio:damage.cryvern/Math.max(1,damage.ragniel)};});
 return {base:'89d6aff6',fixtureRevision:fixture.cmsRevision,scope:'LOCAL_CANONICAL_ENGINE_NOT_PRODUCTION',
  policy:{name:CRYVERN_NAME,title:'',rank:'SSS',balance:CRYVERN_BALANCE,capScale:CRYVERN_CAP_SCALE},
  groups,results,pve,total:results.reduce((n,r)=>n+r.total,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=measure(process.argv.includes('--quick')?{count:64,powers:[2e7]}:{});
 if(process.argv.includes('--write'))await fs.writeFile(new URL('../preview/mercenary-ice-crystal-dual-sword-v1/balance-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({policy:report.policy,groups:report.groups,total:report.total,pve:report.pve},null,2));
}

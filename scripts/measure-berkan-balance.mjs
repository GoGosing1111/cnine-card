import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {BERKAN_BALANCE,BERKAN_CAP_SCALE} from '../shared/mercenary-berkan-v1.mjs';
export function candidate(code){
 const meta=seed.catalog.cards.find(c=>c.code===code),row=seed.document.mercenaries.find(c=>c.code===code);
 return {...meta,...row,code,level:1,statMode:'RANK_FIXED',basePower:180000,combat:fixture.combat,
  skills:seed.document.assignments.find(a=>a.code===code).skillIds.map(id=>seed.document.skills.find(s=>s.id===id))};
}
export function measure({count=128,powers=[1e6,2e7,1e8,2e9],starts=[1,1001],decks=tierDecks}={}){
 const berkan=candidate('V-055'),cryvern=candidate('V-049'),results=[];
 for(const start of starts)for(const power of powers)for(const [deck,types]of Object.entries(decks)){
  let wins=0,draws=0,total=0;const sides={A:0,B:0};
  for(const side of ['A','B'])for(let n=start;n<start+count;n++){
   const cards=tierCards(power,types),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,
    attackerMercenary:side==='A'?berkan:cryvern,defenderMercenary:side==='B'?berkan:cryvern,seed:n*7919,singleHealerBonus:fixture.singleHealerBonus});
   const won=battle.result.winner===side;wins+=Number(won);sides[side]+=Number(won);draws+=Number(!['A','B'].includes(battle.result.winner));total++;
  }
  results.push({start,power,deck,total,wins,draws,sides,rate:wins/total});
 }
 const groups=starts.map(start=>{const rows=results.filter(r=>r.start===start),total=rows.reduce((n,r)=>n+r.total,0),wins=rows.reduce((n,r)=>n+r.wins,0);return {start,total,wins,rate:wins/total};});
 const pve=powers.map(power=>{const damage={};for(const [name,m]of [['berkan',berkan],['cryvern',cryvern]]){
  let sum=0;for(let n=1;n<=32;n++){const b=createPveBattleV2({cards:tierCards(power),mercenary:m,monster:{id:1,name:'검수 보스',battle_power:power*30},seed:n*7919});
   sum+=b.result.timeline.filter(e=>e.actorId?.includes(m.code)&&Array.isArray(e.impacts)).flatMap(e=>e.impacts).reduce((v,i)=>v+i.damage+i.absorbed,0);}
  damage[name]=sum/32;
 }return {power,...damage,ratio:damage.berkan/Math.max(1,damage.cryvern)};});
 return {date:'2026-09-27',scope:'LOCAL_CANONICAL_ENGINE_NOT_PRODUCTION_WIN_RATE',fixtureRevision:fixture.cmsRevision,
  policy:{balance:BERKAN_BALANCE,capScale:BERKAN_CAP_SCALE},groups,results,pve,total:results.reduce((n,r)=>n+r.total,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=measure(process.argv.includes('--quick')?{count:32,powers:[2e7]}:{});
 if(process.argv.includes('--write'))await fs.writeFile('preview/mercenary-berkan-sss-v1/balance-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({policy:report.policy,groups:report.groups,total:report.total,pve:report.pve},null,2));
}

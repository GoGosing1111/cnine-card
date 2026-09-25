import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries,tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {SNIPER_ORIKKUNG_BALANCE,SNIPER_ORIKKUNG_CAP_SCALE} from '../shared/mercenary-sniper-orikkung-v1.mjs';
export function candidate(code){
 const meta=seed.catalog.cards.find(c=>c.code===code),row=seed.document.mercenaries.find(c=>c.code===code);
 return {...meta,...row,code,level:1,statMode:'RANK_FIXED',basePower:120000,combat:fixture.combat,skills:seed.document.assignments.find(a=>a.code===code).skillIds.map(id=>seed.document.skills.find(s=>s.id===id))};
}
export const orikkung=candidate('V-050');
export const opponents=operatingMercenaries.filter(c=>mercenaryAttackStyle(c)==='RANGED'&&c.skills.length);
export function measure({count=32,powers=[1e6,2e7,2e9],decks=tierDecks}={}){
 const results=[];
 for(const rival of opponents){
  const cells=[];
  for(const power of powers)for(const [deck,types]of Object.entries(decks)){
   let wins=0,losses=0,draws=0;
   for(const side of ['A','B'])for(let n=1;n<=count;n++){
    const cards=tierCards(power,types),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?orikkung:rival,defenderMercenary:side==='B'?orikkung:rival,seed:n*7919,singleHealerBonus:fixture.singleHealerBonus});
    const winner=battle.result.winner;if(winner===side)wins++;else if(['A','B'].includes(winner))losses++;else draws++;
   }
   cells.push({power,deck,wins,losses,draws,total:count*2,rate:wins/(count*2)});
  }
  const wins=cells.reduce((n,c)=>n+c.wins,0),total=cells.reduce((n,c)=>n+c.total,0);
  results.push({code:rival.code,name:rival.name,rank:rival.rank,wins,total,rate:wins/total,cells});
 }
 const pve=powers.map(power=>{
  const rows=[orikkung,...opponents].map(m=>{
   let damage=0,skillDamage=0;
   for(let n=1;n<=count;n++){
    const b=createPveBattleV2({cards:tierCards(power),mercenary:m,monster:{id:1,name:'검수 보스',battle_power:power*30},seed:n*7919});
    const events=b.result.timeline.filter(e=>e.actorId?.includes(m.code));
    damage+=events.reduce((v,e)=>v+(e.impacts?.reduce((v,i)=>v+(i.damage||0)+(i.absorbed||0),0)??((e.damage||0)+(e.absorbed||0))),0);
    skillDamage+=events.filter(e=>e.type==='MERCENARY_HIT').reduce((v,e)=>v+(e.damage||0)+(e.absorbed||0),0);
   }
   return {code:m.code,name:m.name,damage:damage/count,skillDamage:skillDamage/count};
  }).sort((a,b)=>b.damage-a.damage);
  return {power,rows};
 });
 return {date:'2026-09-26',cmsRevision:fixture.cmsRevision,scope:'LOCAL_CANONICAL_PVE_PVP_ENGINE',policy:{balance:SNIPER_ORIKKUNG_BALANCE,capScale:SNIPER_ORIKKUNG_CAP_SCALE},count,results,pve,total:results.reduce((n,r)=>n+r.total,0),topRanged:results.every(r=>r.rate>.5)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=measure(process.argv.includes('--quick')?{count:16,powers:[2e7],decks:{balanced:tierDecks.balanced}}:{});
 if(process.argv.includes('--write'))await fs.writeFile(new URL('../preview/mercenary-sniper-orikkung-v1/balance-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,results:report.results.map(({cells,...r})=>r),pve:report.pve.map(p=>({power:p.power,top:p.rows.slice(0,3)}))},null,2));
}

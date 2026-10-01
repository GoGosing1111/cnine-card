import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_DIFFICULTIES} from '../shared/cooperative-battleground-v1.mjs';
import {fixture,coopSquads,COOP_MERCENARIES,COOP_COMPOSITIONS} from '../tests/helpers/cooperative-fixture.mjs';
export function measureCoop({seeds=64,equipment=[2000000,10000000,20000000],levels=[10,13],roster=true,catalog=true}={}){
 const rows=[];
 const run=(squads,meta,difficulty)=>{
  const times=[],survivors=[],remaining=[];let wins=0;
  for(let n=1;n<=seeds;n++){
   const {payload}=createCooperativeBattle({squads,difficulty,seed:n*7919});const result=payload.battleV2.result;
   const win=result.winner==='A';wins+=Number(win);if(win)times.push(result.timeline.at(-1).combatAtMs/1000);
   survivors.push([...result.final.A,...result.final.mercenaries.A].filter(c=>c.hp>0).length);remaining.push(result.final.B[0].hp/result.final.B[0].maxHp*100);
  }
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  rows.push({...meta,difficulty:difficulty.id||difficulty,seeds,wins,winRate:wins/seeds,meanClearSeconds:mean(times),meanSurvivors:mean(survivors),meanBossHpPercent:mean(remaining)});
 };
 for(const power of equipment)for(const level of levels)for(const [rank,codes] of Object.entries(COOP_MERCENARIES))for(const composition of Object.keys(COOP_COMPOSITIONS))for(const difficulty of COOP_DIFFICULTIES){
  run(coopSquads({mercenaries:codes,composition,equipment:power,level}),{kind:'party',rank,composition,equipmentPerPlayer:power,level},difficulty);
 }
 if(roster)for(const merc of fixture.mercenaries)for(const difficulty of COOP_DIFFICULTIES){
  const power={NORMAL:2000000,HARD:10000000,EXTREME:20000000}[difficulty.id];
  run(coopSquads({mercenaries:[merc.code,'V-048','V-051'],equipment:power}),{kind:'roster',code:merc.code,name:merc.name,rank:merc.rank,equipmentPerPlayer:power,level:13,composition:'BALANCED'},difficulty);
 }
 if(catalog)for(const card of fixture.cardsByLevel[13])for(const difficulty of COOP_DIFFICULTIES){
  const power={NORMAL:2000000,HARD:10000000,EXTREME:20000000}[difficulty.id],squads=coopSquads({mercenaries:COOP_MERCENARIES[difficulty.id==='NORMAL'?'SS':difficulty.id==='HARD'?'MIXED':'TWO_SSS'],equipment:power});
  squads[0].cards[card.grade==='SUPERSTAR'?0:1]=structuredClone(card);
  run(squads,{kind:'card',cardId:card.id,title:card.title,grade:card.grade,dominantType:card.uniqueAbility?.dominantType,equipmentPerPlayer:power,level:13},difficulty);
 }
 return {checkedAt:fixture.checkedAt,cmsRevision:fixture.cmsRevision,source:fixture.source,scope:'CANONICAL_SERVER_SIMULATION_NOT_PLAYER_WIN_RATE',assumptions:fixture.assumptions,difficulties:COOP_DIFFICULTIES,cardCount:fixture.cardsByLevel[13].length,mercenaryCount:fixture.mercenaries.length,battles:rows.length*seeds,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const quick=process.argv.includes('--quick'),report=measureCoop(quick?{seeds:8,roster:false,catalog:false,equipment:[2000000,20000000],levels:[13]}:{});
 if(process.argv.includes('--write'))await fs.writeFile(new URL('../docs/cooperative-battleground-balance-20261001.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.table(report.rows.filter(r=>r.kind==='party'&&r.level===13&&r.composition==='BALANCED'&&r.equipmentPerPlayer==={NORMAL:2000000,HARD:10000000,EXTREME:20000000}[r.difficulty]).map(({rank,difficulty,equipmentPerPlayer,wins,seeds,meanClearSeconds,meanBossHpPercent})=>({rank,difficulty,equipment:equipmentPerPlayer,win:wins+'/'+seeds,seconds:meanClearSeconds?.toFixed(1),bossHp:meanBossHpPercent.toFixed(1)})));
 console.log('Canonical battles:',report.battles);
}

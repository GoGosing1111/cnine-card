import fs from 'node:fs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
const combat=JSON.parse(fs.readFileSync('tests/fixtures/mercenary-valter-roster-20261008.json')).combat;
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat});
const cards=tierCards(2e7),report={scope:'Equal five-card teams, level 1, no equipment; seeded server simulation, not player win rates',pvp:[],pve:[]};
for(let code=950;code<=955;code++){
 for(let other=960;other<=965;other++){
  const row={code:'V-'+code,opponent:'V-'+other,wins:0,losses:0,draws:0};
  for(let seed=1;seed<=64;seed++)for(const side of ['A','B']){
   const a=side==='A'?row.code:row.opponent,b=side==='A'?row.opponent:row.code;
   const r=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(a),defenderMercenary:snapshot(b),seed:20261027+seed*97}).result;
   if(r.winner===side)row.wins++;else if(['A','B'].includes(r.winner))row.losses++;else row.draws++;
  }
  report.pvp.push({...row,winPercent:row.wins/128*100});
 }
 console.log('Compared V-'+code);
}
for(let code=950;code<=965;code++){
 if(code>955&&code<960)continue;
 const damages=[];
 for(let seed=1;seed<=32;seed++){
  const r=createPveBattleV2({cards,monster:{id:1,battle_power:1.6e10},mercenary:snapshot('V-'+code),seed:20261027+seed*97}).result;
  const id=r.final.mercenaries.A[0].id;damages.push(r.timeline.filter(e=>e.actorId===id).reduce((n,e)=>n+(Number(e.damage)||0)+(Number(e.absorbed)||0),0));
 }
 report.pve.push({code:'V-'+code,averageMercenaryDamage:damages.reduce((n,d)=>n+d,0)/damages.length});
}
fs.mkdirSync('docs/qa/blackcrown-live-20261027',{recursive:true});
fs.writeFileSync('docs/qa/blackcrown-live-20261027/balance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.pvp));

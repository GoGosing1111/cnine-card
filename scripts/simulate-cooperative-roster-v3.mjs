import fs from 'node:fs/promises';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {currentSquads,currentCard,currentMerc,fixture} from '../tests/helpers/cooperative-current.mjs';
import audited from '../tests/fixtures/cooperative-audited-20261012.json' with {type:'json'};
import {rebalanceCoopCombat} from '../shared/cooperative-balance-20261012.mjs';
import {rollCoopRoster} from '../shared/cooperative-roster-v3.mjs';
const combat=rebalanceCoopCombat(audited.samples[0].combat),rows=[];
const profiles=[
 {name:'SS + FUR15/ZENITH13',difficulty:'NORMAL',ordinary:true},
 {name:'SS limited + balanced ICON',difficulty:'HARD',codes:['V-990','V-991','V-997'],deck:'BALANCED',gear:1200000},
 {name:'SS limited + offense ICON',difficulty:'HARD',codes:['V-990','V-991','V-997'],deck:'OFFENSE',gear:1200000},
 {name:'Helios/Helios/Valter balanced',difficulty:'EXTREME',codes:['V-999','V-999','V-996'],deck:'BALANCED'},
 {name:'Helios/Helios/Valter offense',difficulty:'EXTREME',codes:['V-999','V-999','V-996'],deck:'OFFENSE'},
 {name:'Helios/Helios/Valter cleanse',difficulty:'EXTREME',codes:['V-999','V-999','V-996'],deck:'CLEANSE'},
 {name:'Valter trio balanced',difficulty:'EXTREME',codes:['V-996','V-996','V-996'],deck:'BALANCED'},
 {name:'Valter trio offense',difficulty:'EXTREME',codes:['V-996','V-996','V-996'],deck:'OFFENSE'},
 {name:'Jinmu/Helios/Valter balanced',difficulty:'EXTREME',codes:['V-989','V-999','V-996'],deck:'BALANCED'},
 {name:'Jinmu/Helios/nurse balanced',difficulty:'EXTREME',codes:['V-989','V-999','V-051'],deck:'BALANCED'}
];
const ordinary=()=>['V-004','V-048','V-051'].map((code,i)=>({ownerId:i+1,ownerName:'분대 '+(i+1),cards:[currentCard(['아이젠 족스케','치타구','철구'][i],15,'FUR'),currentCard(['봉순','하이희야','박세라'][i],13,'ZENITH')],mercenary:currentMerc(code),equipmentBonus:1200000,singleHealerBonus:fixture.singleHealerBonus}));
for(const profile of profiles){const perBoss={},times=[];let wins=0;
 for(let seed=1;seed<=120;seed++){
  const encounter=rollCoopRoster(seed),squads=profile.ordinary?ordinary():currentSquads(profile);
  const r=createCooperativeBattle({squads,difficulty:profile.difficulty,seed,combat,encounter}).payload.battleV2.result;
  const won=r.winner==='A';wins+=won;times.push(r.timeline.at(-1).combatAtMs/1000);
  const bucket=perBoss[encounter.boss]||={battles:0,wins:0};bucket.battles++;bucket.wins+=won;
 }
 rows.push({profile:profile.name,difficulty:profile.difficulty,battles:120,wins,winPercent:+(wins/1.2).toFixed(1),meanSeconds:+(times.reduce((n,t)=>n+t,0)/120).toFixed(1),minSeconds:Math.min(...times),maxSeconds:Math.max(...times),perBoss});
}
const replay=audited.samples.map(s=>{
 const simulate=encounter=>{const r=createCooperativeBattle({...s,combat:encounter?combat:s.combat,effects:encounter?[]:s.effects,encounter}).payload.battleV2.result;return {winner:r.winner,seconds:r.timeline.at(-1).combatAtMs/1000};};
 return {sample:s.label,recordedSeconds:s.oldDurationMs/1000,old:simulate(null),updated:simulate(rollCoopRoster(s.seed))};
});
const report={version:'20261012-random-v3',cmsRevision:fixture.cmsRevision,assumptions:fixture.assumptions,simulations:120*profiles.length+replay.length*2,
 note:'Deterministic server simulations; not observed live win rates. ICON +13, mercenary level 1, no unique advancement; gear 2.3M per squad except NORMAL/HARD 1.2M. Fixed budget, no party scaling or character requirement. One SSS limited replaced by a nurse is also measured; not every composition can clear EXTREME.',rows,replay,combat};
const out=process.argv[2];if(out)await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({simulations:report.simulations,rows:rows.map(({perBoss,...row})=>row),replay},null,2));

import fs from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import * as currentBattle from '../../../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../../../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink} from '../../../shared/mercenary-combat-link-v2103.mjs';
import {snapshot,scenarios} from '../../../scripts/measure-razak-balance-20261026.mjs';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const baseline=arg('--baseline',null),api=baseline?await import(pathToFileURL(baseline).href):{...currentBattle,buildMercenaryFighter,applyMercenaryCombatLink};
const start=Number(arg('--start',311001)),count=Number(arg('--count',8)),duels=args.includes('--duels'),stress=args.includes('--stress'),out=arg('--out',null);
const cases=scenarios.map(s=>({...s,enemyLevel:s.level,enemyGear:s.gear}));
if(stress)for(const s of scenarios.filter(s=>['basic-20000000-balanced','equipped-1'].includes(s.id)))for(const gap of [1,10,100])cases.push({...s,id:s.id+'-level1-vs21-deck'+gap,level:1,gear:0,enemyLevel:21,enemyGear:1e8,enemyCards:s.cards.map(c=>({...c,power:c.power*gap}))});
const result={mode:baseline?'BASELINE':'CURRENT',start,count,duels,stress,total:0,wins:0,losses:0,draws:0,rows:[],failures:[],conditions:'Canonical PVP team and optionally linked isolated mercenary duels; same five-card formation, growth/gear equal unless stress is explicit.'};
for(const code of ['V-975','V-976'])for(const f of cases)for(const side of ['A','B']){
 const row={code,scenario:f.id,side,total:0,wins:0,losses:0,draws:0};
 const record=(winner,seed,kind)=>{for(const o of [result,row]){o.total++;if(winner===side)o.wins++;else if(['A','B'].includes(winner))o.losses++;else o.draws++;}if(winner!==side&&result.failures.length<24)result.failures.push({code,scenario:f.id,side,seed,kind,winner});};
 for(let i=start;i<start+count;i++){
  const seed=createHash('sha256').update(`prime-zero-jok:${code}:${f.id}:${i}`).digest().readUInt32BE(0);
  const a=snapshot(code,f.level,'PVP',f.gear),b=snapshot('V-974',f.enemyLevel,'PVP',f.enemyGear);
  const ownCards=f.cards,enemyCards=f.enemyCards||f.cards;
  const battle=api.createPvpBattleV2({attackerCards:side==='A'?ownCards:enemyCards,defenderCards:side==='B'?ownCards:enemyCards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='B'?a:b,seed});record(battle.result.winner,seed,'TEAM');
  if(duels){const teams=[side==='A'?a:b,side==='B'?a:b].map((m,index)=>{const s=index?'B':'A';return [...(m.code==='V-974'?enemyCards:ownCards).map((c,j)=>api.buildFighter(c,j,s,null,'PVP')),api.buildMercenaryFighter(m,s,'PVP',api.buildFighter)];});api.applyMercenaryCombatLink(teams);const duel=api.simulateBattleV2Preview({teamA:[teams[0].at(-1)],teamB:[teams[1].at(-1)],seed,maxActions:300,suddenDeathAfter:240});record(duel.winner,seed,'DUEL');}
 }
 result.rows.push(row);
}
if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode:result.mode,total:result.total,wins:result.wins,losses:result.losses,draws:result.draws,failures:result.failures}));

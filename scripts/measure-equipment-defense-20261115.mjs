import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {legionBalanceSnapshot,profiles} from './measure-legion-regions-20261008.mjs';
import {equipmentGrowthFromRows} from '../functions/_equipment_growth.js';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {buildPvePlayerTeam,createPvpBattleV2} from '../functions/_battle_v2_preview.js';

const asc=n=>ASCENDANT_EQUIPMENT.filter(i=>i.tier===n),uq=n=>UNIQUE_MERCENARY_EQUIPMENT.filter(i=>i.tier===n);
export const cases=[['bare',[]],['tier5',asc(5)],['tier6',asc(6)],['tier9',asc(9)],['tier10',asc(10)],['unique1',uq(1)],['unique2',uq(2)],['unique3',uq(3)],['mixed',asc(9).slice(0,2).concat(asc(10).slice(2,4),asc(5).slice(4))],['unique1-four',uq(1).slice(0,4)]];
export const ardenRows=['TOP','BOTTOM','SHOES','ACCESSORY'].map((slot,i)=>({id:i+1,slot,code:'ARDEN_'+(slot==='ACCESSORY'?'DUAL_DISK':slot),level:0}));
export function snapshotFor(items=[],arden=false){
 const snapshot=legionBalanceSnapshot(profiles[1]);
 if(arden)snapshot.characterBonus.pveEquipmentRuntime=equipmentGrowthFromRows(ardenRows,7);
 if(items.length){const rows=items.map((i,n)=>({...i,id:n+11,instanceId:String(n+11),level:0}));
  snapshot.mercenary.equipment={schemaVersion:1,mode:'PVE',items:rows,power:items.reduce((sum,i)=>sum+i.pvePower,0),...equipmentGrowthFromRows(rows,7)};
 }
 return snapshot;
}
export function defenseMeasure({count=3}={}){
 const rows=[],stats=[],start=performance.now();
 for(const arden of [false,true])for(const [name,items] of cases){
  const snapshot=snapshotFor(items,arden),team=buildPvePlayerTeam({cards:snapshot.cards,characterBonus:snapshot.cardSupportBonus,mercenary:snapshot.mercenary,pveEquipmentRuntime:snapshot.characterBonus.pveEquipmentRuntime});
  stats.push({name,arden,card:{defense:team.teamA[0].defense,effects:team.teamA[0].equipmentEffects},mercenary:{defense:team.mercenaryFighter.defense,effects:team.mercenaryFighter.equipmentEffects}});
  for(const regionId of ['coast','desert','sky'])for(let i=0;i<count;i++){
   const begin=performance.now(),session=createHuntSession({snapshot,regionId,difficulty:'calamity',seed:(i+1)*7919}),b=session.payload.battleV2.result,events=b.timeline,final=b.final.A.filter(a=>!a.isBattleSuit),outcome=session.exportState().outcome;
   const deaths=events.filter(e=>e.type==='KO'&&final.some(a=>a.id===e.targetId));
   rows.push({name,arden,regionId,seed:(i+1)*7919,winner:outcome.winner,combatMs:outcome.combatMs,kills:events.filter(e=>e.huntKill).length,survivors:final.filter(a=>a.hp>0).length,remainingHp:final.reduce((n,a)=>n+a.hp,0),meanSurvivalMs:final.reduce((n,a)=>n+(deaths.find(e=>e.targetId===a.id)?.combatAtMs??outcome.combatMs),0)/final.length,simulateMs:performance.now()-begin});
  }
 }
 // Fixed competitive inputs: changing PvE defense must not alter the replay.
 const s=snapshotFor();const pvp=createPvpBattleV2({attackerCards:s.cards,defenderCards:s.cards,attackerMercenary:s.mercenary,defenderMercenary:s.mercenary,seed:7919});
 return {at:new Date().toISOString(),method:'Canonical server hunt engine, equal cards/support/mercenary and +0 equipment; fixed seeds. Synthetic comparison, not live account win rates.',count:rows.length,elapsedMs:performance.now()-start,stats,rows,pvp};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=defenseMeasure();const out=process.argv[2];fs.mkdirSync(new URL('../docs/qa/equipment-defense-sets-20261115/',import.meta.url),{recursive:true});fs.writeFileSync(out,JSON.stringify(report));console.log(JSON.stringify({out,count:report.count,elapsedMs:report.elapsedMs}));}

import {createPvpBattleV2, createPveBattleV2} from './engine.mjs';
export const TYPES=['ATTACK','DEFENSE','SPEED','HP'];
export const P=120000, EQUIP=500000;
export function deck(type,{n=5,power=P,unique=null}={}){
  return Array.from({length:n},(_,i)=>({id:`${type}-${i}`,title:`${type}${i}`,power_type:type,power,uniqueAbility:unique}));
}
export function pvp(a,b,seed){
  const r=createPvpBattleV2({attackerCards:a,defenderCards:b,attackerEquipmentBonus:EQUIP,defenderEquipmentBonus:EQUIP,seed});
  return {win:r.result.winner==='A',actions:r.result.actions??r.result.totalActions??(r.timeline?.filter(e=>e.type==='TURN').length||0)};
}
export function matrix(mkDeck,seeds=120){
  const out={};
  for(const A of TYPES){out[A]={};
    for(const B of TYPES){
      let w=0,act=0;
      for(let s=0;s<seeds;s++){const r=pvp(mkDeck(A),mkDeck(B),1000+s*7919);if(r.win)w++;act+=r.actions;}
      out[A][B]={wr:w/seeds*100,actions:act/seeds};
    }}
  return out;
}
export function printMatrix(m,label){
  console.log(`\n${label}`);
  console.log('공격측\\수비측  '+TYPES.map(t=>t.padStart(8)).join('')+'    평균');
  for(const A of TYPES){
    const row=TYPES.map(B=>m[A][B].wr.toFixed(1).padStart(8));
    const avg=TYPES.reduce((s,B)=>s+m[A][B].wr,0)/4;
    console.log(A.padEnd(13)+row.join('')+'  '+avg.toFixed(1).padStart(7));
  }
}

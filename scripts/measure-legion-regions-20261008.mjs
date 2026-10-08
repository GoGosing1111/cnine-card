import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {comparisonArgs,reference} from './measure-apocalypse-grade-balance-20261008.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {LEGION_REGIONS,REGION_DIFFICULTIES,regionEquipmentEffects} from '../shared/legion-regions-v1.mjs';
export const profiles=[
  {id:'H',power:7000000,code:'BATTLE_SUIT_H',equipment:1000000,icons:[]},
  {id:'S',power:12500000,code:'BATTLE_SUIT_S',equipment:3000000,icons:[]},
  {id:'Z',power:25000000,code:'BATTLE_SUIT_Z_BODY',equipment:3000000,icons:[0]},
  {id:'X',power:50000000,code:'BATTLE_SUIT_X_BODY',equipment:3000000,icons:[0]},
  {id:'OVERLORD',power:75000000,code:'BATTLE_SUIT_OVERLORD',equipment:3000000,icons:[0,2]},
  {id:'SX80M',power:80000000,code:'BATTLE_SUIT_SX',equipment:3000000,icons:[0,2]}
];
export function legionBalanceSnapshot(profile=profiles[1],{formation='HP2',gear=false}={}){
  const args=comparisonArgs({icons:profile.icons,formation,equipment:profile.equipment,mercenary:'V-051'});
  const suit={code:profile.code,pvePower:profile.power,skillChips:[],accountNickname:'통제 편성'};
  return {cards:args.cards,cardSupportBonus:profile.equipment,battleSuit:suit,mercenary:args.mercenary,magicCards:[],singleHealerBonus:args.singleHealerBonus,accountNickname:'통제 편성',characterBonus:{pve:profile.equipment+profile.power,battleSuitPve:profile.power,equippedBattleSuit:suit,...(gear?{pveEquipmentRuntime:regionEquipmentEffects(['HUNT_DESERT_WEAPON','HUNT_DESERT_TOP','HUNT_DESERT_BOTTOM','HUNT_DESERT_SHOES','HUNT_SKY_UNIQUE'])}:{})}};
}
export function measureLegion({count=8,regions=LEGION_REGIONS,groups=profiles,difficulties=REGION_DIFFICULTIES,formation='HP2',gear=false,onProgress=()=>{}}={}){
  const rows=[];
  for(const profile of groups)for(const d of difficulties)for(const region of regions){
    let wins=0,kills=0,elites=0,bossReached=0,bossHp=0,patterns=0,combatMs=0;
    for(let i=0;i<count;i++){
      const s=createHuntSession({snapshot:legionBalanceSnapshot(profile,{formation,gear}),regionId:region.id,difficulty:d.id,seed:(i+1)*7919}),t=s.payload.battleV2.result.timeline,state=s.exportState();
      wins+=Number(state.outcome.winner==='A');kills+=t.filter(e=>e.huntKill&&!e.boss).length;elites+=t.filter(e=>e.huntKill&&e.elite).length;bossReached+=Number(t.some(e=>e.finalBoss));patterns+=t.filter(e=>e.type==='LEGION_PATTERN').length;combatMs+=state.outcome.combatMs;
      const boss=s.payload.battleV2.result.final.B.find(b=>b.isBoss);bossHp+=boss?boss.hp/boss.maxHp:1;
    }
    const row={profile:profile.id,region:region.id,difficulty:d.id,total:count,wins,winPercent:wins/count*100,bossReached,kills:kills/count,elites:elites/count,bossHp:bossHp/count,patterns:patterns/count,combatMs:combatMs/count};
    rows.push(row);onProgress(row);
  }
  return {measuredAt:new Date().toISOString(),referenceCapturedAt:reference.capturedAt,method:'Current canonical engine; controlled card/mercenary combinations from current operating settings; not account win rates. Suit HP/defense correction = 0. No magic or magnet. Independent fixed seeds.',formation,gear,count,total:rows.length*count,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const get=(flag,fallback)=>{const i=process.argv.indexOf(flag);return i<0?fallback:process.argv[i+1];};
  const report=measureLegion({count:Number(get('--count',8)),regions:LEGION_REGIONS.filter(r=>get('--regions','coast,desert,theatre,viscera,sky').split(',').includes(r.id)),groups:profiles.filter(p=>get('--profiles',profiles.map(p=>p.id).join(',')).split(',').includes(p.id)),gear:process.argv.includes('--gear'),onProgress:r=>console.log(JSON.stringify(r))});
  fs.writeFileSync(get('--out','docs/legion-regions-balance-20261008.json'),JSON.stringify(report,null,2)+'\n');
}

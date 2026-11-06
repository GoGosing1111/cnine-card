import fixture from '../fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import growth from '../../docs/qa/razak-balance-20261026/live-input.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../../shared/mercenary-limited-deployment-v1.mjs';
import {HELIOS_KING_CODE,heliosKingPreviewSnapshot} from '../../shared/mercenary-helios-king-v1.mjs';
import {buildFighter} from '../../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../../functions/_mercenary_combat.js';
export const cards=(power=2e7)=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:'QA-'+i,power,power_type}));
export function snapshot(code,level=1,mode='PVE',gear=0){
 const base=code===HELIOS_KING_CODE?heliosKingPreviewSnapshot():limitedDeploymentSnapshot(code);
 if(!base)throw Error('Unknown code '+code);
 return {...base,combat:fixture.combat,equipment:{schemaVersion:1,mode,power:gear},
  mercenaryLevel:{version:2,level,policyRevision:growth.policyRevision,
   breakthroughMask:[5,10,15,20].reduce((m,t,i)=>m|(t<level?1<<i:0),0),growth:growth.growth}};
}
export const fighter=(code,side='A',mode='PVE',level=1,gear=0)=>buildMercenaryFighter(snapshot(code,level,mode,gear),side,mode,buildFighter);
export const team=(code,side,mode='PVE',level=1,gear=0,power=2e7)=>[...cards(power).map((c,i)=>buildFighter(c,i,side,null,mode)),fighter(code,side,mode,level,gear)];
export const scenarios=[
 {name:'weak-deck-lv1',power:10000,level:1,gear:0},
 {name:'standard-lv1',power:2e7,level:1,gear:0},
 {name:'grown-lv11',power:2e7,level:11,gear:1e6},
 {name:'high-power-lv21',power:2e9,level:21,gear:1e8}
];

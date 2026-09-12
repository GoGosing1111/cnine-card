// Editable balance proposal, never an operating approval or an assignment.
export const MERCENARY_COMBAT_DRAFT=Object.freeze({energyMax:100,energyPerBasic:10,windupTurns:1,statusTurns:2,armorReductionPercent:20,interceptPercent:40,parryPercent:40,orderPercent:15,veilPercent:25,finisherHpPercent:30,finisherBonusPercent:50,focusBonusPercent:40,poisonPercent:40,restraintHits:2,restraintPercent:25,suppressGauge:20,reloadGauge:20,powerGrowthPercentPerLevel:1});
export function validateMercenaryCombat(raw){
 const out={};for(const [key,defaultValue]of Object.entries(MERCENARY_COMBAT_DRAFT)){const value=raw?.[key]??defaultValue,max=key==='energyMax'?1000000:key==='energyPerBasic'?10000:key.endsWith('Turns')?10:key==='restraintHits'?10:key==='powerGrowthPercentPerLevel'?100:100;
 if(!Number.isFinite(value)||value<0||value>max||key!=='powerGrowthPercentPerLevel'&&!Number.isInteger(value)||['energyMax','windupTurns','statusTurns','restraintHits'].includes(key)&&value<1)throw Object.assign(Error(`${key} 스킬 정책 범위를 확인하세요.`),{code:'MERCENARY_COMBAT_POLICY'});out[key]=value;}return out;
}

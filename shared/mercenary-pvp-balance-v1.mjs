import {MERCENARY_POWER_STANDARD} from './equipment-mercenary-power-v1.mjs';
import {PVP_POWER_BALANCE,pvpPowerEnabled} from './pvp-power-balance-v1.mjs';

// PVP only. PVE keeps its released policy, including its damage/cadence rules.
export const MERCENARY_PVP_BALANCE=Object.freeze({
 version:'pvp-deck-growth-20261015-v1',regularActionsPerTurn:3,
 naturalSpeedFloor:.6,tierGuardPerStep:.15,tierOffensePerStep:.1,
});
const upperScale=Object.freeze({'V-996':1,'V-999':1.04,'V-989':1.248,'V-988':1.248,'V-987':1.248});
const ssScales=Object.freeze({'V-990':2.04125,'V-991':1.6575,'V-992':1.355625,'V-993':1.81875,'V-994':1.6575,'V-997':1.70875,'V-998':1.6275});
export function mercenaryPvpProfile(code){
 if(Object.hasOwn(upperScale,code)){
  const scale=upperScale[code];
  return {basePower:180000,statScale:scale,scale,speedScale:code==='V-996'?1.5:1.56,actionCredit:code==='V-996'?1.5:1.56,
   link:{attackPercent:440*scale,hpPercent:560*scale,shieldPercent:360*scale-60},
   basicCapScale:1.2*scale,damageTakenScale:.8};
 }
 if(Object.hasOwn(ssScales,code)){
  const scale=ssScales[code];
  return {basePower:180000,statScale:scale,scale,speedScale:1.6,actionCredit:1.6,
   link:{attackPercent:220*scale,hpPercent:280*scale,shieldPercent:150*scale},basicCapScale:1};
 }
 return null;
}
export const mercenaryPvpBasePower=actor=>mercenaryPvpProfile(actor?.code)?.basePower??MERCENARY_POWER_STANDARD.basePowerByRank[actor?.rank];
export const mercenaryPvpEnabled=(mode,options={})=>mode==='PVP'&&pvpPowerEnabled(options);
// Carry the selected mode even without personal equipment. Display, matching
// totals and the fighter builder must use the same fixed PVP base exactly once.
export function mercenaryModeSnapshot(snapshot,mode,options={}){
 if(!snapshot||!mercenaryPvpEnabled(mode,options))return snapshot;
 return {...snapshot,battleMode:mode,basePower:mercenaryPvpBasePower(snapshot)??snapshot.basePower};
}
export function mercenaryModePresentation(card,mode,options={}){
 if(!card||!mercenaryPvpEnabled(mode,options)||card.artOnly&&!mercenaryPvpProfile(card.code))return card;
 const profile=mercenaryPvpProfile(card.code);
 const detail=profile?`평균 카드 공격력 ${Number(profile.link.attackPercent.toFixed(2))}%·체력 ${Number(profile.link.hpPercent.toFixed(2))}% 연계. 아군 카드 3행동당 ${profile.actionCredit}행동 상당의 예약 기회 누적.`:'등급별 기본 전투력과 아군 카드 전력 연계를 사용합니다. 아군 카드 3행동을 기준으로 용병의 예약 행동 기회를 누적합니다.';
 return {...card,basePower:card.basePower===null?null:mercenaryPvpBasePower(card),combatLinkDescription:`PVP 개편 기준 · ${detail} ${profile?.damageTakenScale?'받는 피해 20% 경감. 특정 용병 피해 무효와 전체 상태이상 면역은 적용하지 않습니다. ':''}덱 전투력 우위에 따라 피해 최대 35%·행동 게이지 충전 속도 최대 18% 추가. PVE는 기존 성능을 유지합니다.`};
}
export const isMercenaryPvpReform=actor=>actor?.isMercenary===true&&actor.battleMode==='PVP'&&actor.pvpBalanceVersion===PVP_POWER_BALANCE.version;
export function mercenaryPvpCredit(actors){
 const mercenary=actors.find(a=>isMercenaryPvpReform(a)&&a.statMode==='RANK_FIXED'&&a.alive!==false&&a.hp>0);
 if(!mercenary)return null;
 return mercenaryPvpProfile(mercenary.code)?.actionCredit??(['V-055','V-056'].includes(mercenary.code)?1.25:1);
}
export function mercenaryPvpIncomingDamage(target,incoming){
 if(!isMercenaryPvpReform(target))return null;
 const profile=mercenaryPvpProfile(target.code||target.cardId);
 if(!profile?.damageTakenScale)return null;
 return Math.floor(Math.max(0,Number(incoming)||0)*profile.damageTakenScale);
}

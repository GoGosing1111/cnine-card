import {mercenaryCombatRank} from './mercenary-ss-limited-v1.mjs';
import {KAMISHIRO_CODE} from './mercenary-kamishiro-v1.mjs';
import {CARDGU_CODE} from './mercenary-cardgu-v1.mjs';
import {REVAN_CODE} from './mercenary-revan-v1.mjs';
import {AWAKENED_OMEGA_CODE} from './mercenary-awakened-omega-v1.mjs';
import {EUNSEOL_CODE} from './mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE} from './mercenary-general-jok-v1.mjs';
import {PRIME_CODE} from './mercenary-prime-requiem-v1.mjs';
import {ZERO_CODE} from './mercenary-zero-v1.mjs';
import {LEONEL_CODE} from './mercenary-leonel-v1.mjs';
import {JOKRO_CODE} from './mercenary-jokro-v1.mjs';
import {SHIRANUI_CODE} from './mercenary-shiranui-v1.mjs';
import {KAIRON_CODE} from './mercenary-kairon-v1.mjs';
import {JINMU_CODE} from './mercenary-jinmu-v1.mjs';
import {VALTER_CODE} from './mercenary-valter-v1.mjs';
import {HELIOS_CODE} from './mercenary-helios-v1.mjs';

export const MERCENARY_RANK_GROWTH=Object.freeze({version:1,guardPerStep:5,growthExponent:.5,lowerMasteryPerStep:.25});
// Exact catalog identities, never the editable edition/name of an ordinary card.
export const SSS_LIMITED_COMBAT_CODES=Object.freeze([KAMISHIRO_CODE,CARDGU_CODE,REVAN_CODE,AWAKENED_OMEGA_CODE,EUNSEOL_CODE,GENERAL_JOK_CODE,PRIME_CODE,ZERO_CODE,LEONEL_CODE,JOKRO_CODE,SHIRANUI_CODE,KAIRON_CODE,JINMU_CODE,VALTER_CODE,HELIOS_CODE]);
const limited=new Set(SSS_LIMITED_COMBAT_CODES),ranks=['C','B','A','S','SS','SSS'];
export const mercenaryBattleTier=actor=>!actor?.isMercenary?-1:limited.has(actor.code||actor.cardId)?ranks.length:ranks.indexOf(mercenaryCombatRank(actor));
const eligible=a=>a?.isMercenary===true&&a.statMode==='RANK_FIXED'&&a.battleMode==='PVP'&&mercenaryBattleTier(a)>=0;
const modern=a=>a?.mercenaryLevel?.version===2;
const alive=a=>a.alive!==false&&a.hp>0;
export function mercenaryRankGap(actor,teams){
 if(!eligible(actor)||actor.mercenaryLevel?.version===1)return 0;
 const opponents=teams.flat().filter(o=>o.side!==actor.side&&eligible(o)&&alive(o));
 if(!opponents.length||!modern(actor)&&!opponents.some(modern)||opponents.some(o=>o.mercenaryLevel?.version===1))return 0;
 // A lower companion cannot grant a bonus against an equal/higher opponent.
 return Math.max(0,mercenaryBattleTier(actor)-Math.max(...opponents.map(mercenaryBattleTier)));
}
export function mercenaryRankMasteryScale(source,target){
 if(!eligible(source)||!eligible(target)||!modern(source)||target.mercenaryLevel?.version===1)return 1;
 const gap=Math.max(0,mercenaryBattleTier(target)-mercenaryBattleTier(source));
 return Math.pow(MERCENARY_RANK_GROWTH.lowerMasteryPerStep,gap);
}
const growth=(actor,key)=>actor.mercenaryLevelApplied&&modern(actor)?1+Math.max(0,actor.mercenaryGrowth?.total?.[key]||0)/100:1;
export function applyMercenaryRankGrowth(teams){
 const all=teams.flat();
 // Read every learned multiplier before modifying any fighter. No recursive
 // stat matching, target changes, account checks or winner-dependent rules.
 const refs=new Map(all.filter(eligible).map(a=>[a,{attack:growth(a,'attackPercent'),hp:growth(a,'hpPercent')}]));
 for(const [actor,own]of refs){
  const link=actor.mercenaryLink,gap=mercenaryRankGap(actor,teams);
  if(!link||link.rankGrowth||!gap||!alive(actor))continue;
  const opponents=[...refs].filter(([o])=>o.side!==actor.side&&alive(o));
  const scale=key=>Math.pow(Math.max(1,...opponents.map(([,ref])=>ref[key]/own[key])),MERCENARY_RANK_GROWTH.growthExponent);
  const attackScale=scale('attack'),hpScale=scale('hp'),ratio=actor.hp/actor.maxHp;
  const attack=Math.ceil(actor.attack*attackScale),maxHp=Math.ceil(actor.maxHp*hpScale),attackFloor=Math.ceil(link.attackFloor*attackScale),hpFloor=Math.ceil(link.hpFloor*hpScale);
  if(![attack,maxHp,attackFloor,hpFloor].every(Number.isSafeInteger))throw Error('INVALID_MERCENARY_RANK_GROWTH');
  actor.attack=attack;actor.maxHp=maxHp;actor.hp=Math.round(maxHp*ratio);
  actor.mercenaryLink={...link,attackFloor,hpFloor,rankGrowth:{version:MERCENARY_RANK_GROWTH.version,gap,attackScale,hpScale,opponentIds:opponents.map(([o])=>o.id)}};
 }
}
export const MERCENARY_RANK_GROWTH_DESCRIPTION='PVP 성장 전투는 C·B·A·S·SS·SSS·SSS 리미티드 순으로 등급 우위를 적용합니다. SS 리미티드는 기존 일반 SSS 전투 등급을 유지합니다. 상대 전원의 등급보다 높으면 단계당 공격·피해 상한 +100%, 체력·방벽 +500%의 등급 우위를 적용하며, 기본 능력치가 연계 하한보다 높아도 공격·체력 보정이 유지됩니다. 하위 상대의 성장 공격·체력 배율이 더 높으면 그 비율의 제곱근만큼 공격·체력을 추가 보완합니다. 추가 체력은 받는 타격 상한을 높이지 않습니다. 상위 등급을 향한 경감 관통·행동 대응은 단계당 25% 효율이며, 레벨 능력치·평타 성장·추가 행동 숙련은 유지합니다. 같은 전투 등급·PVE에는 이 추가 보정이 없습니다.';

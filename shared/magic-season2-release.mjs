import {MAGIC_S2_RULES,MAGIC_S2_GROWTH} from './magic-season2-v1.mjs';
export const MAGIC_S2_PACK='MAGIC_CARD_SEASON2_PACK';
export const isMagicSeason2=row=>Object.hasOwn(MAGIC_S2_RULES,String(row?.effect_type||row?.effectType||row?.code||''));
export const MAGIC_S2_DESCRIPTIONS={
 S2_ECLIPSE_PROPHECY:'최강 적에게 표식. 일반 카드 직접 적중 6회 추가 피해, 처치 시 잔여 표식 이전.',
 S2_CAUSAL_SEVER:'장착자 3·6번째 직접 공격 회피 불가·방어 무시·보호막 관통. 아포칼립스 보호막 우회 제외.',
 S2_FATE_INTERCEPT:'아군 일반 카드의 치명 직접 피해를 1회 대리. 피보호자 HP 1, 경감한 초과 피해를 장착자가 받음.',
 S2_OVERHEAL_FORGE:'승인된 초과 회복을 보호막으로 전환. 대상 최대 HP 상한, 팀 3회.',
 S2_CONSTELLATION_SHIFT:'HP 35% 이하 전열과 건강한 후열 교대. 후퇴자 게이지 증가·직접 피격 2회 경감.',
 S2_SHIELD_LEDGER:'장착자의 직접 공격이 흡수된 보호막 피해를 기록. 파괴 시 폭발·직접 피격 2회 방어 약화.',
 S2_FALLEN_STAR:'일반 아군 최종 사망 후 생존 일반 아군 공격력·게이지 강화. 팀 1회.',
 S2_ARCANE_MIRROR:'PVP 전용. 허용된 시즌1의 실제 성공 효과를 1회 복제. 재복제·부활·봉인·시즌2 제외.',
 S2_CONTRACT_EROSION:'적 용병의 첫 4행동 동안 평타·스킬 피해 감소. 정화 가능·제어 면역 제외.',
 S2_COMMAND_SEVERANCE:'적 용병 첫 2행동 스킬 봉쇄·평타 허용·직접 피해 취약. 자원·쿨타임 미소모, 정화 가능.'
};
export function defaultMagicSeason2Settings(){return {
 runtimeEnabled:false,drawEnabled:false,price:null,
 cardWeights:Object.fromEntries(Object.keys(MAGIC_S2_RULES).map(code=>[code,1])),
 packPolicy:'INHERIT_S1_MIXED',enhancementPolicy:'INHERIT_S1',growth:[...MAGIC_S2_GROWTH],
 status:'READY_HELD_BY_OWNER',version:1
};}
export function cleanMagicSeason2Settings(raw={}){
 const base=defaultMagicSeason2Settings(),price=raw.price==null||raw.price===''?null:Number(raw.price);
 const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
 if(price!==null&&(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(price*10)))invalid('시즌2 팩 가격은 10회 비용까지 안전한 양의 정수 코인이어야 합니다. 미정이면 비워두세요.');
 const cardWeights=Object.fromEntries(Object.keys(MAGIC_S2_RULES).map(code=>{
  const weight=Number(raw.cardWeights?.[code]??base.cardWeights[code]);
  if(!Number.isFinite(weight)||weight<0||weight>100000)invalid('시즌2 카드 가중치가 올바르지 않습니다.');
  return [code,weight];
 }));
 if(!Object.values(cardWeights).some(n=>n>0))invalid('시즌2 카드 가중치를 하나 이상 설정하세요.');
 if(raw.drawEnabled===true&&raw.runtimeEnabled!==true)invalid('시즌2 전투 공개 후 팩 개봉을 켜세요.');
 return {...base,runtimeEnabled:raw.runtimeEnabled===true,drawEnabled:raw.drawEnabled===true,price,cardWeights};
}

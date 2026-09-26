import {effectAt, mirrorAllowlist} from './catalog.mjs';
const amount=value=>Math.max(0,Math.min(1e12,Math.floor(Number(value)||0)));
const ratio=(value,pct)=>Math.floor(amount(value)*pct/100);

// A transparent arithmetic example, NOT a replacement combat simulator.
// Inputs are final, already-authorized damage/healing events from a future adapter.
export function sample(card, level, input=card.example.value, options={}) {
  const n=amount(input),p=effectAt(card,level);
  switch(card.slug){
    case 'eclipse-prophecy':return {rows:[['추가 피해',ratio(n,p.bonus)],['합산 피해',n+ratio(n,p.bonus)]],note:'표식 대상에게 직접 타격 6회가 모두 적중한 예시. 실제 전투의 방어·상한은 별도 적용합니다.'};
    case 'causal-sever':{
      const hp=ratio(n,p.pierce);return {rows:[['보호막을 건너뛰는 분량',hp],['일반 피해 경로로 가는 분량',n-hp]],note:`방어력은 별도 판정에서 ${p.ignore}% 무시합니다. 표시한 두 분량을 더해도 원래 최종 피해를 넘지 않습니다. 아포칼립스 전용 계산이 아닙니다.`};
    }
    case 'fate-intercept':{
      const hp=amount(options.targetHp??60000),active=hp>0&&n>=hp,kept=active?hp-1:Math.min(n,hp),excess=active?n-kept:0,reduced=ratio(excess,p.mitigation),transferred=excess-reduced;
      return {active,kept,excess,reduced,transferred,rows:[['보호받은 아군의 남은 HP',active?1:hp-kept],['장착자에게 이전되는 피해',transferred],['경감된 피해',reduced]],note:active?'보호막과 기본 피해 감소가 끝난 뒤의 직접 피해입니다. 장착자가 버티는지는 장착자의 남은 HP에 따라 달라집니다.':'치명 피해가 아니므로 대리와 전투당 사용 횟수를 소비하지 않습니다.'};
    }
    case 'overheal-forge':{
      const maxHp=amount(options.maxHp??500000),hp=Math.min(maxHp,amount(options.hp??450000)),approved=n,healed=Math.min(approved,maxHp-hp),overflow=approved-healed,cap=ratio(maxHp,p.cap),existing=amount(options.existingShield??0),shield=Math.min(ratio(overflow,p.conversion),Math.max(0,cap-existing));
      return {healed,overflow,shield,cap,consumesUse:shield>0,rows:[['실제로 회복한 HP',healed],['승인된 초과 회복',overflow],['새로 생성되는 보호막',shield]],note:`대상별 S2 생성 보호막 상한 ${cap.toLocaleString('ko-KR')}. 요청량이 아닌 회복 풀에서 승인된 회복량만 입력합니다.`};
    }
    case 'constellation-shift':return {rows:[['후퇴 보호가 줄이는 피해',ratio(n,p.reduction)],['보호 적용 후 피해',n-ratio(n,p.reduction)],['충전 행동 게이지',p.gauge]],note:'교대 조건을 만족한 후퇴 아군의 다음 직접 피격 1회 예시. 이 보호는 직접 피격 2회까지 적용하는 제안입니다.'};
    case 'shield-ledger':{
      const attack=amount(options.attack??100000),record=Math.min(ratio(n,p.record),attack*2),explosion=ratio(record,60);
      return {record,explosion,rows:[['저장된 피해 기록',record],['보호막 파괴 시 폭발',explosion]],note:`공격력 200% 기록 상한을 적용했습니다. 폭발 후 다음 직접 피격 2회의 방어력은 ${p.breakDefense}% 감소합니다. 실제 폭발에는 콘텐츠별 마법 피해 상한이 추가됩니다.`};
    }
    case 'fallen-star':return {rows:[['각 생존 아군 공격력 증가',ratio(n,p.attack)],['4명의 공격력 증가 합계',ratio(n,p.attack)*4],['각 생존 아군 행동 게이지',p.gauge]],note:'첫 최종 사망 이후 일반 아군 4명이 살아 있는 예시입니다. 용병·슈트·소환체는 이 계산에서 제외합니다.'};
    case 'arcane-mirror':{
      const eligible=options.copied!==true&&mirrorAllowlist.includes(options.effect??'CHAIN_ECHO');return {eligible,rows:[['복제된 연쇄 추가 피해',eligible?ratio(n,p.efficiency):0]],note:eligible?'상대가 이미 성공시킨 연쇄 추가 피해를 예시로 사용했습니다. 다른 허용 효과는 원본 파라미터를 장착자 기준으로 다시 계산해야 합니다.':'복제 금지 효과 또는 이미 복제된 이벤트이므로 발동하지 않습니다.'};
    }
    default:throw new Error('알 수 없는 카드');
  }
}

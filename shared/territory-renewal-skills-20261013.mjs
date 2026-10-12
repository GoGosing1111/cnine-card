// The V6 map uses the existing vote receipts and shared per-skill cooldowns.
export const RENEWAL_SKILL_CODES = Object.freeze(['ARC_LANCE','DISRUPTION_WAVE','CITADEL_REPAIR']);
export const RENEWAL_SKILL_DEFAULTS = Object.freeze({arcLanceCharge:40,arcLanceHpPercent:6,disruptionChargeDrain:35,repairHpPercent:8,repairCharge:20});
export const RENEWAL_SKILL_RANGES = Object.freeze({arcLanceCharge:[10,1000],arcLanceHpPercent:[1,10],disruptionChargeDrain:[5,1000],repairHpPercent:[1,15],repairCharge:[5,1000]});
export function renewalSkillCatalog(config={}) {
  const c={...RENEWAL_SKILL_DEFAULTS,...config},root='assets/ui/territory-war/renewal-skills-v1/';
  return {
    ARC_LANCE:{name:'천뢰 관통포',icon:'13',category:'OFFENSE',summary:`전력 ${c.arcLanceCharge} · 적 최대 HP ${c.arcLanceHpPercent}% 피해`,description:'선택 거점의 적 방벽을 즉시 관통합니다. 아군 시설 가동 중 사용하며 방벽 HP는 1 아래로 내려가지 않습니다.',cooldownMinutes:45,asset:root+'arc-lance-icon.webp',renewal:true},
    DISRUPTION_WAVE:{name:'동력 교란파',icon:'14',category:'CONTROL',summary:`선택 거점 적 전력 최대 ${c.disruptionChargeDrain} 감소`,description:'적 공성포의 다음 충전을 방해합니다. 이미 예약된 포격은 취소하지 않으며 아군 시설 가동 중 사용합니다.',cooldownMinutes:45,asset:root+'disruption-wave-icon.webp',renewal:true},
    CITADEL_REPAIR:{name:'성채 재건',icon:'15',category:'SUPPORT',summary:`방벽 ${c.repairHpPercent}% 복구 · 전력 +${c.repairCharge}`,description:'선택 거점의 아군 방벽과 전력을 최대치 안에서 보충합니다. 다른 거점과 개인 행동력에는 영향을 주지 않습니다.',cooldownMinutes:45,asset:root+'citadel-repair-icon.webp',renewal:true}
  };
}
export function renewalSkillPlan(operation,{config={},data,front,side,now=Date.now()}) {
  if(!RENEWAL_SKILL_CODES.includes(operation)||!['A','B'].includes(side))throw Error('사용할 수 없는 신규 전술입니다.');
  const c={...RENEWAL_SKILL_DEFAULTS,...config},own=side.toLowerCase(),enemy=side==='A'?'b':'a';
  const result={damage:0,heal:0,chargeSpent:0,chargeDrained:0,chargeGained:0};
  if(operation==='ARC_LANCE'||operation==='DISRUPTION_WAVE') {
    if(Number(data['emp_'+own+'_until_ms'])>now)throw Error('아군 시설을 먼저 복구해 주세요.');
  }
  if(operation==='ARC_LANCE') {
    if(Number(data['charge_'+own])<c.arcLanceCharge)throw Error('천뢰 관통포 발사 전력이 부족합니다.');
    result.damage=Math.max(0,Math.min(Number(front[enemy+'_hp'])-1,Math.round(Number(front[enemy+'_max_hp'])*c.arcLanceHpPercent/100)));
    if(!result.damage)throw Error('남은 방벽은 개인 교전으로 점령해 주세요.');
    result.chargeSpent=c.arcLanceCharge;
  }
  if(operation==='DISRUPTION_WAVE') {
    result.chargeDrained=Math.max(0,Math.min(Number(data['charge_'+enemy]),c.disruptionChargeDrain));
    if(!result.chargeDrained)throw Error('교란할 적 전력이 없습니다.');
  }
  if(operation==='CITADEL_REPAIR') {
    result.heal=Math.max(0,Math.min(Number(front[own+'_max_hp'])-Number(front[own+'_hp']),Math.round(Number(front[own+'_max_hp'])*c.repairHpPercent/100)));
    result.chargeGained=Math.max(0,Math.min(Number(c.chargeMax??100)-Number(data['charge_'+own]),c.repairCharge));
    if(!result.heal&&!result.chargeGained)throw Error('아군 방벽과 전력이 이미 가득 찼습니다.');
  }
  return result;
}

// Release preparation only. No fallback probabilities, prices, rewards or database writes.
export const OUTCOMES = Object.freeze(['success', 'maintain', 'destroy']);
export const POLICY_FIELDS = Object.freeze({
  stages: '최대 단계·단계별 성공/유지/파괴 확률',
  eligibleEquipment: '강화 대상 장비·등급·배틀슈트 포함 여부',
  costs: '강화 재료·수량·결과별 차감 규칙',
  powerScaling: '단계별 실제 PVE/PVP 전투력',
  protectionConsumption: '보호권 소모 시점·수량',
  protectionSources: '게임 내 보호권 획득처·희귀 획득률',
  restorationEligibility: '복구 대상 기간·등급·재파괴 처리',
  restorationLevel: '복구 강화 단계',
  restorationConsumption: '복구 쿠폰 소모량·지급 정책',
  restorationRefund: '복구 시 강화 재료 반환 여부',
});
export const INTEGRATION_FIELDS = Object.freeze([
  'individualInventory', 'serverQuotesAndRandomness', 'atomicEnhancementAndDestruction',
  'atomicRestoration', 'loadoutAndBattlePower', 'authenticatedRoutes', 'approvedUiMounted',
  'cmsAndGameplayAcquisition', 'databaseConcurrencyTests', 'mobileAndAccountQa', 'productionReleaseGate',
]);

export function validateRates(input) {
  if (!input || Object.keys(input).length !== 3 || OUTCOMES.some(key => !Object.hasOwn(input, key))) {
    throw new Error('성공·유지·파괴의 세 확률만 허용합니다.');
  }
  const units = OUTCOMES.map(key => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw new Error('확률은 0~100%, 소수 둘째 자리까지 입력하세요.');
    return Math.round(value * 100);
  });
  if (units[0] < 1000) throw new Error('성공률은 최소 10%입니다.');
  if (units.reduce((sum, value) => sum + value, 0) !== 10000) throw new Error('세 확률의 합은 100%여야 합니다.');
  return Object.fromEntries(OUTCOMES.map((key, i) => [key, units[i] / 100]));
}

const filled = value => value !== undefined && value !== null && value !== '' &&
  (typeof value !== 'object' || Object.keys(value).length > 0);

export function assessLaunch(draft) {
  const pending = [], errors = [];
  const rule = draft?.fixedRules;
  if (draft?.schemaVersion !== 1 || !['PREPARATION', 'RELEASE_CANDIDATE'].includes(draft?.status)) errors.push('지원하지 않는 출시 초안 형식');
  if (!rule || JSON.stringify(rule.outcomes) !== JSON.stringify(OUTCOMES) || rule.minimumSuccessPercent !== 10 ||
    rule.protectionAcquisition !== 'GAMEPLAY_ONLY' || rule.protectionRarity !== 'EXTREMELY_RARE' || rule.boxAcquisition !== false) {
    errors.push('사용자가 확정한 3종 판정·10% 하한·게임 내 극희귀 획득·상자 제외 규칙 위반');
  }
  for (const [key, label] of Object.entries(POLICY_FIELDS)) if (!filled(draft?.policy?.[key])) pending.push(label);
  const stages = draft?.policy?.stages;
  if (filled(stages)) {
    if (!Array.isArray(stages)) errors.push('단계별 확률표는 배열이어야 함');
    else stages.forEach((stage, index) => {
      try {
        if (stage.fromLevel !== index) throw new Error('단계는 +0부터 중복·누락 없이 지정해야 합니다.');
        validateRates(stage.rates);
      } catch (error) { errors.push(`단계 ${index}: ${error.message}`); }
    });
  }
  const sources = draft?.policy?.protectionSources;
  if (filled(sources)) {
    if (!Array.isArray(sources)) errors.push('보호권 획득처는 명시적인 목록이어야 함');
    else for (const source of sources) {
      if (source?.kind !== 'GAMEPLAY' || typeof source.contentId !== 'string' || !source.contentId.trim() ||
        typeof source.ratePercent !== 'number' || !Number.isFinite(source.ratePercent) || source.ratePercent <= 0 || source.ratePercent > 100 ||
        !Number.isSafeInteger(source.quantity) || source.quantity < 1) errors.push('보호권은 획득률·수량을 명시한 GAMEPLAY 경로만 허용');
    }
  }
  if (draft?.policyApproved !== true || typeof draft.policyRevision !== 'string' || !draft.policyRevision.trim()) pending.push('운영 정책 확정·버전 기록');
  if (draft?.activationRequested !== true) pending.push('실제 운영 활성화 지시');
  for (const key of INTEGRATION_FIELDS) if (draft?.integration?.[key] !== true) pending.push(`구현·검수: ${key}`);
  if (typeof draft?.liveEnabled !== 'boolean') errors.push('liveEnabled는 명시적인 boolean이어야 함');
  const ready = errors.length === 0 && pending.length === 0;
  if (draft?.liveEnabled === true && !ready) errors.push('미정 정책 또는 미완료 통합 상태에서 운영 활성화할 수 없음');
  return { ready: ready && errors.length === 0, liveEnabled: draft?.liveEnabled === true, errors, pending };
}

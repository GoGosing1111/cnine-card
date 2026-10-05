// ICON is preparation-only. Nothing in this module registers or grants a card.
const freeze = value => {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
};

export const ICON_GRADE = freeze({
  version: 1,
  code: 'ICON',
  label: '아이콘',
  category: 'STREAMER_CARD',
  aboveGrade: 'ZENITH',
  basePower: 180000,
  powerPolicy: 'BASE_ONLY_GROWTH_UNDECIDED',
  effectCount: 8,
  status: 'PREPARATION_ONLY',
  releaseEnabled: false,
  acquisition: {status: 'UNDECIDED', enabled: false, methods: [], drawWeight: 0},
  enhancement: {status: 'UNDECIDED', enabled: false},
  deckLimit: 2,
  frame: {
    source: 'assets/ui/card-frames/icon-streamer-frame-v1.png',
    sha256: '1368693F6861B7ABDCC8601CBF7EB5DAA13B5063B579DB3A8A38285CDCD0CA6F',
    width: 1024, height: 1536,
    approval: 'USER_APPROVED_20260920',
    bottomCenterNameplate: false,
    dragonDesign: false
  }
});

// The first four match the current card_unique_effects contract. The remaining
// four are design proposals, NOT approved tuning or active battle modifiers.
export const ICON_EFFECTS = freeze([
  {code:'ATTACK', key:'attackPercent', name:'공격', unit:'%', min:-90, max:500, status:'EXISTING', description:'기존 공격력 보정. 아이콘 카드별 수치는 별도 설정합니다.'},
  {code:'DEFENSE', key:'defensePercent', name:'방어', unit:'%', min:-90, max:500, status:'EXISTING', description:'기존 방어력 보정. 기존 등급의 설정은 변경하지 않습니다.'},
  {code:'HP', key:'hpPercent', name:'체력', unit:'%', min:-90, max:500, status:'EXISTING', description:'기존 최대 체력 보정. 회복량과는 구분합니다.'},
  {code:'SPEED', key:'speedPercent', name:'속도', unit:'%', min:-90, max:300, status:'EXISTING', description:'기존 속도 보정. 기본 전투력 18만에는 더하지 않습니다.'},
  {code:'CRITICAL_CHANCE', key:'criticalChancePoints', name:'치명타 확률', unit:'%p', min:0, max:100, status:'PROPOSED', description:'치명타 발생 확률 가산 초안. 기존 상한·전직과의 중첩 검수 필요.'},
  {code:'CRITICAL_DAMAGE', key:'criticalDamagePercent', name:'치명타 피해', unit:'%', min:0, max:500, status:'PROPOSED', description:'치명타 피해량 증가 초안. 최종 피해 상한과 적용 순서 검수 필요.'},
  {code:'PENETRATION', key:'penetrationPoints', name:'방어 관통', unit:'%p', min:0, max:100, status:'PROPOSED', description:'방어 관통 가산 초안. 기존 관통·전직과의 중첩 검수 필요.'},
  {code:'LIFESTEAL', key:'lifestealPercent', name:'흡혈', unit:'%', min:0, max:100, status:'PROPOSED', description:'실제 가한 피해 일부 회복 초안. 반격·지속 피해의 재발동 제한 검수 필요.'}
]);

export function isIconGrade(grade) {
  return typeof grade === 'string' && grade.trim().toUpperCase() === ICON_GRADE.code;
}

// Explicit eligibility, not a lexical/rank comparison: existing cards must not
// accidentally inherit the four additional fields, even if ranks are reordered.
export function uniqueEffectDefinitionsForGrade(grade) {
  return isIconGrade(grade) ? ICON_EFFECTS : ICON_EFFECTS.slice(0, 4);
}

export function iconCardBasePower(grade) {
  return isIconGrade(grade) ? ICON_GRADE.basePower : null;
}

export function emptyIconDraft() {
  return {
    version:1, grade:'ICON', basePower:180000, status:'PREPARATION_ONLY',
    effectDesign:'EXISTING_FOUR_PLUS_FOUR_PROPOSED',
    effects:ICON_EFFECTS.map(effect => ({code:effect.code, value:null})),
    scopes:{pve:false,pvp:false,captain:false},
    acquisition:{status:'UNDECIDED',enabled:false,methods:[],drawWeight:0},
    releaseEnabled:false
  };
}

export function validateIconDraft(raw) {
  const errors=[];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false,errors:['설정 객체가 필요합니다.'],draft:null};
  if (raw.grade !== 'ICON') errors.push('아이콘 전용 설정입니다.');
  if (raw.basePower !== 180000) errors.push('기본 전투력은 180,000으로 고정입니다.');
  if (raw.version !== 1) errors.push('지원하지 않는 설정 버전입니다.');
  if (raw.releaseEnabled !== false || raw.status !== 'PREPARATION_ONLY') errors.push('준비 단계에서 운영 활성화할 수 없습니다.');
  if (raw.effectDesign !== 'EXISTING_FOUR_PLUS_FOUR_PROPOSED') errors.push('고유효과 구성 확인이 필요합니다.');
  const acquisition=raw.acquisition;
  if (!acquisition || acquisition.status !== 'UNDECIDED' || acquisition.enabled !== false || acquisition.drawWeight !== 0 || !Array.isArray(acquisition.methods) || acquisition.methods.length) errors.push('획득 방법은 미정이며 모든 획득 경로가 잠겨 있어야 합니다.');
  if (!raw.scopes || ['pve','pvp','captain'].some(scope => raw.scopes[scope] !== false)) errors.push('준비 초안은 실제 전투에 적용할 수 없습니다.');
  if (!Array.isArray(raw.effects) || raw.effects.length !== ICON_GRADE.effectCount) errors.push('고유효과는 중복 없이 정확히 8종이어야 합니다.');
  const normalized=[];
  for (const definition of ICON_EFFECTS) {
    const matches=Array.isArray(raw.effects)?raw.effects.filter(effect => effect?.code === definition.code):[];
    if (matches.length !== 1) { errors.push(`${definition.name} 항목이 없거나 중복되었습니다.`); continue; }
    const value=matches[0].value;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max)) errors.push(`${definition.name} 입력 범위는 ${definition.min}~${definition.max}${definition.unit}입니다.`);
    normalized.push({code:definition.code,value});
  }
  if (errors.length) return {ok:false,errors,draft:null};
  // Never spread untrusted properties into a saved draft or release contract.
  return {ok:true,errors:[],draft:{...emptyIconDraft(),effects:normalized}};
}

export function iconReadiness(draft=emptyIconDraft()) {
  const checked=validateIconDraft(draft);
  return {
    ready:false,releaseEnabled:false,acquisitionEnabled:false,battleEnabled:false,
    configuredEffectCount:checked.ok?checked.draft.effects.filter(effect=>effect.value!==null).length:0,
    blockers:[
      ...checked.errors,
      '획득 방법 미정',
      '신규 고유효과 종류·수치·중첩 규칙 확정 및 전투 검수 필요',
      '강화·고유효과 전직 정책 미정',
      '실제 아이콘 카드 대상 지정 및 운영 연결 승인 필요'
    ]
  };
}

export function iconAcquisitionAllowed() {
  // No CMS/client/environment switch may turn an undecided acquisition on.
  return false;
}

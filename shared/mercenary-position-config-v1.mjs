// Release preparation only. No battle engine, account API or CMS route imports this module.
export const DRAFT_FORMAT = 'PROJECT_V_MERCENARY_POSITION_DRAFT_V1';
export const DRAFT_STORAGE_KEY = 'cnine.mercenaryPosition.draft.v1';
export const MAX_DRAFT_BYTES = 128 * 1024;

export const POSITIONS = Object.freeze({
  FRONT: { label: '전열', engineRow: 'FRONT', description: '전선을 받아내거나 근접 교전을 시작합니다.' },
  MIDDLE: { label: '중열', engineRow: 'BACK', description: '전열 뒤에서 지속 사격·기동·지휘를 담당합니다.' },
  REAR: { label: '후열', engineRow: 'BACK', description: '보호를 받으며 정밀 사격·마법·지원을 준비합니다.' }
});

export const TARGETS = Object.freeze({
  FRONT_ENEMY: { label: '적 전열 우선', description: '생존 전열에서 HP 비율이 낮은 적. 전열이 없으면 생존 적 전체.' },
  LOW_HP_ENEMY: { label: '약화된 적 추격', description: '허용된 생존 적 중 HP 비율이 가장 낮은 대상. 전열 우회는 스킬에만 적용.' },
  BACK_THREAT: { label: '적 후열 핵심 위협', description: '생존 후열 중 전투 시작 시 확정 공격력이 가장 높은 적. 후열이 없으면 전열 우선.' },
  FRONT_GROUP: { label: '적 전열 집단', description: '생존 전열 집단. 전열이 없으면 전열 우선 규칙의 단일 대상. 최대 타격 수는 밸런스 검수 후 확정.' },
  ALLY_LOW_HP: { label: '위기의 아군', description: '생존하고 대상으로 지정 가능한 아군 중 HP 비율이 가장 낮은 대상.' },
  ALLY_FRONT: { label: '아군 전열', description: '생존 아군 전열. 전열이 없으면 위기의 아군 규칙으로 전환.' },
  ALLY_TEAM: { label: '아군 편성 전체', description: '일반 카드 5장과 용병 중 생존 유닛. 배틀슈트·호송 목표물은 제외.' }
});

export const ROLES = Object.freeze({
  GUARDIAN: {
    label: '수호', positions: ['FRONT'], targets: ['ALLY_LOW_HP', 'ALLY_FRONT'],
    purpose: '피해를 받아내고 아군 핵심 카드를 보호', tradeoff: '낮은 처치력 · 방어 관통과 긴 소모전에 취약'
  },
  VANGUARD: {
    label: '돌격', positions: ['FRONT'], targets: ['FRONT_ENEMY', 'FRONT_GROUP'],
    purpose: '적 전열과 맞붙어 방어선을 돌파', tradeoff: '접근 의존 · 집중 사격과 행동 방해에 취약'
  },
  ASSASSIN: {
    label: '기습', positions: ['FRONT', 'MIDDLE'], targets: ['LOW_HP_ENEMY', 'BACK_THREAT'],
    purpose: '스킬 기회에 약화된 적·후열 핵심을 제거', tradeoff: '낮은 지속 생존력 · 보호와 스킬 대기시간에 취약'
  },
  MARKSMAN: {
    label: '사격', positions: ['MIDDLE', 'REAR'], targets: ['FRONT_ENEMY', 'LOW_HP_ENEMY'],
    purpose: '전열 보호 아래 꾸준히 단일 피해를 누적', tradeoff: '순간 돌파력 제한 · 기습과 사격 차단에 취약'
  },
  SNIPER: {
    label: '저격', positions: ['REAR'], targets: ['BACK_THREAT', 'FRONT_ENEMY'],
    purpose: '준비 동작 뒤 높은 가치의 단일 대상을 타격', tradeoff: '긴 준비 · 접근과 보호막에 취약'
  },
  CONTROLLER: {
    label: '제압', positions: ['FRONT', 'MIDDLE', 'REAR'], targets: ['FRONT_ENEMY', 'FRONT_GROUP', 'BACK_THREAT'],
    purpose: '방해·약화로 아군의 공격 기회를 생성', tradeoff: '개인 처치력 제한 · 제어 저항에 취약'
  },
  SUPPORT: {
    label: '지원', positions: ['MIDDLE', 'REAR', 'FRONT'], targets: ['ALLY_TEAM', 'ALLY_LOW_HP', 'ALLY_FRONT'],
    purpose: '지휘·보호·회복 중 한 강점으로 덱을 보완', tradeoff: '직접 피해 부족 · 집중 공격과 회복 억제에 취약'
  }
});

const rootKeys = ['format', 'schemaVersion', 'revision', 'rosterVersion', 'status', 'runtimeEnabled', 'assignments'];
const entryKeys = ['code', 'position', 'role', 'basicTarget', 'skillTarget', 'specialty', 'weakness', 'rationale'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const cloneDraft = value => JSON.parse(JSON.stringify(value));

export function validatePositionDraft(draft, roster) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  const exactKeys = (value, keys, path) => {
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, '허용되지 않은 설정 항목입니다.');
    for (const key of keys) if (!own(value, key)) fail(`${path}.${key}`, '필수 설정이 없습니다.');
  };
  if (!record(roster) || !Array.isArray(roster.cards) || !roster.cards.length ||
      new Set(roster.cards.map(card => card.code)).size !== roster.cards.length) {
    return { ok: false, errors: [{ path: 'roster', message: '기준 원화 로스터를 먼저 확인하세요.' }] };
  }
  if (!record(draft)) return { ok: false, errors: [{ path: 'draft', message: '설정은 JSON 객체여야 합니다.' }] };
  exactKeys(draft, rootKeys, 'draft');
  if (draft.format !== DRAFT_FORMAT || draft.schemaVersion !== 1) fail('format', '지원하지 않는 설정 형식입니다.');
  if (!Number.isSafeInteger(draft.revision) || draft.revision < 1 || draft.revision >= Number.MAX_SAFE_INTEGER) fail('revision', '수정 번호는 1 이상의 안전한 정수여야 합니다.');
  if (draft.rosterVersion !== roster.version) fail('rosterVersion', '원화 로스터 버전이 달라 재검토가 필요합니다.');
  if (draft.status !== 'DRAFT' || draft.runtimeEnabled !== false) fail('status', '이 준비 설정은 검토 초안·전투 미연결 상태만 허용합니다.');
  if (!Array.isArray(draft.assignments)) return { ok: false, errors: [...errors, { path: 'assignments', message: '용병 배정 목록이 필요합니다.' }] };
  const expected = new Set(roster.cards.map(card => card.code));
  const seen = new Set();
  for (const [index, entry] of draft.assignments.entries()) {
    const path = `assignments[${index}]`;
    if (!record(entry)) { fail(path, '용병 배정은 객체여야 합니다.'); continue; }
    exactKeys(entry, entryKeys, path);
    if (!expected.has(entry.code)) fail(`${path}.code`, '기준 로스터에 없는 용병입니다.');
    if (seen.has(entry.code)) fail(`${path}.code`, '같은 용병이 두 번 배정됐습니다.');
    seen.add(entry.code);
    const role = typeof entry.role === 'string' && own(ROLES, entry.role) ? ROLES[entry.role] : null;
    if (!role) fail(`${path}.role`, '정의된 전투 역할을 선택하세요.');
    if (typeof entry.position !== 'string' || !own(POSITIONS, entry.position) || (role && !role.positions.includes(entry.position))) fail(`${path}.position`, '이 역할에 허용되지 않는 배치 위치입니다.');
    if (entry.basicTarget !== 'FRONT_ENEMY') fail(`${path}.basicTarget`, '기본 공격은 적 전열 우선 규칙을 유지합니다.');
    if (typeof entry.skillTarget !== 'string' || !own(TARGETS, entry.skillTarget) || (role && !role.targets.includes(entry.skillTarget))) fail(`${path}.skillTarget`, '이 역할에 허용되지 않는 스킬 표적입니다.');
    for (const key of ['specialty', 'weakness', 'rationale']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > 240) fail(`${path}.${key}`, '1~240자의 설명을 입력하세요.');
    }
  }
  for (const code of expected) if (!seen.has(code)) fail('assignments', `${code} 배정이 빠졌습니다.`);
  return { ok: errors.length === 0, errors };
}

export function parsePositionDraft(text, roster) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_DRAFT_BYTES) throw new Error('설정 파일은 128 KB 이하여야 합니다.');
  const draft = JSON.parse(text);
  const result = validatePositionDraft(draft, roster);
  if (!result.ok) throw new Error(result.errors.map(error => `${error.path}: ${error.message}`).join('\n'));
  return draft;
}

// The caller persists only after this check; no silent stale revision overwrite.
// This is a local draft contract, not a database transaction or publish authorization.
export function revisePositionDraft(candidate, current, expectedRevision, roster) {
  for (const value of [current, candidate]) {
    const result = validatePositionDraft(value, roster);
    if (!result.ok) throw new Error(result.errors.map(error => error.message).join('\n'));
  }
  if (current.revision !== expectedRevision || candidate.revision !== expectedRevision) throw new Error('다른 편집에서 초안이 변경됐습니다. 저장본을 다시 불러오세요.');
  return { ...cloneDraft(candidate), revision: current.revision + 1 };
}

export function summarizePositions(draft) {
  return {
    total: draft.assignments.length,
    positions: Object.fromEntries(Object.keys(POSITIONS).map(key => [key, draft.assignments.filter(entry => entry.position === key).length])),
    roles: Object.fromEntries(Object.keys(ROLES).map(key => [key, draft.assignments.filter(entry => entry.role === key).length]))
  };
}

export function changedAssignments(before, after) {
  const prior = new Map(before.assignments.map(entry => [entry.code, entry]));
  return after.assignments.flatMap(entry => {
    const fields = entryKeys.filter(key => key !== 'code' && entry[key] !== prior.get(entry.code)?.[key]);
    return fields.length ? [{ code: entry.code, fields }] : [];
  });
}

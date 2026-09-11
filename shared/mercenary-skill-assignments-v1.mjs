import {MERCENARY_SKILLS, SKILL_CATALOG_VERSION} from './mercenary-skills-v1.mjs?v=20260911-library';

export const ASSIGNMENT_STORAGE_KEY = 'cnine.mercenarySkillAssignments.draft.v1';
export const MAX_ASSIGNMENT_BYTES = 64 * 1024;
const copy = value => JSON.parse(JSON.stringify(value));
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function createSkillAssignments(roster) {
  return {format: 'PROJECT_V_MERCENARY_SKILL_ASSIGNMENTS_V1', version: 1, revision: 1,
    rosterVersion: roster.version, catalogVersion: SKILL_CATALOG_VERSION, authority: 'USER',
    status: 'DRAFT', runtimeEnabled: false,
    assignments: roster.cards.map(card => ({code: card.code, skillIds: []}))};
}
export function validateSkillAssignments(draft, roster) {
  if (!exact(draft, ['format', 'version', 'revision', 'rosterVersion', 'catalogVersion', 'authority', 'status', 'runtimeEnabled', 'assignments']) ||
      draft.format !== 'PROJECT_V_MERCENARY_SKILL_ASSIGNMENTS_V1' || draft.version !== 1 ||
      draft.rosterVersion !== roster.version || draft.catalogVersion !== SKILL_CATALOG_VERSION ||
      draft.authority !== 'USER' || draft.status !== 'DRAFT' || draft.runtimeEnabled !== false ||
      !Number.isSafeInteger(draft.revision) || draft.revision < 1 || draft.revision >= Number.MAX_SAFE_INTEGER)
    throw new Error('배정 초안의 형식·버전·사용자 결정·운영 미연결 상태를 확인하세요.');
  if (!Array.isArray(draft.assignments) || draft.assignments.length !== roster.cards.length)
    throw new Error('모든 용병의 배정 상태가 있어야 합니다.');
  const codes = new Set(roster.cards.map(card => card.code)), seen = new Set();
  const skillIds = new Set(MERCENARY_SKILLS.map(skill => skill.id));
  for (const row of draft.assignments) {
    if (!exact(row, ['code', 'skillIds']) || !codes.has(row.code) || seen.has(row.code) ||
        !Array.isArray(row.skillIds) || row.skillIds.some(id => !skillIds.has(id)) ||
        new Set(row.skillIds).size !== row.skillIds.length)
      throw new Error('알 수 없는 용병·스킬, 중복 배정 또는 허용되지 않은 필드가 있습니다.');
    seen.add(row.code);
  }
  // No rank/role/weapon lock and no automatic exclusive ownership. Multiple
  // selections are review proposals; live slot counts remain unconfirmed.
  return copy(draft);
}
export function parseSkillAssignments(text, roster) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_ASSIGNMENT_BYTES)
    throw new Error('배정 파일은 64 KB 이하여야 합니다.');
  return validateSkillAssignments(JSON.parse(text), roster);
}
export function reviseSkillAssignments(draft, stored, expectedRevision, roster) {
  const checked = validateSkillAssignments(draft, roster);
  if (stored) validateSkillAssignments(stored, roster);
  if ((stored?.revision ?? null) !== expectedRevision)
    throw new Error('다른 화면에서 배정이 변경됐습니다. 현재 초안을 내보낸 뒤 저장본을 불러오세요.');
  checked.revision = Math.max(checked.revision, stored?.revision || 0) + 1;
  return validateSkillAssignments(checked, roster);
}

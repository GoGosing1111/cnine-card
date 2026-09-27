// Pure preparation boundary, intentionally not registered in the production API.
// No schema migration, card registration, player grant, or database operation.
import {ICON_GRADE,validateIconDraft,iconReadiness} from '../shared/icon-grade-v1.mjs';

export function prepareIconGradeSettings(raw) {
  const checked=validateIconDraft(raw);
  if (!checked.ok) throw Object.assign(new Error(checked.errors.join(' ')), {status:400,code:'ICON_DRAFT_INVALID'});
  return {draft:checked.draft,policy:ICON_GRADE,readiness:iconReadiness(checked.draft)};
}

export function requireIconReleased() {
  throw Object.assign(new Error('아이콘 등급은 구현 준비 중이며 획득·지급·전투 적용이 열리지 않았습니다.'),{status:409,code:'ICON_PREPARATION_ONLY'});
}

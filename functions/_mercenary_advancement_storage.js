import { ROLE_BY_ID } from '../shared/mercenary-advancement-v1.mjs';
import { jointError } from './_joint_request.js';

export const ADVANCEMENT_PREFIX = 'mercenary_advancement_v1:';

export function storedAdvancement(raw) {
  if (raw == null) return { id: null, revision: 0 };
  const choice = JSON.parse(raw);
  if (!ROLE_BY_ID.has(choice?.id) || !Number.isSafeInteger(choice.revision) || choice.revision < 1) {
    throw jointError('MERCENARY_ADVANCEMENT_DATA', '저장된 전직 정보를 확인하지 못했습니다.', 503);
  }
  return choice;
}

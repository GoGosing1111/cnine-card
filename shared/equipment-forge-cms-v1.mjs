import {FORGE_ENHANCEMENT_MATERIAL} from './equipment-forge-policy-v1.mjs';

export const FORGE_STEP_FIELDS = Object.freeze([
  ['successPpm', '성공', 10, 100, 'percent'],
  ['maintainPpm', '유지', 0, 100, 'percent'],
  ['destroyPpm', '파괴', 0, 100, 'percent'],
  ['coinCost', '코인', 1, 1e12, 'integer'],
  ['itemQuantity', '마스터의 별', 1, 1e8, 'integer'],
  ['protectionQuantity', '보호권', 1, 10000, 'integer'],
]);
export const FORGE_SOURCE_NAMES = Object.freeze({TOWER:'무한의탑', SCRAPYARD:'폐차장', COW_ROOM:'카우방'});

// Parse decimal percentages as integers, without float rounding (0.0001% = 1 ppm).
export function forgeInputNumber(value, type = 'integer') {
  const text = String(value).trim();
  if (!text) return null;
  if (type === 'percent') {
    if (!/^\d+(?:\.\d{1,4})?$/.test(text)) throw Error('확률은 소수점 넷째 자리까지 입력하세요.');
    const [whole, fraction = ''] = text.split('.');
    const result = Number(whole) * 10000 + Number(fraction.padEnd(4, '0'));
    if (!Number.isSafeInteger(result) || result > 1000000) throw Error('확률은 0~100% 범위로 입력하세요.');
    return result;
  }
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw Error('비용·수량·시간은 0 이상의 정수로 입력하세요.');
  return Number(text);
}

// Readiness is not approval. A complete CMS draft never activates the joint gate.
export function forgePolicyReadiness(policy, catalog) {
  const issues = [];
  const add = (path, message) => issues.push({path, message});
  const steps = policy.steps.map(row => {
    const missing = FORGE_STEP_FIELDS.filter(([key]) => row[key] === null).map(([, label]) => label);
    if (missing.length) add(`steps.${row.level}`, `+${row.level} → +${row.level + 1}: ${missing.join(' · ')} 미설정`);
    return {level:row.level, complete:!missing.length, missing};
  });
  const p = policy.protection, r = policy.restoration;
  if (!p.itemCode) add('protection.itemCode', '장비보호권 아이템을 선택하세요.');
  if (p.consume === 'UNSET') add('protection.consume', '보호권 소모 시점을 선택하세요.');
  if (!p.sources.some(source => source.enabled)) add('protection.sources', '보호권 게임 내 획득처를 최소 1곳 설정하세요.');
  if (!r.enabled) add('restoration.enabled', '복구 정책이 꺼져 있습니다.');
  if (r.coinCost === null) add('restoration.coinCost', '복구 코인 비용을 설정하세요. 0은 무료입니다.');
  if (r.expiresHours === null) add('restoration.expiresHours', '복구 가능 시간을 설정하세요. 0은 무기한입니다.');
  if (r.levelMode === 'UNSET') add('restoration.levelMode', '복구 후 반환 단계를 선택하세요.');
  if (catalog) {
    const active = new Set(catalog.filter(item => Number(item.is_active) === 1).map(item => item.code));
    for (const [code, path, label] of [
      [FORGE_ENHANCEMENT_MATERIAL, 'steps', '강화 재료'],
      [p.itemCode, 'protection.itemCode', '보호권'], [r.itemCode, 'restoration.itemCode', '복구 재료'],
    ]) if (code && !active.has(code)) add(path, `${label} ${code}: 미등록 또는 비활성 아이템입니다.`);
  }
  return {ready:issues.length === 0, completedSteps:steps.filter(step => step.complete).length, steps, issues};
}

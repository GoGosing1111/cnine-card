import {FORGE_ENHANCEMENT_MATERIAL} from '../shared/equipment-forge-policy-v1.mjs';
import {forgePolicyReadiness} from '../shared/equipment-forge-cms-v1.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {jointError} from './_joint_request.js';

export async function assertForgeMaterials(env, policy) {
  const codes = [...new Set([FORGE_ENHANCEMENT_MATERIAL, policy.protection.itemCode, policy.restoration.itemCode].filter(Boolean))];
  const rows = (await env.DB.prepare(`SELECT code,is_active FROM inventory_items WHERE code IN (${codes.map(() => '?').join(',')})`).bind(...codes).all()).results;
  const active = new Set(rows.filter(row => Number(row.is_active) === 1).map(row => row.code));
  const missing = codes.filter(code => !active.has(code));
  if (missing.length) throw jointError('FORGE_MATERIAL_CONFIG', `미등록 또는 비활성 재료입니다: ${missing.join(', ')}. 등록된 활성 아이템을 선택하세요.`, 409);
}

export async function forgeAdminState(env, policy) {
  // One bounded catalog read; no balances, ownership, or per-row network calls.
  const rows = (await env.DB.prepare('SELECT code,name,is_active FROM inventory_items ORDER BY name,code LIMIT 1001').all()).results;
  if (rows.length > 1000) throw jointError('FORGE_CATALOG_LIMIT', '재료 목록이 너무 큽니다. 카탈로그 범위를 점검하세요.', 409);
  const catalog = rows.map(row => ({code:row.code, name:row.name, is_active:Number(row.is_active)}));
  return {policy, catalog, readiness:forgePolicyReadiness(policy, catalog), releaseEnabled:V3_JOINT_RELEASE_ENABLED,
    saveScope:'DRAFT_ONLY', executionMode:V3_JOINT_RELEASE_ENABLED ? 'RELEASE_DOCUMENT' : 'OFF'};
}

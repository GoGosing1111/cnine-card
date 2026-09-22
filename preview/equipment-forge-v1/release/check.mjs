import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assessLaunch } from './policy.mjs';
import {FORGE_EXECUTION_IMPLEMENTED} from '../../../functions/_equipment_forge_public.js';
import {FORGE_RUNTIME_RELEASE_ENABLED} from '../../../shared/equipment-forge-release-v1.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../../../shared/v3-joint-release-v1.mjs';
import {validateEquipmentForgeRelease} from '../../../functions/_equipment_forge_release.js';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
export function checkPreparation() {
  const approval = JSON.parse(read('preview/equipment-forge-v1/release/approval.json'));
  const draft = JSON.parse(read('preview/equipment-forge-v1/release/launch-draft.json'));
  const errors = [];
  if (approval.status !== 'UI_AND_EFFECTS_FINAL_APPROVED' || approval.previewRevision !== 2) errors.push('V2 최종 승인 기록 누락');
  if (!approval.files?.length) errors.push('승인 원본 해시 목록 누락');
  for (const file of approval.files || []) {
    try {
      const raw = read(file.path);
      const bytes = file.hashMode === 'UTF8_LF' ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw;
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== file.sha256 || bytes.length !== file.bytes) errors.push(`승인본 변경: ${file.path}`);
    } catch { errors.push(`승인 파일 누락: ${file.path}`); }
  }
  // Public disclosure is approved separately. The frozen review simulator is never a live host.
  for (const path of ['index.html', 'js/app.js', 'js/equipment-v1274.js', 'functions/api/[[path]].js', 'functions/_equipment.js', 'service-worker.js']) {
    if (/equipment-forge-v1\/source\/(app|model)\.mjs|ForgeSimulation/.test(read(path).toString())) errors.push(`운영 호스트에 시연 로직이 추가됨: ${path}`);
  }
  if(FORGE_RUNTIME_RELEASE_ENABLED){
    try{validateEquipmentForgeRelease(JSON.parse(read('docs/releases/equipment-forge-approved-20260922.json')));}
    catch(error){errors.push(`운영 출시 승인본 검증 실패: ${error.message}`);}
    if(!FORGE_EXECUTION_IMPLEMENTED||V3_JOINT_RELEASE_ENABLED)errors.push('장비 전용 출시 범위 불일치');
  }
  const launch = assessLaunch(draft);
  if (draft.liveEnabled !== false) errors.push('현재 준비 패키지는 liveEnabled=false를 유지해야 함');
  // The approved presentation simulator remains frozen/OFF. Live execution
  // is independently covered by real-route SQLite/PostgreSQL regression tests.
  return { preparationReady: errors.length === 0 && launch.errors.length === 0, visualApproved: approval.status === 'UI_AND_EFFECTS_FINAL_APPROVED',
    verifiedFiles: approval.files?.length || 0, errors: [...errors, ...launch.errors], launchReady: false,
    mutationRuntimeImplemented: FORGE_EXECUTION_IMPLEMENTED, liveEnabled: draft.liveEnabled, pending: launch.pending };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkPreparation();
  console.log(JSON.stringify(result, null, 2));
  if (!result.preparationReady || (process.argv.includes('--require-launch-ready') && !result.launchReady)) process.exitCode = 1;
}

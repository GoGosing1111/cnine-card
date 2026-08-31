import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS,
  equipmentSynthesisBatchPlan
} from '../functions/_workshop.js';

const root = new URL('../', import.meta.url);
const server = readFileSync(new URL('functions/_workshop.js', root), 'utf8');
const client = readFileSync(new URL('js/workshop-v1881.js', root), 'utf8');
const css = readFileSync(new URL('css/workshop-v1881.css', root), 'utf8');
const app = readFileSync(new URL('js/app.js', root), 'utf8');

test('batch plan consumes every complete duplicate group and preserves the remainder', () => {
  assert.equal(MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS, 100);
  assert.deepEqual(
    equipmentSynthesisBatchPlan({ available: 12, required: 3, attempts: 4 }),
    { attempts: 4, required: 3, totalRequired: 12, maxAttempts: 4, inventoryAttempts: 4 }
  );
  assert.deepEqual(
    equipmentSynthesisBatchPlan({ available: 10, required: 3, attempts: 3 }),
    { attempts: 3, required: 3, totalRequired: 9, maxAttempts: 3, inventoryAttempts: 3 }
  );
});

test('batch plan rejects unavailable and oversized requests', () => {
  assert.throws(
    () => equipmentSynthesisBatchPlan({ available: 10, required: 3, attempts: 4 }),
    /현재 일괄 합성 가능 횟수는 3회/
  );
  assert.throws(
    () => equipmentSynthesisBatchPlan({ available: 1000, required: 3, attempts: 101 }),
    /100회 이하/
  );
  assert.throws(
    () => equipmentSynthesisBatchPlan({ available: 10, required: 3, attempts: 1.5 }),
    /1회 이상 100회 이하/
  );
});

test('server performs independent rolls and one guarded atomic batch', () => {
  assert.match(server, /attempts:body\.attempts\?\?1/);
  assert.match(server, /new Uint32Array\(plan\.attempts\)/);
  assert.match(server, /outcomes=Array\.from\(rollValues/);
  assert.match(server, /successCount=successIndexes\.length,failureCount=plan\.attempts-successCount/);
  assert.match(server, /LEFT JOIN user_equipment_loadout l ON l\.instance_id=x\.id[\s\S]*?l\.instance_id IS NULL/);
  assert.match(server, /selectedIdRows=.*jsonb_array_elements_text[\s\S]*?json_each\(\?\)/);
  assert.match(server, /DELETE FROM user_equipment_instances WHERE id IN \(\$\{selectedIdRows\}\)/);
  assert.match(server, /outputRowsJson=JSON\.stringify\(successIndexes\.map/);
  assert.match(server, /INSERT INTO user_equipment_instances[\s\S]*?FROM output_rows WHERE EXISTS/);
  assert.match(server, /await env\.DB\.batch\(statements\)/);
  assert.match(server, /status==='COMPLETED'[\s\S]*?replayed:true/);
});

test('client exposes single and all-duplicate synthesis with replay-safe attempt count', () => {
  assert.match(client, /const MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS = 100/);
  assert.match(client, /const synthMaxAttempts = recipe => Math\.min\(MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS, Math\.floor/);
  assert.match(client, /id="wsSynthStart"[\s\S]*?>\$\{workshopBusy[\s\S]*?'1회 합성'/);
  assert.match(client, /id="wsSynthBulk"[\s\S]*?data-synth-attempts="\$\{maxAttempts\}"/);
  assert.match(client, /중복 전부 합성/);
  assert.match(client, /requestTarget = recovering \? pending\.rawTarget : `\$\{recipe\.recipe_id\}:\$\{attempts\}`/);
  assert.match(client, /JSON\.stringify\(\{ recipeId: recipe\.recipe_id, attempts, requestId: ticket\.requestId \}\)/);
  assert.match(client, /showBulkSynthesisResult\(data, canPresent\)/);
  assert.match(client, /회차별 판정/);
  assert.match(client, /장착 중인 장비는 소모 대상에서 제외/);
});

test('bulk result unlocks before the per-attempt verdict sequence starts', () => {
  const unlockStart = client.indexOf('const unlock = () =>');
  const unlockClass = client.indexOf("panel.classList.add('unlocked', 'sequence-running')", unlockStart);
  const sequenceStart = client.indexOf('void playOutcomeSequence()', unlockStart);
  assert.ok(unlockStart >= 0 && unlockClass > unlockStart && sequenceStart > unlockClass);
  assert.match(client, /role="slider" aria-label="일괄 합성 결과 잠금 해제"/);
  assert.match(client, /roll\?\.classList\.add\('resolving'\)/);
  assert.match(client, /roll\?\.classList\.add\(successful \? 'success' : 'failure'\)/);
  assert.match(client, /panel\.classList\.add\('sequence-complete'\)/);
  assert.match(client, /close\.disabled = false/);
});

test('bulk synthesis UI is cache-busted and responsive', () => {
  assert.match(app, /workshop-v1881\.css\?v=1942-equipment-bulk-reveal/);
  assert.match(app, /workshop-v1881\.js\?v=1942-equipment-bulk-reveal/);
  assert.match(css, /\.ws81-synth-actions\{display:grid/);
  assert.match(css, /\.ws81-bulk-result-modal\{/);
  assert.match(css, /\.ws81-bulk-slider\{/);
  assert.match(css, /\.ws81-bulk-result\.strike-success/);
  assert.match(css, /\.ws81-bulk-result\.strike-failure/);
  assert.match(css, /@media\(max-width:680px\)[\s\S]*?\.ws81-synth-actions\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:430px\)[\s\S]*?\.ws81-bulk-equipment\{grid-template-columns:1fr\}/);
});

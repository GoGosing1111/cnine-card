import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { equipmentSynthesisMaterialPlan } from '../functions/_workshop.js';

const root = new URL('../', import.meta.url);
const server = readFileSync(new URL('functions/_workshop.js', root), 'utf8');
const client = readFileSync(new URL('js/workshop-v1881.js', root), 'utf8');
const css = readFileSync(new URL('css/workshop-v1881.css', root), 'utf8');
const admin = readFileSync(new URL('admin/workshop-synthesis-v1677.js', root), 'utf8');
const adminIndex = readFileSync(new URL('admin/index.html', root), 'utf8');

test('optional synthesis material plan scales with every independent attempt', () => {
  assert.deepEqual(
    equipmentSynthesisMaterialPlan({ available: 25, required: 5, attempts: 5 }),
    { attempts: 5, required: 5, totalRequired: 25, maxAttempts: 5, inventoryAttempts: 5 }
  );
  assert.throws(
    () => equipmentSynthesisMaterialPlan({ available: 25, required: 5, attempts: 6 }),
    /재료 기준 합성 가능 횟수는 5회/
  );
  assert.deepEqual(
    equipmentSynthesisMaterialPlan({ available: 0, required: 0, attempts: 100 }),
    { attempts: 100, required: 0, totalRequired: 0, maxAttempts: 100, inventoryAttempts: 100 }
  );
});

test('server stores one optional material without requiring a schema-owner migration', () => {
  assert.match(server, /SYNTH_MATERIAL_META_PREFIX='SYNTHMAT2008:'/);
  assert.match(server, /SELECT key,value FROM app_meta WHERE key LIKE/);
  assert.match(server, /category='MATERIAL'/);
  assert.match(server, /materialCode,quantity:materialQuantity/);
  assert.doesNotMatch(server, /ALTER TABLE equipment_synthesis_recipes_v1677/);
});

test('server verifies and consumes equipment plus material in the guarded batch', () => {
  const start = server.indexOf('async function synthesizeEquipment');
  const end = server.indexOf('async function adminSnapshot', start);
  const synthesis = server.slice(start, end);
  assert.match(synthesis, /materialPlan=equipmentSynthesisMaterialPlan/);
  assert.match(synthesis, /quantity>=\?/);
  assert.match(synthesis, /UPDATE cnine_user_inventory SET quantity=quantity-\?/);
  assert.match(synthesis, /EQUIPMENT_SYNTHESIS_MATERIAL/);
  assert.match(synthesis, /material:materialCode\?\{code:materialCode/);
  assert.match(synthesis, /await env\.DB\.batch\(statements\)/);
});

test('player UI gates single and batch synthesis by both stock types', () => {
  assert.match(client, /const synthMaterialRequired = recipe/);
  assert.match(client, /const canSynthesize = recipe =>[\s\S]{0,260}synthMaterialOwned\(recipe\) >= synthMaterialRequired\(recipe\)/);
  assert.match(client, /const synthMaxAttempts = recipe => Math\.min\([\s\S]{0,320}synthMaterialOwned\(recipe\)/);
  assert.match(client, /ADDITIONAL MATERIAL CONSUMED/);
  assert.match(client, /ws81-reveal-material/);
  assert.match(css, /\.ws81-synth-material img\{position:static;inset:auto/);
  assert.match(css, /\.ws81-synth-material b\{[^}]*overflow-wrap:anywhere;white-space:normal/);
});

test('CMS exposes the requested Prime 3 plus Mystic Energy 5 template', () => {
  assert.match(admin, /MYSTIC_ENERGY_CODE='STARLIGHT_ARMOR_CORE'/);
  assert.match(admin, /name:mystic\?'미스틱 장비 도전'/);
  assert.match(admin, /input_quantity:3/);
  assert.match(admin, /material_quantity:mystic&&energy\?5:0/);
  assert.match(admin, /materialCode,materialQuantity/);
  assert.match(admin, /실패 시 모든 투입 재료가 소모됩니다/);
  assert.match(adminIndex, /workshop-synthesis-v1677\.css\?v=2008-synthesis-material/);
  assert.match(adminIndex, /workshop-synthesis-v1677\.js\?v=2008-synthesis-material/);
});

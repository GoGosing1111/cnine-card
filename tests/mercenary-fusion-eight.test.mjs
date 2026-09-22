import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MATERIAL_COUNT, FUSION_PREPARATION, nextRank, materialRows, validateMaterials, addMaterial, autoMaterials, demoMaterials, demoResult, atlasFrame, TIMING } from '../mercenary-codex/fusion/model.mjs';

const cards = [{ code:'V-004',name:'베스페라',rank:'SS' },{ code:'V-009',name:'련화',rank:'SS' },{ code:'V-013',name:'라비에나',rank:'S' },{ code:'V-021',name:'오메가-X',rank:'SSS' }];
const catalog = { cards }, account = { cards: [
  { code:'V-004',duplicates:5,totalCopies:6 },{ code:'V-009',duplicates:3,totalCopies:4 },
  { code:'V-013',duplicates:1,totalCopies:2 },{ code:'V-021',duplicates:10,totalCopies:11 },
] };

test('eight same-rank duplicate copies may mix mercenaries while preserving each original', () => {
  const before = structuredClone(account), rows = materialRows(catalog, account), selection = autoMaterials(rows, 'SS');
  assert.equal(selection.length, MATERIAL_COUNT); assert.deepEqual(selection, [...Array(5).fill('V-004'), ...Array(3).fill('V-009')]);
  assert.equal(validateMaterials(selection, rows).ok, true); assert.deepEqual(account, before);
  assert.equal(materialRows(catalog, { cards: [{ code:'V-004',totalCopies:1,duplicates:0 }] }).length, 0);
  assert.equal(materialRows(catalog, { cards: [{ code:'V-004',totalCopies:9,duplicates:9 }] }).length, 0);
});
test('reject seven/nine cards, cross-rank input, unowned cards and repeated copies exceeding inventory', () => {
  const rows = materialRows(catalog, account), eight = autoMaterials(rows, 'SS');
  for (const selection of [eight.slice(1), [...eight,'V-009'], [...eight.slice(0,7),'V-013'], Array(8).fill('V-004'), Array(8).fill('V-888')])
    assert.equal(validateMaterials(selection, rows).ok, false, JSON.stringify(selection));
  const failed = addMaterial(eight, 'V-009', rows); assert.equal(failed.ok, false); assert.equal(failed.selection, eight);
});
test('SSS is never a material rank and only one-step promotion is represented', () => {
  assert.deepEqual(['C','B','A','S','SS','SSS','UNKNOWN'].map(nextRank), ['B','A','S','SS','SSS',null,null]);
  assert.equal(materialRows(catalog, account).some(c => c.rank === 'SSS'), false);
  assert.equal(validateMaterials(Array(8).fill('V-021'), [{...cards[3],duplicates:10}]).ok, false);
});
test('demo copies do not alter ownership and results are explicit catalog choices, never random draws', () => {
  const before = JSON.stringify({ catalog, account });
  const samples = demoMaterials(catalog, 'SS'); assert.equal(samples.length, 8); assert.ok(samples.every(c => c.rank === 'SS'));
  assert.equal(demoResult(catalog, 'SSS').code, 'V-021'); assert.equal(demoResult(catalog, 'B'), null);
  assert.equal(JSON.stringify({ catalog, account }), before);
  assert.equal(FUSION_PREPARATION.enabled, false); assert.equal(FUSION_PREPARATION.materialRule, 'SAME_RANK');
  assert.equal(FUSION_PREPARATION.successOutcome, 'NEXT_RANK');
  assert.equal(FUSION_PREPARATION.successChance,10);assert.equal(FUSION_PREPARATION.coinCost,0);
  assert.equal(FUSION_PREPARATION.failureOutcome,'SAME_RANK_RANDOM');
});
test('the prepared feature cannot debit or grant, and all art is separate from battle sprites', () => {
  const app = fs.readFileSync('mercenary-codex/fusion/app.mjs','utf8');
  assert.doesNotMatch(app, /method\s*:\s*['"](?:POST|PATCH|DELETE)|jointAccountRequest|\.battleSprite|Math\.random|localStorage/);
  assert.match(app, /실제 합성 준비 중/); assert.match(app, /실제 지급 없음/);
  const fx = fs.readFileSync('mercenary-codex/fusion/fx.mjs','utf8');
  assert.match(fx, /CNineUiFxVendor/); assert.doesNotMatch(fx, /createOscillator|Math\.random|AnimatedSprite/);
  assert.match(fx, /resizeObserver\?\.disconnect/); assert.match(fx, /textureSource: false/);
});
test('authored sequence remains continuous and ordered across charge, dark hold, impact and dissipation', () => {
  const frames = Array.from({length:841},(_,i)=>atlasFrame(i/100));
  assert.ok(frames.every(n=>Number.isFinite(n)&&n>=0&&n<=15));
  assert.ok(frames.every((n,i)=>i===0||n>=frames[i-1]));
  assert.equal(atlasFrame(TIMING.silence),5); assert.equal(atlasFrame(TIMING.impact),6);
  assert.equal(atlasFrame(TIMING.end),15);
});

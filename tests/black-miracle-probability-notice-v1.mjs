import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const json = async (path) => JSON.parse(await read(path));
const closeTo = (actual, expected, tolerance = 0.00000002) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('공지 스냅샷은 LIVE CMS 개봉 중지 및 드랍 유지 상태를 고정한다', async () => {
  const data = await json('preview/black-miracle-probability-notice-v1/cms-snapshot-v1.json');
  assert.equal(data.source.type, 'LIVE_OWNER_CMS');
  assert.equal(data.pack.inventoryOpenEnabled, false);
  assert.equal(data.pack.contentDropsRemainEnabled, true);
  assert.equal(data.pack.presentationCardCount, 5);
  assert.equal(data.contentDropSources.length, 7);
  assert.ok(data.contentDropSources.every((row) => row.enabled && row.quantity === 1));
});

test('공개 확률은 31종과 일반 보상을 합쳐 정확히 100%다', async () => {
  const data = await json('preview/black-miracle-probability-notice-v1/cms-snapshot-v1.json');
  const equipment = data.equipmentPool.reduce((sum, row) => sum + row.ratePercent, 0);
  const vehicle = data.vehiclePool.reduce((sum, row) => sum + row.ratePercent, 0);
  const summary = data.probabilityModel.effectiveSummaryPercent;
  assert.equal(data.equipmentPool.length, 17);
  assert.equal(data.vehiclePool.length, 14);
  closeTo(equipment, summary.mythicEquipment);
  closeTo(vehicle, summary.mythicVehicle);
  closeTo(equipment + vehicle, summary.rareTotal);
  closeTo(summary.mythicEquipment + summary.mythicVehicle + summary.masterStar + summary.coin, 100);
  assert.equal(summary.masterStar, summary.coin);
});

test('포스터는 확률 기준과 개봉 준비 상태를 명시한다', async () => {
  const html = (await read('preview/black-miracle-probability-notice-v1/index.html')).toString();
  const script = (await read('preview/black-miracle-probability-notice-v1/poster.js')).toString();
  assert.match(html, /확률 정보 사전 공개/);
  assert.match(html, /개봉 준비 중/);
  assert.match(html, /5장의 봉인 카드는 개봉 연출/);
  assert.match(html, /이미 보유한 항목을 제외/);
  assert.match(html, /100\.000000%/);
  assert.match(script, /equipmentPool\.length !== 17/);
  assert.match(script, /vehiclePool\.length !== 14/);
});

test('최종 공지 PNG 4장과 세로 합본 규격이 정확하다', async () => {
  const base = 'preview/black-miracle-probability-notice-v1/exports/';
  const pages = ['01-cover', '02-equipment', '03-vehicle', '04-rules'];
  for (const page of pages) {
    const dimensions = pngDimensions(await read(`${base}black-miracle-probability-notice-${page}-v1.png`));
    assert.deepEqual(dimensions, { width: 1080, height: 1350 });
  }
  assert.deepEqual(pngDimensions(await read(`${base}black-miracle-probability-notice-full-v1.png`)), { width: 1080, height: 5400 });
});

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {
  VEHICLE_WORKSHOP_COIN_COST_MAX,
  normalizeWorkshopCoinCost
} from '../functions/_workshop.js';

const server=readFileSync(new URL('../functions/_workshop.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin/workshop-admin-v1668.js',import.meta.url),'utf8');
const adminIndex=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const packageJson=readFileSync(new URL('../package.json',import.meta.url),'utf8');

test('차량 제작 코인 비용은 기존 10억 상한을 넘겨 저장할 수 있다',()=>{
  assert.equal(VEHICLE_WORKSHOP_COIN_COST_MAX,Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(5_000_000_000,'VEHICLE'),5_000_000_000);
  assert.equal(normalizeWorkshopCoinCost(Number.MAX_SAFE_INTEGER,'VEHICLE'),Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(Number.MAX_SAFE_INTEGER+1_000,'VEHICLE'),Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(-1,'VEHICLE'),0);
  assert.match(server,/coinCost=normalizeWorkshopCoinCost\(fixed\?\.coin\?\?raw\.coinCost\?\?raw\.coin_cost,category\)/);
});

test('차량 외 제작 분류의 기존 코인 안전 한도는 유지한다',()=>{
  assert.equal(normalizeWorkshopCoinCost(5_000_000_000,'EQUIPMENT_SYNTHESIS'),1_000_000_000);
  assert.equal(normalizeWorkshopCoinCost(5_000_000_000,'MATERIAL_CRAFT'),1_000_000_000);
  assert.equal(normalizeWorkshopCoinCost(5_000_000_000,'BATTLE_SUIT_CRAFT'),1_000_000_000);
});

test('CMS는 차량 제작을 선택한 동안 코인 입력 max를 제거하고 캐시를 갱신한다',()=>{
  assert.match(admin,/function syncCoinCostLimit\(category\)/);
  assert.match(admin,/if\(vehicle\)input\.removeAttribute\('max'\)/);
  assert.match(admin,/q\('workshopRecipeCategoryV1668'\)\.onchange=event=>syncCoinCostLimit\(event\.target\.value\)/);
  assert.match(admin,/차량 제작 코인 비용 상한 없음/);
  assert.match(adminIndex,/workshop-admin-v1668\.js\?v=2028-vehicle-coin-unlimited/);
  assert.match(packageJson,/tests\/workshop-vehicle-coin-cost-v2028\.test\.mjs/);
});

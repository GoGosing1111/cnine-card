import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
for(const code of ['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE']){
  assert.match(api,new RegExp(code));
  assert.match(app,new RegExp(code));
}
assert.match(api,/THEN 0 WHEN i\.code='BLACK_MIRACLE_PACK'/);
assert.match(api,/현재 사용할 수 없는 인벤토리 아이템입니다/);
assert.match(app,/WORKSHOP_ONLY_ITEM_CODES/);
assert.match(app,/제작소 전용/);
assert.match(app,/차량 부품은 제작소에서만 사용할 수 있습니다/);
console.log('workshop parts inventory lock checks passed');

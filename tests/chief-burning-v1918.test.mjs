import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('chief powers restore normal burning, hyper burning, and tower reset limits',async()=>{
  const [api,chief,ui,admin,index,worker]=await Promise.all([
    text('functions/api/[[path]].js'),text('functions/_chief.js'),text('js/chief-system-v1.js'),
    text('admin/chief-admin-v1.js'),text('index.html'),text('service-worker.js')
  ]);
  assert.match(api,/async function activateChiefBurningEvent/);
  assert.match(api,/durationMinutes=isHyper\?60:180/);
  assert.match(api,/runtimeBurningDurationMinutes/);
  assert.match(api,/function chiefBurningEndsAt/);
  assert.match(api,/endsAt:chiefBurningEndsAt\(changedAt,durationMinutes\)/);
  assert.match(api,/activateBurningEvent:activateChiefBurningEvent/);
  assert.match(chief,/period=daily\?kstDate\(now\):String\(a\.id\)/);
  assert.match(chief,/burningPerDay:2/);
  assert.match(chief,/hyperPerDay:1/);
  assert.match(chief,/오늘의 족장 버닝 권한 2회를 모두 사용했습니다/);
  assert.match(chief,/오늘의 족장 하이퍼 버닝 권한을 이미 사용했습니다/);
  assert.match(chief,/CHIEF_BURNING_ACTIVATE/);
  assert.match(chief,/CHIEF_HYPER_BURNING_ACTIVATE/);
  assert.match(ui,/powerButton\('BURNING'/);
  assert.match(ui,/powerButton\('HYPER'/);
  assert.match(ui,/burningToday>=burningLimit/);
  assert.match(ui,/hyperToday>=hyperLimit/);
  assert.match(admin,/오늘 족장 버닝/);
  assert.match(admin,/오늘 족장 하이퍼/);
  assert.match(index,/chief-system-v1\.js\?v=1919-chief-powers-restored/);
  assert.match(worker,/soop-card-shell-v1939-advancement-awakening/);
});

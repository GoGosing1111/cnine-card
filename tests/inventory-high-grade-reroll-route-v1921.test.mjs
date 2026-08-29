import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('inventory reroll ticket loads its feature and never falls through to premium cube',async()=>{
  const [app,index,worker]=await Promise.all([text('js/app.js'),text('index.html'),text('service-worker.js')]);
  assert.match(app,/\['dex','inventory'\]\.includes\(tab\)\?'dexTools'/);
  assert.match(app,/\['battle','pvp','clan','dex','inventory'\]\.includes\(tab\)/);
  assert.match(app,/if\(itemCode==='HIGH_GRADE_REROLL_TICKET'\)\{[\s\S]*?await ensureFeatureResources\('dexTools'\);[\s\S]*?return window\.HighGradeReroll\.open\(\);[\s\S]*?catch\(error\)/);
  assert.doesNotMatch(app,/cubeItems\[itemCode\]\|\|cubeItems\.PREMIUM_CUBE/);
  assert.match(app,/if\(!reroll&&!cubeMeta\)\{alert\('이 아이템의 사용 화면을 찾을 수 없습니다\.'/);
  assert.match(index,/js\/app\.js\?v=1921-inventory-reroll-route/);
  assert.match(worker,/soop-card-shell-v1921-inventory-reroll-route/);
});

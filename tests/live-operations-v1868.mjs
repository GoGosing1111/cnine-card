import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('acquisition crawls are retired from the loaded store and lobby surfaces',async()=>{
  const [app,shell]=await Promise.all([
    load('js/app.js'),
    load('js/soopketmon-v21-exact-shell-adapter.js')
  ]);
  const loaded=`${app}\n${shell}`;
  assert.doesNotMatch(loaded,/acquisitionFeedsHtml|highGradeTrack|equipmentAcquisitionTrack|feeds=1/);
  assert.doesNotMatch(loaded,/LIVE DROP|LIMITED 등급 이상 획득 소식|신화 장비 획득 소식/);
  assert.doesNotMatch(app,/apiRequest\(['"]recent-(?:high-grade|equipment)/);
  assert.match(app,/function storeOperationsHtml\(\)/);
  assert.match(shell,/liveOperationsHtml\('lobby-pc'\)/);
  assert.match(shell,/liveOperationsHtml\('lobby-mobile'\)/);
});

test('five actionable live operation states share one cached aggregate endpoint',async()=>{
  const [api,app]=await Promise.all([load('functions/api/[[path]].js'),load('js/app.js')]);
  for(const kind of ['TERRITORY','SIEGE','SEAL','AUCTION','RAID']){
    assert.match(api,new RegExp(`SELECT '${kind}' kind`));
    assert.match(app,new RegExp(`${kind}:\\{label:`));
  }
  for(const table of ['territory_war_v3_rounds','monster_siege_events','seal_battle_events','auctions_v1553','raid_instances'])assert.match(api,new RegExp(table));
  assert.match(api,/WITH[\s\S]*SELECT \* FROM territory UNION ALL SELECT \* FROM siege UNION ALL SELECT \* FROM seal[\s\S]*UNION ALL SELECT \* FROM auction UNION ALL SELECT \* FROM raid ORDER BY sort_order/);
  assert.match(api,/LIVE_OPERATIONS_CACHE_MS=15000/);
  assert.doesNotMatch(api,/json_valid\([^)]*\)\s*=\s*1/);
  assert.doesNotMatch(api,/json_extract\([^)]*\)\s*,?\s*0?\)\s*=\s*[01]/);
  assert.match(api,/LOWER\(CAST\(json_extract\(m\.value,'\$\.enabled'\) AS TEXT\)\) IN \('1','true'\)/);
  assert.match(api,/path==='live-operations'&&request\.method==='GET'/);
  assert.match(api,/r\.status IN \('RECRUITING','PREPARING','ACTIVE'\)/);
  assert.match(api,/CASE r\.status WHEN 'RECRUITING' THEN 'FORMATION' WHEN 'PREPARING' THEN 'PREPARING' ELSE 'BATTLE' END phase/);
  assert.match(api,/실시간 전선 공성 진행 중/);
  assert.match(api,/public, max-age=10, stale-while-revalidate=20/);
  assert.match(api,/path==='recent-high-grade'[\s\S]{0,120}items:\[\],retired:true,replacement:'live-operations'/);
  assert.match(api,/path==='recent-equipment'[\s\S]{0,120}items:\[\],retired:true,replacement:'live-operations'/);
  assert.doesNotMatch(api,/recentHighGradeCache|recentEquipmentFeedCache/);
  assert.match(app,/loadLiveOperations\(true\)/);
  assert.match(app,/if\(key==='AUCTION'\)\{renderShell\('auction'\);return\}/);
  assert.match(app,/window\.openTerritoryWar/);
  assert.match(app,/window\.openMonsterSiege/);
});

test('operation board ships desktop and mobile game UI with cache-busted assets',async()=>{
  const [css,index,worker,shell]=await Promise.all([
    load('css/live-operations-v1868.css'),
    load('index.html'),
    load('service-worker.js'),
    load('js/soopketmon-v21-exact-shell-adapter.js')
  ]);
  assert.match(css,/\.live-operations-store/);
  assert.match(css,/\.pc-lobby-scene > \.live-operations-lobby-pc/);
  assert.match(css,/\.mobile-command-lobby > \.live-operations-lobby-mobile/);
  assert.match(css,/@media \(max-width: 759px\)/);
  assert.match(css,/overflow-x: auto/);
  assert.match(css,/grid-auto-columns: minmax\(300px, 1fr\)/);
  assert.match(css,/grid-auto-columns: minmax\(252px, 78vw\)/);
  assert.match(index,/live-operations-v1868\.css\?v=1868-live-operations-r2/);
  assert.match(index,/app\.js\?v=2031-prison-community/);
  assert.match(index,/soopketmon-v21-exact-shell-adapter\.js\?v=21\.20\.0-treasury/);
  assert.match(worker,/soop-card-shell-v2031-prison-community/);
  assert.match(shell,/const VERSION = '21\.20\.0'/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const load=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('compact boards show every operation except clan and duo, and each count matches its list',async()=>{
  const app=await load('js/app.js');
  const render=app.slice(app.indexOf('function renderLiveOperations('),app.indexOf('function scheduleLiveOperationsRefresh('));
  const counters=[{},{},{}];
  const lists=['lobby','','all'].map((view,index)=>({
    dataset:{liveOperationsList:view}, contains:()=>false, querySelectorAll:()=>[],
    closest:()=>({querySelector:()=>counters[index]})
  }));
  const counts=()=>counters.map(counter=>counter.textContent);
  const context={
    document:{querySelectorAll:()=>lists},
    window:{},runtimeCommandContext:'buy',LIVE_OPERATION_META:{ORGANIZATION:{},RANKED_DUO:{},SEAL:{},RAID:{},TERRITORY:{},AUCTION:{},COUP:{},ORGANIZATION_FACTION:{}},
    liveOperationTimestamp:Date.parse,liveOperationsServerOffset:0,
    bindLiveOperationsControls(){},syncTerritoryDraftNotice(){},syncOrganizationStartNotice(){},updateLiveOperationClocks(){},
    liveBurningOperationHtml:()=>'',liveRankExpPotionHtml:()=>'',liveOperationCardHtml:item=>item.kind+' '
  };
  const renderBoard=runInNewContext(render+'; renderLiveOperations',context);
  const serverNow='2026-11-10T12:00:00Z';
  const evergreen=[{kind:'ORGANIZATION',deadlineAt:null},{kind:'RANKED_DUO',deadlineAt:'2026-11-10T12:01:00Z'}];
  const long={kind:'SEAL',deadlineAt:'2026-11-12T12:00:00Z'},short={kind:'RAID',deadlineAt:'2026-11-10T13:00:00Z'};
  const waiting={kind:'TERRITORY',phase:'DRAFT_WAIT',deadlineAt:'2026-11-11T12:00:00Z'};
  const featured=[long,short,waiting,{kind:'AUCTION'},{kind:'COUP'},{kind:'ORGANIZATION_FACTION'}];
  renderBoard({serverNow,items:[...evergreen,...featured]});
  const compact='SEAL RAID TERRITORY AUCTION COUP ORGANIZATION_FACTION ';
  assert.deepEqual(lists.map(list=>list.innerHTML),[compact,compact,'ORGANIZATION RANKED_DUO '+compact]);
  assert.deepEqual(counts(),['진행 5건 · 대기 1건','진행 5건 · 대기 1건','진행 7건 · 대기 1건']);
  renderBoard({serverNow,items:[...evergreen,waiting]});
  assert.deepEqual(counts(),['1건 대기','1건 대기','진행 2건 · 대기 1건']);
  renderBoard({serverNow,items:[...evergreen,long]});
  assert.deepEqual(counts(),['1건 진행','1건 진행','3건 진행']);
  renderBoard({serverNow,items:[{kind:'ORGANIZATION',phase:'FORMATION',deadlineAt:'2026-11-15T00:56:36Z'}]});
  assert.deepEqual(lists.map(list=>list.innerHTML),['ORGANIZATION ','ORGANIZATION ','ORGANIZATION ']);
  renderBoard({serverNow,items:evergreen});
  assert.deepEqual(lists.map(list=>list.innerHTML),['','','ORGANIZATION RANKED_DUO ']);
  assert.deepEqual(counts(),['대기 중','대기 중','2건 진행']);
  renderBoard({serverNow,items:[]});
  assert.match(lists[0].innerHTML,/현재 진행 중인 주요 콘텐츠 없음/);
  context.liveBurningOperationHtml=()=>'버닝 ';
  context.liveRankExpPotionHtml=()=>'경험치 물약 ';
  renderBoard({serverNow,items:evergreen});
  assert.deepEqual(lists.map(list=>list.innerHTML),['버닝 경험치 물약 ','버닝 경험치 물약 ','버닝 경험치 물약 ORGANIZATION RANKED_DUO ']);
  assert.deepEqual(counts(),['2건 진행','2건 진행','4건 진행']);
});

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

test('remaining actionable live operation states share one cached aggregate endpoint',async()=>{
  const [api,app]=await Promise.all([load('functions/api/[[path]].js'),load('js/app.js')]);
  for(const kind of ['TERRITORY','SEAL','AUCTION','RAID']){
    assert.match(api,new RegExp(`SELECT '${kind}' kind`));
    assert.match(app,new RegExp(`${kind}:\\{label:`));
  }
  for(const table of ['territory_war_v3_rounds','seal_battle_events','auctions_v1553','raid_instances'])assert.match(api,new RegExp(table));
  assert.match(api,/WITH[\s\S]*SELECT \* FROM territory UNION ALL[\s\S]*?\$\{upcomingTerritoryScheduleSql\}[\s\S]*?UNION ALL SELECT \* FROM seal[\s\S]*UNION ALL SELECT \* FROM auction UNION ALL SELECT \* FROM raid ORDER BY sort_order/);
  assert.match(api,/LIVE_OPERATIONS_CACHE_MS=15000/);
  assert.doesNotMatch(api,/json_valid\([^)]*\)\s*=\s*1/);
  assert.doesNotMatch(api,/json_extract\([^)]*\)\s*,?\s*0?\)\s*=\s*[01]/);
  assert.match(api,/LOWER\(CAST\(json_extract\(m\.value,'\$\.enabled'\) AS TEXT\)\) IN \('1','true'\)/);
  assert.match(api,/path==='live-operations'&&request\.method==='GET'/);
  assert.match(api,/r\.status IN \('RECRUITING','PREPARING','ACTIVE'\)/);
  assert.match(api,/CASE r\.status WHEN 'RECRUITING' THEN 'FORMATION' WHEN 'PREPARING' THEN 'PREPARING' ELSE 'BATTLE' END END phase/);
  for(const phase of ['DRAFT_WAIT','DRAFT_READY','DRAFT_BATTLE'])assert.ok(api.includes(phase));
  assert.match(api,/실시간 전선 공성 진행 중/);
  assert.match(api,/public, max-age=10, stale-while-revalidate=20/);
  assert.match(api,/path==='recent-high-grade'[\s\S]{0,120}items:\[\],retired:true,replacement:'live-operations'/);
  assert.match(api,/path==='recent-equipment'[\s\S]{0,120}items:\[\],retired:true,replacement:'live-operations'/);
  assert.doesNotMatch(api,/recentHighGradeCache|recentEquipmentFeedCache/);
  assert.match(app,/loadLiveOperations\(true\)/);
  assert.match(app,/if\(key==='AUCTION'\)\{renderShell\('auction'\);return\}/);
  assert.match(app,/window\.openTerritoryWar/);
  assert.doesNotMatch(app,/openMonsterSiege/);
  assert.doesNotMatch(api,/monster_siege_events/);
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
  const appUrl=new URL(index.match(/src="(js\/app\.js\?[^\"]+)"/)[1].replaceAll('&amp;','&'),'https://example.test');
  const shellUrl=new URL(index.match(/src="(js\/soopketmon-v21-exact-shell-adapter\.js\?[^\"]+)"/)[1].replaceAll('&amp;','&'),'https://example.test');
  assert.ok(appUrl.searchParams.get('v'));
  assert.ok(worker.includes(`soop-card-shell-v${appUrl.searchParams.get('v')}`));
  assert.equal(shellUrl.searchParams.get('v'),'2108-shared-navigation');
  assert.match(shell,/const VERSION = '2108-shared-navigation'/);
});

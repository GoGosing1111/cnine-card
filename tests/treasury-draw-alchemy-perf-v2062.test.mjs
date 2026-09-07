// V2062: 세금징수·뽑기·연금술 조회 최적화 및 재화 경로 캐시 정합성 검증.
// 실제 핸들러에 목 D1 을 연결해 DB API 호출 수를 센다. 운영 응답 시간 실측은 아니다.
// 미사용 ledger 제거 외 응답 계약과 유저별 최신 조회를 함께 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cacheRuntimeData } from '../functions/_runtime_data_cache.js';

const read = path => fs.readFileSync(path, 'utf8');

// ---------------------------------------------------------------- 목 D1
// prepare() 한 문장을 1왕복으로, batch() 를 통째로 1왕복으로 센다.
function createMockDb(responder) {
  const log = { statements: [], roundTrips: 0, batches: 0 };
  const makeStatement = sql => ({
    sql,
    bindings: [],
    bind(...values) { this.bindings = values; return this; },
    async first() { log.statements.push(sql); log.roundTrips += 1; return responder(sql, this.bindings, 'first'); },
    async all() { log.statements.push(sql); log.roundTrips += 1; return { results: responder(sql, this.bindings, 'all') ?? [] }; },
    async run() { log.statements.push(sql); log.roundTrips += 1; return { meta: { changes: 1 } }; }
  });
  const db = {
    dialect: 'sqlite',
    prepare: sql => makeStatement(String(sql)),
    async batch(statements) {
      log.roundTrips += 1;
      log.batches += 1;
      return statements.map(statement => {
        log.statements.push(statement.sql);
        const rows = responder(statement.sql, statement.bindings, 'batch');
        return { results: Array.isArray(rows) ? rows : rows ? [rows] : [], meta: { changes: 1 } };
      });
    }
  };
  return { db, log };
}

const countMatching = (log, pattern) => log.statements.filter(sql => pattern.test(sql)).length;

// ---------------------------------------------------------------- 연금술
async function runAlchemyState({ calls = 1 } = {}) {
  const alchemy = await import('../functions/_alchemy.js');
  const { db, log } = createMockDb((sql, bindings, mode) => {
    // 설정 키는 공개 모드 JSON, 나머지 app_meta 마커는 완료('1')로 응답한다.
    if (/FROM app_meta/.test(sql)) {
      return String(bindings[0] || '').includes('settings')
        ? { value: JSON.stringify({ mode: 'PUBLIC' }) }
        : { value: '1' };
    }
    if (/MIN\(total_power\)/.test(sql) || /MIN\(score\)/.test(sql)) return { min: 0, max: 1000 };
    if (/FROM alchemy_reward_pool_v1 p/.test(sql)) return [];
    if (/FROM user_cards uc/.test(sql)) return [];
    if (/FROM user_equipment_instances x JOIN/.test(sql)) return [];
    if (/total_runs,stability/.test(sql)) return { total_runs: 3, stability: 1 };
    if (/FROM user_garage_vehicles/.test(sql)) return [];
    return mode === 'all' ? [] : null;
  });
  const env = { DB: db, RUNTIME_DB_CACHE_SCOPE: {} };
  const deps = {
    authenticate: async () => ({ id: 1, nickname: '검증', role: 'OWNER' }),
    readBody: async () => ({}),
    json: data => ({ __json: data }),
    requirePermission: async () => null,
    writeAdminLog: async () => {}
  };
  let last = null, lastCallTrips = 0;
  for (let index = 0; index < calls; index += 1) {
    const before = log.roundTrips;
    last = await alchemy.handleAlchemy({
      path: 'alchemy/state',
      request: { method: 'GET' },
      env,
      deps
    });
    lastCallTrips = log.roundTrips - before;
  }
  return { log, response: last?.__json ?? null, lastCallTrips };
}

test('연금술 state: 강도범위 집계가 요청당 한 벌만 나간다', async () => {
  const { log, response } = await runAlchemyState();
  // 패치 전에는 rewardPool 내부 호출 + userState 직접 호출로 3쿼리 × 2회 = 6회였다.
  const boundsQueries = countMatching(log, /MIN\(total_power\)|MIN\(score\)/);
  assert.equal(boundsQueries, 3, `강도범위 집계가 ${boundsQueries}회 실행됐습니다 (3회여야 함)`);
  assert.equal(countMatching(log, /FROM alchemy_reward_pool_v1 p/), 1, '보상 풀 조회는 1회여야 합니다');
  assert.ok(response && Array.isArray(response.assets), '정상 응답 형태를 유지해야 합니다');
  assert.ok(response.scoring?.equipmentPowerBounds, 'bounds 가 응답에 그대로 실려야 합니다');
});

test('연금술 state: 두 번째 요청은 카탈로그를 다시 읽지 않는다 (아이솔레이트 캐시)', async () => {
  const { log, lastCallTrips } = await runAlchemyState({ calls: 2 });
  assert.equal(lastCallTrips,4,'워밍 후 목 DB 호출은 4회');
  assert.equal(countMatching(log, /MIN\(total_power\)|MIN\(score\)/), 3, '카탈로그 집계는 캐시되어 총 3회여야 합니다');
  assert.equal(countMatching(log, /FROM alchemy_reward_pool_v1 p/), 1, '보상 풀도 캐시되어 총 1회여야 합니다');
  // 유저별 데이터는 매번 다시 읽어야 한다.
  assert.equal(countMatching(log, /FROM user_cards uc/), 2, '유저 보유 카드는 캐시하면 안 됩니다');
});

// ---------------------------------------------------------------- 재정금고
async function runTreasuryState({ calls = 1 } = {}) {
  const treasury = await import('../functions/_administration_treasury.js');
  const { db, log } = createMockDb((sql, bindings, mode) => {
    if (/FROM administration_treasury_v2030 WHERE id=1/.test(sql)) {
      return { id: 1, balance: 1000, total_collected: 1000, total_disbursed: 0, total_refunded: 0, reserve_bps: 2000, version: 1 };
    }
    if (/FROM app_meta/.test(sql)) return { value: JSON.stringify({ active: false }) };
    if (/clan_season_settlements/.test(sql)) return null;
    if (/coin_prediction_events/.test(sql)) return [];
    if (/administration_budget_proposals_v2030/.test(sql)) return [];
    if (/administration_tax_receipts_v2030/.test(sql)) return [];
    return mode === 'all' ? [] : null;
  });
  const env = { DB: db, RUNTIME_DB_CACHE_SCOPE: {} };
  const deps = {
    authenticate: async () => ({ id: 1, nickname: '검증', role: 'USER' }),
    readBody: async () => ({}),
    json: data => ({ __json: data })
  };
  let last = null, lastCallTrips = 0;
  for (let index = 0; index < calls; index += 1) {
    const before = log.roundTrips;
    last = await treasury.handleAdministrationTreasury({
      path: 'administration/treasury/state',
      request: { method: 'GET' },
      env,
      deps
    });
    lastCallTrips = log.roundTrips - before;
  }
  return { log, response: last?.__json ?? null, lastCallTrips };
}

test('재정금고 state: 아무도 렌더링하지 않던 원장 풀스캔이 사라졌다', async () => {
  const { log, response } = await runTreasuryState();
  assert.equal(countMatching(log, /SELECT \* FROM administration_treasury_ledger_v2030/), 0, '원장 조회가 남아 있습니다');
  assert.ok(response && response.ok, '정상 응답이어야 합니다');
  assert.equal(response.ledger, undefined, 'ledger 필드는 더 이상 응답에 없어야 합니다');
  // 응답의 나머지 계약은 그대로다.
  for (const key of ['policy', 'account', 'access', 'chief', 'champion', 'events', 'limits', 'proposals', 'sources']) {
    assert.ok(key in response, `${key} 필드가 유지되어야 합니다`);
  }
});

test('재정금고 state: 두 번째 폴링은 전역 조회를 다시 하지 않는다', async () => {
  const { log, lastCallTrips } = await runTreasuryState({ calls: 2 });
  assert.equal(lastCallTrips,3,'워밍 후 목 DB 호출은 3회');
  assert.equal(countMatching(log, /clan_season_settlements/), 1, '챔피언 조회는 캐시되어야 합니다');
  assert.equal(countMatching(log, /coin_prediction_events/), 1, '승부예측 이벤트 조회는 캐시되어야 합니다');
  assert.equal(countMatching(log, /administration_tax_receipts_v2030/), 1, '세금 집계는 캐시되어야 합니다');
  // 계정 잔액은 실시간이라 매번 읽어야 한다.
  assert.equal(countMatching(log, /FROM administration_treasury_v2030 WHERE id=1/), 2, '금고 잔액은 캐시하면 안 됩니다');
});

// ---------------------------------------------------------------- 소스 계약
test('소스 계약: 연금술 N+1 루프가 batch 로 바뀌었다', () => {
  const src = read('functions/_alchemy.js');
  const fn = src.slice(src.indexOf('async function selectedEquipmentInstances'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.ok(!/for\s*\([^)]*\)\s*\{[^}]*await env\.DB\.prepare/s.test(body), '루프 안 await 가 남아 있습니다');
  assert.match(body, /await env\.DB\.batch\(/, 'batch 로 묶여야 합니다');
});

test('소스 계약: 연금술 가드 판정이 메인 batch 안에서 처리된다', () => {
  const src = read('functions/_alchemy.js');
  assert.match(src, /statements\.push\(\s*\n\s*env\.DB\.prepare\(`SELECT verified FROM \$\{TABLES\.guards\}/, '가드 SELECT 가 batch 에 없습니다');
  assert.match(src, /const batched=await env\.DB\.batch\(statements\),guard=/, '가드 결과를 batch 반환값에서 읽어야 합니다');
  // batch 밖의 별도 가드 왕복은 남아 있으면 안 된다 (에러 복구 경로 제외).
  const happyPath = src.slice(src.indexOf('  try{\n    // V2062'), src.indexOf('}catch(error){', src.indexOf('  try{\n    // V2062')));
  assert.ok(!/await env\.DB\.prepare\(`SELECT verified/.test(happyPath), '정상 경로에 별도 가드 SELECT 가 남아 있습니다');
});

test('소스 계약: 카탈로그 캐시가 CMS 쓰기에서 무효화된다', () => {
  const src = read('functions/_alchemy.js');
  const invalidations = (src.match(/invalidateAlchemyCatalogCaches\(env\)/g) || []).length;
  assert.ok(invalidations >= 4, `CMS 쓰기 무효화가 ${invalidations}곳뿐입니다 (설정/보상저장/삭제/동기화 4곳 이상 필요)`);
});

test('소스 계약: 뽑기 설정·풀 캐시와 무효화가 짝을 이룬다', () => {
  const magic = read('functions/_magic.js');
  assert.match(magic, /const cached=!fresh&&readRuntimeData\(env,MAGIC_SETTINGS_CACHE_KEY\)/);
  assert.doesNotMatch(magic, /MAGIC_POOL_CACHE_KEY/,'추첨 풀은 캐시하지 않는다');
  assert.equal((magic.match(/invalidateMagicSettingsCache\(env\)/g) || []).length, 3, '설정 저장 2곳 + 정의 1곳이어야 합니다');

  const blackMiracle = read('functions/_black_miracle_pack.js');
  assert.match(blackMiracle, /BM_CATALOG_CACHE_KEY/);
  assert.equal((blackMiracle.match(/UPPER\(rarity\) ?= ?'MYTHIC'/g) || []).length, 2, 'MYTHIC 카탈로그 쿼리는 캐시 함수 안 2개만 남아야 합니다');
  assert.match(blackMiracle, /invalidateRuntimeData\(env, BM_CATALOG_CACHE_KEY\)/);

  const prime = read('functions/_prime_draw.js');
  assert.match(prime, /primeSettingsCacheKey\(product\)/);
  assert.match(prime, /primePoolCacheKey\(product\)/);
  assert.match(prime, /invalidatePrimeDrawCaches\(env,product\)/);

  const vehicle = read('functions/_vehicle_draw.js');
  assert.match(vehicle, /VEHICLE_CATALOG_CACHE_KEY/);
  assert.match(vehicle, /invalidateRuntimeData\(env,VEHICLE_CATALOG_CACHE_KEY\)/);
  assert.match(vehicle, /const \[s,poolRows,ownedResult\]=await Promise\.all\(\[/, '설정·풀·보유목록을 병렬로 받아야 합니다');
});

test('소스 계약: 슈퍼스타팩 릴리스 마커가 메모되고 만료청소가 조건부다', () => {
  const src = read('functions/_superstar_pack.js');
  assert.doesNotMatch(src, /publicReleasePromise/,'진행 중 DB promise를 요청 간 공유하지 않는다');
  assert.match(src, /await runSuperstarPackPublicRelease\(env\);\s*cacheRuntimeData\(env,PUBLIC_RELEASE_KEY,true,60000\)/);
  assert.match(src, /const expireStalePending=\(\)=>env\.DB\.prepare/, '만료청소가 즉시 실행이 아니어야 합니다');
  assert.match(src, /if \(prior\.row && prior\.row\.status === "PENDING"\) \{/, 'PENDING 충돌 시에만 청소해야 합니다');
  assert.match(src, /if \(Number\(expired\.meta\?\.changes \|\| 0\)\) claimed = await claimReceipt\(\)/,'다른 요청번호의 만료 충돌도 복구해야 한다');
});

test('소스 계약: 세금 집계 커버링 인덱스가 스키마에 있다', () => {
  const src = read('functions/_administration_treasury.js');
  assert.match(src, /idx_administration_tax_receipts_stat_v2030 ON \$\{TAX_RECEIPT_TABLE\}\(status,source_type,gross_coin,tax_coin\)/);
  // 원장 기록(쓰기)은 그대로 남아 있어야 한다.
  assert.match(src, /INTO \$\{LEDGER_TABLE\}\(reference_key/, '원장 기록 자체는 유지되어야 합니다');
});

const depsFor = (body={},user={id:1,nickname:'검증',role:'USER'}) => ({
  authenticate:async()=>user, readBody:async()=>body,
  json:(data,status=200)=>({data,status}), writeAdminLog:async()=>{}
});

test('마법 설정: 상태 화면은 재사용하지만 변경된 가격과 OFF는 즉시 다시 읽는다',async()=>{
  const {magicSettings,handleMagic}=await import('../functions/_magic.js');
  let enabled=true,price=1000;
  const {db,log}=createMockDb(()=>({value:JSON.stringify({enabled,drawEnabled:enabled,drawCoinCost:price})}));
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  assert.equal((await magicSettings(env,{fresh:false})).drawCoinCost,1000);
  price=9000;enabled=false;
  assert.equal((await magicSettings(env,{fresh:false})).drawCoinCost,1000,'읽기 전용 표시 캐시');
  assert.equal((await magicSettings(env)).drawCoinCost,9000,'금전·보상 호출의 기본값은 fresh');
  // 다른 아이솔레이트에서 저장된 OFF를 가정: 이 요청의 캐시는 여전히 ON이다.
  cacheRuntimeData(env,'magic:settings',{enabled:true,drawEnabled:true},120000);
  const result=await handleMagic({path:'magic/draw',request:{method:'POST'},env,deps:depsFor()});
  assert.equal(result.status,403);
  assert.equal(log.statements.some(sql=>/UPDATE users|INSERT INTO magic_card_draw_receipts/.test(sql)),false);
});

test('마법카드팩: 이전 풀을 캐시에 넣어도 비활성 카드를 지급하지 않는다',async()=>{
  const {handleMagic}=await import('../functions/_magic.js');
  const {db,log}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:JSON.stringify({enabled:true,packRewards:{magicCardWeight:100,magicCrystalWeight:0,cardShardWeight:0}})};
    if(/FROM cnine_user_inventory/.test(sql))return {quantity:1};
    if(/FROM users/.test(sql))return {magic_crystals:0,card_shards:0};
    return mode==='all'?[]:null;
  });
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  cacheRuntimeData(env,'magic:draw-pool',[{id:99,name:'삭제된 카드',draw_weight:100}],120000);
  const result=await handleMagic({path:'magic/pack/open',request:{method:'POST'},env,deps:depsFor({requestId:'magic-fresh-pool'})});
  assert.equal(result.status,409);
  assert.match(result.data.error,/활성화된 마법카드/);
  assert.equal(countMatching(log,/FROM magic_cards WHERE is_active=1 AND draw_weight>0/),1);
  assert.equal(countMatching(log,/INSERT INTO user_magic_cards|UPDATE cnine_user_inventory SET quantity=quantity-1/),0);
});

test('프라임 구매·개봉: 캐시된 ON 대신 최신 OFF 및 최신 빈 보상 풀을 검사한다',async()=>{
  const {handlePrimeDraw,__primeDrawTest}=await import('../functions/_prime_draw.js');
  let enabled=false;
  const {db,log}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:String(bindings[0]).includes('settings')?JSON.stringify({openEnabled:enabled,shopEnabled:enabled}):'1'};
    if(/FROM cnine_user_inventory/.test(sql))return {quantity:2};
    return mode==='all'?[]:null;
  });
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}},product=__primeDrawTest.PRODUCTS.equipment;
  for(const action of ['purchase','open']){
    cacheRuntimeData(env,`prime:settings:${product.settingsKey}`,{openEnabled:true,shopEnabled:true},120000);
    const result=await handlePrimeDraw({path:`equipment/prime-supply-box/${action}`,request:{method:'POST'},env,deps:depsFor({count:1,requestId:`prime-${action}-fresh`})});
    assert.equal(result.status,423,action);
  }
  enabled=true;
  cacheRuntimeData(env,'prime:pool:equipment',[{id:99,code:'REMOVED',rewardType:'EQUIPMENT',draw_weight:100}],120000);
  const result=await handlePrimeDraw({path:'equipment/prime-supply-box/open',request:{method:'POST'},env,deps:depsFor({count:1,requestId:'prime-pool-fresh'})});
  assert.equal(result.status,503);
  assert.equal(countMatching(log,/FROM prime_equipment_draw_pool_v1985 p JOIN/),1);
  assert.equal(countMatching(log,/INSERT INTO prime_draw_(?:purchase|open)_receipts/),0);
});

test('차량 개봉: 화면 카탈로그 캐시와 추첨 풀을 분리한다',async()=>{
  const {handleVehicleDraw}=await import('../functions/_vehicle_draw.js');
  const {db,log}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:String(bindings[0]).includes('settings')?JSON.stringify({enabled:true}):'1'};
    return mode==='all'?[]:null;
  });
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  const removed=[{id:99,code:'REMOVED',draw_weight:100}];
  cacheRuntimeData(env,'vehicle-draw:pool',removed,120000);
  cacheRuntimeData(env,'vehicle-draw:catalog',{results:removed},120000);
  const result=await handleVehicleDraw({path:'vehicle-draw/open',request:{method:'POST'},env,deps:depsFor({count:1,requestId:'vehicle-fresh-pool'})});
  assert.equal(result.status,503);
  assert.equal(countMatching(log,/WHERE is_active=1 AND is_public=1 AND draw_enabled=1/),1);
  assert.equal(countMatching(log,/INSERT INTO vehicle_draw_receipts/),0);
});

test('블랙미라클: CMS 미리보기 캐시를 실제 개봉에 사용하지 않는다',async()=>{
  const {openBlackMiraclePack}=await import('../functions/_black_miracle_pack.js');
  const {db,log}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:JSON.stringify({enabled:true})};
    if(/FROM cnine_user_inventory/.test(sql))return {quantity:0};
    return mode==='all'?[]:null;
  });
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  cacheRuntimeData(env,'black-miracle:power-catalog',{equipmentRows:[],vehicleRows:[]},120000);
  await assert.rejects(openBlackMiraclePack(env,{userId:1,requestId:'miracle-fresh-pool'}),/보유한 블랙 미라클 팩/);
  assert.equal(countMatching(log,/UPPER\(rarity\)='MYTHIC'/),2);
});

test('연금술: 연성 재료 점수와 보상은 화면 캐시가 아닌 최신 카탈로그로 계산한다',async()=>{
  const {handleAlchemy}=await import('../functions/_alchemy.js');
  const {db,log}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:JSON.stringify({mode:'PUBLIC'})};
    if(/MIN\(total_power\)|MIN\(score\)/.test(sql))return {min:0,max:5000};
    return mode==='all'?[]:null;
  });
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  cacheRuntimeData(env,'alchemy:catalog-strength-bounds',{EQUIPMENT:{min:0,max:1}},120000);
  cacheRuntimeData(env,'alchemy:reward-pool',[],120000);
  const body={requestId:'alchemy-fresh-catalog',inputs:Array.from({length:3},()=>({type:'EQUIPMENT',id:'99'}))};
  const result=await handleAlchemy({path:'alchemy/transmute',request:{method:'POST'},env,deps:depsFor(body)});
  assert.equal(result.status,409,'보유하지 않은 재료는 기존대로 거부');
  assert.equal(countMatching(log,/MIN\(total_power\)|MIN\(score\)/),3);
  assert.equal(countMatching(log,/FROM alchemy_reward_pool_v1 p/),1);
});

test('재정금고: 캐시된 우승 클랜 대신 상신 시점의 최신 우승 클랜을 지급 대상으로 고정한다',async()=>{
  const {handleAdministrationTreasury}=await import('../functions/_administration_treasury.js');
  let saved;
  const {db}=createMockDb((sql,bindings,mode)=>{
    if(/FROM app_meta/.test(sql))return {value:JSON.stringify({id:'chief',userId:1,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString()})};
    if(/FROM users/.test(sql))return {id:1,nickname:'족장',status:'ACTIVE'};
    if(/FROM administration_treasury_v2030/.test(sql))return {balance:100000,reserve_bps:2000};
    if(/clan_season_settlements/.test(sql))return {season_id:2,season_no:2,champion_clan_id:8,clan_name:'새 우승 클랜'};
    if(/COUNT\(\*\) count FROM clan_members/.test(sql))return {count:20};
    return mode==='all'?[]:null;
  });
  const prepare=db.prepare;
  db.prepare=sql=>{
    const statement=prepare(sql);
    if(/INSERT INTO administration_budget_proposals_v2030/.test(sql))statement.run=async()=>{saved=statement.bindings;return {meta:{changes:1}}};
    return statement;
  };
  const env={DB:db,RUNTIME_DB_CACHE_SCOPE:{}};
  cacheRuntimeData(env,'treasury:latest-champion',{seasonId:1,seasonNo:1,clanId:1,clanName:'이전 우승 클랜',memberCount:22},60000);
  const result=await handleAdministrationTreasury({path:'administration/treasury/proposals',request:{method:'POST'},env,deps:depsFor({type:'TOP_CLAN_DIVIDEND',amount:1000,reason:'우승 클랜 보상',requestId:'treasury-fresh-champion'})});
  assert.equal(result.status,200);
  assert.deepEqual(saved.slice(10,13),[2,8,'새 우승 클랜']);
});

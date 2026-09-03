import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {test} from 'node:test';
import {__primeDrawTest,ensurePrimeDrawFoundation} from '../functions/_prime_draw.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('프라임 상품은 신규 코드와 확정 가격·가격 보정 배율을 사용한다',()=>{
  const {equipment,vehicle}=__primeDrawTest.PRODUCTS;
  assert.equal(equipment.itemCode,'PRIME_EQUIPMENT_SUPPLY_BOX');
  assert.equal(equipment.unitPrice,100_000);
  assert.equal(equipment.priceRatio,100);
  assert.equal(vehicle.itemCode,'PRIME_VEHICLE_DRAW_TICKET');
  assert.equal(vehicle.unitPrice,1_000_000);
  assert.equal(vehicle.priceRatio,200);
  assert.notEqual(equipment.itemCode,equipment.legacyItemCode);
  assert.notEqual(vehicle.itemCode,vehicle.legacyItemCode);
});

test('기존 확률을 보존한 독립 스냅샷은 고전투력 항목을 가격 배율만큼 가중한 뒤 100%로 정규화한다',()=>{
  const rows=[
    {id:1,code:'LOW',rarity:'NORMAL',total_power:100,supply_weight:50},
    {id:2,code:'MID',rarity:'RARE',total_power:500,supply_weight:30},
    {id:3,code:'HIGH',rarity:'MYTHIC',total_power:1000,supply_weight:20}
  ];
  const pool=__primeDrawTest.buildBoostedPool(rows,{kind:'equipment',priceRatio:100,weightField:'supply_weight'});
  assert.equal(pool.length,3);
  assert.ok(Math.abs(pool.reduce((sum,row)=>sum+row.drawWeight,0)-100)<1e-5);
  assert.equal(pool.find(row=>row.code==='LOW').boostMultiplier,1);
  assert.equal(pool.find(row=>row.code==='HIGH').boostMultiplier,100);
  assert.ok(pool.find(row=>row.code==='HIGH').drawWeight>20);
  assert.ok(pool.find(row=>row.code==='LOW').drawWeight<50);
  assert.equal(pool.find(row=>row.code==='HIGH').presentation.tier,'CINEMATIC');
});

test('신규 장비·차량은 레거시 열이 아닌 전용 풀 테이블에서만 추첨한다',()=>{
  const source=read('functions/_prime_draw.js');
  assert.match(source,/prime_equipment_draw_pool_v1985/);
  assert.match(source,/prime_vehicle_draw_pool_v1985/);
  assert.match(source,/legacyShared:false/);
  assert.match(source,/JOIN character_equipment_items i ON i\.id=p\.equipment_id/);
  assert.match(source,/JOIN character_garage_items i ON i\.id=p\.garage_id/);
  assert.doesNotMatch(source,/loadPool[\s\S]{0,1000}WHERE[^\n]+supply_enabled=1/);
  assert.doesNotMatch(source,/loadPool[\s\S]{0,1000}WHERE[^\n]+draw_enabled=1/);
});

test('운영 PostgreSQL은 고정 execSchema 경로로 프라임 relation을 실제 생성한다',()=>{
  const source=read('functions/_prime_draw.js'),schema=__primeDrawTest.primeSchemaStatements(true);
  assert.equal(schema.length,6);
  assert.ok(schema.every(statement=>!statement.includes('AUTOINCREMENT')));
  assert.match(schema[0],/equipment_id BIGINT PRIMARY KEY/);
  assert.match(schema[2],/user_id BIGINT NOT NULL/);
  assert.match(schema[2],/total_price BIGINT NOT NULL/);
  assert.match(schema[0],/to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
  assert.match(source,/postgres&&typeof env\.DB\.execSchema==='function'\)await env\.DB\.execSchema\(schema\)/);
  assert.match(source,/else await env\.DB\.batch\(schema\.map\(statement=>env\.DB\.prepare\(statement\)\)\)/);
});

test('PostgreSQL foundation은 상품 DML보다 먼저 execSchema를 완료한다',async()=>{
  const calls=[];
  const statement=source=>({source,values:[],bind(...values){this.values=values;return this},async first(){calls.push(`first:${source}`);return {value:'already-seeded'}},async all(){return {results:[]}},async run(){return {success:true}}});
  const env={DB:{dialect:'postgres',prepare:statement,async execSchema(schema){calls.push(`schema:${schema.length}`)},async batch(rows){calls.push(`batch:${rows.length}`);return []}}};
  await ensurePrimeDrawFoundation(env);
  assert.deepEqual(calls.slice(0,3),['schema:6','batch:4','first:SELECT value FROM app_meta WHERE key=?']);
});

test('레거시 상품은 판매만 잠기고 보유분 개봉 라우트는 남는다',()=>{
  const equipment=read('functions/_equipment.js'),vehicle=read('functions/_vehicle_draw.js');
  assert.match(equipment,/LEGACY_SUPPLY_BOX_SHOP_ENABLED=false/);
  assert.match(equipment,/equipment\/supply-box\/open/);
  assert.match(vehicle,/LEGACY_SHOP_ENABLED=false/);
  assert.match(vehicle,/vehicle-draw\/open/);
  assert.match(vehicle,/보유 중인 팩은 인벤토리에서 계속 개봉/);
});

test('상점과 인벤토리는 신규 상품만 판매하고 1·10·50·최대 500 일괄 개봉을 연결한다',()=>{
  const app=read('js/app.js');
  assert.match(app,/primeDrawShopMarkup\('equipment'\).*primeDrawShopMarkup\('vehicle'\)/);
  assert.doesNotMatch(app,/return `\$\{supplyBoxShopMarkup\(\)\}\$\{vehicleDrawShopMarkup\(\)\}/);
  assert.match(app,/\[1,10,50,limit\]/);
  assert.match(app,/Math\.min\(500/);
  assert.match(app,/equipment\/prime-supply-box\/open/);
  assert.match(app,/vehicle-draw\/prime\/open/);
});

test('OWNER CMS에서 상품 상태·독립 확률·아이템별 특별 연출을 관리한다',()=>{
  const html=read('admin/index.html'),cms=read('admin/prime-draw-admin-v1986.js');
  assert.match(html,/data-view="primedraw"/);
  assert.match(html,/prime-draw-admin-v1986\.css\?v=1986-postgres-cms/);
  assert.match(html,/prime-draw-admin-v1986\.js\?v=1986-postgres-cms/);
  assert.match(cms,/admin\/prime-draw\/status/);
  assert.match(cms,/admin\/prime-draw\/pool/);
  assert.match(cms,/data-prime-weight/);
  assert.match(cms,/data-prime-presentation/);
  assert.match(cms,/data-prime-tier/);
  assert.match(cms,/data-prime-effect/);
  assert.match(cms,/shopEnabled/);
  assert.match(cms,/openEnabled/);
});

test('개봉은 단일 원자 영수증과 WebGL·GSAP 잠금 해제 연출을 사용한다',()=>{
  const backend=read('functions/_prime_draw.js'),fx=read('js/prime-draw-live-v1985.src.js');
  assert.match(backend,/prime_draw_open_receipts_v1985/);
  assert.match(backend,/pool_version/);
  assert.match(backend,/env\.DB\.batch\(/);
  assert.match(fx,/from 'pixi\.js'/);
  assert.match(fx,/from 'gsap'/);
  assert.match(fx,/duration:\.05/);
  assert.match(fx,/pointerdown/);
  assert.match(fx,/setPointerCapture/);
  assert.match(fx,/mountActionButton/);
  assert.match(fx,/this\.master=\.1/);
  assert.doesNotMatch(fx,/OscillatorNode|createOscillator|AudioContext/);
  const bundle=new URL('js/prime-draw-live-v1985.bundle.js',root);
  assert.ok(existsSync(bundle));
  assert.ok(statSync(bundle).size>100_000);
});

import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import test from 'node:test';
import {BATTLE_SUIT_CORE_CATALOG,BATTLE_SUIT_CORE_CODES,VEHICLE_WORKSHOP_PART_CODES,ensureBattleSuitCoreCatalog} from '../functions/_battle_suit_materials.js';
import {__workshopBattleSuitTest} from '../functions/_workshop.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('SUT 원본은 보존하고 슈트 코어 1·2·3을 투명 RGBA PNG로 등록한다',()=>{
  assert.deepEqual(BATTLE_SUIT_CORE_CODES,['SUIT_CORE_1','SUIT_CORE_2','SUIT_CORE_3']);
  assert.deepEqual(BATTLE_SUIT_CORE_CATALOG.map(item=>item.name),['슈트 코어 1','슈트 코어 2','슈트 코어 3']);
  for(let index=1;index<=3;index++){
    assert.ok(existsSync(new URL(`assets/items/SUT${index}.jpeg`,root)),`SUT${index}.jpeg source must remain`);
    const url=new URL(`assets/items/suit-core-${index}-v2004.png`,root),png=readFileSync(url);
    assert.ok(statSync(url).size>100_000,`suit core ${index} must be a production asset`);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),1254);
    assert.equal(png.readUInt32BE(20),1254);
    assert.equal(png[25],6,'PNG must use RGBA color type for transparent inventory rendering');
  }
});

test('슈트 코어와 기존 차량 부품은 MATERIAL 카테고리로 안전하게 업서트된다',async()=>{
  const batched=[];
  const DB={
    prepare(sql){const statement={sql:String(sql),values:[],bind(...values){statement.values=values;return statement},async first(){return null}};return statement},
    async batch(statements){batched.push(...statements);return []}
  };
  await ensureBattleSuitCoreCatalog({DB});
  assert.equal(batched.length,5);
  assert.equal(batched.filter(row=>/INSERT INTO inventory_items/.test(row.sql)).length,3);
  assert.ok(batched.every(row=>!/CREATE TABLE|ALTER TABLE/i.test(row.sql)));
  assert.match(batched[3].sql,/VEHICLE_PART_TIRE/);
  assert.match(batched[3].sql,/category='MATERIAL'/);
  assert.deepEqual(VEHICLE_WORKSHOP_PART_CODES,['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE']);
});

test('4번 설비는 배틀슈트 01을 코어 1·코인·마스터의 별로 10% 제작한다',()=>{
  const {BATTLE_SUIT_RECIPES,CATEGORIES}=__workshopBattleSuitTest;
  assert.ok(CATEGORIES.has('BATTLE_SUIT_CRAFT'));
  assert.equal(BATTLE_SUIT_RECIPES.length,3);
  const [first,second,third]=BATTLE_SUIT_RECIPES;
  assert.deepEqual({equipment:first.equipmentCode,core:first.coreCode,coin:first.coin,stars:first.stars,rate:first.successRate,active:first.active,public:first.public},{equipment:'BATTLE_SUIT_01',core:'SUIT_CORE_1',coin:200_000_000,stars:1_000,rate:10,active:1,public:1});
  assert.deepEqual([second.equipmentCode,third.equipmentCode],['BATTLE_SUIT_02','BATTLE_SUIT_03']);
  assert.deepEqual([second.coreCode,third.coreCode],['SUIT_CORE_2','SUIT_CORE_3']);
  assert.deepEqual([second.active,third.active],[0,0],'future recipes must be provisioned but not exposed');
  assert.deepEqual([second.public,third.public],[0,0]);
});

test('배틀슈트 제작은 기존 원자 제작 영수증을 재사용하고 장비창에 지급한다',()=>{
  const server=read('functions/_workshop.js'),client=read('js/workshop-v1881.js'),css=read('css/workshop-v1881.css'),admin=read('admin/workshop-admin-v1668.js');
  assert.match(server,/WORKSHOP_BATTLE_SUIT_01/);
  assert.match(server,/'BATTLE_SUIT_CRAFT'/);
  assert.match(server,/'BOTH'/);
  assert.match(server,/INSERT INTO user_equipment_instances/);
  assert.match(server,/UPDATE users SET coin=coin-\?/);
  assert.match(server,/item_code='MASTER_STAR'/);
  assert.match(server,/quantity=quantity-\?/);
  assert.match(client,/data-ws-section="BATTLE_SUIT_CRAFT"/);
  assert.match(client,/id="wsBattleSuitCraft"/);
  assert.match(client,/prepareMutationRequest\('battleSuit'/);
  assert.match(client,/paymentType: BATTLE_SUIT_PAYMENT_MODE/);
  assert.match(client,/api\('workshop\/craft'/);
  assert.match(css,/\.ws81-suit-layout/);
  assert.match(admin,/option\('BATTLE_SUIT_CRAFT','배틀슈트 제작'/);
});

test('인벤토리와 프라임 CMS가 같은 코어 카탈로그를 사용하되 풀은 자동 활성화하지 않는다',()=>{
  const api=read('functions/api/[[path]].js'),prime=read('functions/_prime_draw.js'),cms=read('admin/prime-draw-admin-v1986.js');
  assert.match(api,/await ensureBattleSuitCoreCatalog\(env\)/);
  assert.match(prime,/await ensureBattleSuitCoreCatalog\(env\)/);
  assert.match(prime,/inventory_item:map\(inventoryItem,'INVENTORY_ITEM'\)/);
  assert.match(prime,/x\.reward_type='INVENTORY_ITEM'/);
  assert.match(prime,/PRIME_EQUIPMENT_ITEM_CODES\.has\(row\.code\)/);
  assert.match(cms,/<option value="INVENTORY_ITEM">배틀슈트 재료<\/option>/);
  assert.doesNotMatch(prime,/VALUES\([^\n]*SUIT_CORE_[123][^\n]*prime_draw_extra_pool/i);
});

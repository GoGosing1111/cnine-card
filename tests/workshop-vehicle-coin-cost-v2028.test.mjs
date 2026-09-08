import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  WORKSHOP_COIN_COST_MAX,
  VEHICLE_WORKSHOP_COIN_COST_MAX,
  normalizeWorkshopCoinCost,
  __workshopBattleSuitTest
} from '../functions/_workshop.js';

const server=readFileSync(new URL('../functions/_workshop.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin/workshop-admin-v1668.js',import.meta.url),'utf8');
const adminIndex=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const packageJson=readFileSync(new URL('../package.json',import.meta.url),'utf8');
const categories=['VEHICLE','EQUIPMENT_SYNTHESIS','MATERIAL_CRAFT','BATTLE_SUIT_CRAFT'];
const {saveRecipe,paymentFor}=__workshopBattleSuitTest;

function recipeStore(before=null){
  const writes=[];
  const DB={
    prepare(sql){
      const statement={sql,values:[],bind(...values){this.values=values;return this},
        async first(){
          if(/^SELECT \* FROM workshop_recipes_v1668/.test(sql))return before;
          if(/^SELECT 1 FROM (inventory_items|character_equipment_items|character_garage_items)/.test(sql))return {exists:1};
          throw new Error(`Unexpected read: ${sql}`);
        },
        async run(){writes.push(this);return {meta:{last_row_id:77,changes:1}}}
      };
      return statement;
    },
    async batch(statements){return Promise.all(statements.map(statement=>statement.run()))}
  };
  return {DB,writes};
}

test('차량 제작 코인 비용은 기존 10억 상한을 넘겨 저장할 수 있다',()=>{
  assert.equal(VEHICLE_WORKSHOP_COIN_COST_MAX,Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(5_000_000_000,'VEHICLE'),5_000_000_000);
  assert.equal(normalizeWorkshopCoinCost(Number.MAX_SAFE_INTEGER,'VEHICLE'),Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(Number.MAX_SAFE_INTEGER+1_000,'VEHICLE'),Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeWorkshopCoinCost(-1,'VEHICLE'),0);
  assert.match(server,/coinCost=normalizeWorkshopCoinCost\(fixed\?\.coin\?\?raw\.coinCost\?\?raw\.coin_cost,category\)/);
});

test('모든 제작 분류는 10억 제한 없이 안전한 정수 범위로 저장한다',()=>{
  assert.equal(WORKSHOP_COIN_COST_MAX,Number.MAX_SAFE_INTEGER);
  for(const category of categories){
    for(const value of [0,200_000_000,1_000_000_001,5_000_000_000,10_000_000_000,Number.MAX_SAFE_INTEGER]){
      assert.equal(normalizeWorkshopCoinCost(value,category),value,category);
      assert.equal(normalizeWorkshopCoinCost(String(value),category),value,category);
    }
    assert.equal(normalizeWorkshopCoinCost(Number.MAX_SAFE_INTEGER+1_000,category),Number.MAX_SAFE_INTEGER);
    assert.equal(normalizeWorkshopCoinCost(5_000_000_000.9,category),5_000_000_000);
    for(const invalid of [-1,NaN,Infinity,'invalid'])assert.equal(normalizeWorkshopCoinCost(invalid,category),0);
  }
});

test('CMS는 모든 제작 분류에서 코인 입력 max를 제거하고 캐시를 갱신한다',()=>{
  assert.match(admin,/function syncCoinCostLimit\(category\)/);
  assert.match(admin,/q\('workshopRecipeCategoryV1668'\)\.onchange=event=>syncCoinCostLimit\(event\.target\.value\)/);
  assert.match(admin,/제작 코인 비용 상한 없음/);
  const coinInput=admin.match(/<input id="workshopRecipeCoinV1668"[^>]+>/)?.[0];
  assert.ok(coinInput);
  assert.doesNotMatch(coinInput,/\bmax=/);
  assert.match(coinInput,/min="0"/);
  assert.match(coinInput,/readonly aria-readonly/,'canonical recipes must remain read-only');
  const syncSource=admin.match(/function syncCoinCostLimit\(category\)\{[^\n]+/)?.[0];
  assert.ok(syncSource);
  for(const category of categories){
    const input={max:'1000000000',value:'5000000000',min:'0',readOnly:true,removeAttribute(name){delete this[name]}};
    vm.runInNewContext(`${syncSource}\nsyncCoinCostLimit(category);`,{q:()=>input,category});
    assert.equal(input.max,undefined,category);
    assert.equal(input.value,'5000000000');
    assert.equal(input.min,'0');
    assert.equal(input.readOnly,true);
  }
  assert.match(adminIndex,/workshop-admin-v1668\.js\?v=2074-workshop-coin-unlimited/);
  assert.match(packageJson,/tests\/workshop-vehicle-coin-cost-v2028\.test\.mjs/);
});

for(const category of categories)test(`${category}: 신규·수정 저장과 결제에서 50억·100억이 유지된다`,async()=>{
  for(const [id,coinCost] of [[0,5_000_000_000],[77,10_000_000_000]]){
    const store=recipeStore({id:77,code:'WORKSHOP_COIN_CAP_TEST'}),logs=[];
    const outputType=category==='VEHICLE'?'VEHICLE':category==='MATERIAL_CRAFT'?'INVENTORY_ITEM':'EQUIPMENT';
    const recipe={id,code:'WORKSHOP_COIN_CAP_TEST',name:'제작 한도 검증',category,outputType,outputRef:outputType==='INVENTORY_ITEM'?'TEST_ITEM':'42',paymentMode:'BOTH',coinCost,masterStarCost:250,successRate:13.5,materials:[{itemCode:'SUIT_CORE_2',quantity:3}]};
    assert.equal(await saveRecipe({DB:store.DB},{id:1,role:'OWNER'},recipe,{writeAdminLog:async(...args)=>logs.push(args[6])}),77);
    const saved=store.writes.find(row=>/^(INSERT INTO|UPDATE) workshop_recipes_v1668/.test(row.sql));
    assert.ok(saved);
    assert.equal(saved.values[8],coinCost);
    assert.equal(saved.values[9],250,'master star cost must not change');
    assert.equal(saved.values[10],13.5,'success rate must not change');
    assert.equal(logs[0].coinCost,coinCost);
    assert.deepEqual(paymentFor({payment_mode:'BOTH',coin_cost:saved.values[8],master_star_cost:saved.values[9]}),{type:'BOTH',coin:coinCost,stars:250,shards:0});
  }
});

test('제작 상한 해제는 서버 고정 미스틱 에너지 제작비·확률을 바꾸지 않는다',async()=>{
  const store=recipeStore({id:77,code:'WORKSHOP_MYSTIC_ENERGY'}),logs=[];
  await saveRecipe({DB:store.DB},{id:1,role:'OWNER'},{id:77,code:'CHANGED_CODE',name:'미스틱 에너지',coinCost:5_000_000_000,masterStarCost:999,successRate:99},{writeAdminLog:async(...args)=>logs.push(args[6])});
  const saved=store.writes.find(row=>/^UPDATE workshop_recipes_v1668/.test(row.sql));
  assert.equal(saved.values[0],'WORKSHOP_MYSTIC_ENERGY');
  assert.equal(saved.values[8],200_000_000);
  assert.equal(saved.values[9],0);
  assert.equal(saved.values[10],10);
  assert.equal(logs[0].cardShardCost,5_000_000);
  assert.deepEqual(paymentFor({code:'WORKSHOP_MYSTIC_ENERGY',coin_cost:5_000_000_000}),{type:'COIN_AND_CARD_SHARD',coin:200_000_000,stars:0,shards:5_000_000});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {inventoryUiFixture} from './fixtures/inventory-ui-v2125.mjs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
function model(){
  const context=vm.createContext({Intl,Set,escapeHtml:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  const code=app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('let landSuperstarBusy=false;'));
  vm.runInContext(code+';globalThis.inventoryModel={state:inventoryUiState,group:inventoryItemGroup,meta:inventoryItemMeta,visible:inventoryVisibleItems,tile:inventoryItemMarkup,detail:inventoryDetailMarkup};',context);
  return context.inventoryModel;
}
const codes=items=>Array.from(items,item=>item.code);

test('owned filter hides zero counts while preserving server catalog order',()=>{
  const m=model(),items=inventoryUiFixture().items;
  assert.deepEqual(codes(m.visible(items)),codes(items.filter(x=>x.quantity>0)));
  m.state.ownedOnly=false;assert.deepEqual(codes(m.visible(items)),codes(items));
});
test('pack tickets, event tickets and actual admission tickets remain distinct',()=>{
  const m=model();
  for(const item of inventoryUiFixture().items){
    if(['PRIME_VEHICLE_DRAW_TICKET','VEHICLE_DRAW_TICKET'].includes(item.code))assert.equal(m.group(item),'PACK');
    if(['SCRAPYARD_ENTRY_TICKET','CORE_RAID_ENTRY_TICKET'].includes(item.code))assert.equal(m.group(item),'ENTRY_TICKET');
    if(['PINGDU_WISH_TICKET','UNIQUE_ADVANCEMENT_PASS'].includes(item.code))assert.equal(m.group(item),'OTHER');
  }
  assert.equal(m.group({code:'SOOPKETLAND_HYPER_BURNING_TICKET',category:'ENTRY_TICKET'}),'OTHER');
  assert.equal(m.group({code:'FUR_REROLL_TICKET',category:'legacy'}),'REROLL');
  assert.equal(m.group({code:'VEHICLE_PART_ENGINE',category:'legacy'}),'MATERIAL');
});
test('search combines with category/new filters and accepts Korean or item code',()=>{
  const m=model(),items=inventoryUiFixture().items;
  Object.assign(m.state,{filter:'MATERIAL',query:'  슈트 코어 ',newOnly:true});
  assert.deepEqual(codes(m.visible(items)),['SUIT_CORE_5','SUIT_CORE_6']);
  m.state.query='suit_core_6';assert.deepEqual(codes(m.visible(items)),['SUIT_CORE_6']);
  m.state.query='not-an-item';assert.equal(m.visible(items).length,0);
});
test('quantity and rarity sorts are deterministic without mutating the source catalog',()=>{
  const m=model(),items=inventoryUiFixture().items,original=codes(items);
  m.state.sort='QUANTITY';assert.equal(m.visible(items)[0].code,'MASTER_STAR');
  m.state.sort='RARITY';assert.equal(m.visible(items)[0].code,'FUR_REROLL_TICKET');
  m.state.sort='NAME';const list=m.visible(items);for(let i=1;i<list.length;i++)assert.ok(list[i-1].name.localeCompare(list[i].name,'ko')<=0);
  assert.deepEqual(codes(items),original);
});
test('server-disabled items, crafting materials, zero stock and skill chips cannot use inventory actions',()=>{
  const m=model();
  for(const item of inventoryUiFixture().items.filter(x=>x.usable===false||x.quantity===0))assert.match(m.detail(item),/data-inventory-use="[^"]+" disabled/);
  for(const category of ['MATERIAL','SKILL_CHIP'])assert.equal(m.meta({code:'X',quantity:1,category,usable:true}).usable,false);
  for(const usable of [false,0])assert.equal(m.meta({code:'X',quantity:1,usable}).usable,false);
  const item={code:'X',name:'전용권',quantity:1,usable:false,useDisabledMessage:'전용 화면에서만 사용'};
  assert.match(m.detail(item),/전용 화면에서만 사용/);
});
test('large counts stay exact in details and accessibility while tiles compact the visible number',()=>{
  const m=model(),item=inventoryUiFixture().items.find(x=>x.code==='MASTER_STAR');
  assert.match(m.tile(item),/보유 1,234,567,890개/);
  assert.match(m.tile(item),/12\.3억/);
  assert.match(m.detail(item),/1,234,567,890/);
  assert.equal(m.meta(item).quantity,1234567890);
});
test('item names, codes, descriptions and image URLs are escaped before HTML insertion',()=>{
  const m=model(),item={code:'x" autofocus onfocus="alert(1)',name:'<img src=x onerror=alert(1)>',description:'<script>alert(1)</script>',image:'x" onerror="alert(1)',quantity:1};
  for(const html of [m.tile(item),m.detail(item)]){
    assert.ok(!html.includes('<script>'));assert.ok(!html.includes(' onerror="'));assert.ok(!html.includes('" autofocus '));assert.match(html,/&lt;img/);
  }
});
test('all fixture media resolve to real assets and include the released fifth and sixth cores',()=>{
  for(const item of inventoryUiFixture().items){if(item.image)assert.ok(fs.existsSync(new URL('../'+item.image.replace(/^\//,''),import.meta.url)),item.code);}
  assert.ok(inventoryUiFixture().items.some(x=>x.code==='SUIT_CORE_5'));
  assert.ok(inventoryUiFixture().items.some(x=>x.code==='SUIT_CORE_6'));
});

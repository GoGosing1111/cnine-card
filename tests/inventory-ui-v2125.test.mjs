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

test('repair coupons display the approved item artwork and recovery destination without direct consumption',()=>{
  const m=model(),item=inventoryUiFixture().items.find(item=>item.code==='PINGDU_REPAIR_COUPON');
  assert.equal(m.group(item),'MATERIAL');assert.equal(m.meta(item).usable,false);
  assert.match(m.tile(item),/pingdu-repair-coupon-v1\.webp/);assert.match(m.tile(item),/보유 2개/);
  assert.match(m.detail(item),/파괴 기록에서 복구할 장비/);
  assert.match(m.detail(item),/data-inventory-use="PINGDU_REPAIR_COUPON" disabled/);
  m.state.query='핑두 리페어';assert.deepEqual(codes(m.visible(inventoryUiFixture().items)),[item.code]);
  assert.equal(m.visible([{...item,quantity:0}]).length,0);
});

test('owned equipment protection tickets show their art and exact count, remain materials and cannot open as packs',()=>{
  const m=model(),item=inventoryUiFixture().items.find(item=>item.code==='EQUIPMENT_PROTECTION_TICKET');
  assert.equal(m.group(item),'MATERIAL');assert.equal(m.meta(item).usable,false);
  assert.match(m.tile(item),/equipment-protection-ticket-v1\.webp/);assert.match(m.tile(item),/보유 3개/);
  assert.match(m.detail(item),/장비 강화에서 보호권 사용/);assert.match(m.detail(item),/data-inventory-use="EQUIPMENT_PROTECTION_TICKET" disabled/);
  assert.deepEqual(codes(m.visible([item])),[item.code]);assert.equal(m.visible([{...item,quantity:0}]).length,0);
});

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

function recoveryModel(){
  const store=new Map(),opened=[],requests=[],recovery={hidden:true,innerHTML:''},grid={innerHTML:''},dialog={open:false,close(){this.open=false;}};
  const controls={'#inventorySearch':{},'#inventorySort':{},'#inventoryOwnedOnly':{},'#inventoryRefresh':{},'#inventoryDetailDialog':dialog,'#inventoryOwnedSummary':{}};
  const vault={dataset:{},isConnected:true,attributes:{},querySelector:selector=>controls[selector],setAttribute(name,value){this.attributes[name]=value;},getAttribute(name){return this.attributes[name];}};
  const ctx=vm.createContext({Intl,Set,loadUser:()=>({serverUserId:7}),localStorage:{getItem:key=>store.get(key)||null},document:{getElementById:id=>({inventoryVault:vault,inventoryGrid:grid,inventoryGiftRecovery:recovery})[id],querySelector:()=>null},apiRequest:async endpoint=>{requests.push(endpoint);return {items:[{code:'FUNDING_GIFT_BOX',quantity:0}],unseenTotal:0};},openInventoryPack:(...args)=>opened.push(args),clearApiCache:()=>{}});
  vm.runInContext(app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('let landSuperstarBusy=false;'))+';renderInventoryItems=()=>{};',ctx);
  const click=code=>{const button={dataset:{inventoryRecover:code},hasAttribute:()=>false};vault.onclick({target:{closest:()=>button}});};
  return {ctx,store,opened,requests,recovery,vault,click};
}

test('entering and refreshing inventory never opens or submits a pending gift, including zero stock',async()=>{
  const m=recoveryModel(),key='cnine:funding-gift:7:pending';m.store.set(key,'original-receipt');
  await m.ctx.loadInventory();await m.ctx.loadInventory();
  assert.deepEqual(m.opened,[]);assert.deepEqual(m.requests,['inventory','inventory']);assert.equal(m.store.get(key),'original-receipt');
  assert.equal(m.recovery.hidden,false);assert.match(m.recovery.innerHTML,/data-inventory-recover="FUNDING_GIFT_BOX"/);
  m.click('FUNDING_GIFT_BOX');assert.deepEqual(m.opened,[['FUNDING_GIFT_BOX',0]]);
  m.vault.setAttribute('aria-busy','true');m.click('FUNDING_GIFT_BOX');assert.equal(m.opened.length,1);
  m.vault.setAttribute('aria-busy','false');m.store.delete(key);m.click('FUNDING_GIFT_BOX');assert.equal(m.opened.length,1);assert.equal(m.recovery.hidden,true);
});

test('gift recovery only offers the signed-in account receipts and tolerates unavailable storage',async()=>{
  const m=recoveryModel();m.store.set('cnine:funding-gift:8:pending','other-account');
  await m.ctx.loadInventory();assert.equal(m.recovery.hidden,true);assert.deepEqual(m.opened,[]);
  m.store.set('cnine:recruitment-gift:7:pending','recruitment');m.store.set('cnine:tournament-gift:7:pending','tournament');
  await m.ctx.loadInventory();m.click('RECRUITMENT_GIFT_BOX');m.click('TOURNAMENT_GIFT_BOX');
  assert.deepEqual(m.opened,[['RECRUITMENT_GIFT_BOX',0],['TOURNAMENT_GIFT_BOX',0]]);
  m.ctx.localStorage.getItem=()=>{throw Error('blocked storage');};await m.ctx.loadInventory();assert.equal(m.recovery.hidden,true);
});

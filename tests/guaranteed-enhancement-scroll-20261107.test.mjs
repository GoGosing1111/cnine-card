import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge,forgeReceipt,forgeAccountState} from './helpers/forge-held-runtime.mjs';
import {ensureForgeScrollCatalog} from '../functions/_forge_scroll_catalog.js';
import {forgeAdvancedDraft,FORGE_ADVANCED_KEY,GUARANTEED_SCROLL as ticket,FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
import {forgeQuoteShortages} from '../shared/equipment-forge-resources-v1.mjs';
import {registerGuaranteedScroll} from '../scripts/ops/guaranteed-enhancement-scroll-20261107.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
const [weapon,armor]=FORGE_SCROLL_ITEMS.map(x=>x.code),rid=()=>crypto.randomUUID(),neverRoll=()=>{throw Error('A guaranteed enhancement cannot roll');};
async function fixture(t,postgres){
 const f=await forgeFixture(t,{postgres});await ensureForgeScrollCatalog(f.env);
 await f.p('INSERT INTO inventory_items(code,name,image_url) VALUES(?,?,?)',ticket.code,ticket.name,ticket.image).run();
 const advanced=forgeAdvancedDraft();advanced.steps.forEach((s,i)=>Object.assign(s,{successPpm:100000,maintainPpm:0,destroyPpm:900000,coinCost:200+i,itemQuantity:3+i,scrollQuantity:2+i,protectionQuantity:2,powerBonusPercent:140+i*30}));
 await f.setting(FORGE_ADVANCED_KEY,advanced);
 for(const code of [ticket.code,weapon,armor])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,100)',code).run();
 const quote=(extra={})=>forgeQuote(f.env,f.user,{kind:'ENHANCE',instanceId:f.instanceId,requestId:rid(),useGuaranteedScroll:true,...extra});
 const run=(q,id=rid())=>executeForge(f.env,f.user,{requestId:id,quoteId:q.quoteId},'ENHANCE',{randomInt:neverRoll});
 const balances=async()=>({coins:await f.coin(),stars:await f.qty('MASTER_STAR'),ticket:await f.qty(ticket.code),weapon:await f.qty(weapon),armor:await f.qty(armor),protection:await f.qty('FORGE_TEST_PROTECTION')});
 const level=async n=>f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,?,1) ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=equipment_forge_states_v1.revision+1',f.instanceId,n).run();
 return {...f,quote,run,balances,level};
}
for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+': all 15 guaranteed steps preserve ordinary prices, including slot scrolls, stars and equipment power; retries debit once',async t=>{
  const f=await fixture(t,postgres),code=postgres?armor:weapon;
  if(postgres)await f.p("UPDATE character_equipment_items SET code='EMPEROR_TOP',slot='TOP' WHERE id=1").run();
  await f.p("UPDATE cnine_user_inventory SET quantity=1000 WHERE item_code='MASTER_STAR' AND user_id=7").run();
  const start=await f.balances();let stars=0,coins=0,advancedScrolls=0;
  for(let target=1;target<=15;target++){
   const regular=await f.quote({useGuaranteedScroll:false}),q=await f.quote(),id=rid(),c=q.cost;
   assert.deepEqual([c.successPpm,c.maintainPpm,c.destroyPpm],[1000000,0,0]);assert.equal(c.guaranteedScroll.code,ticket.code);assert.equal(c.guaranteedScroll.quantity,1);assert(!regular.cost.guaranteedScroll);
   assert.equal(c.coinCost,regular.cost.coinCost);assert.equal(c.itemQuantity,regular.cost.itemQuantity);assert.equal(c.itemQuantity,(target<=10?2:target-8)*(postgres?2:1));assert.deepEqual(c.scroll,regular.cost.scroll);
   if(target>10){assert.equal(c.scroll.code,code);advancedScrolls+=c.scroll.quantity;}else assert(!c.scroll);
   stars+=c.itemQuantity;coins+=c.coinCost;const r=await f.run(q,id);assert.equal(r.outcome,'SUCCESS');assert.equal(r.level,target);assert.equal(r.guaranteedScroll.code,ticket.code);assert.deepEqual(r.power,q.powerAfter);
   assert.equal((await f.run(q,id)).replayed,true);assert.equal((await forgeReceipt(f.env,f.user,id,'ENHANCE')).level,target);
  }
  await assert.rejects(f.quote,{code:'FORGE_MAX_LEVEL'});
  assert.deepEqual(await f.balances(),{...start,coins:start.coins-coins,stars:start.stars-stars,ticket:start.ticket-15,[postgres?'armor':'weapon']:100-advancedScrolls});
  assert.equal(Number((await f.p('SELECT count(*) n FROM inventory_logs WHERE item_code=? AND change_amount=-1',ticket.code).first()).n),15);
  assert.equal(Number((await f.p('SELECT count(*) n FROM equipment_forge_destroyed_v1').first()).n),0);
 });
 test(engine+': every shortage, absence of ownership and mixed modes fail without charge; ordinary destructive odds remain',async t=>{
  const f=await fixture(t,postgres);await f.level(14);const same=rid();await f.quote({requestId:same,useGuaranteedScroll:false});
  await assert.rejects(()=>f.quote({requestId:same}),{code:'FORGE_QUOTE_CONFLICT'});
  for(const extra of [{kind:'RESTORE',recordId:rid()},{useProtection:true},{useGuaranteedScroll:'true'},{useGuaranteedScroll:null}])await assert.rejects(()=>f.quote(extra),{code:'FORGE_QUOTE'});
  await assert.rejects(()=>f.quote({instanceId:'987654'}),{code:'FORGE_NOT_OWNED'});
  const q=await f.quote(),other={...f.user,id:8};await assert.rejects(()=>executeForge(f.env,other,{requestId:rid(),quoteId:q.quoteId},'ENHANCE'),{code:'FORGE_QUOTE'});
  for(const [field,code] of [['coins',null],['stars','MASTER_STAR'],['weapon',weapon],['ticket',ticket.code]]){
   const before=await f.balances(),set=n=>code?f.p('UPDATE cnine_user_inventory SET quantity=? WHERE user_id=7 AND item_code=?',n,code).run():f.p('UPDATE users SET coin=? WHERE id=7',n).run();await set(0);
   const state=await forgeAccountState(f.env,f.user,{});assert.equal(forgeQuoteShortages(q,state.wallet).length,1);
   await assert.rejects(()=>f.run(q),{code:code?'FORGE_MATERIAL':'FORGE_FUNDS'});assert.deepEqual(await f.balances(),{...before,[field]:0});await set(before[field]);
  }
  const normal=await f.quote({useGuaranteedScroll:false});const destruction=await executeForge(f.env,f.user,{requestId:rid(),quoteId:normal.quoteId},'ENHANCE',{randomInt:()=>999999});assert.equal(destruction.outcome,'DESTROY');assert.equal(await f.qty(ticket.code),100);
 });
 test(engine+': rollback after deductions, retry, stale equipment, deactivation and unreleased steps',async t=>{
  const f=await fixture(t,postgres);await f.level(10);const a=await f.quote(),b=await f.quote(),id=rid(),before=await f.balances();
  f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>f.run(a,id));f.fail('');assert.deepEqual(await f.balances(),before);
  const result=await f.run(a,id);assert.equal(result.level,11);assert.equal((await f.run(a,id)).replayed,true);
  let paid=await f.balances();await assert.rejects(()=>f.run(b),{code:'FORGE_STALE'});assert.deepEqual(await f.balances(),paid);
  const q=await f.quote();await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ticket.code).run();await assert.rejects(f.quote,{code:'FORGE_GUARANTEE_UNAVAILABLE'});await assert.rejects(()=>f.run(q),{code:'FORGE_GUARANTEE_UNAVAILABLE'});assert.deepEqual(await f.balances(),paid);
  await f.setting(FORGE_ADVANCED_KEY,forgeAdvancedDraft());await assert.rejects(f.quote,{code:'FORGE_ADVANCED_PENDING'});
 });
}
test('catalog registration rolls back, registers only one item, and preserves later CMS edits on replay',async t=>{
 const f=await forgeFixture(t,{postgres:true}),client={query:(...args)=>f.pg.query(...args)},expectedDatabase=(await f.pg.query('SELECT current_database() db')).rows[0].db;
 const count=async(sql,...args)=>Number((await f.p(sql,...args).first()).n);
 assert.equal((await registerGuaranteedScroll(client,{expectedDatabase})).dryRun,true);assert.equal(await count('SELECT count(*) n FROM inventory_items WHERE code=?',ticket.code),0);
 const first=await registerGuaranteedScroll(client,{apply:true,expectedDatabase});assert.equal(first.catalogOnly,true);assert.equal(await count('SELECT count(*) n FROM cnine_user_inventory WHERE item_code=?',ticket.code),0);
 await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ticket.code).run();assert((await registerGuaranteedScroll(client,{apply:true,expectedDatabase})).replayed);assert.equal(await count('SELECT count(*) n FROM inventory_items WHERE code=? AND is_active=1',ticket.code),0);assert.equal(await count("SELECT count(*) n FROM admin_logs WHERE action_type='FORGE_SCROLL_CATALOG_ADD'"),1);
});
test('the CMS can pick the scroll without assigning any day; a later month-two award requires its own pass',async t=>{
 const f=await passFixture({postgres:true});t.after(()=>f.close());
 await f.run('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',ticket.code,ticket.name,'SPECIAL',ticket.image);
 const code='INVENTORY_ITEM:'+ticket.code,admin=(await f.call('admin/server-support/pass')).body,row=admin.catalog.find(r=>r.code===code);
 assert(row.available);assert.equal(row.image,'/'+ticket.image);assert(!admin.secondConfig.enabled);assert(admin.secondConfig.days.every(d=>d.rewards.length===0));
 await f.save(f.document([{code:'COIN:',quantity:7}]));await f.grant(2);const doc=f.document([{code,quantity:1}]);doc.title='격리 보상표';
 const save=await f.call('admin/server-support/pass',{body:{month:2,document:doc,expectedRevision:0,requestId:rid()}});assert.equal(save.status,200);
 const state=async()=>(await f.call('server-support/info',{user:2})).body;
 const claim=pass=>f.call('server-support/pass/claim',{user:2,body:{month:2,cycle:pass.cycle,day:1,expectedRevision:pass.revision}});
 let info=await state();assert.equal((await claim(info.seasonPass)).status,403);
 const purchase=await f.call('admin/server-support',{body:{userId:2,month:2,action:'GRANT',note:'격리 결제 확인',expectedRevision:info.subscription.revision,requestId:rid()}});assert.equal(purchase.status,200);
 info=await state();assert.equal((await claim(info.secondSeasonPass)).status,200);await claim(info.secondSeasonPass);
 assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',ticket.code)).quantity),1);
});

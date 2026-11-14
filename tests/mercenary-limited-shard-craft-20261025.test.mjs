import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {LIMITED_SHARD_CRAFTS,LIMITED_CRAFT_SHARD} from '../shared/mercenary-limited-shard-craft-v1.mjs';
import {MERCENARY_CRAFTS,mercenaryCraftDraft,validateMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {decorateMercenaryCraft,readMercenaryCraft,readMercenaryCraftStock,saveMercenaryCraft} from '../functions/_mercenary_craft.js';
import {addLimitedShardCraftStock} from '../functions/_mercenary_craft_stock.js';
import {scheduleLimitedCraftStock,processLimitedCraftStockSchedules} from '../functions/_mercenary_craft_stock_schedule.js';
import {__workshopCraftTest,handleWorkshop} from '../functions/_workshop.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';

const ordinary='MERCENARY_SSS_CARD_SHARD',def=code=>LIMITED_SHARD_CRAFTS.find(d=>d.code===code);
const raw=(d,extra={})=>({code:d.recipeCode,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:d.code,outputQuantity:1,paymentMode:'BOTH',craftRevision:0,...mercenaryCraftDraft(d),...extra});
async function fixture(t,postgres=false){
 const f=await equipmentFixture(t,postgres);await ensureLimitedPackSchema(f.env);
 for(const code of [ordinary,LIMITED_CRAFT_SHARD]){
  await f.p("INSERT INTO inventory_items(code,name,category,is_active) VALUES(?,?,'MATERIAL',1)",code,code).run();
  for(const id of [7,8])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,100,100)',id,code).run();
 }
 const save=(d,extra={})=>saveMercenaryCraft(f.env,f.user,raw(d,{coinCost:100,masterStarCost:1,successRate:100,materials:[{itemCode:LIMITED_CRAFT_SHARD,quantity:1}],isActive:true,isPublic:true,...extra}));
 const craft=(id,requestId=crypto.randomUUID(),user=f.user)=>__workshopCraftTest.craft(f.env,user,{recipeId:id,requestId,paymentType:'BOTH'});
 const stock=d=>readMercenaryCraftStock(f.env,d);
 const balance=async(id=7)=>({coin:await f.coin(id),inventory:(await f.p('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code',id).all()).results});
 const add=(d,revision,requestId=crypto.randomUUID(),user=f.user)=>addLimitedShardCraftStock(f.env,user,{code:d.recipeCode,expectedRevision:revision,requestId});
 return {...f,save,craft,stock,balance,add};
}

test('registered SSS LIMITED recipes have separate five-slot drafts, null costs/rates, required shards and no implicit publication or writes',async t=>{
 const f=await fixture(t),before=await f.balance(),prepare=f.env.DB.prepare.bind(f.env.DB);let queries=0;
 f.env.DB.prepare=(...args)=>{queries++;return prepare(...args);};
 const rows=await decorateMercenaryCraft(f.env,[],{admin:true});assert.equal(queries,3);f.env.DB.prepare=prepare;
 assert.equal(rows.length,MERCENARY_CRAFTS.length);assert.equal(new Set(rows.map(r=>r.id)).size,MERCENARY_CRAFTS.length);
 for(const d of LIMITED_SHARD_CRAFTS){
  const row=rows.find(r=>r.code===d.recipeCode);assert.equal(row.output_rarity,'SSS LIMITED');assert.equal(row.is_active,0);assert.equal(row.is_public,0);
  assert.equal(row.coin_cost,null);assert.equal(row.master_star_cost,null);assert.equal(row.success_rate,null);assert.equal(row.materials[0].quantity,null);
  assert.equal(row.materials[0].item_code,LIMITED_CRAFT_SHARD);assert.deepEqual(row.craftStock,{limit:5,crafted:0,remaining:5,soldOut:false});
  await assert.rejects(f.craft(row.id),/잠금/);
 }
 const publicRows=await decorateMercenaryCraft(f.env,[]);assert(publicRows.every(r=>r.code==='WORKSHOP_PRIME_REQUIEM'&&r.craftLocked));assert.deepEqual(await f.balance(),before);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM app_meta WHERE key LIKE 'mercenary_limited_shard_craft_v1:%'").first()).n),0);
});

test('incomplete settings stay locked; mandatory LIMITED material cannot be removed, swapped or mixed with ordinary shards',async t=>{
 const f=await fixture(t),d=def('V-978');
 const id=await saveMercenaryCraft(f.env,f.user,raw(d));assert.equal(id,d.draftId);
 for(const field of ['coinCost','masterStarCost','successRate'])await assert.rejects(f.save(d,{craftRevision:1,[field]:null}),/잠금/);
 for(const materials of [[],[{itemCode:ordinary,quantity:1}],[{itemCode:LIMITED_CRAFT_SHARD,quantity:null}],[{itemCode:LIMITED_CRAFT_SHARD,quantity:1},{itemCode:ordinary,quantity:1}]])await assert.rejects(f.save(d,{craftRevision:1,materials}));
 await assert.rejects(f.save(MERCENARY_CRAFTS[0]),/별도 전용/);
 await assert.rejects(saveMercenaryCraft(f.env,{...f.user,role:'ADMIN'},raw(d)),/OWNER/);
 for(const stockLimit of [0,1,6,1000005])assert.throws(()=>validateMercenaryCraft({...mercenaryCraftDraft(d),stockLimit},d));
 const saved=await f.save(d,{craftRevision:1,stockLimit:1000});assert(saved>0);assert.equal((await f.stock(d)).limit,5);
});

for(const postgres of [false,true])test(`+5 is OWNER-only, audited, replay-safe and independent of costs / existing issues (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
 const f=await fixture(t,postgres),d=def('V-988'),id=await f.save(d);await f.craft(id);
 const before=await f.balance(),policy=(await readMercenaryCraft(f.env,d)).policy,requestId=crypto.randomUUID();
 await assert.rejects(f.add(d,1,requestId,{id:8,role:'ADMIN'}),/OWNER/);
 await assert.rejects(f.add(MERCENARY_CRAFTS[0],0),/전용/);
 const added=await f.add(d,1,requestId);assert.equal(added.added,5);assert.equal(added.limit,10);assert.equal((await f.stock(d)).crafted,1);
 const replay=await f.add(d,1,requestId);assert.equal(replay.replayed,true);assert.equal((await f.stock(d)).limit,10);
 await assert.rejects(f.add(d,2,requestId),/다른 추가/);await assert.rejects(f.add(d,1),/변경/);
 const next=(await readMercenaryCraft(f.env,d)).policy;assert.deepEqual({...next,revision:policy.revision,stockLimit:policy.stockLimit},policy);
 assert.deepEqual(await f.balance(),before);assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_LIMITED_SHARD_STOCK_ADD'").first()).n),1);
 await f.save(d,{craftRevision:2});assert.equal((await f.stock(d)).limit,10,'saving costs must preserve the added cap');
});

test('simultaneous +5 calls apply once per revision and a lost response retries the same receipt',async t=>{
 const f=await fixture(t),d=def('V-979'),requestId=crypto.randomUUID();
 const same=await Promise.all([f.add(d,0,requestId),f.add(d,0,requestId)]);assert.equal(same.filter(r=>r.replayed).length,1);assert.equal((await f.stock(d)).limit,10);
 const distinct=await Promise.allSettled([f.add(d,1),f.add(d,1)]);assert.equal(distinct.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.stock(d)).limit,15);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_LIMITED_SHARD_STOCK_ADD'").first()).n),2);
});

test('stock audit failure rolls back the increase and receipt; retry adds exactly five',async t=>{
 const f=await fixture(t,true),d=def('V-999'),requestId=crypto.randomUUID();f.fail('INSERT INTO admin_logs');
 await assert.rejects(f.add(d,0,requestId),/INJECTED_FAILURE/);f.fail('');assert.equal((await f.stock(d)).limit,5);
 assert.equal((await f.add(d,0,requestId)).limit,10);assert.equal((await readMercenaryCraft(f.env,d)).policy.isActive,false);
});

test('ordinary craft / LIMITED shard craft / pack and gifts use independent counts; failure and replay cannot issue again',async t=>{
 const f=await fixture(t),d=def('V-979'),legacy=MERCENARY_CRAFTS[1];
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued,revision) VALUES('V-979',3,2,0)").run();
 const oldId=await f.save(legacy,{materials:[{itemCode:ordinary,quantity:1}]});await f.craft(oldId);
 const id=await f.save(d,{successRate:0}),failed=await f.craft(id,'limited-failure');assert.equal(failed.success,false);assert.equal((await f.stock(d)).crafted,0);
 await f.save(d,{craftRevision:1});const result=await f.craft(id,'limited-success');assert.equal(result.success,true);
 const before=await f.balance();assert.equal((await f.craft(id,'limited-success')).replayed,true);assert.deepEqual(await f.balance(),before);
 assert.equal((await f.stock(legacy)).crafted,1);assert.equal((await f.stock(d)).crafted,1);
 assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-979'").first()).issued),2);
 assert.equal(await f.quantity(ordinary),99);assert.equal(await f.quantity(LIMITED_CRAFT_SHARD),98);
});

test('last-slot race stops at five, losing request spends nothing, and +5 makes exactly five further slots available',async t=>{
 const f=await fixture(t),d=def('V-988'),id=await f.save(d);for(let i=0;i<4;i++)await f.craft(id);
 const before=await Promise.all([f.balance(7),f.balance(8)]),results=await Promise.allSettled([f.craft(id),f.craft(id,crypto.randomUUID(),{...f.user,id:8})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const loser=results.findIndex(r=>r.status==='rejected');assert.deepEqual(await f.balance(7+loser),before[loser]);
 assert.deepEqual(await f.stock(d),{limit:5,crafted:5,remaining:0,soldOut:true});await assert.rejects(f.craft(id),/소진/);
 await f.add(d,1);for(let i=0;i<5;i++)await f.craft(id);assert.deepEqual(await f.stock(d),{limit:10,crafted:10,remaining:0,soldOut:true});await assert.rejects(f.craft(id),/소진/);
});

test('grant failure rolls back cards, currencies, materials and slots',async t=>{
 const f=await fixture(t,true),d=def('V-975'),id=await f.save(d),before=await f.balance();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.craft(id),/INJECTED_FAILURE/);f.fail('');assert.deepEqual(await f.balance(),before);assert.equal((await f.stock(d)).crafted,0);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_mercenary_cards_v1 WHERE mercenary_code='V-975'").first()).n),0);
});

test('verified new Jinmu/Jokro recipients can deploy and rank; incomplete receipts and stray holdings never grant access; Eunseol PVP allowed, Shiranui rank unchanged',async t=>{
 const f=await fixture(t);
 await f.p("DELETE FROM cnine_user_inventory WHERE item_code='MASTER_STAR'").run();await f.p("DELETE FROM inventory_items WHERE code='MASTER_STAR'").run();await mercenaryFixture(t,{base:f});
 await f.p("UPDATE cnine_user_inventory SET quantity=100 WHERE item_code='MASTER_STAR'").run();
 for(const [code,owners] of [['V-989',readJinmuPackOwners],['V-979',readJokroPackOwners]]){
  const d=def(code),id=await f.save(d),requestId=crypto.randomUUID();await f.craft(id,requestId);assert.equal((await owners(f.env,[7,8])).has(7),true);
  await f.p("UPDATE workshop_craft_receipts_v1668 SET status='PENDING' WHERE request_id=?",requestId).run();assert.equal((await owners(f.env,[7])).has(7),false);
  await f.p("UPDATE workshop_craft_receipts_v1668 SET status='COMPLETED' WHERE request_id=?",requestId).run();
  assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===code).canDeploy);
  for(const mode of ['PVE','PVP']){const state=await mercenaryAccountState(f.env,f.user);await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[code],revision:state.loadouts[mode].revision});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,code);}
  assert((await rankedOwnedMercenaries(f.env,[7])).get(7).some(c=>c.code===code));
 }
 const id=await f.save(def('V-973'));await f.craft(id);assert((await rankedOwnedMercenaries(f.env,[7])).get(7).some(c=>c.code==='V-973'));
 const state=await mercenaryAccountState(f.env,f.user);await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVP',mercenaryCodes:['V-973'],revision:state.loadouts.PVP.revision});
 const shiranui=await f.save(def('V-987'));await f.craft(shiranui);
 await f.p('CREATE TABLE character_titles(id INTEGER PRIMARY KEY,code TEXT UNIQUE,is_active INTEGER)').run();
 await f.p('CREATE TABLE user_character_titles(user_id INTEGER,title_id INTEGER,expires_at TEXT,PRIMARY KEY(user_id,title_id))').run();
 const account=await mercenaryAccountState(f.env,f.user);assert.equal(account.cards.find(c=>c.code==='V-987').canDeploy,false);
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:['V-987'],revision:account.loadouts.PVE.revision}),/중장/);
});

test('CMS route accepts only an authenticated OWNER and returns the separated updated snapshot',async t=>{
 const f=await fixture(t),d=def('V-972'),body={action:'ADD_LIMITED_SHARD_STOCK',stock:{code:d.recipeCode,expectedRevision:0,requestId:crypto.randomUUID()}};
 await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
 for(const role of ['USER','ADMIN','OWNER']){
  const request=new Request('https://local/api/admin/workshop',{method:'POST',body:JSON.stringify(body)});
  const response=await handleWorkshop({path:'admin/workshop',request,env:f.env,deps:{...f.deps,authenticate:async()=>({...f.user,role}),readBody:r=>r.json()}});
  assert.equal(response.status,role==='OWNER'?200:403);
  if(role==='OWNER'){const result=await response.json();assert.equal(result.snapshot.recipes.find(r=>r.code===d.recipeCode).craftStock.limit,10);}
 }
});

for(const postgres of [false,true])test(`timed refill and first publication share one commit; three new recipes charge correctly (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
 const f=await fixture(t,postgres);
 const open=['V-970','V-974','V-971'].map(def);
 const restock=['V-979','V-989','V-996','V-999'].map(def);
 const player={id:7,role:'USER'};
 const byCode=new Map();
 for(const d of restock){
  const id=await f.save(d),policy=(await readMercenaryCraft(f.env,d)).policy;
  await f.setting(d.key,{...policy,stockLimit:25});
  await f.p("INSERT INTO workshop_craft_logs_v1668(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,output_quantity,payment_type,success) VALUES(?,8,?,?,'MERCENARY_CRAFT','MERCENARY',?,25,'BOTH',1)",crypto.randomUUID(),id,d.name,d.code).run();
 }
 const request={requestId:crypto.randomUUID(),reason:'소진 4종 각 10장 복구 및 신규 3종 공개',executeAt:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),
  changes:[...restock.map(d=>({code:d.code,quantity:10})),...open.map(d=>({code:d.code,open:true}))]};
 const due=Date.parse(request.executeAt);
 for(const d of open){
  await f.add(d,0);
  await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,request));
  byCode.set(d.code,await f.save(d,{craftRevision:1,coinCost:500000000000000,masterStarCost:100000000,materials:[{itemCode:LIMITED_CRAFT_SHARD,quantity:25}],successRate:10,isActive:false,isPublic:false}));
 }
 await scheduleLimitedCraftStock(f.env,f.user,request);
 assert((await scheduleLimitedCraftStock(f.env,f.user,request)).replayed);
 await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,{...request,requestId:crypto.randomUUID()}),/한 번만/);
 const snapshot=async()=> (await decorateMercenaryCraft(f.env,[])).filter(r=>r.craftScope==='SSS_LIMITED_SHARD');
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>due-1})).applied,0);
 const before=await snapshot();assert.equal(before.length,4);assert(before.every(r=>r.craftStock.soldOut));
 for(const d of open)await assert.rejects(f.craft(byCode.get(d.code),crypto.randomUUID(),player),/현재 제작할 수 없는/);
 f.fail('INSERT INTO admin_logs');
 await assert.rejects(processLimitedCraftStockSchedules(f.env,{clock:()=>due}),/INJECTED_FAILURE/);
 f.fail('');assert.deepEqual(await snapshot(),before);
 for(const id of byCode.values())assert.equal(Number((await f.p('SELECT is_public FROM workshop_recipes_v1668 WHERE id=?',id).first()).is_public),0);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>due})).applied,1);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>due+1})).applied,0);
 const rows=await snapshot();assert.equal(rows.length,7);
 for(const row of rows){
  const prior=before.find(r=>r.code===row.code);
  assert.deepEqual(row.craftStock,{limit:prior?35:10,crafted:prior?25:0,remaining:10,soldOut:false});assert.equal(row.craftLocked,false);
  if(prior){assert.equal(row.coin_cost,prior.coin_cost);assert.deepEqual(row.materials,prior.materials);continue;}
  assert.equal(row.coin_cost,500000000000000);assert.equal(row.master_star_cost,100000000);assert.equal(row.success_rate,10);
  assert.deepEqual(row.materials.map(m=>[m.item_code,m.quantity]),[[LIMITED_CRAFT_SHARD,25]]);
 }
 await f.p('UPDATE users SET coin=8000000000000000 WHERE id=7').run();
 await f.p("UPDATE cnine_user_inventory SET quantity=2000000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await f.p('UPDATE cnine_user_inventory SET quantity=500 WHERE user_id=7 AND item_code=?',LIMITED_CRAFT_SHARD).run();
 const random=t.mock.method(Math,'random',()=>0.10),first=byCode.get('V-970');
 assert.equal((await f.craft(first,crypto.randomUUID(),player)).success,false);
 assert.equal((await f.stock(open[0])).remaining,10);
 random.mock.mockImplementation(()=>0.099);
 for(const d of open){
  const rid=crypto.randomUUID(),result=await f.craft(byCode.get(d.code),rid,player);
  assert.equal(result.output.ref,d.code);assert.equal(result.output.quantity,1);
  assert((await f.craft(byCode.get(d.code),rid,player)).replayed);assert.equal((await f.stock(d)).remaining,9);
 }
 assert.equal(await f.coin(),6000000000000000);assert.equal(await f.quantity('MASTER_STAR'),1600000000);assert.equal(await f.quantity(LIMITED_CRAFT_SHARD),400);
 for(let i=0;i<9;i++)await f.craft(first,crypto.randomUUID(),player);
 const spent=await f.balance();await assert.rejects(f.craft(first,crypto.randomUUID(),player),/소진/);assert.deepEqual(await f.balance(),spent);
 assert.equal((await f.stock(open[0])).remaining,0);assert.equal((await f.stock(open[1])).remaining,9);assert.equal((await f.stock(open[2])).remaining,9);
});

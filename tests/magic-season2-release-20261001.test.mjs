import test from 'node:test';import assert from 'node:assert/strict';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';
import {MAGIC_S2_RULES,MAGIC_SEASON2_REVIEW,magicS2Card} from '../shared/magic-season2-v1.mjs';
import {defaultMagicSeason2Settings,cleanMagicSeason2Settings,MAGIC_S2_PACK} from '../shared/magic-season2-release.mjs';
import {magicBattleLoadout,duoMagicLoadouts,normalizeMagicBattleEffect,authorizeMagicBattleSnapshot} from '../functions/_magic.js';
import {createPvpBattleV2,createPveBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {reviewDeck} from '../preview/magic-card-season2-v1/review-battles.mjs';
import {PGlite} from '@electric-sql/pglite';
import {registerMagicSeason2Ready} from '../scripts/ops/magic-season2-ready-20261001.mjs';
async function prepare(f){
 const {p}=f;
 const ddl=[
  'ALTER TABLE app_meta ADD COLUMN updated_at TEXT',
  'ALTER TABLE magic_cards ADD COLUMN updated_at TEXT',
  'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER,updated_at TEXT)',
  'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
  'CREATE TABLE inventory_use_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER,item_code TEXT,status TEXT,response_json TEXT,error_message TEXT,updated_at TEXT)',
  'CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)'
 ];
 if(f.DB.dialect==='postgres')await f.DB.execSchema(ddl.map(s=>s.replaceAll('INTEGER','BIGINT')));
 else for(const statement of ddl)await p(statement).run();
 await p('INSERT INTO inventory_items(code,is_active) VALUES(?,0)',MAGIC_S2_PACK).run();
 for(const [i,[code,r]]of Object.entries(MAGIC_S2_RULES).entries()){
  await p("INSERT INTO magic_cards(id,code,name,effect_type,trigger_type,trigger_chance,effect_value,max_activations,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES(?,?,?,?,'CONDITIONAL',100,0,?,?,1,0,0,?)",101+i,code,r.name,code,r.uses,r.pvpOnly?0:1,100+i).run();
  await p('INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level) VALUES(1,?,3,9)',101+i).run();
 }
 await p('INSERT INTO cnine_user_inventory VALUES(1,?,2,2,NULL)',MAGIC_S2_PACK).run();
 const save=async(season2,extra={})=>{
  const row=await p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first();
  await p("UPDATE app_meta SET value=? WHERE key='magic_card_settings_v1'",JSON.stringify({...JSON.parse(row.value),...extra,season2:cleanMagicSeason2Settings(season2)})).run();
 };
 return save;
}
test('S2 settings are held by default; unknown price never becomes zero and invalid policies fail',()=>{
 const s=defaultMagicSeason2Settings();assert.equal(s.runtimeEnabled,false);assert.equal(s.drawEnabled,false);assert.equal(s.price,null);
 assert.equal(Object.keys(s.cardWeights).length,10);
 for(const price of [null,'',undefined])assert.equal(cleanMagicSeason2Settings({price}).price,null);
 for(const price of [0,-1,1.1,NaN,Infinity])assert.throws(()=>cleanMagicSeason2Settings({price}));
 assert.throws(()=>cleanMagicSeason2Settings({drawEnabled:true}),/전투 공개/);
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': OFF guards, trusted loadouts, presets, duo and snapshot rehydration',async t=>{
 const f=await magicFixture(postgres);t.after(()=>f.close());const save=await prepare(f),{p,env}=f,user=await f.user();
 await p("UPDATE magic_cards SET is_active=1 WHERE id>=101").run();
 const before=await f.user();
 for(const [route,body]of [
  ['magic/draw',{season:'S2',requestId:'off-draw'}],
  ['magic/pack/open',{itemCode:MAGIC_S2_PACK,requestId:'off-pack'}],
  ['magic/enhance',{magicCardId:101,requestId:'off-enhance'}],
  ['magic/loadout',{deckType:'PVE',magicCardIds:[101,0,0,0,0]}]
 ])assert.ok((await f.call(route,body)).status>=400,route);
 assert.deepEqual(await f.user(),before);
 await p("UPDATE magic_card_loadouts SET magic_card_id=101 WHERE user_id=1 AND deck_type='PVE' AND slot_no=2").run();
 assert.deepEqual((await magicBattleLoadout(env,user,'PVE')).cards,[]);
 assert.equal(normalizeMagicBattleEffect({effectType:'S2_ECLIPSE_PROPHECY',slotNo:1,enhancementLevel:9},{}),null);
 await save({runtimeEnabled:true,drawEnabled:true});
 const loadout=await magicBattleLoadout(env,user,'PVE');assert.equal(loadout.cards[0].triggerChance,100);assert.equal(loadout.cards[0][MAGIC_SEASON2_REVIEW],true);
 const run=cards=>createPveBattleV2({cards:reviewDeck,magicCards:cards,monster:{id:9,hp:999999,power:500000},seed:31});
 assert.ok(run(loadout.cards).result.timeline.some(e=>e.type==='MAGIC_SEASON2'));
 assert.ok(!run(JSON.parse(JSON.stringify(loadout.cards))).result.timeline.some(e=>e.type==='MAGIC_SEASON2'));
 await f.saveDeck({presetNo:2,cardIds:f.cardIds,magicCardIds:[101,0,0,0,0]});
 assert.equal((await magicBattleLoadout(env,user,'PVP',{presetNo:2})).cards[0].season,'S2');
 assert.equal((await duoMagicLoadouts(env,[{userId:1,presetNo:2}]))[0].cards[0][MAGIC_SEASON2_REVIEW],true);
 const serialized=JSON.parse(JSON.stringify(loadout.cards)).map(c=>({...c,snapshotSquad:2}));
 const restored=await authorizeMagicBattleSnapshot(env,serialized);
 assert.equal(restored[0][MAGIC_SEASON2_REVIEW],true);assert.equal(restored[0].snapshotSquad,2);
 await save({runtimeEnabled:false});assert.deepEqual(await authorizeMagicBattleSnapshot(env,serialized),[]);
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': separate S2 pool, undefined price, receipt replay and failed reward refunds',async t=>{
 const f=await magicFixture(postgres);t.after(()=>f.close());const save=await prepare(f),{p}=f;
 await p('UPDATE magic_cards SET is_active=1 WHERE id>=101').run();
 await save({runtimeEnabled:true,drawEnabled:true}, {packRewards:{magicCardWeight:100,magicCrystalWeight:0,cardShardWeight:0}});
 const before=await f.user();assert.equal((await f.call('magic/draw',{season:'S2',requestId:'price-null'})).status,503);assert.deepEqual(await f.user(),before);
 await save({runtimeEnabled:true,drawEnabled:true,price:1234},{packRewards:{magicCardWeight:100,magicCrystalWeight:0,cardShardWeight:0}});
 const drawn=await (await f.call('magic/draw',{season:'S2',count:10,requestId:'s2-draw'})).json();
 assert.equal(drawn.results.length,10);assert.equal(drawn.totalCoinCost,12340);assert.equal(drawn.totalCost,0);assert.ok(drawn.results.every(r=>r.card.season==='S2'));
 const balance=await f.user();assert.deepEqual(await (await f.call('magic/draw',{season:'S2',count:10,requestId:'s2-draw'})).json(),drawn);assert.deepEqual(await f.user(),balance);
 assert.equal((await f.call('magic/draw',{requestId:'s2-draw'})).status,409);assert.deepEqual(await f.user(),balance);
 const s1=await (await f.call('magic/draw',{requestId:'s1-draw'})).json();assert.equal(s1.card.season,'S1');
 const body={itemCode:MAGIC_S2_PACK,requestId:'s2-pack'},opened=await (await f.call('magic/pack/open',body)).json();
 assert.equal(opened.reward.card.season,'S2');assert.equal(opened.remaining,1);assert.deepEqual(await (await f.call('magic/pack/open',body)).json(),opened);
 f.fail('INSERT INTO inventory_logs');
 assert.equal((await f.call('magic/pack/open',{itemCode:MAGIC_S2_PACK,requestId:'fail-pack'})).status,409);
 f.fail('');assert.equal(Number((await p('SELECT quantity FROM cnine_user_inventory WHERE item_code=?',MAGIC_S2_PACK).first()).quantity),1);
 const last=await (await f.call('magic/pack/open',{itemCode:MAGIC_S2_PACK,requestId:'last-pack'})).json();assert.equal(last.remaining,0);
 assert.equal((await f.call('magic/pack/open',{itemCode:MAGIC_S2_PACK,requestId:'no-pack'})).status,409);
 await p('UPDATE user_magic_cards SET enhancement_level=0,quantity=3 WHERE magic_card_id=101').run();
 const beforeEnhance=await f.user(),enhanced=await (await f.call('magic/enhance',{magicCardId:101,requestId:'s2-enhance'})).json();
 const policy=JSON.parse((await p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first()).value).enhancement;
 assert.equal(enhanced.successRate,policy.successRates[0]);assert.equal(enhanced.shardCost,policy.shardCosts[0]);assert.equal(enhanced.effectiveTriggerChance,100);assert.equal(enhanced.season,'S2');assert.ok(enhanced.params);
 assert.equal(Number((await f.user()).card_shards),Number(beforeEnhance.card_shards)-100);
 const replay=await (await f.call('magic/enhance',{magicCardId:101,requestId:'s2-enhance'})).json();assert.equal(replay.afterLevel,enhanced.afterLevel);
 assert.equal((await f.call('magic/enhance',{magicCardId:102,requestId:'s2-enhance'})).status,409);
 for(const [type,weights,amount]of [
  ['MAGIC_CRYSTAL',{magicCardWeight:0,magicCrystalWeight:100,cardShardWeight:0,magicCrystalMin:7,magicCrystalMax:7},7],
  ['CARD_SHARD',{magicCardWeight:0,magicCrystalWeight:0,cardShardWeight:100,cardShardMin:13,cardShardMax:13},13]
 ]){
  await save({runtimeEnabled:true,drawEnabled:true,price:1234},{packRewards:weights});
  const reward=await (await f.call('magic/draw',{season:'S2',requestId:'mixed-'+type})).json();assert.equal(reward.reward.type,type);assert.equal(reward.reward.amount,amount);
  await p('UPDATE cnine_user_inventory SET quantity=1 WHERE item_code=?',MAGIC_S2_PACK).run();
  const pack=await (await f.call('magic/pack/open',{itemCode:MAGIC_S2_PACK,requestId:'mixed-pack-'+type})).json();assert.equal(pack.reward.type,type);assert.equal(pack.reward.amount,amount);
 }
});
test('duo owner 2 uses slots 6-10; repeated team magic shares one budget without rejecting two owners',()=>{
 const card={...magicS2Card('S2_ECLIPSE_PROPHECY',1,9),id:101,[MAGIC_SEASON2_REVIEW]:true};
 const squad=(id,magicCards=[])=>({ownerId:id,cards:reviewDeck.map(c=>({...c,rarity:'SSR',grade:'SSR'})),magicCards});
 const battle=createDuoBattleV2({attackerSquads:[squad(1,[card]),squad(2,[card])],defenderSquads:[squad(3),squad(4)],seed:31});
 const events=battle.result.timeline.filter(e=>e.type==='MAGIC_SEASON2'&&e.statusKind==='ECLIPSE');
 assert.ok(events.length);assert.ok(events.every(e=>e.actorId.includes('OWNER:1:')));assert.equal(battle.teams.A.cards.length,10);
 const second=createDuoBattleV2({attackerSquads:[squad(1),squad(2,[card])],defenderSquads:[squad(3),squad(4)],seed:31});
 assert.ok(second.result.timeline.some(e=>e.type==='MAGIC_SEASON2'&&e.actorId.includes('OWNER:2:')));
});
test('OWNER CMS ON/OFF is atomic, preserves S1 policy and blocks alternative card/settings editors',async t=>{
 const f=await magicFixture();t.after(()=>f.close());await prepare(f);
 assert.equal((await f.call('admin/magic-system',{action:'SAVE_SEASON2_SETTINGS',settings:{runtimeEnabled:true}})).status,403);
 await f.p("UPDATE users SET role='OWNER' WHERE id=1").run();
 const deps={authenticate:f.user,readBody:r=>r.json(),json:(b,status=200)=>Response.json(b,{status}),writeAdminLog:async()=>{}};
 const post=body=>f.call('admin/magic-system',body,deps);
 const before=JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first()).value);
 assert.equal((await post({action:'SAVE_SEASON2_SETTINGS',settings:{drawEnabled:true}})).status,400);
 assert.equal((await post({action:'SAVE_SEASON2_SETTINGS',settings:{runtimeEnabled:true,drawEnabled:true}})).status,200);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM magic_cards WHERE id>=101 AND is_active=1').first()).n),10);
 assert.equal(Number((await f.p('SELECT is_active FROM inventory_items WHERE code=?',MAGIC_S2_PACK).first()).is_active),1);
 assert.equal((await post({action:'SAVE_MAGIC_CARD',id:101,code:'RENAME',name:'other',effectType:'OPENING_ATTACK'})).status,400);
 assert.equal((await post({action:'SAVE_SETTINGS',settings:{season2:{runtimeEnabled:false}}})).status,200);
 const current=JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first()).value);
 assert.equal(current.season2.runtimeEnabled,true);assert.deepEqual(current.packRewards,before.packRewards);assert.deepEqual(current.enhancement,before.enhancement);
 assert.equal((await post({action:'SAVE_SEASON2_SETTINGS',settings:{runtimeEnabled:false,drawEnabled:false}})).status,200);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM magic_cards WHERE id>=101 AND is_active=1').first()).n),0);
});
test('real PostgreSQL registration is inactive, idempotent and preserves S1 and account balances',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT 'now'::text$$;
 CREATE TABLE users(id BIGINT,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',999);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE magic_cards(id SERIAL PRIMARY KEY,code TEXT UNIQUE,name TEXT,rarity TEXT,image_url TEXT,description TEXT,effect_type TEXT,trigger_type TEXT,effect_value INTEGER,trigger_chance INTEGER,max_activations INTEGER,draw_weight INTEGER,scope_pve INTEGER,scope_pvp INTEGER,scope_captain INTEGER,is_active INTEGER,sort_order INTEGER);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER);
 CREATE TABLE admin_logs(id SERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const before={enabled:true,drawEnabled:true,packRewards:{magicCardWeight:50,magicCrystalWeight:25,cardShardWeight:25},enhancement:{successRates:[50,50,40,30,30,20,20,10,10]}};
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 await q("INSERT INTO app_meta(key,value) VALUES('magic_card_settings_v1',$1)",[JSON.stringify(before)]);
 await db.exec('BEGIN');const receipt=await registerMagicSeason2Ready(q);await db.exec('COMMIT');
 assert.equal(receipt.cardIds.length,10);assert.equal(receipt.price,null);
 assert.equal((await q('SELECT * FROM magic_cards')).length,10);assert.ok((await q('SELECT * FROM magic_cards')).every(c=>c.is_active===0));
 const saved=JSON.parse((await q("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'"))[0].value);
 const {season2,...s1}=saved;assert.deepEqual(s1,before);assert.equal(season2.runtimeEnabled,false);
 assert.equal((await q('SELECT coin FROM users'))[0].coin,999);
 await db.exec('BEGIN');assert.equal((await registerMagicSeason2Ready(q)).replayed,true);await db.exec('COMMIT');
 assert.equal((await q('SELECT * FROM admin_logs')).length,1);
});

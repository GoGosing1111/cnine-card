import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {apply,inspect,plan,refundTable,replacementDeck,replacementRiftState,SOURCE_ID,CARD_ID,OPERATION_KEY} from '../scripts/operations/convert-icon-gusudaeng-20261013.mjs';
const settings=[{key:'breakthrough_config',value:JSON.stringify({ZENITH:[5,10,20,30,40,50,60,70,80,90].map(cost=>({cost}))})},{key:'zenith_master_star_breakthrough_v1802',value:JSON.stringify({steps:[6000,8000,10000].map(retirementShardRefund=>({retirementShardRefund}))})}];
test('standard cumulative retirement refund never multiplies enhancement by duplicate quantity',()=>{
 assert.deepEqual(refundTable(settings),[0,5,15,35,65,105,155,215,285,365,455,6455,14455,24455]);
 const p=plan({cards:[{id:SOURCE_ID,title:'구수댕',member_id:4,rarity_override:'ZENITH',is_active:1}],settings,holdings:[{user_id:7,quantity:100,breakthrough_level:13},{user_id:8,quantity:5,breakthrough_level:0}],decks:[]});assert.equal(p.totalRefund,24455);assert.equal(p.copies,105);
});
test('replacement preserves other valid slots, ownership and grade caps; no automatic grants or revival',()=>{
 const owned=[['i1','ICON'],['i2','ICON'],['i3','ICON'],['f1','FUR'],['f2','FUR'],['s','SUPERSTAR']].map(([id,grade])=>({id,grade,quantity:1,breakthrough_level:13,base_power:180000}));
 const r=replacementDeck(['i1','i2','f1','f2',SOURCE_ID],owned);assert.deepEqual(r.after,['i1','i2','f1','f2','s']);
 assert.throws(()=>replacementDeck(r.before,owned.filter(c=>c.id!=='s')));
 for(const hp of [{[SOURCE_ID]:3},{[SOURCE_ID]:0},{}]){const state=replacementRiftState({stage:5,hp,stash:{coin:100}},r.before,r.after);assert.equal(state.hp.s,hp[SOURCE_ID]||0);assert.equal(state.hp[SOURCE_ID],undefined);assert.equal(state.stash.coin,100);}
});
async function fixture(){
 const pg=new PGlite(),c={query:async(s,p=[])=>{const r=await pg.query(s,p);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 await pg.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamptz DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE members(id bigint PRIMARY KEY,name text,is_active integer DEFAULT 1);
 CREATE TABLE users(id bigint PRIMARY KEY,role text,card_shards bigint DEFAULT 0);
 CREATE TABLE cards(id text PRIMARY KEY,member_id bigint,title text,rarity text,rarity_override text,image_url text,focus_x integer,focus_y integer,is_active integer DEFAULT 1,draw_weight integer DEFAULT 1,card_status text DEFAULT 'PUBLIC',batch_name text,batch_date text,base_power bigint DEFAULT 5500,reroll_material_enabled integer DEFAULT 1,reroll_result_enabled integer DEFAULT 1,updated_at timestamptz DEFAULT CURRENT_TIMESTAMP);
 CREATE VIEW cards_effective_v1210 AS SELECT id,member_id,COALESCE(rarity_override,rarity) rarity,is_active,card_status,base_power FROM cards;
 CREATE TABLE user_cards(user_id bigint,card_id text REFERENCES cards(id),quantity integer,breakthrough_level integer,PRIMARY KEY(user_id,card_id));
 CREATE TABLE pve_decks(user_id bigint PRIMARY KEY,card_ids text,updated_at timestamptz);
 CREATE TABLE pvp_decks(LIKE pve_decks INCLUDING ALL);
 CREATE TABLE pvp_deck_presets(user_id bigint,preset_no integer,card_ids text,updated_at timestamptz,PRIMARY KEY(user_id,preset_no));
 CREATE TABLE pve_rift_runs(run_id text PRIMARY KEY,user_id bigint,status text,deck_cards text,state_json text,updated_at timestamptz);
 CREATE TABLE territory_war_v3_rounds(id bigint PRIMARY KEY,status text);
 CREATE TABLE territory_war_v3_users(round_id bigint,user_id bigint,deck_snapshot text,formation_breakdown_json text,loadout_refreshed_at timestamptz,updated_at timestamptz);
 CREATE TABLE card_unique_advancements_v1937(user_id bigint,card_id text);
 CREATE TABLE card_evolution_progress(user_id bigint,source_card_id text);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,lease_until_ms bigint);
 CREATE TABLE shard_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,card_id text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE card_pack_cards(card_id text);
 CREATE TABLE card_acquisition_effects(card_id text);
 CREATE TABLE card_unique_effects(card_id text,is_active integer,updated_at timestamptz);
 CREATE TABLE deck_synergies(required_card_ids text,is_active integer,updated_at timestamptz);
 CREATE TABLE alchemy_reward_pool_v1(reward_type text,reward_ref text,is_active integer,updated_at timestamptz);
 CREATE TABLE unified_drop_entries_v1667(reward_type text,reward_ref text,is_enabled integer,updated_at timestamptz);
 INSERT INTO members VALUES(4,'남수댕',1);INSERT INTO users VALUES(1,'OWNER',0),(7,'USER',100),(8,'USER',50);`);
 for(const row of settings)await c.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[row.key,row.value]);
 for(const key of ['icon_fusion_settings_v1','icon_role_settings_v1','icon_cms_v1'])await c.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,'{"unchanged":true}']);
 const defs=[[SOURCE_ID,'ZENITH','구수댕'],['i1','ICON','A'],['i2','ICON','B'],['f1','FUR','C'],['f2','FUR','D'],['s','SUPERSTAR','E']];
 for(const [id,grade,title] of defs){await c.query("INSERT INTO cards(id,member_id,title,rarity,rarity_override) VALUES($1,4,$2,'FUR',$3)",[id,title,grade]);await c.query('INSERT INTO user_cards VALUES(7,$1,$2,13)',[id,id===SOURCE_ID?100:1]);}
 await c.query('INSERT INTO user_cards VALUES(8,$1,5,0)',[SOURCE_ID]);
 const deck=JSON.stringify(['i1','i2','f1','f2',SOURCE_ID]);
 for(const table of ['pve_decks','pvp_decks'])await c.query(`INSERT INTO ${table}(user_id,card_ids) VALUES(7,$1)`,[deck]);
 await c.query('INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(7,1,$1)',[deck]);
 await c.query("INSERT INTO pve_rift_runs(run_id,user_id,status,deck_cards,state_json) VALUES('run',7,'ACTIVE',$1,$2)",[deck,JSON.stringify({hp:{[SOURCE_ID]:3},stash:{coin:77}})]);
 await c.query("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE')");await c.query('INSERT INTO territory_war_v3_users(round_id,user_id,deck_snapshot) VALUES(1,7,$1)',[deck]);
 for(const user of [7,8])await c.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3)',[user,'fixture',Date.now()+120000]);
 return {pg,c,opts:{lockToken:'fixture',lockDeadline:Date.now()+120000}};
}
test('conversion rolls back on failure/dry-run, commits refund+decks+catalog together, and replays without mutations',async()=>{
 const f=await fixture();try{
  await f.c.query("INSERT INTO users VALUES(9,'USER',0)");await f.c.query('INSERT INTO pve_decks(user_id,card_ids) VALUES(9,$1)',[JSON.stringify(['i1','i2','f1','f2',SOURCE_ID])]);await f.c.query('INSERT INTO user_mutation_locks_v1520 VALUES(9,$1,$2)',['fixture',Date.now()+120000]);
  const before=await inspect(f.c);
  await assert.rejects(()=>apply(f.c,{lockToken:'wrong',lockDeadline:f.opts.lockDeadline}));assert.deepEqual(await inspect(f.c),before);
  const failing={query:(sql,p)=>{if(sql.startsWith('INSERT INTO cards('))throw Error('injected insert failure');return f.c.query(sql,p);}};
  await assert.rejects(()=>apply(failing,f.opts),/injected/);assert.deepEqual(await inspect(f.c),before);
  const dry=await apply(f.c,{...f.opts,dryRun:true});assert.equal(dry.totalRefundShards,24455);assert.deepEqual(await inspect(f.c),before);
  const result=await apply(f.c,f.opts);assert.equal(result.holders,2);assert.equal(result.removedCopies,105);assert.equal(result.totalRefundShards,24455);assert.equal(result.iconGrants,0);assert.equal(result.clearedEmptyDecks,1);assert.equal((await f.c.query('SELECT * FROM pve_decks WHERE user_id=9')).rows.length,0);
  const after=await inspect(f.c);assert.equal(after.holdings.length,0);assert.equal(after.decks.length,0);assert.equal(after.cards.find(c=>c.id===CARD_ID).rarity_override,'ICON');assert.equal(after.cards.find(c=>c.id===SOURCE_ID).card_status,'RETIRED');
  assert.equal(Number((await f.c.query('SELECT card_shards FROM users WHERE id=7')).rows[0].card_shards),24555);assert.equal((await f.c.query('SELECT * FROM shard_logs')).rows.length,1);
  const state=JSON.parse((await f.c.query("SELECT state_json FROM pve_rift_runs WHERE run_id='run'")).rows[0].state_json);assert.equal(state.hp.s,3);assert.equal(state.stash.coin,77);
  const readonly={query:(s,p)=>{assert.ok(!/^(INSERT|UPDATE|DELETE)/.test(s),'Replay must not mutate');return f.c.query(s,p);}};assert.equal((await apply(readonly)).replayed,true);assert.deepEqual(await inspect(f.c),after);
  assert.equal((await f.c.query('SELECT * FROM app_meta WHERE key LIKE $1',[OPERATION_KEY+':user:%'])).rows.length,3);
 }finally{await f.pg.close();}
});

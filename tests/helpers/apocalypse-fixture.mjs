import {factionFixture} from './clan-faction-fixture.mjs';
export async function apocalypseFixture({postgres=false}={}){
  const f=await factionFixture({postgres});
  const schema=[
    'ALTER TABLE app_meta ADD COLUMN updated_at TEXT',
    'ALTER TABLE users ADD COLUMN card_shards BIGINT DEFAULT 0',
    'ALTER TABLE users ADD COLUMN magic_crystals BIGINT DEFAULT 0',
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER)',
    'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
    'CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
    'CREATE TABLE shard_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT,card_id TEXT)',
    'CREATE TABLE magic_crystal_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity BIGINT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id))',
    'CREATE TABLE user_title_progress_events(user_id INTEGER,event_type TEXT,event_key TEXT,clear_count BIGINT,updated_at TEXT,PRIMARY KEY(user_id,event_type,event_key))',
    'CREATE TABLE battle_logs(user_id INTEGER,monster_id INTEGER,deck_cards TEXT,player_power BIGINT,monster_power BIGINT,result TEXT,reward_coin BIGINT)'
  ];
  if(postgres)await f.DB.execSchema(["CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$","CREATE FUNCTION sqlite_date(value text, modifier text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(value::timestamp + modifier::interval,'YYYY-MM-DD')$$",...schema.map(s=>s.replaceAll('DEFAULT CURRENT_TIMESTAMP','DEFAULT sqlite_now()'))]);
  else for(const sql of schema)await f.p(sql).run();
  for(const code of ['MASTER_STAR','STARLIGHT_ARMOR_CORE','EQUIPMENT_SUPPLY_BOX','BLACK_MIRACLE_PACK','HIGH_GRADE_REROLL_TICKET'])await f.p('INSERT INTO inventory_items VALUES(?,1)',code).run();
  f.plan={reward:400,card:{id:'A',grade:'MA',title:'Test'},duplicateShards:120,items:[{code:'EQUIPMENT_SUPPLY_BOX',quantity:1},{code:'BLACK_MIRACLE_PACK',quantity:1},{code:'HIGH_GRADE_REROLL_TICKET',quantity:1}],magic:{chance:100,roll:0,amount:2,dailyLimit:3},unified:null,bonuses:{coin:100,masterStars:300,mysticEnergy:4}};
  f.battle={teams:{A:{cards:[1,2,3,4,5].map(i=>({id:'A'+i,hp:100,maxHp:100})),mercenaries:[{id:'M1',hp:100,maxHp:100}]},B:{cards:[{id:'B1',hp:200,maxHp:200}]}},result:{winner:'A',timeline:[{type:'KO',targetId:'B1'}],final:{A:[{id:'A1',hp:100}],B:[{id:'B1',hp:0,maxHp:200}]}}};
  return f;
}

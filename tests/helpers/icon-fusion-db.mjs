import {jointFixture} from './joint-db.mjs';
import {ICON_LIVE_CARDS} from '../../shared/icon-fusion-policy-v1.mjs';
import {ensureJointTransactionSchema} from '../../functions/_joint_transactions.js';
import {readFileSync} from 'node:fs';
export async function iconFusionFixture(t,{postgres=false}={}){
 const f=await jointFixture(t,{postgres});
 await ensureJointTransactionSchema(f.env);
 if(postgres){const sql=readFileSync(new URL('../../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');await f.pg.exec(sql.match(/CREATE OR REPLACE FUNCTION sqlite_json_each[\s\S]*?\$\$;/)[0]);}
 const schema=[
  'CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER DEFAULT 1)',
  "CREATE TABLE cards(id TEXT PRIMARY KEY,member_id INTEGER,title TEXT,rarity TEXT,rarity_override TEXT,image_url TEXT,focus_x INTEGER DEFAULT 50,focus_y INTEGER DEFAULT 50,base_power INTEGER DEFAULT 180000,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC')",
  "CREATE VIEW cards_effective_v1210 AS SELECT id,member_id,title,COALESCE(NULLIF(rarity_override,''),rarity) rarity,image_url,focus_x,focus_y,base_power,is_active,card_status FROM cards",
  'CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER DEFAULT 1,breakthrough_level INTEGER DEFAULT 0,breakthrough_fail_count INTEGER DEFAULT 0,first_obtained_at TEXT DEFAULT CURRENT_TIMESTAMP,last_obtained_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id))',
  'CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT)',
  'CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT)',
  'CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT,PRIMARY KEY(user_id,preset_no))'
 ];
 if(postgres)await f.DB.execSchema(schema);else for(const sql of schema)await f.p(sql).run();
 for(const [i,c] of ICON_LIVE_CARDS.entries()){
  await f.p('INSERT INTO members(id,name) VALUES(?,?)',i+1,c.name).run();
  await f.p("INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url) VALUES(?,?,?,'FUR','ICON',?)",c.cardId,i+1,c.name,c.sourceArt).run();
 }
 for(const [id,grade] of [['CN-SUPER','SUPERSTAR'],['CN-FUR','FUR']]){
  await f.p('INSERT INTO cards(id,member_id,title,rarity,image_url) VALUES(?,1,?,?,?)',id,grade,grade,'assets/cards/ICON/diim-source-v1.png').run();
  await f.p('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(7,?,3,13)',id).run();
 }
 await f.p("INSERT INTO inventory_items(code,name,is_active) VALUES('MASTER_STAR','마스터의 별',1)").run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,'MASTER_STAR',15000000)").run();
 await f.p('UPDATE users SET coin=300000000000 WHERE id=7').run();
 // Successful-transaction tests explicitly opt in; production default is OFF.
 await f.setting('icon_fusion_settings_v1',{revision:1,enabled:true,successVideoUrl:'',successVideoDurationMs:12000});
 const body=()=>({requestId:crypto.randomUUID(),superstarId:'CN-SUPER',furId:'CN-FUR',targetCode:ICON_LIVE_CARDS[4].code,policyVersion:1});
 const snapshot=async()=>({coin:await f.coin(),stars:Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first()).quantity),cards:(await f.p('SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=7 ORDER BY card_id').all()).results.map(c=>({...c,quantity:Number(c.quantity),breakthrough_level:Number(c.breakthrough_level)}))});
 return {...f,body,snapshot};
}

import {DatabaseSync} from 'node:sqlite';
import {createUserAuctionService,prepareUserAuctionSchema} from '../../functions/_auction_user_service.js';
import {AUCTION_USER_DRAFT,AUCTION_USER_POLICY_KEY,AUCTION_TICKET} from '../../shared/auction-user-policy-v1.mjs';

export async function userAuctionFixture(t){
 const sql=new DatabaseSync(':memory:');t?.after(()=>sql.close());const faults={sql:''};
 const execute=(s,method)=>{if(faults.sql&&s.sql.includes(faults.sql))throw Error('injected failure');const value=sql.prepare(s.sql)[method](...s.values);return method==='run'?{meta:{changes:Number(value.changes),last_row_id:Number(value.lastInsertRowid)}}:value;};
 const DB={prepare(text){return {sql:text,values:[],bind(...values){this.values=values;return this;},async first(){return execute(this,'get')||null;},async all(){return {results:execute(this,'all')};},async run(){return execute(this,'run');}};},async batch(list){sql.exec('BEGIN');try{const rows=list.map(s=>/^\s*SELECT/i.test(s.sql)?{results:execute(s,'all')}:execute(s,'run'));sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 sql.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER);
 CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 CREATE TABLE auction_bgm_rules_v1554(id INTEGER PRIMARY KEY,auction_id INTEGER NOT NULL,min_bid INTEGER NOT NULL DEFAULT 0,max_bid INTEGER NOT NULL DEFAULT 0,bgm_url TEXT NOT NULL,bgm_duration INTEGER NOT NULL DEFAULT 40,sort_order INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
 CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,breakthrough_fail_count INTEGER,first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
 CREATE TABLE user_mercenary_cards_v1(user_id INTEGER,mercenary_code TEXT,total_copies INTEGER CHECK(total_copies>=1),duplicate_count INTEGER CHECK(duplicate_count=total_copies-1),first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE user_mercenary_levels_v1(user_id INTEGER,mercenary_code TEXT,level INTEGER,experience INTEGER,breakthrough_mask INTEGER,revision INTEGER,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE pve_decks(user_id INTEGER,card_ids TEXT);CREATE TABLE pvp_decks(user_id INTEGER,card_ids TEXT);CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id INTEGER PRIMARY KEY,mercenary_code TEXT);
 CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY,user_id INTEGER,equipment_id INTEGER,source_type TEXT,source_id TEXT,request_id TEXT,acquired_at TEXT);
 CREATE TABLE user_equipment_loadout(user_id INTEGER,instance_id INTEGER,slot TEXT);
 CREATE TABLE equipment_forge_states_v1(instance_id INTEGER PRIMARY KEY,user_id INTEGER,level INTEGER);
 CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,source_type TEXT,source_id TEXT,acquired_at TEXT,PRIMARY KEY(user_id,garage_id));
 CREATE TABLE user_garage_loadout(user_id INTEGER PRIMARY KEY,garage_id INTEGER);
 INSERT INTO users VALUES(1,'별빛상인',500000000000000),(2,'푸른지휘관',500000000000000),(3,'새벽상인',500000000000000);
 INSERT INTO inventory_items VALUES('AUCTION_HOST_TICKET','경매 개최 티켓',1),('MASTER_STAR','마스터의 별',1),('POTION','회복 물약',1);
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT id,'AUCTION_HOST_TICKET',10,10 FROM users;
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT id,'MASTER_STAR',1000000000,0 FROM users;
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT id,'POTION',100,0 FROM users;
 INSERT INTO user_cards VALUES(1,'C001',3,12,3,'old','old'),(2,'C001',1,7,2,'old','old'),(3,'C001',2,4,1,'old','old');
 INSERT INTO user_mercenary_cards_v1 SELECT id,'V-971',3,2,'old','old' FROM users;
 INSERT INTO user_mercenary_levels_v1 SELECT id,'V-971',id*5,70,3,9 FROM users;
 INSERT INTO user_equipment_instances VALUES(1001,1,40,'ADMIN','original','source-receipt','old');
 INSERT INTO user_garage_vehicles VALUES(1,1,'ADMIN','original','old');`);
 const assets=[
 {kind:'CARD',ref:'C001',name:'전설 카드',image:'/assets/ui/tactical-20261030/dex.webp'},
 {kind:'MERCENARY',ref:'V-971',name:'레반 · SSS 리미티드',image:'/assets/ui/project-v/mercenaries/reaper-mask-20261027/source-art-approved-v9.png'},
 {kind:'PET',ref:'PET-HEUKGU',name:'흑구',image:'/assets/ui/pets/heukgu-20261025/pet-heukgu-large-head-v3.png'},
 {kind:'EQUIPMENT',ref:'1001',name:'동방무기상',image:'/assets/ui/tactical-20261030/equipment.webp'},
 {kind:'VEHICLE',ref:'1',name:'신화 이동수단',image:'/assets/ui/tactical-20261030/auction.webp'},
 {kind:'ITEM',ref:'POTION',name:'회복 물약',image:'/assets/ui/tactical-20261030/inventory.webp'},
 {kind:'MASTER_STAR',ref:'MASTER_STAR',name:'마스터의 별',image:'/assets/ui/icon-fusion-20261004/master-star.webp'}
 ].map(a=>({...a,tradeable:true}));
 for(const id of [1,2,3])for(const [key,value] of [[`pet_collection_v1:${id}`,{revision:1,pets:{'PET-HEUKGU':3}}],[`pet_potentials_v1:${id}`,{revision:4,pets:{'PET-HEUKGU':{potential:'MAGNET',attempts:7}}}],[`mercenary_experience_transfer_v1:${id}`,{revision:2,usedCodes:['V-971']}]] )sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(key,JSON.stringify(value));
 sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(AUCTION_USER_POLICY_KEY,JSON.stringify({...AUCTION_USER_DRAFT,enabled:true}));
 const env={DB};await prepareUserAuctionSchema(env);let clock=Date.UTC(2026,10,3,8),legacy=false;
 const catalog=async user=>assets.map(a=>{let quantity=0;
 if(a.kind==='CARD')quantity=sql.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').get(user.id,a.ref)?.quantity||0;
 if(a.kind==='MERCENARY')quantity=sql.prepare('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').get(user.id,a.ref)?.total_copies||0;
 if(a.kind==='PET')quantity=JSON.parse(sql.prepare('SELECT value FROM app_meta WHERE key=?').get(`pet_collection_v1:${user.id}`).value).pets[a.ref]||0;
 if(a.kind==='EQUIPMENT')quantity=sql.prepare('SELECT 1 FROM user_equipment_instances WHERE user_id=? AND id=?').get(user.id,a.ref)?1:0;
 if(a.kind==='VEHICLE')quantity=sql.prepare('SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?').get(user.id,a.ref)?1:0;
 if(['ITEM','MASTER_STAR'].includes(a.kind))quantity=sql.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').get(user.id,a.ref)?.quantity||0;
 return {...a,quantity};}).filter(a=>a.quantity>0);
 const service=createUserAuctionService(env,{catalog,now:()=>clock,legacyActive:async()=>legacy});
 let sequence=0;const requestId=()=>`AUCTION_TEST_REQUEST_${++sequence}`;
 const user=id=>sql.prepare('SELECT * FROM users WHERE id=?').get(id);
 const host=(id,kind='ITEM',quantity=1,extra={})=>service.host(user(id),{kind,ref:assets.find(a=>a.kind===kind).ref,quantity,startPrice:1,requestId:requestId(),...extra});
 return {sql,env,faults,service,assets,catalog,user,host,requestId,now:()=>clock,advance:ms=>clock+=ms,setLegacy:value=>legacy=value,row:text=>sql.prepare(text).get(),close:()=>sql.close()};
}

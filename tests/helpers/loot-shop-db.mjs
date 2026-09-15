import {mercenaryFixture} from './mercenary-db.mjs';
import {ensureLootShopSchema,LOOT_SHOP_KEY} from '../../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../../shared/loot-shop-policy-v1.mjs';
export async function lootFixture(t,{postgres=false}={}){
 const f=await mercenaryFixture(t,{postgres});await ensureLootShopSchema(f.env);
 const schema=["CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC',limited_total INTEGER,issued_count INTEGER DEFAULT 0)","CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards","CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id))","CREATE TABLE draw_logs(draw_group_id TEXT,user_id BIGINT,pack_id TEXT,card_id TEXT,rarity TEXT,coin_used BIGINT,is_new INTEGER)"];
 if(f.DB.execSchema)await f.DB.execSchema(schema);else for(const sql of schema)await f.p(sql).run();
 await f.p("INSERT INTO cards(id,title,rarity,image_url) VALUES('ss1','슈퍼스타 검수 카드','SUPERSTAR','assets/ui/packs/superstar-card-pack-v1.png'),('fur1','FUR 검수 카드','FUR','assets/cards/monster71.jpg')").run();
 await f.p("INSERT INTO character_equipment_items(id,code,name,rarity,image_url) VALUES(37,'BATTLE_SUIT_02','F바디','SPECIAL','assets/items/pig-coin-v1.png'),(900,'MYSTIC_TEST','미스틱 검수 장비','MYSTIC','assets/items/pig-coin-v1.png')").run();
 f.document.mercenaries[0].rank='A';f.document.mercenaries[1].rank='S';await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 const shopPolicy=structuredClone(LOOT_SHOP_DEFAULTS);shopPolicy.salesEnabled=true;shopPolicy.rewardsEnabled=true;for(const s of shopPolicy.sources){s.enabled=true;}
 for(const p of shopPolicy.products){p.enabled=true;p.price=25;p.accountLimit=2;if(p.type==='SUPERSTAR_CHOICE')p.cardIds=['ss1'];if(p.type==='FUR_CHOICE')p.cardIds=['fur1'];if(p.type==='F_BODY')p.equipmentId=37;if(p.type==='MYSTIC_EQUIPMENT')p.equipmentId=900;if(p.type==='MERCENARY_PACK'){p.mercenaryCodes=f.document.mercenaries.slice(0,2).map(c=>c.code);p.mercenaryWeights={A:1,S:1};}}
 await f.setting(LOOT_SHOP_KEY,shopPolicy);await f.p('INSERT INTO pig_coin_wallets_v1(user_id,balance) VALUES(7,500),(8,500)').run();
 return {...f,shopPolicy,setShop:next=>f.setting(LOOT_SHOP_KEY,next)};
}

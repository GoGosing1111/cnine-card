import {passFixture} from './supporter-pass-fixture.mjs';
import {addApplicationFixture} from './supporter-application-fixture.mjs';
export async function packageFixture(options={}){
 const f=await addApplicationFixture(await passFixture(options),options);
 for(const [column,type] of [['subtitle','TEXT'],['description','TEXT'],['category','TEXT'],['sort_order','INTEGER']])await f.exec(`ALTER TABLE inventory_items ADD COLUMN ${column} ${type}`);
 await f.run("INSERT INTO inventory_items(code,name,category,rarity,image_url,is_active) VALUES('SUIT_CORE_7','슈트 코어 7','MATERIAL','MYTHIC','assets/items/suit-core-7-20261006.png',1)");
 await f.run("INSERT INTO inventory_items(code,name,category,rarity,image_url,is_active) VALUES('ARDEN_ENERGY','아르덴 에너지','MATERIAL','MYTHIC','assets/items/arden-energy-v1.webp',1)");
 await f.run("INSERT INTO inventory_items(code,name,category,rarity,image_url,is_active) VALUES('PET_SEAL_ORB','펫 봉인구','PACK','SSS','assets/items/pet-opening-v1/pet-seal-orb.webp',1),('PET_ESSENCE','펫 정수','MATERIAL','SSS','assets/items/pet-opening-v1/pet-essence.webp',1)");
 f.apply=(user=2,requestId=crypto.randomUUID())=>f.call('server-support/package/apply',{user,body:{requestId}});
 f.process=(order,action='FULFILL',requestId=crypto.randomUUID(),extra={})=>f.call('admin/server-support/package',{body:{orderId:order.id,expectedRevision:order.revision,action,note:'입금 확인 검수',requestId,...extra}});
 f.activate=async()=>{await f.save();await f.grant();};
 return f;
}

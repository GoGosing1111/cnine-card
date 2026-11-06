import {passFixture} from './supporter-pass-fixture.mjs';
import {addApplicationFixture} from './supporter-application-fixture.mjs';
export async function packageFixture(options={}){
 const f=await addApplicationFixture(await passFixture(options),options);
 for(const [column,type] of [['subtitle','TEXT'],['description','TEXT'],['category','TEXT'],['sort_order','INTEGER']])await f.exec(`ALTER TABLE inventory_items ADD COLUMN ${column} ${type}`);
 await f.run("INSERT INTO inventory_items(code,name,category,rarity,image_url,is_active) VALUES('SUIT_CORE_7','슈트 코어 7','MATERIAL','MYTHIC','assets/items/suit-core-7-20261006.png',1)");
 f.apply=(user=2,requestId=crypto.randomUUID())=>f.call('server-support/package/apply',{user,body:{requestId}});
 f.process=(order,action='FULFILL',requestId=crypto.randomUUID(),extra={})=>f.call('admin/server-support/package',{body:{orderId:order.id,expectedRevision:order.revision,action,note:'입금 확인 검수',requestId,...extra}});
 f.activate=async()=>{await f.save();await f.grant();};
 return f;
}

import {jointFixture} from './joint-db.mjs';
import {ensureForgeTransactionSchema} from '../../functions/_equipment_forge_transactions.js';
import {forgeRuntimeDraft,FORGE_RUNTIME_KEY} from '../../shared/equipment-forge-policy-v1.mjs';
export async function forgeFixture(t,options){
 const f=options?.base||await jointFixture(t,options);await ensureForgeTransactionSchema(f.env);const policy=forgeRuntimeDraft();policy.mode='TEST';policy.protection={itemCode:'FORGE_TEST_PROTECTION',consume:'ON_DESTROY'};policy.restoration={enabled:true,coinCost:500,itemCode:null,itemQuantity:null,levelMode:'PREVIOUS',expiresHours:0};
 for(const s of policy.steps)Object.assign(s,{successPpm:500000,maintainPpm:250000,destroyPpm:250000,coinCost:100,itemCode:'MASTER_STAR',itemQuantity:2,protectionQuantity:1});await f.setting(FORGE_RUNTIME_KEY,policy);
 for(const code of ['MASTER_STAR','FORGE_TEST_PROTECTION']){await f.p('INSERT INTO inventory_items(code,name,rarity,image_url) VALUES(?,?,?,?) ON CONFLICT(code) DO NOTHING',code,code,'SPECIAL','/test.png').run();await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,100) ON CONFLICT(user_id,item_code) DO NOTHING',code).run();}
 await f.p("INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power) VALUES(1,'TEST_WEAPON','검수 무기','WEAPON','RIFLE','MYTHIC','/test.png',10000,9000,1000)").run();
 await f.p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,request_id) VALUES(7,1,'TEST','test-instance')").run();const instanceId=String((await f.p("SELECT id FROM user_equipment_instances WHERE request_id='test-instance'").first()).id);await f.p("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'WEAPON',?)",instanceId).run();
 return {...f,policy,instanceId,qty:async code=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',code).first()).quantity)};
}

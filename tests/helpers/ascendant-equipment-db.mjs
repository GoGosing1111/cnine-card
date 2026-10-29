import {mercenaryFixture} from './mercenary-db.mjs';
import {ensureForgeTransactionSchema} from '../../functions/_equipment_forge_transactions.js';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout} from '../../functions/_mercenary_account.js';
import {saveMercenaryEquipment} from '../../functions/_mercenary_equipment.js';
import {MERCENARY_EQUIPMENT_CATALOG} from '../../shared/mercenary-equipment-v1.mjs';

// Test-only in-memory databases; this helper has no production connection path.
export async function ascendantEquipmentFixture(t,options={}){
 const f=await mercenaryFixture(t,options);await ensureForgeTransactionSchema(f.env);
 const instances=new Map();
 for(const [i,item] of MERCENARY_EQUIPMENT_CATALOG.entries()){
  const pve=Math.floor(item.totalPower*.9),id=100+i,instance=String(1000+i);
  await f.p('INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,?,?,?)',id,item.code,item.name,item.slot,item.rarity,item.image,item.totalPower,pve,item.totalPower-pve).run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(?,7,?,'ISOLATED_QA',?)",Number(instance),id,crypto.randomUUID()).run();
  instances.set(item.code,instance);
 }
 await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:'V-001',acquisitionId:crypto.randomUUID()}));
 for(const mode of ['PVE','PVP'])await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-001',revision:0});
 const revision={PVE:0,PVP:0};
 return {...f,instances,equip:async(mode,item)=>saveMercenaryEquipment(f.env,f.user,{requestId:crypto.randomUUID(),mode,slot:item.slot,instanceId:instances.get(item.code),revision:revision[mode]++})};
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';

const OP='ops:jjok-equipped-armor15:20261102:v1',NICK='[C9]족쪽이',UID='303';
const db=connect();db.connectionParameters.application_name='jjok-equipped-armor15-discovery';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const users=await q('SELECT id::text,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[UID,NICK]);
 assert.equal(users.length,1);assert.equal(users[0].id,UID);assert.equal(users[0].nickname,NICK);assert.equal(users[0].status,'ACTIVE');
 const identity=await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=$1',[UID]);assert.equal(identity.length,1);assert(identity[0].provider&&identity[0].provider_user_id);
 const equipment=await q(`SELECT l.slot,l.instance_id::text,x.user_id::text,x.equipment_id::text,i.code,i.name,i.slot AS item_slot,i.rarity,i.is_active,i.is_public,
  COALESCE(f.level,0) AS level,COALESCE(f.revision,0) AS revision,(f.instance_id IS NOT NULL) AS has_forge_state
  FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
  JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN equipment_forge_states_v1 f ON f.instance_id=x.id AND f.user_id=x.user_id
  WHERE l.user_id=$1 ORDER BY l.slot`,[UID]);
 const mercenaryLoadout=await q("SELECT key,value FROM app_meta WHERE key LIKE 'mercenary_equipment%:303%' ORDER BY key");
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%jjok%armor15%' ORDER BY key",[OP]);assert.equal(prior.length,0,'Operation may already exist; inspect receipt before any write');
 const triggers=await q("SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('equipment_forge_states_v1','user_equipment_loadout','user_equipment_instances') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname");
 const columns=await q("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('equipment_forge_states_v1','user_equipment_loadout','ranked_duo_accounts_v1','account_sync_versions_v1') ORDER BY table_name,ordinal_position");
 const targetSlots=['TOP','BOTTOM','SHOES','ACCESSORY'];
 const targets=targetSlots.map(slot=>{const rows=equipment.filter(e=>e.slot===slot);assert.equal(rows.length,1,'Expected equipped '+slot);const e=rows[0];assert.equal(e.user_id,UID);assert.equal(e.item_slot,slot);assert.equal(Number(e.is_active),1);assert.equal(Number(e.is_public),1);assert(Number.isInteger(e.level)&&e.level>=0&&e.level<=15);assert(Number.isInteger(e.revision)&&e.revision>=0&&e.revision<2147483647);return{slot,instanceId:e.instance_id,equipmentId:e.equipment_id,code:e.code,name:e.name,beforeLevel:e.level,beforeRevision:e.revision,hasForgeState:e.has_forge_state,afterLevel:15};});
 const plan={operationKey:OP,authorization:'[C9]족쪽이 장착중인 방어구,장신구 다 15강으로 변경해',recipient:{...users[0],identityHash:hash(identity[0])},scope:'CURRENT_CHARACTER_EQUIPPED_ARMOR_AND_ACCESSORY',targetSlots,targetLevel:15,targets,cost:0,automaticLoadout:false,sendMessages:false,checkedAt:new Date().toISOString()};
 const report={checkedAt:plan.checkedAt,readOnly:true,user:plan.recipient,equipment,mercenaryLoadout,prior,triggers,columns,planHash:hash(plan)};
 await db.query('ROLLBACK');for(const[name,value]of[['plan.json',plan],['preflight.json',report]])await fs.writeFile(new URL(name,import.meta.url),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({user:users[0],targets,otherEquipped:equipment.filter(e=>!targetSlots.includes(e.slot)),priorOperations:prior.length,planHash:report.planHash,triggers}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}

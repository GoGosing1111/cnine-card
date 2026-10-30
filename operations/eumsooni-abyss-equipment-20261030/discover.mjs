import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {ASCENDANT_EQUIPMENT} from '../../output/revan-live-20261027/release-checkout/shared/mercenary-ascendant-equipment-v1.mjs';
const OP='ops:eumsooni-abyss-equipment:20261030:v1';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const db=connect();db.connectionParameters.application_name='eumsooni-abyss-equipment-discovery';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const users=await q('SELECT id::text,nickname,role,status FROM users WHERE id=65 OR nickname=$1 ORDER BY id',['음순이']);
 assert.deepEqual(users,[{id:'65',nickname:'음순이',role:'USER',status:'ACTIVE'}]);
 const identity=await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=65');assert.equal(identity.length,1);assert.equal(hash(identity[0]),'2f77e6e1664c782d529261c6fe33038227b5a88eba0f86f414eb5a0f6bba0cc3','Known account identity changed');
 const defs=ASCENDANT_EQUIPMENT.filter(i=>i.tier===8);assert.equal(defs.length,5);
 const codes=defs.map(d=>d.code);
 const catalog=await q('SELECT id::text,code,name,slot,rarity,is_active,is_public,total_power,pve_power,pvp_power FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id',[codes]);assert.equal(catalog.length,5);
 for(const d of defs){const c=catalog.find(c=>c.code===d.code);assert(c);for(const k of ['name','slot','rarity'])assert.equal(c[k],d[k]);assert.equal(Number(c.is_active),1);assert.equal(Number(c.is_public),1);assert.equal(Number(c.total_power),d.totalPower);}
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%eumsooni%abyss%' OR key LIKE 'ops:%eumsooni%equipment%20261030%' ORDER BY key",[OP]);assert.equal(prior.length,0,'Prior grant found: inspect before doing anything');
 const holdings=await q('SELECT i.id::text AS equipment_id,i.code,(SELECT COUNT(*)::int FROM user_equipment_instances x WHERE x.user_id=65 AND x.equipment_id=i.id) actual_quantity,COALESCE(c.quantity,0)::text AS cached_quantity FROM character_equipment_items i LEFT JOIN user_equipment_counts_v1 c ON c.user_id=65 AND c.equipment_id=i.id WHERE i.code=ANY($1::text[]) ORDER BY i.id',[codes]);for(const h of holdings)assert.equal(h.actual_quantity,Number(h.cached_quantity));
 const triggers=await q("SELECT t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE t.tgrelid='user_equipment_instances'::regclass AND NOT t.tgisinternal ORDER BY t.tgname");
 const columns=await q("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('user_equipment_instances','user_equipment_counts_v1','equipment_forge_states_v1','ranked_duo_accounts_v1') ORDER BY table_name,ordinal_position");
 const plan={operationKey:OP,authorization:'음순이 계정에 용병장비 한피스씩 지급; 최종 정정: 8단계 심연성좌 이거로 지급해라',delivery:'DIRECT',recipients:[{...users[0],identityHash:hash(identity[0])}],tier:8,setName:'심연성좌',totalQuantity:5,cost:0,automaticLoadout:false,sendMessages:false,grants:defs.map(d=>({userId:'65',nickname:'음순이',equipmentId:catalog.find(c=>c.code===d.code).id,code:d.code,name:d.name,slot:d.slot,quantity:1}))};
 const report={readOnly:true,checkedAt:new Date().toISOString(),user:plan.recipients[0],catalog,holdings,prior,triggers,columns,planHash:hash(plan)};
 await db.query('ROLLBACK');
 for(const [name,value] of [['plan.json',plan],['preflight.json',report]])await fs.writeFile(new URL('./'+name,import.meta.url),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({user:users[0],holdings,catalog:catalog.map(({id,code,name,slot})=>({id,code,name,slot})),planHash:report.planHash,priorOperations:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}

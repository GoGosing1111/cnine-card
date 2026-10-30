import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,ACTION='OPS_MERCENARY_EQUIPMENT_GRANT',IDS=['65'];
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const EQUIPMENT_IDS=PLAN.grants.map(g=>g.equipmentId);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
const requestId=g=>`${OP}:65:${g.code}:1`;
function validate(expected){
 assert.equal(expected,HASH,'Pinned plan required');
 assert.equal(OP,'ops:eumsooni-abyss-equipment:20261030:v1');assert.equal(PLAN.tier,8);assert.equal(PLAN.setName,'심연성좌');
 assert.equal(PLAN.totalQuantity,5);assert.equal(PLAN.cost,0);assert.equal(PLAN.automaticLoadout,false);assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.delivery,'DIRECT');
 assert.equal(PLAN.recipients.length,1);const t=one(PLAN.recipients);assert.deepEqual([t.id,t.nickname,t.role,t.status],['65','음순이','USER','ACTIVE']);
 assert.deepEqual(PLAN.grants.map(g=>[g.userId,g.nickname,g.equipmentId,g.code,g.name,g.slot,g.quantity]),[
  ['65','음순이','156','MERC_ASC_08_WEAPON','심연성좌 무기','WEAPON',1],
  ['65','음순이','157','MERC_ASC_08_TOP','심연성좌 상의','TOP',1],
  ['65','음순이','158','MERC_ASC_08_BOTTOM','심연성좌 하의','BOTTOM',1],
  ['65','음순이','159','MERC_ASC_08_SHOES','심연성좌 신발','SHOES',1],
  ['65','음순이','160','MERC_ASC_08_ACCESSORY','심연성좌 장신구','ACCESSORY',1]
 ]);
}
export async function state(c){
 const fields={
  users:'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=65',
  identity:'SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=65',
  catalog:'SELECT * FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id',
  equipment:'SELECT * FROM user_equipment_instances WHERE user_id=65 AND equipment_id=ANY($1::bigint[]) ORDER BY equipment_id,id',
  equipmentCounts:'SELECT user_id,equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=65 ORDER BY equipment_id',
  forge:'SELECT * FROM equipment_forge_states_v1 WHERE user_id=65 ORDER BY instance_id',
  equipmentLoadout:'SELECT * FROM user_equipment_loadout WHERE user_id=65 ORDER BY slot',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=65 ORDER BY item_code',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=65',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=65 ORDER BY mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=65 ORDER BY mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=65 ORDER BY mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=65',
  settings:"SELECT key,value FROM app_meta WHERE key LIKE 'mercenary%:65:%' OR key LIKE 'equipment_polish_instance_v1:65:%' OR key IN ('mercenary_pvp_loadout_v1:65','mercenary_dual_loadout_v2:65','ranked_series_roster_v1:65') ORDER BY key",
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=65',
  ranked:'SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=65'
 };
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) AS data`,[EQUIPMENT_IDS])).data;
 s.identity=s.identity.map(row=>({identityHash:hash(row)}));return s;
}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT jsonb_build_object(
 'receipt',${arr('SELECT key FROM app_meta WHERE key=$1')},
 'equipment',${arr('SELECT id::text FROM user_equipment_instances WHERE user_id=65 AND equipment_id=ANY($2::bigint[]) AND (source_id=$1 OR request_id LIKE $3) ORDER BY id')},
 'audit',${arr('SELECT id::text FROM admin_logs WHERE action_type=$4 AND target_id=$1')}) AS data`,[OP,EQUIPMENT_IDS,OP+':%',ACTION])).data;}
export const protectedState=s=>({...s,equipment:undefined,sync:undefined,ranked:undefined,equipmentCounts:s.equipmentCounts.filter(x=>!EQUIPMENT_IDS.includes(String(x.equipment_id)))});
export async function verify(c,r,{exact=false}={}){
 r??=await receipt(c);validate(HASH);assert(r,'Receipt required');assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.grants.length,5);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c);assert.equal(one(s.users).id,'65');assert.equal(one(s.identity).identityHash,one(PLAN.recipients).identityHash);
 for(const p of PLAN.grants){
  const g=one(r.grants.filter(g=>g.code===p.code));for(const k of Object.keys(p))assert.deepEqual(g[k],p[k]);assert.equal(g.quantityAfter-g.quantityBefore,1);
  const item=one(s.equipment.filter(x=>String(x.id)===g.instanceId));assert.equal(String(item.user_id),'65');assert.equal(String(item.equipment_id),g.equipmentId);assert.equal(item.source_type,'ADMIN');assert.equal(item.source_id,OP);assert.equal(item.request_id,requestId(g));
  if(exact){assert.equal(s.equipment.filter(x=>String(x.equipment_id)===g.equipmentId).length,g.quantityAfter);assert.equal(Number(one(s.equipmentCounts.filter(x=>String(x.equipment_id)===g.equipmentId)).quantity),g.quantityAfter);assert.equal(s.forge.filter(x=>String(x.instance_id)===g.instanceId).length,0);}
 }
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...saved}=r;assert.deepEqual(parse(audit.after_data),saved);
 assert.deepEqual(Object.fromEntries(Object.entries(await artifacts(c)).map(([k,v])=>[k,v.length])),{receipt:1,equipment:5,audit:1});
 if(exact)assert.equal(hash(protectedState(s)),r.protectedBeforeHash);
 return {status:'VERIFIED',userId:'65',nickname:'음순이',tier:8,setName:'심연성좌',totalQuantity:5,parts:5,auditId:r.auditId,automaticLoadout:false};
}
// Caller owns the database transaction and the live USER_LOCK lease.
export async function grant(c,expected,{lockDeadline,leaseToken}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};validate(expected);
 assert(lockDeadline>Date.now()+20000,'Live account lease required');assert.match(leaseToken,/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);const existing=await receipt(c);if(existing)return {replayed:true,receipt:existing,verification:await verify(c,existing)};
 const checkLease=async()=>{one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=65 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));assert(lockDeadline>Date.now()+5000);};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=65 FOR UPDATE');await checkLease();
 one(await q(c,'SELECT id FROM users WHERE id=65 FOR UPDATE'));
 one(await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=65 FOR SHARE'));
 await q(c,'SELECT id FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[EQUIPMENT_IDS]);
 await q(c,'SELECT user_id FROM user_equipment_counts_v1 WHERE user_id=65 ORDER BY equipment_id FOR UPDATE');
 const before=await state(c),u=one(before.users),t=one(PLAN.recipients);
 for(const k of ['id','nickname','role','status'])assert.equal(u[k],t[k],`Recipient ${k} changed`);assert.equal(one(before.identity).identityHash,t.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',['음순이'])).id,'65');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Prior/orphan grant artifacts');
 const grants=[];
 for(const p of PLAN.grants){
  const item=one(before.catalog.filter(x=>String(x.id)===p.equipmentId));for(const k of ['code','name','slot'])assert.equal(item[k],p[k]);assert.equal(Number(item.is_active),1);assert.equal(Number(item.is_public),1);
  const n=before.equipment.filter(x=>String(x.equipment_id)===p.equipmentId).length;assert.equal(Number(before.equipmentCounts.find(x=>String(x.equipment_id)===p.equipmentId)?.quantity||0),n);
  const row=one(await q(c,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(65,$1,'ADMIN',$2,$3) RETURNING id::text",[p.equipmentId,OP,requestId(p)]));
  grants.push({...p,quantityBefore:n,quantityAfter:n+1,instanceId:row.id});
 }
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before),'Unrelated account data changed');
 assert.deepEqual(after.equipment.filter(x=>!grants.some(g=>g.instanceId===String(x.id))),before.equipment,'Existing equipment changed');
 assert(BigInt(one(after.sync).domains.inventory)>BigInt(one(before.sync).domains.inventory||0),'Inventory synchronization did not advance');
 if(before.ranked.length)assert(BigInt(one(after.ranked).source_version)>BigInt(one(before.ranked).source_version));
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),grants,syncBefore:before.sync,syncAfter:after.sync,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),preserved:{currency:true,otherInventory:true,mercenaryCards:true,growth:true,equipmentLoadouts:true,mercenaryLoadouts:true,existingEquipment:true,enhancement:true,polish:true,catalog:true},automaticLoadout:false,messagesSent:0};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({userId:'65',counts:grants.map(g=>({code:g.code,quantity:g.quantityBefore})),protectedHash:r.protectedBeforeHash}),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),r.completedAt]));
 const verification=await verify(c,r,{exact:true});await checkLease();return {replayed:false,receipt:r,verification};
}

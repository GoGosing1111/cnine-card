import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./event-prizes-20261023.json',import.meta.url),'utf8'));
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const OP=PLAN.operationKey,ACTION='OPS_EVENT_PRIZES_20261023',HASH=hash(PLAN),IDS=PLAN.recipients.map(u=>u.id);
const cards=PLAN.grants.filter(g=>g.kind==='MERCENARY'),equipment=PLAN.grants.filter(g=>g.kind==='EQUIPMENT'),coins=PLAN.grants.filter(g=>g.kind==='COIN');
const CODES=['V-979','V-988','V-989'];
const SETTINGS=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_halloween_pack_v1','mercenary_kairon_craft_v1','mercenary_jokro_craft_v1'];
const REASON=PLAN.title+' ('+OP+')';
const COIN_CUTOFF=PLAN.inspectedAt.slice(0,19).replace('T',' ');
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
const aid=(g,i=0)=>`${OP}:${g.userId}:${g.code}:${i+1}`;
const same=(x,g)=>String(x.user_id)===g.userId&&(x.mercenary_code===g.code||String(x.equipment_id)===g.equipmentId);
function validate(expected){
 assert.equal(expected,HASH);assert.equal(IDS.length,13);assert.equal(new Set(IDS).size,13);assert.equal(PLAN.grants.length,16);
 assert.deepEqual(PLAN.totals,{recipients:13,grantRows:16,mercenaries:10,equipment:3,coin:'500000000000000',stockConsumed:1});
 assert.equal(cards.reduce((s,g)=>s+g.quantity,0),10);assert.equal(equipment.reduce((s,g)=>s+g.quantity,0),3);
 assert.equal(String(coins.reduce((s,g)=>s+BigInt(g.amount),0n)),PLAN.totals.coin);
 assert.deepEqual(cards.filter(g=>g.stockPolicy==='CONSUME_ONE').map(g=>[g.userId,g.code,g.quantity]),[['4391','V-989',1]]);
 assert(cards.filter(g=>g.userId!=='4391').every(g=>g.stockPolicy==='EXEMPT'));
 assert.equal(cards.find(g=>g.userId==='5008'&&g.code==='V-989').quantity,2);
 assert.equal(coins.find(g=>g.userId==='4627').amount,'200000000000000');
 assert.equal(PLAN.automaticLoadout,false);assert.equal(PLAN.cost,0);
}
export async function state(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($2::text[]) ORDER BY code',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($2::text[]) ORDER BY code,serial',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  craft:"SELECT output_ref,COUNT(*)::text AS rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text AS crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=ANY($2::text[]) GROUP BY output_ref ORDER BY output_ref",
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  equipment:'SELECT * FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id IN (48,49) ORDER BY user_id,equipment_id,id',
  equipmentCounts:'SELECT user_id,equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,equipment_id',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  accountSettings:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key LIKE 'mercenary%:'||u.id::text||':%' OR key='mercenary_pvp_loadout_v1:'||u.id::text OR key='mercenary_halloween_ss_once_v1:'||u.id::text) ORDER BY key"
 };
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) AS data`,[IDS,CODES,SETTINGS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
const protectedState=s=>({...s,
 users:s.users.map(u=>coins.some(g=>g.userId===u.id)?{...u,coin:'INTENDED_CREDIT'}:u),
 cards:s.cards.filter(x=>!cards.some(g=>same(x,g))),
 stock:s.stock.filter(x=>x.code!=='V-989'),issues:s.issues.filter(x=>x.request_id!==OP),
 equipment:s.equipment.filter(x=>x.source_id!==OP),equipmentCounts:s.equipmentCounts.filter(x=>!equipment.some(g=>same(x,g)))
});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT jsonb_build_object('receipt',${arr('SELECT key FROM app_meta WHERE key=$1')},'acquisitions',${arr('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $2')},'issues',${arr('SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE request_id=$1')},'equipment',${arr('SELECT id::text FROM user_equipment_instances WHERE user_id=ANY($5::bigint[]) AND equipment_id IN (48,49) AND (source_id=$1 OR request_id LIKE $2)')},'coins',${arr('SELECT id::text FROM coin_logs WHERE created_at>=$6 AND user_id=ANY($5::bigint[]) AND reason=$4')},'audit',${arr('SELECT id::text FROM admin_logs WHERE action_type=$3 AND target_id=$1')}) AS data`,[OP,OP+':%',ACTION,REASON,IDS,COIN_CUTOFF])).data;}
export async function verify(c,r,{exact=false}={}){
 validate(HASH);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.grants.length,16);assert.equal(r.acquisitions.length,10);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c),a=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']);assert.equal(a.length,10);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[r.grants.filter(g=>g.kind==='COIN').map(g=>g.coinLogId)]);assert.equal(logs.length,4);assert(logs.every(l=>l.reason===REASON));
 for(const p of PLAN.grants){
  const g=one(r.grants.filter(g=>g.userId===p.userId&&g.code===p.code));for(const key of Object.keys(p))assert.deepEqual(g[key],p[key]);
  if(p.kind==='MERCENARY'){
   assert.equal(g.copiesAfter-g.copiesBefore,p.quantity);
   const h=one(s.cards.filter(x=>same(x,p)));assert(Number(h.total_copies)>=g.copiesAfter);assert.equal(Number(h.duplicate_count),Number(h.total_copies)-1);if(exact)assert.equal(Number(h.total_copies),g.copiesAfter);
   for(let i=0;i<p.quantity;i++){const row=one(a.filter(x=>x.acquisition_id===aid(p,i)));assert.equal(String(row.user_id),p.userId);assert.equal(row.mercenary_code,p.code);assert.equal(Number(row.total_copies_after),g.copiesBefore+i+1);assert.equal(Number(row.duplicate_count_after),g.copiesBefore+i);assert.equal(Number(row.is_duplicate),g.copiesBefore+i>0?1:0);assert.equal(row.created_at,r.completedAt);}
  }else if(p.kind==='EQUIPMENT'){
   assert.equal(g.quantityAfter-g.quantityBefore,1);const instance=one(s.equipment.filter(x=>String(x.id)===g.instanceId));assert(same(instance,p));assert.equal(instance.source_type,'ADMIN');assert.equal(instance.source_id,OP);assert.equal(instance.request_id,aid(p));
   if(exact){assert.equal(s.equipment.filter(x=>same(x,p)).length,g.quantityAfter);assert.equal(Number(one(s.equipmentCounts.filter(x=>same(x,p))).quantity),g.quantityAfter);}
  }else{
   assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(p.amount));const log=one(logs.filter(x=>x.id===g.coinLogId));assert.equal(log.user_id,p.userId);assert.equal(log.change_amount,p.amount);assert.equal(log.balance_after,g.after);assert.equal(log.admin_id,'1');if(exact)assert.equal(one(s.users.filter(u=>u.id===p.userId)).coin,g.after);
  }
 }
 const issue=one(s.issues.filter(x=>x.request_id===OP));assert.equal(String(issue.user_id),'4391');assert.equal(issue.code,'V-989');assert.equal(issue.acquisition_id,aid(cards.find(g=>g.userId==='4391')));assert.equal(Number(issue.serial),Number(r.jinmuStockBefore.issued)+1);assert.equal(issue.created_at,r.completedAt);
 assert.deepEqual(r.jinmuStockAfter,{...r.jinmuStockBefore,issued:Number(r.jinmuStockBefore.issued)+1,revision:Number(r.jinmuStockBefore.revision)+1,last_token:r.stockClaim});
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...recorded}=r;assert.deepEqual(parse(audit.after_data),recorded);
 const art=await artifacts(c);assert.deepEqual(Object.fromEntries(Object.entries(art).map(([k,v])=>[k,v.length])),{receipt:1,acquisitions:10,issues:1,equipment:3,coins:4,audit:1});
 if(exact){assert.equal(hash(protectedState(s)),r.protectedBeforeHash);assert.deepEqual(one(s.stock.filter(x=>x.code==='V-989')),r.jinmuStockAfter);}
 return {status:'VERIFIED',recipients:13,mercenaries:10,equipment:3,coin:PLAN.totals.coin,stockConsumed:1,limitedIssueRecordsAdded:1,craftCountsChanged:false,acquisitionRecords:10,coinLogs:4,auditRecords:1};
}
// The caller holds live USER_LOCK and PostgreSQL leases and owns COMMIT/ROLLBACK.
export async function grant(c,expected,{lockDeadline,leaseToken}={}){
 validate(expected);const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert(lockDeadline>Date.now()+20000,'Live account leases required');assert.match(leaseToken,/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);const existing=await receipt(c);if(existing)return {replayed:true,receipt:existing,verification:await verify(c,existing)};
 const checkLeases=async()=>{assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,IDS.length);assert(lockDeadline>Date.now()+5000);};
 await checkLeases();assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,IDS.length);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[CODES]);
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 await q(c,'SELECT user_id FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,equipment_id FOR UPDATE',[IDS]);
 const catalog=await q(c,'SELECT id::text,code,name,slot,is_active,is_public FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[['48','49']]);
 for(const g of equipment){const e=one(catalog.filter(e=>e.id===g.equipmentId));assert.equal(e.code,g.code);assert.equal(e.name,g.name);assert.equal(e.slot,'BATTLE_SUIT');assert.equal(Number(e.is_active),1);assert.equal(Number(e.is_public),1);}
 const before=await state(c);assert.equal(before.users.length,IDS.length);
 for(const t of PLAN.recipients){const u=one(before.users.filter(u=>u.id===t.id));for(const key of ['nickname','role','status','identityHash'])assert.equal(u[key],t[key],`Recipient ${t.id} ${key} changed`);assert.equal(u.status,'ACTIVE');}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[])',[PLAN.recipients.map(u=>u.nickname)]);assert.equal(exact.length,IDS.length);for(const t of PLAN.recipients)assert.equal(one(exact.filter(u=>u.nickname===t.nickname)).id,t.id);
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Prior/orphan operation artifacts');
 one(await q(c,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
 for(const g of coins){const b=BigInt(one(before.users.filter(u=>u.id===g.userId)).coin);assert(b>=0n&&b+BigInt(g.amount)<=BigInt(Number.MAX_SAFE_INTEGER));}
 for(const g of equipment)assert.equal(before.equipment.filter(x=>same(x,g)).length,Number(before.equipmentCounts.find(x=>same(x,g))?.quantity||0));
 const stockBefore=one(before.stock.filter(x=>x.code==='V-989'));assert(Number(stockBefore.stock_limit)-Number(stockBefore.issued)>=1,'Jinmu shop sold out');
 const now=new Date().toISOString(),grants=[],acquisitions=[],stockClaim=randomUUID();
 for(const g of cards){
  const old=before.cards.find(x=>same(x,g))||null,n=Number(old?.total_copies||0);assert(Number.isSafeInteger(n)&&n>=0&&n+g.quantity<2147483647);if(old)assert.equal(Number(old.duplicate_count),n-1);
  for(let i=0;i<g.quantity;i++){
   const holding=one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *',[g.userId,g.code,now]));assert.equal(Number(holding.total_copies),n+i+1);assert.equal(Number(holding.duplicate_count),n+i);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
   const id=aid(g,i);one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[id,g.userId,g.code,n+i>0?1:0,n+i+1,n+i,now]));acquisitions.push(id);
   if(g.stockPolicy==='CONSUME_ONE'){
    const stock=one(await q(c,"UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$1 WHERE code='V-989' AND issued+1<=stock_limit AND issued=$2 AND revision=$3 RETURNING issued::text",[stockClaim,stockBefore.issued,stockBefore.revision]));
    one(await q(c,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[id,OP,g.userId,g.code,stock.issued,now]));
   }
  }
  grants.push({...g,copiesBefore:n,copiesAfter:n+g.quantity,holdingBefore:old});
 }
 for(const g of equipment){const n=before.equipment.filter(x=>same(x,g)).length;const e=one(await q(c,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES($1,$2,'ADMIN',$3,$4) RETURNING id::text",[g.userId,g.equipmentId,OP,aid(g)]));grants.push({...g,quantityBefore:n,quantityAfter:n+1,instanceId:e.id});}
 for(const g of coins){const b=one(before.users.filter(u=>u.id===g.userId)).coin;const u=one(await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=$1 RETURNING coin::text',[g.userId,g.amount]));assert.equal(BigInt(u.coin)-BigInt(b),BigInt(g.amount));const log=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,$2,$3,$4,1) RETURNING id::text',[g.userId,g.amount,u.coin,REASON]));grants.push({...g,before:b,after:u.coin,coinLogId:log.id});}
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before),'Unintended state change');
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,grants,acquisitions,stockClaim,jinmuStockBefore:stockBefore,jinmuStockAfter:one(after.stock.filter(x=>x.code==='V-989')),protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),preserved:{otherStock:true,craftCounts:true,packAndCraftSettings:true,otherCards:true,existingEquipment:true,inventory:true,loadouts:true,levels:true,growth:true,accountSettings:true}};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({protectedHash:r.protectedBeforeHash,jinmuStock:stockBefore}),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));const verification=await verify(c,r,{exact:true});await checkLeases();return {replayed:false,receipt:r,verification};
}

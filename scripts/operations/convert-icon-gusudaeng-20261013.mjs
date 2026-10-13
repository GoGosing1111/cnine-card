// Explicit one-time conversion. No startup hook, schema migration or new grants.
import assert from 'node:assert/strict';
import {ICON_LIVE_CARDS} from '../../shared/icon-fusion-policy-v1.mjs';
export const SOURCE_ID='CN-0505936A0CBB4E59',CARD_ID='CN-1C000009';
export const OPERATION_KEY='icon_gusudaeng_conversion_20261013_v1';
const card=ICON_LIVE_CARDS.find(c=>c.cardId===CARD_ID);
const settingsKeys=['breakthrough_config','zenith_master_star_breakthrough_v1802','icon_fusion_settings_v1','icon_role_settings_v1','icon_cms_v1'];
const q=async(c,s,p=[])=>(await c.query(s,p)).rows;
const json=v=>typeof v==='string'?JSON.parse(v):v;
const limits={ICON:2,SUPERSTAR:1,ZENITH:2,FUR:2,PRESTIGE:2};
const rank=Object.fromEntries(['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR','ICON'].map((g,i)=>[g,i]));
const ids=value=>{const rows=json(value);assert.ok(Array.isArray(rows),'Invalid saved deck');return rows.map(x=>String(typeof x==='object'?(x.id??x.card_id):x));};
export function refundTable(settings){
 const get=key=>json(settings.find(x=>x.key===key)?.value);
 const low=get('breakthrough_config')?.ZENITH,high=get('zenith_master_star_breakthrough_v1802')?.steps;
 assert.equal(low?.length,10);assert.equal(high?.length,3);
 const costs=[...low.map(x=>x.cost),...high.map(x=>x.retirementShardRefund)],out=[0];
 for(const value of costs){assert.ok(Number.isSafeInteger(value)&&value>=0,'Invalid retirement refund');out.push(out.at(-1)+value);}
 return out;
}
export function replacementDeck(beforeValue,owned){
 const before=ids(beforeValue);assert.ok(before.includes(SOURCE_ID),'Only source-containing decks may change');
 const available=owned.filter(c=>c.id!==SOURCE_ID&&Number(c.quantity)>0);
 const byId=new Map(available.map(c=>[c.id,c])),used=new Set(),count={},after=before.map(id=>{
  const c=byId.get(id),grade=c?.grade;if(!c||used.has(id)||(limits[grade]&&count[grade]>=limits[grade]))return null;
  used.add(id);count[grade]=(count[grade]||0)+1;return id;
 });
 assert.equal(after.length,5,'Saved deck must have five slots');
 const candidates=[...available].sort((a,b)=>(rank[b.grade]??-1)-(rank[a.grade]??-1)||Number(b.breakthrough_level)-Number(a.breakthrough_level)||Number(b.base_power)-Number(a.base_power)||a.id.localeCompare(b.id));
 for(let i=0;i<5;i++)if(!after[i]){
  const c=candidates.find(c=>!used.has(c.id)&&(!limits[c.grade]||(count[c.grade]||0)<limits[c.grade]));assert.ok(c,'Insufficient eligible owned cards for a complete replacement deck');
  after[i]=c.id;used.add(c.id);count[c.grade]=(count[c.grade]||0)+1;
 }
 assert.equal(new Set(after).size,5);return {before,after};
}
export function replacementRiftState(raw,before,after){
 const state=json(raw),hp={...(state.hp||{})};
 // Preserve the rift's remaining HP value. Missing source HP means dead (0),
 // never a fresh/full-health replacement. Preserve a lower existing value.
 for(let i=0;i<before.length;i++)if(before[i]!==after[i]){
  const old=Math.max(0,Math.min(100,Number(hp[before[i]])||0));
  hp[after[i]]=Object.hasOwn(hp,after[i])?Math.min(old,Math.max(0,Number(hp[after[i]])||0)):old;
 }
 delete hp[SOURCE_ID];return {...state,hp};
}
async function decks(c){
 const out=[],like='%'+SOURCE_ID+'%';
 for(const table of ['pve_decks','pvp_decks','pvp_deck_presets'])for(const row of await q(c,`SELECT * FROM ${table} WHERE card_ids LIKE $1 ORDER BY user_id`,[like]))out.push({table,field:'card_ids',row});
 for(const row of await q(c,"SELECT * FROM pve_rift_runs WHERE status='ACTIVE' AND deck_cards LIKE $1 ORDER BY user_id",[like]))out.push({table:'pve_rift_runs',field:'deck_cards',row});
 for(const row of await q(c,"SELECT w.* FROM territory_war_v3_users w JOIN territory_war_v3_rounds r ON r.id=w.round_id WHERE r.status IN ('RECRUITING','PREPARING','ACTIVE') AND w.deck_snapshot LIKE $1 ORDER BY w.user_id",[like]))out.push({table:'territory_war_v3_users',field:'deck_snapshot',row});
 return out;
}
export async function inspect(c){
 const receipt=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0]?.value;
 const cards=await q(c,'SELECT * FROM cards WHERE id=ANY($1::text[]) ORDER BY id',[[SOURCE_ID,CARD_ID,'card-0075',...ICON_LIVE_CARDS.slice(0,8).map(c=>c.cardId)]]);
 const holdings=await q(c,'SELECT * FROM user_cards WHERE card_id=$1 ORDER BY user_id',[SOURCE_ID]);
 const savedDecks=await decks(c),userIds=[...new Set([...holdings.map(x=>Number(x.user_id)),...savedDecks.map(x=>Number(x.row.user_id))])].sort((a,b)=>a-b);
 const users=userIds.length?await q(c,'SELECT id,card_shards,(SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id=users.id AND uc.quantity>0) owned_count FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[userIds]):[];
 const owned=userIds.length?await q(c,"SELECT uc.user_id,uc.card_id id,uc.quantity,uc.breakthrough_level,c.rarity grade,c.base_power FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=ANY($1::bigint[]) AND uc.quantity>0 AND c.is_active=1 AND c.card_status='PUBLIC' AND m.is_active=1 ORDER BY uc.user_id,c.id",[userIds]):[];
 const settings=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]);
 const advancements=await q(c,'SELECT * FROM card_unique_advancements_v1937 WHERE card_id=$1 ORDER BY user_id',[SOURCE_ID]);
 const evolution=await q(c,'SELECT * FROM card_evolution_progress WHERE source_card_id=$1 ORDER BY user_id',[SOURCE_ID]);
 return {receipt:receipt?json(receipt):null,cards,holdings,users,userIds,owned,settings,advancements,evolution,decks:savedDecks};
}
export function plan(snapshot){
 const source=snapshot.cards.find(c=>c.id===SOURCE_ID);assert.equal(source?.title,'구수댕');assert.equal(Number(source.member_id),4);assert.equal(source.rarity_override,'ZENITH');assert.equal(Number(source.is_active),1);
 assert.ok(!snapshot.cards.some(c=>c.id===CARD_ID),'Unreceipted target card already exists');
 const refunds=refundTable(snapshot.settings);
 const holders=snapshot.holdings.map(h=>{const level=Number(h.breakthrough_level||0);assert.ok(Number.isInteger(level)&&level>=0&&level<refunds.length);return {...h,refund:Number(h.quantity)>0?refunds[level]:0};});
 const repairs=snapshot.decks.map(d=>{
  const user=snapshot.users?.find(u=>Number(u.id)===Number(d.row.user_id));
  // An account with zero owned cards has an already invalid, stale saved deck.
  // Clear only ordinary saved decks, with a full snapshot; never grant cards or
  // silently cancel an active expedition to fill an impossible formation.
  if(user&&Number(user.owned_count)===0&&['pve_decks','pvp_decks','pvp_deck_presets'].includes(d.table))return {...d,before:ids(d.row[d.field]),after:[],clearEmpty:true};
  return {...d,...replacementDeck(d.row[d.field],snapshot.owned.filter(c=>Number(c.user_id)===Number(d.row.user_id)))};
 });
 return {holders,repairs,refunds,totalRefund:holders.reduce((n,h)=>n+h.refund,0),copies:holders.reduce((n,h)=>n+Math.max(0,Number(h.quantity)),0)};
}
export async function apply(c,{dryRun=false,lockToken,lockDeadline=0}={}){
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='4s'");await c.query("SET LOCAL statement_timeout='25s'");
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const existing=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0]?.value;
  if(existing){await c.query('ROLLBACK');return {...json(existing),replayed:true,dryRun};}
  // The same account leases as gameplay, plus database serialization of all
  // ownership and saved-deck writers. No unrelated game switches are changed.
  await c.query('LOCK TABLE cards,user_cards,pve_decks,pvp_decks,pvp_deck_presets,pve_rift_runs,territory_war_v3_users,card_unique_advancements_v1937,card_evolution_progress IN SHARE ROW EXCLUSIVE MODE');
  const before=await inspect(c),p=plan(before);
  assert.ok(lockToken&&lockDeadline>Date.now()+30000,'Missing/expired gameplay account leases');
  const leased=await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[before.userIds,lockToken,Date.now()+30000]);
  assert.equal(leased.length,before.userIds.length,'Affected users changed or account lease missing');
  const lockedUsers=await q(c,'SELECT id,card_shards FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[before.userIds]);
  // Background rewards can change balances before row locking, independently
  // of account action leases. Audit the locked balance, never a stale read.
  const lockedById=new Map(lockedUsers.map(u=>[Number(u.id),u]));
  before.users=before.users.map(u=>({...u,...lockedById.get(Number(u.id))}));
  const member=(await q(c,'SELECT name,is_active FROM members WHERE id=4 FOR SHARE'))[0];assert.equal(member?.name,'남수댕');assert.equal(Number(member.is_active),1);
  const owner=(await q(c,"SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1"))[0];assert.ok(owner);
  const catalogBefore={};
  for(const table of ['card_pack_cards','card_acquisition_effects','card_unique_effects'])catalogBefore[table]=await q(c,`SELECT * FROM ${table} WHERE card_id=$1`,[SOURCE_ID]);
  catalogBefore.deck_synergies=await q(c,'SELECT * FROM deck_synergies WHERE required_card_ids LIKE $1',['%'+SOURCE_ID+'%']);
  for(const table of ['alchemy_reward_pool_v1','unified_drop_entries_v1667'])catalogBefore[table]=await q(c,`SELECT * FROM ${table} WHERE UPPER(reward_type)='CARD' AND reward_ref=$1`,[SOURCE_ID]);
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY+':catalog',JSON.stringify(catalogBefore)]);
  const snapshots=before.userIds.map(userId=>({key:OPERATION_KEY+':user:'+userId,value:JSON.stringify({operation:OPERATION_KEY,user:before.users.find(x=>Number(x.id)===userId),holdings:p.holders.filter(x=>Number(x.user_id)===userId),advancements:before.advancements.filter(x=>Number(x.user_id)===userId),evolution:before.evolution.filter(x=>Number(x.user_id)===userId),decks:p.repairs.filter(x=>Number(x.row.user_id)===userId)})}));
  await c.query('INSERT INTO app_meta(key,value,updated_at) SELECT x.key,x.value,CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb) AS x(key text,value text)',[JSON.stringify(snapshots)]);
  const changes=p.holders.filter(h=>h.refund>0).map(h=>({user_id:Number(h.user_id),amount:h.refund}));
  const updated=await q(c,'UPDATE users u SET card_shards=u.card_shards+x.amount FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,amount bigint) WHERE u.id=x.user_id RETURNING u.id,u.card_shards',[JSON.stringify(changes)]);assert.equal(updated.length,changes.length);
  const updatedById=new Map(updated.map(u=>[Number(u.id),Number(u.card_shards)]));
  for(const change of changes)assert.equal(updatedById.get(change.user_id),Number(lockedById.get(change.user_id).card_shards)+change.amount,'Locked refund balance mismatch');
  const refundLogs=await q(c,'INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT x.user_id,x.amount,u.card_shards,$2,$3 FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,amount bigint) JOIN users u ON u.id=x.user_id RETURNING id',[JSON.stringify(changes),OPERATION_KEY,SOURCE_ID]);
  for(const d of p.repairs){
   const value=JSON.stringify(d.after),user=Number(d.row.user_id);let result;
   if(d.clearEmpty)result=await c.query(`DELETE FROM ${d.table} WHERE user_id=$1 AND card_ids=$2${d.table==='pvp_deck_presets'?' AND preset_no=$3':''}`,[user,d.row[d.field],...(d.table==='pvp_deck_presets'?[d.row.preset_no]:[])]);
   else if(d.table==='pve_decks'||d.table==='pvp_decks')result=await c.query(`UPDATE ${d.table} SET card_ids=$1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$2 AND card_ids=$3`,[value,user,d.row[d.field]]);
   else if(d.table==='pvp_deck_presets')result=await c.query('UPDATE pvp_deck_presets SET card_ids=$1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$2 AND preset_no=$3 AND card_ids=$4',[value,user,d.row.preset_no,d.row[d.field]]);
   else if(d.table==='pve_rift_runs')result=await c.query("UPDATE pve_rift_runs SET deck_cards=$1,state_json=$2,updated_at=CURRENT_TIMESTAMP WHERE run_id=$3 AND status='ACTIVE' AND deck_cards=$4",[value,JSON.stringify(replacementRiftState(d.row.state_json,d.before,d.after)),d.row.run_id,d.row[d.field]]);
   else result=await c.query('UPDATE territory_war_v3_users SET deck_snapshot=$1,formation_breakdown_json=$2,loadout_refreshed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE round_id=$3 AND user_id=$4 AND deck_snapshot=$5',[value,JSON.stringify({version:2,deckComplete:true,repairPending:'ROSTER_CARD_RETIREMENT_V2056_PENDING'}),d.row.round_id,user,d.row[d.field]]);
   assert.equal(result.rowCount,1,'Saved deck changed during conversion');
  }
  await c.query('DELETE FROM card_pack_cards WHERE card_id=$1',[SOURCE_ID]);await c.query('DELETE FROM card_acquisition_effects WHERE card_id=$1',[SOURCE_ID]);
  await c.query('UPDATE card_unique_effects SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE card_id=$1',[SOURCE_ID]);
  await c.query('UPDATE deck_synergies SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE is_active=1 AND required_card_ids LIKE $1',['%'+SOURCE_ID+'%']);
  await c.query("UPDATE alchemy_reward_pool_v1 SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE UPPER(reward_type)='CARD' AND reward_ref=$1",[SOURCE_ID]);
  await c.query("UPDATE unified_drop_entries_v1667 SET is_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE UPPER(reward_type)='CARD' AND reward_ref=$1",[SOURCE_ID]);
  await c.query('DELETE FROM card_unique_advancements_v1937 WHERE card_id=$1',[SOURCE_ID]);await c.query('DELETE FROM card_evolution_progress WHERE source_card_id=$1',[SOURCE_ID]);
  const removed=await c.query('DELETE FROM user_cards WHERE card_id=$1',[SOURCE_ID]);assert.equal(removed.rowCount,before.holdings.length);
  await c.query("UPDATE cards SET is_active=0,card_status='RETIRED',draw_weight=0,reroll_material_enabled=0,reroll_result_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[SOURCE_ID]);
  await c.query("INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,batch_name,batch_date,base_power,reroll_material_enabled,reroll_result_enabled) VALUES($1,4,'구수댕','FUR','ICON',$2,50,50,1,0,'PUBLIC','구수댕 ICON','2026-10-13',180000,0,0)",[CARD_ID,card.sourceArt]);
  assert.deepEqual(await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]),before.settings,'Existing settings changed');
  const preserved=before.cards.filter(x=>x.id!==SOURCE_ID);
  assert.deepEqual(await q(c,'SELECT * FROM cards WHERE id=ANY($1::text[]) ORDER BY id',[preserved.map(x=>x.id)]),preserved,'Unrelated cards changed');
  assert.equal((await decks(c)).length,0,'Unrepaired source decks remain');
  assert.equal(Number((await q(c,'SELECT COUNT(*) n FROM user_cards WHERE card_id=$1',[SOURCE_ID]))[0].n),0);
  const receipt={operation:OPERATION_KEY,status:'COMPLETED',completedAt:new Date().toISOString(),sourceCardId:SOURCE_ID,targetCardId:CARD_ID,holders:p.holders.filter(h=>Number(h.quantity)>0).length,removedCopies:p.copies,refundedUsers:changes.length,totalRefundShards:p.totalRefund,refundByLevel:p.refunds,rewrittenDecks:Object.fromEntries([...new Set(p.repairs.map(d=>d.table))].map(t=>[t,p.repairs.filter(d=>d.table===t&&!d.clearEmpty).length])),clearedEmptyDecks:p.repairs.filter(d=>d.clearEmpty).length,snapshots:snapshots.length,sourceCatalogBefore:before.cards.find(x=>x.id===SOURCE_ID),settingsPreserved:true,unrelatedCardsPreserved:true,iconGrants:0,fusionEligible:true};
  receipt.snapshotUserIds=before.userIds;receipt.refundLogIds=refundLogs.map(x=>String(x.id));
  const logs=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ICON_CONVERSION','CARD',$2,$3,$4) RETURNING id",[owner.id,SOURCE_ID,JSON.stringify({sourceCard:receipt.sourceCatalogBefore,snapshotPrefix:OPERATION_KEY+':user:'}),JSON.stringify(receipt)]);receipt.auditId=String(logs[0].id);
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.ok(lockDeadline>Date.now()+5000,'Account lease expired before commit');
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}
}

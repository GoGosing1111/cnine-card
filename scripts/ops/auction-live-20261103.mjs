import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {AUCTION_USER_SCHEMA} from '../../functions/_auction_user_service.js';
import {AUCTION_GROWTH_TRIGGER_SQL} from './auction-user-schema-20261103.mjs';
import {accountSyncTriggersSql} from './account-sync-schema-20261015.mjs';
import {AUCTION_TICKET,AUCTION_TICKET_IMAGE,AUCTION_USER_POLICY_KEY,prepareAuctionTicketShop} from '../../shared/auction-user-policy-v1.mjs';
import {AUCTION_LIVE_DEFAULT} from '../../functions/_auction_user_policy.js';
import {validateLootShopPolicy} from '../../shared/loot-shop-policy-v1.mjs';
import {validateRankedShopPolicy} from '../../shared/ranked-shop-policy-v1.mjs';
export const OP='ops:auction-user-live:20261103:v1';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function stageAuctionLive(db,{dryRun=true}={}){
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='8s'");for(const sql of AUCTION_USER_SCHEMA)await db.query(sql);
  await db.query('INSERT INTO auction_user_clock_v1(id,version) VALUES(1,0) ON CONFLICT(id) DO NOTHING');
  await db.query(AUCTION_GROWTH_TRIGGER_SQL);await db.query(accountSyncTriggersSql(['user_garage_vehicles']));
  const tables=AUCTION_USER_SCHEMA.map(sql=>sql.match(/^CREATE TABLE IF NOT EXISTS ([a-z0-9_]+)/)?.[1]).filter(Boolean);
  const grants=(await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='auctions_v1553' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')")).rows;
  for(const row of grants){assert(/^[A-Za-z0-9_]+$/.test(row.grantee));await db.query(`GRANT ${row.privilege_type} ON ${tables.join(',')} TO "${row.grantee}"`);}
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,tables,grantCount:grants.length,accountWrites:0,growthTrigger:true,vehicleSyncTriggers:3};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function activateAuctionLive(db,{authorization,preflight,sourceCommit,dryRun=true,failAt=''}={}){
 assert.equal(authorization,OP);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);assert(preflight?.bgmHash);
 const existing=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(existing)return {replayed:true,receipt:JSON.parse(existing.value)};
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='15s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);await db.query('SELECT id FROM auction_user_clock_v1 WHERE id=1 FOR UPDATE');
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  assert.equal((await db.query("SELECT id FROM auctions_v1553 WHERE status IN ('ACTIVE','SCHEDULED')")).rowCount,0,'Existing auction must finish before activation');
  assert.equal((await db.query('SELECT id FROM auction_user_lots_v1 LIMIT 1')).rowCount,0,'Unexpected new auction before activation');
  assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[AUCTION_USER_POLICY_KEY])).rowCount,0,'Auction policy already exists');
  const bgm=(await db.query('SELECT * FROM auction_bgm_rules_v1554 WHERE auction_id=0 ORDER BY sort_order,min_bid,id')).rows;assert.equal(hash(bgm),preflight.bgmHash,'BGM changed: re-review');
  const schema=(await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND ((tgrelid='user_cards'::regclass AND tgname='cnine_auction_card_growth_v1') OR (tgrelid='user_garage_vehicles'::regclass AND tgname IN ('cnine_sync_insert_v1','cnine_sync_update_v1','cnine_sync_delete_v1'))) ")).rows;assert.equal(schema.length,4,'Required growth and account sync triggers');
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner);
  const policies={};for(const [key,shop,validate]of [['loot_shop_policy_v1','LOOT',validateLootShopPolicy],['ranked_shop_policy_v1','RANKED',validateRankedShopPolicy]]){
   const before=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value;assert.equal(before,preflight.policies.find(p=>p.key===key)?.value,'Shop configuration changed: re-review');const old=JSON.parse(before),next=prepareAuctionTicketShop(old,shop);next.revision=old.revision+1;next.products.at(-1).enabled=true;next.products.at(-1).visible=true;const checked=validate(next);assert.deepEqual(checked.products.slice(0,-1),old.products);assert.equal(checked.salesEnabled,old.salesEnabled);assert.deepEqual(checked.sources,old.sources);
   assert.equal((await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(checked),key,before])).rowCount,1);policies[key]={beforeHash:hash(old),afterHash:hash(checked),revision:checked.revision,ticket:checked.products.at(-1),salesEnabled:checked.salesEnabled};
  }
  if(failAt==='shops')throw Error('INJECTED_AFTER_SHOPS');
  assert.equal((await db.query('SELECT code FROM inventory_items WHERE code=$1',[AUCTION_TICKET])).rowCount,0,'Ticket already registered');
  await db.query("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,'경매 개최 티켓','유저 경매 개최','본인 보유 물품을 등록해 2시간 경매를 개최합니다. 진행 중이면 순서대로 예약됩니다. 경매장에서 자동 사용됩니다.','TICKET','SPECIAL',$2,9700,1)",[AUCTION_TICKET,AUCTION_TICKET_IMAGE]);
  const policy={...structuredClone(AUCTION_LIVE_DEFAULT),revision:1,enabled:true,operatorEnabled:true,operation:OP};await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[AUCTION_USER_POLICY_KEY,JSON.stringify(policy)]);
  const receipt={operation:OP,sourceCommit,policies,policy,bgmCount:bgm.length,bgmHash:hash(bgm),accountWrites:0,messagesSent:0,contentRewardSources:[],priorAuctionHistoryPreserved:true};
  const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'AUCTION_USER_LIVE','APP_META',$2,$3,$4) RETURNING id,created_at",[owner.id,OP,JSON.stringify(preflight.policies.filter(p=>p.key.includes('shop'))),JSON.stringify(receipt)])).rows[0];receipt.auditId=String(audit.id);receipt.appliedAt=String(audit.created_at);await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);
  assert.equal(hash((await db.query('SELECT * FROM auction_bgm_rules_v1554 WHERE auction_id=0 ORDER BY sort_order,min_bid,id')).rows),preflight.bgmHash);
  if(failAt==='receipt')throw Error('INJECTED_AFTER_RECEIPT');await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}

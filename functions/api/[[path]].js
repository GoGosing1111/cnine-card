import { SCHEMA } from '../_data/schema.js';
import { MEMBERS, CARDS, PACKS, RATES } from '../_data/seed.js';
import { handleEvolution } from '../_evolution.js';
import { handleCaptain } from '../_captain.js';
import { handleSealBattle } from '../_seal_battle.js';
import { handleBattleV2Preview,createPveBattleV2,createPvpBattleV2 } from '../_battle_v2_preview.js';
import { handleMagic,magicSettings,magicBattleLoadout,magicBattleLoadouts,ensureMagicRewardFoundation,resolveMagicCrystalReward,magicRewardForRank,magicRewardForTowerFloor,cardUniqueSettings,cardUniqueVisibleTo,cardUniqueDeckState,cardUniqueDeckStates,resolveUniqueBattleRuntime } from '../_magic.js';
import { handleStorageCleanup, scheduleBoundedStorageMaintenance } from '../_storage_cleanup.js';
import { handleEquipment,userEquipmentBonuses,grantEquipmentDrop,publicEquippedTitleMap,ensureEquipmentFoundation,invalidateEquipmentPromotionCache } from '../_equipment.js';
import { handleVehicleDraw } from '../_vehicle_draw.js';
import { handleHighGradeReroll,grantHighGradeRerollDrop } from '../_high_grade_reroll.js';
import { handleTerritoryWar } from '../_territory_war.js';
import { handleAuction } from '../_auction.js';
import { handleSiege } from '../_siege.js';
import { handleChief } from '../_chief.js';
import { handleBlackMiracleAdmin,openBlackMiraclePack,rollBlackMiracleDrop } from '../_black_miracle_pack.js';
import { handleIdleDungeon } from '../_idle_dungeon.js';
import { handleCoinPrediction } from '../_coin_prediction.js';
import { handleDropPool,resolveUnifiedDrops } from '../_drop_pool.js';
import { handleWorkshop } from '../_workshop.js';
import { handleScrapyard } from '../_scrapyard.js';
import { breakthroughPityRule } from '../_breakthrough_pity.js';
import { normalizeUltimateRequiredGrade,selectActivatedUltimate } from '../_ultimate.js';
import { normalizeNightmareSettings,nightmareProgressionKey,nightmareProgressionPlan,pveDifficultyRuntime } from '../_pve_nightmare.js';
import { defaultRaidSettingsV1293,cleanRaidSettingsV1293,raidScheduleStateV1293,raidCombatSnapshotV1293,ensureRaidOverhaulV1293,snapshotRaidInstanceV1293,raidInstanceSettingsV1293,raidInstanceSlotV1293,raidSlotEntryCountV1293,raidSlotEntryCountsV1296,finalizeRaidV1293,raidFinalParticipantV1293,ensureRaidUserRewardPlanV1293,raidInventoryGrantStatementsV1293,raidRewardDisplayV1293 } from '../_raid_overhaul.js';
import { createPlaydkIdentityClient,PlaydkApiError } from '../_playdk_client.js';
async function safeEquipmentDrop(env,payload){try{return await grantEquipmentDrop(env,payload)}catch(error){console.error('character equipment drop failed',error);return null}}
async function safeUnifiedDrop(env,payload){try{return await resolveUnifiedDrops(env,payload)}catch(error){console.error('unified drop resolution failed',error);return null}}
async function safePveUnifiedDrop(env,payload){
  const sourceType=String(payload.sourceType||'PVE').toUpperCase();
  if(payload.isNightmare){
    const nightmareSource=sourceType==='PVE_AUTO'?'PVE_NIGHTMARE_AUTO':'PVE_NIGHTMARE';
    const dedicated=await safeUnifiedDrop(env,{...payload,sourceType:nightmareSource});
    if(dedicated&&dedicated.skipped!=='NO_ACTIVE_BINDING')return dedicated;
  }
  return safeUnifiedDrop(env,{...payload,sourceType});
}

const SCORE={C:1,U:5,R:20,SR:50,HR:100,UR:200,SSR:500,MA:1500,LIMITED:3000,PRESTIGE:3100,FUR:5000,ZENITH:8000};
const ORDER={C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,LIMITED:9,PRESTIGE:10,FUR:11,ZENITH:12};
function drawIntegrityHash(input=''){
  let hash=0x811c9dc5;
  const text=String(input);
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return hash.toString(16).padStart(8,'0');
}
function isTransientD1Error(error){
  const message=String(error?.message||error||'').toLowerCase();
  return message.includes('d1 db is overloaded')
    || message.includes('requests queued for too long')
    || message.includes('database is locked')
    || message.includes('sqlite_busy')
    || message.includes('too many requests')
    || message.includes('temporarily unavailable')
    || message.includes('internal error; reference')
    || Number(error?.status)===429
    || Number(error?.status)===503;
}
function drawIntegrityCanonical(response){
  const protocol=response?.drawProtocol||{};
  const results=Array.isArray(response?.results)?response.results:[];
  return JSON.stringify({
    version:Number(protocol.version||0),
    requestId:String(response?.requestId||''),
    packId:String(protocol.packId||''),
    count:Number(protocol.count||0),
    grantVerified:protocol.grantVerified===true,
    results:results.map((item,index)=>({
      slot:Number(item?.slot??index),
      granted:item?.granted===true,
      grantVerified:item?.grantVerified===true,
      cardId:String(item?.card?.id||''),
      grade:String(item?.card?.grade||item?.card?.rarity||'').toUpperCase(),
      title:String(item?.card?.title||''),
      duplicate:Boolean(item?.duplicate),
      shardGained:Number(item?.shardGained||0),
      masterStarGained:Number(item?.masterStarGained||0),
      quantityBefore:Number(item?.quantityBefore??-1),
      quantityAfter:Number(item?.quantityAfter??-1)
    }))
  });
}
const RARITIES=['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH'];
const DRAW_RARITIES=['C','U','R','SR','HR','UR','SSR','MA','FUR','ZENITH','LIMITED'];
// V1272: 특정 멤버/카드는 일반 카드팩 뽑기 결과에서 완전히 제외한다.
// DB의 공개/활성/확률 설정은 유지하되 실제 후보 풀에서 이중 차단하여 CMS 설정 실수에도 지급되지 않는다.
const RANDOM_DRAW_EXCLUDED_KEYWORDS=['철구'];
function normalizedRandomCardText(card={}){return `${card?.name||''} ${card?.title||''}`.normalize('NFKC').replace(/\s+/g,'')}
function isRandomDrawExcluded(card={}){const text=normalizedRandomCardText(card);return RANDOM_DRAW_EXCLUDED_KEYWORDS.some(keyword=>text.includes(String(keyword).normalize('NFKC').replace(/\s+/g,'')))}
function randomDrawPool(rows=[]){return (Array.isArray(rows)?rows:[]).filter(card=>!isRandomDrawExcluded(card))}
const SHARD_REWARD={C:1,U:2,R:4,SR:8,HR:15,UR:30,SSR:60,MA:120,LIMITED:180,PRESTIGE:220,FUR:250,ZENITH:400};
const BREAKTHROUGH_COST=[50,100,200,350,550,800,1100,1450,1850,2300];
const BREAKTHROUGH_RATE=[100,100,100,80,65,50,35,25,15,8];
const BREAKTHROUGH_GRADES=['SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH'];
const breakthroughMaxLevel=()=>10;
const BREAKTHROUGH_MIN_ORDER=ORDER.SR;
const BATTLE_POWER_DEFAULT={C:100,U:160,R:250,SR:400,HR:620,UR:900,SSR:1300,MA:1850,LIMITED:2800,PRESTIGE:3100,FUR:3200,ZENITH:5500};
const BATTLE_BREAKTHROUGH_DEFAULT=[0,18,42,72,108,150,198,252,312,378,450,528,612,702];
const MA_MASTER_STAR_BREAKTHROUGH_DEFAULT={enabled:true,steps:[{cost:1,rate:85,retirementShardRefund:3000},{cost:3,rate:50,retirementShardRefund:4000},{cost:5,rate:25,retirementShardRefund:5000}]};
const LIMITED_MASTER_STAR_BREAKTHROUGH_DEFAULT={enabled:true,steps:[{cost:5,rate:50,retirementShardRefund:3000},{cost:10,rate:30,retirementShardRefund:4000},{cost:15,rate:20,retirementShardRefund:5000}]};
let maMasterStarBreakthroughCache=null;
let limitedMasterStarBreakthroughCache=null;
let recentHighGradeCache=null;
let recentEquipmentFeedCache=null;
let collectionRankingCache=null;
// v1361 burst protection: tiny in-isolate caches only. Authoritative writes remain uncached.
let adminDashboardBurstCache=null;
const ADMIN_DASHBOARD_BURST_CACHE_MS=15000;
// Draw receipts contain the full result payload and are the dominant D1 storage user.
// Keep enough time for a lost response to be recovered, then drain them faster than
// the draw endpoint can create them. A shared lease still limits this to one worker.
const DRAW_RECEIPT_CLEANUP_SAMPLE_MOD=8;
const DRAW_RECEIPT_CLEANUP_BATCH=5000;
function stableSmallHash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
async function boundedDrawReceiptCleanup(env,{limit=DRAW_RECEIPT_CLEANUP_BATCH,force=false}={}){
  limit=Math.max(25,Math.min(5000,Math.floor(Number(limit)||DRAW_RECEIPT_CLEANUP_BATCH)));
  await ensureDrawReceiptV2(env);
  // One shared lease prevents every hot draw request from running cleanup.
  const lease=await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('draw_receipt_cleanup_lease_v1361',?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
    WHERE app_meta.updated_at<datetime('now','-1 minute')`).bind(String(Date.now())).run();
  if(!force&&!Number(lease?.meta?.changes||0))return {skipped:true,deleted:0};
  const statements=[
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2 WHERE status='ARCHIVED' AND updated_at<datetime('now','-5 minutes') ORDER BY updated_at LIMIT ?
    )`).bind(limit),
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2 WHERE status IN ('COMPLETED','FAILED') AND updated_at<datetime('now','-15 minutes') ORDER BY updated_at LIMIT ?
    )`).bind(limit),
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2 WHERE status='RETRYABLE' AND updated_at<datetime('now','-1 hour') ORDER BY updated_at LIMIT ?
    )`).bind(limit)
  ];
  const results=await env.DB.batch(statements);
  return {skipped:false,deleted:results.reduce((n,r)=>n+Number(r?.meta?.changes||0),0),limit};
}
function scheduleDrawReceiptCleanup(context,env,requestId){
  if(stableSmallHash(requestId)%DRAW_RECEIPT_CLEANUP_SAMPLE_MOD!==0)return;
  const job=boundedDrawReceiptCleanup(env).catch(error=>console.warn('bounded draw receipt cleanup failed',error));
  if(typeof context?.waitUntil==='function')context.waitUntil(job);
}
async function adminDashboardSnapshot(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&adminDashboardBurstCache&&adminDashboardBurstCache.expiresAt>now)return adminDashboardBurstCache.value;
  const rows=await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) count FROM users'),
    env.DB.prepare("SELECT COUNT(*) count FROM users WHERE created_at>=datetime('now','start of day')"),
    env.DB.prepare('SELECT COUNT(*) count FROM cards WHERE is_active=1'),
    env.DB.prepare("SELECT COUNT(*) count FROM draw_logs WHERE created_at>=datetime('now','-1 day')"),
    env.DB.prepare('SELECT COALESCE(SUM(coin),0) total FROM users'),
    env.DB.prepare("SELECT COUNT(*) count FROM users WHERE status!='ACTIVE' OR (banned_until IS NOT NULL AND banned_until>datetime('now'))"),
    env.DB.prepare("SELECT COUNT(*) count FROM coupons WHERE is_active=1 AND deleted_at IS NULL"),
    env.DB.prepare("SELECT SUM(CASE WHEN c.rarity='UR' THEN 1 ELSE 0 END) urOwned,SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END) ssrOwned FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE COALESCE(uc.quantity,0)>0")
  ]);
  const value={users:Number(rows[0]?.results?.[0]?.count||0),usersToday:Number(rows[1]?.results?.[0]?.count||0),cards:Number(rows[2]?.results?.[0]?.count||0),draws24h:Number(rows[3]?.results?.[0]?.count||0),totalCoin:Number(rows[4]?.results?.[0]?.total||0),banned:Number(rows[5]?.results?.[0]?.count||0),coupons:Number(rows[6]?.results?.[0]?.count||0),urOwned:Number(rows[7]?.results?.[0]?.urOwned||0),ssrOwned:Number(rows[7]?.results?.[0]?.ssrOwned||0)};
  adminDashboardBurstCache={value,expiresAt:now+ADMIN_DASHBOARD_BURST_CACHE_MS};
  return value;
}
const runtimeSettingsCache=new Map();
async function cachedRuntimeSetting(key,ttlMs,loader){
  const now=Date.now(),cached=runtimeSettingsCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.promise;
  const promise=Promise.resolve().then(loader).catch(error=>{if(runtimeSettingsCache.get(key)?.promise===promise)runtimeSettingsCache.delete(key);throw error});
  runtimeSettingsCache.set(key,{promise,expiresAt:now+Math.max(1000,Number(ttlMs)||5000)});return promise;
}
let cardCatalogCache=null,cardUniqueRowsCache=null,packCatalogCache=null;
function invalidateCatalogCaches(){cardCatalogCache=null;cardUniqueRowsCache=null;packCatalogCache=null}
let drawReceiptV2ReadyPromise=null;
let furFirstPityV1291ReadyPromise=null;
let drawBrowserLeaseReadyPromise=null;
const DRAW_BROWSER_LEASE_MS=15000;

async function ensureDrawBrowserLease(env){
  if(drawBrowserLeaseReadyPromise)return drawBrowserLeaseReadyPromise;
  drawBrowserLeaseReadyPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_browser_lease_v1480 (
      user_id INTEGER PRIMARY KEY,browser_id TEXT NOT NULL,lease_until_ms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_active_lock_v1480 (
      user_id INTEGER PRIMARY KEY,request_id TEXT NOT NULL,lease_until_ms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_draw_active_lock_release_v1480
      AFTER UPDATE OF status ON draw_request_receipts_v2 WHEN NEW.status<>'PENDING'
      BEGIN DELETE FROM draw_active_lock_v1480 WHERE user_id=NEW.user_id AND request_id=NEW.request_id; END`),
    env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_draw_active_lock_delete_v1480
      AFTER DELETE ON draw_request_receipts_v2
      BEGIN DELETE FROM draw_active_lock_v1480 WHERE user_id=OLD.user_id AND request_id=OLD.request_id; END`)
  ]).then(()=>true).catch(error=>{drawBrowserLeaseReadyPromise=null;throw error});
  return drawBrowserLeaseReadyPromise;
}

async function claimDrawActiveLock(env,userId,requestId){
  const now=Date.now(),leaseUntil=now+120000;
  const result=await env.DB.prepare(`INSERT INTO draw_active_lock_v1480(user_id,request_id,lease_until_ms,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
    WHERE draw_active_lock_v1480.request_id=excluded.request_id OR draw_active_lock_v1480.lease_until_ms<=?`)
    .bind(userId,requestId,leaseUntil,now).run();
  return Number(result?.meta?.changes||0)===1;
}

async function claimDrawBrowserLease(env,userId,browserId){
  const now=Date.now(),leaseUntil=now+DRAW_BROWSER_LEASE_MS;
  const result=await env.DB.prepare(`INSERT INTO draw_browser_lease_v1480(user_id,browser_id,lease_until_ms,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET browser_id=excluded.browser_id,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
    WHERE draw_browser_lease_v1480.browser_id=excluded.browser_id OR draw_browser_lease_v1480.lease_until_ms<=?`)
    .bind(userId,browserId,leaseUntil,now).run();
  if(Number(result?.meta?.changes||0)===1)return {allowed:true,retryAfterMs:0};
  const state=await env.DB.prepare('SELECT lease_until_ms FROM draw_browser_lease_v1480 WHERE user_id=?').bind(userId).first();
  return {allowed:false,retryAfterMs:Math.max(1000,Number(state?.lease_until_ms||0)-now)};
}

let messageRewardClaimV1222ReadyPromise=null;
async function ensureMessageRewardClaimV1222(env){
  if(messageRewardClaimV1222ReadyPromise)return messageRewardClaimV1222ReadyPromise;
  messageRewardClaimV1222ReadyPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_message_reward_claim_receipts_v1222 (
        reward_id INTEGER PRIMARY KEY,
        message_id INTEGER NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        reward_type TEXT NOT NULL,
        reward_amount INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT NOT NULL UNIQUE,
        balance_before INTEGER NOT NULL DEFAULT 0,
        balance_after INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'MESSAGE_CLAIM',
        credited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_message_reward_claim_receipts_user_v1222 ON user_message_reward_claim_receipts_v1222(user_id,credited_at,reward_id)'),
      env.DB.prepare('DROP TRIGGER IF EXISTS trg_user_message_reward_coin_claim_v1221'),
      env.DB.prepare('DROP TRIGGER IF EXISTS trg_user_message_reward_shards_claim_v1221'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1222_message_reward_direct_claim','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{messageRewardClaimV1222ReadyPromise=null;throw error});
  return messageRewardClaimV1222ReadyPromise;
}
function messageRewardClaimToken(){
  try{return globalThis.crypto?.randomUUID?.()||`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`}catch{return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`}
}

const VERIFIED_MESSAGE_REWARD_TYPES={
  COIN:{label:'코인',icon:'🪙',inventory:false,max:100000000,messageType:'COIN_REWARD'},
  SHARDS:{label:'카드 조각',icon:'🧩',inventory:false,max:100000000,messageType:'SHARD_REWARD'},
  MASTER_STAR:{label:'마스터의 별',icon:'⭐',inventory:true,max:100000,messageType:'ITEM_REWARD'},
  PREMIUM_CUBE:{label:'프리미엄 큐브',icon:'💎',inventory:true,max:100000,messageType:'ITEM_REWARD'},
  EQUIPMENT_SUPPLY_BOX:{label:'장비 보급상자',icon:'📦',inventory:true,max:100000,messageType:'ITEM_REWARD'},
  HIGH_GRADE_REROLL_TICKET:{label:'고등급 재뽑기권',icon:'♻️',inventory:true,max:100000,messageType:'ITEM_REWARD'}
};
function verifiedMessageRewardSpec(value){const type=String(value||'').trim().toUpperCase();return VERIFIED_MESSAGE_REWARD_TYPES[type]?{type,...VERIFIED_MESSAGE_REWARD_TYPES[type]}:null}
let verifiedRewardMessageV1276ReadyPromise=null;
async function ensureVerifiedRewardMessageV1276(env){
  if(verifiedRewardMessageV1276ReadyPromise)return verifiedRewardMessageV1276ReadyPromise;
  verifiedRewardMessageV1276ReadyPromise=(async()=>{
    await ensureMessageRewardClaimV1222(env);
    await ensureEquipmentFoundation(env);
    const [marker,info,indexRow]=await Promise.all([
      env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1276_verified_reward_messages'").first(),
      env.DB.prepare('PRAGMA table_info(user_messages)').all(),
      env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_messages_campaign_user_v1276'").first()
    ]);
    const columns=new Set((info.results||[]).map(row=>String(row.name||'').toLowerCase()));
    if(marker?.value==='1'&&columns.has('campaign_key')&&indexRow?.name)return true;
    if(!columns.has('campaign_key')){
      try{await env.DB.prepare('ALTER TABLE user_messages ADD COLUMN campaign_key TEXT').run()}
      catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error}
    }
    await env.DB.batch([
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_messages_campaign_user_v1276 ON user_messages(user_id,campaign_key) WHERE campaign_key IS NOT NULL AND TRIM(campaign_key)<>''"),
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('MASTER_STAR','마스터의 별','MASTER STAR','MA 강화와 진화에 사용하는 특별 재화입니다.','MATERIAL','MA','',5,1)"),
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1)"),
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('EQUIPMENT_SUPPLY_BOX','장비 보급상자','EQUIPMENT SUPPLY BOX','장비·카드 조각·코인 중 하나를 획득합니다.','SUPPLY_BOX','HIGH','assets/ui/packs/supply-high.jpeg',35,1)"),
      env.DB.prepare("UPDATE inventory_items SET is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code IN ('MASTER_STAR','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX')"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1276_verified_reward_messages','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{verifiedRewardMessageV1276ReadyPromise=null;throw error});
  return verifiedRewardMessageV1276ReadyPromise;
}
async function claimMessageRewardDirectV1222(env,user,reward,messageId,{allowClaimedRecovery=false}={}){
  await ensureVerifiedRewardMessageV1276(env);
  const rewardType=String(reward?.reward_type||'').toUpperCase();
  const spec=verifiedMessageRewardSpec(rewardType);
  const rewardAmount=Math.max(0,Math.floor(Number(reward?.reward_amount||0)));
  if(!spec||rewardAmount<=0)throw new Error('지원하지 않는 메시지 보상입니다.');
  const current=await env.DB.prepare('SELECT id,coin,card_shards FROM users WHERE id=?').bind(user.id).first();
  if(!current)throw new Error('보상을 받을 계정을 찾을 수 없습니다.');
  let balanceBefore=0;
  if(spec.inventory){
    const inventory=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,rewardType).first();
    balanceBefore=Number(inventory?.quantity||0);
  }else balanceBefore=rewardType==='COIN'?Number(current.coin||0):Number(current.card_shards||0);
  const existingReceipt=await env.DB.prepare('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?').bind(reward.id,user.id).first();
  if(existingReceipt){
    const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    let balanceAfter=0;
    if(spec.inventory){const inventory=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,rewardType).first();balanceAfter=Number(inventory?.quantity||0)}
    else balanceAfter=rewardType==='COIN'?Number(updated?.coin||0):Number(updated?.card_shards||0);
    return {credited:false,duplicate:true,receipt:existingReceipt,updated,balanceBefore:Number(existingReceipt.balance_before||0),balanceAfter,rewardLabel:spec.label,itemCode:spec.inventory?rewardType:null};
  }
  const alreadyClaimed=String(reward?.claimed_at||'').trim()!=='';
  if(alreadyClaimed&&!allowClaimedRecovery){
    const error=new Error('이미 수령 처리된 메시지입니다. 기존 실패 건은 지급 재확인이 필요합니다.');
    error.code='MESSAGE_REWARD_REPAIR_REQUIRED';
    throw error;
  }
  const token=messageRewardClaimToken();
  const source=alreadyClaimed?'V1221_FAILED_CLAIM_RECOVERY':'MESSAGE_CLAIM';
  const claimCondition=alreadyClaimed?"claimed_at IS NOT NULL AND TRIM(claimed_at)<>''":"(claimed_at IS NULL OR TRIM(claimed_at)='')";
  const insertReceipt=env.DB.prepare(`INSERT OR IGNORE INTO user_message_reward_claim_receipts_v1222
    (reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
    SELECT id,message_id,user_id,UPPER(reward_type),reward_amount,?,?,?,?
    FROM user_message_rewards
    WHERE id=? AND user_id=? AND ${claimCondition}`)
    .bind(token,balanceBefore,balanceBefore,source,reward.id,user.id);
  const tokenExists=`EXISTS(SELECT 1 FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=? AND claim_token=?)`;
  let balanceUpdate,logInsert,receiptBalanceUpdate;
  if(spec.inventory){
    balanceUpdate=env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${tokenExists}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`)
      .bind(user.id,rewardType,rewardAmount,rewardAmount,reward.id,user.id,token);
    logInsert=env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,?,i.quantity,'MESSAGE_REWARD','USER_MESSAGE',? FROM cnine_user_inventory i
      WHERE i.user_id=? AND i.item_code=? AND ${tokenExists}`)
      .bind(user.id,rewardType,rewardAmount,String(messageId),user.id,rewardType,reward.id,user.id,token);
    receiptBalanceUpdate=env.DB.prepare(`UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),credited_at=CURRENT_TIMESTAMP WHERE reward_id=? AND user_id=? AND claim_token=?`)
      .bind(user.id,rewardType,reward.id,user.id,token);
  }else{
    balanceUpdate=rewardType==='COIN'
      ?env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${tokenExists}`).bind(rewardAmount,user.id,reward.id,user.id,token)
      :env.DB.prepare(`UPDATE users SET card_shards=card_shards+? WHERE id=? AND ${tokenExists}`).bind(rewardAmount,user.id,reward.id,user.id,token);
    const logReason=`MESSAGE_REWARD#${Number(reward.id)}`;
    logInsert=rewardType==='COIN'
      ?env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=? AND ${tokenExists}`).bind(rewardAmount,logReason,user.id,reward.id,user.id,token)
      :env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,?,card_shards,? FROM users WHERE id=? AND ${tokenExists}`).bind(rewardAmount,logReason,user.id,reward.id,user.id,token);
    receiptBalanceUpdate=rewardType==='COIN'
      ?env.DB.prepare(`UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=(SELECT coin FROM users WHERE id=?),credited_at=CURRENT_TIMESTAMP WHERE reward_id=? AND user_id=? AND claim_token=?`).bind(user.id,reward.id,user.id,token)
      :env.DB.prepare(`UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=(SELECT card_shards FROM users WHERE id=?),credited_at=CURRENT_TIMESTAMP WHERE reward_id=? AND user_id=? AND claim_token=?`).bind(user.id,reward.id,user.id,token);
  }
  const markClaimed=env.DB.prepare(`UPDATE user_message_rewards SET claimed_at=COALESCE(NULLIF(claimed_at,''),CURRENT_TIMESTAMP) WHERE id=? AND user_id=? AND ${tokenExists}`).bind(reward.id,user.id,reward.id,user.id,token);
  const hideMessage=env.DB.prepare(`UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP),hidden_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${tokenExists}`).bind(messageId,user.id,reward.id,user.id,token);
  const batch=await env.DB.batch([insertReceipt,balanceUpdate,logInsert,receiptBalanceUpdate,markClaimed,hideMessage]);
  const receipt=await env.DB.prepare('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=? AND claim_token=?').bind(reward.id,user.id,token).first();
  if(!receipt||!batch?.[1]?.meta?.changes){
    const existing=await env.DB.prepare('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?').bind(reward.id,user.id).first();
    if(existing){
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      let balanceAfter=0;
      if(spec.inventory){const inventory=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,rewardType).first();balanceAfter=Number(inventory?.quantity||0)}
      else balanceAfter=rewardType==='COIN'?Number(updated?.coin||0):Number(updated?.card_shards||0);
      return {credited:false,duplicate:true,receipt:existing,updated,balanceBefore:Number(existing.balance_before||0),balanceAfter,rewardLabel:spec.label,itemCode:spec.inventory?rewardType:null};
    }
    throw new Error('메시지 보상 지급 트랜잭션을 완료하지 못했습니다. 메시지는 수령 처리되지 않았습니다.');
  }
  if(rewardType==='COIN'){
    try{await env.DB.prepare('UPDATE wago_extension_reward_receipts SET balance_after=(SELECT coin FROM users WHERE id=? ) WHERE message_id=? AND user_id=?').bind(user.id,messageId,user.id).run()}catch{}
  }
  const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  let balanceAfter=0;
  if(spec.inventory){const inventory=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,rewardType).first();balanceAfter=Number(inventory?.quantity||0)}
  else balanceAfter=rewardType==='COIN'?Number(updated?.coin||0):Number(updated?.card_shards||0);
  return {credited:true,duplicate:false,receipt,updated,balanceBefore,balanceAfter,rewardLabel:spec.label,itemCode:spec.inventory?rewardType:null};
}

async function canSafelyRecoverFailedMessageRewardV1222(env,user,reward,messageId){
  if(String(reward?.reward_type||'').toUpperCase()!=='COIN')return false;
  try{
    const row=await env.DB.prepare('SELECT balance_before,balance_after,amount FROM wago_extension_reward_receipts WHERE message_id=? AND user_id=? LIMIT 1').bind(messageId,user.id).first();
    if(!row)return false;
    const current=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    return Number(row.amount||0)===Number(reward.reward_amount||0)&&Number(row.balance_after||0)===Number(row.balance_before||0)&&Number(current?.coin||0)===Number(row.balance_before||0);
  }catch{return false}
}

let prestigeCardStorageReadyPromise=null;
async function ensurePrestigeCardStorage(env){
  if(prestigeCardStorageReadyPromise)return prestigeCardStorageReadyPromise;
  prestigeCardStorageReadyPromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1210_prestige_storage'").first();
    if(marker?.value==='1')return true;
    if(!await columnExists(env,'cards','rarity_override')){
      try{
        await env.DB.prepare('ALTER TABLE cards ADD COLUMN rarity_override TEXT').run();
        schemaColumnCache.add('cards:rarity_override');
      }catch(error){
        if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error;
      }
    }
    await env.DB.batch([
      env.DB.prepare(`CREATE VIEW IF NOT EXISTS cards_effective_v1210 AS
        SELECT id,member_id,title,COALESCE(NULLIF(rarity_override,''),rarity) AS rarity,image_url,focus_x,focus_y,is_active,created_by,created_at,updated_at,
          power_type,base_power,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,rarity AS storage_rarity,rarity_override
        FROM cards`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_rarity_override ON cards(rarity_override,is_active,card_status)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1210_prestige_storage','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{prestigeCardStorageReadyPromise=null;throw error});
  return prestigeCardStorageReadyPromise;
}

async function ensureDrawReceiptV2(env){
  if(drawReceiptV2ReadyPromise)return drawReceiptV2ReadyPromise;
  drawReceiptV2ReadyPromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1168_r7_draw_receipts'").first();
    if(marker?.value==='1')return true;
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_request_receipts_v2 (
        request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,pack_id TEXT NOT NULL DEFAULT '',draw_count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING',cost INTEGER NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_receipts_v2_cleanup_v1723 ON draw_request_receipts_v2(status,updated_at,request_id)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1168_r7_draw_receipts','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{drawReceiptV2ReadyPromise=null;throw error});
  return drawReceiptV2ReadyPromise;
}

async function ensureFurFirstPityV1291(env){
  if(furFirstPityV1291ReadyPromise)return furFirstPityV1291ReadyPromise;
  furFirstPityV1291ReadyPromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1291_fur_first_pity'").first();
    if(marker?.value!=='1')await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_fur_first_pity (
        user_id INTEGER PRIMARY KEY,
        miss_count INTEGER NOT NULL DEFAULT 0,
        last_pack_id TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('fur_first_acquisition_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultFurFirstSettings())),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1291_fur_first_pity','1',CURRENT_TIMESTAMP)")
    ]);
    // v1417: 과거 비공개/퇴역 FUR까지 보유 수에 포함되어 보정이 잘못 종료된 계정을 복구한다.
    // 실제 FUR 추첨 풀과 동일하게 활성·공개 카드 및 활성 멤버만 보유 수로 인정한다.
    const repairMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1417_fur_first_active_pool_repair'").first();
    if(repairMarker?.value!=='1'){
      const settingsRow=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FUR_FIRST_PITY_META_KEY).first();
      let hard=defaultFurFirstSettings().hard;
      try{hard=cleanFurFirstSettings(JSON.parse(settingsRow?.value||'{}')).hard}catch{}
      await env.DB.batch([
        env.DB.prepare(`UPDATE user_fur_first_pity
          SET miss_count=MAX(COALESCE(miss_count,0),?),completed_at=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE completed_at IS NOT NULL AND (
            SELECT COUNT(DISTINCT uc.card_id)
            FROM user_cards uc
            JOIN cards_effective_v1210 c ON c.id=uc.card_id
            JOIN members m ON m.id=c.member_id
            WHERE uc.user_id=user_fur_first_pity.user_id
              AND UPPER(c.rarity)='FUR' AND COALESCE(uc.quantity,0)>0
              AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1
          )<?`).bind(Math.max(0,hard-1),FUR_FIRST_PITY_TARGET_COUNT),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1417_fur_first_active_pool_repair','1',CURRENT_TIMESTAMP)")
      ]);
    }
    return true;
  })().catch(error=>{furFirstPityV1291ReadyPromise=null;throw error});
  return furFirstPityV1291ReadyPromise;
}

const SCORE_TIER_DEFAULT=[
  {id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false},
  {id:'silver',name:'실버',min:15000,color:'#c9d4e3',aura:false},
  {id:'gold',name:'골드',min:40000,color:'#ffd15c',aura:false},
  {id:'platinum',name:'플래티넘',min:90000,color:'#5ff0df',aura:true},
  {id:'diamond',name:'다이아',min:170000,color:'#69cfff',aura:true},
  {id:'master',name:'마스터',min:300000,color:'#bd7cff',aura:true},
  {id:'grandmaster',name:'그랜드마스터',min:500000,color:'#ff6f91',aura:true}
];
function defaultTierSettings(){return {cardScoreTiers:SCORE_TIER_DEFAULT,pvp:{enabled:true,status:'ACTIVE',seasonName:'시즌 준비 중',startsAt:null,endsAt:null,tiers:SCORE_TIER_DEFAULT.map((x,i)=>({...x,min:i*500}))}}}
async function readTierSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='tier_settings_v1'").first();const base=defaultTierSettings();if(!row?.value)return base;try{const x=JSON.parse(row.value),source=Array.isArray(x.cardScoreTiers)&&x.cardScoreTiers.length?x.cardScoreTiers:base.cardScoreTiers;const cleanTiers=source.map((t,i)=>({id:String(t.id||base.cardScoreTiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||base.cardScoreTiers[i]?.name||'티어').slice(0,20),min:Math.max(0,Math.floor(Number(t.min)||0)),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):base.cardScoreTiers[i]?.color||'#7ceeff',aura:t.aura!==false})).sort((a,b)=>a.min-b.min);return {cardScoreTiers:cleanTiers,pvp:{enabled:x.pvp?.enabled!==false,status:String(x.pvp?.status||'ACTIVE').slice(0,30),seasonName:String(x.pvp?.seasonName||'시즌 준비 중').slice(0,40),startsAt:x.pvp?.startsAt||null,endsAt:x.pvp?.endsAt||null,tiers:Array.isArray(x.pvp?.tiers)&&x.pvp.tiers.length?x.pvp.tiers:base.pvp.tiers}}}catch{return base}}
async function tierSettings(env){return cachedRuntimeSetting('tier',30000,()=>readTierSettings(env))}
function resolveTier(score,tiers){let current=tiers[0]||{id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false};for(const t of tiers)if(score>=t.min)current=t;return current}



const BURNING_EVENT_META_KEY='burning_event_settings_v1';
const HYPER_BURNING_EVENT_META_KEY='hyper_burning_event_settings_v1310';
const BURNING_EVENT_CACHE_MS=1000;
let burningEventCache=null;
function defaultBurningEventSettings(){return {mode:'BURNING',theme:'RED',enabled:false,generation:0,activatedAt:null,updatedAt:null,title:'숲켓몬 버닝이 발동 되었습니다',pveMaxEnergy:15,pvpMaxEnergy:15,rechargeMinutes:2,duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:1.5};}
function defaultHyperBurningEventSettings(){return {mode:'HYPER',theme:'HYPER',enabled:false,generation:0,activatedAt:null,updatedAt:null,title:'숲켓몬 하이퍼 버닝이 발동 되었습니다',pveMaxEnergy:30,pvpMaxEnergy:30,rechargeMinutes:1,duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:2.5};}
function cleanBurningEventSettings(raw={},mode='BURNING'){
  const hyper=String(mode||raw.mode||'BURNING').toUpperCase()==='HYPER',b=hyper?defaultHyperBurningEventSettings():defaultBurningEventSettings();
  const num=(v,d,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):d));
  let title=String(raw.title||b.title).trim().slice(0,80)||b.title;
  if(title.includes('\uC528\uCF13\uBAAC'))title=title.replaceAll('\uC528\uCF13\uBAAC','숲켓몬');
  return {...b,enabled:raw.enabled===true&&(!raw.endsAt||Date.parse(raw.endsAt)>Date.now()),generation:Math.max(0,Math.floor(num(raw.generation,b.generation,0,999999999))),activatedAt:raw.activatedAt||null,updatedAt:raw.updatedAt||null,endsAt:raw.endsAt||null,title,pveMaxEnergy:Math.floor(num(raw.pveMaxEnergy,b.pveMaxEnergy,1,999)),pvpMaxEnergy:Math.floor(num(raw.pvpMaxEnergy,b.pvpMaxEnergy,1,999)),rechargeMinutes:Math.floor(num(raw.rechargeMinutes,b.rechargeMinutes,1,1440)),duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:num(raw.battleRewardMultiplier,b.battleRewardMultiplier,1,hyper?30:10)};
}
function activeBurningEvent(pair={}){
  const normal=cleanBurningEventSettings(pair.normal||{},'BURNING'),hyper=cleanBurningEventSettings(pair.hyper||{},'HYPER');
  if(hyper.enabled)return hyper;
  if(normal.enabled)return normal;
  const normalAt=Date.parse(String(normal.updatedAt||normal.activatedAt||''))||0,hyperAt=Date.parse(String(hyper.updatedAt||hyper.activatedAt||''))||0;
  return hyperAt>normalAt?hyper:normal;
}
async function burningEventPair(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&burningEventCache&&now-burningEventCache.at<BURNING_EVENT_CACHE_MS)return burningEventCache.value;
  try{
    const [normalResult,hyperResult]=await env.DB.batch([
      env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(BURNING_EVENT_META_KEY),
      env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HYPER_BURNING_EVENT_META_KEY)
    ]);
    let normal=defaultBurningEventSettings(),hyper=defaultHyperBurningEventSettings();
    const normalValue=normalResult?.results?.[0]?.value,hyperValue=hyperResult?.results?.[0]?.value;
    if(normalValue)try{normal=cleanBurningEventSettings(JSON.parse(normalValue),'BURNING')}catch{}
    if(hyperValue)try{hyper=cleanBurningEventSettings(JSON.parse(hyperValue),'HYPER')}catch{}
    const value={normal,hyper,active:activeBurningEvent({normal,hyper})};
    burningEventCache={at:now,value};return value;
  }catch(error){
    if(burningEventCache?.value){console.warn('burning event settings fallback to cache',error);return burningEventCache.value;}
    throw error;
  }
}
async function burningEventSettings(env,{fresh=false}={}){return (await burningEventPair(env,{fresh})).active;}
function burningPublicState(settings){return {mode:settings.enabled===true?String(settings.mode||'BURNING').toUpperCase():'NONE',theme:String(settings.theme||'RED').toUpperCase(),enabled:settings.enabled===true,generation:Number(settings.generation||0),activatedAt:settings.activatedAt||null,updatedAt:settings.updatedAt||null,title:settings.title,pve:{maxEnergy:settings.pveMaxEnergy,rechargeMinutes:settings.rechargeMinutes},pvp:{maxEnergy:settings.pvpMaxEnergy,rechargeMinutes:settings.rechargeMinutes},duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:settings.battleRewardMultiplier};}
function applyBurningPveSettings(settings,burning){if(!burning?.enabled)return settings;return {...settings,__burningRewardMultiplier:Number(burning.battleRewardMultiplier||1),__burningActivatedAt:burning.activatedAt||null,__burningMode:String(burning.mode||'BURNING'),energy:{...(settings.energy||{}),enabled:true,maxEnergy:burning.pveMaxEnergy,dailyRestore:burning.pveMaxEnergy,rechargeMinutes:burning.rechargeMinutes}};}
function applyBurningPvpSettings(settings,burning){if(!burning?.enabled)return settings;return {...settings,__burningActivatedAt:burning.activatedAt||null,__burningMode:String(burning.mode||'BURNING'),energy:{...(settings.energy||{}),enabled:true,maxEnergy:burning.pvpMaxEnergy,rechargeMinutes:burning.rechargeMinutes}};}
function burningDiscountPrice(price,burning){return Math.max(0,Math.floor(Number(price)||0));}
function burningRewardAmount(amount,burning){const base=Math.max(0,Math.floor(Number(amount)||0));return burning?.enabled?Math.max(0,Math.floor(base*Number(burning.battleRewardMultiplier||1))):base;}

function defaultPvpSettings(){return {enabled:true,status:'진행 중',competitionName:'랭크전',seasonTitle:'SOOPKETMON RANKED',seasonName:'시즌 9',seasonDescription:'티어와 편성 전투력을 기준으로 상대가 자동 배정되는 랭크전입니다.',startsAt:null,endsAt:null,automaticSeasons:true,seasonDurationDays:5,matchingMode:'AUTO',initialScore:1000,winScore:24,loseScore:16,matchCardRange:15,matchSeasonRange:300,historyLimit:100,winCoin:50,loseCoin:25,scoreBalance:{enabled:true,equalRange:10,weakerWinMid:80,weakerWinHigh:60,weakerWinExtreme:40,strongerWinMid:110,strongerWinHigh:125,strongerWinExtreme:140,strongerLossMid:90,strongerLossHigh:75,strongerLossExtreme:60,weakerLossMid:110,weakerLossHigh:125,weakerLossExtreme:140,minChange:1,maxChange:999},energy:{enabled:true,maxEnergy:5,rechargeMinutes:30,costPerBattle:1,adminUnlimited:true,testUnlimited:true},rewardClaimMode:'SEASON_END',tierRewardsEnabled:true,rankRewardsEnabled:true,tiers:[{id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false,rewardCoin:500,rewardShards:0},{id:'silver',name:'실버',min:1100,color:'#c9d4e3',aura:false,rewardCoin:1000,rewardShards:20},{id:'gold',name:'골드',min:1250,color:'#ffd15c',aura:false,rewardCoin:2000,rewardShards:50},{id:'platinum',name:'플래티넘',min:1450,color:'#5ff0df',aura:true,rewardCoin:4000,rewardShards:100},{id:'diamond',name:'다이아',min:1700,color:'#69cfff',aura:true,rewardCoin:7000,rewardShards:180},{id:'master',name:'마스터',min:2050,color:'#bd7cff',aura:true,rewardCoin:12000,rewardShards:300},{id:'grandmaster',name:'그랜드마스터',min:2500,color:'#ff6f91',aura:true,rewardCoin:20000,rewardShards:500}],rankRewards:[{from:1,to:1,rewardCoin:30000,rewardShards:700},{from:2,to:3,rewardCoin:20000,rewardShards:500},{from:4,to:10,rewardCoin:12000,rewardShards:300},{from:11,to:50,rewardCoin:5000,rewardShards:120}]};}
function cleanPvpSettings(raw={}){const base=defaultPvpSettings(),num=(v,d,min=0,max=100000000)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Math.floor(Number(v)):d));const tiers=(Array.isArray(raw.tiers)?raw.tiers:base.tiers).map((t,i)=>({id:String(t.id||base.tiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||base.tiers[i]?.name||'티어').slice(0,20),min:num(t.min,base.tiers[i]?.min||0),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):base.tiers[i]?.color||'#7ceeff',aura:t.aura!==false,rewardCoin:num(t.rewardCoin,base.tiers[i]?.rewardCoin||0),rewardShards:num(t.rewardShards,base.tiers[i]?.rewardShards||0)})).sort((a,b)=>a.min-b.min);const rankRewards=(Array.isArray(raw.rankRewards)?raw.rankRewards:base.rankRewards).slice(0,20).map((r,i)=>{const from=num(r.from,base.rankRewards[i]?.from||1,1,100000),to=num(r.to,base.rankRewards[i]?.to||from,1,100000);return {from:Math.min(from,to),to:Math.max(from,to),rewardCoin:num(r.rewardCoin,base.rankRewards[i]?.rewardCoin||0),rewardShards:num(r.rewardShards,base.rankRewards[i]?.rewardShards||0)}}).sort((a,b)=>a.from-b.from);return {...base,enabled:raw.enabled!==false,status:String(raw.status||base.status).slice(0,60),competitionName:String(raw.competitionName||base.competitionName).slice(0,30),seasonTitle:String(raw.seasonTitle||base.seasonTitle).slice(0,80),seasonName:String(raw.seasonName||base.seasonName).slice(0,40),seasonDescription:String(raw.seasonDescription||base.seasonDescription).slice(0,240),startsAt:raw.startsAt||null,endsAt:raw.endsAt||null,automaticSeasons:raw.automaticSeasons!==false,seasonDurationDays:num(raw.seasonDurationDays,base.seasonDurationDays,1,30),matchingMode:'AUTO',initialScore:num(raw.initialScore,base.initialScore,0,1000000),winScore:num(raw.winScore,base.winScore,0,100000),loseScore:num(raw.loseScore,base.loseScore,0,100000),matchCardRange:num(raw.matchCardRange,base.matchCardRange,1,100),matchSeasonRange:num(raw.matchSeasonRange,base.matchSeasonRange,0,100000),historyLimit:num(raw.historyLimit,base.historyLimit,10,500),winCoin:num(raw.winCoin,base.winCoin,0,10000000),loseCoin:num(raw.loseCoin,base.loseCoin,0,10000000),scoreBalance:{enabled:raw.scoreBalance?.enabled!==false,equalRange:num(raw.scoreBalance?.equalRange,base.scoreBalance.equalRange,0,100),weakerWinMid:num(raw.scoreBalance?.weakerWinMid,base.scoreBalance.weakerWinMid,0,500),weakerWinHigh:num(raw.scoreBalance?.weakerWinHigh,base.scoreBalance.weakerWinHigh,0,500),weakerWinExtreme:num(raw.scoreBalance?.weakerWinExtreme,base.scoreBalance.weakerWinExtreme,0,500),strongerWinMid:num(raw.scoreBalance?.strongerWinMid,base.scoreBalance.strongerWinMid,0,500),strongerWinHigh:num(raw.scoreBalance?.strongerWinHigh,base.scoreBalance.strongerWinHigh,0,500),strongerWinExtreme:num(raw.scoreBalance?.strongerWinExtreme,base.scoreBalance.strongerWinExtreme,0,500),strongerLossMid:num(raw.scoreBalance?.strongerLossMid,base.scoreBalance.strongerLossMid,0,500),strongerLossHigh:num(raw.scoreBalance?.strongerLossHigh,base.scoreBalance.strongerLossHigh,0,500),strongerLossExtreme:num(raw.scoreBalance?.strongerLossExtreme,base.scoreBalance.strongerLossExtreme,0,500),weakerLossMid:num(raw.scoreBalance?.weakerLossMid,base.scoreBalance.weakerLossMid,0,500),weakerLossHigh:num(raw.scoreBalance?.weakerLossHigh,base.scoreBalance.weakerLossHigh,0,500),weakerLossExtreme:num(raw.scoreBalance?.weakerLossExtreme,base.scoreBalance.weakerLossExtreme,0,500),minChange:num(raw.scoreBalance?.minChange,base.scoreBalance.minChange,0,100000),maxChange:num(raw.scoreBalance?.maxChange,base.scoreBalance.maxChange,1,100000)},energy:{enabled:raw.energy?.enabled!==false,maxEnergy:num(raw.energy?.maxEnergy,base.energy.maxEnergy,1,999),rechargeMinutes:num(raw.energy?.rechargeMinutes,base.energy.rechargeMinutes,1,1440),costPerBattle:num(raw.energy?.costPerBattle,base.energy.costPerBattle,1,99),adminUnlimited:raw.energy?.adminUnlimited!==false,testUnlimited:raw.energy?.testUnlimited!==false},rewardClaimMode:['IMMEDIATE','SEASON_END'].includes(raw.rewardClaimMode)?raw.rewardClaimMode:base.rewardClaimMode,tierRewardsEnabled:raw.tierRewardsEnabled!==false,rankRewardsEnabled:raw.rankRewardsEnabled!==false,tiers,rankRewards};}
async function readPvpSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pvp_settings_v1'").first();if(!row?.value)return defaultPvpSettings();try{return cleanPvpSettings(JSON.parse(row.value))}catch{return defaultPvpSettings()}}
async function pvpSettings(env){return cachedRuntimeSetting('pvp',10000,()=>readPvpSettings(env))}
function pvpSeasonKey(settings){return [String(settings?.seasonName||'').trim(),String(settings?.startsAt||''),String(settings?.endsAt||'')].join('|').slice(0,220)}
async function completedPvpSettlement(env,settings){const key=pvpSeasonKey(settings);if(!key)return null;return env.DB.prepare("SELECT id,status,completed_at FROM pvp_season_settlements WHERE season_key=? AND status='COMPLETED'").bind(key).first()}
function pvpSettlementRewardFor(rankRow,settings,tierClaimed,rankClaimed){const tier=resolveTier(Number(rankRow.highest_score||0),settings.tiers||[]),rankReward=(settings.rankRewards||[]).find(x=>Number(rankRow.final_rank)>=Number(x.from)&&Number(rankRow.final_rank)<=Number(x.to));return {tier,tierCoin:settings.tierRewardsEnabled&&!tierClaimed?Number(tier.rewardCoin||0):0,tierShards:settings.tierRewardsEnabled&&!tierClaimed?Number(tier.rewardShards||0):0,rankCoin:settings.rankRewardsEnabled&&!rankClaimed?Number(rankReward?.rewardCoin||0):0,rankShards:settings.rankRewardsEnabled&&!rankClaimed?Number(rankReward?.rewardShards||0):0}}

const PVP_RANKED_TITLE_CODES={grandmaster:'TITLE_RANKED_GAMBLER',master:'TITLE_RANKED_DUELIST'};
let rankedPvpFoundationPromise=null;
let rankedPvpMaintenanceAt=0;
async function ensureRankedPvpFoundation(env){
  if(!rankedPvpFoundationPromise)rankedPvpFoundationPromise=(async()=>{
    await ensureEquipmentFoundation(env);
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_ranked_match_tickets_v1671(
        token TEXT PRIMARY KEY,attacker_id INTEGER NOT NULL,defender_id INTEGER NOT NULL,season_key TEXT NOT NULL,
        attacker_score INTEGER NOT NULL,defender_score INTEGER NOT NULL,attacker_power INTEGER NOT NULL DEFAULT 0,
        defender_power INTEGER NOT NULL DEFAULT 0,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pvp_ranked_ticket_attacker ON pvp_ranked_match_tickets_v1671(attacker_id,created_at DESC)'),
      env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_ranked_ticket_active ON pvp_ranked_match_tickets_v1671(attacker_id,season_key) WHERE used_at IS NULL'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_season_title_grants_v1671(
        settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,title_id INTEGER NOT NULL,season_key TEXT NOT NULL,
        expires_at TEXT NOT NULL,granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at TEXT,
        PRIMARY KEY(settlement_id,user_id,title_id)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pvp_season_title_active ON pvp_season_title_grants_v1671(user_id,expires_at,revoked_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_season_lifecycle_lock_v1671(
        lock_key TEXT PRIMARY KEY,token TEXT NOT NULL,lease_until_ms INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_season_settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,season_key TEXT NOT NULL UNIQUE,season_name TEXT NOT NULL,season_title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PREPARING',initial_score INTEGER NOT NULL DEFAULT 1000,participant_count INTEGER NOT NULL DEFAULT 0,
        reward_user_count INTEGER NOT NULL DEFAULT 0,message_count INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,error_message TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_season_settlement_ranks (
        settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,nickname TEXT NOT NULL,final_rank INTEGER NOT NULL,
        season_score INTEGER NOT NULL,highest_score INTEGER NOT NULL,wins INTEGER NOT NULL,losses INTEGER NOT NULL,
        tier_id TEXT NOT NULL,tier_name TEXT NOT NULL,reward_coin INTEGER NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(settlement_id,user_id)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_season_settlement_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,reward_type TEXT NOT NULL,
        reward_amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'RESERVED',message_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(settlement_id,user_id,reward_type)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_battle_audits_v1781(
        attacker_id INTEGER NOT NULL,request_id TEXT NOT NULL,defender_id INTEGER NOT NULL,winner_id INTEGER NOT NULL,
        winner_side TEXT NOT NULL,result_reason TEXT NOT NULL DEFAULT '',original_reason TEXT NOT NULL DEFAULT '',battle_seed INTEGER NOT NULL DEFAULT 0,
        attacker_survivors INTEGER NOT NULL DEFAULT 0,defender_survivors INTEGER NOT NULL DEFAULT 0,
        attacker_hp_percent REAL NOT NULL DEFAULT 0,defender_hp_percent REAL NOT NULL DEFAULT 0,action_count INTEGER NOT NULL DEFAULT 0,
        final_state_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(attacker_id,request_id)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pvp_battle_audits_users_v1781 ON pvp_battle_audits_v1781(attacker_id,defender_id,created_at DESC)')
    ]);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,is_active,is_public,sort_order,style_preset,updated_at)
        VALUES('TITLE_RANKED_GAMBLER','승부사','랭크전 시즌에서 그랜드마스터를 달성한 유저에게 다음 시즌 동안 지급됩니다.','승부사','',0,'MANUAL','{}',1,1,44,'CRIMSON',CURRENT_TIMESTAMP)
        ON CONFLICT(code) DO UPDATE SET name=excluded.name,description=excluded.description,badge_text=excluded.badge_text,is_active=1,is_public=1,style_preset=excluded.style_preset,updated_at=CURRENT_TIMESTAMP`),
      env.DB.prepare(`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,is_active,is_public,sort_order,style_preset,updated_at)
        VALUES('TITLE_RANKED_DUELIST','결투가','랭크전 시즌에서 마스터를 달성한 유저에게 다음 시즌 동안 지급됩니다.','결투가','',0,'MANUAL','{}',1,1,45,'VOID',CURRENT_TIMESTAMP)
        ON CONFLICT(code) DO UPDATE SET name=excluded.name,description=excluded.description,badge_text=excluded.badge_text,is_active=1,is_public=1,style_preset=excluded.style_preset,updated_at=CURRENT_TIMESTAMP`)
    ]);
    return true;
  })().catch(error=>{rankedPvpFoundationPromise=null;throw error});
  return rankedPvpFoundationPromise;
}
async function cleanupRankedPvpMaintenance(env){
  const now=Date.now();if(now-rankedPvpMaintenanceAt<300000)return;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM user_title_loadout WHERE EXISTS(
      SELECT 1 FROM user_character_titles u
      WHERE u.user_id=user_title_loadout.user_id AND u.title_id=user_title_loadout.title_id
        AND u.expires_at IS NOT NULL AND u.expires_at<=CURRENT_TIMESTAMP
    )`),
    env.DB.prepare('DELETE FROM user_character_titles WHERE expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP'),
    env.DB.prepare("DELETE FROM pvp_ranked_match_tickets_v1671 WHERE expires_at<datetime('now','-1 day')")
  ]);
  rankedPvpMaintenanceAt=now;
}
function pvpSeasonNumber(name){const found=String(name||'').match(/(\d+)/);return Math.max(0,Number(found?.[1]||0))}
function pvpSqlUtc(ms){return new Date(ms).toISOString().replace('T',' ').slice(0,19)}
function nextPvpSeasonSettings(settings){const now=Date.now(),durationDays=Number(settings.seasonDurationDays||5),nextNo=Math.max(9,pvpSeasonNumber(settings.seasonName)+1);return cleanPvpSettings({...settings,enabled:true,status:'진행 중',competitionName:'랭크전',seasonTitle:'SOOPKETMON RANKED',seasonName:`시즌 ${nextNo}`,seasonDescription:'티어와 편성 전투력을 기준으로 상대가 자동 배정되는 랭크전입니다.',startsAt:pvpSqlUtc(now),endsAt:pvpSqlUtc(now+durationDays*86400000),automaticSeasons:true,seasonDurationDays:durationDays,matchingMode:'AUTO'})}
async function persistPvpSettings(env,settings){await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(settings)).run();runtimeSettingsCache.delete('pvp')}
async function acquirePvpLifecycleLock(env){const token=crypto.randomUUID(),now=Date.now(),result=await env.DB.prepare(`INSERT INTO pvp_season_lifecycle_lock_v1671(lock_key,token,lease_until_ms,updated_at)
  VALUES('GLOBAL',?,?,CURRENT_TIMESTAMP) ON CONFLICT(lock_key) DO UPDATE SET token=excluded.token,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
  WHERE pvp_season_lifecycle_lock_v1671.lease_until_ms<=?`).bind(token,now+25000,now).run();return Number(result?.meta?.changes||0)===1?token:null}
async function releasePvpLifecycleLock(env,token){if(token)await env.DB.prepare("DELETE FROM pvp_season_lifecycle_lock_v1671 WHERE lock_key='GLOBAL' AND token=?").bind(token).run()}
async function pvpSettlementPreviewRows(env,settings){
  const [rankedRows,tierClaims,rankClaims]=await Promise.all([
    env.DB.prepare(`SELECT u.id AS user_id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id
      WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
      ORDER BY p.season_score DESC,p.wins DESC,u.nickname`).all(),
    env.DB.prepare('SELECT user_id FROM pvp_reward_claims WHERE season_name=?').bind(settings.seasonName).all(),
    env.DB.prepare('SELECT user_id FROM pvp_rank_reward_claims WHERE season_name=?').bind(settings.seasonName).all()
  ]);
  const tierClaimed=new Set((tierClaims.results||[]).map(x=>Number(x.user_id))),rankClaimed=new Set((rankClaims.results||[]).map(x=>Number(x.user_id)));
  return (rankedRows.results||[]).map((x,index)=>{const row={...x,final_rank:index+1},reward=pvpSettlementRewardFor(row,settings,tierClaimed.has(Number(x.user_id)),rankClaimed.has(Number(x.user_id)));return {...row,tier:reward.tier,rewardCoin:reward.tierCoin+reward.rankCoin,rewardShards:reward.tierShards+reward.rankShards}});
}
async function deliverAutomaticPvpRewards(env,settlementId,settings){
  const rows=await env.DB.prepare(`SELECT r.* FROM pvp_season_settlement_ranks r WHERE r.settlement_id=? AND
    ((r.reward_coin>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='COIN' AND d.status='SENT')) OR
     (r.reward_shards>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='SHARDS' AND d.status='SENT')))
    ORDER BY r.final_rank LIMIT 15`).bind(settlementId).all();
  for(const row of rows.results||[])for(const [rewardType,amount] of [['COIN',Number(row.reward_coin||0)],['SHARDS',Number(row.reward_shards||0)]]){
    if(amount<=0)continue;
    await env.DB.prepare("INSERT OR IGNORE INTO pvp_season_settlement_deliveries(settlement_id,user_id,reward_type,reward_amount,status) VALUES(?,?,?,?,'RESERVED')").bind(settlementId,row.user_id,rewardType,amount).run();
    const delivery=await env.DB.prepare('SELECT * FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND user_id=? AND reward_type=?').bind(settlementId,row.user_id,rewardType).first();
    if(!delivery||delivery.status==='SENT')continue;
    const unit=rewardType==='COIN'?'코인':'카드조각',seasonTitle=rewardType==='COIN'?(row.tier_id==='grandmaster'?'승부사':row.tier_id==='master'?'결투가':''):'',title=`${settings.seasonName} 랭크전 정산 보상`,body=`${settings.seasonName} 최종 ${row.final_rank}위 (${row.tier_name}) 정산 보상입니다.\n\n${unit} ${amount.toLocaleString()}개${seasonTitle?`\n기간제 칭호 '${seasonTitle}' (다음 시즌 정산까지 5일간 활성)`:''}\n\n아래 보상 수령 버튼을 눌러주세요.`;
    const inserted=await env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'SYSTEM',?,?,'PVP_SEASON_REWARD')").bind(row.user_id,title,body).run(),messageId=Number(inserted.meta?.last_row_id||0);
    if(!messageId)throw new Error(`랭크전 보상 메시지 생성 실패: ${row.nickname}`);
    await env.DB.batch([env.DB.prepare("UPDATE pvp_season_settlement_deliveries SET message_id=?,status='SENT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESERVED'").bind(messageId,delivery.id),env.DB.prepare('INSERT OR IGNORE INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(?,?,?,?)').bind(messageId,row.user_id,rewardType,amount)]);
  }
  const pending=await env.DB.prepare(`SELECT COUNT(*) count FROM pvp_season_settlement_ranks r WHERE r.settlement_id=? AND
    ((r.reward_coin>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='COIN' AND d.status='SENT')) OR
     (r.reward_shards>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='SHARDS' AND d.status='SENT')))` ).bind(settlementId).first();
  return Number(pending?.count||0);
}
async function advancePvpSeasonLifecycle(env){
  await ensureRankedPvpFoundation(env);


  let settings=await readPvpSettings(env);let endMs=settings.endsAt?utcMs(settings.endsAt):0;
  if(settings.automaticSeasons&&settings.enabled!==false&&!endMs){const now=Date.now();settings=cleanPvpSettings({...settings,startsAt:settings.startsAt||pvpSqlUtc(now),endsAt:pvpSqlUtc(now+Number(settings.seasonDurationDays||5)*86400000)});await persistPvpSettings(env,settings);endMs=utcMs(settings.endsAt)}
  const due=settings.automaticSeasons&&(pvpSeasonNumber(settings.seasonName)===8||(endMs>0&&endMs<=Date.now()));
  if(!due)return {settings,settling:false};
  const token=await acquirePvpLifecycleLock(env);if(!token)return {settings:{...settings,enabled:false,status:'정산 중'},settling:true};
  try{
    const seasonKey=pvpSeasonKey(settings);let settlement=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first();
    if(!settlement){
      const preview=await pvpSettlementPreviewRows(env,settings);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO pvp_season_settlements(season_key,season_name,season_title,status,initial_score,participant_count,created_by) VALUES(?,?,?,'PREPARING',?,?,0)").bind(seasonKey,settings.seasonName,settings.seasonTitle||'',Number(settings.initialScore||1000),preview.length),
        env.DB.prepare("DELETE FROM user_title_loadout WHERE EXISTS(SELECT 1 FROM user_character_titles u WHERE u.user_id=user_title_loadout.user_id AND u.title_id=user_title_loadout.title_id AND u.source_type='PVP_SEASON_RANKED')"),
        env.DB.prepare("DELETE FROM user_character_titles WHERE source_type='PVP_SEASON_RANKED'"),
        env.DB.prepare("UPDATE pvp_season_title_grants_v1671 SET revoked_at=CURRENT_TIMESTAMP WHERE revoked_at IS NULL")
      ]);
      settlement=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first();
    }
    const sid=Number(settlement.id);let status=String(settlement.status||'PREPARING');
    if(status==='COMPLETED'){
      const next=nextPvpSeasonSettings(settings);await persistPvpSettings(env,next);return {settings:next,settling:false,startedNewSeason:true,completedSeason:settlement.season_name};
    }
    if(status==='FAILED'){await env.DB.prepare("UPDATE pvp_season_settlements SET status='PREPARING',error_message=NULL WHERE id=?").bind(sid).run();status='PREPARING'}
    if(status==='PREPARING'){
      const preview=await pvpSettlementPreviewRows(env,settings),have=await env.DB.prepare('SELECT COUNT(*) count FROM pvp_season_settlement_ranks WHERE settlement_id=?').bind(sid).first(),offset=Number(have?.count||0),chunk=preview.slice(offset,offset+80);
      if(chunk.length)await env.DB.batch(chunk.map(row=>env.DB.prepare(`INSERT OR IGNORE INTO pvp_season_settlement_ranks(settlement_id,user_id,nickname,final_rank,season_score,highest_score,wins,losses,tier_id,tier_name,reward_coin,reward_shards) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sid,row.user_id,row.nickname,row.final_rank,row.season_score,row.highest_score,row.wins,row.losses,row.tier?.id||'',row.tier?.name||'',row.rewardCoin,row.rewardShards)));
      if(offset+chunk.length<preview.length)return {settings:{...settings,enabled:false,status:'정산 중'},settling:true,phase:'SNAPSHOT'};
      await env.DB.prepare("UPDATE pvp_season_settlements SET status='SNAPSHOTTED',participant_count=? WHERE id=?").bind(preview.length,sid).run();status='SNAPSHOTTED';
    }
    if(status==='SNAPSHOTTED'){
      const pending=await deliverAutomaticPvpRewards(env,sid,settings);if(pending>0)return {settings:{...settings,enabled:false,status:'정산 중'},settling:true,phase:'REWARDS'};
      const [rewardUsers,messages]=await Promise.all([env.DB.prepare("SELECT COUNT(DISTINCT user_id) count FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND status='SENT'").bind(sid).first(),env.DB.prepare("SELECT COUNT(*) count FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND status='SENT'").bind(sid).first()]);
      await env.DB.prepare("UPDATE pvp_season_settlements SET status='MESSAGES_READY',reward_user_count=?,message_count=? WHERE id=?").bind(Number(rewardUsers?.count||0),Number(messages?.count||0),sid).run();status='MESSAGES_READY';
    }
    if(status==='MESSAGES_READY'){
      const expiresAt=pvpSqlUtc(Date.now()+Number(settings.seasonDurationDays||5)*86400000);
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO pvp_season_title_grants_v1671(settlement_id,user_id,title_id,season_key,expires_at)
          SELECT r.settlement_id,r.user_id,t.id,?,? FROM pvp_season_settlement_ranks r JOIN character_titles t ON t.code=CASE r.tier_id WHEN 'grandmaster' THEN ? WHEN 'master' THEN ? ELSE '' END
          WHERE r.settlement_id=? AND r.tier_id IN ('grandmaster','master')`).bind(seasonKey,expiresAt,PVP_RANKED_TITLE_CODES.grandmaster,PVP_RANKED_TITLE_CODES.master,sid),
        env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id,expires_at)
          SELECT user_id,title_id,'PVP_SEASON_RANKED',CAST(settlement_id AS TEXT),expires_at FROM pvp_season_title_grants_v1671 WHERE settlement_id=?`).bind(sid),
        env.DB.prepare("UPDATE pvp_season_settlements SET status='TITLES_READY' WHERE id=?").bind(sid)
      ]);status='TITLES_READY';
    }
    if(status==='TITLES_READY'){
      const next=nextPvpSeasonSettings(settings);
      await env.DB.batch([
        env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=?,wins=0,losses=0,updated_at=CURRENT_TIMESTAMP').bind(Number(settings.initialScore||1000),Number(settings.initialScore||1000)),
        env.DB.prepare("UPDATE pvp_season_settlements SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=?").bind(sid),
        env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next))
      ]);
      runtimeSettingsCache.delete('pvp');settings=next;return {settings,settling:false,startedNewSeason:true,completedSeason:settlement.season_name};
    }
    return {settings:{...settings,enabled:false,status:'정산 중'},settling:true};
  }catch(error){console.error('automatic ranked season lifecycle failed',error);return {settings:{...settings,enabled:false,status:'정산 오류'},settling:true,error:String(error?.message||error)}}finally{await releasePvpLifecycleLock(env,token)}
}

function pvpScoreAdjustment(base,isWin,myCard,opponentCard,settings){const cfg=settings.scoreBalance||{},safeBase=Math.max(0,Number(base||0));if(cfg.enabled===false||!myCard||!opponentCard)return {change:safeBase,multiplier:100,diffPercent:0,label:'기본 점수'};const diff=(Number(opponentCard)-Number(myCard))/Math.max(1,Number(myCard))*100,abs=Math.abs(diff),eq=Number(cfg.equalRange??10);let multiplier=100,label='비슷한 체급';if(abs>eq){const band=abs<20?'Mid':abs<30?'High':'Extreme';if(isWin){if(diff<0){multiplier=Number(cfg['weakerWin'+band]??100);label='낮은 체급 승리 패널티'}else{multiplier=Number(cfg['strongerWin'+band]??100);label='상위 체급 승리 보너스'}}else{if(diff>0){multiplier=Number(cfg['strongerLoss'+band]??100);label='상위 체급 패배 완화'}else{multiplier=Number(cfg['weakerLoss'+band]??100);label='낮은 체급 패배 패널티'}}}const min=Math.max(0,Number(cfg.minChange??1)),max=Math.max(min,Number(cfg.maxChange??999));return {change:Math.max(min,Math.min(max,Math.round(safeBase*multiplier/100))),multiplier,diffPercent:Math.round(diff*10)/10,label}}

function pvpSeasonScoreAdjustment(isWin,myScore,opponentScore){const diff=Number(opponentScore||0)-Number(myScore||0);let change,label;if(diff>=500){change=isWin?36:6;label=isWin?'상위 점수 상대 승리 보너스':'상위 점수 상대 패배 완화'}else if(diff>=200){change=isWin?30:10;label=isWin?'강한 상대 승리 보너스':'강한 상대 패배 완화'}else if(diff<=-500){change=isWin?12:24;label=isWin?'낮은 점수 상대 승리 조정':'낮은 점수 상대 패배 패널티'}else if(diff<=-200){change=isWin?18:20;label=isWin?'낮은 상대 승리 조정':'낮은 상대 패배 패널티'}else{change=isWin?24:16;label='비슷한 시즌 점수'}return {change,scoreDiff:diff,label}}
async function userCardScore(env,userId){const settings=await battleSettings(env);const rows=await env.DB.prepare("SELECT c.id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')").bind(userId).all();return rows.results.reduce((sum,c)=>sum+cardBattlePower(c,Number(c.breakthrough_level||0),settings),0)}
function pvpTierIndex(score,tiers=[]){const resolved=resolveTier(Number(score||0),tiers);return Math.max(0,(tiers||[]).findIndex(tier=>tier.id===resolved.id))}
async function pvpFormationPower(env,userId,battle,{defense=false}={}){
  const [deck,bonus]=await Promise.all([pvpDeckSnapshot(env,userId,defense),userEquipmentBonuses(env,userId)]);
  if(deck.length!==5)return {power:0,deckReady:false};
  return {power:Math.max(1,deck.reduce((sum,card)=>sum+cardBattlePower(card,Number(card.breakthrough_level||0),battle),0)+Number(bonus.pvp||0)),deckReady:true};
}
async function pvpDefenseFormationPowers(env,userIds,battle){
  const ids=[...new Set((userIds||[]).map(Number).filter(Boolean))];if(!ids.length)return new Map();const marks=ids.map(()=>'?').join(',');
  const [cardRows,equipmentRows,garageRows,titleRows]=await Promise.all([
    // Keep the five JSON deck ids as the outer loop. The previous implicit JOIN
    // order scanned every owned card (and, in practice, the effective card view)
    // for every candidate, producing tens of millions of reads per matchmaking
    // request. CROSS JOIN fixes the loop order and the composite user_cards PK
    // resolves each of the five cards directly.
    env.DB.prepare(`SELECT d.user_id,c.id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level
      FROM pvp_decks d
      CROSS JOIN json_each(d.card_ids) j
      CROSS JOIN cards_effective_v1210 c
      CROSS JOIN user_cards uc
      WHERE d.user_id IN (${marks})
        AND c.id=CAST(j.value AS TEXT)
        AND uc.user_id=d.user_id AND uc.card_id=c.id AND uc.quantity>0`).bind(...ids).all(),
    env.DB.prepare(`SELECT l.user_id,COALESCE(SUM(i.pvp_power),0) power FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1 WHERE l.user_id IN (${marks}) GROUP BY l.user_id`).bind(...ids).all(),
    env.DB.prepare(`SELECT l.user_id,COALESCE(g.pvp_power,0) power FROM user_garage_loadout l JOIN user_garage_vehicles v ON v.user_id=l.user_id AND v.garage_id=l.garage_id JOIN character_garage_items g ON g.id=l.garage_id AND g.is_active=1 WHERE l.user_id IN (${marks})`).bind(...ids).all(),
    env.DB.prepare(`SELECT l.user_id,COALESCE(t.pve_power,0) power FROM user_title_loadout l JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) JOIN character_titles t ON t.id=l.title_id AND t.is_active=1 WHERE l.user_id IN (${marks})`).bind(...ids).all()
  ]);
  const result=new Map(ids.map(id=>[id,{power:0,count:0}]));for(const row of cardRows.results||[]){const state=result.get(Number(row.user_id));if(state){state.power+=cardBattlePower(row,Number(row.breakthrough_level||0),battle);state.count++}}
  for(const rows of [equipmentRows.results||[],garageRows.results||[],titleRows.results||[]])for(const row of rows){const state=result.get(Number(row.user_id));if(state)state.power+=Number(row.power||0)}
  return new Map([...result].map(([id,state])=>[id,{power:Math.max(0,Math.floor(state.power)),deckReady:state.count===5}]));
}
async function createRankedMatchTicket(env,user,settings){
  await ensureRankedPvpFoundation(env);
  const seasonKey=pvpSeasonKey(settings);
  // A live ticket has already passed deck and opponent validation. Reuse it
  // before rebuilding every candidate formation; pvp/fight validates live decks.
  await env.DB.prepare(`DELETE FROM pvp_ranked_match_tickets_v1671 WHERE attacker_id=? AND season_key=? AND used_at IS NULL AND
    (expires_at<=CURRENT_TIMESTAMP OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=pvp_ranked_match_tickets_v1671.defender_id AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))))`).bind(user.id,seasonKey).run();
  const existing=await env.DB.prepare(`SELECT t.*,u.nickname,p.wins,p.losses FROM pvp_ranked_match_tickets_v1671 t
    JOIN users u ON u.id=t.defender_id JOIN pvp_profiles p ON p.user_id=t.defender_id
    WHERE t.attacker_id=? AND t.season_key=? AND t.used_at IS NULL AND t.expires_at>CURRENT_TIMESTAMP
      AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
    ORDER BY t.created_at DESC LIMIT 1`).bind(user.id,seasonKey).first();
  if(existing){
    const titleMap=await publicEquippedTitleMap(env,[existing.defender_id]),scoreDiff=Math.abs(Number(existing.defender_score)-Number(existing.attacker_score)),powerDiff=Math.abs(Number(existing.defender_power)-Number(existing.attacker_power))/Math.max(1,Number(existing.attacker_power))*100;
    return {token:existing.token,expiresAt:existing.expires_at,reused:true,opponent:{id:Number(existing.defender_id),nickname:existing.nickname,season_score:Number(existing.defender_score),wins:Number(existing.wins||0),losses:Number(existing.losses||0),title:titleMap[String(existing.defender_id)]||null,tier:resolveTier(Number(existing.defender_score),settings.tiers),expectedWin:pvpSeasonScoreAdjustment(true,existing.attacker_score,existing.defender_score).change,expectedLoss:pvpSeasonScoreAdjustment(false,existing.attacker_score,existing.defender_score).change,balance:{tierDistance:Math.abs(pvpTierIndex(existing.defender_score,settings.tiers)-pvpTierIndex(existing.attacker_score,settings.tiers)),scoreDifference:scoreDiff,powerDifferencePercent:Math.round(powerDiff*10)/10}}};
  }
  const [mine,battle]=await Promise.all([ensurePvpProfile(env,user,settings),battleSettings(env)]),myFormation=await pvpFormationPower(env,user.id,battle);
  if(!myFormation.deckReady){const error=new Error('먼저 랭크전 덱 5장을 저장하세요.');error.status=400;throw error}
  const searchRange=1000000,[recentRows,candidates]=await Promise.all([
    env.DB.prepare('SELECT defender_id FROM pvp_match_history WHERE attacker_id=? ORDER BY id DESC LIMIT 4').bind(user.id).all(),
    env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses
    FROM users u JOIN pvp_profiles p ON p.user_id=u.id JOIN pvp_decks d ON d.user_id=u.id
    WHERE u.id<>? AND u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN')
      AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
      AND CASE WHEN json_valid(d.card_ids) THEN json_array_length(d.card_ids) ELSE 0 END=5
      AND ABS(p.season_score-?)<=?
    ORDER BY ABS(p.season_score-?) ASC,p.updated_at DESC LIMIT 36`).bind(user.id,mine.season_score,searchRange,mine.season_score).all()
  ]),recentIds=new Set((recentRows.results||[]).map(row=>Number(row.defender_id))),blockedOpponentId=recentRows.results?.length>=2&&Number(recentRows.results[0].defender_id)===Number(recentRows.results[1].defender_id)?Number(recentRows.results[0].defender_id):0;
  if(!(candidates.results||[]).length){const error=new Error('현재 매칭 가능한 랭크전 상대가 없습니다. 잠시 후 다시 시도하세요.');error.status=409;throw error}
  const formationMap=await pvpDefenseFormationPowers(env,(candidates.results||[]).map(candidate=>candidate.id),battle),evaluated=[];
  for(const candidate of (candidates.results||[])){
    if(Number(candidate.id)===blockedOpponentId)continue;
    const formation=formationMap.get(Number(candidate.id));if(!formation?.deckReady)continue;
    const scoreDiff=Math.abs(Number(candidate.season_score)-Number(mine.season_score)),powerDiff=Math.abs(formation.power-myFormation.power)/Math.max(1,myFormation.power)*100,tierDistance=Math.abs(pvpTierIndex(candidate.season_score,settings.tiers)-pvpTierIndex(mine.season_score,settings.tiers));
    evaluated.push({...candidate,power:formation.power,scoreDiff,powerDiff,tierDistance,recent:recentIds.has(Number(candidate.id)),matchWeight:tierDistance*100000+scoreDiff*80+powerDiff*120+(recentIds.has(Number(candidate.id))?250000:0)+(Number(candidate.id)%97)/100});
  }
  evaluated.sort((a,b)=>a.matchWeight-b.matchWeight);
  const preferred=evaluated.filter(row=>row.tierDistance===0&&row.powerDiff<=Number(settings.matchCardRange||15)&&!row.recent),selected=preferred[0]||evaluated.find(row=>!row.recent)||evaluated[0];
  if(!selected){const error=new Error('균형 조건에 맞는 상대를 찾지 못했습니다. 잠시 후 다시 시도하세요.');error.status=409;throw error}
  const token=crypto.randomUUID(),expiresAt=pvpSqlUtc(Date.now()+90000);
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO pvp_ranked_match_tickets_v1671(token,attacker_id,defender_id,season_key,attacker_score,defender_score,attacker_power,defender_power,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(token,user.id,selected.id,seasonKey,mine.season_score,selected.season_score,myFormation.power,selected.power,expiresAt).run();
  if(Number(inserted?.meta?.changes||0)!==1)return createRankedMatchTicket(env,user,settings);
  const titleMap=await publicEquippedTitleMap(env,[selected.id]),winPreview=pvpSeasonScoreAdjustment(true,mine.season_score,selected.season_score),lossPreview=pvpSeasonScoreAdjustment(false,mine.season_score,selected.season_score);
  return {token,expiresAt,opponent:{id:Number(selected.id),nickname:selected.nickname,season_score:Number(selected.season_score),wins:Number(selected.wins||0),losses:Number(selected.losses||0),title:titleMap[String(selected.id)]||null,tier:resolveTier(Number(selected.season_score),settings.tiers),expectedWin:winPreview.change,expectedLoss:lossPreview.change,balance:{tierDistance:selected.tierDistance,scoreDifference:selected.scoreDiff,powerDifferencePercent:Math.round(selected.powerDiff*10)/10}}};
}
async function claimRankedMatchTicket(env,userId,token,settings){
  await ensureRankedPvpFoundation(env);const cleanToken=String(token||'').trim();if(!cleanToken){const error=new Error('랭크전 자동 매칭을 먼저 진행하세요.');error.status=400;throw error}
  const ticket=await env.DB.prepare(`SELECT * FROM pvp_ranked_match_tickets_v1671 WHERE token=? AND attacker_id=? AND season_key=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`).bind(cleanToken,userId,pvpSeasonKey(settings)).first();
  if(!ticket){const error=new Error('매칭권이 만료되었거나 이미 사용되었습니다. 다시 매칭하세요.');error.status=409;throw error}
  const claimed=await env.DB.prepare('UPDATE pvp_ranked_match_tickets_v1671 SET used_at=CURRENT_TIMESTAMP WHERE token=? AND attacker_id=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP').bind(cleanToken,userId).run();
  if(Number(claimed?.meta?.changes||0)!==1){const error=new Error('동일한 매칭이 이미 처리되었습니다. 새로 매칭하세요.');error.status=409;throw error}
  return ticket;
}
async function ensurePvpProfile(env,user,settings){let row=await env.DB.prepare('SELECT * FROM pvp_profiles WHERE user_id=?').bind(user.id).first();if(!row){await env.DB.prepare('INSERT OR IGNORE INTO pvp_profiles(user_id,season_score,highest_score,wins,losses,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)').bind(user.id,settings.initialScore,settings.initialScore,0,0).run();row=await env.DB.prepare('SELECT * FROM pvp_profiles WHERE user_id=?').bind(user.id).first()}return row}
async function pvpDeckCards(env,userId,defense=false){let row=null;if(!defense){try{row=await env.DB.prepare('SELECT p.card_ids FROM pvp_active_presets a JOIN pvp_deck_presets p ON p.user_id=a.user_id AND p.preset_no=a.preset_no WHERE a.user_id=?').bind(userId).first()}catch{row=null}}if(!row)row=await env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId).first();if(!row)return [];try{return JSON.parse(row.card_ids||'[]')}catch{return []}}
async function pveDeckCards(env,userId){const row=await env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId).first();if(!row)return [];try{return JSON.parse(row.card_ids||'[]')}catch{return []}}
const PRESTIGE_DECK_LIMIT=2;
const FUR_DECK_LIMIT=2;
const ZENITH_DECK_LIMIT=1;
async function deckGradeCounts(env,cardIds=[]){const ids=[...new Set((cardIds||[]).map(String).filter(Boolean))];if(!ids.length)return {prestigeCount:0,furCount:0,zenithCount:0};const marks=ids.map(()=>'?').join(',');const row=await env.DB.prepare(`SELECT SUM(CASE WHEN UPPER(rarity)='PRESTIGE' THEN 1 ELSE 0 END) prestige_count,SUM(CASE WHEN UPPER(rarity)='FUR' THEN 1 ELSE 0 END) fur_count,SUM(CASE WHEN UPPER(rarity)='ZENITH' THEN 1 ELSE 0 END) zenith_count FROM cards_effective_v1210 WHERE id IN (${marks})`).bind(...ids).first();return {prestigeCount:Math.max(0,Number(row?.prestige_count||0)),furCount:Math.max(0,Number(row?.fur_count||0)),zenithCount:Math.max(0,Number(row?.zenith_count||0))}}
async function validateDeckGradeLimits(env,cardIds=[],deckName='덱'){const {prestigeCount,furCount,zenithCount}=await deckGradeCounts(env,cardIds);if(prestigeCount>PRESTIGE_DECK_LIMIT){const error=new Error(`${deckName}에는 PRESTIGE 카드를 최대 ${PRESTIGE_DECK_LIMIT}장까지만 편성할 수 있습니다.`);error.status=400;error.code='PRESTIGE_DECK_LIMIT';error.grade='PRESTIGE';error.count=prestigeCount;error.limit=PRESTIGE_DECK_LIMIT;throw error}if(furCount>FUR_DECK_LIMIT){const error=new Error(`${deckName}에는 FUR 카드를 최대 ${FUR_DECK_LIMIT}장까지만 편성할 수 있습니다.`);error.status=400;error.code='FUR_DECK_LIMIT';error.grade='FUR';error.count=furCount;error.limit=FUR_DECK_LIMIT;throw error}if(zenithCount>ZENITH_DECK_LIMIT){const error=new Error(`${deckName}에는 ZENITH 카드를 1장만 편성할 수 있습니다.`);error.status=400;error.code='ZENITH_DECK_LIMIT';error.grade='ZENITH';error.count=zenithCount;error.limit=ZENITH_DECK_LIMIT;throw error}return {prestigeCount,furCount,zenithCount}}
async function deckSynergySettings(env){return {enabled:false,ownerTestEnabled:false,retired:true}}
function cleanDeckSynergyEffects(raw={}){const n=(v,min=-100,max=100)=>Math.max(min,Math.min(max,Number(v)||0));return {attackPercent:n(raw.attackPercent),hpPercent:n(raw.hpPercent),bossDamagePercent:n(raw.bossDamagePercent),damageReductionPercent:n(raw.damageReductionPercent,0,90)}}
async function evaluateDeckSynergies(env,user,deckIds,scope,{forceOwnerTest=false}={}){const settings=await deckSynergySettings(env),ownerTest=forceOwnerTest&&String(user?.role||'').toUpperCase()==='OWNER'&&settings.ownerTestEnabled;if(!settings.enabled&&!ownerTest)return {enabled:false,ownerTest,active:[],totals:cleanDeckSynergyEffects({})};const ids=[...new Set((deckIds||[]).map(String))];if(ids.length!==5)return {enabled:true,ownerTest,active:[],totals:cleanDeckSynergyEffects({})};const rows=(await env.DB.prepare('SELECT * FROM deck_synergies WHERE is_active=1 ORDER BY sort_order,id').all()).results,active=[];for(const row of rows){let required=[],scopes=[],effects={};try{required=JSON.parse(row.required_card_ids||'[]').map(String)}catch{}try{scopes=JSON.parse(row.scopes||'[]').map(String)}catch{}try{effects=cleanDeckSynergyEffects(JSON.parse(row.effects_json||'{}'))}catch{effects=cleanDeckSynergyEffects({})}if(!required.length||!required.every(id=>ids.includes(id)))continue;if(scopes.length&&!scopes.includes(String(scope||'').toUpperCase()))continue;active.push({id:row.id,name:row.name,description:row.description||'',requiredCardIds:required,scopes,effects})}const totals=cleanDeckSynergyEffects({});for(const x of active)for(const k of Object.keys(totals))totals[k]+=Number(x.effects[k]||0);return {enabled:true,ownerTest,active,totals:cleanDeckSynergyEffects(totals)}}
async function evaluateDeckSynergiesBatch(env,entries=[],scope='PVP'){
  const list=(Array.isArray(entries)?entries:[]),settings=await deckSynergySettings(env),enabled=list.map(entry=>settings.enabled||(String(entry?.user?.role||'').toUpperCase()==='OWNER'&&settings.ownerTestEnabled));
  if(!enabled.some(Boolean))return list.map(()=>({enabled:false,ownerTest:false,active:[],totals:cleanDeckSynergyEffects({})}));
  const rows=(await env.DB.prepare('SELECT * FROM deck_synergies WHERE is_active=1 ORDER BY sort_order,id').all()).results||[],normalized=rows.map(row=>{let required=[],scopes=[],effects={};try{required=JSON.parse(row.required_card_ids||'[]').map(String)}catch{}try{scopes=JSON.parse(row.scopes||'[]').map(String)}catch{}try{effects=cleanDeckSynergyEffects(JSON.parse(row.effects_json||'{}'))}catch{effects=cleanDeckSynergyEffects({})}return {id:row.id,name:row.name,description:row.description||'',requiredCardIds:required,scopes,effects}}),mode=String(scope||'PVP').toUpperCase();
  return list.map((entry,index)=>{const ownerTest=!settings.enabled&&enabled[index],ids=[...new Set((entry?.deckIds||[]).map(String))];if(!enabled[index]||ids.length!==5)return {enabled:enabled[index],ownerTest,active:[],totals:cleanDeckSynergyEffects({})};const active=normalized.filter(row=>row.requiredCardIds.length&&row.requiredCardIds.every(id=>ids.includes(id))&&(!row.scopes.length||row.scopes.includes(mode))),totals=cleanDeckSynergyEffects({});for(const row of active)for(const key of Object.keys(totals))totals[key]+=Number(row.effects[key]||0);return {enabled:true,ownerTest,active,totals:cleanDeckSynergyEffects(totals)}});
}

function defaultMineralExchangeSettings(){return {enabled:true,baseMineral:100000000,payoutCoin:1000,dailyLimitCoin:3000,coinUnit:1000}}
function cleanMineralExchangeSettings(raw={}){const b=defaultMineralExchangeSettings();return {enabled:raw.enabled!==false,baseMineral:Math.max(1,Math.floor(Number(raw.baseMineral||b.baseMineral))),payoutCoin:Math.max(1,Math.floor(Number(raw.payoutCoin||b.payoutCoin))),dailyLimitCoin:Math.max(1000,Math.floor(Number(raw.dailyLimitCoin||b.dailyLimitCoin)/1000)*1000),coinUnit:1000}}
async function mineralExchangeSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='mineral_exchange_settings_v1'").first();if(!row?.value)return defaultMineralExchangeSettings();try{return cleanMineralExchangeSettings(JSON.parse(row.value))}catch{return defaultMineralExchangeSettings()}}
function kstTodaySql(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function pvpDeckSnapshot(env,userId,defense=false){const ids=await pvpDeckCards(env,userId,defense);if(!ids.length)return [];const marks=ids.map(()=>'?').join(',');const rows=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,m.name,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(userId,...ids).all();const map=new Map(rows.results.map(x=>[String(x.id),x]));return ids.map(id=>map.get(String(id))).filter(Boolean)}
async function pvpDeckSnapshotByIds(env,userId,requestedIds=[]){const ids=(Array.isArray(requestedIds)?requestedIds:[]).map(String).filter(Boolean).slice(0,5);if(ids.length!==5)return [];const marks=ids.map(()=>'?').join(',');const rows=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,m.name,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(userId,...ids).all();const map=new Map((rows.results||[]).map(card=>[String(card.id),card]));return ids.map(id=>map.get(String(id))).filter(Boolean)}
async function pveDeckSnapshot(env,userId){return pvpDeckSnapshotByIds(env,userId,await pveDeckCards(env,userId))}

async function pvpEnergyState(env,user,settings){
  const cfg=settings.energy||defaultPvpSettings().energy;
  const maintenance=await maintenanceSettings(env);
  const unlimited=!cfg.enabled||(cfg.adminUnlimited&&isAdminRole(user))||(cfg.testUnlimited&&maintenance.testUsers.includes(user.nickname));
  if(unlimited)return {enabled:cfg.enabled,unlimited:true,energy:cfg.maxEnergy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt:null};
  const now=Date.now(),nowSql=sqlUtcNow();
  let row=await env.DB.prepare('SELECT * FROM user_pvp_energy WHERE user_id=?').bind(user.id).first();
  if(!row){await env.DB.prepare('INSERT OR IGNORE INTO user_pvp_energy(user_id,energy,last_recharged_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(user.id,cfg.maxEnergy,nowSql).run();row=await env.DB.prepare('SELECT * FROM user_pvp_energy WHERE user_id=?').bind(user.id).first();}
  let energy=Math.max(0,Math.min(cfg.maxEnergy,Number(row.energy||0))),last=utcMs(row.last_recharged_at);
  const burningActivated=Date.parse(String(settings.__burningActivatedAt||''));if(Number.isFinite(burningActivated)&&last<burningActivated){energy=cfg.maxEnergy;last=now;}
  if(energy<cfg.maxEnergy){const interval=cfg.rechargeMinutes*60000,gained=Math.floor((now-last)/interval);if(gained>0){energy=Math.min(cfg.maxEnergy,energy+gained);last=energy>=cfg.maxEnergy?now:last+gained*interval;}}
  const nextLastSql=new Date(last).toISOString().replace('T',' ').slice(0,19);
  if(energy!==Number(row.energy||0)||nextLastSql!==String(row.last_recharged_at||'')){
    await env.DB.prepare('UPDATE user_pvp_energy SET energy=?,last_recharged_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND (energy<>? OR last_recharged_at<>?)').bind(energy,nextLastSql,user.id,energy,nextLastSql).run();
  }
  const nextRechargeAt=energy>=cfg.maxEnergy?null:new Date(last+cfg.rechargeMinutes*60000).toISOString();
  return {enabled:true,unlimited:false,energy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt};
}
async function consumePvpEnergy(env,user,settings){
  const state=await pvpEnergyState(env,user,settings);if(state.unlimited)return state;
  if(state.energy<state.costPerBattle){const e=new Error(`랭크전 횟수가 부족합니다. ${Number(state.rechargeMinutes||30)}분마다 1회 충전됩니다.`);e.code='NO_PVP_ENERGY';e.energy=state;throw e;}
  const nowSql=sqlUtcNow();
  const result=await env.DB.prepare('UPDATE user_pvp_energy SET energy=energy-?,last_recharged_at=CASE WHEN energy>=? THEN ? ELSE last_recharged_at END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND energy>=?').bind(state.costPerBattle,state.maxEnergy,nowSql,user.id,state.costPerBattle).run();
  if(!result.meta.changes){const e=new Error('랭크전 횟수가 부족합니다.');e.code='NO_PVP_ENERGY';e.energy=await pvpEnergyState(env,user,settings);throw e;}
  return pvpEnergyState(env,user,settings);
}


function defaultRaidSettings(){return defaultRaidSettingsV1293();}
function cleanRaidSettings(raw={}){return cleanRaidSettingsV1293(raw);}
function raidScheduleState(cfg,user,nowMs=Date.now()){return raidScheduleStateV1293(cfg,user,nowMs);}
function isRaidOwner(user){return String(user?.role||'').trim().toUpperCase()==='OWNER';}
function isRaidOwnerTest(user,cfg){return isRaidOwner(user)&&cfg?.ownerOnlyTest===true;}
function raidSlotMinute(value){const parts=String(value||'').split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:null;}
function raidSlotRanges(slot){const start=raidSlotMinute(slot?.openTime),end=raidSlotMinute(slot?.closeTime);if(start===null||end===null||start===end)return [[0,1440]];return end>start?[[start,end]]:[[start,1440],[0,end]];}
function raidSlotsOverlap(a,b){return raidSlotRanges(a).some(x=>raidSlotRanges(b).some(y=>Math.max(x[0],y[0])<Math.min(x[1],y[1])));}


// V1311: 레이드 참가자가 많아져도 D1/SQLite 한 문장의 바인딩 변수 상한을 넘지 않도록
// 카드 메타데이터와 돌파 수치를 고정 크기 조각으로 조회한다. 실시간 조회 결과는 짧게 메모리 캐시하며 DB에는 저장하지 않는다.
const RAID_CARD_LOOKUP_CHUNK_V1311=40;
const RAID_PARTICIPANT_LOOKUP_CHUNK_V1311=6;
// Registered raid decks are immutable for the lifetime of the room.
const RAID_DISPLAY_CACHE_TTL_V1311=60000;
const RAID_DISPLAY_CACHE_MAX_V1311=16;
const raidDisplayDataCacheV1311=new Map();
function raidChunkV1311(values,size){const rows=Array.isArray(values)?values:[],out=[],step=Math.max(1,Math.floor(Number(size)||1));for(let i=0;i<rows.length;i+=step)out.push(rows.slice(i,i+step));return out;}
function raidDisplayDeckIdsV1311(value){
  const source=Array.isArray(value)?value:[];
  return [...new Set(source.map(id=>String(id||'').trim()).filter(Boolean))].slice(0,5);
}
function raidPruneDisplayCacheV1311(now=Date.now()){
  for(const [key,value] of raidDisplayDataCacheV1311){if(!value||Number(value.expiresAt||0)<=now)raidDisplayDataCacheV1311.delete(key);}
  while(raidDisplayDataCacheV1311.size>RAID_DISPLAY_CACHE_MAX_V1311){const first=raidDisplayDataCacheV1311.keys().next().value;if(first===undefined)break;raidDisplayDataCacheV1311.delete(first);}
}
async function raidParticipantDisplayDataV1311(env,{instanceId,participants,uniqueVisible,uniqueCfg}){
  const normalized=(Array.isArray(participants)?participants:[]).map(row=>({
    userId:Math.max(0,Math.floor(Number(row?.userId)||0)),
    deckCards:raidDisplayDeckIdsV1311(row?.deckCards)
  })).filter(row=>row.userId&&row.deckCards.length);
  const cardIds=[...new Set(normalized.flatMap(row=>row.deckCards))];
  if(!cardIds.length)return {cardMap:{},breakthroughMap:{}};
  const now=Date.now();raidPruneDisplayCacheV1311(now);
  const signature=drawIntegrityHash(JSON.stringify(normalized));
  const cacheKey=`${Number(instanceId)||0}:${uniqueVisible?1:0}:${uniqueCfg?.enabled===true?1:0}:${signature}`;
  const cached=raidDisplayDataCacheV1311.get(cacheKey);
  if(cached&&cached.expiresAt>now)return cached.value;

  const cardChunks=raidChunkV1311(cardIds,RAID_CARD_LOOKUP_CHUNK_V1311);
  const participantChunks=raidChunkV1311(normalized,RAID_PARTICIPANT_LOOKUP_CHUNK_V1311);
  const statements=[];
  for(const ids of cardChunks){
    const marks=ids.map(()=>'?').join(',');
    const sql=uniqueVisible
      ?`SELECT c.id,c.title,c.image_url AS image,c.rarity AS grade,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type AS powerType,m.name,cue.card_id AS uniqueCardId,cue.attack_percent AS uniqueAttackPercent,cue.defense_percent AS uniqueDefensePercent,cue.hp_percent AS uniqueHpPercent,cue.speed_percent AS uniqueSpeedPercent,cue.effect_name AS uniqueEffectName,cue.effect_description AS uniqueEffectDescription FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1 AND cue.scope_pve=1 WHERE c.id IN (${marks})`
      :`SELECT c.id,c.title,c.image_url AS image,c.rarity AS grade,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type AS powerType,m.name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id IN (${marks})`;
    statements.push(env.DB.prepare(sql).bind(...ids));
  }
  const cardStatementCount=statements.length;
  for(const group of participantChunks){
    const clauses=[],binds=[];
    for(const row of group){
      const marks=row.deckCards.map(()=>'?').join(',');
      clauses.push(`(user_id=? AND card_id IN (${marks}))`);
      binds.push(row.userId,...row.deckCards);
    }
    if(clauses.length)statements.push(env.DB.prepare(`SELECT user_id,card_id,breakthrough_level FROM user_cards WHERE COALESCE(quantity,0)>0 AND (${clauses.join(' OR ')})`).bind(...binds));
  }
  const batches=statements.length?await env.DB.batch(statements):[];
  const cardRows=batches.slice(0,cardStatementCount).flatMap(result=>result?.results||[]);
  const levelRows=batches.slice(cardStatementCount).flatMap(result=>result?.results||[]);
  const cardMap=Object.fromEntries(cardRows.map(c=>{
    const {uniqueCardId,uniqueAttackPercent,uniqueDefensePercent,uniqueHpPercent,uniqueSpeedPercent,uniqueEffectName,uniqueEffectDescription,...card}=c;
    const uniqueAbility=uniqueCardId?{cardId:String(uniqueCardId),attackPercent:Number(uniqueAttackPercent||0),defensePercent:Number(uniqueDefensePercent||0),hpPercent:Number(uniqueHpPercent||0),speedPercent:Number(uniqueSpeedPercent||0),effectName:String(uniqueEffectName||''),effectDescription:String(uniqueEffectDescription||''),ownerTest:uniqueCfg?.enabled!==true}:null;
    return [String(card.id),{...card,uniqueAbility}];
  }));
  const breakthroughMap=Object.fromEntries(levelRows.map(row=>[`${row.user_id}:${row.card_id}`,Number(row.breakthrough_level||0)]));
  const value={cardMap,breakthroughMap};
  raidDisplayDataCacheV1311.set(cacheKey,{value,expiresAt:now+RAID_DISPLAY_CACHE_TTL_V1311});
  raidPruneDisplayCacheV1311(now);
  return value;
}

async function cancelRaidForInsufficientPlayers(env,instance,participants){
  const existing=await env.DB.prepare('SELECT status FROM raid_room_cancellations WHERE instance_id=?').bind(instance.id).first();
  if(existing?.status==='COMPLETED')return;
  if(!existing)await env.DB.prepare("INSERT OR IGNORE INTO raid_room_cancellations(instance_id,reason,status) VALUES(?,'MIN_PARTICIPANTS','PENDING')").bind(instance.id).run();
  const opener=await env.DB.prepare("SELECT user_id AS userId,cost FROM raid_open_requests WHERE instance_id=? AND status='COMPLETED' ORDER BY created_at LIMIT 1").bind(instance.id).first();
  const dateKey=kstDateKey(Date.parse(instance.created_at||Date.now()));
  const statements=[env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='LOBBY'").bind(instance.id)];
  for(const row of participants){
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO raid_daily_entry_restores(user_id,entry_date,instance_id,reason) VALUES(?,?,?,'MIN_PARTICIPANTS')").bind(row.user_id,dateKey,instance.id));
  }
  const refund=Math.max(0,Number(opener?.cost||0));
  if(opener?.userId&&refund>0){
    statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(refund,opener.userId));
    statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'RAID_OPEN_REFUND' FROM users WHERE id=?").bind(refund,opener.userId));
  }
  statements.push(env.DB.prepare("UPDATE raid_room_cancellations SET status='COMPLETED',refund_user_id=?,refund_coin=?,restored_entries=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=?").bind(opener?.userId||null,refund,participants.length,instance.id));
  await env.DB.batch(statements);
}

function raidCombatSnapshot(participants,instance,cfg,nowMs=Date.now()){return raidCombatSnapshotV1293(participants,instance,cfg,nowMs);}

function raidProjectedDamage(totalPower,cfg){
  const attacks=Math.max(1,Math.floor(Number(cfg.battleSeconds||120)*1000/Math.max(200,Number(cfg.attackIntervalMs||800))));
  const critFactor=cfg.criticalEnabled?1+(Number(cfg.criticalChance||0)/100)*(Math.max(1,Number(cfg.criticalMultiplier||1))-1):1;
  return Math.max(1,Math.floor(Math.max(0,Number(totalPower||0))*Number(cfg.damageMultiplier||1)*attacks*critFactor/10));
}

async function repairRaidZeroDamage(env,instanceId,cfg,participants=null){
  const rows=Array.isArray(participants)?participants:(await env.DB.prepare('SELECT id,total_power FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1 AND COALESCE(total_damage,0)<=0').bind(Number(instanceId)).all()).results||[];
  const zeroRows=rows.filter(row=>Number(row.total_damage??row.totalDamage??0)<=0);
  if(!zeroRows.length)return 0;
  const results=await env.DB.batch(zeroRows.map(row=>env.DB.prepare('UPDATE raid_participants SET total_damage=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(total_damage,0)<=0').bind(raidProjectedDamage(row.total_power??row.totalPower,cfg),row.id)));
  return results.reduce((sum,result)=>sum+Number(result?.meta?.changes||0),0);
}

async function refreshRaidForOwner(env,instance,cfg){
  if(!instance)return null;
  cfg=await raidInstanceSettingsV1293(env,instance.id,cfg);
  const now=Date.now(),startMs=instance.starts_at?Date.parse(instance.starts_at):0,endMs=instance.ends_at?Date.parse(instance.ends_at):0;
  if(instance.status==='LOBBY'&&startMs&&now>=startMs){
    const participants=(await env.DB.prepare(`SELECT rp.id,rp.user_id,rp.total_power,rp.total_damage,UPPER(TRIM(COALESCE(u.role,'USER'))) AS user_role FROM raid_participants rp JOIN users u ON u.id=rp.user_id WHERE rp.instance_id=? AND COALESCE(rp.is_active,1)=1`).bind(instance.id).all()).results;
    // OWNER가 실제 참가한 방은 접근 모드와 관계없이 운영 테스트가 가능해야 한다.
    // 일반 유저만 참가한 공개 방에는 기존 최소 참가 인원 규칙을 그대로 적용한다.
    const ownerParticipantPresent=participants.some(row=>String(row.user_role||'').trim().toUpperCase()==='OWNER');
    const effectiveMinParticipants=ownerParticipantPresent?1:Number(cfg.minParticipants||1);
    if(participants.length>=effectiveMinParticipants){
      const startWrites=participants.filter(row=>Number(row.total_damage||0)<=0).map(row=>env.DB.prepare('UPDATE raid_participants SET total_damage=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(total_damage,0)<=0').bind(raidProjectedDamage(row.total_power,cfg),row.id));
      startWrites.push(env.DB.prepare("UPDATE raid_instances SET status='BATTLE',current_hp=?,participant_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='LOBBY'").bind(Math.max(0,Number(instance.max_hp||0)),participants.length,instance.id));
      // D1 batch는 한 트랜잭션으로 커밋된다. 참가자 피해량이 모두 준비되기 전에는
      // BATTLE 상태가 외부 조회에 노출되지 않도록 상태 전환을 마지막 문장에 둔다.
      const startResults=await env.DB.batch(startWrites),transitioned=startResults[startResults.length-1];
      if(Number(transitioned?.meta?.changes||0)!==1)return env.DB.prepare('SELECT * FROM raid_instances WHERE id=?').bind(instance.id).first();
      instance.status='BATTLE';instance.current_hp=Math.max(0,Number(instance.max_hp||0));instance.participant_count=participants.length;
    }else{
      const cancelled=await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='LOBBY'").bind(instance.id).run();
      if(Number(cancelled?.meta?.changes||0)===1)await cancelRaidForInsufficientPlayers(env,instance,participants);
      instance.status='ENDED';instance.ends_at=new Date().toISOString();
    }
  }
  if(instance.status==='BATTLE'&&endMs){
    await repairRaidZeroDamage(env,instance.id,cfg);
    const rows=(await env.DB.prepare('SELECT user_id AS userId,total_power AS totalPower,total_damage AS totalDamage FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1').bind(instance.id).all()).results;
    const snapshot=raidCombatSnapshot(rows,instance,cfg,now);
    if(snapshot.allDefeated||snapshot.cleared||now>=endMs){
      const finishedAt=new Date(startMs+snapshot.elapsedMs).toISOString();
      const ended=await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=?,current_hp=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='BATTLE'").bind(finishedAt,snapshot.bossHp,instance.id).run();
      if(Number(ended?.meta?.changes||0)===1)await finalizeRaidV1293(env,instance.id,snapshot);
      instance.status='ENDED';instance.ends_at=finishedAt;instance.current_hp=snapshot.bossHp;
    }
  }
  return instance;
}

async function ensureRaidFinalizedV1293(env,instanceId,fallbackCfg,nowMs=Date.now()){
  const instance=await env.DB.prepare(`SELECT ri.*,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.id=? LIMIT 1`).bind(Number(instanceId)).first();
  if(!instance)return null;
  const cfg=await raidInstanceSettingsV1293(env,instance.id,fallbackCfg);
  const finalized=await env.DB.prepare('SELECT 1 AS ok FROM raid_participant_v1293 WHERE instance_id=? LIMIT 1').bind(instance.id).first();
  if(finalized)return {instance,cfg,snapshot:null,alreadyFinalized:true};
  const rows=(await env.DB.prepare('SELECT user_id AS userId,total_power AS totalPower,total_damage AS totalDamage FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1').bind(instance.id).all()).results||[];
  const snapshot=raidCombatSnapshot(rows,instance,cfg,nowMs);
  await finalizeRaidV1293(env,instance.id,snapshot);
  return {instance,cfg,snapshot};
}

async function readRaidSettings(env){await ensureRaidOverhaulV1293(env);const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_settings_v1'").first();if(!row?.value)return defaultRaidSettings();try{return cleanRaidSettings(JSON.parse(row.value))}catch{return defaultRaidSettings()}}
async function raidSettings(env){return cachedRuntimeSetting('raid',5000,()=>readRaidSettings(env))}
async function raidRewardSnapshot(env,instanceId,cfg,create=true){
  const magicCfg=await magicSettings(env),raidMagic=magicCfg.acquisition?.raid||{};
  const participationMagic=raidMagic.enabled===true?Math.max(0,Math.floor(Number(raidMagic.participation||0))):0;
  const rankMagicRewards=raidMagic.enabled===true&&Array.isArray(raidMagic.rankRewards)?raidMagic.rankRewards:[];
  if(create)await env.DB.prepare('INSERT OR IGNORE INTO raid_reward_snapshots(instance_id,participation_coin,clear_coin,reward_shards,participation_magic_crystals,rank_magic_rewards_json) VALUES(?,?,?,?,?,?)').bind(Number(instanceId),Math.max(0,Number(cfg.participationCoin||0)),Math.max(0,Number(cfg.clearCoin||0)),Math.max(0,Number(cfg.rewardShards||0)),participationMagic,JSON.stringify(rankMagicRewards)).run();
  const row=await env.DB.prepare("SELECT participation_coin AS participationCoin,clear_coin AS clearCoin,reward_shards AS rewardShards,COALESCE(participation_magic_crystals,0) AS participationMagicCrystals,COALESCE(rank_magic_rewards_json,'[]') AS rankMagicRewardsJson FROM raid_reward_snapshots WHERE instance_id=?").bind(Number(instanceId)).first();
  if(!row)return {participationCoin:Math.max(0,Number(cfg.participationCoin||0)),clearCoin:Math.max(0,Number(cfg.clearCoin||0)),rewardShards:Math.max(0,Number(cfg.rewardShards||0)),participationMagicCrystals:participationMagic,rankMagicRewards};
  let savedRankRewards=[];try{savedRankRewards=JSON.parse(row.rankMagicRewardsJson||'[]')}catch{}
  return {...row,participationMagicCrystals:Math.max(0,Number(row.participationMagicCrystals||0)),rankMagicRewards:Array.isArray(savedRankRewards)?savedRankRewards:[]};
}
async function raidUserFinalRank(env,instanceId,userId){
  const rows=(await env.DB.prepare(`SELECT user_id,total_damage,joined_at,id FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1 ORDER BY total_damage DESC,joined_at ASC,id ASC`).bind(instanceId).all()).results;
  const index=rows.findIndex(row=>Number(row.user_id)===Number(userId));
  return index<0?0:index+1;
}
async function raidSettlementState(env,instanceId,userId,{repair=true}={}){
  const row=await env.DB.prepare(`SELECT
      COALESCE(rp.reward_claimed,0) AS rewardClaimed,
      UPPER(COALESCE(rr.status,'')) AS receiptStatus,
      UPPER(COALESCE(ur.status,'')) AS rewardStatus
    FROM raid_participants rp
    LEFT JOIN raid_reward_receipts rr ON rr.instance_id=rp.instance_id AND rr.user_id=rp.user_id
    LEFT JOIN raid_user_reward_v1293 ur ON ur.instance_id=rp.instance_id AND ur.user_id=rp.user_id
    WHERE rp.instance_id=? AND rp.user_id=? AND COALESCE(rp.is_active,1)=1
    LIMIT 1`).bind(Number(instanceId),Number(userId)).first();
  const settled=Number(row?.rewardClaimed||0)===1||String(row?.receiptStatus||'')==='COMPLETED'||String(row?.rewardStatus||'')==='COMPLETED';
  if(settled&&repair&&Number(row?.rewardClaimed||0)!==1){
    await env.DB.prepare('UPDATE raid_participants SET reward_claimed=1,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND COALESCE(reward_claimed,0)=0').bind(Number(instanceId),Number(userId)).run();
  }
  return {settled,rewardClaimed:settled?1:Number(row?.rewardClaimed||0),receiptStatus:String(row?.receiptStatus||''),rewardStatus:String(row?.rewardStatus||'')};
}
async function raidBossOpenPolicies(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_user_open_bosses_v1'").first();if(!row?.value)return {};try{const raw=JSON.parse(row.value),out={};for(const [id,v] of Object.entries(raw||{})){out[String(Number(id))]={enabled:v?.enabled===true,cost:Math.max(0,Math.min(100000000,Math.floor(Number(v?.cost)||0)))}}return out}catch{return {}}}
function kstDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
async function raidDailyEntryCount(env,userId,dateKey=kstDateKey()){
  const [legacy,uses,restores]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entries WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entry_uses WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entry_restores WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first()
  ]);
  return Math.max(0,Number(legacy?.count||0)+Number(uses?.count||0)-Number(restores?.count||0));
}
const RAID_ENTRY_STATUS_CACHE_TTL=10000;
const RAID_ENTRY_STATUS_CACHE_MAX=128;
const raidEntryStatusCache=new Map();
async function raidEntryStatusCounts(env,userId,dateKey,slots){
  const slotSignature=(Array.isArray(slots)?slots:[]).map(x=>`${x?.id||x}:${x?.entriesPerSlot||1}`).join('|');
  const key=`${Number(userId)}:${String(dateKey)}:${slotSignature}`,now=Date.now(),cached=raidEntryStatusCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.value;
  const [todayEntryCount,slotEntries]=await Promise.all([raidDailyEntryCount(env,userId,dateKey),raidSlotEntryCountsV1296(env,userId,dateKey,slots)]),value={todayEntryCount,slotEntries};
  raidEntryStatusCache.set(key,{value,expiresAt:now+RAID_ENTRY_STATUS_CACHE_TTL});
  for(const [cacheKey,row] of raidEntryStatusCache)if(row.expiresAt<=now)raidEntryStatusCache.delete(cacheKey);
  while(raidEntryStatusCache.size>RAID_ENTRY_STATUS_CACHE_MAX)raidEntryStatusCache.delete(raidEntryStatusCache.keys().next().value);
  return value;
}
async function raidDeckPower(env,userId,cardIds,mode='RAID'){
  let ids=[...new Set((cardIds||await pveDeckCards(env,userId)).map(String))];
  if(ids.length!==5){const e=new Error('저장된 PvE 덱 5장이 필요합니다.');e.status=400;throw e}
  const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(userId,...ids).all();
  if(owned.results.length!==5){const e=new Error('보유하지 않은 카드가 포함되어 있습니다.');e.status=400;throw e}
  const prestigeCount=owned.results.filter(card=>String(card.rarity||'').toUpperCase()==='PRESTIGE').length,furCount=owned.results.filter(card=>String(card.rarity||'').toUpperCase()==='FUR').length,zenithCount=owned.results.filter(card=>String(card.rarity||'').toUpperCase()==='ZENITH').length;
  if(prestigeCount>PRESTIGE_DECK_LIMIT){const e=new Error(`PvE 덱에는 PRESTIGE 카드를 최대 ${PRESTIGE_DECK_LIMIT}장까지만 편성할 수 있습니다.`);e.status=400;e.code='PRESTIGE_DECK_LIMIT';throw e}
  if(furCount>FUR_DECK_LIMIT){const e=new Error(`PvE 덱에는 FUR 카드를 최대 ${FUR_DECK_LIMIT}장까지만 편성할 수 있습니다.`);e.status=400;e.code='FUR_DECK_LIMIT';throw e}
  if(zenithCount>ZENITH_DECK_LIMIT){const e=new Error('PvE 덱에는 ZENITH 카드를 1장만 편성할 수 있습니다.');e.status=400;e.code='ZENITH_DECK_LIMIT';throw e}
  const [battleCfg,deckUser,characterBonus]=await Promise.all([battleSettings(env),env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(userId).first(),userEquipmentBonuses(env,userId)]);
  const cards=owned.results.map(card=>({...card,grade:String(card.rarity||'C').toUpperCase(),breakthroughLevel:Number(card.breakthrough_level||0),power:cardBattlePower(card,card.breakthrough_level,battleCfg)}));
  const synergyMode=String(mode||'RAID').toUpperCase()==='PVE'?'PVE':'RAID';
  const [unique,synergy]=await Promise.all([cardUniqueDeckState(env,deckUser,cards,'PVE'),evaluateDeckSynergies(env,deckUser,ids,synergyMode,{forceOwnerTest:String(deckUser?.role||'').toUpperCase()==='OWNER'})]);
  const battleCards=unique?.cards?.length?unique.cards:cards;
  const basePower=Number(unique.power||cards.reduce((n,c)=>n+Number(c.power||0),0));
  const cardPower=Math.max(0,Math.floor(basePower*(1+Number(synergy.totals.attackPercent||0)/100+Number(synergy.totals.bossDamagePercent||0)/100)));
  const power=cardPower+Number(characterBonus.pve||0);
  return {ids,power,basePower,cardPower,characterBonus,synergy,unique,cards:battleCards,battleSettings:battleCfg};
}

/* V1191: 차원의 균열 원정 */
function defaultRiftSettings(){return {enabled:true,maxDifficulty:10,maxStages:7,weeklyRewardLimit:3,baseCoin:300,stageCoinIncrease:90,baseShards:4,baseCrystals:5,eventCrystalReward:20,riskCrystalReward:35,difficultyRewardPercent:Array.from({length:20},(_,i)=>(i+1)*100),difficultyCrystalBonus:Array.from({length:20},(_,i)=>i+1),nodeRewardPercent:{BATTLE:100,ELITE:160,BOSS:230,FINAL_BOSS:340},shardRewardPercent:{BATTLE:100,ELITE:150,BOSS:250,FINAL_BOSS:250},settingsVersion:2};}
function cleanRiftSettings(value={}){const base=defaultRiftSettings(),x=value&&typeof value==='object'?value:{},integer=(v,f,min,max)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(v))?Number(v):f))),percent=(v,f,min=0,max=10000)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):f)),difficultyRewardPercent=Array.from({length:20},(_,i)=>percent(x.difficultyRewardPercent?.[i],base.difficultyRewardPercent[i],0,10000)),difficultyCrystalBonus=Array.from({length:20},(_,i)=>integer(x.difficultyCrystalBonus?.[i],base.difficultyCrystalBonus[i],0,100000)),nodeKeys=['BATTLE','ELITE','BOSS','FINAL_BOSS'],nodeRewardPercent={},shardRewardPercent={};for(const key of nodeKeys){nodeRewardPercent[key]=percent(x.nodeRewardPercent?.[key],base.nodeRewardPercent[key],0,10000);shardRewardPercent[key]=percent(x.shardRewardPercent?.[key],base.shardRewardPercent[key],0,10000)}return {enabled:x.enabled!==false,maxDifficulty:integer(x.maxDifficulty,base.maxDifficulty,1,20),maxStages:7,weeklyRewardLimit:integer(x.weeklyRewardLimit,base.weeklyRewardLimit,1,20),baseCoin:integer(x.baseCoin,base.baseCoin,0,100000000),stageCoinIncrease:integer(x.stageCoinIncrease,base.stageCoinIncrease,0,10000000),baseShards:integer(x.baseShards,base.baseShards,0,1000000),baseCrystals:integer(x.baseCrystals,base.baseCrystals,0,1000000),eventCrystalReward:integer(x.eventCrystalReward,base.eventCrystalReward,0,1000000),riskCrystalReward:integer(x.riskCrystalReward,base.riskCrystalReward,0,1000000),difficultyRewardPercent,difficultyCrystalBonus,nodeRewardPercent,shardRewardPercent,settingsVersion:2};}
async function riftSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pve_rift_settings_v1'").first();try{return cleanRiftSettings(JSON.parse(row?.value||'{}'))}catch{return defaultRiftSettings()}}
function riftJson(value,fallback){try{return JSON.parse(value||'')}catch{return fallback}}
function riftBuffCatalog(){return [
  {key:'VANGUARD_SUPPORT',name:'선봉 지원',icon:'⚔',description:'출정 즉시 원정 전투력이 15% 증가합니다.',attackPercent:15,initialOnly:true},
  {key:'EMERGENCY_BARRIER',name:'응급 방벽',icon:'◆',description:'출정 즉시 받는 피해가 20% 감소합니다.',damageReducePercent:20,initialOnly:true},
  {key:'LIFE_SEED',name:'생명 씨앗',icon:'♥',description:'전투 승리 후 생존 카드 체력을 10 회복합니다.',healAfterWin:10,initialOnly:true},
  {key:'ATTACK_CORE',name:'공격 코어',icon:'⚔',description:'원정 전투력이 25% 증가합니다.',attackPercent:25},
  {key:'BARRIER_FIELD',name:'방벽 전개',icon:'◆',description:'전투 후 받는 피해가 35% 감소합니다.',damageReducePercent:35},
  {key:'VELOCITY_LINK',name:'속도 연계',icon:'↯',description:'원정 전투력이 18% 증가하고 정예전에서 추가 15%를 얻습니다.',attackPercent:18,elitePercent:15},
  {key:'LIFE_PULSE',name:'생명 파동',icon:'♥',description:'승리할 때마다 생존 카드 체력을 15 회복합니다.',healAfterWin:15},
  {key:'BOSS_HUNTER',name:'보스 사냥꾼',icon:'♛',description:'보스 전투력이 40% 증가합니다.',bossPercent:40},
  {key:'SECOND_WIND',name:'두 번째 숨결',icon:'✦',description:'처음 전투 불능이 된 카드 1장을 체력 40으로 부활시킵니다.',reviveOnce:true,reviveHp:40},
  {key:'CRYSTAL_GREED',name:'마법 결정 탐욕',icon:'◇',description:'노드 보상 마법 결정이 50% 증가하지만 받는 피해가 5% 증가합니다.',crystalPercent:50,damageTakenPercent:5}
];}
function riftBuffByKey(key){return riftBuffCatalog().find(x=>x.key===key)||null}
function riftBuffTotals(keys=[]){const out={attackPercent:0,damageReducePercent:0,elitePercent:0,healAfterWin:0,bossPercent:0,crystalPercent:0,damageTakenPercent:0,reviveHp:0,reviveOnce:false};for(const key of keys){const b=riftBuffByKey(key);if(!b)continue;for(const k of Object.keys(out)){if(typeof out[k]==='boolean')out[k]=out[k]||Boolean(b[k]);else out[k]+=Number(b[k]||0)}}return out}
function riftStageTypes(stage){return [
  ['BATTLE','BATTLE'],
  ['BATTLE','EVENT'],
  ['ELITE','REST'],
  ['BOSS'],
  ['BATTLE','RISK'],
  ['ELITE','EVENT'],
  ['FINAL_BOSS']
][Math.max(0,Math.min(6,Number(stage)||0))]||['BATTLE'];}
function riftNodeLabel(type){return ({BATTLE:'일반 전투',ELITE:'정예 전투',REST:'회복 지점',EVENT:'균열 사건',RISK:'위험한 제안',BOSS:'중간 보스',FINAL_BOSS:'최종 보스'})[type]||type}
function riftNodeFactor(type,stage,difficulty){const d=Math.max(1,Number(difficulty)||1),s=Math.max(0,Number(stage)||0);let factor;if(type==='ELITE')factor=.91+d*.035+s*.035;else if(type==='BOSS')factor=1.03+d*.04+s*.04;else if(type==='FINAL_BOSS')factor=1.19+d*.05+s*.045;else factor=.72+d*.03+s*.03;if(d===1)factor*=(type==='BOSS'||type==='FINAL_BOSS') ? .75 : .8;return factor}
function riftHighDifficultyMonsterPowerMultiplier(difficulty){const d=Math.max(1,Math.floor(Number(difficulty)||1));return ({5:1.3,6:1.5,7:1.75,8:2.05,9:2.4,10:2.8})[d]||1}
function riftMonsterUltimateDefensePercent(difficulty){const d=Math.max(1,Math.floor(Number(difficulty)||1));return d<3?0:Math.min(50,15+(d-3)*5)}
async function riftMonsterPool(env,wantBoss=false){
  const merged=[],seen=new Set(),pushRows=(rows=[],source='PVE')=>{for(const row of rows||[]){const key=`${source}:${row.id}`;if(seen.has(key))continue;seen.add(key);merged.push({...row,source})}};
  let battleRows=[];
  if(wantBoss){
    battleRows=(await env.DB.prepare(`SELECT id,name,image_url AS image,battle_power AS battlePower,is_boss AS isBoss FROM battle_monsters WHERE is_active=1 AND COALESCE(pve_enabled,1)=1 AND COALESCE(is_boss,0)=1 ORDER BY COALESCE(pve_display_order,sort_order,0),id LIMIT 100`).all()).results||[];
    pushRows(battleRows,'PVE');
  }else{
    battleRows=(await env.DB.prepare(`SELECT id,name,image_url AS image,battle_power AS battlePower,is_boss AS isBoss FROM battle_monsters WHERE is_active=1 AND COALESCE(is_boss,0)=0 AND (COALESCE(pve_enabled,1)=1 OR COALESCE(tower_enabled,0)=1 OR COALESCE(tower_only,0)=1) ORDER BY COALESCE(pve_display_order,sort_order,0),id LIMIT 140`).all()).results||[];
    pushRows(battleRows,'BATTLE_MONSTER');
    try{
      const towerRows=(await env.DB.prepare(`SELECT (-1000000-id) AS id,name,image_url AS image,base_power AS battlePower,is_boss AS isBoss FROM tower_monsters WHERE is_active=1 AND COALESCE(is_boss,0)=0 ORDER BY sort_order,id LIMIT 100`).all()).results||[];
      pushRows(towerRows,'TOWER_MONSTER');
    }catch(error){console.warn('[RIFT] tower_monsters pool unavailable',error?.message||error)}
  }
  if(!merged.length){const fallback=(await env.DB.prepare(`SELECT id,name,image_url AS image,battle_power AS battlePower,is_boss AS isBoss FROM battle_monsters WHERE is_active=1 AND COALESCE(is_boss,0)=? ORDER BY id LIMIT 80`).bind(wantBoss?1:0).all()).results||[];pushRows(fallback,'FALLBACK')}
  return merged;
}
async function riftBuildChoices(env,runId,stage,difficulty,basePower){const settings=await riftSettings(env),types=riftStageTypes(stage),normal=await riftMonsterPool(env,false),boss=types.some(t=>t==='BOSS'||t==='FINAL_BOSS')?await riftMonsterPool(env,true):[],difficultyIndex=Math.max(0,Math.min(19,Number(difficulty||1)-1)),difficultyMultiplier=Number(settings.difficultyRewardPercent?.[difficultyIndex]||100)/100,crystalDifficultyBonus=Number(settings.difficultyCrystalBonus?.[difficultyIndex]||difficulty||1);return types.map((type,index)=>{const node={id:`${runId}:${stage}:${index}:${type}`,stage,type,label:riftNodeLabel(type),balanceVersion:3};if(['BATTLE','ELITE','BOSS','FINAL_BOSS'].includes(type)){const pool=(type==='BOSS'||type==='FINAL_BOSS')?(boss.length?boss:normal):normal,monster=pool.length?pool[Math.floor(Math.random()*pool.length)]:null,nodeMultiplier=Number(settings.nodeRewardPercent?.[type]||100)/100,shardMultiplier=Number(settings.shardRewardPercent?.[type]||100)/100;node.monsterId=Number(monster?.id||0);node.name=monster?.name||(type==='FINAL_BOSS'?'균열의 지배자':type==='BOSS'?'균열 수문장':'균열 마물');node.image=monster?.image||'';node.battlePower=Math.max(100,Math.floor(Math.max(100,Number(basePower||1000))*riftNodeFactor(type,stage,difficulty)*riftHighDifficultyMonsterPowerMultiplier(difficulty)));node.rewardPreview={coin:Math.max(0,Math.floor((settings.baseCoin+stage*settings.stageCoinIncrease)*difficultyMultiplier*nodeMultiplier)),shards:Math.max(0,Math.floor(settings.baseShards*difficultyMultiplier*shardMultiplier)),crystals:Math.max(0,Math.floor((settings.baseCrystals+stage+crystalDifficultyBonus)*nodeMultiplier))};}else if(type==='REST'){node.name='별빛 휴식처';node.description='생존 카드의 체력을 25 회복합니다.';}else if(type==='EVENT'){node.name='불안정한 균열';node.eventKind=['HEAL','CRYSTAL','POWER'][Math.floor(Math.random()*3)];node.description=({HEAL:'전 카드 체력을 15 회복합니다.',CRYSTAL:`마법 결정 ${Number(settings.eventCrystalReward||0)}개를 확보합니다.`,POWER:'공격 코어 효과를 획득합니다.'})[node.eventKind];}else if(type==='RISK'){node.name='붕괴 직전의 보물';node.description=`전 카드 체력 10을 대가로 마법 결정 ${Number(settings.riskCrystalReward||0)}개를 확보합니다.`;}return node;});}
async function riftWeeklyRow(env,userId,settings){const weekKey=premiumCubeWeekKey();await env.DB.prepare('INSERT OR IGNORE INTO pve_rift_weekly(user_id,week_key,started_count,completed_count,reward_count,highest_difficulty) VALUES(?,?,0,0,0,0)').bind(userId,weekKey).run();const row=await env.DB.prepare('SELECT * FROM pve_rift_weekly WHERE user_id=? AND week_key=?').bind(userId,weekKey).first();return {weekKey,startedCount:Number(row?.started_count||0),completedCount:Number(row?.completed_count||0),rewardCount:Number(row?.reward_count||0),highestDifficulty:Number(row?.highest_difficulty||0),rewardLimit:Number(settings.weeklyRewardLimit||3)};}
function riftStateFromRow(row){if(!row)return null;const state=riftJson(row.state_json,{});return {runId:row.run_id,weekKey:row.week_key,difficulty:Number(row.difficulty||1),status:row.status,deck:riftJson(row.deck_cards,[]).map(String),stage:Number(state.stage||0),maxStages:Number(state.maxStages||7),hp:state.hp||{},buffs:Array.isArray(state.buffs)?state.buffs:[],history:Array.isArray(state.history)?state.history:[],currentChoices:Array.isArray(state.currentChoices)?state.currentChoices:[],activeNode:state.activeNode||null,pendingBuffChoices:Array.isArray(state.pendingBuffChoices)?state.pendingBuffChoices:[],stash:state.stash||{coin:0,shards:0,crystals:0},basePower:Number(state.basePower||0),rewardEligible:state.rewardEligible!==false,reviveUsed:state.reviveUsed===true,initialBuffPending:state.initialBuffPending===true,noviceProtectionUsed:state.noviceProtectionUsed===true,battleRewardBonusPercent:Math.max(0,Number(state.battleRewardBonusPercent||0)),battleWinCounts:{BATTLE:Math.max(0,Number(state.battleWinCounts?.BATTLE||0)),ELITE:Math.max(0,Number(state.battleWinCounts?.ELITE||0))},createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at||null};}
function riftStateForSave(run){return {stage:run.stage,maxStages:run.maxStages,hp:run.hp,buffs:run.buffs,history:run.history,currentChoices:run.currentChoices,activeNode:run.activeNode,pendingBuffChoices:run.pendingBuffChoices,stash:run.stash,basePower:run.basePower,rewardEligible:run.rewardEligible,reviveUsed:run.reviveUsed,initialBuffPending:run.initialBuffPending===true,noviceProtectionUsed:run.noviceProtectionUsed===true,battleRewardBonusPercent:Math.max(0,Number(run.battleRewardBonusPercent||0)),battleWinCounts:{BATTLE:Math.max(0,Number(run.battleWinCounts?.BATTLE||0)),ELITE:Math.max(0,Number(run.battleWinCounts?.ELITE||0))}};}
async function riftLatestRun(env,userId){let row=await env.DB.prepare(`SELECT * FROM pve_rift_runs WHERE user_id=? AND COALESCE(status,'ACTIVE') NOT IN ('CLAIMED','ABANDONED') ORDER BY CASE COALESCE(status,'ACTIVE') WHEN 'ACTIVE' THEN 0 WHEN 'COMPLETED_PENDING' THEN 1 WHEN 'CLAIMING' THEN 2 WHEN 'FAILED' THEN 3 ELSE 4 END,datetime(updated_at) DESC,datetime(created_at) DESC,rowid DESC LIMIT 1`).bind(userId).first();if(!row)return null;if(String(row.status||'ACTIVE')==='CLAIMING'){await env.DB.prepare("UPDATE pve_rift_runs SET status='COMPLETED_PENDING',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='CLAIMING'").bind(row.run_id,userId).run();row={...row,status:'COMPLETED_PENDING'}}return riftStateFromRow(row)}
async function riftDeckCardsInfo(env,userId,ids){if(ids.length!==5)return [];const marks=ids.map(()=>'?').join(','),settings=await battleSettings(env),rows=(await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(userId,...ids).all()).results;return rows.map(c=>({...c,id:String(c.id),power:cardBattlePower(c,c.breakthrough_level,settings)}))}
function riftLegacyDifficultyOneScale(run,node){return Number(run?.difficulty||1)===1&&Number(node?.balanceVersion||0)<2?((node?.type==='BOSS'||node?.type==='FINAL_BOSS') ? .75 : .8):1}
function riftMonsterPowerScale(run,node){let scale=riftLegacyDifficultyOneScale(run,node);if(Number(run?.difficulty||1)>=5&&Number(node?.balanceVersion||0)<3)scale*=riftHighDifficultyMonsterPowerMultiplier(run.difficulty);return scale}
function riftPublicNode(run,node){if(!node)return null;const scale=riftMonsterPowerScale(run,node);return scale===1?node:{...node,battlePower:Math.max(1,Math.floor(Number(node.battlePower||1)*scale))}}
function riftPublicRun(run,cards=[]){if(!run)return null;return {...run,monsterUltimateDefensePercent:riftMonsterUltimateDefensePercent(run.difficulty),monsterPowerMultiplier:riftHighDifficultyMonsterPowerMultiplier(run.difficulty),monsterPowerBonusPercent:Math.max(0,Math.round((riftHighDifficultyMonsterPowerMultiplier(run.difficulty)-1)*100)),currentChoices:(run.currentChoices||[]).map(node=>riftPublicNode(run,node)),activeNode:riftPublicNode(run,run.activeNode),buffs:run.buffs.map(key=>riftBuffByKey(key)).filter(Boolean),cards:run.deck.map(id=>{const c=cards.find(x=>String(x.id)===String(id));return c?{id:String(c.id),title:c.title,rarity:c.rarity,powerType:c.power_type,image:c.image,focusX:Number(c.focus_x||50),focusY:Number(c.focus_y||50),breakthroughLevel:Number(c.breakthrough_level||0),power:Number(c.power||0),hp:Number(run.hp?.[id]??100)}:{id:String(id),hp:Number(run.hp?.[id]??100)}})};}
function riftPickInitialBuffChoices(){return ['VANGUARD_SUPPORT','EMERGENCY_BARRIER','LIFE_SEED']}
function riftPickBuffChoices(existing=[]){const regular=riftBuffCatalog().filter(x=>!x.initialOnly),pool=regular.filter(x=>!existing.includes(x.key)),source=pool.length>=3?pool:regular,picked=[];while(source.length&&picked.length<3){const item=source[Math.floor(Math.random()*source.length)];if(!picked.some(x=>x.key===item.key))picked.push(item);else if(picked.length>=source.length)break}return picked.map(x=>x.key)}
async function riftReceiptStart(env,requestId,userId,runId,action){requestId=String(requestId||'').trim();if(!/^[a-zA-Z0-9:_-]{12,120}$/.test(requestId))return {error:'요청 정보가 올바르지 않습니다.'};const prior=await env.DB.prepare('SELECT status,response_json FROM pve_rift_action_receipts WHERE request_id=? AND user_id=?').bind(requestId,userId).first();if(prior?.status==='COMPLETED'&&prior.response_json)return {response:riftJson(prior.response_json,null)};if(prior)return {error:'동일한 원정 요청이 처리 중입니다.'};const ins=await env.DB.prepare("INSERT OR IGNORE INTO pve_rift_action_receipts(request_id,user_id,run_id,action,status) VALUES(?,?,?,?,'PENDING')").bind(requestId,userId,runId||'',action).run();return ins.meta.changes?{ok:true}:{error:'동일한 원정 요청이 처리 중입니다.'};}
async function riftReceiptFail(env,requestId,message){await env.DB.prepare("UPDATE pve_rift_action_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(String(message||'FAILED').slice(0,500),requestId).run();}


function normalizeBattleEngineSettings(raw={}){
  const mode=String(raw?.mode??'V2_OWNER').trim().toUpperCase();
  const healer=raw?.singleHealerBonus||{};
  return {mode:['LEGACY','V2_OWNER','V2_PUBLIC'].includes(mode)?mode:'LEGACY',playbackSpeed:1.6,singleHealerBonus:{enabled:healer.enabled!==false,teamHpPercent:Math.max(0,Math.min(50,Number(healer.teamHpPercent??8))),healPercent:Math.max(0,Math.min(50,Number(healer.healPercent??10))),crisisThresholdPercent:Math.max(1,Math.min(99,Number(healer.crisisThresholdPercent??40))),crisisHealPercent:Math.max(0,Math.min(80,Number(healer.crisisHealPercent??16))),pvpMaxActivations:Math.max(0,Math.min(20,Math.floor(Number(healer.pvpMaxActivations??4)))),pveMaxActivations:Math.max(0,Math.min(30,Math.floor(Number(healer.pveMaxActivations??6))))}};
}
function defaultBattleSettings(){return {enabled:true,deckSize:5,engine:normalizeBattleEngineSettings(),nightmare:normalizeNightmareSettings(),powerByGrade:{...BATTLE_POWER_DEFAULT},breakthroughBonus:[...BATTLE_BREAKTHROUGH_DEFAULT],cardDrop:{enabled:true,defaultRate:3,gradeRates:{C:40,U:25,R:15,SR:10,HR:6,UR:3,SSR:1,MA:0,FUR:0}},energy:{enabled:true,maxEnergy:10,dailyRestore:10,rechargeMinutes:15,costPerBattle:1,adminUnlimited:true,testUnlimited:true},ultimateRules:[{enabled:true,name:'SSR AWAKENING',requiredGrade:'SSR',minBreakthrough:5,requiredCount:1,activationChance:100,mediaUrl:'/assets/effects/SKILL-v1497.webp',durationMs:3000,coefficientPercent:500}]};}
function cleanBattleSettingsPayload(x={},base=defaultBattleSettings()){
  return {enabled:x.enabled!==false,deckSize:5,engine:normalizeBattleEngineSettings(x.engine||base.engine),nightmare:normalizeNightmareSettings(x.nightmare||base.nightmare),powerByGrade:Object.fromEntries(Object.keys(base.powerByGrade).map(g=>[g,Math.max(0,Math.floor(Number(x.powerByGrade?.[g]??base.powerByGrade[g])))])),breakthroughBonus:base.breakthroughBonus.map((v,i)=>Math.max(0,Number(x.breakthroughBonus?.[i]??v))),cardDrop:{enabled:x.cardDrop?.enabled!==false,defaultRate:Math.max(0,Math.min(100,Number(x.cardDrop?.defaultRate??base.cardDrop.defaultRate))),gradeRates:Object.fromEntries(Object.keys(base.cardDrop.gradeRates).map(g=>[g,Math.max(0,Math.min(100,Number(x.cardDrop?.gradeRates?.[g]??base.cardDrop.gradeRates[g])))]))},energy:{enabled:x.energy?.enabled!==false,maxEnergy:Math.max(1,Math.min(999,Math.floor(Number(x.energy?.maxEnergy??base.energy.maxEnergy)))),dailyRestore:Math.max(0,Math.min(999,Math.floor(Number(x.energy?.dailyRestore??base.energy.dailyRestore)))),rechargeMinutes:Math.max(1,Math.min(1440,Math.floor(Number(x.energy?.rechargeMinutes??base.energy.rechargeMinutes)))),costPerBattle:Math.max(1,Math.min(99,Math.floor(Number(x.energy?.costPerBattle??base.energy.costPerBattle)))),adminUnlimited:x.energy?.adminUnlimited!==false,testUnlimited:x.energy?.testUnlimited!==false},ultimateRules:(Array.isArray(x.ultimateRules)?x.ultimateRules:base.ultimateRules).slice(0,50).map((u,i)=>({enabled:u?.enabled!==false,name:String(u?.name||`ULTIMATE ${i+1}`).slice(0,40),requiredGrade:normalizeUltimateRequiredGrade(u?.requiredGrade),minBreakthrough:Math.max(0,Math.min(20,Math.floor(Number(u?.minBreakthrough||0)))),requiredCount:Math.max(1,Math.min(5,Math.floor(Number(u?.requiredCount||1)))),activationChance:Math.max(0,Math.min(100,Number(u?.activationChance??100))),mediaUrl:String(u?.mediaUrl||'/assets/effects/SKILL.gif').replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(u?.durationMs||3000)))),coefficientPercent:Math.max(0,Math.min(100000,Number(u?.coefficientPercent??u?.damageValue??500)))}))};
}
async function readBattleSettings(env){
  const rows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('battle_settings_v1','battle_nightmare_settings_v1')").all();
  const values=new Map((rows.results||[]).map(row=>[String(row.key),row.value]));
  const base=defaultBattleSettings();let settings=base;
  try{if(values.get('battle_settings_v1'))settings=cleanBattleSettingsPayload(JSON.parse(values.get('battle_settings_v1')),base)}catch{settings=base}
  try{if(values.get('battle_nightmare_settings_v1'))settings={...settings,nightmare:normalizeNightmareSettings(JSON.parse(values.get('battle_nightmare_settings_v1')))}}catch{}
  return settings;
}
async function battleSettings(env){return cachedRuntimeSetting('battle',1000,()=>readBattleSettings(env))}
function battleEngineState(settings,user){const engine=normalizeBattleEngineSettings(settings?.engine);const owner=String(user?.role||'').trim().toUpperCase()==='OWNER';const active=engine.mode==='V2_PUBLIC'||(engine.mode==='V2_OWNER'&&owner);return {...engine,active,version:active?'V2':'LEGACY',ownerTest:engine.mode==='V2_OWNER'};}
const CARD_POWER_TYPES={SSR:{NORMAL:1300,HIGH:1375,TOP:1450},MA:{NORMAL:1850,HIGH:2050,TOP:2250},LIMITED:{NORMAL:2350,HIGH:2600,TOP:2850},PRESTIGE:{CUSTOM:3100},FUR:{FIXED:3200}};
const FAKER_CHAMPIONSHIP_CARD_ID='CN-0B48C6FF8F9B4AC5';
const FAKER_FLAT_POWER_BONUS=3000;
function cardPowerBase(card,settings){const grade=String(card.rarity||card.grade||'').trim().toUpperCase(),gradePower=Number(settings?.powerByGrade?.[grade]);if(['PRESTIGE','ZENITH'].includes(grade)&&Number.isFinite(gradePower))return Math.max(0,gradePower);const saved=Number(card.base_power??card.basePower);return Number.isFinite(saved)&&saved>0?saved:(Number.isFinite(gradePower)?Math.max(0,gradePower):0)}
function cardBattlePower(card,level,settings){const grade=String(card?.rarity||card?.grade||'').trim().toUpperCase(),cardId=String(card?.id??card?.card_id??'').trim().toUpperCase(),lv=Math.max(0,Math.min(13,Number(level)||0)),base=cardPowerBase(card,settings),pct=Number(settings.breakthroughBonus[lv]||0),power=Math.floor(base*(1+pct/100)),specialBonus=grade==='FUR'&&cardId===FAKER_CHAMPIONSHIP_CARD_ID?FAKER_FLAT_POWER_BONUS:0;if(grade!=='LIMITED'||lv<11)return power+specialBonus;const prestigeBase=Math.max(0,Number(settings?.powerByGrade?.PRESTIGE||0)),prestigePct=Number(settings?.breakthroughBonus?.[10]||0),prestige10=Math.floor(prestigeBase*(1+prestigePct/100));if(prestige10<=0)return power+specialBonus;const limited10=Math.floor(base*(1+Number(settings?.breakthroughBonus?.[10]||0)/100)),stepCap=Math.floor(limited10+Math.max(0,prestige10-limited10)*(lv-10)/3);return Math.min(power,prestige10,stepCap)+specialBonus;}
function sqlUtcNow(){return new Date().toISOString().replace('T',' ').slice(0,19)}
function utcMs(value){if(!value)return Date.now();const t=Date.parse(String(value).replace(' ','T')+'Z');return Number.isFinite(t)?t:Date.now()}
async function battleEnergyState(env,user,settings){
  const cfg=settings.energy||defaultBattleSettings().energy;
  const maintenance=await maintenanceSettings(env);
  const unlimited=!cfg.enabled||(cfg.adminUnlimited&&isAdminRole(user))||(cfg.testUnlimited&&maintenance.testUsers.includes(user.nickname));
  if(unlimited)return {enabled:cfg.enabled,unlimited:true,energy:cfg.maxEnergy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt:null,dailyResetAt:`${kstDate()} 00:00 KST`};
  const now=Date.now(),nowSql=sqlUtcNow(),today=kstDate();
  let row=await env.DB.prepare('SELECT * FROM user_battle_energy WHERE user_id=?').bind(user.id).first();
  if(!row){await env.DB.prepare('INSERT OR IGNORE INTO user_battle_energy(user_id,energy,last_recharged_at,last_daily_reset_date,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').bind(user.id,Math.min(cfg.maxEnergy,cfg.dailyRestore),nowSql,today).run();row=await env.DB.prepare('SELECT * FROM user_battle_energy WHERE user_id=?').bind(user.id).first();}
  let energy=Math.max(0,Math.min(cfg.maxEnergy,Number(row.energy||0))),last=utcMs(row.last_recharged_at),resetDate=String(row.last_daily_reset_date||'');
  const burningActivated=Date.parse(String(settings.__burningActivatedAt||''));if(Number.isFinite(burningActivated)&&last<burningActivated){energy=cfg.maxEnergy;last=now;resetDate=today;}
  if(resetDate!==today){energy=Math.min(cfg.maxEnergy,cfg.dailyRestore);last=now;resetDate=today;}
  if(energy<cfg.maxEnergy){const interval=cfg.rechargeMinutes*60000,gained=Math.floor((now-last)/interval);if(gained>0){energy=Math.min(cfg.maxEnergy,energy+gained);last=energy>=cfg.maxEnergy?now:last+gained*interval;}}
  const nextLastSql=new Date(last).toISOString().replace('T',' ').slice(0,19);
  if(energy!==Number(row.energy||0)||nextLastSql!==String(row.last_recharged_at||'')||resetDate!==String(row.last_daily_reset_date||'')){
    await env.DB.prepare('UPDATE user_battle_energy SET energy=?,last_recharged_at=?,last_daily_reset_date=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND (energy<>? OR last_recharged_at<>? OR last_daily_reset_date<>?)').bind(energy,nextLastSql,resetDate,user.id,energy,nextLastSql,resetDate).run();
  }
  const nextRechargeAt=energy>=cfg.maxEnergy?null:new Date(last+cfg.rechargeMinutes*60000).toISOString();
  return {enabled:true,unlimited:false,energy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt,dailyResetAt:`${today} 00:00 KST`};
}
async function consumeBattleEnergy(env,user,settings){
  const state=await battleEnergyState(env,user,settings);if(state.unlimited)return state;
  if(state.energy<state.costPerBattle){const e=new Error('전투 횟수가 부족합니다.');e.code='NO_BATTLE_ENERGY';e.energy=state;throw e;}
  const nowSql=sqlUtcNow();
  const result=await env.DB.prepare('UPDATE user_battle_energy SET energy=energy-?,last_recharged_at=CASE WHEN energy>=? THEN ? ELSE last_recharged_at END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND energy>=?').bind(state.costPerBattle,state.maxEnergy,nowSql,user.id,state.costPerBattle).run();
  if(!result.meta.changes){const e=new Error('전투 횟수가 부족합니다.');e.code='NO_BATTLE_ENERGY';e.energy=await battleEnergyState(env,user,settings);throw e;}
  return battleEnergyState(env,user,settings);
}

function uniqueBattleResponsePayload(uniqueState,runtime=null){
  if(!uniqueState?.enabled)return null;
  return {
    ownerTest:uniqueState.ownerTest,
    basePower:Number(uniqueState.basePower||0),
    effectivePower:Number(runtime?.effectivePower??uniqueState.power??0),
    attackPower:Number(uniqueState.attackPower||0),
    durabilityPower:Number(uniqueState.durabilityPower||0),
    speedPercent:Number(uniqueState.speedPercent||0),
    effects:uniqueState.effects||[],
    battleEffects:runtime&&runtime.hasEvents?runtime:null
  };
}

// V1785: options.collectBattleLog 이 주어지면 battle_logs INSERT 를 즉시 실행하지 않고
// 호출자에게 statement 를 넘긴다. 자동사냥은 한 요청에서 최대 수십 회 반복되므로
// 매회 왕복하던 감사 로그 쓰기를 마지막에 batch 1~2회로 묶을 수 있다.
// 인자를 주지 않으면 종전과 동일하게 즉시 실행된다.
async function resolveAutoBattle(env,user,settings,monster,cards,ids,uniqueBattle=null,requestId='',options={}){
  const difficulty=pveDifficultyRuntime(settings,monster);
  if(!difficulty.enabled){const error=new Error('현재 나이트메어 토벌은 중지되어 있습니다.');error.code='NIGHTMARE_DISABLED';throw error}
  const battleCards=uniqueBattle?.cards?.length?uniqueBattle.cards:cards;
  const basePlayerPower=Number(uniqueBattle?.power||cards.reduce((a,c)=>a+Number(c.power||0),0)),monsterPower=difficulty.effectiveBattlePower;
  const uniqueRuntime=uniqueBattle?.enabled?resolveUniqueBattleRuntime(uniqueBattle,{mode:'PVE_AUTO',opponentPower:monsterPower}):null;
  const characterBonus=await userEquipmentBonuses(env,user.id),cardPower=Math.max(0,Number(uniqueRuntime?.effectivePower||basePlayerPower)),uniquePlayerPower=cardPower+Number(characterBonus.pve||0);
  const activatedEntry=selectActivatedUltimate(settings,battleCards);
  const ultimateSourceCard=activatedEntry?.matchedCards?.[0]||null;
  const ultimateDamage=activatedEntry&&ultimateSourceCard?Math.max(0,Math.floor(Number(ultimateSourceCard.power||0)*Number(activatedEntry.rule.coefficientPercent||0)/100)):0;
  const preliminaryResult=uniquePlayerPower+ultimateDamage>=monsterPower?'WIN':'LOSE';
  const bossIsBoss=Number(monster.is_boss||0)===1||monster.is_boss===true,bossUltimateEnabled=Number(monster.ultimate_enabled||0)===1||monster.ultimate_enabled===true,bossUltimateConfigured=bossIsBoss&&bossUltimateEnabled;
  const bossTrigger=String(monster.ultimate_trigger||'ON_LOSS').toUpperCase(),bossChance=Math.max(0,Math.min(100,Number(monster.ultimate_chance??100))),bossForceCast=Number(monster.ultimate_force_cast||0)===1||monster.ultimate_force_cast===true,bossChanceHit=bossChance>=100||Math.random()*100<bossChance;
  const bossShouldCast=bossUltimateConfigured&&(bossForceCast||bossTrigger==='ALWAYS'||(bossTrigger==='ON_LOSS'&&preliminaryResult==='LOSE')||(bossTrigger==='CHANCE'&&bossChanceHit));
  const bossPveDamagePercent=difficulty.bossUltimateUnlocked?difficulty.bossUltimateCapPercent:Math.max(0,Math.min(100,Number(monster.ultimate_pve_damage_percent??monster.ultimate_damage_percent??0))),bossUltimatePenalty=bossShouldCast?Math.max(0,Math.floor(uniquePlayerPower*bossPveDamagePercent/100)):0;
  const result=Math.max(0,uniquePlayerPower+ultimateDamage-bossUltimatePenalty)>=monsterPower?'WIN':'LOSE',reward=result==='WIN'?Math.max(0,Math.floor(difficulty.effectiveRewardCoin*Number(settings.__burningRewardMultiplier||1))):0;
  // V1785: 코인 지급 + 코인 로그를 D1 배치 1회로 묶는다(자동사냥 반복 횟수만큼 왕복이 줄어든다).
  if(reward){
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id),
      env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(reward,`PVE 자동사냥 승리 보상: ${monster.name}`,user.id)
    ]);
  }
  let cardReward=null,equipmentReward=null,blackMiracleReward=null,unifiedDrop=null;if(result==='WIN'){const dropRequestId=requestId||`${Date.now()}-${monster.id}`;if(settings.cardDrop?.enabled!==false){const cardRate=Math.max(0,Math.min(100,Number(settings.cardDrop?.defaultRate??0)));if(cardRate>0&&Math.random()*100<cardRate)cardReward=await grantBattleCard(env,user.id,settings);}equipmentReward=await safeEquipmentDrop(env,{userId:user.id,sourceType:'PVE_AUTO',sourceId:String(monster.id),requestId:dropRequestId});blackMiracleReward=await rollBlackMiracleDrop(env,{userId:user.id,source:'PVE_AUTO',referenceId:dropRequestId});unifiedDrop=await safePveUnifiedDrop(env,{userId:user.id,requestId:`UNIFIED:${dropRequestId}`,sourceType:'PVE_AUTO',sourceId:String(monster.id),triggerType:'WIN',context:{boss:Boolean(monster.is_boss),difficulty:difficulty.difficulty},role:user.role,isNightmare:difficulty.isNightmare});}
  const autoBattleLogStatement=env.DB.prepare('INSERT INTO battle_logs(user_id,monster_id,deck_cards,player_power,monster_power,result,reward_coin) VALUES(?,?,?,?,?,?,?)').bind(user.id,monster.id,JSON.stringify(ids),uniquePlayerPower,monsterPower,result,reward);
  if(typeof options.collectBattleLog==='function')options.collectBattleLog(autoBattleLogStatement);
  else await autoBattleLogStatement.run();
  return {result,reward,cardReward,equipmentReward,blackMiracleReward,unifiedDrop,playerPower:uniquePlayerPower,cardPower,characterBonus,monsterPower,difficulty:{...difficulty,engineMonster:undefined},bossUltimate:bossShouldCast?{damagePercent:bossPveDamagePercent,penalty:bossUltimatePenalty,capPercent:difficulty.bossUltimateCapPercent,damageCapUnlocked:difficulty.bossUltimateUnlocked}:null,uniqueAbility:uniqueBattleResponsePayload(uniqueBattle,uniqueRuntime)};
}


function defaultBreakthroughConfig(){return Object.fromEntries(BREAKTHROUGH_GRADES.map(g=>[g,BREAKTHROUGH_COST.map((cost,i)=>({cost,rate:BREAKTHROUGH_RATE[i]}))]));}
// V1792: 전 유저 공통 설정인데 유일하게 캐시가 없어서 profile() 호출마다 app_meta 를 쳤다.
// 이웃 설정들(attendance 30초, masterStar 5초)과 같은 방식으로 맞춘다.
async function breakthroughConfig(env){return cachedRuntimeSetting('breakthroughConfig',30000,()=>readBreakthroughConfig(env))}
async function readBreakthroughConfig(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='breakthrough_config'").first();if(!row?.value)return defaultBreakthroughConfig();try{const parsed=JSON.parse(row.value),base=defaultBreakthroughConfig();for(const g of BREAKTHROUGH_GRADES)for(let i=0;i<breakthroughMaxLevel(g);i++){const x=parsed?.[g]?.[i]||{};base[g][i]={cost:Number.isInteger(Number(x.cost))&&Number(x.cost)>0?Number(x.cost):base[g][i].cost,rate:Number.isFinite(Number(x.rate))?Math.max(0,Math.min(100,Number(x.rate))):base[g][i].rate};}return base}catch{return defaultBreakthroughConfig()}}
function cleanMaMasterStarBreakthrough(raw={}){const base=MA_MASTER_STAR_BREAKTHROUGH_DEFAULT;return {enabled:raw.enabled===true,steps:Array.from({length:3},(_,i)=>{const x=raw?.steps?.[i]||{},fallback=base.steps[i];return {cost:Math.max(1,Math.min(9999,Math.floor(Number(x.cost)||fallback.cost))),rate:Math.max(0,Math.min(100,Number.isFinite(Number(x.rate))?Number(x.rate):fallback.rate)),retirementShardRefund:Math.max(0,Math.min(10000000,Math.floor(Number(x.retirementShardRefund)||0)))}})}}
async function maMasterStarBreakthroughConfig(env){const now=Date.now();if(maMasterStarBreakthroughCache&&maMasterStarBreakthroughCache.expiresAt>now)return maMasterStarBreakthroughCache.value;const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='ma_master_star_breakthrough_v1'").first();let value=cleanMaMasterStarBreakthrough();if(row?.value){try{value=cleanMaMasterStarBreakthrough(JSON.parse(row.value))}catch{}}maMasterStarBreakthroughCache={value,expiresAt:now+5000};return value}
function cleanLimitedMasterStarBreakthrough(raw={}){const base=LIMITED_MASTER_STAR_BREAKTHROUGH_DEFAULT;return {enabled:raw.enabled!==false,steps:Array.from({length:3},(_,i)=>{const x=raw?.steps?.[i]||{},fallback=base.steps[i];return {cost:Math.max(1,Math.min(9999,Math.floor(Number(x.cost)||fallback.cost))),rate:Math.max(0,Math.min(100,Number.isFinite(Number(x.rate))?Number(x.rate):fallback.rate)),retirementShardRefund:Math.max(0,Math.min(10000000,Math.floor(Number(x.retirementShardRefund)||fallback.retirementShardRefund)))}})}}
async function limitedMasterStarBreakthroughConfig(env){const now=Date.now();if(limitedMasterStarBreakthroughCache&&limitedMasterStarBreakthroughCache.expiresAt>now)return limitedMasterStarBreakthroughCache.value;const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='limited_master_star_breakthrough_v1'").first();let value=cleanLimitedMasterStarBreakthrough();if(row?.value){try{value=cleanLimitedMasterStarBreakthrough(JSON.parse(row.value))}catch{}}limitedMasterStarBreakthroughCache={value,expiresAt:now+5000};return value}
function defaultBreakthroughPity(){return {enabled:true,grade:'SSR',thresholds:Array(10).fill(5)};}
function cleanBreakthroughPity(raw={}){const base=defaultBreakthroughPity();return {enabled:raw.enabled!==false,grade:'SSR',thresholds:Array.from({length:10},(_,i)=>Math.max(1,Math.min(100,Math.floor(Number(raw.thresholds?.[i]??base.thresholds[i])||base.thresholds[i]))))};}
async function breakthroughPity(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='breakthrough_pity_ssr_v1'").first();try{return cleanBreakthroughPity(JSON.parse(row?.value||'{}'))}catch{return defaultBreakthroughPity()}}
function defaultBreakthroughCinematic(){return {enabled:true,minLevel:10,grades:[...BREAKTHROUGH_GRADES],title:'강화 각성',mediaUrl:'/assets/effects/SKILL-v1497.webp',soundUrl:'',durationMs:5000,volumePercent:100,skipAllowed:true};}
function cleanBreakthroughCinematic(raw={}){const base=defaultBreakthroughCinematic(),allowed=new Set(BREAKTHROUGH_GRADES),grades=(Array.isArray(raw.grades)?raw.grades:base.grades).map(x=>String(x||'').toUpperCase()).filter(x=>allowed.has(x));return {enabled:raw.enabled!==false,minLevel:Math.max(1,Math.min(13,Math.floor(Number(raw.minLevel??base.minLevel)||base.minLevel))),grades:[...new Set(grades.length?grades:base.grades)],title:String(raw.title||base.title).trim().slice(0,60)||base.title,mediaUrl:String(raw.mediaUrl||base.mediaUrl).trim().replace(/\\/g,'/').slice(0,500)||base.mediaUrl,soundUrl:String(raw.soundUrl||'').trim().replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(raw.durationMs??base.durationMs)||base.durationMs))),volumePercent:Math.max(0,Math.min(100,Number(raw.volumePercent??base.volumePercent))),skipAllowed:raw.skipAllowed!==false};}
async function breakthroughCinematicConfig(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='breakthrough_cinematic_v1'").first();try{return cleanBreakthroughCinematic(JSON.parse(row?.value||'{}'))}catch{return defaultBreakthroughCinematic()}}
async function breakthroughCinematicFor(env,{success=false,grade='',level=0,cardId='',cardTitle=''}){if(!success)return null;const cfg=await breakthroughCinematicConfig(env),normalizedGrade=String(grade||'').toUpperCase(),nextLevel=Math.max(0,Number(level||0));if(!cfg.enabled||nextLevel<cfg.minLevel||!cfg.grades.includes(normalizedGrade))return null;return {...cfg,grade:normalizedGrade,level:nextLevel,cardId:String(cardId||''),cardTitle:String(cardTitle||'')};}
const CORS_HEADERS={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,x-cnine-draw-receipt,x-cnine-auto-draw,x-cnine-draw-client,x-cnine-client-id,x-cnine-d1-bookmark','access-control-allow-credentials':'false','access-control-expose-headers':'x-cnine-response-ms,x-cnine-d1-bookmark','access-control-max-age':'86400'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store',...CORS_HEADERS,...headers}});
const readBody=async request=>{try{return await request.json()}catch{return {}}};
const bytes=value=>new TextEncoder().encode(value);
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',bytes(value)));
const createToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const createPrivateKey=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const part=()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');return `CN-${part()}-${part()}-${part()}`};
const kstDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function defaultAttendanceSettings(){return {enabled:true,rewards:[1000,1200,1400,1600,1800,2000,3000]};}
function cleanAttendanceSettings(raw={}){const base=defaultAttendanceSettings();const rewards=Array.from({length:7},(_,i)=>Math.max(0,Math.min(10000000,Math.floor(Number(raw.rewards?.[i]??base.rewards[i])||0))));return {enabled:raw.enabled!==false,rewards};}
async function readAttendanceSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='attendance_settings_v1'").first();if(!row?.value)return defaultAttendanceSettings();try{return cleanAttendanceSettings(JSON.parse(row.value))}catch{return defaultAttendanceSettings()}}
async function attendanceSettings(env){return cachedRuntimeSetting('attendance',30000,()=>readAttendanceSettings(env))}
const CUBE_CODES=['PREMIUM_CUBE'];
const RETIREMENT_REROLL_TICKETS={
  MA:{code:'MA_REROLL_TICKET',name:'MA 재뽑기권'},
  LIMITED:{code:'LIMITED_REROLL_TICKET',name:'리미티드 재뽑기권'},
  PRESTIGE:{code:'PRESTIGE_REROLL_TICKET',name:'PRESTIGE 재뽑기권'},
  FUR:{code:'FUR_REROLL_TICKET',name:'FUR 재뽑기권'}
};
const RETIREMENT_REROLL_CODES=Object.values(RETIREMENT_REROLL_TICKETS).map(item=>item.code);
function defaultCubeSettings(){return {PREMIUM_CUBE:{MA:70,FUR:20,LIMITED:10}};}
function cleanCubeSettings(raw={}){const base=defaultCubeSettings(),out={};for(const code of CUBE_CODES){out[code]={};for(const grade of Object.keys(base[code]))out[code][grade]=Math.max(0,Math.min(100,Number(raw?.[code]?.[grade]??base[code][grade])||0));const total=Object.values(out[code]).reduce((a,b)=>a+b,0);if(Math.abs(total-100)>.001)out[code]=base[code];}return out;}
async function readCubeSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='inventory_cube_settings_v1'").first();try{return cleanCubeSettings(JSON.parse(row?.value||'{}'))}catch{return defaultCubeSettings()}}
async function cubeSettings(env){return cachedRuntimeSetting('cube',30000,()=>readCubeSettings(env))}
function defaultCubeDropSettings(){return {PREMIUM_CUBE:{pveEnabled:true,pveRate:1,pvpEnabled:true,pvpRate:1}};}
function cleanCubeDropSettings(raw={}){const base=defaultCubeDropSettings(),out={};for(const code of CUBE_CODES){out[code]={pveEnabled:raw?.[code]?.pveEnabled!==false,pveRate:Math.max(0,Math.min(100,Number(raw?.[code]?.pveRate??base[code].pveRate)||0)),pvpEnabled:raw?.[code]?.pvpEnabled===true,pvpRate:Math.max(0,Math.min(100,Number(raw?.[code]?.pvpRate??base[code].pvpRate)||0))};}return out;}
async function readCubeDropSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='cube_drop_settings_v1072'").first();try{return cleanCubeDropSettings(JSON.parse(row?.value||'{}'))}catch{return defaultCubeDropSettings()}}
async function cubeDropSettings(env){return cachedRuntimeSetting('cube-drop',10000,()=>readCubeDropSettings(env))}
function cubeDropTotal(settings,source){const key=String(source).toLowerCase();return CUBE_CODES.reduce((sum,code)=>sum+(settings[code]?.[`${key}Enabled`]?Number(settings[code]?.[`${key}Rate`]||0):0),0)}
function defaultCubeBoostSettings(){return {enabled:false,targetHighGradeCount:2,zeroCountMultiplier:1,oneCountMultiplier:1,pveEnabled:false,pvpEnabled:false,excludeAdmins:true,pityEnabled:false,pityStartWins:30,pityIncrementRate:0,pityMaxBonusRate:0};}
function cleanCubeBoostSettings(){return defaultCubeBoostSettings();}
async function cubeBoostSettings(){return defaultCubeBoostSettings();}
function defaultWeeklyPremiumCubeSettings(){return {enabled:true,startRate:0.1,incrementRate:0.1,maxRate:10,weeklyLimit:2};}
function cleanWeeklyPremiumCubeSettings(raw={}){const base=defaultWeeklyPremiumCubeSettings();const startRate=Math.max(0.01,Math.min(100,Number(raw.startRate??base.startRate)||base.startRate)),maxRate=Math.max(startRate,Math.min(100,Number(raw.maxRate??base.maxRate)||base.maxRate));return {enabled:raw.enabled!==false,startRate,incrementRate:Math.max(0,Math.min(100,Number(raw.incrementRate??base.incrementRate)||0)),maxRate,weeklyLimit:Math.max(1,Math.min(100,Math.floor(Number(raw.weeklyLimit??base.weeklyLimit)||base.weeklyLimit)))};}
let weeklyPremiumCubeSettingsCache=null;
async function weeklyPremiumCubeSettings(env){
  const now=Date.now();
  if(weeklyPremiumCubeSettingsCache&&weeklyPremiumCubeSettingsCache.expiresAt>now)return weeklyPremiumCubeSettingsCache.value;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='weekly_premium_cube_settings_v1129'").first();
  let value;try{value=cleanWeeklyPremiumCubeSettings(JSON.parse(row?.value||'{}'))}catch{value=defaultWeeklyPremiumCubeSettings()}
  weeklyPremiumCubeSettingsCache={value,expiresAt:now+10000};
  return value;
}
function premiumCubeWeekKey(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date).map(x=>[x.type,x.value]));
  const dayMap={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6},offset=dayMap[parts.weekday]??0;
  const monday=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+09:00`);monday.setDate(monday.getDate()-offset);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(monday);
}
async function premiumCubeWeeklyStatus(env,userId,settingsOverride=null){
  const settings=settingsOverride||await weeklyPremiumCubeSettings(env),weekKey=premiumCubeWeekKey();
  const row=await env.DB.prepare('SELECT current_rate,earned_count,attempt_count,last_attempt_key,last_attempt_won FROM premium_cube_weekly_state WHERE user_id=? AND week_key=?').bind(userId,weekKey).first();
  return {weekKey,currentRate:Math.max(settings.startRate,Math.min(settings.maxRate,Number(row?.current_rate??settings.startRate))),earnedCount:Math.max(0,Number(row?.earned_count||0)),weeklyLimit:settings.weeklyLimit,attemptCount:Math.max(0,Number(row?.attempt_count||0)),enabled:settings.enabled,settings,lastAttemptKey:String(row?.last_attempt_key||''),lastAttemptWon:Number(row?.last_attempt_won||0)===1};
}
function premiumCubeWeeklyStatusFromRow(row,settings,weekKey){
  return {weekKey,currentRate:Math.max(settings.startRate,Math.min(settings.maxRate,Number(row?.current_rate??settings.startRate))),earnedCount:Math.max(0,Number(row?.earned_count||0)),weeklyLimit:settings.weeklyLimit,attemptCount:Math.max(0,Number(row?.attempt_count||0)),enabled:settings.enabled,settings,lastAttemptKey:String(row?.last_attempt_key||''),lastAttemptWon:Number(row?.last_attempt_won||0)===1};
}
async function weeklyPremiumAttemptReceipt(env,userId,weekKey,source,referenceId){
  return await env.DB.prepare(`SELECT outcome,granted,roll_rate,operation_key FROM premium_cube_weekly_attempt_receipts WHERE user_id=? AND week_key=? AND source=? AND reference_id=?`).bind(userId,weekKey,source,referenceId).first();
}
function weeklyPremiumOperationKey(source,referenceId){
  const nonce=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${source}:${referenceId}#${nonce}`;
}
async function rollWeeklyPremiumCube(env,userId,source,referenceId){
  source=String(source||'').toUpperCase();referenceId=String(referenceId||'').trim();
  const settings=await weeklyPremiumCubeSettings(env),weekKey=premiumCubeWeekKey();
  const preflight=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO premium_cube_weekly_state(user_id,week_key,current_rate,earned_count,attempt_count,updated_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP)`).bind(userId,weekKey,settings.startRate),
    env.DB.prepare(`SELECT s.current_rate,s.earned_count,s.attempt_count,s.last_attempt_key,s.last_attempt_won,r.outcome AS receipt_outcome,r.granted AS receipt_granted,r.operation_key AS receipt_operation_key FROM premium_cube_weekly_state s LEFT JOIN premium_cube_weekly_attempt_receipts r ON r.user_id=s.user_id AND r.week_key=s.week_key AND r.source=? AND r.reference_id=? WHERE s.user_id=? AND s.week_key=?`).bind(source,referenceId,userId,weekKey)
  ]),snapshot=preflight[1]?.results?.[0]||null;
  const priorReceipt=snapshot?.receipt_outcome?{outcome:snapshot.receipt_outcome,granted:snapshot.receipt_granted,operation_key:snapshot.receipt_operation_key}:null;
  if(priorReceipt){
    const status=premiumCubeWeeklyStatusFromRow(snapshot,settings,weekKey),won=String(priorReceipt.outcome||'').toUpperCase()==='WON'&&Number(priorReceipt.granted||0)===1;
    return {won,status,duplicate:true};
  }
  const status=premiumCubeWeeklyStatusFromRow(snapshot,settings,weekKey);
  if(!source||!referenceId||!settings.enabled||status.earnedCount>=status.weeklyLimit)return {won:false,status,duplicate:false};
  const operationKey=weeklyPremiumOperationKey(source,referenceId),won=Math.random()*100<status.currentRate;
  if(won){
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO premium_cube_weekly_attempt_receipts(user_id,week_key,source,reference_id,outcome,granted,roll_rate,operation_key,created_at,updated_at) VALUES(?,?,?,?,'PENDING',0,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(userId,weekKey,source,referenceId,status.currentRate,operationKey),
      env.DB.prepare(`UPDATE premium_cube_weekly_state SET earned_count=earned_count+1,current_rate=?,attempt_count=attempt_count+1,last_attempt_key=?,last_attempt_won=1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=? AND earned_count<? AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND reference_type=? AND reference_id=?) AND EXISTS(SELECT 1 FROM premium_cube_weekly_attempt_receipts WHERE user_id=? AND week_key=? AND source=? AND reference_id=? AND outcome='PENDING' AND operation_key=?)`).bind(settings.startRate,operationKey,userId,weekKey,settings.weeklyLimit,userId,source,referenceId,userId,weekKey,source,referenceId,operationKey),
      env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'PREMIUM_CUBE',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM premium_cube_weekly_state s JOIN premium_cube_weekly_attempt_receipts r ON r.user_id=s.user_id AND r.week_key=s.week_key WHERE s.user_id=? AND s.week_key=? AND s.last_attempt_key=? AND s.last_attempt_won=1 AND r.source=? AND r.reference_id=? AND r.outcome='PENDING' AND r.operation_key=?) AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND reference_type=? AND reference_id=?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,userId,weekKey,operationKey,source,referenceId,operationKey,userId,source,referenceId),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'PREMIUM_CUBE',1,i.quantity,'WEEKLY_PREMIUM_CUBE',?,? FROM cnine_user_inventory i WHERE i.user_id=? AND i.item_code='PREMIUM_CUBE' AND EXISTS(SELECT 1 FROM premium_cube_weekly_state s JOIN premium_cube_weekly_attempt_receipts r ON r.user_id=s.user_id AND r.week_key=s.week_key WHERE s.user_id=? AND s.week_key=? AND s.last_attempt_key=? AND s.last_attempt_won=1 AND r.source=? AND r.reference_id=? AND r.outcome='PENDING' AND r.operation_key=?) AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND reference_type=? AND reference_id=?)`).bind(userId,source,referenceId,userId,userId,weekKey,operationKey,source,referenceId,operationKey,userId,source,referenceId),
      env.DB.prepare(`UPDATE premium_cube_weekly_attempt_receipts SET outcome=CASE WHEN EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND reference_type=? AND reference_id=?) THEN 'WON' ELSE 'BLOCKED' END,granted=CASE WHEN EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND reference_type=? AND reference_id=?) THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=? AND source=? AND reference_id=? AND outcome='PENDING' AND operation_key=?`).bind(userId,source,referenceId,userId,source,referenceId,userId,weekKey,source,referenceId,operationKey)
    ]);
  }else{
    // 실패 판정은 PENDING→LOST 후속 UPDATE를 만들지 않고 최초 INSERT 시 바로 LOST로 확정한다.
    // 동일 reference_id 재호출은 INSERT OR IGNORE로 차단되며, 상태 증가는 새 LOST 영수증이 존재할 때만 1회 반영된다.
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO premium_cube_weekly_attempt_receipts(user_id,week_key,source,reference_id,outcome,granted,roll_rate,operation_key,created_at,updated_at) VALUES(?,?,?,?,'LOST',0,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(userId,weekKey,source,referenceId,status.currentRate,operationKey),
      env.DB.prepare(`UPDATE premium_cube_weekly_state SET current_rate=MIN(?,current_rate+?),attempt_count=attempt_count+1,last_attempt_key=?,last_attempt_won=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=? AND earned_count<? AND EXISTS(SELECT 1 FROM premium_cube_weekly_attempt_receipts WHERE user_id=? AND week_key=? AND source=? AND reference_id=? AND outcome='LOST' AND operation_key=?)`).bind(settings.maxRate,settings.incrementRate,operationKey,userId,weekKey,settings.weeklyLimit,userId,weekKey,source,referenceId,operationKey)
    ]);
  }
  const fresh=await premiumCubeWeeklyStatus(env,userId,settings);
  if(!won)return {won:false,status:fresh,duplicate:fresh.lastAttemptKey!==operationKey};
  const receipt=await weeklyPremiumAttemptReceipt(env,userId,weekKey,source,referenceId);
  return {won:String(receipt?.outcome||'').toUpperCase()==='WON'&&Number(receipt?.granted||0)===1,status:fresh,duplicate:Boolean(receipt&&String(receipt.operation_key||'')!==operationKey)};
}
async function grantPremiumCubeInventory(env,userId,source,referenceId){
  const prior=await env.DB.prepare(`SELECT i.quantity AS balance,item.name,item.rarity,item.image_url FROM premium_cube_weekly_attempt_receipts r JOIN cnine_user_inventory i ON i.user_id=r.user_id AND i.item_code='PREMIUM_CUBE' LEFT JOIN inventory_items item ON item.code='PREMIUM_CUBE' WHERE r.user_id=? AND r.week_key=? AND r.source=? AND r.reference_id=? AND r.outcome='WON' AND r.granted=1`).bind(userId,premiumCubeWeekKey(),source,referenceId).first();
  if(!prior)return null;
  return {itemCode:'PREMIUM_CUBE',name:prior.name||'프리미엄 큐브',rarity:prior.rarity||'PREMIUM',image:prior.image_url||'',quantity:1,balance:Number(prior.balance||0),source,weekly:true,reused:true};
}
async function grantWeeklyPremiumCube(env,userId,source,referenceId){
  source=String(source||'').toUpperCase();referenceId=String(referenceId||'').trim();
  if(!['PVE','TOWER','PVP'].includes(source)||!referenceId)return null;
  const rolled=await rollWeeklyPremiumCube(env,userId,source,referenceId);
  const reward=rolled.won?await grantPremiumCubeInventory(env,userId,source,referenceId):null;
  if(reward)recentPremiumCubeCache=null;
  return {reward,status:rolled.status,reused:rolled.duplicate};
}
async function grantBattleCube(env,userId,source,referenceId,allowStandard=true){
  source=String(source||'').toUpperCase();referenceId=String(referenceId||'').trim();
  if(!['PVE','PVP'].includes(source)||!referenceId)return null;
  const weekly=await rollWeeklyPremiumCube(env,userId,source,referenceId);
  if(weekly.won){const reward=await grantPremiumCubeInventory(env,userId,source,referenceId);if(reward)recentPremiumCubeCache=null;return reward;}
  // BATTLE_CUBE_DROP currently has one supported item. Supplying the item key
  // lets idx_inventory_logs_reward_reference resolve the receipt directly;
  // without it D1 scanned the user's entire inventory history on every battle.
  const prior=await env.DB.prepare("SELECT item_code,balance_after FROM inventory_logs INDEXED BY idx_inventory_logs_reward_reference WHERE user_id=? AND item_code='PREMIUM_CUBE' AND reason='BATTLE_CUBE_DROP' AND reference_type=? AND reference_id=? ORDER BY id DESC LIMIT 1").bind(userId,source,referenceId).first();
  if(prior){
    const item=await env.DB.prepare('SELECT code,name,rarity,image_url FROM inventory_items WHERE code=?').bind(prior.item_code).first();
    return {itemCode:prior.item_code,name:item?.name||prior.item_code,rarity:item?.rarity||'',image:item?.image_url||'',quantity:1,balance:Number(prior.balance_after||0),source,reused:true};
  }
  if(weekly.duplicate||!allowStandard)return null;
  // 일반·고급 큐브는 V1482에서 완전히 은퇴했다. 주간 프리미엄 큐브 외 전투 큐브 드랍은 없다.
  return null;
}

async function readTowerSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='tower_settings_v1'").first();if(!row?.value)return {enabled:true};try{const x=JSON.parse(row.value);return {enabled:x.enabled!==false}}catch{return {enabled:true}}}
async function towerSettings(env){return cachedRuntimeSetting('tower',10000,()=>readTowerSettings(env))}
function previousKstDate(date){const d=new Date(`${date}T00:00:00+09:00`);d.setDate(d.getDate()-1);return new Date(d.getTime()+9*3600000).toISOString().slice(0,10);}

const safeName=value=>(value||'').trim().slice(0,20);

const schemaTableCache=new Set();
const schemaColumnCache=new Set();
async function tableExists(env,name){
  const key=String(name||'');if(schemaTableCache.has(key))return true;
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(key).first();
  if(row)schemaTableCache.add(key);return Boolean(row);
}
async function columnExists(env,table,column){
  const key=`${table}:${column}`;if(schemaColumnCache.has(key))return true;
  if(!await tableExists(env,table)) return false;
  const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all(),exists=rows.results.some(row=>String(row.name)===String(column));
  if(exists)schemaColumnCache.add(key);return exists;
}
async function initialized(env){
  if(initializedKnown)return true;
  if(!await tableExists(env,'app_meta')) return false;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='initialized'").first();
  initializedKnown=row?.value==='1';
  return initializedKnown;
}
async function runSchema(env){for(const statement of SCHEMA) await env.DB.prepare(statement).run()}
let initializedKnown=false;
let wagoDailyPostProgressReadyPromise=null;
async function ensureWagoDailyPostProgressTable(env){
  if(wagoDailyPostProgressReadyPromise)return wagoDailyPostProgressReadyPromise;
  wagoDailyPostProgressReadyPromise=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wago_daily_post_progress_v2 (
      user_id INTEGER NOT NULL,
      quest_date TEXT NOT NULL,
      post_count INTEGER NOT NULL DEFAULT 0,
      post_ids_json TEXT NOT NULL DEFAULT '[]',
      last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,quest_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wago_daily_post_progress_v2_date ON wago_daily_post_progress_v2(quest_date,last_checked_at)`).run();
    const exists=await tableExists(env,'wago_daily_post_progress_v2');
    if(!exists)throw new Error('일일퀘스트 진행도 테이블 생성에 실패했습니다.');
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1132_wago_daily_post_progress_repair','1',CURRENT_TIMESTAMP)").run();
    return true;
  })().catch(error=>{wagoDailyPostProgressReadyPromise=null;throw error});
  return wagoDailyPostProgressReadyPromise;
}
let upgradePromise=null;
let d1HotpathUpgradePromise=null;
let d1StabilityUpgradePromise=null;
async function ensureD1HotpathIndexes(env){
  if(d1HotpathUpgradePromise)return d1HotpathUpgradePromise;
  d1HotpathUpgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1421_d1_hotpath_indexes'").first();
    if(done?.value==='1')return true;
    const statements=[];
    if(await tableExists(env,'user_cards'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_cards_last_obtained ON user_cards(last_obtained_at DESC,user_id,card_id)'));
    if(await tableExists(env,'inventory_logs')){
      statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_logs_premium_feed ON inventory_logs(item_code,reason,reference_type,id DESC)'));
      statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_logs_reward_reference ON inventory_logs(user_id,item_code,reason,reference_type,reference_id)'));
    }
    if(await tableExists(env,'pvp_match_history'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pvp_match_history_attacker_recent ON pvp_match_history(attacker_id,id DESC)'));
    if(await tableExists(env,'pvp_profiles'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pvp_profiles_score_user ON pvp_profiles(season_score,user_id)'));
    if(await tableExists(env,'draw_request_receipts_v2'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_receipts_v2_cleanup_v1723 ON draw_request_receipts_v2(status,updated_at,request_id)'));
    if(await tableExists(env,'raid_instances'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_instances_live_transition ON raid_instances(status,starts_at,ends_at,id)'));
    if(await tableExists(env,'raid_participants')){
      statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_participants_user_active ON raid_participants(user_id,is_active,instance_id)'));
      statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_participants_live_rank ON raid_participants(instance_id,is_active,total_damage DESC,joined_at)'));
    }
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1421_d1_hotpath_indexes','1',CURRENT_TIMESTAMP)"));
    await env.DB.batch(statements);return true;
  })().catch(error=>{d1HotpathUpgradePromise=null;throw error});
  return d1HotpathUpgradePromise;
}
async function ensureD1StabilityIndexes(env){
  if(d1StabilityUpgradePromise)return d1StabilityUpgradePromise;
  d1StabilityUpgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1674_d1_stability_indexes'").first();
    if(done?.value==='1')return true;
    const statements=[];
    if(await tableExists(env,'tower_clear_history'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tower_history_power_desc_v1674 ON tower_clear_history(player_power DESC) WHERE player_power>0'));
    if(await tableExists(env,'raid_participants'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_participants_power_desc_v1674 ON raid_participants(total_power DESC) WHERE total_power>0'));
    if(await tableExists(env,'revoked_player_sessions_v1533'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_revoked_sessions_time_v1674 ON revoked_player_sessions_v1533(revoked_at)'));
    if(await tableExists(env,'user_equipment_instances'))statements.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_recent_v1674 ON user_equipment_instances(id DESC,user_id,equipment_id,source_type,acquired_at)'));
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1674_d1_stability_indexes','1',CURRENT_TIMESTAMP)"));
    await env.DB.batch(statements);return true;
  })().catch(error=>{d1StabilityUpgradePromise=null;throw error});
  return d1StabilityUpgradePromise;
}
let couponPermanentRewardUpgradePromise=null;
async function ensureCouponPermanentRewardUpgrade(env){
  if(couponPermanentRewardUpgradePromise)return couponPermanentRewardUpgradePromise;
  couponPermanentRewardUpgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1384_permanent_multi_reward_coupons'").first();
    if(done?.value==='1')return true;
    if(!await tableExists(env,'coupons')||!await tableExists(env,'coupon_redemptions'))return true;
    if(!await columnExists(env,'coupons','reward_type'))await env.DB.prepare("ALTER TABLE coupons ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'COIN'").run();
    if(!await columnExists(env,'coupons','reward_amount'))await env.DB.prepare("ALTER TABLE coupons ADD COLUMN reward_amount INTEGER NOT NULL DEFAULT 0").run();
    if(!await columnExists(env,'coupon_redemptions','reward_type'))await env.DB.prepare("ALTER TABLE coupon_redemptions ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'COIN'").run();
    if(!await columnExists(env,'coupon_redemptions','reward_amount'))await env.DB.prepare("ALTER TABLE coupon_redemptions ADD COLUMN reward_amount INTEGER NOT NULL DEFAULT 0").run();
    if(!await columnExists(env,'coupon_redemptions','operation_key'))await env.DB.prepare("ALTER TABLE coupon_redemptions ADD COLUMN operation_key TEXT").run();
    // 기존 사용 이력 전체 UPDATE와 신규 UNIQUE INDEX 생성은 일반 요청 타임아웃 원인이 될 수 있어 실행하지 않는다.
    // 과거 이력은 조회 시 COALESCE(reward_amount,reward_coin) 호환으로 보존하고, 쿠폰 마스터만 소량 보정한다.
    await env.DB.batch([
      env.DB.prepare("UPDATE coupons SET reward_type=CASE WHEN COALESCE(TRIM(reward_type),'')='' THEN 'COIN' ELSE reward_type END,reward_amount=CASE WHEN COALESCE(reward_amount,0)<=0 THEN COALESCE(reward_coin,0) ELSE reward_amount END,starts_at=NULL,ends_at=NULL WHERE COALESCE(reward_amount,0)<=0 OR starts_at IS NOT NULL OR ends_at IS NOT NULL"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1384_permanent_multi_reward_coupons','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{couponPermanentRewardUpgradePromise=null;throw error});
  return couponPermanentRewardUpgradePromise;
}
let nightmareHellCloneUpgradePromise=null;
async function ensureNightmareHellCloneUpgrade(env){
  if(nightmareHellCloneUpgradePromise)return nightmareHellCloneUpgradePromise;
  nightmareHellCloneUpgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1693_nightmare_clone'").first();
    if(done?.value==='1')return true;
    if(!await columnExists(env,'battle_monsters','pve_tab')){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1693_nightmare_clone','1',CURRENT_TIMESTAMP)").run();
      return true;
    }
    const nightmareNames="name LIKE '%조로%' OR name LIKE '%사스케%' OR name LIKE '%이타치%' OR name LIKE '%젠이츠%' OR name LIKE '%코쥬로%' OR name LIKE '%쿄쥬로%' OR name LIKE '%슌스이%' OR name LIKE '%암부%' OR name LIKE '%셋쇼마루%' OR name LIKE '%루피%'";
    // V1692 moved the original HELL rows. Restore those originals first, then create independent NIGHTMARE copies.
    await env.DB.batch([
      env.DB.prepare(`UPDATE battle_monsters SET pve_tab='HELL',updated_at=CURRENT_TIMESTAMP WHERE UPPER(COALESCE(pve_tab,''))='NIGHTMARE' AND (${nightmareNames})`),
      env.DB.prepare(`INSERT INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,ultimate_enabled,ultimate_name,ultimate_description,ultimate_trigger,ultimate_chance,ultimate_damage_percent,ultimate_max_uses,ultimate_target,ultimate_theme,ultimate_warning_text,ultimate_shake,ultimate_zoom,ultimate_media_url,ultimate_sound_url,ultimate_duration_ms,ultimate_volume_percent,ultimate_force_cast,ultimate_pve_damage_percent,ultimate_tower_damage_percent,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,created_at,updated_at)
        SELECT src.name,src.image_url,src.battle_power,src.reward_coin,1,src.is_active,src.sort_order,src.ultimate_enabled,src.ultimate_name,src.ultimate_description,src.ultimate_trigger,src.ultimate_chance,src.ultimate_damage_percent,src.ultimate_max_uses,src.ultimate_target,src.ultimate_theme,src.ultimate_warning_text,src.ultimate_shake,src.ultimate_zoom,src.ultimate_media_url,src.ultimate_sound_url,src.ultimate_duration_ms,src.ultimate_volume_percent,src.ultimate_force_cast,src.ultimate_pve_damage_percent,src.ultimate_tower_damage_percent,'BOSS','NIGHTMARE',src.pve_display_order,1,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM battle_monsters src
        WHERE UPPER(COALESCE(src.pve_tab,''))='HELL' AND (${nightmareNames.replaceAll('name','src.name')})
          AND NOT EXISTS(SELECT 1 FROM battle_monsters duplicate WHERE UPPER(COALESCE(duplicate.pve_tab,''))='NIGHTMARE' AND duplicate.name=src.name AND COALESCE(duplicate.image_url,'')=COALESCE(src.image_url,''))`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1693_nightmare_clone','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{nightmareHellCloneUpgradePromise=null;throw error});
  return nightmareHellCloneUpgradePromise;
}
let nightmarePairDedupUpgradePromise=null;
async function ensureNightmarePairDedupUpgrade(env){
  if(nightmarePairDedupUpgradePromise)return nightmarePairDedupUpgradePromise;
  nightmarePairDedupUpgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1694_nightmare_pair_dedup'").first();
    if(done?.value==='1')return true;
    if(!await columnExists(env,'battle_monsters','pve_tab')){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1694_nightmare_pair_dedup','1',CURRENT_TIMESTAMP)").run();
      return true;
    }
    const names="name LIKE '%조로%' OR name LIKE '%사스케%' OR name LIKE '%이타치%' OR name LIKE '%젠이츠%' OR name LIKE '%코쥬로%' OR name LIKE '%쿄쥬로%' OR name LIKE '%슌스이%' OR name LIKE '%암부%' OR name LIKE '%셋쇼마루%' OR name LIKE '%루피%'";
    const srcNames=names.replaceAll('name','src.name');
    await env.DB.batch([
      // Preserve duplicate rows for battle-log references, but remove them from every live monster list.
      env.DB.prepare(`UPDATE battle_monsters SET is_active=0,updated_at=CURRENT_TIMESTAMP
        WHERE is_active=1 AND UPPER(COALESCE(pve_tab,'')) IN ('HELL','NIGHTMARE') AND (${names})
          AND id NOT IN (SELECT MIN(id) FROM battle_monsters WHERE is_active=1 AND UPPER(COALESCE(pve_tab,'')) IN ('HELL','NIGHTMARE') AND (${names}) GROUP BY name,COALESCE(image_url,''),UPPER(COALESCE(pve_tab,'')))`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_monsters_active_nightmare_pair_v1694 ON battle_monsters(name,image_url,pve_tab) WHERE is_active=1 AND UPPER(COALESCE(pve_tab,'')) IN ('HELL','NIGHTMARE') AND (${names})`),
      env.DB.prepare(`INSERT OR IGNORE INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,ultimate_enabled,ultimate_name,ultimate_description,ultimate_trigger,ultimate_chance,ultimate_damage_percent,ultimate_max_uses,ultimate_target,ultimate_theme,ultimate_warning_text,ultimate_shake,ultimate_zoom,ultimate_media_url,ultimate_sound_url,ultimate_duration_ms,ultimate_volume_percent,ultimate_force_cast,ultimate_pve_damage_percent,ultimate_tower_damage_percent,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,created_at,updated_at)
        SELECT src.name,src.image_url,src.battle_power,src.reward_coin,src.is_boss,1,src.sort_order,src.ultimate_enabled,src.ultimate_name,src.ultimate_description,src.ultimate_trigger,src.ultimate_chance,src.ultimate_damage_percent,src.ultimate_max_uses,src.ultimate_target,src.ultimate_theme,src.ultimate_warning_text,src.ultimate_shake,src.ultimate_zoom,src.ultimate_media_url,src.ultimate_sound_url,src.ultimate_duration_ms,src.ultimate_volume_percent,src.ultimate_force_cast,src.ultimate_pve_damage_percent,src.ultimate_tower_damage_percent,src.monster_category,'HELL',src.pve_display_order,1,src.tower_enabled,src.tower_only,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM battle_monsters src WHERE src.is_active=1 AND UPPER(COALESCE(src.pve_tab,''))='NIGHTMARE' AND (${srcNames})
          AND NOT EXISTS(SELECT 1 FROM battle_monsters h WHERE h.is_active=1 AND UPPER(COALESCE(h.pve_tab,''))='HELL' AND h.name=src.name AND COALESCE(h.image_url,'')=COALESCE(src.image_url,''))`),
      env.DB.prepare(`INSERT OR IGNORE INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,ultimate_enabled,ultimate_name,ultimate_description,ultimate_trigger,ultimate_chance,ultimate_damage_percent,ultimate_max_uses,ultimate_target,ultimate_theme,ultimate_warning_text,ultimate_shake,ultimate_zoom,ultimate_media_url,ultimate_sound_url,ultimate_duration_ms,ultimate_volume_percent,ultimate_force_cast,ultimate_pve_damage_percent,ultimate_tower_damage_percent,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,created_at,updated_at)
        SELECT src.name,src.image_url,src.battle_power,src.reward_coin,1,1,src.sort_order,src.ultimate_enabled,src.ultimate_name,src.ultimate_description,src.ultimate_trigger,src.ultimate_chance,src.ultimate_damage_percent,src.ultimate_max_uses,src.ultimate_target,src.ultimate_theme,src.ultimate_warning_text,src.ultimate_shake,src.ultimate_zoom,src.ultimate_media_url,src.ultimate_sound_url,src.ultimate_duration_ms,src.ultimate_volume_percent,src.ultimate_force_cast,src.ultimate_pve_damage_percent,src.ultimate_tower_damage_percent,'BOSS','NIGHTMARE',src.pve_display_order,1,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM battle_monsters src WHERE src.is_active=1 AND UPPER(COALESCE(src.pve_tab,''))='HELL' AND (${srcNames})
          AND NOT EXISTS(SELECT 1 FROM battle_monsters n WHERE n.is_active=1 AND UPPER(COALESCE(n.pve_tab,''))='NIGHTMARE' AND n.name=src.name AND COALESCE(n.image_url,'')=COALESCE(src.image_url,''))`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1694_nightmare_pair_dedup','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{nightmarePairDedupUpgradePromise=null;throw error});
  return nightmarePairDedupUpgradePromise;
}
let inactiveMonsterPurgeUpgradePromise=null;
async function ensureInactiveMonsterPurgeUpgrade(env){
  if(inactiveMonsterPurgeUpgradePromise)return inactiveMonsterPurgeUpgradePromise;
  inactiveMonsterPurgeUpgradePromise=(async()=>{
    const marker='safe_runtime_upgrade_v1695_purge_inactive_monsters';
    const done=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(marker).first();
    if(done?.value==='1')return true;
    if(!await tableExists(env,'battle_monsters'))return true;
    const statements=[];
    if(await tableExists(env,'tower_floor_ranges'))statements.push(env.DB.prepare('DELETE FROM tower_floor_ranges WHERE monster_id IN (SELECT id FROM battle_monsters WHERE is_active=0)'));
    statements.push(
      env.DB.prepare('DELETE FROM battle_monsters WHERE is_active=0'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)").bind(marker)
    );
    await env.DB.batch(statements);
    return true;
  })().catch(error=>{inactiveMonsterPurgeUpgradePromise=null;throw error});
  return inactiveMonsterPurgeUpgradePromise;
}
let nightmareProgressionUpgradePromise=null;
async function rebalanceNightmareProgression(env,settingsOverride=null){
  // Prefer HELL Nika. The strongest live HELL boss is a safe fallback for a
  // database restored from a backup made before Nika was registered.
  const anchor=await env.DB.prepare(`SELECT id,name,battle_power,reward_coin,COALESCE(pve_display_order,sort_order,0) AS display_order,COALESCE(sort_order,0) AS sort_order
    FROM battle_monsters WHERE is_active=1 AND UPPER(COALESCE(pve_tab,''))='HELL'
    ORDER BY CASE WHEN name LIKE '%니카%' THEN 0 ELSE 1 END,battle_power DESC,id DESC LIMIT 1`).first();
  const rows=(await env.DB.prepare(`SELECT id,name FROM battle_monsters
    WHERE is_active=1 AND UPPER(COALESCE(pve_tab,''))='NIGHTMARE' ORDER BY id`).all()).results||[];
  if(!anchor||!rows.length)return {updated:0,anchor:anchor||null};
  let nightmareSettings=settingsOverride?normalizeNightmareSettings(settingsOverride):normalizeNightmareSettings();
  if(!settingsOverride){
    try{
      const stored=await env.DB.prepare("SELECT value FROM app_meta WHERE key='battle_nightmare_settings_v1'").first();
      if(stored?.value)nightmareSettings=normalizeNightmareSettings(JSON.parse(stored.value));
    }catch{}
  }
  const plan=nightmareProgressionPlan({
    anchorPower:anchor.battle_power,
    anchorReward:anchor.reward_coin,
    anchorDisplayOrder:anchor.display_order,
    anchorSortOrder:anchor.sort_order,
    settings:nightmareSettings
  });
  const byKey=new Map(plan.map(item=>[item.key,item]));
  const statements=[];
  for(const row of rows){
    const item=byKey.get(nightmareProgressionKey(row.name));
    if(!item)continue;
    statements.push(env.DB.prepare(`UPDATE battle_monsters SET battle_power=?,reward_coin=?,pve_display_order=?,sort_order=?,pve_enabled=1,monster_category='BOSS',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND is_active=1 AND UPPER(COALESCE(pve_tab,''))='NIGHTMARE'`).bind(item.battlePower,item.rewardCoin,item.pveDisplayOrder,item.sortOrder,row.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {updated:statements.length,anchor,plan};
}
async function ensureNightmareProgressionUpgrade(env){
  if(nightmareProgressionUpgradePromise)return nightmareProgressionUpgradePromise;
  nightmareProgressionUpgradePromise=(async()=>{
    const marker='safe_runtime_upgrade_v1696_nightmare_after_hell_nika';
    const done=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(marker).first();
    if(done?.value==='1')return true;
    if(!await tableExists(env,'battle_monsters')||!await columnExists(env,'battle_monsters','pve_tab'))return true;
    await rebalanceNightmareProgression(env);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)").bind(marker).run();
    return true;
  })().catch(error=>{nightmareProgressionUpgradePromise=null;throw error});
  return nightmareProgressionUpgradePromise;
}
async function deleteBattleMonster(env,id){
  const statements=[];
  if(await tableExists(env,'tower_floor_ranges'))statements.push(env.DB.prepare('DELETE FROM tower_floor_ranges WHERE monster_id=?').bind(id));
  statements.push(env.DB.prepare('DELETE FROM battle_monsters WHERE id=?').bind(id));
  const results=await env.DB.batch(statements);
  return Number(results.at(-1)?.meta?.changes||0);
}
let runtimeUpgradeGatePromise=null;
async function ensureRuntimeUpgrades(env){
  if(runtimeUpgradeGatePromise)return runtimeUpgradeGatePromise;
  runtimeUpgradeGatePromise=(async()=>{
    // 신규 성능 인덱스만 먼저 빠르게 설치한 뒤, 과거 마이그레이션은 기존 마커가 없는 DB에서만 검사한다.
    await ensureD1HotpathIndexes(env);
    await ensureEquipmentFoundation(env);
    await ensureSecondVerificationFoundation(env);
    const markers=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('safe_runtime_upgrade_v1144_stability_gate','safe_runtime_upgrade_v1189_weekly_premium_atomic_receipts','safe_runtime_upgrade_v1191_rift_expedition','safe_runtime_upgrade_v1205_d1_hotpath_indexes','safe_runtime_upgrade_v1693_nightmare_clone','safe_runtime_upgrade_v1694_nightmare_pair_dedup','safe_runtime_upgrade_v1695_purge_inactive_monsters','safe_runtime_upgrade_v1696_nightmare_after_hell_nika')").all();
    const markerMap=Object.fromEntries((markers.results||[]).map(row=>[String(row.key),String(row.value||'')]));
    if(markerMap.safe_runtime_upgrade_v1693_nightmare_clone!=='1')await ensureNightmareHellCloneUpgrade(env);
    if(markerMap.safe_runtime_upgrade_v1694_nightmare_pair_dedup!=='1')await ensureNightmarePairDedupUpgrade(env);
    if(markerMap.safe_runtime_upgrade_v1695_purge_inactive_monsters!=='1')await ensureInactiveMonsterPurgeUpgrade(env);
    if(markerMap.safe_runtime_upgrade_v1696_nightmare_after_hell_nika!=='1')await ensureNightmareProgressionUpgrade(env);
    if(markerMap.safe_runtime_upgrade_v1144_stability_gate==='1'&&markerMap.safe_runtime_upgrade_v1189_weekly_premium_atomic_receipts==='1'&&markerMap.safe_runtime_upgrade_v1191_rift_expedition==='1'&&markerMap.safe_runtime_upgrade_v1205_d1_hotpath_indexes==='1')return true;
    await ensureUpgrades(env);
    return true;
  })().catch(error=>{runtimeUpgradeGatePromise=null;throw error});
  return runtimeUpgradeGatePromise;
}
async function ensureUpgrades(env){
  if(upgradePromise) return upgradePromise;
  upgradePromise=(async()=>{
    await ensureD1HotpathIndexes(env);
    // V1123: CMS에서 제거된 것으로 확인된 과거 정적 시드 카드가 다시 추첨되지 않도록 안전 비활성화한다.
    const drawPoolCleanupDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1123_draw_pool_cleanup'").first();
    if(drawPoolCleanupDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE cards SET is_active=0,card_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id='card-0205' AND title='진지한 유승곤'"),
        env.DB.prepare("UPDATE cards SET is_active=0,card_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id='card-0430' AND title='한정판 은조'"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1123_draw_pool_cleanup','1',CURRENT_TIMESTAMP)")
      ]);
      drawContextCache.clear();invalidateCatalogCaches();
    }
    // v1024 레거시 마커는 유지하되 동명 테이블은 더 이상 수정하지 않는다.
    const inventoryCompatDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1024_inventory_compat'").first();
    if(inventoryCompatDone?.value!=='1'){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1024_inventory_compat','1',CURRENT_TIMESTAMP)").run();
    }
    const magicFoundationDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1094_magic_card_foundation'").first();
    if(magicFoundationDone?.value!=='1'){
      if(!await columnExists(env,'users','magic_crystals')){
        try{await env.DB.prepare(`ALTER TABLE users ADD COLUMN magic_crystals INTEGER NOT NULL DEFAULT 0`).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      }
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_cards (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,rarity TEXT NOT NULL DEFAULT 'MAGIC',image_url TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',effect_type TEXT NOT NULL DEFAULT 'NONE',trigger_type TEXT NOT NULL DEFAULT 'BATTLE_START',effect_value REAL NOT NULL DEFAULT 0,trigger_chance REAL NOT NULL DEFAULT 100,max_activations INTEGER NOT NULL DEFAULT 1,draw_weight REAL NOT NULL DEFAULT 1,scope_pve INTEGER NOT NULL DEFAULT 1,scope_pvp INTEGER NOT NULL DEFAULT 1,scope_captain INTEGER NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_magic_cards (user_id INTEGER NOT NULL,magic_card_id INTEGER NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,magic_card_id))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_card_loadouts (user_id INTEGER NOT NULL,deck_type TEXT NOT NULL,slot_no INTEGER NOT NULL,magic_card_id INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,deck_type,slot_no))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_card_draw_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',cost INTEGER NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_crystal_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_unique_effects (card_id TEXT PRIMARY KEY,attack_percent REAL NOT NULL DEFAULT 0,defense_percent REAL NOT NULL DEFAULT 0,hp_percent REAL NOT NULL DEFAULT 0,speed_percent REAL NOT NULL DEFAULT 0,effect_name TEXT NOT NULL DEFAULT '',effect_description TEXT NOT NULL DEFAULT '',effect_type TEXT NOT NULL DEFAULT 'NONE',trigger_type TEXT NOT NULL DEFAULT 'PASSIVE',effect_value REAL NOT NULL DEFAULT 0,trigger_chance REAL NOT NULL DEFAULT 100,max_activations INTEGER NOT NULL DEFAULT 1,scope_pve INTEGER NOT NULL DEFAULT 1,scope_pvp INTEGER NOT NULL DEFAULT 1,scope_captain INTEGER NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_magic_cards_active ON magic_cards(is_active,sort_order,id)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_magic_cards_user ON user_magic_cards(user_id,quantity)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_magic_loadouts_user ON magic_card_loadouts(user_id,deck_type,slot_no)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_magic_draw_receipts_user ON magic_card_draw_receipts(user_id,created_at DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_magic_crystal_logs_user ON magic_crystal_logs(user_id,created_at DESC)`),
        env.DB.prepare(`INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('magic_card_settings_v1',?,CURRENT_TIMESTAMP)`).bind(JSON.stringify({enabled:false,ownerTestEnabled:true,drawEnabled:false,drawCost:100,duplicateRefund:20,acquisitionNotice:'마법 결정은 인게임 플레이를 통해서만 획득할 수 있습니다.',version:2})),
        env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('deck_synergy_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(JSON.stringify({enabled:false,ownerTestEnabled:false,retired:true,retiredReason:'MAGIC_CARD_SYSTEM'})),
        env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1094_magic_card_foundation','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP")
      ]);
    }
    const magicEnhancementDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1501_magic_enhancement'").first();
    if(magicEnhancementDone?.value!=='1'){
      if(!await columnExists(env,'user_magic_cards','enhancement_level'))await env.DB.prepare('ALTER TABLE user_magic_cards ADD COLUMN enhancement_level INTEGER NOT NULL DEFAULT 0').run();
      if(!await columnExists(env,'magic_card_draw_receipts','coin_cost'))await env.DB.prepare('ALTER TABLE magic_card_draw_receipts ADD COLUMN coin_cost INTEGER NOT NULL DEFAULT 0').run();
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_card_enhance_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,magic_card_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_enhance_receipts_user ON magic_card_enhance_receipts(user_id,created_at DESC)'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1501_magic_enhancement','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const magicAcquisitionDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1102_magic_crystal_acquisition'").first();
    if(magicAcquisitionDone?.value!=='1'){
      await ensureMagicRewardFoundation(env);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_reward_snapshots(
        instance_id INTEGER PRIMARY KEY,participation_coin INTEGER NOT NULL DEFAULT 0,clear_coin INTEGER NOT NULL DEFAULT 0,
        reward_shards INTEGER NOT NULL DEFAULT 0,participation_magic_crystals INTEGER NOT NULL DEFAULT 0,
        rank_magic_rewards_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      if(!await columnExists(env,'raid_reward_snapshots','participation_magic_crystals'))await env.DB.prepare('ALTER TABLE raid_reward_snapshots ADD COLUMN participation_magic_crystals INTEGER NOT NULL DEFAULT 0').run();
      if(!await columnExists(env,'raid_reward_snapshots','rank_magic_rewards_json'))await env.DB.prepare("ALTER TABLE raid_reward_snapshots ADD COLUMN rank_magic_rewards_json TEXT NOT NULL DEFAULT '[]'").run();
      if(await tableExists(env,'raid_reward_receipts')&&!await columnExists(env,'raid_reward_receipts','reward_magic_crystals'))await env.DB.prepare('ALTER TABLE raid_reward_receipts ADD COLUMN reward_magic_crystals INTEGER NOT NULL DEFAULT 0').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1102_magic_crystal_acquisition','1',CURRENT_TIMESTAMP)").run();
    }
    const limitedAuditDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1109_limited_acquisition_audit'").first();
    if(limitedAuditDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS limited_acquisition_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_key TEXT NOT NULL UNIQUE,
          request_id TEXT,
          draw_group_id TEXT,
          source_type TEXT NOT NULL DEFAULT 'UNKNOWN',
          source_id TEXT,
          user_id INTEGER NOT NULL,
          user_nickname TEXT NOT NULL DEFAULT '',
          card_id TEXT NOT NULL,
          card_title TEXT NOT NULL DEFAULT '',
          pack_id TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          coin_cost INTEGER NOT NULL DEFAULT 0,
          stock_before INTEGER,
          stock_after INTEGER,
          quantity_before INTEGER,
          quantity_after INTEGER,
          is_duplicate INTEGER NOT NULL DEFAULT 0,
          stock_reserved INTEGER NOT NULL DEFAULT 0,
          card_granted INTEGER NOT NULL DEFAULT 0,
          admin_id INTEGER,
          admin_reason TEXT,
          evidence_note TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        )`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_limited_audit_created ON limited_acquisition_audit(created_at DESC,id DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_limited_audit_user ON limited_acquisition_audit(user_id,created_at DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_limited_audit_card ON limited_acquisition_audit(card_id,created_at DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_limited_audit_request ON limited_acquisition_audit(request_id)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS limited_manual_grant_receipts (
          request_id TEXT PRIMARY KEY,
          admin_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          card_id TEXT NOT NULL,
          grant_mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          response_json TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_limited_manual_receipts_user ON limited_manual_grant_receipts(user_id,created_at DESC)`)
      ]);
      await env.DB.prepare(`INSERT OR IGNORE INTO limited_acquisition_audit(
        event_key,request_id,draw_group_id,source_type,source_id,user_id,user_nickname,card_id,card_title,pack_id,
        status,coin_cost,is_duplicate,stock_reserved,card_granted,created_at,updated_at,completed_at
      )
      SELECT 'legacy-draw-' || d.id,d.draw_group_id,d.draw_group_id,
        CASE WHEN d.pack_id LIKE '%CUBE%' OR d.pack_id LIKE 'GUARANTEED_%' THEN 'INVENTORY' ELSE 'PACK' END,
        d.pack_id,d.user_id,COALESCE(u.nickname,''),d.card_id,COALESCE(c.title,''),d.pack_id,
        'LEGACY_CONFIRMED',COALESCE(d.coin_used,0),CASE WHEN COALESCE(d.is_new,0)=1 THEN 0 ELSE 1 END,
        CASE WHEN c.limited_total IS NULL THEN 0 ELSE 1 END,1,d.created_at,d.created_at,d.created_at
      FROM draw_logs d
      JOIN users u ON u.id=d.user_id
      JOIN cards_effective_v1210 c ON c.id=d.card_id
      WHERE UPPER(COALESCE(d.rarity,c.rarity,''))='LIMITED'`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1109_limited_acquisition_audit','1',CURRENT_TIMESTAMP)").run();
    }
    const runtimeCommandDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1091_user_runtime_commands'").first();
    if(runtimeCommandDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_runtime_commands (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,command_type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',created_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,acknowledged_at TEXT)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_runtime_commands_user ON user_runtime_commands(user_id,id DESC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_runtime_commands_expiry ON user_runtime_commands(expires_at)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1091_user_runtime_commands','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const isolatedInventoryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1026_cnine_inventory'").first();
    if(isolatedInventoryDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cnine_user_inventory (user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_items (code TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'PACK',rarity TEXT NOT NULL DEFAULT 'SPECIAL',image_url TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_use_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cnine_user_inventory_user ON cnine_user_inventory(user_id,quantity)').run();
      if(await tableExists(env,'user_inventory')&&await columnExists(env,'user_inventory','user_id')&&await columnExists(env,'user_inventory','item_code')&&await columnExists(env,'user_inventory','quantity')){
        const hasUnseen=await columnExists(env,'user_inventory','unseen_quantity');
        await env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT user_id,item_code,MAX(0,quantity),${hasUnseen?'MAX(0,unseen_quantity)':'0'} FROM user_inventory WHERE item_code IS NOT NULL ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=MAX(cnine_user_inventory.quantity,excluded.quantity),unseen_quantity=MAX(cnine_user_inventory.unseen_quantity,excluded.unseen_quantity),updated_at=CURRENT_TIMESTAMP`).run();
      }
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1026_cnine_inventory','1',CURRENT_TIMESTAMP)").run();
    }
    const unlimitedLimitedDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1430_unlimited_limited_cards'").first();
    if(unlimitedLimitedDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE cards SET limited_total=NULL,issued_count=0 WHERE UPPER(COALESCE(rarity_override,rarity))='LIMITED'"),
        env.DB.prepare("UPDATE inventory_items SET description='MA 또는 LIMITED 등급 카드를 중복으로 획득할 때마다 1개씩 지급되는 특별 재화입니다.',updated_at=CURRENT_TIMESTAMP WHERE code='MASTER_STAR'"),
        env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
          VALUES('HIGH_GRADE_REROLL_TICKET','고등급 재뽑기권','HIGH GRADE REROLL TICKET','PRESTIGE·LIMITED·FUR 카드 1장을 같은 등급의 다른 고유효과 특성 카드로 재뽑습니다.','REROLL','SPECIAL','',109,1)
          ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('high_grade_reroll_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true,dexButtonEnabled:false,prestigeEnabled:true,limitedEnabled:true,furEnabled:true})),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1430_unlimited_limited_cards','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const magicCardPackDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1136_magic_card_pack'").first();
    if(magicCardPackDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('MAGIC_CARD_PACK','마법카드 팩','MAGIC CARD PACK','마법카드 연구소에서 사용하는 마법카드 팩입니다.','PACK','SPECIAL','assets/cards/magic-card-pack-v2-768.jpg',40,1)"),
        env.DB.prepare("UPDATE inventory_items SET name='마법카드 팩',subtitle='MAGIC CARD PACK',description='마법카드 연구소에서 사용하는 마법카드 팩입니다.',category='PACK',rarity='SPECIAL',image_url='assets/cards/magic-card-pack-v2-768.jpg',sort_order=40,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='MAGIC_CARD_PACK'"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1136_magic_card_pack','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const mixedMagicCardPackDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1701_mixed_magic_card_pack'").first();
    if(mixedMagicCardPackDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE inventory_items SET name='마법카드팩',subtitle='ARCANA MIXED PACK',description='마법카드·마법 결정·카드 조각 중 하나를 획득합니다. 동일 마법카드는 강화 재료로 누적됩니다.',category='PACK',rarity='SPECIAL',image_url='assets/cards/magic-card-pack-v2-768.jpg',sort_order=40,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='MAGIC_CARD_PACK'"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1701_mixed_magic_card_pack','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const retiredStandardCubesDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1482_retire_standard_cubes'").first();
    if(retiredStandardCubesDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE inventory_items SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE code IN ('NORMAL_CUBE','ADVANCED_CUBE')"),
        env.DB.prepare("UPDATE inventory_items SET image_url='assets/cards/magic-card-pack-v2-768.jpg',updated_at=CURRENT_TIMESTAMP WHERE code='MAGIC_CARD_PACK'"),
        env.DB.prepare("DELETE FROM cnine_user_inventory WHERE item_code IN ('NORMAL_CUBE','ADVANCED_CUBE')"),
        env.DB.prepare("DELETE FROM inventory_logs WHERE item_code IN ('NORMAL_CUBE','ADVANCED_CUBE')"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1482_retire_standard_cubes','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const masterStarDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1119_master_star'").first();
    if(masterStarDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('MASTER_STAR','마스터의 별','MASTER STAR','MA 또는 LIMITED 등급 카드를 중복으로 획득할 때마다 1개씩 지급되는 특별 재화입니다.','MATERIAL','MA','',5,1)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1119_master_star','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const retirementRerollDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1164_retirement_reroll_tickets'").first();
    if(retirementRerollDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('MA_REROLL_TICKET','MA 재뽑기권','MA RETIREMENT REROLL','퇴사 처리된 MA 카드를 대신해 활성 MA 카드 1장을 다시 뽑습니다.','REROLL','MA','',110,1)"),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('LIMITED_REROLL_TICKET','리미티드 재뽑기권','LIMITED RETIREMENT REROLL','퇴사 처리된 리미티드 카드를 대신해 활성 리미티드 카드 1장을 다시 뽑습니다.','REROLL','LIMITED','',111,1)"),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('PRESTIGE_REROLL_TICKET','PRESTIGE 재뽑기권','PRESTIGE RETIREMENT REROLL','퇴사 처리된 PRESTIGE 카드를 대신해 활성 PRESTIGE 카드 1장을 다시 뽑습니다.','REROLL','PRESTIGE','',112,1)"),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('FUR_REROLL_TICKET','FUR 재뽑기권','FUR RETIREMENT REROLL','퇴사 처리된 FUR 카드를 대신해 활성 FUR 카드 1장을 다시 뽑습니다.','REROLL','FUR','',113,1)"),
        env.DB.prepare("UPDATE inventory_items SET name='MA 재뽑기권',subtitle='MA RETIREMENT REROLL',description='퇴사 처리된 MA 카드를 대신해 활성 MA 카드 1장을 다시 뽑습니다.',category='REROLL',rarity='MA',image_url='',sort_order=110,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='MA_REROLL_TICKET'"),
        env.DB.prepare("UPDATE inventory_items SET name='리미티드 재뽑기권',subtitle='LIMITED RETIREMENT REROLL',description='퇴사 처리된 리미티드 카드를 대신해 활성 리미티드 카드 1장을 다시 뽑습니다.',category='REROLL',rarity='LIMITED',image_url='',sort_order=111,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='LIMITED_REROLL_TICKET'"),
        env.DB.prepare("UPDATE inventory_items SET name='PRESTIGE 재뽑기권',subtitle='PRESTIGE RETIREMENT REROLL',description='퇴사 처리된 PRESTIGE 카드를 대신해 활성 PRESTIGE 카드 1장을 다시 뽑습니다.',category='REROLL',rarity='PRESTIGE',image_url='',sort_order=112,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='PRESTIGE_REROLL_TICKET'"),
        env.DB.prepare("UPDATE inventory_items SET name='FUR 재뽑기권',subtitle='FUR RETIREMENT REROLL',description='퇴사 처리된 FUR 카드를 대신해 활성 FUR 카드 1장을 다시 뽑습니다.',category='REROLL',rarity='FUR',image_url='',sort_order=113,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='FUR_REROLL_TICKET'"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1164_retirement_reroll_tickets','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const retirementRerollRepairDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1271_limited_fur_reroll_repair'").first();
    if(retirementRerollRepairDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
          VALUES('LIMITED_REROLL_TICKET','리미티드 재뽑기권','LIMITED RETIREMENT REROLL','퇴사 처리된 리미티드 카드를 대신해 활성 리미티드 카드 1장을 다시 뽑습니다.','REROLL','LIMITED','',111,1)
          ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
          VALUES('FUR_REROLL_TICKET','FUR 재뽑기권','FUR RETIREMENT REROLL','퇴사 처리된 FUR 카드를 대신해 활성 FUR 카드 1장을 다시 뽑습니다.','REROLL','FUR','',113,1)
          ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1271_limited_fur_reroll_repair','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const cubeDropDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1072_cube_drop'").first();
    if(cubeDropDone?.value!=='1'){await env.DB.batch([env.DB.prepare(`CREATE TABLE IF NOT EXISTS cube_drop_receipts (receipt_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,source TEXT NOT NULL,item_code TEXT,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cube_drop_receipts_user ON cube_drop_receipts(user_id,created_at DESC)`),env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('cube_drop_settings_v1072',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultCubeDropSettings())),env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1072_cube_drop','1',CURRENT_TIMESTAMP)")]);}
    const cubeBoostDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1072_cube_boost'").first();
    if(cubeBoostDone?.value!=='1'){await env.DB.batch([env.DB.prepare(`CREATE TABLE IF NOT EXISTS cube_drop_boost_state (user_id INTEGER NOT NULL,source TEXT NOT NULL,premium_miss_wins INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,source))`),env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1072_cube_boost','1',CURRENT_TIMESTAMP)")]);}
    const weeklyPremiumDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1128_weekly_premium_cube'").first();
    if(weeklyPremiumDone?.value!=='1'){await env.DB.batch([env.DB.prepare(`CREATE TABLE IF NOT EXISTS premium_cube_weekly_state (user_id INTEGER NOT NULL,week_key TEXT NOT NULL,current_rate REAL NOT NULL DEFAULT 0.1,earned_count INTEGER NOT NULL DEFAULT 0,attempt_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,week_key))`),env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_premium_cube_weekly_state_week ON premium_cube_weekly_state(week_key,earned_count)`),env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1128_weekly_premium_cube','1',CURRENT_TIMESTAMP)")]);}
    const weeklyPremiumBoundedDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1141_weekly_premium_bounded_state'").first();
    if(weeklyPremiumBoundedDone?.value!=='1'){
      if(!await columnExists(env,'premium_cube_weekly_state','last_attempt_key'))await env.DB.prepare("ALTER TABLE premium_cube_weekly_state ADD COLUMN last_attempt_key TEXT").run();
      if(!await columnExists(env,'premium_cube_weekly_state','last_attempt_won'))await env.DB.prepare("ALTER TABLE premium_cube_weekly_state ADD COLUMN last_attempt_won INTEGER NOT NULL DEFAULT 0").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1141_weekly_premium_bounded_state','1',CURRENT_TIMESTAMP)").run();
    }
    const weeklyPremiumAtomicDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1189_weekly_premium_atomic_receipts'").first();
    if(weeklyPremiumAtomicDone?.value!=='1'){
      const repairWeekKey=premiumCubeWeekKey(),repairWeekStart=new Date(`${repairWeekKey}T00:00:00+09:00`),repairWeekEnd=new Date(repairWeekStart.getTime()+7*24*60*60*1000),repairStartSql=repairWeekStart.toISOString().slice(0,19).replace('T',' '),repairEndSql=repairWeekEnd.toISOString().slice(0,19).replace('T',' ');
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS premium_cube_weekly_attempt_receipts (user_id INTEGER NOT NULL,week_key TEXT NOT NULL,source TEXT NOT NULL,reference_id TEXT NOT NULL,outcome TEXT NOT NULL DEFAULT 'PENDING',granted INTEGER NOT NULL DEFAULT 0,roll_rate REAL NOT NULL DEFAULT 0,operation_key TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,week_key,source,reference_id))`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_weekly_premium_attempt_receipts_user ON premium_cube_weekly_attempt_receipts(user_id,week_key,created_at DESC)`),
        env.DB.prepare(`INSERT OR IGNORE INTO premium_cube_weekly_attempt_receipts(user_id,week_key,source,reference_id,outcome,granted,roll_rate,operation_key,created_at,updated_at) SELECT user_id,?,UPPER(COALESCE(reference_type,'')),COALESCE(reference_id,''),'WON',1,0,'LEGACY:' || id,created_at,created_at FROM inventory_logs WHERE item_code='PREMIUM_CUBE' AND reason='WEEKLY_PREMIUM_CUBE' AND COALESCE(reference_type,'')<>'' AND COALESCE(reference_id,'')<>'' AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?)`).bind(repairWeekKey,repairStartSql,repairEndSql),
        env.DB.prepare(`UPDATE premium_cube_weekly_state SET earned_count=(SELECT COUNT(*) FROM premium_cube_weekly_attempt_receipts r WHERE r.user_id=premium_cube_weekly_state.user_id AND r.week_key=premium_cube_weekly_state.week_key AND r.outcome='WON' AND r.granted=1),updated_at=CURRENT_TIMESTAMP WHERE week_key=?`).bind(repairWeekKey),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1189_weekly_premium_atomic_receipts','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const riftExpeditionDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1191_rift_expedition'").first();
    if(riftExpeditionDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_rift_runs (run_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,week_key TEXT NOT NULL,difficulty INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'ACTIVE',deck_cards TEXT NOT NULL DEFAULT '[]',state_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_rift_runs_user ON pve_rift_runs(user_id,created_at DESC)`),
        env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pve_rift_runs_active_user ON pve_rift_runs(user_id) WHERE status IN ('ACTIVE','COMPLETED_PENDING','CLAIMING')`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_rift_runs_week ON pve_rift_runs(week_key,status,created_at DESC)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_rift_weekly (user_id INTEGER NOT NULL,week_key TEXT NOT NULL,started_count INTEGER NOT NULL DEFAULT 0,completed_count INTEGER NOT NULL DEFAULT 0,reward_count INTEGER NOT NULL DEFAULT 0,highest_difficulty INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,week_key))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_rift_action_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,run_id TEXT NOT NULL DEFAULT '',action TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_rift_receipts_user ON pve_rift_action_receipts(user_id,created_at DESC)`),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('RIFT_CRYSTAL','마법 결정','MAGIC CRYSTAL','기존 원정 재화는 마법 결정으로 통합되었습니다.','MATERIAL','SPECIAL','',6,0)"),
        env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pve_rift_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultRiftSettings())),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1191_rift_expedition','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const riftMagicMergeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1194_rift_magic_crystal_merge'").first();
    if(riftMagicMergeDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET magic_crystals=magic_crystals+COALESCE((SELECT quantity FROM cnine_user_inventory WHERE cnine_user_inventory.user_id=users.id AND item_code='RIFT_CRYSTAL'),0) WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE cnine_user_inventory.user_id=users.id AND item_code='RIFT_CRYSTAL' AND quantity>0)"),
        env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) SELECT i.user_id,i.quantity,u.magic_crystals,'균열 결정 마법 결정 통합','RIFT_MIGRATION','V1194' FROM cnine_user_inventory i JOIN users u ON u.id=i.user_id WHERE i.item_code='RIFT_CRYSTAL' AND i.quantity>0"),
        env.DB.prepare("UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=CURRENT_TIMESTAMP WHERE item_code='RIFT_CRYSTAL' AND quantity<>0"),
        env.DB.prepare("UPDATE inventory_items SET is_active=0,description='마법 결정으로 통합된 이전 원정 재화입니다.' WHERE code='RIFT_CRYSTAL'"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1194_rift_magic_crystal_merge','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const riftLegacyNameCleanupDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1195_rift_legacy_name_cleanup'").first();
    if(riftLegacyNameCleanupDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("UPDATE inventory_items SET name='마법 결정',subtitle='MAGIC CRYSTAL',description='기존 원정 재화는 마법 결정으로 통합되었습니다.',is_active=0 WHERE code='RIFT_CRYSTAL'"),
        env.DB.prepare("UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=CURRENT_TIMESTAMP WHERE item_code='RIFT_CRYSTAL' AND (quantity<>0 OR unseen_quantity<>0)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1195_rift_legacy_name_cleanup','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const towerMonsterLinkDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1073_tower_monster_link'").first();
    if(towerMonsterLinkDone?.value!=='1'){
      const additions=[['pve_enabled',"INTEGER NOT NULL DEFAULT 1"],['tower_enabled',"INTEGER NOT NULL DEFAULT 0"],['tower_only',"INTEGER NOT NULL DEFAULT 0"]];
      for(const [column,definition] of additions){if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();}
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_floor_ranges (id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,monster_id INTEGER NOT NULL,start_floor INTEGER NOT NULL,end_floor INTEGER NOT NULL,power_override INTEGER,reward_coin INTEGER NOT NULL DEFAULT 0,is_boss INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tower_floor_ranges_lookup ON tower_floor_ranges(season_id,start_floor,end_floor,is_active)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1073_tower_monster_link','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const pveAutoDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1027_pve_auto'").first();
    if(pveAutoDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_auto_runs (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,monster_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'RUNNING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_auto_runs_user ON pve_auto_runs(user_id,created_at)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_auto_locks (user_id INTEGER PRIMARY KEY,request_id TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1027_pve_auto','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const sessionRecoveryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1029_session_recovery'").first();
    if(sessionRecoveryDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare('DROP INDEX IF EXISTS idx_sessions_single_user'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1029_session_recovery','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const cubeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1025_inventory_cubes'").first();
    if(cubeDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1)"),
        env.DB.prepare("UPDATE inventory_items SET name='리미티드 확정 큐브',subtitle='LEGACY LIMITED CUBE',description='기존 지급분을 보존한 리미티드 확정 보상 큐브입니다.',category='CUBE',image_url='assets/ui/packs/premium-cube.png',sort_order=90 WHERE code='GUARANTEED_LIMITED_PACK'"),
        env.DB.prepare("UPDATE inventory_items SET name='MA 확정 큐브',subtitle='LEGACY MA CUBE',description='기존 지급분을 보존한 MA 확정 보상 큐브입니다.',category='CUBE',image_url='assets/ui/packs/premium-cube.png',sort_order=91 WHERE code='GUARANTEED_MA_PACK'"),
        env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('inventory_cube_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultCubeSettings())),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1025_inventory_cubes','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const bossUltimateDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1045_boss_ultimate'").first();
    if(bossUltimateDone?.value!=='1'){
      const additions=[
        ['ultimate_enabled',"INTEGER NOT NULL DEFAULT 0"],['ultimate_name',"TEXT NOT NULL DEFAULT ''"],['ultimate_description',"TEXT NOT NULL DEFAULT ''"],
        ['ultimate_trigger',"TEXT NOT NULL DEFAULT 'ON_LOSS'"],['ultimate_chance',"REAL NOT NULL DEFAULT 100"],['ultimate_damage_percent',"REAL NOT NULL DEFAULT 15"],
        ['ultimate_max_uses',"INTEGER NOT NULL DEFAULT 1"],['ultimate_target',"TEXT NOT NULL DEFAULT 'ALL'"],['ultimate_theme',"TEXT NOT NULL DEFAULT 'CRIMSON'"],
        ['ultimate_warning_text',"TEXT NOT NULL DEFAULT 'BOSS ULTIMATE'"],['ultimate_shake',"INTEGER NOT NULL DEFAULT 1"],['ultimate_zoom',"INTEGER NOT NULL DEFAULT 1"]
      ];
      for(const [column,definition] of additions){if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1045_boss_ultimate','1',CURRENT_TIMESTAMP)").run();
    }
    const bossUltimateResourceDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1047_boss_ultimate_resources'").first();
    if(bossUltimateResourceDone?.value!=='1'){
      const resourceAdditions=[
        ['ultimate_media_url',"TEXT NOT NULL DEFAULT ''"],
        ['ultimate_sound_url',"TEXT NOT NULL DEFAULT ''"],
        ['ultimate_duration_ms',"INTEGER NOT NULL DEFAULT 2400"]
      ];
      for(const [column,definition] of resourceAdditions){if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1047_boss_ultimate_resources','1',CURRENT_TIMESTAMP)").run();
    }
    const bossUltimateDamageDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1048_boss_ultimate_damage'").first();
    if(bossUltimateDamageDone?.value!=='1'){
      const additions=[
        ['ultimate_force_cast',"INTEGER NOT NULL DEFAULT 0"],
        ['ultimate_pve_damage_percent',"REAL NOT NULL DEFAULT 15"],
        ['ultimate_tower_damage_percent',"REAL NOT NULL DEFAULT 15"]
      ];
      for(const [column,definition] of additions){if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1048_boss_ultimate_damage','1',CURRENT_TIMESTAMP)").run();
    }
    const bossUltimateVolumeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1061_boss_ultimate_volume'").first();
    if(bossUltimateVolumeDone?.value!=='1'){
      if(!await columnExists(env,'battle_monsters','ultimate_volume_percent'))await env.DB.prepare("ALTER TABLE battle_monsters ADD COLUMN ultimate_volume_percent REAL NOT NULL DEFAULT 35").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1061_boss_ultimate_volume','1',CURRENT_TIMESTAMP)").run();
    }
    const breakthroughPityDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1065_ssr_breakthrough_pity'").first();
    if(breakthroughPityDone?.value!=='1'){
      if(!await columnExists(env,'user_cards','breakthrough_fail_count'))await env.DB.prepare("ALTER TABLE user_cards ADD COLUMN breakthrough_fail_count INTEGER NOT NULL DEFAULT 0").run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('breakthrough_pity_ssr_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultBreakthroughPity())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1065_ssr_breakthrough_pity','1',CURRENT_TIMESTAMP)").run();
    }
    const couponBulkDeleteDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1062_coupon_bulk_delete'").first();
    if(couponBulkDeleteDone?.value!=='1'){
      if(!await columnExists(env,'coupons','deleted_at'))await env.DB.prepare("ALTER TABLE coupons ADD COLUMN deleted_at TEXT").run();
      if(!await columnExists(env,'coupons','deleted_by'))await env.DB.prepare("ALTER TABLE coupons ADD COLUMN deleted_by INTEGER").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1062_coupon_bulk_delete','1',CURRENT_TIMESTAMP)").run();
    }
    await ensureCouponPermanentRewardUpgrade(env);
    const monsterCategoryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1053_monster_categories'").first();
    if(monsterCategoryDone?.value!=='1'){
      const additions=[
        ['monster_category',"TEXT NOT NULL DEFAULT 'GENERAL'"],
        ['pve_tab',"TEXT NOT NULL DEFAULT 'GENERAL'"],
        ['pve_display_order',"INTEGER NOT NULL DEFAULT 0"]
      ];
      for(const [column,definition] of additions){if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();}
      await env.DB.prepare("UPDATE battle_monsters SET monster_category='BOSS',pve_tab='BOSS' WHERE is_boss=1 AND COALESCE(monster_category,'GENERAL')='GENERAL'").run();
      await env.DB.prepare("UPDATE battle_monsters SET pve_display_order=sort_order WHERE COALESCE(pve_display_order,0)=0").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1053_monster_categories','1',CURRENT_TIMESTAMP)").run();
    }
    const pveDifficultyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1055_pve_difficulty_tabs'").first();
    if(pveDifficultyDone?.value!=='1'){
      if(await columnExists(env,'battle_monsters','pve_tab')){
        await env.DB.prepare("UPDATE battle_monsters SET pve_tab=CASE UPPER(COALESCE(pve_tab,'')) WHEN 'NORMAL' THEN 'NORMAL' WHEN 'HARD' THEN 'HARD' WHEN 'HELL' THEN 'HELL' WHEN 'NIGHTMARE' THEN 'NIGHTMARE' WHEN 'ELITE' THEN 'HARD' WHEN 'BOSS' THEN 'HELL' WHEN 'EVENT' THEN 'HELL' ELSE 'NORMAL' END").run();
      }
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1055_pve_difficulty_tabs','1',CURRENT_TIMESTAMP)").run();
    }
    const nightmarePveDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1692_nightmare_pve'").first();
    if(nightmarePveDone?.value!=='1'){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1692_nightmare_pve','1',CURRENT_TIMESTAMP)").run();
    }
    await ensureNightmareHellCloneUpgrade(env);
    await ensureNightmarePairDedupUpgrade(env);
    await ensureInactiveMonsterPurgeUpgrade(env);
    await ensureNightmareProgressionUpgrade(env);
    const inventoryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1023_inventory'").first();
    if(inventoryDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS inventory_items (code TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'PACK',rarity TEXT NOT NULL DEFAULT 'SPECIAL',image_url TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS cnine_user_inventory (user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))`,
        `CREATE TABLE IF NOT EXISTS inventory_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS inventory_use_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_cnine_user_inventory_user ON cnine_user_inventory(user_id,quantity)`,
        `CREATE INDEX IF NOT EXISTS idx_inventory_logs_user ON inventory_logs(user_id,created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_inventory_receipts_user ON inventory_use_receipts(user_id,created_at)`
      ])await env.DB.prepare(q).run();
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('GUARANTEED_LIMITED_PACK','리미티드 확정 큐브','LEGACY LIMITED CUBE','기존 지급분을 보존한 리미티드 확정 보상 큐브입니다.','CUBE','LIMITED','assets/ui/packs/premium-cube.png',90,1)"),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('GUARANTEED_MA_PACK','MA 확정 큐브','LEGACY MA CUBE','기존 지급분을 보존한 MA 확정 보상 큐브입니다.','CUBE','MA','assets/ui/packs/premium-cube.png',91,1)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1023_inventory','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const starlightArmorCoreDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1750_mystic_energy_name'").first();
    if(starlightArmorCoreDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('STARLIGHT_ARMOR_CORE','미스틱 에너지','MYSTIC ENERGY','미스틱 장비 제작에 투입되는 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.','MATERIAL','MYTHIC','assets/items/starlight-armor-core-v1749.png',174900,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1750_mystic_energy_name','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const inventoryReceiptCleanupDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1739_inventory_receipt_cleanup'").first();
    if(inventoryReceiptCleanupDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_receipts_cleanup_v1739 ON inventory_use_receipts(status,updated_at,request_id)'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1739_inventory_receipt_cleanup','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const towerDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1038_infinite_tower'").first();
    if(towerDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_seasons (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',starts_at TEXT,ends_at TEXT,max_floor INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_monsters (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,image_url TEXT NOT NULL DEFAULT '',base_power INTEGER NOT NULL DEFAULT 1000,is_boss INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_floors (id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,floor_no INTEGER NOT NULL,monster_id INTEGER NOT NULL,power_override INTEGER,reward_coin INTEGER NOT NULL DEFAULT 0,is_boss INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(season_id,floor_no))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_user_progress (season_id INTEGER NOT NULL,user_id INTEGER NOT NULL,current_floor INTEGER NOT NULL DEFAULT 1,highest_floor INTEGER NOT NULL DEFAULT 0,highest_reached_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(season_id,user_id))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_clear_history (id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,user_id INTEGER NOT NULL,floor_no INTEGER NOT NULL,player_power INTEGER NOT NULL DEFAULT 0,monster_power INTEGER NOT NULL DEFAULT 0,result TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tower_rank ON tower_user_progress(season_id,highest_floor DESC,highest_reached_at ASC)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tower_history_user ON tower_clear_history(season_id,user_id,created_at DESC)`),
        env.DB.prepare(`INSERT OR IGNORE INTO tower_seasons(id,name,status,max_floor,starts_at) VALUES(1,'무한의탑 시즌 1','ACTIVE',100,CURRENT_TIMESTAMP)`),
        env.DB.prepare(`INSERT OR IGNORE INTO tower_monsters(id,name,image_url,base_power,is_boss,sort_order) VALUES(1,'탑의 수문장','',4500,0,1)`),
        env.DB.prepare(`INSERT OR IGNORE INTO tower_monsters(id,name,image_url,base_power,is_boss,sort_order) VALUES(2,'심연의 층주','',12000,1,2)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1038_infinite_tower','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const towerSettingsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1039_tower_settings'").first();
    if(!towerSettingsDone){
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('tower_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true})),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1039_tower_settings','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const deckSynergyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1043_deck_synergy'").first();
    if(!deckSynergyDone){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS deck_synergies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, required_card_ids TEXT NOT NULL DEFAULT '[]', scopes TEXT NOT NULL DEFAULT '[]', effects_json TEXT NOT NULL DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_deck_synergies_active_sort ON deck_synergies(is_active,sort_order,id)`),
        env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('deck_synergy_settings_v1','{\"enabled\":false,\"ownerTestEnabled\":true}',CURRENT_TIMESTAMP)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1043_deck_synergy','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const acquisitionFxDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v10738_card_acquisition_fx'").first();
    if(acquisitionFxDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_acquisition_effects (card_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,media_url TEXT NOT NULL DEFAULT '',audio_url TEXT NOT NULL DEFAULT '',skip_allowed INTEGER NOT NULL DEFAULT 1,duration_ms INTEGER NOT NULL DEFAULT 8000,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v10738_card_acquisition_fx','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const limitedAcquisitionDefaultDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1107_limited_acquisition_default'").first();
    if(limitedAcquisitionDefaultDone?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_acquisition_effects (card_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,media_url TEXT NOT NULL DEFAULT '',audio_url TEXT NOT NULL DEFAULT '',skip_allowed INTEGER NOT NULL DEFAULT 1,duration_ms INTEGER NOT NULL DEFAULT 8000,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare("INSERT OR IGNORE INTO card_acquisition_effects(card_id,enabled,media_url,audio_url,skip_allowed,duration_ms,updated_at) VALUES('__GRADE_LIMITED__',1,'/assets/effects/L2CARD.mp4','',1,10000,CURRENT_TIMESTAMP)"),
        env.DB.prepare("UPDATE card_acquisition_effects SET enabled=1,media_url='/assets/effects/L2CARD.mp4',duration_ms=10000,updated_at=CURRENT_TIMESTAMP WHERE card_id='__GRADE_LIMITED__' AND TRIM(COALESCE(media_url,''))=''"),
        env.DB.prepare("UPDATE card_acquisition_effects SET duration_ms=10000,updated_at=CURRENT_TIMESTAMP WHERE card_id='__GRADE_LIMITED__' AND media_url='/assets/effects/L2CARD.mp4' AND duration_ms<10000"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1107_limited_acquisition_default','1',CURRENT_TIMESTAMP)")
      ]);
    }
    // V1222: 메시지 보상 지급 기반은 성능 게이트보다 먼저 보장한다.
    // 기존 운영 DB는 performance gate에서 조기 return되므로 이 위치 아래의 신규 마이그레이션은 실행되지 않는다.
    await ensureMessageRewardClaimV1222(env);
    const performanceGate=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1019_performance_gate'").first();
    if(performanceGate?.value==='1')return;
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_logs_rarity_id ON draw_logs(rarity,id DESC)').run();
    // IMPORTANT: 운영 D1의 cards/user_cards 테이블은 절대 재생성·rename·drop 하지 않는다.
    // 한정판은 rarity가 아니라 limited_total 속성으로 처리한다.

    // 카드별 전투력 유형: 기존 카드에는 자동 배정하지 않고 NULL 상태를 유지한다.
    const cardPowerTypeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v985_card_power_type'").first();
    if(cardPowerTypeDone?.value!=='1'){
      for(const q of [
        `ALTER TABLE cards ADD COLUMN power_type TEXT`,
        `ALTER TABLE cards ADD COLUMN base_power INTEGER`
      ]){try{await env.DB.prepare(q).run()}catch{}}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v985_card_power_type','1',CURRENT_TIMESTAMP)").run();
    }


    const raidUserOpenDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v978_raid_user_open'").first();
    if(raidUserOpenDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_daily_entries_date ON raid_daily_entries(entry_date,user_id)`,
        `CREATE TABLE IF NOT EXISTS raid_open_requests (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,boss_id INTEGER NOT NULL,instance_id INTEGER,cost INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_open_requests_user ON raid_open_requests(user_id,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v978_raid_user_open','1',CURRENT_TIMESTAMP)").run();
    }

    const raidMultiEntryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1001_raid_multi_entry'").first();
    if(raidMultiEntryDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entry_uses (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date,instance_id))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_daily_entry_uses_date ON raid_daily_entry_uses(entry_date,user_id)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1001_raid_multi_entry','1',CURRENT_TIMESTAMP)").run();
    }

    const raidRoomsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1004_raid_rooms'").first();
    if(raidRoomsDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entry_restores (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT 'MIN_PARTICIPANTS',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date,instance_id))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_entry_restores_date ON raid_daily_entry_restores(entry_date,user_id)`,
        `CREATE TABLE IF NOT EXISTS raid_room_cancellations (instance_id INTEGER PRIMARY KEY,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',refund_user_id INTEGER,refund_coin INTEGER NOT NULL DEFAULT 0,restored_entries INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1004_raid_rooms','1',CURRENT_TIMESTAMP)").run();
    }

    const raidLeaveDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1005_raid_leave'").first();
    if(raidLeaveDone?.value!=='1'){
      try{await env.DB.prepare('ALTER TABLE raid_participants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1').run()}catch{}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1005_raid_leave','1',CURRENT_TIMESTAMP)").run();
    }

    const pvpSettlementDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v968_pvp_settlement'").first();
    if(pvpSettlementDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS pvp_season_settlements (id INTEGER PRIMARY KEY AUTOINCREMENT,season_key TEXT NOT NULL UNIQUE,season_name TEXT NOT NULL,season_title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'PREPARING',initial_score INTEGER NOT NULL DEFAULT 1000,participant_count INTEGER NOT NULL DEFAULT 0,reward_user_count INTEGER NOT NULL DEFAULT 0,message_count INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,error_message TEXT)`,
        `CREATE TABLE IF NOT EXISTS pvp_season_settlement_ranks (id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,nickname TEXT NOT NULL,final_rank INTEGER NOT NULL,season_score INTEGER NOT NULL DEFAULT 0,highest_score INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,tier_id TEXT NOT NULL DEFAULT '',tier_name TEXT NOT NULL DEFAULT '',reward_coin INTEGER NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(settlement_id,user_id),UNIQUE(settlement_id,final_rank))`,
        `CREATE TABLE IF NOT EXISTS pvp_season_settlement_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,reward_type TEXT NOT NULL,reward_amount INTEGER NOT NULL DEFAULT 0,message_id INTEGER,status TEXT NOT NULL DEFAULT 'RESERVED',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(settlement_id,user_id,reward_type))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_status ON pvp_season_settlements(status,started_at)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_ranks_sid ON pvp_season_settlement_ranks(settlement_id,final_rank)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_delivery_sid ON pvp_season_settlement_deliveries(settlement_id,status)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v968_pvp_settlement','1',CURRENT_TIMESTAMP)").run();
    }

    const battleDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v860'").first();
    if(battleDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS battle_monsters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', battle_power INTEGER NOT NULL DEFAULT 500, reward_coin INTEGER NOT NULL DEFAULT 100, is_boss INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS battle_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, monster_id INTEGER NOT NULL, deck_cards TEXT NOT NULL, player_power INTEGER NOT NULL, monster_power INTEGER NOT NULL, result TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_battle_monsters_active ON battle_monsters(is_active,sort_order)`,
        `CREATE INDEX IF NOT EXISTS idx_battle_logs_user ON battle_logs(user_id,created_at)`
      ]) await env.DB.prepare(q).run();
      const count=await env.DB.prepare('SELECT COUNT(*) count FROM battle_monsters').first();
      if(!Number(count?.count||0)){
        for(const m of [
          ['숲의 슬라임','',900,150,0,1],['고블린 전사','',1800,250,0,2],['광폭한 오우거','',4200,500,1,3]
        ]) await env.DB.prepare('INSERT INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,sort_order) VALUES(?,?,?,?,?,?)').bind(...m).run();
      }
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultBattleSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v860','1',CURRENT_TIMESTAMP)").run();
    }
    const energyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v864'").first();
    if(energyDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS user_battle_energy (user_id INTEGER PRIMARY KEY, energy INTEGER NOT NULL DEFAULT 10, last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_daily_reset_date TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_battle_energy_updated ON user_battle_energy(updated_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v864','1',CURRENT_TIMESTAMP)").run();
    }
    const pityDropDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v910'").first();
    if(pityDropDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS user_pack_pity (user_id INTEGER NOT NULL, pack_id TEXT NOT NULL, miss_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,pack_id))`,
        `CREATE INDEX IF NOT EXISTS idx_user_pack_pity_user ON user_pack_pity(user_id)`,
      ]){try{await env.DB.prepare(sql).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPitySettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v910','1',CURRENT_TIMESTAMP)").run();
    }
    const pityCmsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v912'").first();
    if(pityCmsDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPitySettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v912','1',CURRENT_TIMESTAMP)").run();
    }

    const raidDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v913'").first();
    if(raidDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_bosses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', max_hp INTEGER NOT NULL DEFAULT 1000000, defense_rate REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS raid_instances (id INTEGER PRIMARY KEY AUTOINCREMENT, boss_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'LOBBY', starts_at TEXT, ends_at TEXT, current_hp INTEGER NOT NULL DEFAULT 0, participant_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS raid_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL, user_id INTEGER NOT NULL, deck_cards TEXT NOT NULL DEFAULT '[]', total_power INTEGER NOT NULL DEFAULT 0, total_damage INTEGER NOT NULL DEFAULT 0, rank_no INTEGER, reward_claimed INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(instance_id,user_id))`,
        `CREATE TABLE IF NOT EXISTS raid_damage_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL, user_id INTEGER NOT NULL, card_id INTEGER, damage INTEGER NOT NULL DEFAULT 0, is_critical INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_instances_status ON raid_instances(status,created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_participants_instance ON raid_participants(instance_id,total_damage)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_damage_logs_instance ON raid_damage_logs(instance_id,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('raid_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultRaidSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v913','1',CURRENT_TIMESTAMP)").run();
    }

    const identityDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v929'").first();
    if(identityDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS account_ip_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_account_ip_hash_unique ON account_ip_registrations(ip_hash)`,
        `CREATE TABLE IF NOT EXISTS account_ip_exceptions (ip_hash TEXT PRIMARY KEY, note TEXT, created_by INTEGER, expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS wago_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, wago_nickname TEXT NOT NULL, wago_member_no TEXT NOT NULL, verification_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING', comment_url TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL, verified_at TEXT, reviewed_by INTEGER, review_note TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_wago_member_verified_unique ON wago_verifications(wago_member_no) WHERE status='VERIFIED'`,
        `CREATE INDEX IF NOT EXISTS idx_wago_status ON wago_verifications(status,issued_at)`,
        `CREATE TABLE IF NOT EXISTS user_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sender_type TEXT NOT NULL DEFAULT 'SYSTEM', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', message_type TEXT NOT NULL DEFAULT 'NOTICE', coupon_code TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at TEXT)`,
        `CREATE INDEX IF NOT EXISTS idx_user_messages_user ON user_messages(user_id,is_read,created_at)`,
        `CREATE TABLE IF NOT EXISTS verified_coupon_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, coupon_id INTEGER NOT NULL, message_id INTEGER, campaign_name TEXT NOT NULL DEFAULT '', delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,coupon_id))`,
        `CREATE INDEX IF NOT EXISTS idx_verified_coupon_deliveries_user ON verified_coupon_deliveries(user_id,delivered_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('wago_verification_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true,postUrl:'',codeMinutes:20,checkCooldownSeconds:10})).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v929','1',CURRENT_TIMESTAMP)").run();
    }

    const wagoExtensionDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1074_wago_extension_rewards'").first();
    if(wagoExtensionDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS wago_extension_reward_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, admin_id INTEGER NOT NULL, user_id INTEGER NOT NULL, wago_nickname TEXT NOT NULL, wago_member_no TEXT, amount INTEGER NOT NULL, reason TEXT NOT NULL, source_url TEXT, source_key TEXT, balance_before INTEGER NOT NULL DEFAULT 0, balance_after INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_wago_extension_rewards_user ON wago_extension_reward_receipts(user_id,created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_wago_extension_rewards_source ON wago_extension_reward_receipts(source_key,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1074_wago_extension_rewards','1',CURRENT_TIMESTAMP)").run();
    }

    const verifiedMessageDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v934_verified_messages'").first();
    if(verifiedMessageDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS user_message_rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL, reward_type TEXT NOT NULL DEFAULT 'COIN', reward_amount INTEGER NOT NULL DEFAULT 0, claimed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_message_rewards_user ON user_message_rewards(user_id,claimed_at,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v934_verified_messages','1',CURRENT_TIMESTAMP)").run();
    }
    const messageClaimDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v936_message_claim_hide'").first();
    if(messageClaimDone?.value!=='1'){
      try{await env.DB.prepare(`ALTER TABLE user_messages ADD COLUMN hidden_at TEXT`).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_messages_visible ON user_messages(user_id,hidden_at,is_read,created_at)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v936_message_claim_hide','1',CURRENT_TIMESTAMP)").run();
    }


    const messageRewardAtomicDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1221_message_reward_atomic'").first();
    if(messageRewardAtomicDone?.value!=='1'){
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_user_message_reward_coin_claim_v1221
        AFTER UPDATE OF claimed_at ON user_message_rewards
        FOR EACH ROW
        WHEN (OLD.claimed_at IS NULL OR TRIM(OLD.claimed_at)='')
          AND NEW.claimed_at IS NOT NULL
          AND UPPER(COALESCE(NEW.reward_type,''))='COIN'
          AND COALESCE(NEW.reward_amount,0)>0
        BEGIN
          UPDATE users SET coin=coin+NEW.reward_amount WHERE id=NEW.user_id;
          INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
          SELECT NEW.user_id,NEW.reward_amount,coin,'MESSAGE_REWARD' FROM users WHERE id=NEW.user_id;
        END`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_user_message_reward_shards_claim_v1221
        AFTER UPDATE OF claimed_at ON user_message_rewards
        FOR EACH ROW
        WHEN (OLD.claimed_at IS NULL OR TRIM(OLD.claimed_at)='')
          AND NEW.claimed_at IS NOT NULL
          AND UPPER(COALESCE(NEW.reward_type,''))='SHARDS'
          AND COALESCE(NEW.reward_amount,0)>0
        BEGIN
          UPDATE users SET card_shards=card_shards+NEW.reward_amount WHERE id=NEW.user_id;
          INSERT INTO shard_logs(user_id,change_amount,balance_after,reason)
          SELECT NEW.user_id,NEW.reward_amount,card_shards,'MESSAGE_REWARD' FROM users WHERE id=NEW.user_id;
        END`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1221_message_reward_atomic','1',CURRENT_TIMESTAMP)").run();
    }


    const retirementDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v940_card_retirement_refund'").first();
    if(retirementDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS card_retirement_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL UNIQUE, card_title TEXT NOT NULL, member_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING', refund_rate INTEGER NOT NULL DEFAULT 50, created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finalized_at TEXT)`,
        `CREATE TABLE IF NOT EXISTS card_retirement_refunds (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, user_id INTEGER NOT NULL, breakthrough_level INTEGER NOT NULL DEFAULT 0, required_shards INTEGER NOT NULL DEFAULT 0, refund_shards INTEGER NOT NULL DEFAULT 0, message_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(batch_id,user_id))`,
        `CREATE INDEX IF NOT EXISTS idx_card_retirement_refunds_batch ON card_retirement_refunds(batch_id,user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_card_retirement_batches_status ON card_retirement_batches(status,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v940_card_retirement_refund','1',CURRENT_TIMESTAMP)").run();
    }

    const wagoDailyQuestDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v949_wago_daily_quest'").first();
    if(wagoDailyQuestDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS wago_daily_quest_progress (user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, post_count INTEGER NOT NULL DEFAULT 0, post_ids_json TEXT NOT NULL DEFAULT '[]', last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,quest_date))`,
        `CREATE TABLE IF NOT EXISTS wago_daily_quest_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 1200, post_count INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,quest_date))`,
        `CREATE INDEX IF NOT EXISTS idx_wago_daily_quest_claims_date ON wago_daily_quest_claims(quest_date,claimed_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true,boardUrl:'https://ygosu.com/board/soop',requiredPosts:15,rewardCoin:1200,maxPages:10,checkCooldownSeconds:20})).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v949_wago_daily_quest','1',CURRENT_TIMESTAMP)").run();
    }
    // V1132: 과거 용량 초과 중 마커만 남고 진행도 테이블이 생성되지 않은 상태도 자동 복구한다.
    // 마커 값과 무관하게 실제 테이블/인덱스 존재를 매 배포 최초 요청에서 검증한다.
    await ensureWagoDailyPostProgressTable(env);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1130_wago_daily_post_rebuild','1',CURRENT_TIMESTAMP)").run();


    const wagoDailyQuestV2Done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v9410_wago_daily_quest_comments'").first();
    if(wagoDailyQuestV2Done?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS wago_daily_comment_progress (user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, comment_count INTEGER NOT NULL DEFAULT 0, comment_ids_json TEXT NOT NULL DEFAULT '[]', last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,quest_date))`,
        `CREATE TABLE IF NOT EXISTS wago_daily_comment_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 1250, comment_count INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,quest_date))`,
        `CREATE INDEX IF NOT EXISTS idx_wago_daily_comment_claims_date ON wago_daily_comment_claims(quest_date,claimed_at)`
      ]) await env.DB.prepare(q).run();
      const oldRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_daily_quest_settings_v1'").first();
      let oldSettings={};try{oldSettings=JSON.parse(oldRow?.value||'{}')}catch{}
      const nextSettings={enabled:true,boardUrl:'https://ygosu.com/board/soop',postEnabled:true,commentEnabled:true,requiredPosts:15,postRewardCoin:Number(oldSettings.rewardCoin||1200),rewardCoin:Number(oldSettings.rewardCoin||1200),requiredComments:20,commentRewardCoin:1250,maxPages:Number(oldSettings.maxPages||10),commentMaxPosts:100,checkCooldownSeconds:Number(oldSettings.checkCooldownSeconds||20),adminTestAllowed:true,...oldSettings};
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(nextSettings)).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v9410_wago_daily_quest_comments','1',CURRENT_TIMESTAMP)").run();
    }

    const wagoAutoDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v931_wago_auto_urls'").first();
    if(wagoAutoDone?.value!=='1'){
      const columns=(await env.DB.prepare("PRAGMA table_info(wago_verifications)").all()).results||[];
      const names=new Set(columns.map(x=>String(x.name)));
      if(!names.has('profile_url')) await env.DB.prepare("ALTER TABLE wago_verifications ADD COLUMN profile_url TEXT").run();
      if(!names.has('last_checked_at')) await env.DB.prepare("ALTER TABLE wago_verifications ADD COLUMN last_checked_at TEXT").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v931_wago_auto_urls','1',CURRENT_TIMESTAMP)").run();
    }
    const wagoCommentMemberDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v932_wago_comment_member_auto'").first();
    if(!wagoCommentMemberDone){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v932_wago_comment_member_auto','1',CURRENT_TIMESTAMP)").run();
    }
    const wagoDropdownMemberDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v933_wago_dropdown_member_parse'").first();
    if(!wagoDropdownMemberDone){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v933_wago_dropdown_member_parse','1',CURRENT_TIMESTAMP)").run();
    }

    const tierDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v868'").first();
    if(tierDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('tier_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultTierSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v868','1',CURRENT_TIMESTAMP)").run();
    }
    const pvpDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v870'").first();
    if(pvpDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS pvp_profiles (user_id INTEGER PRIMARY KEY, season_score INTEGER NOT NULL DEFAULT 1000, highest_score INTEGER NOT NULL DEFAULT 1000, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_decks (user_id INTEGER PRIMARY KEY, card_ids TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_match_history (id INTEGER PRIMARY KEY AUTOINCREMENT, attacker_id INTEGER NOT NULL, defender_id INTEGER NOT NULL, attacker_name TEXT NOT NULL, defender_name TEXT NOT NULL, attacker_deck TEXT NOT NULL, defender_deck TEXT NOT NULL, attacker_card_score INTEGER NOT NULL DEFAULT 0, defender_card_score INTEGER NOT NULL DEFAULT 0, attacker_power INTEGER NOT NULL DEFAULT 0, defender_power INTEGER NOT NULL DEFAULT 0, winner_id INTEGER NOT NULL, attacker_score_before INTEGER NOT NULL, attacker_score_after INTEGER NOT NULL, defender_score_before INTEGER NOT NULL, defender_score_after INTEGER NOT NULL, score_change INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, tier_id TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name,tier_id))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_profiles_score ON pvp_profiles(season_score DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_history_attacker ON pvp_match_history(attacker_id,created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_history_defender ON pvp_match_history(defender_id,created_at DESC)`
      ]) await env.DB.prepare(sql).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPvpSettings())).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultAttendanceSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v870','1',CURRENT_TIMESTAMP)").run();
    }
    const pvpCmsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v874'").first();
    if(pvpCmsDone?.value!=='1'){
      for(const sql of [
        `ALTER TABLE attendance_logs ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 1`,
        `ALTER TABLE pvp_reward_claims ADD COLUMN reward_shards INTEGER NOT NULL DEFAULT 0`,
        `CREATE TABLE IF NOT EXISTS pvp_rank_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, final_rank INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, reward_shards INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_rank_claims_season ON pvp_rank_reward_claims(season_name,final_rank)`
      ]){try{await env.DB.prepare(sql).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v874','1',CURRENT_TIMESTAMP)").run();
    }
    // v9.0.7 repair migration: 기존 버전에서 이미 사용된 v874 마커 때문에
    // 새 컬럼 추가가 건너뛰어진 운영 D1을 실제 스키마 기준으로 복구한다.
    const attendanceRepairDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v907_attendance_pvp_coin'").first();
    if(attendanceRepairDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultAttendanceSettings())).run();
      if(!await columnExists(env,'attendance_logs','streak_day')){
        try{await env.DB.prepare(`ALTER TABLE attendance_logs ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 1`).run()}
        catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      }
      if(await tableExists(env,'pvp_reward_claims')&&!await columnExists(env,'pvp_reward_claims','reward_shards')){
        try{await env.DB.prepare(`ALTER TABLE pvp_reward_claims ADD COLUMN reward_shards INTEGER NOT NULL DEFAULT 0`).run()}
        catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_rank_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, final_rank INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, reward_shards INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name))`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pvp_rank_claims_season ON pvp_rank_reward_claims(season_name,final_rank)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v907_attendance_pvp_coin','1',CURRENT_TIMESTAMP)").run();
    }

    // v9.0.8 PvE deck save: 기존 migration은 수정하지 않고 전용 테이블만 안전하게 추가한다.
    const pveDeckDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v908_pve_deck'").first();
    if(pveDeckDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_decks (user_id INTEGER PRIMARY KEY, card_ids TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_decks_updated ON pve_decks(updated_at)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v908_pve_deck','1',CURRENT_TIMESTAMP)").run();
    }

    // v9.0.9 미네랄 교환: 기존 migration을 수정하지 않고 설정/신청 테이블만 추가한다.
    const mineralExchangeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v909_mineral_exchange'").first();
    if(mineralExchangeDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mineral_exchange_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_nickname TEXT NOT NULL, wago_nickname TEXT NOT NULL, mineral_amount INTEGER NOT NULL, coin_amount INTEGER NOT NULL, proof_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', requested_kst_date TEXT NOT NULL, reviewed_by INTEGER, reviewed_at TEXT, reject_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mineral_exchange_user_date ON mineral_exchange_requests(user_id,requested_kst_date,status)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mineral_exchange_status ON mineral_exchange_requests(status,created_at DESC)`).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('mineral_exchange_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultMineralExchangeSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v909_mineral_exchange','1',CURRENT_TIMESTAMP)").run();
    }

    const pvpEnergyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v878'").first();
    if(pvpEnergyDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS user_pvp_energy (user_id INTEGER PRIMARY KEY, energy INTEGER NOT NULL DEFAULT 5, last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_pvp_energy_updated ON user_pvp_energy(updated_at)`
      ]) await env.DB.prepare(sql).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v878','1',CURRENT_TIMESTAMP)").run();
    }
    const packMapDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v867'").first();
    if(packMapDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`,
        `CREATE INDEX IF NOT EXISTS idx_card_pack_cards_card ON card_pack_cards(card_id)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v867','1',CURRENT_TIMESTAMP)").run();
    }
    const packCardsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v865'").first();
    if(packCardsDone?.value!=='1'){
      for(const q of [
        `ALTER TABLE cards ADD COLUMN draw_weight REAL NOT NULL DEFAULT 1`,
        `ALTER TABLE cards ADD COLUMN limited_total INTEGER`,
        `ALTER TABLE cards ADD COLUMN issued_count INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE cards ADD COLUMN card_status TEXT NOT NULL DEFAULT 'PUBLIC'`,
        `ALTER TABLE cards ADD COLUMN batch_name TEXT`,
        `ALTER TABLE cards ADD COLUMN batch_date TEXT`
      ]){try{await env.DB.prepare(q).run()}catch{}}
      const newCards=CARDS.filter(card=>{const n=Number(String(card.id).replace('card-',''));return n>=435&&n<=445});
      for(const card of newCards){
        await env.DB.prepare(`INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,0,1,null,'PENDING','2026 여름 신규 카드','2026-07-11').run();
      }
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v865','1',CURRENT_TIMESTAMP)").run();
    }
    const packPreviewDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v866'").first();
    if(packPreviewDone?.value!=='1'){
      await env.DB.prepare("UPDATE card_packs SET is_active=0 WHERE id='summer-new'").run();
      try{await env.DB.prepare("DELETE FROM card_pack_cards WHERE pack_id='summer-new'").run()}catch{}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_preview_configs','{}',CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v866','1',CURRENT_TIMESTAMP)").run();
    }
    const drawReceiptsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v964_draw_receipts'").first();
    if(drawReceiptsDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_request_receipts (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cost INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_request_receipts_user ON draw_request_receipts(user_id,created_at)').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v964_draw_receipts','1',CURRENT_TIMESTAMP)").run();
    }

    const drawGrantProofDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1125_draw_grant_proof'").first();
    if(drawGrantProofDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_grant_assertions (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        verified INTEGER NOT NULL CHECK(verified=1),
        proof_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_grant_assertions_user ON draw_grant_assertions(user_id,created_at)').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1125_draw_grant_proof','1',CURRENT_TIMESTAMP)").run();
    }

    const raidRewardReceiptsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v979_raid_reward_receipts'").first();
    if(raidRewardReceiptsDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_reward_receipts (
        instance_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        reward_coin INTEGER NOT NULL DEFAULT 0,
        reward_shards INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(instance_id,user_id)
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_reward_receipts_status ON raid_reward_receipts(status,updated_at)').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v979_raid_reward_receipts','1',CURRENT_TIMESTAMP)").run();
    }

    const completed=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v848'").first();
    if(completed?.value==='1'){
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1019_performance_gate','1',CURRENT_TIMESTAMP)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1144_stability_gate','1',CURRENT_TIMESTAMP)")
      ]);
      return;
    }

    const statements=[
      `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, reward_coin INTEGER NOT NULL DEFAULT 0, reward_type TEXT NOT NULL DEFAULT 'COIN', reward_amount INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, deleted_at TEXT, deleted_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS coupon_redemptions (coupon_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, reward_type TEXT NOT NULL DEFAULT 'COIN', reward_amount INTEGER NOT NULL DEFAULT 0, operation_key TEXT, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(coupon_id,user_id))`,
      `CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupons(code)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at)`,
      `CREATE TABLE IF NOT EXISTS shard_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, change_amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT NOT NULL, card_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE INDEX IF NOT EXISTS idx_shard_logs_user ON shard_logs(user_id,created_at)`
    ];
    for(const q of statements) await env.DB.prepare(q).run();

    // 컬럼 추가만 허용. 이미 있으면 D1 오류를 무시한다.
    for(const q of [
      `ALTER TABLE users ADD COLUMN banned_until TEXT`,
      `ALTER TABLE users ADD COLUMN ban_reason TEXT`,
      `ALTER TABLE cards ADD COLUMN draw_weight REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE cards ADD COLUMN limited_total INTEGER`,
      `ALTER TABLE cards ADD COLUMN issued_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN card_shards INTEGER NOT NULL DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS draw_request_receipts (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cost INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_draw_request_receipts_user ON draw_request_receipts(user_id,created_at)`,
      `ALTER TABLE user_cards ADD COLUMN breakthrough_level INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE cards ADD COLUMN card_status TEXT NOT NULL DEFAULT 'PUBLIC'`,
      `ALTER TABLE cards ADD COLUMN batch_name TEXT`,
      `ALTER TABLE cards ADD COLUMN batch_date TEXT`
    ]){try{await env.DB.prepare(q).run()}catch{}}

    // 카드팩 설정은 최초 한 번만 보정한다.
    const packs=await env.DB.prepare('SELECT id,allowed_rarities FROM card_packs').all();
    for(const pack of packs.results){
      let allowed=[]; try{allowed=JSON.parse(pack.allowed_rarities||'[]')}catch{}
      for(const rarity of ['MA','FUR']) if(!allowed.includes(rarity)) allowed.push(rarity);
      allowed=allowed.filter(rarity=>rarity!=='LIMITED');
      if(pack.id==='pickup') allowed.push('LIMITED');
      await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),pack.id).run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'MA').run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'FUR').run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'LIMITED').run();
    }
    const allowed=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
    await env.DB.prepare(`UPDATE card_packs SET name='리미티드팩',subtitle='LIMITED PACK',description='별도 확률로 서버 한정판 카드가 등장하는 특별 카드팩',allowed_rarities=?,pickup_member_id=NULL,pickup_multiplier=1 WHERE id='pickup'`).bind(JSON.stringify(allowed)).run();
    await env.DB.prepare("UPDATE card_pack_rates SET rate=0 WHERE rarity='LIMITED' AND pack_id<>'pickup'").run();
    await env.DB.prepare("INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES('pickup','LIMITED',1)").run();

    // 신규 멤버/카드는 없을 때만 등록하며 기존 공개·수정 상태는 덮어쓰지 않는다.
    for(const member of MEMBERS.filter(x=>x.sortOrder+1>=38)){
      await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
        .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
    }
    const newCards=CARDS.filter(card=>{const n=Number(String(card.id).replace('card-',''));return n>=377&&n<=434});
    for(let i=0;i<newCards.length;i+=25){
      const chunk=newCards.slice(i,i+25).map(card=>{
        const n=Number(String(card.id).replace('card-',''));
        const batch=n===434?'철구 최고등급 카드 추가':n>=416?'한정판 카드 추가':'채연·연두·여을·효짱 추가';
        return env.DB.prepare(`INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,0,card.drawWeight??1,card.limitedTotal??null,'PENDING',batch,'2026-07-10');
      });
      await env.DB.batch(chunk);
    }

    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v848','1',CURRENT_TIMESTAMP)"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1019_performance_gate','1',CURRENT_TIMESTAMP)"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1144_stability_gate','1',CURRENT_TIMESTAMP)")
    ]);
  })().catch(error=>{upgradePromise=null;throw error});
  return upgradePromise;
}
function requestIp(request){return String(request.headers.get('CF-Connecting-IP')||request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||'unknown'}
async function requestIpHash(request,env){return hash(`${requestIp(request)}|${env.IP_HASH_SALT||'CNINE-IP-SALT-CHANGE-ME'}`)}
async function wagoVerificationSettings(env){const base={enabled:true,postUrl:'',codeMinutes:20,checkCooldownSeconds:10};const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_verification_settings_v1'").first();try{return {...base,...JSON.parse(row?.value||'{}')}}catch{return base}}
function makeVerificationCode(){return `SOOP-${crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`}
const PLAYDK_DEFAULT_BASE_URL='https://www.playdk.kr';
let secondaryVerificationReadyPromise=null;
function playdkConfigured(env){return Boolean(String(env.PLAYDK_ACCESS_KEY||'').trim()&&String(env.PLAYDK_SECRET_KEY||'').trim())}
function playdkBaseUrl(env){const url=new URL(String(env.PLAYDK_BASE_URL||PLAYDK_DEFAULT_BASE_URL));if(url.protocol!=='https:'||!['playdk.kr','www.playdk.kr'].includes(url.hostname.toLowerCase()))throw new PlaydkApiError('PLAY DK 서버 주소 설정이 올바르지 않습니다.',{status:500});return url.origin}
function playdkIdentityClient(env){return createPlaydkIdentityClient({baseUrl:playdkBaseUrl(env),accessKey:env.PLAYDK_ACCESS_KEY,secretKey:env.PLAYDK_SECRET_KEY,game:String(env.PLAYDK_GAME_CODE||'skm'),timeoutMs:8000})}
function secondaryProviderConflict(provider){return json({error:`이미 ${provider==='WAGO'?'와이고수':'PLAY DK'} 2차 인증이 연결된 계정입니다. 한 계정에는 한 인증 서비스만 연결할 수 있습니다.`,code:'SECONDARY_PROVIDER_ALREADY_VERIFIED',provider},409)}
function isSecondaryProviderConflict(error){const message=String(error?.message||error||'');return message.includes('SECONDARY_VERIFICATION_PROVIDER_CONFLICT')||message.includes('UNIQUE constraint failed')}
async function ensureSecondVerificationFoundation(env){
  if(secondaryVerificationReadyPromise)return secondaryVerificationReadyPromise;
  secondaryVerificationReadyPromise=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_second_verifications (
      user_id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL CHECK(provider IN ('WAGO','PLAYDK')),
      provider_user_id TEXT NOT NULL,
      provider_name TEXT NOT NULL DEFAULT '',
      verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(provider,provider_user_id)
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_second_verifications_provider ON user_second_verifications(provider,verified_at)').run();
    if(await tableExists(env,'wago_verifications')){
      await env.DB.prepare(`INSERT OR IGNORE INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
        SELECT user_id,'WAGO',CASE WHEN TRIM(COALESCE(wago_member_no,''))<>'' THEN TRIM(wago_member_no) ELSE 'LEGACY:'||user_id END,
          COALESCE(wago_nickname,''),COALESCE(verified_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP
        FROM wago_verifications WHERE status='VERIFIED'`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_guard_v1780
        BEFORE UPDATE OF status ON wago_verifications FOR EACH ROW
        WHEN NEW.status='VERIFIED' AND COALESCE(OLD.status,'')<>'VERIFIED'
        BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM user_second_verifications WHERE user_id=NEW.user_id AND provider<>'WAGO') THEN RAISE(ABORT,'SECONDARY_VERIFICATION_PROVIDER_CONFLICT') END; END`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_insert_guard_v1780
        BEFORE INSERT ON wago_verifications FOR EACH ROW WHEN NEW.status='VERIFIED'
        BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM user_second_verifications WHERE user_id=NEW.user_id AND provider<>'WAGO') THEN RAISE(ABORT,'SECONDARY_VERIFICATION_PROVIDER_CONFLICT') END; END`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_claim_v1780
        AFTER UPDATE OF status ON wago_verifications FOR EACH ROW
        WHEN NEW.status='VERIFIED' AND COALESCE(OLD.status,'')<>'VERIFIED'
        BEGIN INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
          VALUES(NEW.user_id,'WAGO',CASE WHEN TRIM(COALESCE(NEW.wago_member_no,''))<>'' THEN TRIM(NEW.wago_member_no) ELSE 'LEGACY:'||NEW.user_id END,
            COALESCE(NEW.wago_nickname,''),COALESCE(NEW.verified_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP); END`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_insert_claim_v1780
        AFTER INSERT ON wago_verifications FOR EACH ROW WHEN NEW.status='VERIFIED'
        BEGIN INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at)
          VALUES(NEW.user_id,'WAGO',CASE WHEN TRIM(COALESCE(NEW.wago_member_no,''))<>'' THEN TRIM(NEW.wago_member_no) ELSE 'LEGACY:'||NEW.user_id END,
            COALESCE(NEW.wago_nickname,''),COALESCE(NEW.verified_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP); END`).run();
      await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_wago_secondary_provider_release_v1780
        AFTER UPDATE OF status ON wago_verifications FOR EACH ROW
        WHEN OLD.status='VERIFIED' AND COALESCE(NEW.status,'')<>'VERIFIED'
        BEGIN DELETE FROM user_second_verifications WHERE user_id=OLD.user_id AND provider='WAGO'; END`).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1780_secondary_verification','1',CURRENT_TIMESTAMP)").run();
    schemaTableCache.add('user_second_verifications');
    return true;
  })().catch(error=>{secondaryVerificationReadyPromise=null;throw error});
  return secondaryVerificationReadyPromise;
}
async function secondVerificationForUser(env,userId){
  await ensureSecondVerificationFoundation(env);
  return env.DB.prepare('SELECT provider,provider_user_id,provider_name,verified_at,updated_at FROM user_second_verifications WHERE user_id=?').bind(userId).first();
}
function htmlText(v){return String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function parseYgosuPostUrl(raw){
  let url;try{url=new URL(String(raw||'').trim())}catch{return {ok:false,error:'CMS에 설정된 와고 인증 게시글 주소가 올바르지 않습니다.'}}
  const host=url.hostname.toLowerCase();
  if(host!=='ygosu.com'&&host!=='www.ygosu.com')return {ok:false,error:'인증 게시글은 ygosu.com 주소만 사용할 수 있습니다.'};
  url.protocol='https:';
  // comment_idx pins Ygosu to the page containing that old comment. Once the
  // thread grows, newly posted verification comments are omitted entirely.
  // Verification must always inspect the post's current default comment page.
  url.search='';
  url.hash='';
  return {ok:true,url:url.toString()};
}
async function fetchWagoHtml(url,label){
  let response;
  try{response=await fetch(url,{redirect:'follow',cache:'no-store',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'ko-KR,ko;q=0.9','Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'}})}
  catch{return {ok:false,error:`${label} 페이지에 연결할 수 없습니다.`}}
  if(!response.ok)return {ok:false,error:`${label} 페이지 확인 실패 (${response.status}). 와고가 외부 조회를 차단한 경우 잠시 후 다시 시도하세요.`};
  return {ok:true,html:await response.text(),finalUrl:response.url||url};
}
async function inspectWagoComment(settings,verification){
  const post=parseYgosuPostUrl(settings.postUrl);if(!post.ok)return post;
  const page=await fetchWagoHtml(post.url,'인증 게시글');if(!page.ok)return page;

  const code=String(verification.verification_code||'').trim();
  if(!code)return {ok:false,error:'발급된 인증코드를 확인할 수 없습니다. 새 코드를 발급하세요.'};
  const upper=page.html.toUpperCase(),pos=upper.indexOf(code.toUpperCase());
  if(pos<0)return {ok:false,error:'인증 게시글 댓글에서 발급된 인증코드를 찾지 못했습니다. 댓글 작성 후 잠시 뒤 다시 확인하세요.'};

  // 와고 댓글은 작성자 회원번호를 minilog 링크가 아니라
  // YG_COMMON.show_nick_dropdown($(this), '현재로그인회원', '댓글작성자회원', ...)의
  // 두 번째 숫자 인자로 노출한다. 인증코드가 들어간 정확한 댓글 <li>만 잘라서 확인한다.
  const commentMarker=page.html.lastIndexOf("<div class='comment'",pos);
  const commentMarkerDouble=page.html.lastIndexOf('<div class="comment"',pos);
  const marker=Math.max(commentMarker,commentMarkerDouble);
  let replyBlock='';
  if(marker>=0){
    const liStart=page.html.lastIndexOf('<li',marker);
    const liEnd=page.html.indexOf('</li>',pos);
    if(liStart>=0&&liEnd>pos)replyBlock=page.html.slice(liStart,liEnd+5);
  }
  if(!replyBlock){
    const radius=7000;
    replyBlock=page.html.slice(Math.max(0,pos-radius),Math.min(page.html.length,pos+radius));
  }

  // Ygosu changed the handler from show_nick_dropdown($(this), ...) to
  // YG_COMMON.show_nick_dropdown(this, ...). Accept both forms so recent
  // comments can still be mapped to their member number.
  const dropdown=/(?:YG_COMMON\.)?show_nick_dropdown\(\s*(?:\$\(\s*this\s*\)|this)\s*,\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]/i.exec(replyBlock);
  let memberNo=dropdown?String(dropdown[2]||'').replace(/\D/g,''):'';
  if(!memberNo){
    const fallbacks=[
      /open_minilog\(\s*['"](\d+)['"]/i,
      /(?:https?:\/\/(?:www\.)?ygosu\.com)?\/minilog\/\?[^"'<>\s]*?member=(\d+)/i,
      /data-(?:member|member-no|member-id|uid)=["']?(\d+)/i
    ];
    for(const re of fallbacks){const m=re.exec(replyBlock);if(m){memberNo=String(m[1]||'').replace(/\D/g,'');if(memberNo)break;}}
  }
  if(!memberNo)return {ok:false,error:'인증코드는 확인했지만 해당 댓글 작성자의 회원번호를 찾지 못했습니다. 댓글을 새로 작성한 뒤 다시 확인하세요.'};

  const nickname=String(verification.wago_nickname||'').trim();
  if(nickname){
    const nickMatch=/<div class=['"]nick['"][^>]*>[\s\S]*?<a[^>]*show_nick_dropdown[\s\S]*?>([\s\S]*?)<\/a>/i.exec(replyBlock);
    const authorNickname=nickMatch?htmlText(nickMatch[1]).replace(/^\S+\s+/,'').trim():'';
    if(authorNickname&&authorNickname!==nickname)return {ok:false,error:`인증코드는 확인했지만 댓글 작성자 닉네임(${authorNickname})과 입력한 닉네임이 일치하지 않습니다.`};
    if(!authorNickname&&!htmlText(replyBlock).includes(nickname))return {ok:false,error:'인증코드는 확인했지만 입력한 와고 닉네임과 댓글 작성자가 일치하지 않습니다.'};
  }

  return {ok:true,memberConfirmed:true,commentUrl:post.url,memberNo,notice:`댓글 인증코드와 작성자 회원번호(${memberNo})를 자동 확인하여 인증되었습니다.`};
}


async function wagoDailyQuestSettings(env){
  const base={enabled:true,boardUrl:'https://ygosu.com/board/soop',postEnabled:true,commentEnabled:true,requiredPosts:15,postRewardCoin:1200,rewardCoin:1200,requiredComments:20,commentRewardCoin:1250,maxPages:10,commentMaxPosts:100,checkCooldownSeconds:20,adminTestAllowed:true};
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_daily_quest_settings_v1'").first();
  try{const v={...base,...JSON.parse(row?.value||'{}')};v.postRewardCoin=Number(v.postRewardCoin??v.rewardCoin??1200);v.rewardCoin=v.postRewardCoin;return v}catch{return base}
}
function extractWagoMemberNoFromAuthorRow(block){
  const source=String(block||'');
  // 와고 작성자 메뉴: show_nick_dropdown($(this), 현재로그인회원번호, 작성자회원번호, ...)
  const dropdown=/show_nick_dropdown\(\s*\$\(this\)\s*,\s*['"]\d+['"]\s*,\s*['"](\d+)['"]/i.exec(source);
  if(dropdown?.[1])return String(dropdown[1]).replace(/\D/g,'');
  const patterns=[
    /data-(?:member|member-no|member-id|uid)\s*=\s*['"]?(\d+)/i,
    /(?:member_no|memberNo|member_srl|mb_no)\s*[:=]\s*['"]?(\d+)/i,
    /open_minilog\(\s*['"](\d+)['"]/i,
    /(?:https?:\/\/(?:www\.)?ygosu\.com)?\/minilog\/?\?[^"'<>\s]*?(?:member|member_no)=(\d+)/i
  ];
  for(const re of patterns){const m=re.exec(source);if(m?.[1])return String(m[1]).replace(/\D/g,'');}
  return '';
}
function normalizeWagoNickname(value){
  return htmlText(String(value||'')).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}
function decodeWagoHtmlAttribute(value){
  return String(value||'')
    .replace(/&amp;/gi,'&')
    .replace(/&#38;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .trim();
}
function extractWagoSoopPostIdFromHref(rawHref){
  const href=decodeWagoHtmlAttribute(rawHref);
  if(!href||/^javascript:/i.test(href)||href.startsWith('#'))return '';
  let url;
  try{url=new URL(href,'https://ygosu.com')}catch{return ''}
  const host=String(url.hostname||'').toLowerCase();
  if(host!=='ygosu.com'&&host!=='www.ygosu.com')return '';
  const path=decodeURIComponent(url.pathname||'');
  if(!/\/board\/soop(?:\/|$)/i.test(path))return '';
  const pathId=/\/board\/soop\/(\d+)(?:\/|$)/i.exec(path)?.[1]||'';
  if(pathId)return pathId;
  for(const key of ['idx','no','article_id','board_no','wr_id','id']){
    const value=String(url.searchParams.get(key)||'').replace(/\D/g,'');
    if(value)return value;
  }
  return '';
}
function nearestWagoSearchResultBlock(source,index){
  const tags=['tr','li','article'];
  let bestStart=-1,bestTag='';
  for(const tag of tags){
    const pos=source.lastIndexOf(`<${tag}`,index);
    if(pos>bestStart){bestStart=pos;bestTag=tag;}
  }
  if(bestStart>=0){
    const end=source.indexOf(`</${bestTag}>`,index);
    if(end>=0&&end-bestStart<30000)return source.slice(bestStart,end+bestTag.length+3);
  }
  return source.slice(Math.max(0,index-5000),Math.min(source.length,index+7000));
}
function parseWagoTodaySearchPosts(html,wagoNickname){
  const wanted=normalizeWagoNickname(wagoNickname);
  if(!wanted)return [];
  const source=String(html||''),ids=[];
  const hrefRe=/\bhref\s*=\s*(["'])([\s\S]*?)\1/gi;
  let match;
  while((match=hrefRe.exec(source))){
    const postId=extractWagoSoopPostIdFromHref(match[2]);
    if(!postId)continue;
    const block=nearestWagoSearchResultBlock(source,match.index);
    const text=htmlText(block).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    // 와이고수 검색 결과에서 당일 게시글은 날짜 대신 HH:MM으로 표시된다.
    if(!/(?:^|\s)(?:[01]?\d|2[0-3]):[0-5]\d(?:\s|$)/.test(text))continue;
    const opening=(/<(?:tr|li|article)\b[^>]*>/i.exec(block)||[''])[0];
    const rowClass=(/\bclass\s*=\s*["']([^"']*)["']/i.exec(opening)||[])[1]||'';
    if(/(?:^|\s)(?:notice|fixed|top_notice)(?:\s|$)/i.test(rowClass))continue;
    ids.push(postId);
  }
  return [...new Set(ids)];
}
function looksLikeWagoBlockPage(html){
  const text=htmlText(String(html||'')).toLowerCase();
  return /cloudflare|captcha|access denied|접근이 제한|비정상적인 접근|로봇이 아닙니다/.test(text);
}

function extractWagoPostKstDate(html){
  const source=String(html||'');
  const patterns=[
    /(?:작성일|등록일|date|datetime)[^0-9]{0,40}(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\s+\d{1,2}:\d{2}/i,
    /\b(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\s+\d{1,2}:\d{2}(?::\d{2})?\b/i,
    /\b(\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\s+\d{1,2}:\d{2}(?::\d{2})?\b/i
  ];
  for(let i=0;i<patterns.length;i++){
    const m=patterns[i].exec(source);if(!m)continue;
    let year=Number(m[1]);if(i===2)year+=2000;
    const month=String(Number(m[2])).padStart(2,'0'),day=String(Number(m[3])).padStart(2,'0');
    if(year>=2020&&Number(month)>=1&&Number(month)<=12&&Number(day)>=1&&Number(day)<=31)return `${year}-${month}-${day}`;
  }
  return '';
}
function inspectWagoPostDetail(html,memberNo,questDate,wagoNickname=''){
  const wanted=String(memberNo||'').replace(/\D/g,'');
  const wantedNick=normalizeWagoNickname(wagoNickname);
  const source=String(html||'');
  // 댓글 영역의 다른 회원번호가 섞이지 않도록 본문 앞부분을 우선 검사한다.
  const commentAt=source.search(/<(?:div|section|ul|ol)\b[^>]*(?:id|class)=['"][^'"]*(?:reply|comment)[^'"]*['"]/i);
  const articleScope=commentAt>0?source.slice(0,commentAt):source.slice(0,Math.min(source.length,220000));
  const authorMemberNo=extractWagoMemberNoFromAuthorRow(articleScope);
  const author=extractWagoBoardAuthor(articleScope);
  const authorNickname=normalizeWagoNickname(author.nickname||'');
  const postDate=extractWagoPostKstDate(articleScope);
  const memberMatched=Boolean(authorMemberNo&&wanted&&authorMemberNo===wanted);
  const nicknameMatched=Boolean(wantedNick&&authorNickname&&authorNickname===wantedNick);
  return {
    ok:Boolean((authorMemberNo||authorNickname)&&postDate),
    memberMatched:Boolean(memberMatched||(!authorMemberNo&&nicknameMatched)),
    nicknameMatched,
    dateMatched:Boolean(postDate&&postDate===String(questDate||'')),
    authorMemberNo,
    authorNickname,
    postDate
  };
}
function extractWagoBoardAuthor(block){
  const source=String(block||'');
  let nickname='';
  let authorHtml='';
  const explicit=/<td\b[^>]*class=['"][^'"]*(?:name|writer|nickname|author)[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i.exec(source);
  if(explicit){authorHtml=explicit[1];nickname=normalizeWagoNickname(explicit[1]);}
  if(!nickname){
    const drop=/<a\b[^>]*(?:show_nick_dropdown|open_minilog)[^>]*>([\s\S]*?)<\/a>/i.exec(source);
    if(drop){authorHtml=drop[0];nickname=normalizeWagoNickname(drop[1]);}
  }
  // 현재 SOOP 목록은 작성자 칸에 고정 class가 없을 수 있다.
  // 각 td를 읽고 HH:MM 시간 칸을 찾은 뒤, 조회수 숫자 칸 바로 앞을 작성자로 판정한다.
  if(!nickname){
    const cells=[...source.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>({html:m[1],text:htmlText(m[1]).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()}));
    const timeIndex=cells.findIndex(c=>/^\d{1,2}:\d{2}$/.test(c.text));
    if(timeIndex>0){
      let authorIndex=timeIndex-1;
      if(authorIndex>=0&&/^\d[\d,]*$/.test(cells[authorIndex].text))authorIndex--;
      if(authorIndex>=0){authorHtml=cells[authorIndex].html;nickname=normalizeWagoNickname(cells[authorIndex].text);}
    }
  }
  // 아이콘 대체문자나 불필요한 접두사가 섞여도 실제 표시 닉네임만 남긴다.
  nickname=nickname.replace(/^(?:image|img|아이콘)\s*:?\s*/i,'').trim();
  const memberNo=extractWagoMemberNoFromAuthorRow(authorHtml||source);
  return {nickname,memberNo};
}
function parseWagoTodayBoardRows(html){
  const blocks=String(html||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[],rows=[];
  for(const block of blocks){
    const text=htmlText(block);
    if(!/\b\d{1,2}:\d{2}\b/.test(text))continue;
    const rowTag=(/<tr\b[^>]*>/i.exec(block)||[''])[0];
    const rowClass=(/\bclass\s*=\s*['"]([^'"]*)['"]/i.exec(rowTag)||[])[1]||'';
    if(/(?:^|\s)(?:notice|fixed)(?:\s|$)/i.test(rowClass)||/\[?\s*\uC528\uCF13\uBAAC 공지\s*\]?/.test(text))continue;
    const post=/href=['"](?:https?:\/\/(?:www\.)?ygosu\.com)?\/board\/soop\/(\d+)(?:[^'"]*)?['"]/i.exec(block);
    if(!post)continue;
    const author=extractWagoBoardAuthor(block);
    rows.push({postId:post[1],memberNo:author.memberNo,nickname:author.nickname});
  }
  return rows;
}
async function inspectWagoDailyPosts(settings,memberNo,wagoNickname,questDate=kstDate()){
  const wanted=String(memberNo||'').replace(/\D/g,''),wantedNick=String(wagoNickname||'').trim();
  const requestedKstDate=String(questDate||kstDate());
  if(!wanted)return {ok:false,error:'인증된 와고 회원번호가 없습니다.'};
  if(!wantedNick)return {ok:false,error:'2단계 인증에 저장된 와고 닉네임이 없습니다. 다시 인증해 주세요.'};
  const base=parseYgosuPostUrl(settings.boardUrl||'https://ygosu.com/board/soop');if(!base.ok)return base;
  const found=new Set();
  const maxPages=Math.max(1,Math.min(20,Number(settings.maxPages)||10));
  let scannedPages=0,lastPageCount=0;

  // 처음부터 작성자 검색 결과 자체를 집계 기준으로 사용한다.
  // 검색어는 VERIFIED 상태의 2단계 인증 닉네임만 사용하며, 검색 결과에서 HH:MM으로 표시된 오늘 일반글만 센다.
  for(let page=1;page<=maxPages;page++){
    const u=new URL(base.url);
    u.searchParams.set('best_article','N');
    u.searchParams.set('s_category','');
    u.searchParams.set('searcht','w');
    u.searchParams.set('add_search_log','Y');
    u.searchParams.set('search',wantedNick);
    u.searchParams.set('x','0');
    u.searchParams.set('y','0');
    if(page>1)u.searchParams.set('page',String(page));
    u.searchParams.set('_cnine_nocache',String(Date.now()+page));
    const result=await fetchWagoHtml(u.toString(),'SOOP 작성자 검색 결과');if(!result.ok)return result;
    scannedPages++;
    if(looksLikeWagoBlockPage(result.html))return {ok:false,error:'와이고수에서 서버 조회를 차단했습니다. 잠시 후 다시 확인해 주세요.',code:'WAGO_EXTERNAL_BLOCKED'};
    const ids=parseWagoTodaySearchPosts(result.html,wantedNick);
    lastPageCount=ids.length;
    const before=found.size;
    ids.forEach(id=>found.add(id));
    if(ids.length===0||found.size===before)break;
  }

  const completedKstDate=kstDate();
  if(completedKstDate!==requestedKstDate)return {ok:false,error:'일일퀘스트 확인 중 날짜가 변경되었습니다. 새 날짜 기준으로 다시 확인해 주세요.',code:'KST_DATE_ROLLOVER'};
  return {
    ok:true,
    postCount:found.size,
    postIds:[...found],
    verificationMode:'VERIFIED_NICKNAME_WRITER_SEARCH',
    memberNo:wanted,
    wagoNickname:wantedNick,
    questDate:requestedKstDate,
    scannedPages,
    lastPageCount
  };
}

function parseWagoTodayBoardPostIds(html){
  const blocks=String(html||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[],ids=[];
  for(const block of blocks){
    if(!/\b\d{1,2}:\d{2}\b/.test(htmlText(block)))continue;
    if(/공지|notice|fixed/i.test(block))continue;
    const post=/href=['"](?:https?:\/\/(?:www\.)?ygosu\.com)?\/board\/soop\/(\d+)(?:[^'"]*)?['"]/i.exec(block);
    if(post)ids.push(post[1]);
  }
  return [...new Set(ids)];
}
function parseWagoTodayComments(html,memberNo,postId){
  const wanted=String(memberNo||'').replace(/\D/g,'');if(!wanted)return [];
  const blocks=String(html||'').match(/<(?:div|li)\b[^>]*(?:id=['"]reply[_-]?\d+['"]|class=['"][^'"]*(?:reply|comment)[^'"]*['"])[^>]*>[\s\S]*?(?=<(?:div|li)\b[^>]*(?:id=['"]reply[_-]?\d+['"]|class=['"][^'"]*(?:reply|comment)[^'"]*['"])|$)/gi)||[];
  const ids=[];
  for(const block of blocks){
    const dropdown=/show_nick_dropdown\(\$\(this\),\s*['"]\d+['"]\s*,\s*['"](\d+)['"]/i.exec(block);
    if(!dropdown||String(dropdown[1]).replace(/\D/g,'')!==wanted)continue;
    const text=htmlText(block);
    if(!/\b\d{1,2}:\d{2}\b/.test(text)&&!/\b오늘\b/.test(text))continue;
    const rid=/(?:id=['"]reply[_-]?|data-(?:reply|comment)-id=['"])(\d+)/i.exec(block);
    ids.push(`${postId}:${rid?.[1]||crypto.randomUUID().slice(0,8)}`);
  }
  return [...new Set(ids)];
}
async function inspectWagoDailyComments(settings,memberNo){
  const base=parseYgosuPostUrl(settings.boardUrl||'https://ygosu.com/board/soop');if(!base.ok)return base;
  const required=Math.max(1,Number(settings.requiredComments)||20),maxPosts=Math.max(20,Math.min(200,Number(settings.commentMaxPosts)||100));
  const boardIds=[],pageLimit=Math.max(1,Math.min(10,Math.ceil(maxPosts/30)));
  for(let page=1;page<=pageLimit&&boardIds.length<maxPosts;page++){
    const u=new URL(base.url);if(page>1)u.searchParams.set('page',String(page));
    const result=await fetchWagoHtml(u.toString(),'SOOP 게시판');if(!result.ok)return result;
    parseWagoTodayBoardPostIds(result.html).forEach(id=>{if(!boardIds.includes(id)&&boardIds.length<maxPosts)boardIds.push(id)});
  }
  const found=new Set();
  for(const postId of boardIds){
    const result=await fetchWagoHtml(`https://ygosu.com/board/soop/${postId}`,'SOOP 게시글 댓글');if(!result.ok)continue;
    parseWagoTodayComments(result.html,memberNo,postId).forEach(id=>found.add(id));
    if(found.size>=required)break;
  }
  return {ok:true,commentCount:found.size,commentIds:[...found],scannedPosts:boardIds.length};
}
function dailyQuestAdminExcluded(user,settings){
  const role=String(user?.role||'USER').toUpperCase();
  return ['OWNER','ADMIN'].includes(role)&&settings.adminTestAllowed===false;
}

async function writeAdminLog(env,admin,action,targetType,targetId,before=null,after=null){
  await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
    .bind(admin.id,action,targetType,String(targetId??''),before?JSON.stringify(before):null,after?JSON.stringify(after):null).run();
}

function cleanLimitedAuditText(value,max=300){return String(value??'').trim().slice(0,max)}
function limitedAuditUpsertStatement(env,data={}){
  const eventKey=cleanLimitedAuditText(data.eventKey||crypto.randomUUID(),180);
  return {eventKey,statement:env.DB.prepare(`INSERT INTO limited_acquisition_audit(
    event_key,request_id,draw_group_id,source_type,source_id,user_id,user_nickname,card_id,card_title,pack_id,status,
    coin_cost,stock_before,stock_after,quantity_before,quantity_after,is_duplicate,stock_reserved,card_granted,
    admin_id,admin_reason,evidence_note,error_message,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(event_key) DO UPDATE SET
    request_id=excluded.request_id,draw_group_id=excluded.draw_group_id,source_type=excluded.source_type,source_id=excluded.source_id,
    user_id=excluded.user_id,user_nickname=excluded.user_nickname,card_id=excluded.card_id,card_title=excluded.card_title,
    pack_id=excluded.pack_id,status=excluded.status,coin_cost=excluded.coin_cost,stock_before=excluded.stock_before,
    stock_after=excluded.stock_after,quantity_before=excluded.quantity_before,quantity_after=excluded.quantity_after,
    is_duplicate=excluded.is_duplicate,stock_reserved=excluded.stock_reserved,card_granted=excluded.card_granted,
    admin_id=excluded.admin_id,admin_reason=excluded.admin_reason,evidence_note=excluded.evidence_note,
    error_message=excluded.error_message,updated_at=CURRENT_TIMESTAMP`).bind(
      eventKey,cleanLimitedAuditText(data.requestId,180)||null,cleanLimitedAuditText(data.drawGroupId,180)||null,
      cleanLimitedAuditText(data.sourceType||'UNKNOWN',40),cleanLimitedAuditText(data.sourceId,180)||null,
      Number(data.userId||0),cleanLimitedAuditText(data.userNickname,80),cleanLimitedAuditText(data.cardId,100),
      cleanLimitedAuditText(data.cardTitle,160),cleanLimitedAuditText(data.packId,100)||null,cleanLimitedAuditText(data.status||'PENDING',40),
      Math.max(0,Math.floor(Number(data.coinCost||0))),Number.isFinite(Number(data.stockBefore))?Number(data.stockBefore):null,
      Number.isFinite(Number(data.stockAfter))?Number(data.stockAfter):null,Number.isFinite(Number(data.quantityBefore))?Number(data.quantityBefore):null,
      Number.isFinite(Number(data.quantityAfter))?Number(data.quantityAfter):null,data.isDuplicate?1:0,data.stockReserved?1:0,
      data.cardGranted?1:0,Number(data.adminId||0)||null,cleanLimitedAuditText(data.adminReason,300)||null,
      cleanLimitedAuditText(data.evidenceNote,500)||null,cleanLimitedAuditText(data.errorMessage,500)||null
    )};
}
async function beginLimitedAcquisitionAudit(env,data={}){const prepared=limitedAuditUpsertStatement(env,data);await prepared.statement.run();return prepared.eventKey}
function limitedAuditFinishStatement(env,eventKey,data={}){
  return env.DB.prepare(`UPDATE limited_acquisition_audit SET status=?,stock_after=COALESCE(?,stock_after),
    quantity_after=COALESCE(?,quantity_after),is_duplicate=COALESCE(?,is_duplicate),stock_reserved=COALESCE(?,stock_reserved),
    card_granted=COALESCE(?,card_granted),error_message=?,updated_at=CURRENT_TIMESTAMP,
    completed_at=CASE WHEN ? IN ('PENDING','STOCK_RESERVED') THEN completed_at ELSE CURRENT_TIMESTAMP END WHERE event_key=?`).bind(
      cleanLimitedAuditText(data.status||'COMPLETED',40),Number.isFinite(Number(data.stockAfter))?Number(data.stockAfter):null,
      Number.isFinite(Number(data.quantityAfter))?Number(data.quantityAfter):null,data.isDuplicate===undefined?null:(data.isDuplicate?1:0),
      data.stockReserved===undefined?null:(data.stockReserved?1:0),data.cardGranted===undefined?null:(data.cardGranted?1:0),
      cleanLimitedAuditText(data.errorMessage,500)||null,cleanLimitedAuditText(data.status||'COMPLETED',40),cleanLimitedAuditText(eventKey,180)
    );
}
async function finishLimitedAcquisitionAudit(env,eventKey,data={}){await limitedAuditFinishStatement(env,eventKey,data).run()}
async function seedDatabase(env){
  for(const member of MEMBERS){
    await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
      .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
  }
  for(let i=0;i<CARDS.length;i+=40){
    const chunk=CARDS.slice(i,i+40).map(card=>env.DB.prepare('INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,card.status==='PENDING'?0:1,card.drawWeight??1,card.limitedTotal??null,card.status||'PUBLIC',card.batchName||null,card.batchDate||null));
    await env.DB.batch(chunk);
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_card_pack_cards_card ON card_pack_cards(card_id)`).run();
  for(const pack of PACKS){
    await env.DB.prepare(`INSERT OR REPLACE INTO card_packs(id,name,subtitle,description,theme,price,allowed_rarities,guarantee_10,guarantee_20,pickup_member_id,pickup_multiplier,is_active,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(pack.id,pack.name,pack.subtitle,pack.description,pack.theme,pack.price,JSON.stringify(pack.allowed),pack.guarantee10,pack.guarantee20,pack.pickupMemberId,pack.pickupMultiplier,1,pack.sortOrder).run();
    for(const [rarity,rate] of Object.entries(RATES)){
      await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(pack.id,rarity,(pack.id==='pickup'&&rarity==='LIMITED')?1:rate).run();
    }
    if(Array.isArray(pack.cardIds)&&pack.cardIds.length){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`).run();
      for(const cardId of pack.cardIds) await env.DB.prepare('INSERT OR IGNORE INTO card_pack_cards(pack_id,card_id) VALUES(?,?)').bind(pack.id,cardId).run();
    }
  }
}
const requestAuthenticationCache=new WeakMap();
// V1784: 세션 조회 SQL을 한 곳에 모아 점검 게이트 조회와 같은 D1 배치로 묶을 수 있게 한다.
const SESSION_LOOKUP_SQL=`SELECT u.*,s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`;
// 점검 게이트가 배치로 미리 읽어둔 세션 행. authenticate()는 이 값이 있으면 D1을 다시 치지 않는다.
const requestSessionRowCache=new WeakMap();
function bearerToken(request){return (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'')}
function primeSessionRow(request,tokenHash,user){
  if(!requestSessionRowCache.has(request))requestSessionRowCache.set(request,{tokenHash,user:user||null});
}
async function authenticate(request,env){
  if(requestAuthenticationCache.has(request))return requestAuthenticationCache.get(request);
  const authentication=(async()=>{
  const raw=bearerToken(request);
  if(!raw) return null;
  const primed=requestSessionRowCache.get(request);
  const tokenHash=primed?.tokenHash||await hash(raw);
  const user=primed?primed.user:await env.DB.prepare(SESSION_LOOKUP_SQL).bind(tokenHash).first();
  if(!user)return null;
  const expiresMs=Date.parse(String(user.session_expires_at||'').replace(' ','T')+'Z');
  if(Number.isFinite(expiresMs)&&expiresMs-Date.now()<=7*24*60*60*1000){
    const extended=new Date(Date.now()+30*24*60*60*1000).toISOString();
    await env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(extended,tokenHash).run();
    user.session_expires_at=extended;
  }
  return user;
  })();
  requestAuthenticationCache.set(request,authentication);
  return authentication;
}
let singleClientSessionSchemaPromise=null;
let revokedSessionCleanupAt=0;
async function ensureSingleClientSessionSchema(env){
  if(singleClientSessionSchemaPromise)return singleClientSessionSchemaPromise;
  singleClientSessionSchemaPromise=(async()=>{
    const columns=await env.DB.prepare('PRAGMA table_info(sessions)').all();
    if(!(columns.results||[]).some(row=>String(row.name)==='client_id')){
      try{await env.DB.prepare("ALTER TABLE sessions ADD COLUMN client_id TEXT NOT NULL DEFAULT ''").run()}
      catch(error){if(!/duplicate column/i.test(String(error?.message||error)))throw error}
    }
    return true;
  })().catch(error=>{singleClientSessionSchemaPromise=null;throw error});
  return singleClientSessionSchemaPromise;
}
async function makeSession(env,userId,requestedClientId=''){
  await ensureSingleClientSessionSchema(env);
  const clientId=String(requestedClientId||'').trim().replace(/[^a-zA-Z0-9:_-]/g,'').slice(0,120);
  const raw=createToken();
  const tokenHash=await hash(raw);
  const expiresAt=new Date(Date.now()+1000*60*60*24*30).toISOString();
  const account=await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(userId).first();
  const operator=['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(String(account?.role||'USER').toUpperCase());
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS revoked_player_sessions_v1533(
    token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,reason TEXT NOT NULL,revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,client_id) VALUES(?,?,?,?)').bind(tokenHash,userId,expiresAt,clientId).run();
  if(operator)await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND expires_at<=datetime('now')").bind(userId).run();
  else{
    await env.DB.prepare("INSERT OR REPLACE INTO revoked_player_sessions_v1533(token_hash,user_id,reason,revoked_at) SELECT token_hash,user_id,CASE WHEN client_id='' OR (?<>'' AND client_id=?) THEN 'SAME_CLIENT_REFRESHED' ELSE 'MULTI_CLIENT_REPLACED' END,CURRENT_TIMESTAMP FROM sessions WHERE user_id=? AND token_hash<>?").bind(clientId,clientId,userId,tokenHash).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(userId,tokenHash).run();
    // Session replacement must stay synchronous; global retention cleanup does
    // not. Limit it to once per isolate/hour and let the indexed predicate do a
    // bounded delete instead of scanning the entire revocation table on login.
    if(Date.now()>=revokedSessionCleanupAt){
      revokedSessionCleanupAt=Date.now()+3600000;
      await env.DB.prepare(`DELETE FROM revoked_player_sessions_v1533 WHERE token_hash IN (
        SELECT token_hash FROM revoked_player_sessions_v1533 WHERE revoked_at<datetime('now','-7 days') ORDER BY revoked_at LIMIT 500
      )`).run().catch(error=>{revokedSessionCleanupAt=0;console.warn('revoked session cleanup failed',error)});
    }
  }
  return raw;
}

// These caches are isolate-local burst protection only. Keep the freshness window short
// because CMS updates can land on a different Worker isolate.
const CARD_CATALOG_CACHE_MS=5000,PACK_CATALOG_CACHE_MS=5000,UNIQUE_ROWS_CACHE_MS=5000;
const CARD_CATALOG_SELECT=`SELECT c.id,c.title,m.name,m.sort_order AS memberSortOrder,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,c.card_status AS retirementStatus,c.power_type AS powerType,c.base_power AS basePower,CASE WHEN fx.card_id IS NULL THEN 0 ELSE 1 END AS acquisitionFxConfigured,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN 1 ELSE COALESCE(fx.enabled,0) END AS acquisitionFxEnabled,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN '/assets/effects/L2CARD.mp4' ELSE COALESCE(fx.media_url,'') END AS acquisitionMediaUrl,COALESCE(fx.audio_url,'') AS acquisitionAudioUrl,COALESCE(fx.skip_allowed,1) AS acquisitionSkipAllowed,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN 10000 ELSE COALESCE(fx.duration_ms,8000) END AS acquisitionDurationMs FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_acquisition_effects fx ON fx.card_id=('__GRADE_' || UPPER(c.rarity) || '__')`;
async function publicCardCatalogRows(env){
  const now=Date.now();if(cardCatalogCache&&cardCatalogCache.expiresAt>now)return cardCatalogCache.promise;
  const promise=env.DB.prepare(`${CARD_CATALOG_SELECT} WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') ORDER BY m.sort_order,c.id`).all().then(rows=>rows.results||[]).catch(error=>{if(cardCatalogCache?.promise===promise)cardCatalogCache=null;throw error});
  cardCatalogCache={promise,expiresAt:now+CARD_CATALOG_CACHE_MS};return promise;
}
async function inactiveOwnedCardRows(env,userId){
  if(!userId)return [];
  const rows=await env.DB.prepare(`${CARD_CATALOG_SELECT} WHERE c.is_active<>1 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') AND EXISTS (SELECT 1 FROM user_cards uc WHERE uc.user_id=? AND uc.card_id=c.id AND COALESCE(uc.quantity,0)>0) ORDER BY m.sort_order,c.id`).bind(userId).all();
  return rows.results||[];
}
async function activeUniqueAbilityRows(env){
  const now=Date.now();if(cardUniqueRowsCache&&cardUniqueRowsCache.expiresAt>now)return cardUniqueRowsCache.promise;
  const promise=env.DB.prepare(`SELECT card_id,attack_percent,defense_percent,hp_percent,speed_percent,effect_name,effect_description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,scope_pve,scope_pvp,scope_captain FROM card_unique_effects WHERE is_active=1`).all().then(rows=>rows.results||[]).catch(error=>{if(cardUniqueRowsCache?.promise===promise)cardUniqueRowsCache=null;throw error});
  cardUniqueRowsCache={promise,expiresAt:now+UNIQUE_ROWS_CACHE_MS};return promise;
}
async function activePackCatalogRows(env){
  const now=Date.now();if(packCatalogCache&&packCatalogCache.expiresAt>now)return packCatalogCache.promise;
  const promise=env.DB.prepare('SELECT * FROM card_packs WHERE is_active=1 ORDER BY sort_order,id').all().then(rows=>rows.results||[]).catch(error=>{if(packCatalogCache?.promise===promise)packCatalogCache=null;throw error});
  packCatalogCache={promise,expiresAt:now+PACK_CATALOG_CACHE_MS};return promise;
}

async function profile(env,user){
  const [owned,attendance,totalAttendance,recent,attendanceConfig,breakthroughSettings,weeklyPremiumCube,masterStarRow,maHighBreakthrough,limitedHighBreakthrough]=await Promise.all([
    env.DB.prepare("SELECT uc.card_id,uc.quantity,uc.first_obtained_at,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')").bind(user.id).all(),
    env.DB.prepare('SELECT attendance_date,COALESCE(streak_day,1) AS streak_day FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM attendance_logs WHERE user_id=?').bind(user.id).first(),
    env.DB.prepare(`SELECT d.card_id AS cardId,d.is_new,c.title,c.rarity,d.created_at AS at FROM draw_logs d JOIN cards_effective_v1210 c ON c.id=d.card_id WHERE d.user_id=? ORDER BY d.id DESC LIMIT 30`).bind(user.id).all(),
    attendanceSettings(env),
    breakthroughConfig(env),
    premiumCubeWeeklyStatus(env,user.id),
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first(),
    maMasterStarBreakthroughConfig(env),
    limitedMasterStarBreakthroughConfig(env)
  ]);
  return {profileScope:'FULL',id:user.id,nickname:user.nickname,coin:user.coin,cardShards:Number(user.card_shards||0),magicCrystals:Number(user.magic_crystals||0),role:user.role,
    owned:owned.results.map(row=>String(row.card_id)),
    quantities:Object.fromEntries(owned.results.map(row=>[String(row.card_id),Number(row.quantity||0)])),
    breakthroughs:Object.fromEntries(owned.results.map(row=>[String(row.card_id),Number(row.breakthrough_level||0)])),
    history:recent.results.reverse().map(row=>({cardId:row.cardId,at:row.at,duplicate:!row.is_new,title:row.title,grade:row.rarity})),
    attendance:{lastClaimDate:attendance?.attendance_date||null,totalDays:totalAttendance?.count||0,streak:Number(attendance?.streak_day||0),settings:attendanceConfig},breakthroughConfig:breakthroughSettings,masterStars:Number(masterStarRow?.quantity||0),maHighBreakthrough,limitedHighBreakthrough,weeklyPremiumCube};
}
// V1791: 전투 응답용 경량 프로필.
//
// profile() 은 보유 카드 "전체" 스캔 + 뽑기 로그 30건 조인 + 출석/설정 등 10개 조회를 한다.
// 그런데 전투 한 판이 실제로 바꾸는 것은
//   users 행(코인·파편·마법결정) / 마스터스타 수량 / "이번에 얻은 카드 몇 장" 뿐이다.
// 카드 500장 보유 유저면 전투마다 500행을 다시 읽어 통째로 내려보내고 있었다.
// (D1 은 읽은 행 수로 과금하므로 지연과 비용 양쪽 문제)
//
// 클라이언트 apiUserToLocal 은 profileScope 에 'PARTIAL' 이 들어 있으면
// owned/quantities/breakthroughs 를 기존 값과 병합하고,
// 응답에 없는 항목(history/attendance/breakthroughConfig 등)은 기존 값을 유지한다.
// 이미 DRAW_PARTIAL 로 검증된 경로다. 그대로 재사용한다.

// 이번 전투에서 실제로 지급된 카드 id 를 모은다.
// battle/fight 에서 user_cards 에 쓰는 경로는 두 곳뿐이다:
//   1) grantBattleCard()      -> cardReward.card.id
//   2) _drop_pool.js 통합드랍 -> rewardType === 'CARD' 의 rewardRef
// 카드인데 참조를 읽을 수 없으면 무엇이 바뀌었는지 알 수 없으므로
// null 을 돌려 호출자가 기존 full profile() 로 안전하게 되돌아가게 한다.
//
// ⚠️ 카드를 지급하는 새 경로가 생기면 반드시 여기에 등록할 것.
//    등록하지 않으면 새로 얻은 카드가 다음 전체 갱신 전까지 화면에 안 보인다.
function grantedCardIdsFromBattle({cardRewards=[],unifiedDrops=[]}={}){
  const ids=new Set();
  for(const reward of cardRewards){
    const cardId=reward?.card?.id;
    if(cardId!==undefined&&cardId!==null)ids.add(String(cardId));
  }
  for(const drop of unifiedDrops){
    const rewards=Array.isArray(drop?.rewards)?drop.rewards:[];
    for(const reward of rewards){
      if(String(reward?.rewardType||'').toUpperCase()!=='CARD')continue;
      const ref=reward?.rewardRef;
      if(ref===undefined||ref===null||String(ref).trim()==='')return null;
      ids.add(String(ref));
    }
  }
  return ids;
}

// 갱신된 users 행 + 마스터스타 + 바뀐 카드만 D1 배치 1회로 읽어 경량 프로필을 만든다.
// grantedCardIds 가 null 이면 기존 profile() 로 폴백한다.
async function battleResponseProfile(env,user,grantedCardIds){
  const userStatement=env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id);
  if(grantedCardIds===null){
    const updated=await userStatement.first();
    return profile(env,updated||user);
  }
  const ids=[...grantedCardIds];
  const statements=[
    userStatement,
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id)
  ];
  if(ids.length)statements.push(env.DB.prepare(`SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=? AND card_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids));
  const results=await env.DB.batch(statements);
  const updated=(results[0]?.results||[])[0]||user;
  const masterStarRow=(results[1]?.results||[])[0]||null;
  const ownedRows=ids.length?(results[2]?.results||[]):[];
  return {...drawResponseProfileFromRows(updated,ownedRows,masterStarRow),profileScope:'BATTLE_PARTIAL'};
}

function drawResponseProfileFromRows(user,ownedRows=[],masterStarRow=null){
  const rows=ownedRows||[];
  return {profileScope:'DRAW_PARTIAL',id:user.id,nickname:user.nickname,coin:Number(user.coin||0),cardShards:Number(user.card_shards||0),magicCrystals:Number(user.magic_crystals||0),role:user.role,
    owned:rows.map(row=>String(row.card_id)),
    quantities:Object.fromEntries(rows.map(row=>[String(row.card_id),Number(row.quantity||0)])),
    breakthroughs:Object.fromEntries(rows.map(row=>[String(row.card_id),Number(row.breakthrough_level||0)])),
    masterStars:Number(masterStarRow?.quantity||0)};
}
function weightedPick(items,getWeight){
  const total=items.reduce((sum,item)=>sum+getWeight(item),0);
  let roll=Math.random()*total;
  for(const item of items){roll-=getWeight(item);if(roll<0)return item}
  return items.at(-1);
}
async function recentHighGradeItems(env){
  const now=Date.now();
  if(recentHighGradeCache&&recentHighGradeCache.expiresAt>now)return recentHighGradeCache.promise;
  // The acquisition ticker is event history, not current ownership. Draw logs
  // already have a compact rarity/id index and avoid scanning ~300k user_cards.
  const promise=env.DB.prepare(`SELECT u.nickname,c.title AS card_title,d.rarity,d.created_at
    FROM draw_logs d NOT INDEXED
    JOIN users u ON u.id=d.user_id
    JOIN cards_effective_v1210 c ON c.id=d.card_id
    WHERE d.rarity IN ('LIMITED','PRESTIGE','FUR') AND u.status='ACTIVE'
    ORDER BY d.id DESC LIMIT 20`).all()
    .then(rows=>rows.results||[])
    .catch(error=>{if(recentHighGradeCache?.promise===promise)recentHighGradeCache=null;throw error});
  recentHighGradeCache={promise,expiresAt:now+300000};
  return promise;
}
async function recentMythicEquipmentItems(env){
  const now=Date.now();
  if(recentEquipmentFeedCache&&recentEquipmentFeedCache.expiresAt>now)return recentEquipmentFeedCache.promise;
  // 실시간 소식 때문에 장비 전체를 읽지 않도록 최근 획득 20,000건만 PK 역순으로 제한한 뒤 신화 장비를 추린다.
  // 현재 장비 등급 체계에서 MYTHIC이 최고 등급이며, 신화 미만 장비는 메인 획득 소식에 노출하지 않는다.
  const promise=ensureEquipmentFoundation(env)
    .then(()=>env.DB.prepare(`SELECT u.nickname,e.name AS equipment_name,e.rarity,recent.acquired_at AS created_at,recent.source_type AS source
      FROM (
        SELECT id,user_id,equipment_id,source_type,acquired_at
        FROM user_equipment_instances INDEXED BY idx_user_equipment_instances_recent_v1674
        ORDER BY id DESC LIMIT 20000
      ) recent
      JOIN users u ON u.id=recent.user_id
      JOIN character_equipment_items e ON e.id=recent.equipment_id
      WHERE UPPER(e.rarity)='MYTHIC' AND u.status='ACTIVE'
      ORDER BY recent.id DESC LIMIT 20`).all())
    .then(rows=>rows.results||[])
    .catch(error=>{if(recentEquipmentFeedCache?.promise===promise)recentEquipmentFeedCache=null;throw error});
  recentEquipmentFeedCache={promise,expiresAt:now+300000};
  return promise;
}
let cardAcquisitionGradeFxCache=null;
async function cardAcquisitionEffectsByGrade(env){
  const now=Date.now();if(cardAcquisitionGradeFxCache&&cardAcquisitionGradeFxCache.expiresAt>now)return cardAcquisitionGradeFxCache.value;
  const rows=await env.DB.prepare(`SELECT card_id,enabled,media_url,audio_url,skip_allowed,duration_ms FROM card_acquisition_effects WHERE card_id IN ('__GRADE_LIMITED__','__GRADE_PRESTIGE__','__GRADE_FUR__')`).all();
  const settings={
    LIMITED:{acquisitionFxConfigured:0,acquisitionFxEnabled:1,acquisitionMediaUrl:'/assets/effects/L2CARD.mp4',acquisitionAudioUrl:'',acquisitionSkipAllowed:1,acquisitionDurationMs:10000},
    PRESTIGE:{acquisitionFxConfigured:0,acquisitionFxEnabled:0,acquisitionMediaUrl:'',acquisitionAudioUrl:'',acquisitionSkipAllowed:1,acquisitionDurationMs:8000},
    FUR:{acquisitionFxConfigured:0,acquisitionFxEnabled:0,acquisitionMediaUrl:'',acquisitionAudioUrl:'',acquisitionSkipAllowed:1,acquisitionDurationMs:8000}
  };
  for(const row of rows.results||[]){
    const grade=String(row.card_id||'').replace('__GRADE_','').replace('__','').toUpperCase();
    if(!settings[grade])continue;
    settings[grade]={acquisitionFxConfigured:1,acquisitionFxEnabled:Number(row.enabled||0),acquisitionMediaUrl:String(row.media_url||''),acquisitionAudioUrl:String(row.audio_url||''),acquisitionSkipAllowed:Number(row.skip_allowed)!==0?1:0,acquisitionDurationMs:Number(row.duration_ms||(grade==='LIMITED'?10000:8000))};
  }
  cardAcquisitionGradeFxCache={value:settings,expiresAt:now+30000};return settings;
}
function cardWithAcquisitionEffect(card,settings){
  const grade=String(card?.grade||card?.rarity||'').toUpperCase();
  return {...card,...(settings?.[grade]||{})};
}
async function drawLimitedCard(env){
  const pool=randomDrawPool((await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND c.rarity='LIMITED' AND c.draw_weight>0
      AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id='pickup')
        OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id='pickup' AND p1.card_id=c.id))`).all()).results);
  return weightedPick(pool,row=>Number(row.draw_weight)||0)||null;
}
async function drawOne(env,pack,minimum=null,allowLimited=true,criticalBonus=0){
  // 리미티드팩의 한정판 확률은 일반 등급 100% 합계와 별도로 먼저 판정한다.
  if(allowLimited&&LIMITED_DRAW_PACKS.has(pack.id)&&!minimum){
    const limitedRateRow=await env.DB.prepare("SELECT rate FROM card_pack_rates WHERE pack_id=? AND rarity='LIMITED'").bind(pack.id).first();
    const limitedRate=Math.max(0,Math.min(100,Number(limitedRateRow?.rate)||0));
    if(limitedRate>0&&Math.random()*100<limitedRate){
      const limitedCard=await drawLimitedCard(env);
      if(limitedCard) return limitedCard;
    }
  }
  let allowed=JSON.parse(pack.allowed_rarities).filter(rarity=>DRAW_RARITIES.includes(rarity)&&rarity!=='LIMITED');
  if(minimum) allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  if(!allowed.length) throw new Error('이 카드팩에 설정된 일반 등급이 없습니다.');
  const placeholders=allowed.map(()=>'?').join(',');
  let rates=(await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${placeholders}) AND rate>0`).bind(pack.id,...allowed).all()).results;
  if(criticalBonus>0) rates=applyCriticalRateBonus(rates,criticalBonus);
  if(!rates.length) throw new Error('이 카드팩에 설정된 일반 카드 확률이 없습니다.');
  for(let attempt=0;attempt<20;attempt++){
    const selectedRarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const pool=randomDrawPool((await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
      WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND c.rarity=? AND c.draw_weight>0 AND c.limited_total IS NULL
        AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?)
          OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(selectedRarity,pack.id,pack.id).all()).results);
    if(!pool.length) continue;
    const card=weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1));
    if(card) return card;
  }
  throw new Error('현재 뽑을 수 있는 일반 카드가 없습니다. 카드 및 확률 설정을 확인하세요.');
}


const drawContextCache=new Map();
async function queryDrawContext(env,pack){
  const allowed=JSON.parse(pack.allowed_rarities).filter(rarity=>DRAW_RARITIES.includes(rarity)&&rarity!=='LIMITED');
  const statements=[
    env.DB.prepare("SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rate>0").bind(pack.id),
    env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
      WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND c.draw_weight>0 AND c.limited_total IS NULL
        AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?)
          OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(pack.id,pack.id)
  ];
  if(LIMITED_DRAW_PACKS.has(pack.id))statements.push(env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND c.rarity='LIMITED' AND c.draw_weight>0
      AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?)
        OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(pack.id,pack.id));
  const batch=await env.DB.batch(statements);
  const rateRows=batch[0]?.results||[];
  const normalCards=randomDrawPool(batch[1]?.results||[]);
  const limitedCards=LIMITED_DRAW_PACKS.has(pack.id)?randomDrawPool(batch[2]?.results||[]):[];
  const poolsByGrade=new Map();
  for(const card of normalCards){
    const grade=String(card.grade||'');
    if(!poolsByGrade.has(grade))poolsByGrade.set(grade,[]);
    poolsByGrade.get(grade).push(card);
  }
  return {
    allowed,
    rateRows,
    limitedRate:Math.max(0,Math.min(100,Number(rateRows.find(row=>row.rarity==='LIMITED')?.rate)||0)),
    limitedCards,
    poolsByGrade
  };
}
async function loadDrawContext(env,pack){
  const key=String(pack.id),now=Date.now(),cached=drawContextCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.promise;
  const promise=queryDrawContext(env,pack).catch(error=>{if(drawContextCache.get(key)?.promise===promise)drawContextCache.delete(key);throw error});
  drawContextCache.set(key,{promise,expiresAt:now+15000});
  return promise;
}
function drawPoolFromContext(ctx,rarity){
  return ctx.poolsByGrade.get(rarity)||[];
}
function drawGradeHasCandidate(ctx,rarity){return drawPoolFromContext(ctx,rarity).length>0;}
function drawNormalFromContext(ctx,pack,rarity){
  const pool=drawPoolFromContext(ctx,rarity);
  return weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1))||null;
}
function drawMissingFurFromContext(ctx,pack){
  const known=ctx.knownFurIds instanceof Set?ctx.knownFurIds:new Set();
  const pool=drawPoolFromContext(ctx,'FUR').filter(card=>!known.has(String(card.id)));
  return weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1))||null;
}
function drawOneFromContext(ctx,pack,minimum=null,allowLimited=true,criticalBonus=0){
  if(allowLimited&&LIMITED_DRAW_PACKS.has(pack.id)&&!minimum&&ctx.limitedRate>0&&Math.random()*100<ctx.limitedRate){
    const limitedCard=weightedPick(ctx.limitedCards,row=>Number(row.draw_weight)||0);
    if(limitedCard)return limitedCard;
  }
  let allowed=ctx.allowed;
  if(minimum)allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  if(!allowed.length)throw new Error('이 카드팩에 설정된 일반 등급이 없습니다.');
  let rates=ctx.rateRows.filter(row=>allowed.includes(row.rarity)&&row.rarity!=='LIMITED'&&Number(row.rate)>0&&drawGradeHasCandidate(ctx,row.rarity));
  if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
  if(!rates.length)throw new Error('이 카드팩에 설정된 일반 카드 확률이 없습니다.');
  for(let attempt=0;attempt<20;attempt++){
    const selectedRarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const card=selectedRarity&&drawNormalFromContext(ctx,pack,selectedRarity);
    if(card)return card;
  }
  throw new Error('현재 뽑을 수 있는 일반 카드가 없습니다. 카드 및 확률 설정을 확인하세요.');
}
function drawOneWithPityFromContext(ctx,pack,ssrRate,criticalBonus=0,allowLimited=true){
  if(allowLimited&&LIMITED_DRAW_PACKS.has(pack.id)&&ctx.limitedRate>0&&Math.random()*100<ctx.limitedRate){
    const limitedCard=weightedPick(ctx.limitedCards,row=>Number(row.draw_weight)||0);
    if(limitedCard)return limitedCard;
  }
  const allowed=ctx.allowed;
  if(ssrRate!==null&&allowed.includes('SSR')){
    if(Math.random()*100<ssrRate){
      const ssr=drawNormalFromContext(ctx,pack,'SSR');
      if(ssr)return ssr;
    }
    const others=allowed.filter(rarity=>rarity!=='SSR');
    let rates=ctx.rateRows.filter(row=>others.includes(row.rarity)&&row.rarity!=='LIMITED'&&Number(row.rate)>0&&drawGradeHasCandidate(ctx,row.rarity));
    if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
    for(let attempt=0;attempt<20;attempt++){
      const rarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
      const card=rarity&&drawNormalFromContext(ctx,pack,rarity);
      if(card)return card;
    }
  }
  return drawOneFromContext(ctx,pack,null,false,criticalBonus);
}


const LIMITED_DRAW_PACKS=new Set(['pickup','ultimate']);
const PITY_PACKS=new Set(['premium','pickup']);
const DEFAULT_PITY_RATES={61:10,62:15,63:20,64:25,65:30,66:35,67:40,68:45,69:50,70:100};
function defaultPitySettings(){return {premium:{enabled:true,start:61,hard:70,rates:{...DEFAULT_PITY_RATES}},pickup:{enabled:true,start:61,hard:70,rates:{...DEFAULT_PITY_RATES}}};}
function cleanPityPackConfig(raw,base){
  const start=Math.max(1,Math.min(999,Math.floor(Number(raw?.start??base.start))));
  const hard=Math.max(start,Math.min(999,Math.floor(Number(raw?.hard??base.hard))));
  const rates={};
  for(let n=start;n<=hard;n++) rates[n]=n===hard?100:Math.max(0,Math.min(100,Number(raw?.rates?.[n]??base.rates?.[n]??0)));
  return {enabled:raw?.enabled!==false,start,hard,rates};
}
function cleanPitySettings(raw){const base=defaultPitySettings();return {premium:cleanPityPackConfig(raw?.premium,base.premium),pickup:cleanPityPackConfig(raw?.pickup,base.pickup)};}
let pitySettingsCache=null;
async function pitySettings(env,{fresh=false}={}){const now=Date.now();if(!fresh&&pitySettingsCache&&pitySettingsCache.expiresAt>now)return pitySettingsCache.value;const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_pity_settings_v1'").first();let value;try{value=cleanPitySettings(JSON.parse(row?.value||'{}'))}catch{value=defaultPitySettings()}pitySettingsCache={value,expiresAt:now+30000};return value}
async function packPityCount(env,userId,packId){if(!PITY_PACKS.has(packId))return 0;const row=await env.DB.prepare('SELECT miss_count FROM user_pack_pity WHERE user_id=? AND pack_id=?').bind(userId,packId).first();return Math.max(0,Number(row?.miss_count||0));}
async function savePackPity(env,userId,packId,count){if(!PITY_PACKS.has(packId))return;await env.DB.prepare(`INSERT INTO user_pack_pity(user_id,pack_id,miss_count,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,pack_id) DO UPDATE SET miss_count=excluded.miss_count,updated_at=CURRENT_TIMESTAMP`).bind(userId,packId,Math.max(0,Math.floor(count))).run();}
function pityRateForDraw(settings,packId,missCount){const cfg=settings?.[packId];const drawNo=Number(missCount||0)+1;if(!cfg?.enabled)return {drawNo,rate:null};return {drawNo,rate:Number(cfg.rates?.[drawNo]??(drawNo>=cfg.hard?100:null))};}

const FUR_FIRST_PITY_META_KEY='fur_first_acquisition_settings_v1';
const FUR_FIRST_PITY_PACKS=new Set(['premium','pickup']);
const FUR_FIRST_PITY_TARGET_COUNT=2;
function defaultFurFirstSettings(){return {enabled:true,start:50,hard:100,startRate:2,maxSoftRate:20};}
function cleanFurFirstSettings(raw={}){
  const base=defaultFurFirstSettings(),num=(value,fallback,min,max)=>{const parsed=Number(value);return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));};
  const start=Math.floor(num(raw.start,base.start,1,1000000));
  const hard=Math.max(start,Math.floor(num(raw.hard,base.hard,1,1000000)));
  const startRate=num(raw.startRate,base.startRate,0,100);
  const maxSoftRate=Math.max(startRate,num(raw.maxSoftRate,base.maxSoftRate,0,100));
  return {enabled:raw.enabled!==false,start,hard,startRate:Math.round(startRate*1000)/1000,maxSoftRate:Math.round(maxSoftRate*1000)/1000};
}
let furFirstSettingsCache=null;
async function furFirstSettings(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&furFirstSettingsCache&&furFirstSettingsCache.expiresAt>now)return furFirstSettingsCache.value;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FUR_FIRST_PITY_META_KEY).first();
  let value;try{value=cleanFurFirstSettings(JSON.parse(row?.value||'{}'))}catch{value=defaultFurFirstSettings()}
  furFirstSettingsCache={value,expiresAt:now+30000};return value;
}
async function furFirstPityState(env,userId){
  await ensureFurFirstPityV1291(env);
  const row=await env.DB.prepare('SELECT miss_count,last_pack_id,completed_at FROM user_fur_first_pity WHERE user_id=?').bind(userId).first();
  const owned=await env.DB.prepare(`SELECT COUNT(DISTINCT uc.card_id) AS count
    FROM user_cards uc
    JOIN cards_effective_v1210 c ON c.id=uc.card_id
    JOIN members m ON m.id=c.member_id
    WHERE uc.user_id=? AND UPPER(c.rarity)='FUR' AND COALESCE(uc.quantity,0)>0
      AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`).bind(userId).first();
  const ownedCount=Math.max(0,Number(owned?.count||0)),completed=ownedCount>=FUR_FIRST_PITY_TARGET_COUNT;
  if(Boolean(row?.completed_at)!==completed)await env.DB.prepare(`INSERT INTO user_fur_first_pity(user_id,miss_count,last_pack_id,completed_at,created_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET miss_count=excluded.miss_count,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(userId,completed?0:Math.max(0,Number(row?.miss_count||0)),row?.last_pack_id||null,completed?new Date().toISOString():null).run();
  return {everOwned:ownedCount>0,ownedCount,targetCount:FUR_FIRST_PITY_TARGET_COUNT,completed,missCount:completed?0:Math.max(0,Number(row?.miss_count||0)),lastPackId:row?.last_pack_id||null};
}
async function drawUserPityState(env,userId,packId,ownedFurRowsPromise=null){
  await ensureFurFirstPityV1291(env);
  const [pityBatch,ownedSource]=await Promise.all([
    env.DB.batch([
      env.DB.prepare('SELECT miss_count FROM user_pack_pity WHERE user_id=? AND pack_id=?').bind(userId,packId),
      env.DB.prepare('SELECT miss_count,last_pack_id,completed_at FROM user_fur_first_pity WHERE user_id=?').bind(userId)
    ]),
    ownedFurRowsPromise||env.DB.prepare(`SELECT COUNT(DISTINCT uc.card_id) AS count
      FROM user_cards uc
      JOIN cards_effective_v1210 c ON c.id=uc.card_id
      JOIN members m ON m.id=c.member_id
      WHERE uc.user_id=? AND UPPER(c.rarity)='FUR' AND COALESCE(uc.quantity,0)>0
        AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`).bind(userId).first()
  ]);
  const [pityResult,furResult]=pityBatch;
  const pityRow=pityResult?.results?.[0]||null,furRow=furResult?.results?.[0]||null;
  const ownedCount=ownedFurRowsPromise
    ?new Set((ownedSource?.results||[]).map(row=>String(row.card_id))).size
    :Math.max(0,Number(ownedSource?.count||0));
  const completed=ownedCount>=FUR_FIRST_PITY_TARGET_COUNT;
  return {
    pityCount:PITY_PACKS.has(packId)?Math.max(0,Number(pityRow?.miss_count||0)):0,
    fur:{everOwned:ownedCount>0,ownedCount,targetCount:FUR_FIRST_PITY_TARGET_COUNT,completed,missCount:completed?0:Math.max(0,Number(furRow?.miss_count||0)),lastPackId:furRow?.last_pack_id||null}
  };
}
function furFirstRateForDraw(settings,missCount){
  const cfg=cleanFurFirstSettings(settings||{}),drawNo=Math.max(1,Math.floor(Number(missCount||0))+1);
  if(!cfg.enabled||drawNo<cfg.start)return {drawNo,rate:null,hard:false};
  if(drawNo>=cfg.hard)return {drawNo,rate:100,hard:true};
  const span=Math.max(1,cfg.hard-cfg.start-1),progress=Math.max(0,Math.min(1,(drawNo-cfg.start)/span));
  const rate=cfg.startRate+(cfg.maxSoftRate-cfg.startRate)*progress;
  return {drawNo,rate:Math.round(rate*1000)/1000,hard:false};
}
function normalGradeRatePercentFromContext(ctx,grade,criticalBonus=0){
  if(!drawGradeHasCandidate(ctx,grade))return 0;
  let rates=ctx.rateRows.filter(row=>ctx.allowed.includes(row.rarity)&&row.rarity!=='LIMITED'&&Number(row.rate)>0&&drawGradeHasCandidate(ctx,row.rarity));
  if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
  const total=rates.reduce((sum,row)=>sum+Math.max(0,Number(row.rate)||0),0);
  if(total<=0)return 0;
  return Math.max(0,Number(rates.find(row=>String(row.rarity).toUpperCase()===String(grade).toUpperCase())?.rate)||0)/total*100;
}
function drawOneWithPityAndFurFromContext(ctx,pack,ssrRate,furAssistRate,criticalBonus=0,allowLimited=true){
  const furPool=drawPoolFromContext(ctx,'FUR').filter(card=>!(ctx.knownFurIds instanceof Set)||!ctx.knownFurIds.has(String(card.id))),forceFur=furAssistRate!==null&&Number(furAssistRate)>=100;
  if(forceFur){
    const fur=drawMissingFurFromContext(ctx,pack);
    if(!fur)throw new Error('FUR 획득 보정 확정 회차지만 이 팩에서 획득 가능한 FUR 카드가 없습니다. CMS 카드 공개 상태와 팩 카드 구성을 확인하세요.');
    return fur;
  }
  if(allowLimited&&LIMITED_DRAW_PACKS.has(pack.id)&&ctx.limitedRate>0&&Math.random()*100<ctx.limitedRate){
    const limitedCard=weightedPick(ctx.limitedCards,row=>Number(row.draw_weight)||0);
    if(limitedCard)return limitedCard;
  }
  const excluded=new Set();
  if(furAssistRate!==null&&furPool.length){
    const baseRate=normalGradeRatePercentFromContext(ctx,'FUR',criticalBonus),targetRate=Math.max(baseRate,Math.max(0,Math.min(100,Number(furAssistRate)||0)));
    if(Math.random()*100<targetRate){
      const fur=drawMissingFurFromContext(ctx,pack);
      if(fur)return fur;
    }
    excluded.add('FUR');
  }
  const allowed=ctx.allowed.filter(rarity=>rarity!=='LIMITED'&&!excluded.has(rarity));
  if(ssrRate!==null&&allowed.includes('SSR')){
    if(Math.random()*100<ssrRate){const ssr=drawNormalFromContext(ctx,pack,'SSR');if(ssr)return ssr;}
    excluded.add('SSR');
  }
  let rates=ctx.rateRows.filter(row=>ctx.allowed.includes(row.rarity)&&row.rarity!=='LIMITED'&&!excluded.has(row.rarity)&&Number(row.rate)>0&&drawGradeHasCandidate(ctx,row.rarity));
  if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
  if(!rates.length)throw new Error('FUR 보정 및 SSR 천장 조건을 제외하고 추첨 가능한 일반 등급이 없습니다. 카드팩 확률 설정을 확인하세요.');
  for(let attempt=0;attempt<20;attempt++){
    const rarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const card=rarity&&drawNormalFromContext(ctx,pack,rarity);
    if(card)return card;
  }
  throw new Error('FUR 보정 카드 추첨 후보를 생성하지 못했습니다. 카드팩 구성과 공개 카드를 확인하세요.');
}
async function drawNormalCardByRarity(env,pack,rarity){const pool=randomDrawPool((await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND c.rarity=? AND c.draw_weight>0 AND c.limited_total IS NULL AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?) OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(rarity,pack.id,pack.id).all()).results);return weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1))||null;}
async function drawOneWithPity(env,pack,ssrRate,criticalBonus=0){
  if(LIMITED_DRAW_PACKS.has(pack.id)){
    const limitedRateRow=await env.DB.prepare("SELECT rate FROM card_pack_rates WHERE pack_id=? AND rarity='LIMITED'").bind(pack.id).first();
    const limitedRate=Math.max(0,Math.min(100,Number(limitedRateRow?.rate)||0));
    if(limitedRate>0&&Math.random()*100<limitedRate){const limitedCard=await drawLimitedCard(env);if(limitedCard)return limitedCard;}
  }
  const allowed=JSON.parse(pack.allowed_rarities).filter(r=>DRAW_RARITIES.includes(r)&&r!=='LIMITED');
  if(ssrRate!==null&&allowed.includes('SSR')){
    if(Math.random()*100<ssrRate){const ssr=await drawNormalCardByRarity(env,pack,'SSR');if(ssr)return ssr;}
    const others=allowed.filter(r=>r!=='SSR'),marks=others.map(()=>'?').join(',');
    let rates=(await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${marks}) AND rate>0`).bind(pack.id,...others).all()).results;
    if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
    for(let i=0;i<20;i++){const rarity=weightedPick(rates,r=>Number(r.rate)||0)?.rarity,card=rarity&&await drawNormalCardByRarity(env,pack,rarity);if(card)return card;}
  }
  return drawOne(env,pack,null,false,criticalBonus);
}
async function grantBattleCard(env,userId,settings){
  const configured=settings.cardDrop?.gradeRates||defaultBattleSettings().cardDrop.gradeRates;
  const available=(await env.DB.prepare(`SELECT c.rarity,COUNT(*) AS cnt FROM cards_effective_v1210 c WHERE c.is_active=1 AND c.card_status='PUBLIC' AND c.limited_total IS NULL AND c.rarity IN ('C','U','R','SR','HR','UR','SSR','MA','FUR') GROUP BY c.rarity`).all()).results;
  const availableSet=new Set(available.filter(x=>Number(x.cnt)>0).map(x=>x.rarity));
  const gradePool=Object.entries(configured).filter(([grade,rate])=>availableSet.has(grade)&&Number(rate)>0).map(([grade,rate])=>({grade,rate:Number(rate)}));
  const pickedGrade=weightedPick(gradePool,row=>row.rate)?.grade;if(!pickedGrade)return null;
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.card_status='PUBLIC' AND c.limited_total IS NULL AND c.rarity=?`).bind(pickedGrade).all()).results;
  if(!pool.length)return null;const card=pool[Math.floor(Math.random()*pool.length)];
  const previous=await env.DB.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').bind(userId,card.id).first(),isNew=!previous||Number(previous.quantity||0)<=0;
  await env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(userId,card.id).run();
  let shardGained=0,masterStarGained=0;if(!isNew){shardGained=SHARD_REWARD[card.grade]||0;if(shardGained>0){await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardGained,userId).run();const u=await env.DB.prepare('SELECT card_shards FROM users WHERE id=?').bind(userId).first();await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'PVE_DUPLICATE',?)").bind(userId,shardGained,u.card_shards,card.id).run();}if(String(card.grade||'').toUpperCase()==='MA'){masterStarGained=1;await env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,'MASTER_STAR',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+1,unseen_quantity=unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(userId).run();const star=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId).first();await env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',1,?,'MA_DUPLICATE','PVE',?)").bind(userId,Number(star?.quantity||0),String(card.id)).run();}}
  return {card,duplicate:!isNew,shardGained,masterStarGained};
}

let criticalSettingsCache=null;
async function criticalSettings(env){
  const now=Date.now();if(criticalSettingsCache&&criticalSettingsCache.expiresAt>now)return criticalSettingsCache.value;
  const keys=['critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects'];
  const rows=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const v=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
  const value={
    enabled:String(v.critical_enabled??'1')==='1',
    minTaps:Math.max(1,Math.min(30,Number(v.critical_min_taps||5)||5)),
    chance:Math.max(0,Math.min(100,Number(v.critical_chance||3)||3)),
    bonus:Math.max(0,Math.min(100,Number(v.critical_bonus||10)||10)),
    effects:String(v.critical_effects??'1')==='1'
  };
  criticalSettingsCache={value,expiresAt:now+30000};return value;
}
function applyCriticalRateBonus(rates,bonus){
  const boosted=new Set(['SR','HR','UR','SSR','MA','FUR']);
  return rates.map(row=>({...row,rate:Number(row.rate||0)*(boosted.has(row.rarity)?1+bonus/100:1)}));
}

let maintenanceSettingsCache=null;
async function maintenanceSettings(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&maintenanceSettingsCache&&maintenanceSettingsCache.expiresAt>now)return maintenanceSettingsCache.value;
  const keys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users'];
  try{
    const rows=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
    const values=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
    const value={
      active:String(values.maintenance_mode||'0')==='1',
      title:values.maintenance_title||'숲켓몬 서버 점검 중',
      message:values.maintenance_message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.',
      startAt:values.maintenance_start_at||'',
      endAt:values.maintenance_end_at||'',
      testUsers:String(values.maintenance_test_users||'').split(',').map(x=>x.trim()).filter(Boolean)
    };
    maintenanceSettingsCache={value,expiresAt:now+10000};
    return value;
  }catch(error){
    if(maintenanceSettingsCache?.value)return maintenanceSettingsCache.value;
    throw error;
  }
}
// V1784: 점검 게이트는 종전과 동일하게 "매 요청 D1 원본 읽기"를 유지한다(메모리 캐시 없음).
// 다만 같은 요청의 세션 조회와 하나의 env.DB.batch()로 묶어 왕복 횟수만 줄인다.
// 결과: 인증된 요청 1건당 D1 왕복 2회 → 1회. 점검 전환 지연(grace window)은 0 그대로.
const requestMaintenanceModeCache=new WeakMap();
function maintenanceModeStatement(env){return env.DB.prepare("SELECT value FROM app_meta WHERE key='maintenance_mode'")}
async function requestMaintenanceMode(request,env){
  if(requestMaintenanceModeCache.has(request))return requestMaintenanceModeCache.get(request);
  const promise=(async()=>{
    const raw=bearerToken(request);
    // 토큰이 없거나 이미 세션을 읽은 요청이면 묶을 대상이 없으므로 단건 조회.
    if(raw&&!requestAuthenticationCache.has(request)&&!requestSessionRowCache.has(request)){
      try{
        const tokenHash=await hash(raw);
        const [modeResult,sessionResult]=await env.DB.batch([
          maintenanceModeStatement(env),
          env.DB.prepare(SESSION_LOOKUP_SQL).bind(tokenHash)
        ]);
        primeSessionRow(request,tokenHash,(sessionResult?.results||[])[0]||null);
        return String((modeResult?.results||[])[0]?.value||'0');
      }catch(error){
        // 배치가 실패하면 세션은 프라이밍하지 않고(=authenticate가 스스로 조회) 단건 조회로 되돌린다.
        console.warn('maintenance/session batch failed, falling back to single read',error);
      }
    }
    const row=await maintenanceModeStatement(env).first();
    return String(row?.value||'0');
  })().catch(error=>{requestMaintenanceModeCache.delete(request);throw error});
  requestMaintenanceModeCache.set(request,promise);
  return promise;
}
async function maintenanceGateSettings(env,request=null){
  const mode=request
    ?await requestMaintenanceMode(request,env)
    :String((await maintenanceModeStatement(env).first())?.value||'0');
  if(mode!=='1')return{active:false,title:'',message:'',startAt:'',endAt:'',testUsers:[]};
  return maintenanceSettings(env,{fresh:true});
}
function isAdminRole(user){return Boolean(user&&['OWNER','ADMIN'].includes(user.role))}
function canMaintenanceBypass(user,maintenance){return Boolean(isAdminRole(user)||(user&&maintenance?.testUsers?.includes(user.nickname)))}

async function requirePermission(request,env,permission){
  const user=await authenticate(request,env);
  if(!user||!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(user.role)) return null;
  if(user.role==='OWNER') return user;
  if(user.role==='ADMIN'){
    const access=await adminPermissionProfile(env,user);
    return !access.restricted||access.permissions.includes(permission)?user:null;
  }
  const row=await env.DB.prepare('SELECT is_allowed FROM admin_permissions WHERE admin_user_id=? AND permission_key=?').bind(user.id,permission).first();
  return row?.is_allowed?user:null;
}

async function adminPermissionProfile(env,user){
  if(!user||String(user.role||'').toUpperCase()!=='ADMIN')return {restricted:false,permissions:[]};
  const rows=await env.DB.prepare('SELECT permission_key,is_allowed FROM admin_permissions WHERE admin_user_id=? ORDER BY permission_key').bind(user.id).all();
  const configured=Array.isArray(rows.results)&&rows.results.length>0;
  return {restricted:configured,permissions:configured?rows.results.filter(row=>Number(row.is_allowed)===1).map(row=>String(row.permission_key)):[]};
}

function restrictedAdminPathAllowed(path,access){
  if(!access?.restricted)return true;
  if(path==='admin/dashboard')return true;
  if((access.permissions.includes('COUPON_ISSUE')||access.permissions.includes('COUPON_MANAGE'))&&['admin/coupons','admin/coupons-v2','admin/coupon-create-permanent-v3'].includes(path))return true;
  if(access.permissions.includes('COIN_PREDICTION_MANAGE')&&String(path).startsWith('admin/coin-prediction/'))return true;
  return false;
}

async function releaseDeletedCouponCode(env,code,adminId){
  const deleted=await env.DB.prepare('SELECT id,code,deleted_at FROM coupons WHERE code=? LIMIT 1').bind(code).first();
  if(!deleted||!deleted.deleted_at)return {released:false};
  const archivedCode=`__DELETED_${Number(deleted.id)}_${Date.now()}_${code}`;
  const result=await env.DB.prepare('UPDATE coupons SET code=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NOT NULL AND code=?').bind(archivedCode,deleted.id,code).run();
  if(Number(result?.meta?.changes||0)!==1)throw new Error('DELETED_COUPON_CODE_RELEASE_FAILED');
  await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
    .bind(adminId,'COUPON_CODE_RELEASE','COUPON',deleted.id,JSON.stringify({code,deletedAt:deleted.deleted_at}),JSON.stringify({archivedCode,reusableCode:code})).run();
  return {released:true,archivedCode};
}

const SERIALIZED_GAME_ACTIONS=new Set([
  // Receipt-managed draw/shop routes already serialize their writes in atomic D1
  // batches. A second lock only adds writes and rejects safe idempotent retries.
  'attendance/claim','card/breakthrough','card/breakthrough/auto','battle/fight','tower/fight','raid/open','raid/claim','raid/join','raid/leave',
  'pvp/match','pvp/fight','pvp/reward/claim','pvp/rank-reward/claim','messages/claim','coupon/redeem',
  'wago-daily-quest/claim','high-grade-reroll/execute','mineral-exchange/request','chief/activate','workshop/craft','workshop/synthesis','scrapyard/run'
]);
const SERIALIZED_GAME_PREFIXES=['evolution/','rift/','territory-war/','siege/','seal-battle/','captain/','magic/','inventory/','wago-daily-quest/','auction/','idle-dungeon/'];
let userMutationLockReadyPromise=null;
let breakthroughAutoReceiptReadyPromise=null;
async function ensureBreakthroughAutoReceipts(env){
  if(!breakthroughAutoReceiptReadyPromise)breakthroughAutoReceiptReadyPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS breakthrough_auto_receipts_v1616(
      request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,card_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
      response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_breakthrough_auto_receipts_user ON breakthrough_auto_receipts_v1616(user_id,created_at DESC)')
  ]).then(()=>true).catch(error=>{breakthroughAutoReceiptReadyPromise=null;throw error});
  return breakthroughAutoReceiptReadyPromise;
}
function serializedGameAction(path,method){
  if(String(method).toUpperCase()!=='POST'||String(path).startsWith('admin/'))return false;
  return SERIALIZED_GAME_ACTIONS.has(path)||SERIALIZED_GAME_PREFIXES.some(prefix=>String(path).startsWith(prefix));
}
async function ensureUserMutationLock(env){
  if(!userMutationLockReadyPromise)userMutationLockReadyPromise=env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_mutation_locks_v1520(
    user_id INTEGER PRIMARY KEY,token TEXT NOT NULL,action_path TEXT NOT NULL,lease_until_ms INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run().then(()=>true).catch(error=>{userMutationLockReadyPromise=null;throw error});
  return userMutationLockReadyPromise;
}
function userMutationLeaseMs(actionPath){
  const fastBattleAction=['battle/fight','tower/fight','pvp/match','pvp/fight'].includes(actionPath);
  return actionPath.startsWith('raid/')?20000:(fastBattleAction?8000:60000);
}
// V1784: USER_LOCK Durable Object 바인딩이 있으면 D1을 전혀 건드리지 않는다.
// D1(SQLite)은 단일 라이터라 전투 1회마다 발생하던 락 INSERT + DELETE 두 번의 쓰기가
// 모든 유저의 쓰기 큐에 직렬로 쌓여, 동시접속 수에 비례해 지연이 커진다.
// 바인딩이 없으면 기존 D1 경로로 그대로 동작한다(무설정 하위호환).
async function durableUserLock(env,userId,action,body){
  const namespace=env.USER_LOCK;
  if(!namespace)return null;
  try{
    const stub=namespace.get(namespace.idFromName(`user:${userId}`));
    const response=await stub.fetch(`https://user-lock/${action}`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    });
    if(!response.ok)return null;
    return await response.json();
  }catch(error){
    console.warn('USER_LOCK durable object unavailable, falling back to D1',error);
    return null;
  }
}
async function acquireUserMutationLock(env,userId,path){
  const token=crypto.randomUUID(),actionPath=String(path).slice(0,100),leaseMs=userMutationLeaseMs(String(path));
  const durable=await durableUserLock(env,userId,'acquire',{token,actionPath,leaseMs});
  if(durable)return durable.acquired?{userId,token,durable:true}:null;
  await ensureUserMutationLock(env);
  const now=Date.now(),leaseUntil=now+leaseMs;
  const result=await env.DB.prepare(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,
    lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=?`)
    .bind(userId,token,actionPath,leaseUntil,now).run();
  return Number(result?.meta?.changes||0)===1?{userId,token}:null;
}
async function releaseUserMutationLock(env,lock){
  if(!lock)return;
  if(lock.durable){await durableUserLock(env,lock.userId,'release',{token:lock.token});return}
  await env.DB.prepare('DELETE FROM user_mutation_locks_v1520 WHERE user_id=? AND token=?').bind(lock.userId,lock.token).run();
}

async function handleRequest(context){
  const {request,env}=context;
  // V1785: 응답에 필요 없는 쓰기를 응답 지연 경로에서 빼기 위한 헬퍼.
  // waitUntil 로 넘긴 작업은 응답 반환 이후에도 끝까지 실행된다.
  const deferWrite=(label,work)=>{
    const task=Promise.resolve().then(work).catch(error=>console.error(`deferred write failed: ${label}`,error));
    if(typeof context.waitUntil==='function')context.waitUntil(task);
    return task;
  };
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'');
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS_HEADERS});
  try{
    if(!env.DB) return json({error:'현재 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.'},503);

    // 시작 화면 상태 확인은 대장전·진화 등 하위 라우터보다 먼저 처리한다.
    // 로그인 전 요청이 불필요한 시스템 핸들러를 거치며 지연되지 않도록 한다.
    if(path==='service/status'){
      const maintenance=await maintenanceGateSettings(env,request);
      // 정상 운영 중에는 세션 인증까지 수행하지 않는다. 시작 화면은 점검 여부만 필요하며,
      // 이 경로를 무인증 1회 조회로 유지해 동시 접속 폭주가 sessions/users 조회로 번지는 것을 막는다.
      if(!maintenance.active)return json({maintenance,bypass:false,role:null,user:null,lightweight:true});
      const user=await authenticate(request,env);
      return json({maintenance,bypass:canMaintenanceBypass(user,maintenance),role:user?.role||null,user:user?{id:user.id,nickname:user.nickname,role:user.role}:null,lightweight:true});
    }

    if(path==='health') return json({ok:true,version:'2.8.3',database:true,initialized:await initialized(env)});

    if(path.startsWith('admin/storage-cleanup')){
      const cleanupResponse=await handleStorageCleanup({request,env,path,requirePermission,writeAdminLog,readBody,json});
      if(cleanupResponse)return cleanupResponse;
    }

    if(path==='setup/status') return json({initialized:await initialized(env),tables:await tableExists(env,'users')});
    if(path==='setup/init'&&request.method==='POST'){
      if(await initialized(env)) return json({error:'이미 초기화가 완료된 데이터베이스입니다.'},409);
      const payload=await readBody(request);
      if(!env.SETUP_KEY) return json({error:'Cloudflare 환경 변수 SETUP_KEY를 먼저 설정하세요.'},503);
      if((payload.setupKey||'')!==env.SETUP_KEY) return json({error:'설치 암호가 올바르지 않습니다.'},403);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'최고 관리자 닉네임을 입력하세요.'},400);
      await runSchema(env);
      await ensureUpgrades(env);
      await seedDatabase(env);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      const result=await env.DB.prepare("INSERT INTO users(nickname,private_key_hash,coin,role,status) VALUES(?,?,100000,'OWNER','ACTIVE')").bind(nickname,privateKeyHash).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('initialized','1',CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('version','2.0.0',CURRENT_TIMESTAMP)").run();
      const token=await makeSession(env,result.meta.last_row_id);
      return json({ok:true,privateKey,token,nickname,cards:CARDS.length,members:MEMBERS.length,packs:PACKS.length},201);
    }

    if(!await initialized(env)) return json({error:'데이터베이스 초기화가 필요합니다. /setup/에서 설치를 완료하세요.'},503);
    // V1470: maintenance is a hard server gate. Read D1 fresh before any player route,
    // migration, cached summary, or mutation can run. Per-isolate memory caches must
    // never create a grace window after the operator enables maintenance.
    const maintenanceExemptEarly=path.startsWith('admin/')||path==='auth/login'||path==='auth/logout'||path==='service/status'||path==='health'||path.startsWith('setup/');
    if(!maintenanceExemptEarly){
      const maintenance=await maintenanceGateSettings(env,request);
      if(maintenance.active){
        const current=await authenticate(request,env);
        if(!canMaintenanceBypass(current,maintenance))return json({error:'현재 서버 점검 중입니다.',code:'MAINTENANCE',maintenance},503);
      }
    }
    scheduleBoundedStorageMaintenance(context,env,`${request.method}:${path}:${request.headers.get('cf-ray')||request.headers.get('x-request-id')||Math.floor(Date.now()/60000)}`);
    // Startup/session endpoints do not read the effective card view. Do not make
    // their cold response wait on a schema marker that only card routes need.
    const prestigeStorageDeferred=path==='auth/login'||path==='auth/logout'||path==='me/summary'||path==='user/runtime-command'||path==='burning-event/status';
    if(prestigeStorageDeferred)context.waitUntil(ensurePrestigeCardStorage(env).catch(error=>console.error('prestige storage background check failed',error)));
    else await ensurePrestigeCardStorage(env);

    // 관리자 로그인은 일반 유저 profile() 생성과 런타임 업그레이드에 의존하지 않는다.
    // OWNER 계정의 카드/로그 데이터가 많아도 인증 자체가 지연되지 않도록 최소 정보만 반환한다.
    if(path==='admin/auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const normalizedKey=String(payload.privateKey||'').trim().toUpperCase();
      if(!normalizedKey)return json({error:'관리자 개인키를 입력하세요.'},400);
      const privateKeyHash=await hash(normalizedKey);
      const admin=await env.DB.prepare("SELECT id,nickname,role,status,banned_until,ban_reason,last_login_at FROM users WHERE private_key_hash=?").bind(privateKeyHash).first();
      if(!admin)return json({error:'개인키가 올바르지 않습니다.'},401);
      const role=String(admin.role||'').trim().toUpperCase();
      if(!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(role))return json({error:'관리자 권한이 없는 계정입니다.'},403);
      if(admin.status!=='ACTIVE'||(admin.banned_until&&new Date(String(admin.banned_until).replace(' ','T')+'Z')>new Date())){
        return json({error:`이용이 정지된 계정입니다.${admin.ban_reason?' 사유: '+admin.ban_reason:''}`},403);
      }
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(admin.id).run();
      const token=await makeSession(env,admin.id);
      const access=await adminPermissionProfile(env,{...admin,role});
      return json({token,user:{id:admin.id,nickname:admin.nickname,role},admin:{id:admin.id,nickname:admin.nickname,role,last_login_at:new Date().toISOString(),restrictedPermissions:access.restricted,permissions:access.permissions}});
    }

    if(path.startsWith('admin/')){
      const operator=await authenticate(request,env);
      if(!operator)return json({error:'관리자 로그인이 필요합니다.'},401);
      const access=await adminPermissionProfile(env,operator);
      if(!restrictedAdminPathAllowed(path,access))return json({error:'이 계정은 승부예측 및 쿠폰 발급만 사용할 수 있습니다.',code:'ADMIN_PERMISSION_RESTRICTED'},403);
    }

    if(path==='me/summary'){
      const user=await authenticate(request,env);
      if(!user)return json({error:'로그인이 필요합니다.'},401);
      const masterStarRow=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first();
      return json({user:{id:user.id,nickname:user.nickname,coin:Number(user.coin||0),cardShards:Number(user.card_shards||0),magicCrystals:Number(user.magic_crystals||0),masterStars:Number(masterStarRow?.quantity||0),role:user.role}});
    }

    if(path==='me/collection'&&request.method==='GET'){
      const user=await authenticate(request,env);
      if(!user)return json({error:'로그인이 필요합니다.'},401);
      const owned=await env.DB.prepare(`SELECT uc.card_id,uc.quantity,uc.breakthrough_level
        FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id
        WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0
          AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')`).bind(user.id).all();
      return json({collection:{profileScope:'COLLECTION_FULL',
        owned:owned.results.map(row=>String(row.card_id)),
        quantities:Object.fromEntries(owned.results.map(row=>[String(row.card_id),Number(row.quantity||0)])),
        breakthroughs:Object.fromEntries(owned.results.map(row=>[String(row.card_id),Number(row.breakthrough_level||0)]))
      },serverNow:new Date().toISOString()});
    }


    if(path==='shell/summary'&&request.method==='GET'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      // 이 경로는 전역 업그레이드 게이트보다 먼저 처리되므로 신규 인덱스를 선행 보장한다.
      await ensureD1HotpathIndexes(env);
      const includeFeeds=url.searchParams.get('feeds')==='1';
      const [inventory,messages,highGrade,equipment]=await Promise.all([
        env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN ui.quantity>0 THEN ui.quantity ELSE 0 END),0) AS totalQuantity,COALESCE(SUM(CASE WHEN ui.quantity>0 THEN 1 ELSE 0 END),0) AS ownedTypes,COALESCE(SUM(CASE WHEN ui.unseen_quantity>0 THEN ui.unseen_quantity ELSE 0 END),0) AS unseenTotal FROM cnine_user_inventory ui JOIN inventory_items i ON i.code=ui.item_code WHERE ui.user_id=? AND i.is_active=1 AND ((i.category<>'REROLL' AND i.code NOT IN ('GUARANTEED_LIMITED_PACK','GUARANTEED_MA_PACK')) OR ui.quantity>0)`).bind(user.id).first(),
        env.DB.prepare('SELECT COUNT(*) AS unread FROM user_messages WHERE user_id=? AND hidden_at IS NULL AND is_read=0').bind(user.id).first(),
        includeFeeds?recentHighGradeItems(env):Promise.resolve([]),includeFeeds?recentMythicEquipmentItems(env):Promise.resolve([])
      ]);
      return json({inventory:{totalQuantity:Number(inventory?.totalQuantity||0),ownedTypes:Number(inventory?.ownedTypes||0),unseenTotal:Number(inventory?.unseenTotal||0)},messages:{unread:Number(messages?.unread||0)},highGradeItems:highGrade,equipmentItems:equipment,serverNow:new Date().toISOString()});
    }
    const couponSchemaPath=path==='coupon/redeem'||path==='admin/verified-coupon-send'||path==='admin/coupon-create-permanent-v3'||path==='admin/coupons'||path==='admin/coupons-v2';
    if(couponSchemaPath)await ensureCouponPermanentRewardUpgrade(env);
    // raid/status는 화면의 반복 조회 경로다. 매 조회마다 전체 런타임 마이그레이션 게이트를 기다리면
    // 다른 기능의 미완료 업그레이드나 D1 잠금 때문에 레이드 화면까지 함께 타임아웃될 수 있다.
    // 레이드 스키마는 기존 안전 업그레이드에서 설치되므로 상태 조회에서는 경량 인덱스 확인만 수행한다.
    const vehicleDrawPath=path==='vehicle-draw/config'||path==='vehicle-draw/open'||path==='vehicle-draw/purchase'||path==='admin/vehicle-draw/settings'||path==='admin/vehicle-draw/grant';
    const equipmentDrawPath=path==='equipment/supply-box/config'||path==='equipment/supply-box/open'||path==='equipment/supply-box/purchase';
    // High-traffic routes must never wait for the legacy all-schema runtime gate.
    // Route-local guards below still validate the small set of tables they mutate.
    // Full migrations belong to deployment/setup, not the player request path.
    const hotPathWithoutGlobalUpgrade=(path==='cards'&&request.method==='GET')
      ||(path==='packs'&&request.method==='GET')
      ||path==='burning-event/status'
      ||path==='draw/status'
      ||path==='draw/ack'
      ||(path==='draw'&&request.method==='POST');
    if(path==='raid/status')await Promise.all([ensureD1HotpathIndexes(env),ensureD1StabilityIndexes(env)]);
    // 이동수단 뽑기 조회/저장은 전용 라우터가 필요한 소형 스키마만 확인한다.
    // 전역 런타임 업그레이드와 장비 전체 foundation을 중복 실행하면 CMS 설정 조회가 타임아웃될 수 있다.
    else if(vehicleDrawPath||equipmentDrawPath||hotPathWithoutGlobalUpgrade){ /* route-local lightweight ensure */ }
    else context.waitUntil(Promise.all([
      ensureRuntimeUpgrades(env).catch(error=>console.error('runtime upgrade background check failed',error)),
      ensureD1StabilityIndexes(env).catch(error=>console.error('D1 stability index upgrade failed',error))
    ]));

    // Maintenance was already checked against a fresh D1 value before route work.

    // 하위 시스템 라우터도 업그레이드 확인과 점검 차단을 통과한 뒤 실행한다.
    // 대장전·진화 요청이 점검 모드를 우회하거나 준비되지 않은 DB 구조를 먼저 참조하지 않도록 한다.
    const evolutionResponse=await handleEvolution({path,request,env,deps:{authenticate,readBody,json,isAdminRole,profile,shardReward:SHARD_REWARD}});if(evolutionResponse)return evolutionResponse;
    const captainResponse=await handleCaptain({path,request,env,deps:{authenticate,readBody,json,isAdminRole,pvpDeckSnapshot,battleSettings,cardBattlePower,cardUniqueDeckState,cardUniqueDeckStates,cardUniqueSettings,grantWeeklyPremiumCube,userEquipmentBonuses,grantEquipmentDrop,rollBlackMiracleDrop,publicEquippedTitleMap}});if(captainResponse)return captainResponse;
    const blackMiracleAdminResponse=await handleBlackMiracleAdmin({path,request,env,deps:{authenticate,readBody,json}});if(blackMiracleAdminResponse)return blackMiracleAdminResponse;
    const sealBattleResponse=await handleSealBattle({path,request,env,deps:{authenticate,readBody,json,requirePermission,writeAdminLog,raidDeckPower,columnExists,resolveUniqueBattleRuntime,selectActivatedUltimate,uniqueBattleResponsePayload}});if(sealBattleResponse)return sealBattleResponse;
    const battleV2PreviewResponse=await handleBattleV2Preview({path,request,env,deps:{authenticate,json,pvpDeckSnapshot,battleSettings,cardBattlePower,cardUniqueDeckStates,userEquipmentBonuses,magicBattleLoadout}});if(battleV2PreviewResponse)return battleV2PreviewResponse;

    const magicResponse=await handleMagic({path,request,env,deps:{authenticate,readBody,json,profile,writeAdminLog}});if(magicResponse)return magicResponse;
    const vehicleDrawResponse=await handleVehicleDraw({path,request,env,deps:{authenticate,readBody,json,ensureEquipmentFoundation}});if(vehicleDrawResponse)return vehicleDrawResponse;
    const equipmentResponse=await handleEquipment({path,request,env,deps:{authenticate,readBody,json,writeAdminLog}});if(equipmentResponse)return equipmentResponse;
    const rerollResponse=await handleHighGradeReroll({path,request,env,deps:{authenticate,readBody,json,requirePermission,writeAdminLog}});if(rerollResponse)return rerollResponse;
    const coinPredictionResponse=await handleCoinPrediction({path,request,env,deps:{authenticate,readBody,json,isAdminRole,requirePermission,writeAdminLog}});if(coinPredictionResponse)return coinPredictionResponse;
    const dropPoolResponse=await handleDropPool({path,request,env,deps:{authenticate,readBody,json,isAdminRole,writeAdminLog}});if(dropPoolResponse)return dropPoolResponse;
    const workshopResponse=await handleWorkshop({path,request,env,deps:{authenticate,readBody,json,isAdminRole,writeAdminLog}});if(workshopResponse)return workshopResponse;
    const scrapyardResponse=await handleScrapyard({path,request,env,deps:{authenticate,readBody,json,isAdminRole,writeAdminLog,raidDeckPower,resolveUnifiedDrops,resolveUniqueBattleRuntime,uniqueBattleResponsePayload}});if(scrapyardResponse)return scrapyardResponse;
    const auctionResponse=await handleAuction({path,request,env,deps:{authenticate,readBody,json,isAdminRole,writeAdminLog}});if(auctionResponse)return auctionResponse;
    const territoryWarResponse=await handleTerritoryWar({path,request,env,deps:{authenticate,readBody,json,isAdminRole,writeAdminLog,pvpDeckSnapshot,pvpDeckSnapshotByIds,battleSettings,cardBattlePower,createPvpBattleV2,userEquipmentBonuses,cardUniqueDeckStates,evaluateDeckSynergies,evaluateDeckSynergiesBatch,magicBattleLoadout,magicBattleLoadouts}});if(territoryWarResponse)return territoryWarResponse;
    const siegeResponse=await handleSiege({path,request,env,deps:{authenticate,readBody,json,isAdminRole,pveDeckSnapshot,battleSettings,cardBattlePower,createPveBattleV2,userEquipmentBonuses}});if(siegeResponse)return siegeResponse;
    const chiefResponse=await handleChief({path,request,env,deps:{authenticate,readBody,json,requirePermission,writeAdminLog}});if(chiefResponse)return chiefResponse;
    const idleDungeonResponse=await handleIdleDungeon({path,request,env,deps:{authenticate,readBody,json,isAdminRole,raidDeckPower}});if(idleDungeonResponse)return idleDungeonResponse;

    if(path==='user/runtime-command'){
      const user=await authenticate(request,env);
      if(!user)return json({error:'로그인이 필요합니다.'},401);
      if(request.method==='GET'){
        const [commandResult,messageResult]=await env.DB.batch([
          env.DB.prepare(`SELECT id,command_type,payload_json,created_at,expires_at FROM user_runtime_commands WHERE user_id=? AND expires_at>datetime('now') ORDER BY id DESC LIMIT 1`).bind(user.id),
          env.DB.prepare('SELECT COUNT(*) AS unread FROM user_messages WHERE user_id=? AND hidden_at IS NULL AND is_read=0').bind(user.id)
        ]);
        const row=commandResult?.results?.[0]||null,unreadMessages=Number(messageResult?.results?.[0]?.unread||0);
        if(!row)return json({command:null,unreadMessages,serverNow:new Date().toISOString()});
        let payload={};try{payload=JSON.parse(row.payload_json||'{}')}catch{}
        return json({command:{id:Number(row.id),type:String(row.command_type||''),payload,createdAt:row.created_at,expiresAt:row.expires_at},unreadMessages,serverNow:new Date().toISOString()});
      }
      if(request.method==='POST'){
        const body=await readBody(request),commandId=Math.floor(Number(body.commandId||0));
        if(commandId>0)await env.DB.prepare(`UPDATE user_runtime_commands SET acknowledged_at=COALESCE(acknowledged_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?`).bind(commandId,user.id).run();
        return json({ok:true});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }

    if(path==='auth/register'&&request.method==='POST'){
      const payload=await readBody(request);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'닉네임을 입력하세요.'},400);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      const ipHash=await requestIpHash(request,env);
      const existingIp=await env.DB.prepare('SELECT user_id FROM account_ip_registrations WHERE ip_hash=?').bind(ipHash).first();
      const ipException=await env.DB.prepare("SELECT ip_hash FROM account_ip_exceptions WHERE ip_hash=? AND (expires_at IS NULL OR expires_at>datetime('now'))").bind(ipHash).first();
      if(existingIp&&!ipException)return json({error:'해당 네트워크에서는 이미 숲켓몬 계정이 생성되었습니다. 계정 복구가 필요한 경우 관리자에게 문의해 주세요.',code:'IP_ACCOUNT_LIMIT'},409);
      try{
        const coinSetting=await env.DB.prepare("SELECT value FROM app_meta WHERE key='new_user_coin'").first();
        const newUserCoin=Math.max(0,Number(coinSetting?.value||5000)||5000);
        const result=await env.DB.prepare('INSERT INTO users(nickname,private_key_hash,coin) VALUES(?,?,?)').bind(nickname,privateKeyHash,newUserCoin).run();
        await env.DB.prepare('INSERT INTO account_ip_registrations(user_id,ip_hash) VALUES(?,?)').bind(result.meta.last_row_id,ipHash).run();
        const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(result.meta.last_row_id).first();
        return json({token:await makeSession(env,user.id,payload.clientId||request.headers.get('x-cnine-client-id')),privateKey,user:await profile(env,user)},201);
      }catch(error){return json({error:String(error?.message||'').includes('account_ip')?'해당 네트워크에서는 이미 계정이 생성되었습니다.':'이미 사용 중인 닉네임입니다.'},409)}
    }
    if(path==='auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const privateKeyHash=await hash((payload.privateKey||'').trim().toUpperCase());
      const user=await env.DB.prepare("SELECT * FROM users WHERE private_key_hash=?").bind(privateKeyHash).first();
      if(!user) return json({error:'개인키가 올바르지 않습니다.'},401);
      if(user.status!=='ACTIVE'||(user.banned_until&&new Date(user.banned_until+'Z')>new Date())) return json({error:`이용이 정지된 계정입니다.${user.ban_reason?' 사유: '+user.ban_reason:''}`},403);
      const currentMaintenance=await maintenanceGateSettings(env);
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
      return json({token:await makeSession(env,user.id,payload.clientId||request.headers.get('x-cnine-client-id')),user:await profile(env,user),maintenance:currentMaintenance.active&&!canMaintenanceBypass(user,currentMaintenance)?currentMaintenance:null,bypass:canMaintenanceBypass(user,currentMaintenance)});
    }
    if(path==='auth/logout'&&request.method==='POST'){
      const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
      if(raw){
        const tokenHash=await hash(raw);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
      }
      return json({ok:true});
    }
    if(path==='me'){
      const user=await authenticate(request,env);
      return user?json({user:await profile(env,user)}):json({error:'로그인이 필요합니다.'},401);
    }
    if(path==='hall-of-fame'&&request.method==='GET'){
      const rows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('hall_of_fame_enabled','hall_of_fame_title','hall_of_fame_name')").all(),values=Object.fromEntries((rows.results||[]).map(row=>[row.key,row.value]));
      return json({enabled:String(values.hall_of_fame_enabled??'1')!=='0',title:String(values.hall_of_fame_title||'숲카라 명예의 전당').slice(0,40),name:String(values.hall_of_fame_name||'🏆 남수단 🏆').slice(0,80)});
    }
    if(path==='cards'){
      const viewer=await authenticate(request,env);
      const uniqueCfg=await cardUniqueSettings(env),uniqueVisible=Boolean(viewer&&uniqueCfg.userDetailEnabled!==false&&cardUniqueVisibleTo(viewer,uniqueCfg));
      const [baseRows,extraRows,uniqueRows]=await Promise.all([
        publicCardCatalogRows(env),
        viewer?inactiveOwnedCardRows(env,viewer.id):Promise.resolve([]),
        uniqueVisible?activeUniqueAbilityRows(env):Promise.resolve([])
      ]);
      const merged=new Map();for(const row of [...baseRows,...extraRows])merged.set(String(row.id),row);
      const rows=[...merged.values()].sort((a,b)=>Number(a.memberSortOrder||0)-Number(b.memberSortOrder||0)||String(a.id).localeCompare(String(b.id)));
      const uniqueMap=new Map(uniqueRows.map(row=>[String(row.card_id),{attackPercent:Number(row.attack_percent||0),defensePercent:Number(row.defense_percent||0),hpPercent:Number(row.hp_percent||0),speedPercent:Number(row.speed_percent||0),effectName:String(row.effect_name||''),effectDescription:String(row.effect_description||''),effectType:String(row.effect_type||'NONE'),triggerType:String(row.trigger_type||'PASSIVE'),effectValue:Number(row.effect_value||0),triggerChance:Number(row.trigger_chance??100),maxActivations:Number(row.max_activations||1),scopes:{pve:row.scope_pve!==0,pvp:row.scope_pvp!==0,captain:row.scope_captain!==0}}]));
      return json({cards:rows.map(({memberSortOrder,...card})=>({...card,id:String(card.id),uniqueAbility:uniqueVisible?(uniqueMap.has(String(card.id))?{...uniqueMap.get(String(card.id)),ownerTest:uniqueCfg.enabled!==true}:null):null})),uniqueAbilitySystem:{enabled:uniqueCfg.enabled===true,ownerTest:uniqueVisible&&uniqueCfg.enabled!==true,visible:uniqueVisible}});
    }
    if(path==='packs'){
      const [rows,burning]=await Promise.all([activePackCatalogRows(env),burningEventSettings(env)]);
      return json({packs:rows.map(row=>{const originalPrice=Number(row.price||0);return {...row,price:originalPrice,originalPrice,burningDiscountPercent:0,allowed:JSON.parse(row.allowed_rarities)}}),burningEvent:burningPublicState(burning)});
    }
    if(path==='inventory'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await env.DB.prepare("UPDATE inventory_items SET name='미스틱 에너지',subtitle='MYSTIC ENERGY',description='미스틱 장비 제작에 투입되는 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.',category='MATERIAL',rarity='MYTHIC',image_url='assets/items/starlight-armor-core-v1749.png',is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='STARLIGHT_ARMOR_CORE'").run();
      const rows=await env.DB.prepare(`SELECT i.code,i.name,i.subtitle,i.description,i.category,i.rarity,i.image_url AS image,COALESCE(ui.quantity,0) AS quantity,COALESCE(ui.unseen_quantity,0) AS unseenQuantity,
          CASE WHEN i.category='MATERIAL' OR i.code IN ('VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE') THEN 0 WHEN i.code='BLACK_MIRACLE_PACK' THEN COALESCE((SELECT json_extract(value,'$.enabled') FROM app_meta WHERE key='black_miracle_pack_settings_v1485'),1) ELSE 1 END AS usable
        FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=?
        WHERE i.is_active=1 AND ((i.category<>'REROLL' AND i.code NOT IN ('GUARANTEED_LIMITED_PACK','GUARANTEED_MA_PACK')) OR COALESCE(ui.quantity,0)>0)
        ORDER BY i.sort_order,i.code`).bind(user.id).all();
      const items=rows.results.map(x=>({...x,quantity:Number(x.quantity||0),unseenQuantity:Number(x.unseenQuantity||0),usable:Number(x.usable)!==0,useDisabledMessage:x.category==='MATERIAL'?'재료 전용 · 사용 불가':['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE'].includes(x.code)?'제작소 전용':x.code==='BLACK_MIRACLE_PACK'&&Number(x.usable)===0?'CMS에서 사용 중지됨':''}));
      return json({items,totalQuantity:items.reduce((n,x)=>n+x.quantity,0),ownedTypes:items.filter(x=>x.quantity>0).length,unseenTotal:items.reduce((n,x)=>n+x.unseenQuantity,0)});
    }
    if(path==='inventory/seen'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await env.DB.prepare('UPDATE cnine_user_inventory SET unseen_quantity=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND unseen_quantity>0').bind(user.id).run();
      return json({ok:true});
    }
    if(path==='inventory/use'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),itemCode=String(body.itemCode||'').trim().toUpperCase(),requestId=String(body.requestId||crypto.randomUUID()).trim().slice(0,100);
      if(itemCode==='BLACK_MIRACLE_PACK'){try{return json({...await openBlackMiraclePack(env,{userId:user.id,requestId}),user:await profile(env,await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first())})}catch(error){return json({error:String(error?.message||'블랙 미라클 팩 개봉에 실패했습니다.')},409)}}
      const usableCodes=[...CUBE_CODES,'GUARANTEED_LIMITED_PACK','GUARANTEED_MA_PACK',...RETIREMENT_REROLL_CODES];
      if(!usableCodes.includes(itemCode))return json({error:'현재 사용할 수 없는 인벤토리 아이템입니다.'},400);
      const prior=await env.DB.prepare('SELECT status,response_json FROM inventory_use_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(prior?.status==='COMPLETED'&&prior.response_json){try{return json(JSON.parse(prior.response_json))}catch{}}
      if(prior)return json({error:prior.status==='PENDING'?'같은 아이템 사용 요청을 처리 중입니다.':'이 요청은 이미 실패했습니다. 인벤토리를 새로고침한 뒤 다시 시도하세요.'},409);
      const receipt=await env.DB.prepare("INSERT OR IGNORE INTO inventory_use_receipts(request_id,user_id,item_code,status) VALUES(?,?,?,'PENDING')").bind(requestId,user.id,itemCode).run();
      if(!receipt.meta.changes)return json({error:'같은 아이템 사용 요청을 처리 중입니다.'},409);
      let consumed=false,reservedLimited=false,card=null,limitedAuditEvent=null;
      try{
        const used=await env.DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=MIN(unseen_quantity,quantity-1),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>0').bind(user.id,itemCode).run();
        if(!used.meta.changes)throw new Error('보유한 아이템이 없습니다.');
        consumed=true;
        const fixedGradeByItem={GUARANTEED_MA_PACK:'MA',GUARANTEED_LIMITED_PACK:'LIMITED',MA_REROLL_TICKET:'MA',LIMITED_REROLL_TICKET:'LIMITED',PRESTIGE_REROLL_TICKET:'PRESTIGE',FUR_REROLL_TICKET:'FUR'};
        const fixedGrade=fixedGradeByItem[itemCode]||null,isReroll=RETIREMENT_REROLL_CODES.includes(itemCode),cubeConfig=await cubeSettings(env),configured=fixedGrade?{[fixedGrade]:100}:cubeConfig[itemCode];
        const available=[];
        for(const [grade,rate] of Object.entries(configured||{})){if(Number(rate)<=0)continue;const row=await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM cards_effective_v1210 WHERE is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' AND rarity=? AND (limited_total IS NULL OR issued_count<limited_total)`).bind(grade).first();if(Number(row?.cnt||0)>0)available.push({grade,rate:Number(rate)});}
        const targetGrade=weightedPick(available,x=>x.rate)?.grade;
        if(!targetGrade)throw new Error(isReroll?'이 재뽑기권으로 획득 가능한 활성 카드가 없습니다. CMS 카드 공개 상태를 확인하세요.':'이 큐브에서 획득 가능한 카드가 없습니다. CMS의 등급 확률과 카드 공개 상태를 확인하세요.');
        card=await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type AS powerType,c.base_power AS basePower,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,m.name
          FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.rarity=? AND (c.limited_total IS NULL OR c.issued_count<c.limited_total) ORDER BY RANDOM() LIMIT 1`).bind(targetGrade).first();
        if(!card)throw new Error(`${targetGrade} 등급의 획득 가능한 카드가 없습니다. CMS 카드 공개 상태와 잔여 수량을 확인하세요.`);
        if(card.limitedTotal!==null&&card.limitedTotal!==undefined){
          const stockBefore=Math.max(0,Number(card.issuedCount||0));
          const reserved=await env.DB.prepare("UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' AND issued_count<limited_total").bind(card.id).run();
          if(!reserved.meta.changes)throw new Error('선택된 한정판 카드의 잔여 수량이 방금 소진되었습니다. 다시 시도하세요.');
          reservedLimited=true;
          limitedAuditEvent={eventKey:`inventory:${requestId}:${card.id}`,stockBefore,stockAfter:stockBefore+1};
        }
        const owned=await env.DB.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').bind(user.id,card.id).first(),duplicate=Number(owned?.quantity||0)>0,shardGained=duplicate?Number(SHARD_REWARD[card.grade]||0):0,masterStarGained=duplicate&&['MA','LIMITED'].includes(String(card.grade||'').toUpperCase())?1:0,masterStarBefore=masterStarGained?Number((await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first())?.quantity||0):0;
        if(limitedAuditEvent){
          limitedAuditEvent.quantityBefore=Math.max(0,Number(owned?.quantity||0));
          await beginLimitedAcquisitionAudit(env,{eventKey:limitedAuditEvent.eventKey,requestId,drawGroupId:requestId,sourceType:'INVENTORY',sourceId:itemCode,userId:user.id,userNickname:user.nickname,cardId:card.id,cardTitle:card.title,packId:itemCode,status:'STOCK_RESERVED',coinCost:0,stockBefore:limitedAuditEvent.stockBefore,stockAfter:limitedAuditEvent.stockAfter,quantityBefore:limitedAuditEvent.quantityBefore,isDuplicate:duplicate,stockReserved:true,cardGranted:false});
        }
        const remaining=(await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,itemCode).first())?.quantity||0,useReason=isReroll?'CARD_RETIREMENT_REROLL_USE':'CUBE_OPEN';
        const statements=[
          env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(?,?,1,0) ON CONFLICT(user_id,card_id) DO UPDATE SET breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN 0 ELSE user_cards.breakthrough_level END,quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,card.id),
          env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,-1,?,?,'INVENTORY_USE',?)").bind(user.id,itemCode,Number(remaining),useReason,requestId)
        ];
        if(String(card.grade||'').toUpperCase()==='LIMITED')statements.push(env.DB.prepare("INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?, 'LIMITED',0,?)").bind(requestId,user.id,itemCode,card.id,duplicate?0:1));
        if(shardGained>0)statements.push(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardGained,user.id));
        if(masterStarGained){
          statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,'MASTER_STAR',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+1,unseen_quantity=unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id));
          statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',1,?,?,'INVENTORY_USE',?)").bind(user.id,masterStarBefore+1,String(card.grade||'').toUpperCase()==='LIMITED'?'LIMITED_DUPLICATE':'MA_DUPLICATE',requestId));
        }
        await env.DB.batch(statements);
        const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(shardGained>0)await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,?,?)").bind(user.id,shardGained,updated.card_shards,isReroll?'INVENTORY_REROLL_DUPLICATE':'INVENTORY_CUBE_DUPLICATE',card.id).run();
        const responseCard=cardWithAcquisitionEffect(card,await cardAcquisitionEffectsByGrade(env));
        const response={ok:true,itemCode,isReroll,remaining:Number(remaining),card:responseCard,duplicate,shardGained,masterStarGained,user:await profile(env,updated),requestId};
        await env.DB.prepare("UPDATE inventory_use_receipts SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(JSON.stringify(response),requestId,user.id).run();
        if(limitedAuditEvent)await finishLimitedAcquisitionAudit(env,limitedAuditEvent.eventKey,{status:'COMPLETED',stockAfter:limitedAuditEvent.stockAfter,quantityAfter:limitedAuditEvent.quantityBefore+1,isDuplicate:duplicate,stockReserved:true,cardGranted:true});
        recentHighGradeCache=null;
        return json(response);
      }catch(error){
        if(consumed){await env.DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=?').bind(user.id,itemCode).run();}
        if(reservedLimited&&card?.id)await env.DB.prepare('UPDATE cards SET issued_count=CASE WHEN issued_count>0 THEN issued_count-1 ELSE 0 END WHERE id=?').bind(card.id).run();
        const message=String(error?.message||'아이템 사용에 실패했습니다.').slice(0,300);
        if(limitedAuditEvent)await finishLimitedAcquisitionAudit(env,limitedAuditEvent.eventKey,{status:'FAILED_ROLLED_BACK',stockAfter:limitedAuditEvent.stockBefore,quantityAfter:limitedAuditEvent.quantityBefore,stockReserved:false,cardGranted:false,errorMessage:message});
        await env.DB.prepare("UPDATE inventory_use_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(message,requestId,user.id).run();
        return json({error:message},409);
      }
    }
    if(path==='attendance/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const cfg=await attendanceSettings(env);if(!cfg.enabled)return json({error:'현재 출석체크가 중지되어 있습니다.'},503);
      const date=kstDate(),last=await env.DB.prepare('SELECT attendance_date,COALESCE(streak_day,1) AS streak_day FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first();
      const streak=last?.attendance_date===previousKstDate(date)?(Number(last.streak_day||1)%7)+1:1,reward=Number(cfg.rewards[streak-1]||0);
      try{await env.DB.prepare('INSERT INTO attendance_logs(user_id,attendance_date,reward_coin,streak_day) VALUES(?,?,?,?)').bind(user.id,date,reward,streak).run()}
      catch{return json({error:'오늘 접속 보상을 이미 받았습니다.'},409)}
      await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'ATTENDANCE')").bind(user.id,reward,updated.coin).run();
      await grantHighGradeRerollDrop(env,{userId:user.id,content:'ATTENDANCE',referenceId:date});
      return json({reward,streak,user:await profile(env,updated)});
    }
    if(path==='draw/status'&&request.method==='GET'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const requestId=String(url.searchParams.get('requestId')||'').trim().slice(0,100);
      if(!requestId)return json({error:'카드 개봉 요청번호가 필요합니다.'},400);
      await ensureDrawReceiptV2(env);
      const row=await env.DB.prepare('SELECT status,error_message,created_at,updated_at FROM draw_request_receipts_v2 WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(!row)return json({requestId,status:'NOT_FOUND'});
      let status=String(row.status||'PENDING').toUpperCase();
      if(status==='PENDING'){
        const updatedAtMs=Date.parse(String(row.updated_at||'').replace(' ','T')+'Z');
        if(Number.isFinite(updatedAtMs)&&Date.now()-updatedAtMs>=600000)status='RETRYABLE';
      }
      return json({requestId,status,error:String(row.error_message||''),createdAt:row.created_at||null,updatedAt:row.updated_at||null});
    }
    if(path==='draw/ack'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,100);
      if(!requestId)return json({error:'카드 개봉 요청번호가 필요합니다.'},400);
      await ensureDrawReceiptV2(env);
      const result=await env.DB.prepare(`UPDATE draw_request_receipts_v2
        SET status='ARCHIVED',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE request_id=? AND user_id=? AND status='COMPLETED'`).bind(requestId,user.id).run();
      if(Number(result?.meta?.changes||0)>0)return json({ok:true,requestId,status:'ARCHIVED'});
      const row=await env.DB.prepare('SELECT status FROM draw_request_receipts_v2 WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(!row)return json({ok:true,requestId,status:'NOT_FOUND'});
      const status=String(row.status||'').toUpperCase();
      if(status==='ARCHIVED')return json({ok:true,requestId,status});
      return json({ok:false,requestId,status,error:'아직 결과 확인 처리할 수 없는 카드 개봉 요청입니다.'},409);
    }
    if(path==='draw'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const requestOrigin=String(request.headers.get('origin')||'');
      const fetchSite=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
      if((requestOrigin&&requestOrigin!==new URL(request.url).origin)||fetchSite==='cross-site'){
        return json({error:'외부 사이트에서는 뽑기를 실행할 수 없습니다.',code:'DRAW_EXTERNAL_REQUEST_BLOCKED'},403);
      }
      const browserId=String(request.headers.get('x-cnine-draw-client')||'').trim();
      if(!/^[a-zA-Z0-9_-]{16,100}$/.test(browserId)){
        return json({error:'정상 게임 화면에서 다시 시도해주세요.',code:'DRAW_CLIENT_REQUIRED'},403);
      }
      const payload=await readBody(request);
      const requestId=String(payload.requestId||crypto.randomUUID()).trim().slice(0,100);
      const count=[1,20,100].includes(Number(payload.count))?Number(payload.count):1;
      const acknowledgedRequestIds=payload.autoDraw===true&&Array.isArray(payload.acknowledgedRequestIds)
        ?[...new Set(payload.acknowledgedRequestIds.map(value=>String(value||'').trim().slice(0,100)).filter(value=>value&&value!==requestId))].slice(0,10)
        :[];
      await ensureDrawReceiptV2(env);
      await Promise.all([ensureFurFirstPityV1291(env),ensureDrawBrowserLease(env)]);let drawReceiptTable='draw_request_receipts_v2';
      // D1 용량 보호: 영수증에는 전체 유저 도감/설정 스냅샷을 저장하지 않는다.
      // 실제 응답은 그대로 반환하고, 중복 요청 시에는 최신 profile을 다시 붙여 반환한다.
      const compactDrawCard=card=>({id:String(card?.id||''),title:String(card?.title||''),grade:String(card?.grade||card?.rarity||'').toUpperCase()});
      const compactDrawReceipt=response=>{
        if(!response||typeof response!=='object')return response;
        const compact={...response};delete compact.user;delete compact.burningEvent;
        if(response.critical)compact.critical={
          eligible:response.critical.eligible===true,success:response.critical.success===true,
          bonus:Number(response.critical.bonus||0),chance:Number(response.critical.chance||0)
        };
        compact.results=Array.isArray(response.results)?response.results.map((item,index)=>({
          slot:Number(item?.slot??index),granted:item?.granted===true,grantVerified:item?.grantVerified===true,
          quantityBefore:Number(item?.quantityBefore||0),quantityAfter:Number(item?.quantityAfter||0),duplicate:Boolean(item?.duplicate),
          shardGained:Number(item?.shardGained||0),masterStarGained:Number(item?.masterStarGained||0),card:compactDrawCard(item?.card)
        })):[];
        return compact;
      };
      const hydrateDrawReceipt=async stored=>{
        if(!stored||typeof stored!=='object')return stored;
        const ids=[...new Set((stored.results||[]).map(item=>String(item?.card?.id||'')).filter(Boolean))];
        const [latestUser,cardRows,fxByGrade]=await Promise.all([
          env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),
          ids.length?env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type AS powerType,c.base_power AS basePower,m.name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE CAST(c.id AS TEXT) IN (SELECT CAST(value AS TEXT) FROM json_each(?))`).bind(JSON.stringify(ids)).all():Promise.resolve({results:[]}),
          cardAcquisitionEffectsByGrade(env)
        ]);
        if(!latestUser)return stored;
        const cardMap=new Map((cardRows.results||[]).map(card=>[String(card.id),cardWithAcquisitionEffect(card,fxByGrade)]));
        const results=(stored.results||[]).map(item=>({...item,card:{...(cardMap.get(String(item?.card?.id||''))||{}),...(item.card||{})}}));
        const rows=results.map(item=>({card_id:String(item?.card?.id||''),quantity:Number(item?.quantityAfter||0),breakthrough_level:0})).filter(row=>row.card_id&&row.quantity>0);
        return {...stored,results,user:drawResponseProfileFromRows(latestUser,rows,{quantity:Number(stored?.grantProof?.masterStarAfter||0)})};
      };
      const finalizeDrawPayload=draft=>{
        const proof=draft?.grantProof||{};
        if(String(proof.requestId||'')!==requestId||Number(proof.userId)!==Number(user.id))throw new Error('카드 지급 증명 정보가 현재 요청과 일치하지 않습니다.');
        const proofCards=Array.isArray(proof.cards)?proof.cards:[],cardIds=proofCards.map(row=>String(row?.cardId||'')).filter(Boolean);
        if(!cardIds.length||new Set(cardIds).size!==cardIds.length)throw new Error('카드 지급 증명에 중복되거나 비어 있는 카드가 있습니다.');
        const response={...draft};
        response.results=(response.results||[]).map(item=>({...item,granted:true,grantVerified:true}));
        response.drawProtocol={...(response.drawProtocol||{}),version:3,status:'COMPLETED',grantVerified:true,integrity:''};
        response.drawProtocol.integrity=drawIntegrityHash(drawIntegrityCanonical(response));
        return response;
      };
      const finalizeAppliedDraw=async draft=>{
        // APPLIED는 과거 버전에서 카드·재화와 함께 원자 batch로 저장된 상태다.
        // 이후 유저가 코인/조각을 사용했을 수 있으므로 현재 총잔액과 과거 스냅샷을 비교하지 않는다.
        const response=finalizeDrawPayload(draft);
        const completed=await env.DB.prepare(`UPDATE ${drawReceiptTable} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status IN ('APPLIED','COMPLETED')`).bind(JSON.stringify(compactDrawReceipt(response)),requestId,user.id).run();
        if(!completed.meta.changes)throw new Error('카드 지급 영수증 확정에 실패했습니다.');
        return hydrateDrawReceipt(response);
      };
      const reclaimStalePendingDraw=async priorUpdatedAt=>{
        // PENDING 상태에서는 카드·재화 batch가 아직 커밋되지 않았다. 다만 LIMITED 재고 선예약만 남을 수 있어 먼저 반환한다.
        const statements=[];
        if(await tableExists(env,'limited_acquisition_audit')){
          const auditRows=(await env.DB.prepare(`SELECT event_key,card_id FROM limited_acquisition_audit
            WHERE request_id=? AND stock_reserved=1 AND card_granted=0 AND status IN ('PENDING','STOCK_RESERVED')`).bind(requestId).all()).results||[];
          const reservedByCard=new Map();
          for(const row of auditRows){const cardId=String(row.card_id||'');if(cardId)reservedByCard.set(cardId,Number(reservedByCard.get(cardId)||0)+1)}
          for(const [cardId,reservedCount] of reservedByCard){
            statements.push(env.DB.prepare('UPDATE cards SET issued_count=MAX(0,issued_count-?) WHERE id=?').bind(reservedCount,cardId));
          }
          if(auditRows.length)statements.push(env.DB.prepare(`UPDATE limited_acquisition_audit SET status='FAILED_ROLLED_BACK',stock_reserved=0,card_granted=0,error_message='STALE_PENDING_RECOVERED',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP
            WHERE request_id=? AND stock_reserved=1 AND card_granted=0 AND status IN ('PENDING','STOCK_RESERVED')`).bind(requestId));
        }
        statements.push(env.DB.prepare(`UPDATE draw_request_receipts_v2 SET status='PENDING',response_json=NULL,error_message=NULL,pack_id=?,draw_count=?,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='PENDING' AND updated_at=?`).bind(String(payload.packId||''),count,requestId,user.id,priorUpdatedAt));
        const results=await env.DB.batch(statements),claimResult=results.at(-1);
        return Number(claimResult?.meta?.changes||0)===1;
      };
      let prior=await env.DB.prepare('SELECT status,response_json,error_message,updated_at FROM draw_request_receipts_v2 WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      const allowLegacyReceiptLookup=String(request.headers.get('x-cnine-draw-receipt')||'').toLowerCase()!=='v2';
      if(!prior&&allowLegacyReceiptLookup){
        const legacy=await env.DB.prepare('SELECT status,response_json,error_message,updated_at FROM draw_request_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
        if(legacy&&['COMPLETED','APPLIED','PENDING'].includes(String(legacy.status||''))){prior=legacy;drawReceiptTable='draw_request_receipts';}
      }
      if(prior?.status==='COMPLETED'&&prior.response_json){
        try{return json(await hydrateDrawReceipt(JSON.parse(prior.response_json)))}
        catch(error){return json({error:String(error?.message||'완료된 카드 개봉 결과를 불러오지 못했습니다.'),requestId,status:'COMPLETED'},503)}
      }
      if(prior?.status==='APPLIED'&&prior.response_json){
        try{return json(await finalizeAppliedDraw(JSON.parse(prior.response_json)))}catch(error){return json({error:String(error?.message||'이전 카드 지급 확정을 완료하지 못했습니다.'),requestId,status:'APPLIED'},503)}
      }
      if(prior?.status==='ARCHIVED')return json({error:'이미 지급·확인 완료된 이전 자동 뽑기 요청입니다.',code:'DRAW_RESULT_ARCHIVED',requestId,status:'ARCHIVED'},410);
      let receiptAlreadyClaimed=false;
      if(prior?.status==='RETRYABLE'&&drawReceiptTable==='draw_request_receipts_v2'){
        const retryClaim=await env.DB.prepare(`UPDATE draw_request_receipts_v2
          SET status='PENDING',response_json=NULL,error_message=NULL,pack_id=?,draw_count=?,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='RETRYABLE'`).bind(String(payload.packId||''),count,requestId,user.id).run();
        receiptAlreadyClaimed=Number(retryClaim?.meta?.changes||0)===1;
        if(!receiptAlreadyClaimed)return json({error:'카드 개봉 복구 요청을 다른 처리기가 확인 중입니다.',code:'DRAW_RECOVERY_BUSY',retryable:true,retryAfterMs:5000,requestId,status:'PENDING'},409);
      }
      if(prior?.status==='PENDING'){
        const updatedAtMs=Date.parse(String(prior.updated_at||'').replace(' ','T')+'Z'),stale=Number.isFinite(updatedAtMs)&&Date.now()-updatedAtMs>=600000;
        if(stale&&drawReceiptTable==='draw_request_receipts_v2')receiptAlreadyClaimed=await reclaimStalePendingDraw(prior.updated_at);
        if(!receiptAlreadyClaimed)return json({error:'같은 카드 개봉 요청을 처리 중입니다. 잠시만 기다려주세요.',code:'DRAW_PENDING',retryable:true,retryAfterMs:5000,requestId,status:'PENDING',updatedAt:prior.updated_at||null},409);
      }
      if(!receiptAlreadyClaimed){
        const lease=await claimDrawBrowserLease(env,user.id,browserId);
        if(!lease.allowed)return json({
          error:'이 계정은 다른 브라우저에서 뽑기를 실행 중입니다.',
          code:'DRAW_OTHER_BROWSER_ACTIVE',retryable:true,retryAfterMs:lease.retryAfterMs,requestId
        },409,{'Retry-After':String(Math.max(1,Math.ceil(lease.retryAfterMs/1000)))});
        if(!await claimDrawActiveLock(env,user.id,requestId))return json({
          error:'이 계정의 다른 뽑기 요청을 처리 중입니다.',
          code:'DRAW_ALREADY_IN_PROGRESS',retryable:true,retryAfterMs:1000,requestId
        },409,{'Retry-After':'1'});
      }
      drawReceiptTable='draw_request_receipts_v2';
      const claimed=receiptAlreadyClaimed?{meta:{changes:1}}:await env.DB.prepare(`INSERT OR IGNORE INTO ${drawReceiptTable}(request_id,user_id,pack_id,draw_count,status) VALUES(?,?,?,?,'PENDING')`).bind(requestId,user.id,String(payload.packId||''),count).run();
      if(!claimed.meta.changes){
        await env.DB.prepare('DELETE FROM draw_active_lock_v1480 WHERE user_id=? AND request_id=?').bind(user.id,requestId).run();
        const duplicate=await env.DB.prepare('SELECT status,response_json,error_message,updated_at FROM draw_request_receipts_v2 WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
        if(duplicate?.status==='COMPLETED'&&duplicate.response_json){
          try{return json(await hydrateDrawReceipt(JSON.parse(duplicate.response_json)))}
          catch(error){return json({error:String(error?.message||'완료된 카드 개봉 결과를 불러오지 못했습니다.'),requestId,status:'COMPLETED'},503)}
        }
        if(duplicate?.status==='FAILED')return json({error:String(duplicate.error_message||'이전 카드 개봉 요청이 실패했습니다.'),requestId,status:'FAILED'},409);
        if(duplicate?.status==='ARCHIVED')return json({error:'이미 지급·확인 완료된 이전 자동 뽑기 요청입니다.',code:'DRAW_RESULT_ARCHIVED',requestId,status:'ARCHIVED'},410);
        if(duplicate?.status==='RETRYABLE')return json({error:'카드 개봉 요청을 안전하게 다시 시도할 수 있습니다.',code:'D1_OVERLOADED',retryable:true,retryAfterMs:10000,requestId,status:'RETRYABLE',updatedAt:duplicate?.updated_at||null},503);
        return json({error:'같은 카드 개봉 요청을 처리 중입니다. 잠시만 기다려주세요.',code:'DRAW_PENDING',retryable:true,retryAfterMs:5000,requestId,status:String(duplicate?.status||'PENDING'),updatedAt:duplicate?.updated_at||null},409);
      }
      let grantsCommitted=false,cost=0,reservedCardIds=[],limitedAuditEvents=[];
      try{
        const [criticalConfig,burning,baseRows]=await Promise.all([
          criticalSettings(env),burningEventSettings(env),
          env.DB.batch([
            env.DB.prepare('SELECT * FROM card_packs WHERE id=? AND is_active=1').bind(payload.packId),
            env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id),
            env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id)
          ])
        ]);
        const pack=baseRows[0]?.results?.[0]||null,fresh=baseRows[1]?.results?.[0]||null,masterStarRow=baseRows[2]?.results?.[0]||null;
        const criticalEligible=criticalConfig.enabled===true;
        const critical=criticalEligible&&Math.random()*100<criticalConfig.chance;
        const criticalBonus=critical?criticalConfig.bonus:0;
        if(!pack){
          await env.DB.prepare(`UPDATE ${drawReceiptTable} SET status='FAILED',error_message='판매 중인 카드팩이 아닙니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(requestId,user.id).run();
          return json({error:'판매 중인 카드팩이 아닙니다.'},404);
        }
        if(!fresh)throw new Error('유저 정보를 확인하지 못했습니다.');
        cost=Number(pack.price||0)*count;
        if(Number(fresh.coin||0)<cost){
          await env.DB.prepare(`UPDATE ${drawReceiptTable} SET status='FAILED',cost=?,error_message='코인이 부족합니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cost,requestId,user.id).run();
          return json({error:'코인이 부족합니다.'},400);
        }

        const ownedFurRowsPromise=env.DB.prepare(`SELECT uc.card_id FROM user_cards uc
          JOIN cards_effective_v1210 c ON c.id=uc.card_id
          JOIN members m ON m.id=c.member_id
          WHERE uc.user_id=? AND UPPER(c.rarity)='FUR' AND COALESCE(uc.quantity,0)>0
            AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`).bind(user.id).all();
        const [baseDrawContext,livePitySettings,liveFurFirstSettings,userPityState,ownedFurRows]=await Promise.all([
          loadDrawContext(env,pack),
          pitySettings(env),
          furFirstSettings(env),
          drawUserPityState(env,user.id,pack.id,ownedFurRowsPromise),
          ownedFurRowsPromise
        ]);
        const ownedFurIdsAtStart=new Set((ownedFurRows?.results||[]).map(row=>String(row.card_id)));
        const drawContext={...baseDrawContext,knownFurIds:new Set(ownedFurIdsAtStart)};
        const pityCountStart=userPityState.pityCount,furFirstStateStart=userPityState.fur;
        const furFirstEligibleAtStart=FUR_FIRST_PITY_PACKS.has(pack.id)&&liveFurFirstSettings.enabled&&!furFirstStateStart.completed;
        const cards=[];let pityCount=pityCountStart,limitedDrawn=false,furFirstMissCount=furFirstStateStart.missCount,furFirstOwnedCount=Math.min(FUR_FIRST_PITY_TARGET_COUNT,ownedFurIdsAtStart.size),furFirstEligible=furFirstEligibleAtStart,furFirstCompleted=false;
        for(let index=0;index<count;index++){
          const pity=pityRateForDraw(livePitySettings,pack.id,pityCount);
          const furPity=furFirstEligible?furFirstRateForDraw(liveFurFirstSettings,furFirstMissCount):{drawNo:furFirstMissCount+1,rate:null,hard:false};
          const hundredBlockStart=Math.floor(index/10)*10;
          const hundredGuarantee=count===100&&index%10===9?pack.guarantee_10:null;
          const mustApplyHundredGuarantee=Boolean(hundredGuarantee&&!cards.slice(hundredBlockStart).some(existing=>ORDER[existing.grade]>=ORDER[hundredGuarantee]));
          const card=mustApplyHundredGuarantee
            ?drawOneFromContext(drawContext,pack,hundredGuarantee,!limitedDrawn,criticalBonus)
            :PITY_PACKS.has(pack.id)
              ?(furFirstEligible
                ?drawOneWithPityAndFurFromContext(drawContext,pack,pity.rate,furPity.rate,criticalBonus,!limitedDrawn)
                :drawOneWithPityFromContext(drawContext,pack,pity.rate,criticalBonus,!limitedDrawn))
              :drawOneFromContext(drawContext,pack,null,!limitedDrawn,criticalBonus);
          if(!card?.id)throw new Error('카드 추첨 결과를 생성하지 못했습니다.');
          cards.push(card);
          const drawnGrade=String(card.grade||'').toUpperCase();
          if(drawnGrade==='LIMITED')limitedDrawn=true;
          if(furFirstEligible){
            const furId=String(card.id);
            if(drawnGrade==='FUR'&&!drawContext.knownFurIds.has(furId)){
              drawContext.knownFurIds.add(furId);
              furFirstOwnedCount=Math.min(FUR_FIRST_PITY_TARGET_COUNT,drawContext.knownFurIds.size);
              furFirstCompleted=furFirstOwnedCount>=FUR_FIRST_PITY_TARGET_COUNT;
              furFirstEligible=!furFirstCompleted;furFirstMissCount=0;
            }
            else furFirstMissCount++;
          }
          pityCount=ORDER[card.grade]>=ORDER.SSR?0:pityCount+1;
        }
        const guarantee=count===20?pack.guarantee_20:null;
        if(guarantee&&!cards.some(card=>ORDER[card.grade]>=ORDER[guarantee])){
          cards[cards.length-1]=drawOneFromContext(drawContext,pack,guarantee,true,criticalBonus);
          if(PITY_PACKS.has(pack.id)&&ORDER[cards[cards.length-1].grade]>=ORDER.SSR)pityCount=0;
        }
        if(furFirstEligibleAtStart){
          const distinctFurIds=new Set(ownedFurIdsAtStart);
          furFirstMissCount=furFirstStateStart.missCount;
          furFirstCompleted=false;
          for(const drawnCard of cards){
            const drawnGrade=String(drawnCard?.grade||'').toUpperCase(),furId=String(drawnCard?.id||'');
            if(drawnGrade==='FUR'&&furId&&!distinctFurIds.has(furId)){
              distinctFurIds.add(furId);furFirstMissCount=0;
            }else furFirstMissCount++;
            if(distinctFurIds.size>=FUR_FIRST_PITY_TARGET_COUNT){furFirstCompleted=true;furFirstMissCount=0;break;}
          }
          furFirstOwnedCount=Math.min(FUR_FIRST_PITY_TARGET_COUNT,distinctFurIds.size);
          furFirstEligible=!furFirstCompleted;
        }

        const validateActiveCards=async selected=>{
          const ids=[...new Set(selected.map(card=>String(card?.id||'')).filter(Boolean))];
          if(!ids.length||selected.some(card=>!card?.id))throw new Error('카드 추첨 결과 검증에 실패했습니다. 다시 시도하세요.');
          const rows=(await env.DB.prepare(`SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
            WHERE CAST(c.id AS TEXT) IN (SELECT CAST(value AS TEXT) FROM json_each(?)) AND c.is_active=1
              AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`).bind(JSON.stringify(ids)).all()).results;
          const active=new Set((rows||[]).map(row=>String(row.id)));
          const inactive=ids.filter(id=>!active.has(id));
          if(inactive.length){
            drawContextCache.delete(String(pack.id));
            throw new Error('CMS에서 비활성화되거나 비공개된 카드가 추첨 후보에 포함되어 개봉을 중단했습니다. 다시 시도하세요.');
          }
          return ids;
        };
        // 최종 후보가 확정된 뒤 한 번만 활성 상태를 검증한다.
        cards.sort((a,b)=>ORDER[b.grade]-ORDER[a.grade]);
        const groupId=crypto.randomUUID();

        // LIMITED 예약 UPDATE를 한 D1 batch로 묶어 네트워크 왕복을 카드 수와 무관하게 유지한다.
        const limitedCandidates=[];
        for(let i=0;i<cards.length;i++)if(cards[i]?.limited_total!==null&&cards[i]?.limited_total!==undefined)limitedCandidates.push({drawIndex:i,card:cards[i],eventKey:`draw:${requestId}:${i}:${cards[i].id}`,stockBefore:Math.max(0,Number(cards[i].issued_count||0))});
        if(limitedCandidates.length){
          const reserveResults=await env.DB.batch(limitedCandidates.map(row=>env.DB.prepare("UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' AND issued_count<limited_total").bind(row.card.id)));
          const soldOutAudit=[];
          for(let n=0;n<limitedCandidates.length;n++){
            const row=limitedCandidates[n],reserved=Number(reserveResults[n]?.meta?.changes||0)===1;
            if(reserved){reservedCardIds.push(row.card.id);limitedAuditEvents.push({eventKey:row.eventKey,drawIndex:row.drawIndex,cardId:String(row.card.id),cardTitle:row.card.title,stockBefore:row.stockBefore,stockAfter:row.stockBefore+1});continue}
            const replacement=drawOneFromContext(drawContext,pack,null,false,criticalBonus);
            if(!replacement?.id)throw new Error('한정 카드 품절 대체 결과를 생성하지 못했습니다.');
            cards[row.drawIndex]=replacement;
            const pending=limitedAuditUpsertStatement(env,{eventKey:row.eventKey,requestId,sourceType:'PACK',sourceId:pack.id,userId:user.id,userNickname:user.nickname,cardId:row.card.id,cardTitle:row.card.title,packId:pack.id,status:'SOLD_OUT_REPLACED',coinCost:cost,stockBefore:row.stockBefore,stockAfter:row.stockBefore,stockReserved:false,cardGranted:false,errorMessage:'동시 요청으로 한정 수량이 소진되어 일반 카드로 대체됨'});
            soldOutAudit.push(pending.statement);
          }
          if(soldOutAudit.length)await env.DB.batch(soldOutAudit);
        }
        const uniqueIds=[...new Set(cards.map(card=>String(card.id)))];
        const uniqueIdsJson=JSON.stringify(uniqueIds);
        const [validationRows,acquisitionFxByGrade]=await Promise.all([
          env.DB.batch([
            env.DB.prepare(`SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
              WHERE CAST(c.id AS TEXT) IN (SELECT CAST(value AS TEXT) FROM json_each(?)) AND c.is_active=1
                AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`).bind(uniqueIdsJson),
            env.DB.prepare(`SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=? AND CAST(card_id AS TEXT) IN (SELECT CAST(value AS TEXT) FROM json_each(?))`).bind(user.id,uniqueIdsJson)
          ]),
          cardAcquisitionEffectsByGrade(env)
        ]);
        const activeIds=new Set((validationRows[0]?.results||[]).map(row=>String(row.id)));
        const inactiveIds=uniqueIds.filter(id=>!activeIds.has(id));
        if(inactiveIds.length){drawContextCache.delete(String(pack.id));throw new Error('CMS에서 비활성화되거나 비공개된 카드가 추첨 후보에 포함되어 개봉을 중단했습니다. 다시 시도하세요.');}
        const ownedSelectedRows={results:validationRows[1]?.results||[]};
        const beforeProfile=drawResponseProfileFromRows(fresh,ownedSelectedRows.results||[],masterStarRow);
        const ownedMap=new Map(Object.entries(beforeProfile.quantities||{}).map(([cardId,quantity])=>[String(cardId),Number(quantity||0)]));
        const masterStarBefore=Number(beforeProfile.masterStars||0);
        const statements=[];
        const results=[];
        let shardTotal=0,masterStarTotal=0;
        const expectedAfterByCard=new Map(),cardGrantCounts=new Map();

        for(let drawIndex=0;drawIndex<cards.length;drawIndex++){
          const card=cards[drawIndex],cardId=String(card.id);
          const quantityBefore=Number(ownedMap.get(cardId)||0),quantityAfter=quantityBefore+1,isNew=quantityBefore===0;
          const limitedEvent=limitedAuditEvents.find(x=>x.drawIndex===drawIndex&&x.cardId===cardId);
          if(limitedEvent){
            limitedEvent.quantityBefore=quantityBefore;
            limitedEvent.quantityAfter=quantityAfter;
            statements.push(limitedAuditUpsertStatement(env,{eventKey:limitedEvent.eventKey,requestId,drawGroupId:groupId,sourceType:'PACK',sourceId:pack.id,userId:user.id,userNickname:user.nickname,cardId,cardTitle:card.title,packId:pack.id,status:'COMPLETED',coinCost:cost,stockBefore:limitedEvent.stockBefore,stockAfter:limitedEvent.stockAfter,quantityBefore,quantityAfter,isDuplicate:!isNew,stockReserved:true,cardGranted:true}).statement);
          }
          ownedMap.set(cardId,quantityAfter);
          expectedAfterByCard.set(cardId,quantityAfter);
          const shardGained=isNew?0:Math.floor(Number(SHARD_REWARD[card.grade]||0));
          const masterStarGained=!isNew&&['MA','LIMITED'].includes(String(card.grade||'').toUpperCase())?1:0;
          shardTotal+=shardGained;
          masterStarTotal+=masterStarGained;
          cardGrantCounts.set(cardId,Number(cardGrantCounts.get(cardId)||0)+1);
          if(String(card.grade||'').toUpperCase()==='LIMITED')statements.push(env.DB.prepare('INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?,?,?,?)').bind(groupId,user.id,pack.id,card.id,'LIMITED',drawIndex===0?cost:0,isNew?1:0));
          results.push({slot:drawIndex,granted:false,grantVerified:false,quantityBefore,quantityAfter,card:cardWithAcquisitionEffect(card,acquisitionFxByGrade),duplicate:!isNew,shardGained,masterStarGained});
        }

        // 카드 지급은 카드 ID별로 합치고, 중복 조각 감사 로그는 묶음 개봉당 1행만 남긴다.
        // 20장 자동 뽑기에서 카드별 로그가 최대 20행씩 누적되던 구조를 제거해 D1 쓰기와 용량 증가를 제한한다.
        const grantRows=[...cardGrantCounts.entries()];
        if(grantRows.length){
          for(let offset=0;offset<grantRows.length;offset+=30){
            const chunk=grantRows.slice(offset,offset+30),placeholders=chunk.map(()=>'(?,?,?)').join(','),binds=[];
            for(const [cardId,grantCount] of chunk)binds.push(user.id,cardId,grantCount);
            statements.push(env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES ${placeholders}
              ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP`).bind(...binds));
          }
        }

        const duplicateMasterStarCount=results.filter(item=>item.duplicate&&['MA','LIMITED'].includes(String(item.card?.grade||'').toUpperCase())).length;
        if(masterStarTotal!==duplicateMasterStarCount||results.some(item=>item.duplicate&&['MA','LIMITED'].includes(String(item.card?.grade||'').toUpperCase())&&Number(item.masterStarGained)!==1)){
          throw new Error('MA·LIMITED 중복 마스터의 별 지급 계산이 일치하지 않아 개봉을 중단했습니다.');
        }

        const expectedCoin=Number(fresh.coin||0)-cost;
        const expectedShards=Number(fresh.card_shards||0)+shardTotal;
        const expectedMasterStars=masterStarBefore+masterStarTotal;
        const nextProfile=JSON.parse(JSON.stringify(beforeProfile));
        nextProfile.coin=expectedCoin;
        nextProfile.cardShards=expectedShards;
        nextProfile.owned=[...new Set([...(nextProfile.owned||[]).map(String),...uniqueIds])];
        nextProfile.quantities={...(nextProfile.quantities||{})};
        for(const result of results){
          const cardId=String(result.card.id);
          nextProfile.quantities[cardId]=Number(result.quantityAfter);
        }

        const grantProof={
          version:1,requestId,userId:Number(user.id),packId:String(pack.id),count:Number(count),
          coinBefore:Number(fresh.coin||0),coinAfter:expectedCoin,
          shardsBefore:Number(fresh.card_shards||0),shardsAfter:expectedShards,
          masterStarBefore,masterStarAfter:expectedMasterStars,
          cards:[...expectedAfterByCard.entries()].map(([cardId,quantityAfter])=>({cardId,quantityAfter:Number(quantityAfter)}))
        };
        const draftResponse={
          results,user:nextProfile,
          pity:PITY_PACKS.has(pack.id)?{packId:pack.id,missCount:pityCount,nextDraw:pityCount+1}:null,
          furFirstAssist:FUR_FIRST_PITY_PACKS.has(pack.id)?{sharedAcrossPacks:true,eligibleAtStart:furFirstEligibleAtStart,completed:furFirstCompleted||furFirstStateStart.completed,ownedCount:furFirstOwnedCount,targetCount:FUR_FIRST_PITY_TARGET_COUNT,missCount:furFirstMissCount,nextDraw:furFirstMissCount+1,start:liveFurFirstSettings.start,hard:liveFurFirstSettings.hard}:null,
          critical:{eligible:criticalEligible,success:critical,bonus:criticalBonus,automatic:true,chance:criticalConfig.chance,effects:criticalConfig.effects},
          requestId,grantProof,burningEvent:burningPublicState(burning),
          drawProtocol:{version:3,status:'APPLIED',grantVerified:false,packId:String(pack.id),count:Number(count),integrity:''}
        };

        statements.unshift(env.DB.prepare('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?').bind(cost,user.id,cost));
        if(PITY_PACKS.has(pack.id))statements.unshift(env.DB.prepare(`INSERT INTO user_pack_pity(user_id,pack_id,miss_count,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(user_id,pack_id) DO UPDATE SET miss_count=excluded.miss_count,updated_at=CURRENT_TIMESTAMP`).bind(user.id,pack.id,Math.max(0,Math.floor(pityCount))));
        if(furFirstEligibleAtStart){
          if(furFirstCompleted)statements.unshift(env.DB.prepare(`INSERT INTO user_fur_first_pity(user_id,miss_count,last_pack_id,completed_at,created_at,updated_at)
            VALUES(?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET miss_count=0,last_pack_id=excluded.last_pack_id,completed_at=COALESCE(user_fur_first_pity.completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP`).bind(user.id,pack.id));
          else statements.unshift(env.DB.prepare(`INSERT INTO user_fur_first_pity(user_id,miss_count,last_pack_id,created_at,updated_at)
            VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET miss_count=excluded.miss_count,last_pack_id=excluded.last_pack_id,completed_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(user.id,Math.max(0,Math.floor(furFirstMissCount)),pack.id));
        }
        if(shardTotal>0)statements.unshift(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardTotal,user.id));
        if(masterStarTotal>0){
          statements.unshift(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
            VALUES(?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
              unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,masterStarTotal,masterStarTotal));
          statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',?,?,'HIGH_GRADE_DUPLICATE','PACK_DRAW',?)").bind(user.id,masterStarTotal,expectedMasterStars,groupId));
        }
        if(shardTotal>0)statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'DUPLICATE',NULL)").bind(user.id,shardTotal,expectedShards));
        statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PACK_DRAW')").bind(user.id,-cost,expectedCoin));
        const response=finalizeDrawPayload(draftResponse);
        // 자동 뽑기에서 이미 화면 표시가 끝난 이전 영수증 10개는 결과 JSON만 비워 장기 용량 증가를 제한한다.
        // 다음 뽑기가 성공적으로 커밋될 때만 함께 정리하므로 현재 지급 복구 가능성은 유지된다.
        if(acknowledgedRequestIds.length){
          // request_id is the receipt PK. Force that lookup so acknowledging at
          // most ten prior results never scans every receipt for this user/status.
          statements.push(env.DB.prepare(`UPDATE draw_request_receipts_v2 INDEXED BY sqlite_autoindex_draw_request_receipts_v2_1
            SET status='ARCHIVED',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP
            WHERE request_id IN (${acknowledgedRequestIds.map(()=>'?').join(',')}) AND user_id=? AND status='COMPLETED'`).bind(...acknowledgedRequestIds,user.id));
        }
        // 카드·코인·조각·영수증 COMPLETED를 같은 D1 batch에 넣어 APPLIED/PENDING 고착 구간을 제거한다.
        statements.push(env.DB.prepare(`UPDATE ${drawReceiptTable} SET status='COMPLETED',cost=?,response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cost,JSON.stringify(compactDrawReceipt(response)),requestId,user.id));

        await env.DB.batch(statements);
        grantsCommitted=true;

        // LIMITED 감사 성공 기록도 위 원자 batch에 포함되어 별도 완료 UPDATE 왕복이 없다.
        recentHighGradeCache=null;
        scheduleDrawReceiptCleanup(context,env,requestId);
        return json(response);
      }catch(error){
        const transient=isTransientD1Error(error);
        const rawMessage=String(error?.message||'카드 지급 검증에 실패했습니다. 코인과 카드 지급은 처리되지 않았습니다.').slice(0,300);
        const message=transient?'D1_BUSY_RETRYABLE':rawMessage;

        // 응답 직전에 일시 오류가 난 경우 이미 원자 batch가 완료됐을 수 있으므로 영수증을 먼저 확인한다.
        if(transient&&!grantsCommitted){
          try{
            const completedRow=await env.DB.prepare(`SELECT status,response_json FROM ${drawReceiptTable} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
            if(completedRow?.status==='COMPLETED'&&completedRow.response_json)return json(await hydrateDrawReceipt(JSON.parse(completedRow.response_json)));
          }catch(checkError){console.warn('draw transient completion check failed',checkError)}
        }

        if(!grantsCommitted){
          let rollbackOk=true;
          try{
            const rollbackStatements=[];
            const rollbackCounts=new Map();for(const cardId of reservedCardIds)rollbackCounts.set(String(cardId),Number(rollbackCounts.get(String(cardId))||0)+1);
            for(const [cardId,amount] of rollbackCounts)rollbackStatements.push(env.DB.prepare('UPDATE cards SET issued_count=MAX(0,issued_count-?) WHERE id=?').bind(amount,cardId));
            for(const event of limitedAuditEvents)rollbackStatements.push(limitedAuditFinishStatement(env,event.eventKey,{status:'FAILED_ROLLED_BACK',stockAfter:event.stockBefore,quantityAfter:event.quantityBefore,stockReserved:false,cardGranted:false,errorMessage:message}));
            if(rollbackStatements.length)await env.DB.batch(rollbackStatements);
          }catch(rollbackError){rollbackOk=false;console.error('limited draw rollback batch failed',rollbackError)}
          if(transient){
            let retryStatus=rollbackOk?'RETRYABLE':'PENDING';
            try{
              const marked=await env.DB.prepare(`UPDATE ${drawReceiptTable}
                SET status=?,cost=?,response_json=NULL,error_message=?,updated_at=CURRENT_TIMESTAMP
                WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(retryStatus,cost,message,requestId,user.id).run();
              if(!marked?.meta?.changes){
                const row=await env.DB.prepare(`SELECT status,response_json FROM ${drawReceiptTable} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
                if(row?.status==='COMPLETED'&&row.response_json)return json(await hydrateDrawReceipt(JSON.parse(row.response_json)));
                retryStatus=String(row?.status||retryStatus);
              }
            }catch(markError){retryStatus='PENDING';console.error('draw retryable receipt mark failed',markError)}
            return json({
              error:'카드 지급 서버가 일시적으로 혼잡합니다. 결제 요청 번호를 유지한 채 자동으로 다시 확인합니다.',
              code:'D1_OVERLOADED',retryable:true,retryAfterMs:15000,requestId,status:retryStatus
            },503);
          }
          await env.DB.prepare(`UPDATE ${drawReceiptTable} SET status='FAILED',cost=?,response_json=NULL,error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cost,message,requestId,user.id).run();
        }else{
          try{if(limitedAuditEvents.length)await env.DB.batch(limitedAuditEvents.map(event=>limitedAuditFinishStatement(env,event.eventKey,{status:'COMPLETED_WITH_WARNING',stockAfter:event.stockAfter,quantityAfter:event.quantityAfter,stockReserved:true,cardGranted:true,errorMessage:message})))}catch(auditError){console.error('limited draw completion warning audit batch failed',auditError)}
        }
        throw error;
      }
    }

    if(path==='card/breakthrough/auto'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request),cardId=String(payload.cardId||'').trim(),requestId=String(payload.requestId||'').trim(),maxAttempts=Math.max(1,Math.min(50,Math.floor(Number(payload.maxAttempts)||50)));
      if(!cardId)return json({error:'강화할 카드를 선택하세요.'},400);
      if(!/^[A-Za-z0-9_-]{8,120}$/.test(requestId))return json({error:'자동 강화 요청 번호가 올바르지 않습니다.'},400);
      await ensureBreakthroughAutoReceipts(env);
      await env.DB.prepare("INSERT OR IGNORE INTO breakthrough_auto_receipts_v1616(request_id,user_id,card_id,status) VALUES(?,?,?,'PENDING')").bind(requestId,user.id,cardId).run();
      const receipt=await env.DB.prepare('SELECT user_id AS userId,card_id AS cardId,status,response_json AS responseJson FROM breakthrough_auto_receipts_v1616 WHERE request_id=?').bind(requestId).first();
      if(Number(receipt?.userId)!==Number(user.id)||String(receipt?.cardId)!==cardId)return json({error:'이미 다른 자동 강화 요청에 사용된 요청 번호입니다.'},409);
      if(receipt?.status==='COMPLETED'){
        if(!receipt.responseJson)return json({error:'완료된 자동 강화 결과를 불러오지 못했습니다.',code:'BREAKTHROUGH_AUTO_RECEIPT_CORRUPT'},500);
        try{return json(JSON.parse(receipt.responseJson))}catch{return json({error:'완료된 자동 강화 결과 형식이 올바르지 않습니다.',code:'BREAKTHROUGH_AUTO_RECEIPT_CORRUPT'},500)}
      }
      if(receipt?.status==='FAILED')return json({error:'이 자동 강화 요청은 안전하게 취소되었습니다. 카드 상태를 새로고침한 뒤 다시 시도해 주세요.',code:'BREAKTHROUGH_AUTO_FAILED',retryable:false},409);
      const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,COALESCE(uc.breakthrough_fail_count,0) AS breakthrough_fail_count,c.rarity,c.title FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();
      if(!owned)return json({error:'보유한 카드만 강화할 수 있습니다.'},404);
      const grade=String(owned.rarity||'').trim().toUpperCase();
      if((ORDER[grade]||0)<BREAKTHROUGH_MIN_ORDER)return json({error:'SR 등급 이상 카드만 강화할 수 있습니다.'},400);
      const [config,pity,high,balances]=await Promise.all([
        breakthroughConfig(env),breakthroughPity(env),
        grade==='LIMITED'?limitedMasterStarBreakthroughConfig(env):grade==='MA'?maMasterStarBreakthroughConfig(env):Promise.resolve(null),
        env.DB.prepare("SELECT u.card_shards AS cardShards,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=u.id AND item_code='MASTER_STAR'),0) AS masterStars FROM users u WHERE u.id=?").bind(user.id).first()
      ]);
      const initial={level:Math.max(0,Number(owned.breakthrough_level||0)),failCount:Math.max(0,Number(owned.breakthrough_fail_count||0)),shards:Math.max(0,Number(balances?.cardShards||0)),stars:Math.max(0,Number(balances?.masterStars||0))};
      let level=initial.level,failCount=initial.failCount,shards=initial.shards,stars=initial.stars,attempts=0,successes=0,failures=0,shardSpent=0,starSpent=0,highestSuccessLevel=0,stopReason='CHUNK_LIMIT',stopMessage='다음 자동 강화 묶음을 준비합니다.';
      const maxLevel=['MA','LIMITED'].includes(grade)?13:10;
      while(attempts<maxAttempts){
        if(level>=maxLevel){stopReason='MAX_LEVEL';stopMessage='최대 강화 단계에 도달했습니다.';break}
        const highStep=['MA','LIMITED'].includes(grade)&&level>=10;
        const masterStarStep=grade==='ZENITH'||highStep;
        if(highStep&&high?.enabled!==true){stopReason='HIGH_ENHANCEMENT_DISABLED';stopMessage=`${grade} 고급 강화가 현재 중지되어 있습니다.`;break}
        const rule=highStep?high?.steps?.[level-10]:config?.[grade]?.[level];
        if(!rule){stopReason='RULE_MISSING';stopMessage='현재 단계의 강화 설정을 찾을 수 없습니다.';break}
        const cost=Math.max(1,Math.floor(Number(rule.cost)||0)),rate=Math.max(0,Math.min(100,Number(rule.rate)||0));
        if(masterStarStep&&stars<cost){stopReason='MATERIAL_EXHAUSTED';stopMessage='마스터의 별이 부족해 자동 강화를 종료했습니다.';break}
        if(!masterStarStep&&shards<cost){stopReason='MATERIAL_EXHAUSTED';stopMessage='카드 조각이 부족해 자동 강화를 종료했습니다.';break}
        const pityRule=breakthroughPityRule(grade,level,pity),threshold=pityRule.threshold,guaranteed=pityRule.enabled&&failCount>=threshold,success=guaranteed||Math.random()*100<rate;
        if(masterStarStep){stars-=cost;starSpent+=cost}else{shards-=cost;shardSpent+=cost}
        attempts++;
        if(success){level++;failCount=0;successes++;highestSuccessLevel=Math.max(highestSuccessLevel,level)}else{failCount++;failures++}
      }
      if(attempts===maxAttempts&&level>=maxLevel){stopReason='MAX_LEVEL';stopMessage='최대 강화 단계에 도달했습니다.'}
      const canContinue=stopReason==='CHUNK_LIMIT';
      const partialUser={profileScope:'BREAKTHROUGH_PARTIAL',id:user.id,nickname:user.nickname,role:user.role,coin:Number(user.coin||0),cardShards:shards,masterStars:stars,magicCrystals:Number(user.magic_crystals||0),breakthroughs:{[cardId]:level}};
      const cinematic=highestSuccessLevel>0?await breakthroughCinematicFor(env,{success:true,grade,level:highestSuccessLevel,cardId,cardTitle:owned.title}):null;
      const finalPityRule=breakthroughPityRule(grade,level,pity),response={ok:true,requestId,cardId,grade,attempts,successes,failures,spent:{cardShards:shardSpent,masterStars:starSpent},level,failCount,maxLevel,canContinue,stopReason,stopMessage,pity:{...finalPityRule,failCount,nextGuaranteed:finalPityRule.enabled&&failCount>=finalPityRule.threshold},cinematic,user:partialUser};
      if(attempts===0){
        const completed=await env.DB.prepare("UPDATE breakthrough_auto_receipts_v1616 SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'").bind(JSON.stringify(response),requestId,user.id).run();
        if(Number(completed?.meta?.changes||0)!==1)return json({error:'자동 강화 결과를 안전하게 확정하지 못했습니다. 새로고침 후 다시 시도해 주세요.',code:'BREAKTHROUGH_AUTO_STATE_CONFLICT'},409);
        return json(response);
      }
      const marker=-(3000000000+Math.floor(Math.random()*900000000)),statements=[];
      statements.push(env.DB.prepare(`UPDATE user_cards SET breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level=? AND COALESCE(breakthrough_fail_count,0)=? AND COALESCE(quantity,0)>0 AND EXISTS(SELECT 1 FROM users WHERE id=? AND card_shards=?)${starSpent>0?" AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)":''}`).bind(marker,user.id,cardId,initial.level,initial.failCount,user.id,initial.shards,...(starSpent>0?[user.id,initial.stars]:[])));
      if(shardSpent>0)statements.push(env.DB.prepare('UPDATE users SET card_shards=? WHERE id=? AND card_shards=? AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND breakthrough_fail_count=?)').bind(shards,user.id,initial.shards,user.id,cardId,marker));
      if(starSpent>0)statements.push(env.DB.prepare("UPDATE cnine_user_inventory SET quantity=?,unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=? AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND breakthrough_fail_count=?)").bind(stars,stars,user.id,initial.stars,user.id,cardId,marker));
      const balanceGuard=`EXISTS(SELECT 1 FROM users WHERE id=? AND card_shards=?)${starSpent>0?" AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)":''}`;
      statements.push(env.DB.prepare(`UPDATE user_cards SET breakthrough_level=?,breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=? AND ${balanceGuard}`).bind(level,failCount,user.id,cardId,initial.level,marker,user.id,shards,...(starSpent>0?[user.id,stars]:[])));
      const receiptIndex=statements.length;
      statements.push(env.DB.prepare(`UPDATE breakthrough_auto_receipts_v1616 SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=?) AND ${balanceGuard}`).bind(JSON.stringify(response),requestId,user.id,user.id,cardId,level,failCount,user.id,shards,...(starSpent>0?[user.id,stars]:[])));
      if(shardSpent>0)statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM breakthrough_auto_receipts_v1616 WHERE request_id=? AND user_id=? AND status='COMPLETED')").bind(user.id,-shardSpent,shards,'BREAKTHROUGH_AUTO',cardId,requestId,user.id));
      if(starSpent>0)statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',?,?,?,'CARD_BREAKTHROUGH_AUTO',? WHERE EXISTS(SELECT 1 FROM breakthrough_auto_receipts_v1616 WHERE request_id=? AND user_id=? AND status='COMPLETED')").bind(user.id,-starSpent,stars,grade==='ZENITH'?'ZENITH_BREAKTHROUGH_AUTO':`${grade}_HIGH_BREAKTHROUGH_AUTO`,cardId,requestId,user.id));
      const results=await env.DB.batch(statements);
      if(Number(results[receiptIndex]?.meta?.changes||0)!==1){
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET card_shards=? WHERE id=? AND card_shards=?').bind(initial.shards,user.id,shards),
          ...(starSpent>0?[env.DB.prepare("UPDATE cnine_user_inventory SET quantity=?,unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?").bind(initial.stars,initial.stars,user.id,stars)]:[]),
          env.DB.prepare('UPDATE user_cards SET breakthrough_level=?,breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level IN (?,?) AND breakthrough_fail_count IN (?,?)').bind(initial.level,initial.failCount,user.id,cardId,initial.level,level,marker,failCount),
          env.DB.prepare("UPDATE breakthrough_auto_receipts_v1616 SET status='FAILED',response_json=NULL,error_message='STATE_CONFLICT',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(requestId,user.id)
        ]);
        return json({error:'강화 상태가 변경되어 자동 강화를 중단했습니다. 최신 상태를 다시 확인해주세요.'},409);
      }
      return json(response);
    }

    if(path==='card/breakthrough'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const cardId=String(payload.cardId||'').trim();
      const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,COALESCE(uc.breakthrough_fail_count,0) AS breakthrough_fail_count,c.rarity,c.title FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();
      if(!owned) return json({error:'보유한 카드만 돌파할 수 있습니다.'},404);
      const grade=String(owned.rarity||'').trim().toUpperCase();
      if((ORDER[grade]||0)<BREAKTHROUGH_MIN_ORDER) return json({error:'SR 등급 이상 카드만 돌파할 수 있습니다.'},400);
      const level=Number(owned.breakthrough_level||0),isMasterStarHigh=['MA','LIMITED'].includes(grade)&&level>=10,usesMasterStars=grade==='ZENITH'||isMasterStarHigh,maxLevel=['MA','LIMITED'].includes(grade)?13:10;
      if(level>=maxLevel) return json({error:'이미 최대 강화 단계입니다.'},409);
      const failCount=Math.max(0,Number(owned.breakthrough_fail_count||0));
      if(usesMasterStars){
        let rule=null;
        if(isMasterStarHigh){
          const high=grade==='LIMITED'?await limitedMasterStarBreakthroughConfig(env):await maMasterStarBreakthroughConfig(env);
          if(!high.enabled)return json({error:`${grade} +11~+13 강화가 아직 운영 준비 중입니다.`},409);
          rule=high.steps[level-10];
        }else{
          const config=await breakthroughConfig(env);
          rule=config[grade]?.[level];
        }
        if(!rule)return json({error:`${grade} 강화 설정을 찾을 수 없습니다.`},500);
        const cost=Number(rule.cost),rate=Number(rule.rate),starRow=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first(),starBefore=Math.max(0,Number(starRow?.quantity||0));
        if(starBefore<cost)return json({error:`마스터의 별이 부족합니다. (${cost}개 필요)`},400);
        const pity=await breakthroughPity(env),pityRule=breakthroughPityRule(grade,level,pity),guaranteed=pityRule.enabled&&failCount>=pityRule.threshold;
        const success=guaranteed||Math.random()*100<rate,starAfter=starBefore-cost,nextFailCount=success?0:failCount+1;
        // D1 batch 안에서 임시 음수 마커를 사용해 별 차감과 카드 상태 변경을 순차적으로 연결한다.
        // 앞 단계가 0건이면 뒤 단계도 반드시 0건이 되어, stale 요청이 별 차감 없이 강화만 진행되는 것을 막는다.
        const inventoryMarker=-(1000000000+Math.floor(Math.random()*900000000)),cardMarker=-(2000000000+Math.floor(Math.random()*900000000));
        const results=await env.DB.batch([
          env.DB.prepare("UPDATE cnine_user_inventory SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=? AND quantity>=?").bind(inventoryMarker,user.id,starBefore,cost),
          env.DB.prepare(`UPDATE user_cards SET breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level=? AND COALESCE(breakthrough_fail_count,0)=? AND EXISTS (SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)`).bind(cardMarker,user.id,cardId,level,failCount,user.id,inventoryMarker),
          env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=?,unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=? AND EXISTS (SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=?)`).bind(starAfter,starAfter,user.id,inventoryMarker,user.id,cardId,level,cardMarker),
          success
            ?env.DB.prepare(`UPDATE user_cards SET breakthrough_level=breakthrough_level+1,breakthrough_fail_count=0 WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=? AND EXISTS (SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)`).bind(user.id,cardId,level,cardMarker,user.id,starAfter)
            :env.DB.prepare(`UPDATE user_cards SET breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=? AND EXISTS (SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)`).bind(nextFailCount,user.id,cardId,level,cardMarker,user.id,starAfter)
        ]);
        const changes=results.map(result=>Number(result?.meta?.changes||0));
        if(changes.some(value=>value!==1)){
          // 정상 경로에서는 네 문장이 모두 1건이다. 일부만 반영된 비정상 상태는 마커를 기준으로 원복한다.
          await env.DB.batch([
            env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=?,unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND (quantity=? OR (quantity=? AND EXISTS (SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=?)))`).bind(starBefore,starBefore,user.id,inventoryMarker,starAfter,user.id,cardId,level,cardMarker),
            env.DB.prepare('UPDATE user_cards SET breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND breakthrough_level=? AND breakthrough_fail_count=?').bind(failCount,user.id,cardId,level,cardMarker)
          ]);
          return json({error:'강화 상태가 변경되어 요청을 처리하지 못했습니다. 새로고침 후 다시 시도하세요.'},409);
        }
        try{await env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',?,?,?,'CARD_BREAKTHROUGH',?)").bind(user.id,-cost,starAfter,success?`${grade}_BREAKTHROUGH_SUCCESS`:`${grade}_BREAKTHROUGH_FAIL`,cardId).run()}catch(logError){console.error(`${grade} master-star breakthrough inventory log failed`,logError)}
        const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        const finalLevel=success?level+1:level,cinematic=await breakthroughCinematicFor(env,{success,grade,level:finalLevel,cardId,cardTitle:owned.title});return json({ok:true,success,cost,rate,material:'MASTER_STAR',masterStarsAfter:starAfter,level:finalLevel,guaranteed,pity:{...pityRule,failCount:nextFailCount,nextGuaranteed:!success&&pityRule.enabled&&nextFailCount>=pityRule.threshold},cinematic,user:await profile(env,updated)});
      }
      const config=await breakthroughConfig(env),rule=config[grade]?.[level];
      if(!rule) return json({error:'돌파 설정을 찾을 수 없습니다.'},500);
      const cost=Number(rule.cost),rate=Number(rule.rate);
      const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      if(Number(fresh.card_shards||0)<cost) return json({error:`카드 조각이 부족합니다. (${cost}개 필요)`},400);
      const spent=await env.DB.prepare('UPDATE users SET card_shards=card_shards-? WHERE id=? AND card_shards>=?').bind(cost,user.id,cost).run();
      if(!spent.meta.changes) return json({error:'카드 조각이 부족합니다.'},400);
      const pity=await breakthroughPity(env),pityRule=breakthroughPityRule(grade,level,pity),threshold=pityRule.threshold;
      const guaranteed=pityRule.enabled&&failCount>=threshold;
      const success=guaranteed||Math.random()*100<rate;
      if(success) await env.DB.prepare('UPDATE user_cards SET breakthrough_level=breakthrough_level+1,breakthrough_fail_count=0 WHERE user_id=? AND card_id=?').bind(user.id,cardId).run();
      else await env.DB.prepare('UPDATE user_cards SET breakthrough_fail_count=breakthrough_fail_count+1 WHERE user_id=? AND card_id=?').bind(user.id,cardId).run();
      const nextFailCount=success?0:failCount+1,updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,?,?)").bind(user.id,-cost,updated.card_shards,success?(guaranteed?'BREAKTHROUGH_PITY_SUCCESS':'BREAKTHROUGH_SUCCESS'):'BREAKTHROUGH_FAIL',cardId).run();
      const finalLevel=success?level+1:level,cinematic=await breakthroughCinematicFor(env,{success,grade,level:finalLevel,cardId,cardTitle:owned.title});return json({ok:true,success,cost,rate,material:'CARD_SHARD',level:finalLevel,guaranteed,pity:{...pityRule,failCount:nextFailCount,nextGuaranteed:!success&&pityRule.enabled&&nextFailCount>=threshold},cinematic,user:await profile(env,updated)});
    }

    if(path==='raid/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);await publicEquippedTitleMap(env,[]);
      const [cfg,uniqueCfg]=await Promise.all([raidSettings(env),cardUniqueSettings(env)]),owner=isRaidOwner(user),ownerTestMode=isRaidOwnerTest(user,cfg),uniqueVisible=cardUniqueVisibleTo(user,uniqueCfg),schedule=raidScheduleState(cfg,user),entryDateKey=String(schedule.entryDateKey||kstDateKey()),configuredSlots=Array.isArray(cfg.timeSlots)?cfg.timeSlots:[];
      const {todayEntryCount,slotEntries}=await raidEntryStatusCounts(env,user.id,entryDateKey,configuredSlots),dailyEntryLimit=Math.max(1,Number(cfg.dailyEntries||1)),dailyEntry={count:todayEntryCount,limit:dailyEntryLimit,remaining:Math.max(0,dailyEntryLimit-todayEntryCount),dateKey:entryDateKey,unlimited:ownerTestMode},scheduleSlot=schedule.currentSlot||null,scheduleSlotId=String(scheduleSlot?.id||''),slotEntry=scheduleSlotId&&scheduleSlotId!=='ALWAYS'?(slotEntries.find(row=>String(row.id)===scheduleSlotId)||{id:scheduleSlotId,label:String(scheduleSlot?.label||scheduleSlotId),count:0,limit:Math.max(1,Number(scheduleSlot?.entriesPerSlot||1)),remaining:Math.max(1,Number(scheduleSlot?.entriesPerSlot||1)),unlimited:ownerTestMode}):{id:scheduleSlotId||'DAILY',label:String(scheduleSlot?.label||'오늘 합계'),count:todayEntryCount,limit:dailyEntryLimit,remaining:Math.max(0,dailyEntryLimit-todayEntryCount),unlimited:ownerTestMode},slotEntryUsed=Boolean(scheduleSlotId&&scheduleSlotId!=='ALWAYS'&&Number(slotEntry.count||0)>=Number(slotEntry.limit||1));
      if(cfg.ownerOnlyTest&&!owner)return json({error:'현재 레이드는 OWNER 테스트 전용입니다.'},403);
      // 상태 조회마다 활성 방 전체를 갱신하면 방 수만큼 SELECT/UPDATE/정산 쿼리가 발생한다.
      // 실제 상태 전환 시각이 지난 방만 한 요청당 최대 2개 처리해 D1 잠금과 타임아웃을 제한한다.
      const transitionDue=(await env.DB.prepare(`SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate
        FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id
        WHERE (ri.status='LOBBY' AND ri.starts_at IS NOT NULL AND datetime(ri.starts_at)<=datetime('now'))
           OR (ri.status='BATTLE' AND ri.ends_at IS NOT NULL AND datetime(ri.ends_at)<=datetime('now'))
        ORDER BY CASE WHEN ri.status='BATTLE' THEN 0 ELSE 1 END,ri.id
        LIMIT 2`).all()).results;
      for(const room of transitionDue)await refreshRaidForOwner(env,room,cfg);
      const roomRows=(await env.DB.prepare("SELECT ri.id,ri.status,ri.starts_at AS startsAt,ri.ends_at AS endsAt,(SELECT COUNT(*) FROM raid_participants rp2 WHERE rp2.instance_id=ri.id AND COALESCE(rp2.is_active,1)=1) AS participantCount,rb.name AS bossName,rb.image_url AS bossImage,rb.max_hp AS maxHp,COALESCE(x.slot_id,'LEGACY') AS slotId FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id LEFT JOIN raid_instance_v1293 x ON x.instance_id=ri.id WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 10").all()).results;
      const rooms=roomRows.map((room,i)=>{const slot=(cfg.timeSlots||[]).find(x=>String(x.id)===String(room.slotId)),activeSlotId=String(schedule.currentSlot?.id||'');const slotOpen=owner||room.slotId==='LEGACY'||room.slotId==='ALWAYS'||(activeSlotId&&activeSlotId===String(room.slotId));return {...room,slotLabel:slot?.label||room.slotId,roomNumber:roomRows.length-i,joinable:slotOpen&&room.status==='LOBBY'&&Date.parse(room.startsAt)>Date.now()&&Number(room.participantCount)<Number(cfg.maxParticipants||30)}});
      const requestedId=Math.max(0,Number(new URL(request.url).searchParams.get('instanceId')||0));
      const activeParticipantSql="SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id JOIN raid_participants rp ON rp.instance_id=ri.id AND rp.user_id=? AND COALESCE(rp.is_active,1)=1 WHERE ri.status IN ('LOBBY','BATTLE')";
      let current=requestedId?await env.DB.prepare(`${activeParticipantSql} AND ri.id=? LIMIT 1`).bind(user.id,requestedId).first():null;
      if(!current)current=await env.DB.prepare(`${activeParticipantSql} ORDER BY ri.id DESC LIMIT 1`).bind(user.id).first();
      // OWNER가 직접 개설한 방의 참가 행이 비정상적으로 누락된 경우 저장된 PvE 덱으로 한 번만 복구한다.
      // 명시적으로 퇴장한 행(is_active=0)은 복구하지 않아 일반 퇴장 규칙을 침범하지 않는다.
      if(!current&&owner){
        const opened=requestedId
          ?await env.DB.prepare("SELECT ri.id,ri.status FROM raid_open_requests ro JOIN raid_instances ri ON ri.id=ro.instance_id WHERE ro.user_id=? AND ro.instance_id=? AND ro.status='COMPLETED' AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(user.id,requestedId).first()
          :await env.DB.prepare("SELECT ri.id,ri.status FROM raid_open_requests ro JOIN raid_instances ri ON ri.id=ro.instance_id WHERE ro.user_id=? AND ro.status='COMPLETED' AND ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();
        const repairRoomId=Math.max(0,Number(opened?.id||0));
        if(repairRoomId){
          const participantRow=await env.DB.prepare('SELECT id,is_active AS isActive FROM raid_participants WHERE instance_id=? AND user_id=? LIMIT 1').bind(repairRoomId,user.id).first();
          if(!participantRow){
            try{
              const savedDeck=await pveDeckCards(env,user.id),deck=await raidDeckPower(env,user.id,savedDeck);
              await env.DB.prepare('INSERT OR IGNORE INTO raid_participants(instance_id,user_id,deck_cards,total_power,total_damage,updated_at) VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)').bind(repairRoomId,user.id,JSON.stringify(deck.ids),deck.power).run();
              await env.DB.prepare('UPDATE raid_instances SET participant_count=(SELECT COUNT(*) FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(repairRoomId,repairRoomId).run();
            }catch(repairError){console.error('OWNER raid participant recovery failed',repairError)}
          }
          current=await env.DB.prepare(`${activeParticipantSql} AND ri.id=? LIMIT 1`).bind(user.id,repairRoomId).first();
        }
      }
      if(!current){current=await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id JOIN raid_participants rp ON rp.instance_id=ri.id AND rp.user_id=? AND COALESCE(rp.is_active,1)=1 WHERE ri.status='ENDED' AND COALESCE(rp.reward_claimed,0)=0 AND NOT EXISTS (SELECT 1 FROM raid_reward_receipts rr WHERE rr.instance_id=ri.id AND rr.user_id=rp.user_id AND UPPER(COALESCE(rr.status,''))='COMPLETED') AND NOT EXISTS (SELECT 1 FROM raid_user_reward_v1293 ur WHERE ur.instance_id=ri.id AND ur.user_id=rp.user_id AND UPPER(COALESCE(ur.status,''))='COMPLETED') AND NOT EXISTS (SELECT 1 FROM raid_room_cancellations rc WHERE rc.instance_id=ri.id AND rc.status='COMPLETED') ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();}
      // 선택한 방이 전투로 전환된 순간에도 목록으로 되돌리지 않고 참가 여부 화면을 명확히 반환한다.
      if(!current&&requestedId)current=await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.id=? AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(requestedId).first();
      if(!current){
        const policies=await raidBossOpenPolicies(env),bossRows=await env.DB.prepare('SELECT id,name,image_url AS image,max_hp AS maxHp,defense_rate AS defenseRate,sort_order AS sortOrder FROM raid_bosses WHERE is_active=1 ORDER BY sort_order,id').all(),slot=schedule.currentSlot||null,slotBossId=Number(slot?.bossId||0);
        const availableBosses=bossRows.results.filter(b=>(owner||policies[String(b.id)]?.enabled)&&(owner||slotBossId<=0||Number(b.id)===slotBossId)).map(b=>({...b,openCost:Number(policies[String(b.id)]?.cost||0),ownerTestVisible:ownerTestMode&&policies[String(b.id)]?.enabled!==true}));
        return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,availableBosses,ownerTestMode,dailyEntryUsed:ownerTestMode?false:(todayEntryCount>=dailyEntryLimit||slotEntryUsed),dailyEntry,slotEntry,slotEntries,serverNow:new Date().toISOString()});
      }
      // 전투가 status 조회 도중 종료된 경우에도, 이미 정산한 OWNER에게 결과 화면을 다시 노출하지 않는다.
      if(current.status==='ENDED'){
        const cancelled=await env.DB.prepare("SELECT reason,refund_coin AS refundCoin,restored_entries AS restoredEntries FROM raid_room_cancellations WHERE instance_id=? AND status='COMPLETED'").bind(current.id).first();
        if(cancelled){const cancelledSlotId=await raidInstanceSlotV1293(env,current.id),adjustedDaily={...dailyEntry,count:Math.max(0,dailyEntry.count-1),remaining:Math.min(dailyEntry.limit,dailyEntry.remaining+1)},adjustedSlots=slotEntries.map(row=>String(row.id)===String(cancelledSlotId)?{...row,count:Math.max(0,Number(row.count||0)-1),remaining:Math.min(Number(row.limit||1),Number(row.remaining||0)+1)}:row),adjustedSlot=String(slotEntry.id)===String(cancelledSlotId)?(adjustedSlots.find(row=>String(row.id)===String(cancelledSlotId))||slotEntry):slotEntry;return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,dailyEntryUsed:false,dailyEntry:adjustedDaily,slotEntry:adjustedSlot,slotEntries:adjustedSlots,cancelledRaid:{id:current.id,reason:cancelled.reason,refundCoin:Number(cancelled.refundCoin||0),entryRestored:true},serverNow:new Date().toISOString()});}
        const settlement=await raidSettlementState(env,current.id,user.id);
        if(settlement.settled){
          return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,dailyEntryUsed:ownerTestMode?false:(todayEntryCount>=dailyEntryLimit||slotEntryUsed),dailyEntry,slotEntry,slotEntries,serverNow:new Date().toISOString(),lastRaid:{id:current.id,rewardClaimed:true,receiptStatus:settlement.receiptStatus,rewardStatus:settlement.rewardStatus}});
        }
      }
      const instanceCfg=await raidInstanceSettingsV1293(env,current.id,cfg);
      if(current.status==='BATTLE')await repairRaidZeroDamage(env,current.id,instanceCfg);
      const rows=await env.DB.prepare(`SELECT rp.user_id AS userId,u.nickname,rp.deck_cards AS deckCards,rp.total_power AS totalPower,rp.total_damage AS totalDamage,rp.reward_claimed AS rewardClaimed,rp.joined_at AS joinedAt,
        t.id AS titleId,t.name AS titleName,t.badge_text AS titleBadgeText,t.style_preset AS titleStylePreset
        FROM raid_participants rp
        JOIN users u ON u.id=rp.user_id
        LEFT JOIN user_title_loadout tl ON tl.user_id=u.id
        LEFT JOIN user_character_titles ut ON ut.user_id=u.id AND ut.title_id=tl.title_id AND (ut.expires_at IS NULL OR ut.expires_at>CURRENT_TIMESTAMP)
        LEFT JOIN character_titles t ON t.id=tl.title_id AND ut.title_id IS NOT NULL AND t.is_active=1 AND t.is_public=1
        WHERE rp.instance_id=? AND COALESCE(rp.is_active,1)=1 ORDER BY rp.total_damage DESC,rp.joined_at`).bind(current.id).all();
      const participants=rows.results.map((r,i)=>({...r,rank:i+1,title:r.titleId?{id:Number(r.titleId),name:r.titleName,badgeText:r.titleBadgeText||r.titleName,stylePreset:String(r.titleStylePreset||'DEFAULT').toUpperCase()}:null,deckCards:(()=>{try{return raidDisplayDeckIdsV1311(JSON.parse(r.deckCards||'[]'))}catch{return []}})()}));
      let cardMap={},breakthroughMap={};
      try{({cardMap,breakthroughMap}=await raidParticipantDisplayDataV1311(env,{instanceId:current.id,participants,uniqueVisible,uniqueCfg}));}
      catch(displayError){console.error('raid participant card display lookup failed',{instanceId:Number(current.id),participantCount:participants.length,message:String(displayError?.message||displayError)});}
      const instanceSlot=await raidInstanceSlotV1293(env,current.id),instanceSlotCfg=(instanceCfg.timeSlots||[]).find(row=>String(row.id)===String(instanceSlot))||null,instanceSlotEntry=instanceSlot&&instanceSlot!=='ALWAYS'&&instanceSlot!=='LEGACY'?(slotEntries.find(row=>String(row.id)===String(instanceSlot))||{id:String(instanceSlot),label:String(instanceSlotCfg?.label||instanceSlot),count:0,limit:Math.max(1,Number(instanceSlotCfg?.entriesPerSlot||1)),remaining:Math.max(1,Number(instanceSlotCfg?.entriesPerSlot||1)),unlimited:ownerTestMode}):slotEntry,instanceSlotUsed=Boolean(instanceSlot&&instanceSlot!=='ALWAYS'&&instanceSlot!=='LEGACY'&&Number(instanceSlotEntry.count||0)>=Number(instanceSlotEntry.limit||1)),entryUsedForCurrent=ownerTestMode?false:(todayEntryCount>=dailyEntryLimit||instanceSlotUsed);
      const startMs=Date.parse(current.starts_at||0),endMs=Date.parse(current.ends_at||0),now=Date.now();
      const combat=raidCombatSnapshot(participants,current,instanceCfg,now);
      const progress=current.status==='LOBBY'
        ?0
        :Math.max(0,Math.min(1,Number(combat.elapsedMs||0)/Math.max(1,Number(combat.durationMs||1))));
      const hp=combat.bossHp,attackTicks=combat.attackTicks;
      const enraged=current.status==='BATTLE'
        &&(instanceCfg.phase3EnrageEnabled!==false||instanceCfg.enrageEnabled===true)
        &&Number(combat.phase||1)===3
        &&hp>0;
      const enriched=combat.states.map(x=>({...x.row,shownDamage:Math.max(0,Math.floor(x.shownDamage)),maxHp:x.maxHp,currentHp:x.currentHp,isDefeated:x.isDefeated,cards:x.row.deckCards.map(id=>cardMap[String(id)]?{...cardMap[String(id)],breakthroughLevel:Number(breakthroughMap[`${x.row.userId}:${id}`]||0)}:null).filter(Boolean)})).sort((a,b)=>Number(b.shownDamage||0)-Number(a.shownDamage||0)||String(a.joinedAt||'').localeCompare(String(b.joinedAt||''))).map((x,i)=>({...x,rank:i+1}));
      const allDefeated=combat.allDefeated,cleared=combat.cleared;
      if(current.status==='BATTLE'&&(allDefeated||cleared||now>=endMs)){
        const finishedAt=new Date(startMs+combat.elapsedMs).toISOString();
        const ended=await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=?,current_hp=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='BATTLE'").bind(finishedAt,hp,current.id).run();
        if(Number(ended?.meta?.changes||0)===1)await finalizeRaidV1293(env,current.id,combat);
        current.status='ENDED';current.ends_at=finishedAt;current.current_hp=hp;
      }
      const result=allDefeated?'FAILED':cleared?'CLEAR':'TIMEOUT';
      const me=enriched.find(x=>Number(x.userId)===Number(user.id))||null;
      // 상태 조회가 시작될 때는 BATTLE이었더라도, 조회 도중 종료·정산이 끝날 수 있다.
      // 최종 응답 직전에 서버의 세 정산 마커를 다시 확인해 완료된 결과 화면이 재노출되는 경합을 차단한다.
      if(current.status==='ENDED'&&me){
        const settlement=await raidSettlementState(env,current.id,user.id);
        if(settlement.settled){
          return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,dailyEntryUsed:entryUsedForCurrent,dailyEntry,slotEntry:instanceSlotEntry,slotEntries,serverNow:new Date().toISOString(),lastRaid:{id:current.id,rewardClaimed:true,receiptStatus:settlement.receiptStatus,rewardStatus:settlement.rewardStatus}});
        }
      }
      // 대기실 이후의 전투·결과 정보는 실제 참가자에게만 공개한다.
      if(current.status!=='LOBBY'&&!me){
        return json({settings:cfg,schedule,ownerTestMode,dailyEntryUsed:entryUsedForCurrent,dailyEntry,slotEntry:instanceSlotEntry,slotEntries,rooms,current:{id:current.id,status:current.status,startsAt:current.starts_at,endsAt:current.ends_at,participantCount:participants.length},participants:[],me:null,claimableReward:null,raidAccess:'NOT_PARTICIPANT',serverNow:new Date().toISOString()});
      }
      let claimableReward=null;
      if(current.status==='ENDED'&&me&&Number(me.rewardClaimed||0)!==1){
        let finalState=await raidFinalParticipantV1293(env,current.id,user.id);
        if(!finalState){
          const recovery=await env.DB.prepare("UPDATE raid_instances SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ENDED' AND datetime(updated_at)<=datetime('now','-5 seconds')").bind(current.id).run();
          if(Number(recovery?.meta?.changes||0)===1){await finalizeRaidV1293(env,current.id,combat);finalState=await raidFinalParticipantV1293(env,current.id,user.id)}
        }
        if(!finalState){
          return json({settings:cfg,schedule,dailyEntryUsed:entryUsedForCurrent,dailyEntry,slotEntry:instanceSlotEntry,slotEntries,rooms,current:{id:current.id,status:'ENDED',startsAt:current.starts_at,endsAt:current.ends_at,currentHp:hp,maxHp:Number(current.max_hp),participantCount:participants.length,bossName:current.boss_name,bossImage:current.boss_image,progress:1,result,attackTicks,enraged:false,slotId:instanceSlot},participants:enriched,me,claimableReward:null,settlementPending:true,serverNow:new Date().toISOString()});
        }
        const rewardCfg=await raidRewardSnapshot(env,current.id,instanceCfg,true),finalDamage=Math.max(0,Number((finalState?.finalDamage??me.shownDamage)||0)),finalRank=Math.max(0,Number((finalState?.finalRank??me.rank)||0)),cleared=Number(hp||0)<=0;
        const fixedPlan=await ensureRaidUserRewardPlanV1293(env,{instanceId:current.id,userId:user.id,cfg:instanceCfg,totalDamage:finalDamage,finalRank,cleared}),rewardDisplay=raidRewardDisplayV1293(fixedPlan.plan);
        const rewardCoin=Math.max(0,Number(rewardDisplay.coin||0)),rewardShards=Math.max(0,Number(rewardDisplay.shards||0)),rankMagicCrystals=Math.max(0,Number(magicRewardForRank(rewardCfg.rankMagicRewards,finalRank)||0)),rewardMagicCrystals=Math.max(0,Number(rewardCfg.participationMagicCrystals||0)+rankMagicCrystals);
        // V1308: PENDING/COMPLETED 영수증의 updated_at은 정산 잠금 시작 시각이다.
        // raid/status 조회가 이 값을 갱신하면 stale 복구 시간이 영원히 리셋되므로 반드시 보존한다.
        await env.DB.prepare(`INSERT INTO raid_reward_receipts(instance_id,user_id,status,reward_coin,reward_shards,reward_magic_crystals)
          VALUES(?,?,'READY',?,?,?)
          ON CONFLICT(instance_id,user_id) DO UPDATE SET
            status=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.status ELSE 'READY' END,
            reward_coin=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.reward_coin ELSE excluded.reward_coin END,
            reward_shards=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.reward_shards ELSE excluded.reward_shards END,
            reward_magic_crystals=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.reward_magic_crystals ELSE excluded.reward_magic_crystals END,
            error_message=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.error_message ELSE NULL END,
            updated_at=CASE WHEN raid_reward_receipts.status IN ('COMPLETED','PENDING') THEN raid_reward_receipts.updated_at ELSE CURRENT_TIMESTAMP END`).bind(current.id,user.id,rewardCoin,rewardShards,rewardMagicCrystals).run();
        const rewardReceipt=await env.DB.prepare(`SELECT status,reward_coin AS rewardCoin,reward_shards AS rewardShards,COALESCE(reward_magic_crystals,0) AS rewardMagicCrystals FROM raid_reward_receipts WHERE instance_id=? AND user_id=?`).bind(current.id,user.id).first();
        if(String(rewardReceipt?.status||'').toUpperCase()==='COMPLETED'){
          await raidSettlementState(env,current.id,user.id);
          return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,dailyEntryUsed:entryUsedForCurrent,dailyEntry,slotEntry:instanceSlotEntry,slotEntries,serverNow:new Date().toISOString(),lastRaid:{id:current.id,rewardClaimed:true,receiptStatus:'COMPLETED'}});
        }
        claimableReward={instanceId:Number(current.id),coin:Math.max(0,Number(rewardReceipt?.rewardCoin??rewardCoin)),shards:Math.max(0,Number(rewardReceipt?.rewardShards??rewardShards)),magicCrystals:Math.max(0,Number(rewardReceipt?.rewardMagicCrystals??rewardMagicCrystals)),participationMagicCrystals:Number(rewardCfg.participationMagicCrystals||0),rankMagicCrystals,finalRank,finalDamage,cleared,inventoryRewards:rewardDisplay.inventoryRewards,entries:rewardDisplay.entries,rareDrops:rewardDisplay.rareDrops,source:'SERVER_CONFIRMED',snapshot:true,receiptStatus:String(rewardReceipt?.status||'READY')};
      }
      // V1779: raid parties are public squads. Only already-public profile and
      // immutable raid deck data are exposed; authentication/private keys are
      // never part of this projection.
      const visibleParticipants=enriched;
      return json({settings:cfg,schedule,dailyEntryUsed:entryUsedForCurrent,dailyEntry,slotEntry:instanceSlotEntry,slotEntries,rooms,current:{id:current.id,status:current.status,startsAt:current.starts_at,endsAt:current.ends_at,currentHp:hp,maxHp:Number(current.max_hp),participantCount:participants.length,bossName:current.boss_name,bossImage:current.boss_image,progress,result:current.status==='ENDED'?result:null,attackTicks,enraged,slotId:instanceSlot,phase:Number(combat.phase||1),phaseLabel:combat.phaseLabel||'',shieldHp:Number(combat.shieldHp||0),shieldMaxHp:Number(combat.shieldMaxHp||0),shieldBroken:combat.shieldBroken===true,breakProgress:Number(combat.breakProgress||0)},participants:visibleParticipants,me,claimableReward,serverNow:new Date().toISOString()});
    }
    if(path==='raid/open'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env),owner=isRaidOwner(user),ownerTestMode=isRaidOwnerTest(user,cfg);if(!cfg.enabled)return json({error:'현재 레이드가 중지되어 있습니다.'},503);if(cfg.ownerOnlyTest&&!owner)return json({error:'현재 레이드는 OWNER 테스트 전용입니다.'},403);if(!cfg.userOpenEnabled&&!owner)return json({error:'유저 레이드 개방이 중지되어 있습니다.'},403);
      const schedule=raidScheduleState(cfg,user);if(!schedule.canEnter)return json({error:schedule.reason==='ENTRY_CLOSED'?'레이드 입장 마감 시간이 지났습니다.':'현재는 레이드 개방 시간이 아닙니다.',schedule},403);
      const slot=schedule.currentSlot||{id:'ALWAYS',label:'상시 개방',entriesPerSlot:Number(cfg.dailyEntries||99),bossId:0},slotId=String(slot.id||'ALWAYS');
      const body=await readBody(request),requestId=String(body.requestId||crypto.randomUUID()).trim().slice(0,100),bossId=Number(body.bossId||0),dateKey=String(schedule.entryDateKey||kstDateKey());
      const prior=await env.DB.prepare('SELECT status,instance_id AS instanceId FROM raid_open_requests WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();if(prior?.status==='COMPLETED')return json({ok:true,instanceId:prior.instanceId,reused:true});if(prior)return json({error:'같은 레이드 개방 요청을 처리 중입니다.'},409);
      const [activeCount,activeMine,entryCount,slotEntryCount,policies,boss,fresh]=await Promise.all([env.DB.prepare("SELECT COUNT(*) count FROM raid_instances WHERE status IN ('LOBBY','BATTLE')").first(),env.DB.prepare("SELECT rp.instance_id FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(user.id).first(),raidDailyEntryCount(env,user.id,dateKey),raidSlotEntryCountV1293(env,user.id,dateKey,slotId),raidBossOpenPolicies(env),env.DB.prepare('SELECT * FROM raid_bosses WHERE id=? AND is_active=1').bind(bossId).first(),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()]);
      if(Number(activeCount?.count||0)>=10)return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409);if(activeMine)return json({error:'이미 참가 중인 레이드 방이 있습니다.'},409);if(!ownerTestMode&&entryCount>=Number(cfg.dailyEntries||2))return json({error:`오늘의 레이드 입장 횟수 ${Number(cfg.dailyEntries||2)}회를 모두 사용했습니다.`},409);if(!ownerTestMode&&slotId!=='ALWAYS'&&slotEntryCount>=Number(slot.entriesPerSlot||1))return json({error:`${slot.label||slotId} 레이드 참여 횟수를 모두 사용했습니다. 다음 개방 타임에 다시 참여할 수 있습니다.`},409);if(!boss)return json({error:'개방 가능한 레이드 보스를 찾을 수 없습니다.'},404);
      if(Number(slot.bossId||0)>0&&Number(slot.bossId)!==bossId&&!owner)return json({error:`${slot.label||'현재 타임'} 지정 보스만 개방할 수 있습니다.`},403);
      const policy=policies[String(bossId)]||{};if(!policy.enabled&&!owner)return json({error:'현재 개방할 수 없는 보스입니다.'},403);const cost=Math.max(0,Number(policy.cost||0));if(Number(fresh?.coin||0)<cost)return json({error:'레이드 개방에 필요한 코인이 부족합니다.'},400);
      let deck;try{deck=await raidDeckPower(env,user.id,body.cardIds)}catch(e){return json({error:e.message},e.status||400)}
      await env.DB.prepare("INSERT INTO raid_open_requests(request_id,user_id,boss_id,cost,status) VALUES(?,?,?,?,'PENDING')").bind(requestId,user.id,bossId,cost).run();
      const startsAt=new Date(Date.now()+Number(cfg.lobbySeconds||60)*1000).toISOString(),endsAt=new Date(Date.now()+(Number(cfg.lobbySeconds||60)+Number(cfg.battleSeconds||120))*1000).toISOString();
      const created=await env.DB.prepare("INSERT INTO raid_instances(boss_id,status,starts_at,ends_at,current_hp,participant_count) SELECT ?,'LOBBY',?,?,?,0 WHERE (SELECT COUNT(*) FROM raid_instances WHERE status IN ('LOBBY','BATTLE'))<10").bind(bossId,startsAt,endsAt,boss.max_hp).run();
      if(!created.meta.changes){await env.DB.prepare("UPDATE raid_open_requests SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(requestId).run();return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409)}
      const instanceId=Number(created.meta.last_row_id);await snapshotRaidInstanceV1293(env,instanceId,slotId,cfg);await raidRewardSnapshot(env,instanceId,cfg,true);
      try{
        const openStatements=[
          env.DB.prepare('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?').bind(cost,user.id,cost),
          env.DB.prepare('INSERT INTO raid_participants(instance_id,user_id,deck_cards,total_power,total_damage,updated_at) VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)').bind(instanceId,user.id,JSON.stringify(deck.ids),deck.power),
          env.DB.prepare('UPDATE raid_instances SET participant_count=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(instanceId),
          env.DB.prepare("UPDATE raid_open_requests SET instance_id=?,status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(instanceId,requestId),
          env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'RAID_OPEN' FROM users WHERE id=?").bind(-cost,user.id)
        ];
        if(!ownerTestMode)openStatements.splice(1,0,env.DB.prepare('INSERT INTO raid_daily_entry_uses(user_id,entry_date,instance_id) VALUES(?,?,?)').bind(user.id,dateKey,instanceId));
        await env.DB.batch(openStatements);
      }catch(e){await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(instanceId).run();await env.DB.prepare("UPDATE raid_open_requests SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(requestId).run();return json({error:'레이드 개방 처리에 실패했습니다. 다시 시도하지 말고 운영자에게 문의해주세요.'},500)}
      return json({ok:true,instanceId,cost,totalPower:deck.power,cardPower:deck.cardPower,characterBonus:deck.characterBonus,participantCount:1,slot:{id:slotId,label:slot.label}});
    }

    if(path==='raid/join'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env),owner=isRaidOwner(user);if(!cfg.enabled)return json({error:'현재 레이드를 이용할 수 없습니다.'},503);if(cfg.ownerOnlyTest&&!owner)return json({error:'현재 레이드는 OWNER 테스트 전용입니다.'},403);const schedule=raidScheduleState(cfg,user);if(!schedule.canEnter)return json({error:schedule.reason==='ENTRY_CLOSED'?'레이드 입장 마감 시간이 지났습니다.':'현재는 레이드 개방 시간이 아닙니다.',schedule},403);
      const body=await readBody(request),instanceId=Math.max(0,Number(body.instanceId||0));if(!instanceId)return json({error:'참가할 레이드 방을 선택해주세요.'},400);
      const current=await env.DB.prepare("SELECT ri.*,rb.max_hp FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.id=? AND ri.status='LOBBY' LIMIT 1").bind(instanceId).first();if(!current)return json({error:'선택한 레이드 방은 현재 참가할 수 없습니다.'},404);if(Date.parse(current.starts_at||0)<=Date.now())return json({error:'레이드 전투가 이미 시작되어 중간 참여할 수 없습니다.'},409);
      const [instanceCfg,instanceSlot,already,activeMine]=await Promise.all([raidInstanceSettingsV1293(env,current.id,cfg),raidInstanceSlotV1293(env,current.id),env.DB.prepare('SELECT id,is_active AS isActive,total_power AS totalPower FROM raid_participants WHERE instance_id=? AND user_id=?').bind(current.id,user.id).first(),env.DB.prepare("SELECT rp.instance_id FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(user.id).first()]),ownerTestMode=isRaidOwnerTest(user,instanceCfg),activeSlot=schedule.currentSlot||{id:'ALWAYS',entriesPerSlot:Number(instanceCfg.dailyEntries||99)},instanceSlotCfg=(instanceCfg.timeSlots||[]).find(row=>String(row.id)===String(instanceSlot))||activeSlot,instanceSlotLimit=Math.max(1,Number(instanceSlotCfg?.entriesPerSlot||1));
      if(!owner&&instanceSlot!=='LEGACY'&&instanceSlot!=='ALWAYS'&&String(activeSlot.id)!==String(instanceSlot))return json({error:'이 레이드 방의 개방 타임이 종료되었습니다.'},409);
      if(Number(already?.isActive||0)===1)return json({ok:true,alreadyJoined:true,recovered:true,totalPower:Number(already.totalPower||0),participantCount:Number(current.participant_count||0),requestId:String(body.requestId||'')});if(already)return json({error:'퇴장한 동일 레이드 방에는 다시 참가할 수 없습니다.'},409);
      if(activeMine)return json({error:'이미 다른 레이드 방에 참가 중입니다.'},409);
      if(Number(current.participant_count||0)>=Number(instanceCfg.maxParticipants||30))return json({error:'레이드 참가 인원이 가득 찼습니다.'},409);const dateKey=String(schedule.entryDateKey||kstDateKey());let entryCount,slotEntryCount,deck;try{[entryCount,slotEntryCount,deck]=await Promise.all([raidDailyEntryCount(env,user.id,dateKey),raidSlotEntryCountV1293(env,user.id,dateKey,instanceSlot),raidDeckPower(env,user.id,body.cardIds)])}catch(e){return json({error:e.message},e.status||400)}if(!ownerTestMode&&entryCount>=Number(instanceCfg.dailyEntries||2))return json({error:`오늘의 레이드 입장 횟수 ${Number(instanceCfg.dailyEntries||2)}회를 모두 사용했습니다.`},409);if(!ownerTestMode&&instanceSlot!=='LEGACY'&&instanceSlot!=='ALWAYS'&&slotEntryCount>=instanceSlotLimit)return json({error:`${instanceSlotCfg?.label||instanceSlot} 레이드 참여 횟수 ${instanceSlotLimit}회를 모두 사용했습니다.`},409);
      const inserted=await env.DB.prepare(`INSERT INTO raid_participants(instance_id,user_id,deck_cards,total_power,total_damage,updated_at)
        SELECT ?,?,?,?,?,CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM raid_instances ri WHERE ri.id=? AND ri.status='LOBBY' AND datetime(ri.starts_at)>CURRENT_TIMESTAMP)
          AND NOT EXISTS (SELECT 1 FROM raid_participants mine JOIN raid_instances active ON active.id=mine.instance_id WHERE mine.user_id=? AND COALESCE(mine.is_active,1)=1 AND active.status IN ('LOBBY','BATTLE'))
          AND (SELECT COUNT(*) FROM raid_participants cap WHERE cap.instance_id=? AND COALESCE(cap.is_active,1)=1)<?`).bind(current.id,user.id,JSON.stringify(deck.ids),deck.power,0,current.id,user.id,current.id,Number(instanceCfg.maxParticipants||30)).run();
      if(!Number(inserted?.meta?.changes||0))return json({error:'레이드 참가 인원이 가득 찼거나 이미 다른 방에 참가 중입니다. 방 목록을 새로고침해주세요.'},409);
      try{const writes=[];if(!ownerTestMode)writes.push(env.DB.prepare('INSERT INTO raid_daily_entry_uses(user_id,entry_date,instance_id) VALUES(?,?,?)').bind(user.id,dateKey,current.id));writes.push(env.DB.prepare('UPDATE raid_instances SET participant_count=(SELECT COUNT(*) FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(current.id,current.id));await env.DB.batch(writes)}
      catch(entryError){await env.DB.prepare('DELETE FROM raid_participants WHERE instance_id=? AND user_id=? AND total_damage=0').bind(current.id,user.id).run();await env.DB.prepare('UPDATE raid_instances SET participant_count=(SELECT COUNT(*) FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(current.id,current.id).run();return json({error:'레이드 입장 횟수 기록에 실패해 참가 처리를 취소했습니다. 다시 시도해주세요.'},409)}
      const participantCount=Math.min(Number(instanceCfg.maxParticipants||30),Math.max(1,Number(current.participant_count||0)+1));if(instanceCfg.autoStartOnFull)await env.DB.prepare("UPDATE raid_instances SET starts_at=CURRENT_TIMESTAMP,ends_at=datetime('now', ?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='LOBBY' AND participant_count>=?").bind(`+${Number(instanceCfg.battleSeconds||120)} seconds`,current.id,Number(instanceCfg.maxParticipants||30)).run();return json({ok:true,totalPower:deck.power,cardPower:deck.cardPower,characterBonus:deck.characterBonus,participantCount,slotId:instanceSlot,requestId:String(body.requestId||'')});
    }

    if(path==='raid/leave'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),instanceId=Math.max(0,Number(body.instanceId||0));if(!instanceId)return json({error:'퇴장할 레이드 방을 찾을 수 없습니다.'},400);
      const room=await env.DB.prepare("SELECT id,status,starts_at AS startsAt FROM raid_instances WHERE id=? LIMIT 1").bind(instanceId).first();
      if(!room)return json({error:'레이드 방을 찾을 수 없습니다.'},404);if(room.status!=='LOBBY'||Date.parse(room.startsAt||0)<=Date.now())return json({error:'전투가 시작된 후에는 레이드에서 퇴장할 수 없습니다.'},409);
      const participant=await env.DB.prepare('SELECT id FROM raid_participants WHERE instance_id=? AND user_id=? AND COALESCE(is_active,1)=1 LIMIT 1').bind(instanceId,user.id).first();if(!participant)return json({error:'현재 참가 중인 레이드 방이 아닙니다.'},404);
      const entry=await env.DB.prepare("SELECT entry_date AS entryDate FROM raid_daily_entry_uses WHERE user_id=? AND instance_id=? UNION ALL SELECT entry_date AS entryDate FROM raid_daily_entries WHERE user_id=? AND instance_id=? LIMIT 1").bind(user.id,instanceId,user.id,instanceId).first();
      const entryDate=entry?.entryDate||kstDateKey();
      const left=await env.DB.prepare("UPDATE raid_participants SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(is_active,1)=1 AND EXISTS (SELECT 1 FROM raid_instances WHERE id=? AND status='LOBBY' AND datetime(starts_at)>CURRENT_TIMESTAMP)").bind(participant.id,instanceId).run();
      if(!left.meta.changes)return json({error:'전투가 시작되어 퇴장할 수 없습니다.'},409);
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO raid_daily_entry_restores(user_id,entry_date,instance_id,reason) VALUES(?,?,?,'USER_LEAVE')").bind(user.id,entryDate,instanceId),
        env.DB.prepare("UPDATE raid_instances SET participant_count=(SELECT COUNT(*) FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(instanceId,instanceId)
      ]);
      const count=await env.DB.prepare('SELECT participant_count AS participantCount FROM raid_instances WHERE id=?').bind(instanceId).first();
      return json({ok:true,instanceId,entryRestored:true,participantCount:Number(count?.participantCount||0)});
    }

    if(path==='raid/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env);if(cfg.ownerOnlyTest&&!isRaidOwner(user))return json({error:'현재 레이드는 OWNER 테스트 전용입니다.'},403);
      const body=await readBody(request),instanceId=Number(body.instanceId||0);
      const row=instanceId>0
        ?await env.DB.prepare("SELECT rp.id,rp.reward_claimed,ri.id AS instance_id,ri.status,ri.current_hp,ri.boss_id,rb.max_hp FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.id=? AND ri.status='ENDED' LIMIT 1").bind(user.id,instanceId).first()
        :await env.DB.prepare("SELECT rp.id,rp.reward_claimed,ri.id AS instance_id,ri.status,ri.current_hp,ri.boss_id,rb.max_hp FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status='ENDED' ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();
      if(!row)return json({error:'수령 가능한 레이드 보상이 없습니다.'},404);
      const cancelled=await env.DB.prepare("SELECT instance_id FROM raid_room_cancellations WHERE instance_id=? AND status='COMPLETED'").bind(row.instance_id).first();
      if(cancelled)return json({error:'최소 인원 미달로 취소된 레이드는 보상 대상이 아닙니다. 입장 횟수와 개설 비용은 복구되었습니다.'},409);

      let receipt=await env.DB.prepare('SELECT status,response_json,reward_coin AS rewardCoin,reward_shards AS rewardShards,COALESCE(reward_magic_crystals,0) AS rewardMagicCrystals,created_at AS createdAt,updated_at AS updatedAt FROM raid_reward_receipts WHERE instance_id=? AND user_id=?').bind(row.instance_id,user.id).first();
      const expected=body&&typeof body.expectedReward==='object'&&body.expectedReward?body.expectedReward:null;
      if(expected&&receipt&&String(receipt.status||'').toUpperCase()!=='COMPLETED'){
        const mismatch=Number(expected.instanceId||instanceId)!==Number(row.instance_id)
          ||Math.max(0,Number(expected.coin||0))!==Math.max(0,Number(receipt.rewardCoin||0))
          ||Math.max(0,Number(expected.shards||0))!==Math.max(0,Number(receipt.rewardShards||0))
          ||Math.max(0,Number(expected.magicCrystals||0))!==Math.max(0,Number(receipt.rewardMagicCrystals||0));
        if(mismatch)return json({error:'결과 화면과 서버 확정 보상이 일치하지 않아 지급을 중단했습니다. 보상 화면을 새로고침해주세요.',rewardMismatch:true,instanceId:Number(row.instance_id),actualReward:{coin:Math.max(0,Number(receipt.rewardCoin||0)),shards:Math.max(0,Number(receipt.rewardShards||0)),magicCrystals:Math.max(0,Number(receipt.rewardMagicCrystals||0))}},409);
      }
      if(receipt?.status==='COMPLETED'&&receipt.response_json){
        try{return json(JSON.parse(receipt.response_json))}catch{}
      }
      if(receipt?.status==='PENDING'){
        const pendingAt=Date.parse(receipt.updatedAt||receipt.createdAt||0),pendingAgeMs=Number.isFinite(pendingAt)?Math.max(0,Date.now()-pendingAt):Number.MAX_SAFE_INTEGER;
        if(pendingAgeMs<10000)return json({error:'레이드 보상을 정산 중입니다. 잠시 후 자동으로 다시 확인합니다.',settlementPending:true,retryAfterMs:Math.max(1500,10000-pendingAgeMs)},409);
        const latestParticipant=await env.DB.prepare('SELECT reward_claimed AS rewardClaimed FROM raid_participants WHERE id=? LIMIT 1').bind(row.id).first();
        if(Number(latestParticipant?.rewardClaimed||0)===1){
          const updatedUser=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
          if(!updatedUser)return json({error:'유저 정보를 찾을 수 없습니다.'},404);
          const recovered={ok:true,instanceId:Number(row.instance_id),rewardClaimed:true,rewardCoin:Math.max(0,Number(receipt.rewardCoin||0)),rewardShards:Math.max(0,Number(receipt.rewardShards||0)),rewardMagicCrystals:Math.max(0,Number(receipt.rewardMagicCrystals||0)),balanceAfter:Number(updatedUser.coin||0),shardsAfter:Number(updatedUser.card_shards||0),magicCrystalsAfter:Number(updatedUser.magic_crystals||0),rewardSource:'SERVER_RECOVERED',user:await profile(env,updatedUser)};
          await env.DB.prepare("UPDATE raid_reward_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(recovered),row.instance_id,user.id).run();
          return json(recovered);
        }
        await env.DB.prepare("UPDATE raid_reward_receipts SET status='RETRYABLE',error_message='STALE_PENDING_RECOVERED',updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='PENDING'").bind(row.instance_id,user.id).run();
        receipt={...receipt,status:'RETRYABLE'};
      }
      if(Number(row.reward_claimed||0)&&receipt?.status!=='COMPLETED'){
        const updatedUser=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(!updatedUser)return json({error:'유저 정보를 찾을 수 없습니다.'},404);
        const recovered={ok:true,instanceId:Number(row.instance_id),rewardClaimed:true,rewardCoin:Math.max(0,Number(receipt?.rewardCoin||0)),rewardShards:Math.max(0,Number(receipt?.rewardShards||0)),rewardMagicCrystals:Math.max(0,Number(receipt?.rewardMagicCrystals||0)),balanceAfter:Number(updatedUser.coin||0),shardsAfter:Number(updatedUser.card_shards||0),magicCrystalsAfter:Number(updatedUser.magic_crystals||0),rewardSource:'SERVER_RECOVERED',user:await profile(env,updatedUser)};
        if(receipt)await env.DB.prepare("UPDATE raid_reward_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(recovered),row.instance_id,user.id).run();
        return json(recovered);
      }

      const cleared=Number(row.current_hp||0)<=0,instanceCfg=await raidInstanceSettingsV1293(env,row.instance_id,cfg);await ensureRaidFinalizedV1293(env,row.instance_id,instanceCfg);const rewardCfg=await raidRewardSnapshot(env,row.instance_id,instanceCfg,true),finalState=await raidFinalParticipantV1293(env,row.instance_id,user.id),finalRank=Math.max(0,Number(finalState?.finalRank||await raidUserFinalRank(env,row.instance_id,user.id))),finalDamage=Math.max(0,Number(finalState?.finalDamage||0));
      const fixedPlan=await ensureRaidUserRewardPlanV1293(env,{instanceId:row.instance_id,userId:user.id,cfg:instanceCfg,totalDamage:finalDamage,finalRank,cleared}),rewardDisplay=raidRewardDisplayV1293(fixedPlan.plan);
      const rewardCoin=Math.max(0,Number(rewardDisplay.coin||0)),rewardShards=Math.max(0,Number(rewardDisplay.shards||0));
      const rankMagicCrystals=Math.max(0,Number(magicRewardForRank(rewardCfg.rankMagicRewards,finalRank)||0));
      const rewardMagicCrystals=Math.max(0,Number(rewardCfg.participationMagicCrystals||0)+rankMagicCrystals);
      // V1121: 화면에 표시한 READY 영수증을 그대로 PENDING으로 잠그며 재계산값으로 덮지 않는다.
      let reserved={meta:{changes:0}};
      if(receipt&&String(receipt.status||'').toUpperCase()==='READY'){
        reserved=await env.DB.prepare("UPDATE raid_reward_receipts SET status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='READY'").bind(row.instance_id,user.id).run();
      }else if(receipt&&['RETRYABLE','FAILED'].includes(String(receipt.status||'').toUpperCase())){
        reserved=await env.DB.prepare("UPDATE raid_reward_receipts SET status='PENDING',reward_coin=?,reward_shards=?,reward_magic_crystals=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status IN ('RETRYABLE','FAILED')").bind(rewardCoin,rewardShards,rewardMagicCrystals,row.instance_id,user.id).run();
      }
      if(!reserved.meta.changes&&!receipt)reserved=await env.DB.prepare("INSERT OR IGNORE INTO raid_reward_receipts(instance_id,user_id,status,reward_coin,reward_shards,reward_magic_crystals) VALUES(?,?,'PENDING',?,?,?)").bind(row.instance_id,user.id,rewardCoin,rewardShards,rewardMagicCrystals).run();
      if(!reserved.meta.changes){
        const duplicate=await env.DB.prepare('SELECT status,response_json,created_at AS createdAt,updated_at AS updatedAt FROM raid_reward_receipts WHERE instance_id=? AND user_id=?').bind(row.instance_id,user.id).first();
        if(duplicate?.status==='COMPLETED'&&duplicate.response_json){try{return json(JSON.parse(duplicate.response_json))}catch{}}
        const duplicateAt=Date.parse(duplicate?.updatedAt||duplicate?.createdAt||0),duplicateAgeMs=Number.isFinite(duplicateAt)?Math.max(0,Date.now()-duplicateAt):0;
        return json({error:'레이드 보상을 정산 중입니다. 잠시 후 자동으로 다시 확인합니다.',settlementPending:true,retryAfterMs:Math.max(1500,10000-duplicateAgeMs)},409);
      }

      const lockedReceipt=await env.DB.prepare("SELECT reward_coin AS rewardCoin,reward_shards AS rewardShards,COALESCE(reward_magic_crystals,0) AS rewardMagicCrystals FROM raid_reward_receipts WHERE instance_id=? AND user_id=? AND status='PENDING'").bind(row.instance_id,user.id).first();
      if(!lockedReceipt)return json({error:'레이드 보상 영수증을 확정하지 못했습니다. 다시 시도해주세요.'},409);
      const fixedRewardCoin=Math.max(0,Number(lockedReceipt.rewardCoin||0));
      const fixedRewardShards=Math.max(0,Number(lockedReceipt.rewardShards||0));
      const fixedRewardMagicCrystals=Math.max(0,Number(lockedReceipt.rewardMagicCrystals||0));
      try{
        const inventoryGrant=await raidInventoryGrantStatementsV1293(env,{userId:user.id,instanceId:row.instance_id,inventoryRewards:rewardDisplay.inventoryRewards});
        const before=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(!before)throw new Error('유저 정보를 찾을 수 없습니다.');
        const balanceAfter=Number(before.coin||0)+fixedRewardCoin;
        const shardsAfter=Number(before.card_shards||0)+fixedRewardShards;
        const magicCrystalsAfter=Number(before.magic_crystals||0)+fixedRewardMagicCrystals;
        const response={ok:true,instanceId:Number(row.instance_id),rewardClaimed:true,rewardCoin:fixedRewardCoin,rewardShards:fixedRewardShards,rewardMagicCrystals:fixedRewardMagicCrystals,participationMagicCrystals:Number(rewardCfg.participationMagicCrystals||0),rankMagicCrystals,finalRank,finalDamage,inventoryRewards:inventoryGrant.balances,rewardEntries:rewardDisplay.entries,rareDrops:rewardDisplay.rareDrops,balanceAfter,shardsAfter,magicCrystalsAfter,rewardSource:'SERVER_CONFIRMED'};
        const rewardStatements=[
          env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+?,magic_crystals=magic_crystals+? WHERE id=?').bind(fixedRewardCoin,fixedRewardShards,fixedRewardMagicCrystals,user.id),
          env.DB.prepare('UPDATE raid_participants SET reward_claimed=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND reward_claimed=0').bind(row.id),
          env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'RAID_REWARD')").bind(user.id,fixedRewardCoin,balanceAfter),
          env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'RAID_REWARD')").bind(user.id,fixedRewardShards,shardsAfter),
          ...inventoryGrant.statements,
          env.DB.prepare("UPDATE raid_user_reward_v1293 SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(row.instance_id,user.id),
          env.DB.prepare("UPDATE raid_reward_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(response),row.instance_id,user.id)
        ];
        if(fixedRewardMagicCrystals>0)rewardStatements.splice(4,0,env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,'월드레이드 보상','RAID',?)").bind(user.id,fixedRewardMagicCrystals,magicCrystalsAfter,String(row.instance_id)));
        await env.DB.batch(rewardStatements);

        const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(Number(updated?.coin)!==balanceAfter||Number(updated?.card_shards)!==shardsAfter||Number(updated?.magic_crystals||0)!==magicCrystalsAfter)throw new Error('레이드 보상 지급 후 잔액 검증에 실패했습니다.');
        response.user=await profile(env,updated);
        if(cleared){try{response.equipmentReward=await grantEquipmentDrop(env,{userId:user.id,sourceType:'RAID',sourceId:String(row.boss_id||'*'),requestId:`RAID:${row.instance_id}:${user.id}`});response.blackMiracleReward=await rollBlackMiracleDrop(env,{userId:user.id,source:'RAID',referenceId:`RAID:${row.instance_id}:${user.id}`})}catch(equipmentError){console.error('raid equipment drop failed',equipmentError)}}
        response.rerollTicketDrop=await grantHighGradeRerollDrop(env,{userId:user.id,content:'RAID',referenceId:String(row.instance_id)});
        await env.DB.prepare("UPDATE raid_reward_receipts SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(response),row.instance_id,user.id).run();
        return json(response);
      }catch(error){
        await env.DB.prepare("UPDATE raid_reward_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='PENDING'").bind(String(error?.message||error||'RAID_REWARD_FAILED').slice(0,500),row.instance_id,user.id).run();
        throw error;
      }
    }

    if(path==='rift/status'&&request.method==='GET'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await riftSettings(env),weekly=await riftWeeklyRow(env,user.id,settings),run=await riftLatestRun(env,user.id),[runCards,savedDeck,balance,characterBonus]=await Promise.all([run?riftDeckCardsInfo(env,user.id,run.deck):Promise.resolve([]),pveDeckCards(env,user.id),env.DB.prepare('SELECT magic_crystals FROM users WHERE id=?').bind(user.id).first(),userEquipmentBonuses(env,user.id)]);
      return json({settings,weekly,run:riftPublicRun(run,runCards),savedDeck,characterBonus,magicCrystals:Number(balance?.magic_crystals||0),weekKey:weekly.weekKey});
    }
    if(path==='rift/start'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await riftSettings(env);if(!settings.enabled)return json({error:'현재 차원의 균열 원정이 중지되어 있습니다.'},503);
      const active=await env.DB.prepare("SELECT run_id,status FROM pve_rift_runs WHERE user_id=? AND status IN ('ACTIVE','COMPLETED_PENDING','CLAIMING') ORDER BY created_at DESC LIMIT 1").bind(user.id).first();if(active)return json({error:active.status==='ACTIVE'?'진행 중인 원정이 있습니다. 이어서 진행하거나 포기해주세요.':'완료한 원정 보상을 먼저 수령해주세요.',code:'RIFT_RUN_EXISTS'},409);
      const body=await readBody(request),difficulty=Math.max(1,Math.min(settings.maxDifficulty,Math.floor(Number(body.difficulty||1)))),deckInfo=await raidDeckPower(env,user.id),cards=await riftDeckCardsInfo(env,user.id,deckInfo.ids);if(cards.length!==5)return json({error:'저장된 PvE 덱 5장이 필요합니다.'},400);
      const weekly=await riftWeeklyRow(env,user.id,settings),runId=`rift-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,hp=Object.fromEntries(deckInfo.ids.map(id=>[String(id),100])),basePower=Math.max(100,cards.reduce((sum,card)=>sum+Number(card.power||0),0)),currentChoices=await riftBuildChoices(env,runId,0,difficulty,basePower),run={runId,weekKey:weekly.weekKey,difficulty,status:'ACTIVE',deck:deckInfo.ids.map(String),stage:0,maxStages:settings.maxStages,hp,buffs:[],history:[],currentChoices,activeNode:null,pendingBuffChoices:riftPickInitialBuffChoices(),initialBuffPending:true,stash:{coin:0,shards:0,crystals:0},basePower,rewardEligible:weekly.rewardCount<settings.weeklyRewardLimit,reviveUsed:false,noviceProtectionUsed:false,battleRewardBonusPercent:0,battleWinCounts:{BATTLE:0,ELITE:0}};
      await env.DB.batch([
        env.DB.prepare("INSERT INTO pve_rift_runs(run_id,user_id,week_key,difficulty,status,deck_cards,state_json) VALUES(?,?,?,?,'ACTIVE',?,?)").bind(runId,user.id,weekly.weekKey,difficulty,JSON.stringify(run.deck),JSON.stringify(riftStateForSave(run))),
        env.DB.prepare('UPDATE pve_rift_weekly SET started_count=started_count+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=?').bind(user.id,weekly.weekKey)
      ]);
      const nextWeekly=await riftWeeklyRow(env,user.id,settings);return json({ok:true,settings,weekly:nextWeekly,run:riftPublicRun(run,cards)});
    }
    if(path==='rift/select'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),runId=String(body.runId||''),requestId=String(body.requestId||''),nodeId=String(body.nodeId||'');
      const receipt=await riftReceiptStart(env,requestId,user.id,runId,'SELECT');if(receipt.response)return json(receipt.response);if(receipt.error)return json({error:receipt.error},409);
      try{const row=await env.DB.prepare("SELECT * FROM pve_rift_runs WHERE run_id=? AND user_id=? AND status='ACTIVE'").bind(runId,user.id).first();if(!row){await riftReceiptFail(env,requestId,'진행 중인 원정을 찾을 수 없습니다.');return json({error:'진행 중인 원정을 찾을 수 없습니다.'},404)}const run=riftStateFromRow(row);if(run.activeNode||run.pendingBuffChoices.length){await riftReceiptFail(env,requestId,'현재 선택을 먼저 완료해야 합니다.');return json({error:'현재 전투 또는 강화 선택을 먼저 완료해주세요.'},409)}const node=run.currentChoices.find(x=>String(x.id)===nodeId);if(!node){await riftReceiptFail(env,requestId,'선택할 수 없는 노드입니다.');return json({error:'선택할 수 없는 원정 노드입니다.'},400)}const settings=await riftSettings(env);
        if(['BATTLE','ELITE','BOSS','FINAL_BOSS'].includes(node.type)){run.activeNode=node;run.currentChoices=[];}else{const hp={...run.hp},history={stage:run.stage,type:node.type,name:node.name,result:'RESOLVED',at:new Date().toISOString()};if(node.type==='REST'){for(const id of run.deck)if(Number(hp[id]||0)>0)hp[id]=Math.min(100,Number(hp[id]||0)+25);history.detail='생존 카드 체력 25 회복';}else if(node.type==='EVENT'){if(node.eventKind==='HEAL'){for(const id of run.deck)if(Number(hp[id]||0)>0)hp[id]=Math.min(100,Number(hp[id]||0)+15);history.detail='전 카드 체력 15 회복';}else if(node.eventKind==='CRYSTAL'){const amount=Number(settings.eventCrystalReward||0);run.stash.crystals=Number(run.stash.crystals||0)+amount;history.detail=`마법 결정 ${amount} 획득`;}else{if(!run.buffs.includes('ATTACK_CORE'))run.buffs.push('ATTACK_CORE');history.detail='공격 코어 획득';}}else if(node.type==='RISK'){for(const id of run.deck)if(Number(hp[id]||0)>0)hp[id]=Math.max(1,Number(hp[id]||0)-10);const amount=Number(settings.riskCrystalReward||0);run.stash.crystals=Number(run.stash.crystals||0)+amount;history.detail=`체력 10 소모 · 마법 결정 ${amount} 획득`;}run.hp=hp;run.history.push(history);run.stage++;run.currentChoices=await riftBuildChoices(env,run.runId,run.stage,run.difficulty,run.basePower);}
        const cards=await riftDeckCardsInfo(env,user.id,run.deck),response={ok:true,run:riftPublicRun(run,cards)};await env.DB.batch([env.DB.prepare("UPDATE pve_rift_runs SET state_json=?,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='ACTIVE'").bind(JSON.stringify(riftStateForSave(run)),runId,user.id),env.DB.prepare("UPDATE pve_rift_action_receipts SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId)]);return json(response);
      }catch(error){await riftReceiptFail(env,requestId,error.message);throw error}
    }
    if(path==='rift/fight'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),runId=String(body.runId||''),requestId=String(body.requestId||''),receipt=await riftReceiptStart(env,requestId,user.id,runId,'FIGHT');if(receipt.response)return json(receipt.response);if(receipt.error)return json({error:receipt.error},409);
      try{const row=await env.DB.prepare("SELECT * FROM pve_rift_runs WHERE run_id=? AND user_id=? AND status='ACTIVE'").bind(runId,user.id).first();if(!row){await riftReceiptFail(env,requestId,'진행 중인 원정을 찾을 수 없습니다.');return json({error:'진행 중인 원정을 찾을 수 없습니다.'},404)}const run=riftStateFromRow(row),node=run.activeNode;if(!node||!['BATTLE','ELITE','BOSS','FINAL_BOSS'].includes(node.type)){await riftReceiptFail(env,requestId,'전투 노드가 선택되지 않았습니다.');return json({error:'먼저 전투 노드를 선택해주세요.'},409)}const battle=await battleSettings(env),cards=await riftDeckCardsInfo(env,user.id,run.deck);if(cards.length!==5){await riftReceiptFail(env,requestId,'원정 덱 카드를 확인할 수 없습니다.');return json({error:'원정 덱 카드 일부를 확인할 수 없습니다.'},400)}const totals=riftBuffTotals(run.buffs),boss=node.type==='BOSS'||node.type==='FINAL_BOSS',elite=node.type==='ELITE',aliveCards=cards.filter(c=>Number(run.hp?.[String(c.id)]||0)>0),hpPower=cards.reduce((sum,c)=>sum+Number(c.power||0)*Math.max(0,Math.min(100,Number(run.hp?.[String(c.id)]||0)))/100,0),bonusPct=totals.attackPercent+(boss?totals.bossPercent:0)+(elite?totals.elitePercent:0),characterBonus=await userEquipmentBonuses(env,user.id),riftCardPower=Math.max(0,Math.floor(hpPower*(1+bonusPct/100)*(0.97+Math.random()*.06))),playerPower=riftCardPower+Number(characterBonus.pve||0),activatedEntry=selectActivatedUltimate(battle,aliveCards),activatedUltimate=activatedEntry?.rule||null,ultimateSourceCard=activatedEntry?.matchedCards?.[0]||null,ultimateRawDamage=activatedUltimate&&ultimateSourceCard?Math.max(0,Math.floor(Number(ultimateSourceCard.power||0)*Number(activatedUltimate.coefficientPercent||0)/100)):0,ultimateDefensePercent=riftMonsterUltimateDefensePercent(run.difficulty),ultimateDamage=Math.max(0,Math.floor(ultimateRawDamage*(1-ultimateDefensePercent/100))),totalBattleDamage=playerPower+ultimateDamage,storedMonsterPower=Math.max(1,Number(node.battlePower||1)),monsterPowerScale=riftMonsterPowerScale(run,node),monsterPower=Math.max(1,Math.floor(storedMonsterPower*monsterPowerScale)),win=totalBattleDamage>=monsterPower,ratio=monsterPower/Math.max(1,totalBattleDamage),baseDamage=win?(node.type==='BATTLE'?6:elite?11:16):(node.type==='BATTLE'?24:elite?30:36);let damage=Math.max(3,Math.min(60,Math.round(baseDamage*Math.max(.75,Math.min(1.45,ratio))*(1-totals.damageReducePercent/100)*(1+totals.damageTakenPercent/100))));const noviceProtectionTriggered=!win&&Number(run.difficulty||1)===1&&!run.noviceProtectionUsed;if(noviceProtectionTriggered){damage=Math.max(2,Math.ceil(damage/2));run.noviceProtectionUsed=true}const hp={...run.hp};for(const id of run.deck)if(Number(hp[id]||0)>0)hp[id]=Math.max(0,Number(hp[id]||0)-damage);let revivedCardId=null;if(!run.reviveUsed&&totals.reviveOnce){const dead=run.deck.find(id=>Number(hp[id]||0)<=0);if(dead){hp[dead]=Math.max(1,Math.floor(Number(totals.reviveHp||40)));run.reviveUsed=true;revivedCardId=dead}}if(win&&totals.healAfterWin>0)for(const id of run.deck)if(Number(hp[id]||0)>0)hp[id]=Math.min(100,Number(hp[id]||0)+totals.healAfterWin);run.hp=hp;const alive=run.deck.filter(id=>Number(hp[id]||0)>0).length,history={stage:run.stage,type:node.type,name:node.name,result:win?'WIN':'LOSE',playerPower,totalBattleDamage,monsterPower,monsterPowerMultiplier:riftHighDifficultyMonsterPowerMultiplier(run.difficulty),damage,ultimateRawDamage,ultimateDefensePercent,ultimateDamage,ultimateName:activatedUltimate?.name||'',ultimateSourceCardId:ultimateSourceCard?.id||null,noviceProtectionTriggered,at:new Date().toISOString()};run.history.push(history);let completed=false,status='ACTIVE';if(win){const settings=await riftSettings(env),difficultyIndex=Math.max(0,Math.min(19,Number(run.difficulty||1)-1)),difficultyMultiplier=Number(settings.difficultyRewardPercent?.[difficultyIndex]||100)/100,crystalDifficultyBonus=Number(settings.difficultyCrystalBonus?.[difficultyIndex]||run.difficulty||1),nodeMultiplier=Number(settings.nodeRewardPercent?.[node.type]||100)/100,shardMultiplier=Number(settings.shardRewardPercent?.[node.type]||100)/100,crystalBonus=1+totals.crystalPercent/100;run.stash.coin=Number(run.stash.coin||0)+Math.floor((settings.baseCoin+run.stage*settings.stageCoinIncrease)*difficultyMultiplier*nodeMultiplier);run.stash.shards=Number(run.stash.shards||0)+Math.floor(settings.baseShards*difficultyMultiplier*shardMultiplier);run.stash.crystals=Number(run.stash.crystals||0)+Math.floor((settings.baseCrystals+run.stage+crystalDifficultyBonus)*nodeMultiplier*crystalBonus);if(node.type==='BATTLE'||node.type==='ELITE'){const clearBonus=node.type==='ELITE'?20:10;run.battleRewardBonusPercent=Math.max(0,Number(run.battleRewardBonusPercent||0))+clearBonus;run.battleWinCounts=run.battleWinCounts&&typeof run.battleWinCounts==='object'?run.battleWinCounts:{BATTLE:0,ELITE:0};run.battleWinCounts[node.type]=Math.max(0,Number(run.battleWinCounts[node.type]||0))+1;history.rewardBonusPercent=clearBonus;history.totalRewardBonusPercent=run.battleRewardBonusPercent;}run.activeNode=null;if(node.type==='FINAL_BOSS'){completed=true;status='COMPLETED_PENDING';run.currentChoices=[];run.pendingBuffChoices=[];}else{run.pendingBuffChoices=riftPickBuffChoices(run.buffs);}}else if(alive===0){status='FAILED';run.activeNode=null;run.currentChoices=[];run.pendingBuffChoices=[];}
        run.status=status;const equipmentReward=win?await safeEquipmentDrop(env,{userId:user.id,sourceType:'RIFT',sourceId:String(node.monsterId||node.type||'*'),requestId}):null,publicRun=riftPublicRun(run,cards),response={ok:true,result:win?'WIN':'LOSE',playerPower,riftCardPower,characterBonus,equipmentReward,totalBattleDamage,monsterPower,monsterPowerMultiplier:riftHighDifficultyMonsterPowerMultiplier(run.difficulty),monsterPowerBonusPercent:Math.max(0,Math.round((riftHighDifficultyMonsterPowerMultiplier(run.difficulty)-1)*100)),damage,revivedCardId,noviceProtectionTriggered,completed,ultimateRawDamage,ultimateDefensePercent,ultimateDamage,bonusDamage:ultimateDamage,activatedUltimate,ultimateSourceCard:ultimateSourceCard?{id:ultimateSourceCard.id,title:ultimateSourceCard.title,rarity:ultimateSourceCard.rarity,power:ultimateSourceCard.power,breakthroughLevel:ultimateSourceCard.breakthrough_level}:null,run:publicRun};const statements=[env.DB.prepare("UPDATE pve_rift_runs SET status=?,state_json=?,updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ?='COMPLETED_PENDING' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE run_id=? AND user_id=?").bind(status,JSON.stringify(riftStateForSave(run)),status,runId,user.id),env.DB.prepare("UPDATE pve_rift_action_receipts SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId)];if(completed)statements.splice(1,0,env.DB.prepare('UPDATE pve_rift_weekly SET completed_count=completed_count+1,highest_difficulty=MAX(highest_difficulty,?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=?').bind(run.difficulty,user.id,run.weekKey));await env.DB.batch(statements);return json(response);
      }catch(error){await riftReceiptFail(env,requestId,error.message);throw error}
    }
    if(path==='rift/buff'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),runId=String(body.runId||''),requestId=String(body.requestId||''),buffKey=String(body.buffKey||''),receipt=await riftReceiptStart(env,requestId,user.id,runId,'BUFF');if(receipt.response)return json(receipt.response);if(receipt.error)return json({error:receipt.error},409);
      try{const row=await env.DB.prepare("SELECT * FROM pve_rift_runs WHERE run_id=? AND user_id=? AND status='ACTIVE'").bind(runId,user.id).first();if(!row){await riftReceiptFail(env,requestId,'진행 중인 원정을 찾을 수 없습니다.');return json({error:'진행 중인 원정을 찾을 수 없습니다.'},404)}const run=riftStateFromRow(row);if(!run.pendingBuffChoices.includes(buffKey)){await riftReceiptFail(env,requestId,'선택할 수 없는 강화입니다.');return json({error:'선택할 수 없는 원정 강화입니다.'},400)}const initialSelection=run.initialBuffPending===true;if(!run.buffs.includes(buffKey))run.buffs.push(buffKey);run.pendingBuffChoices=[];run.initialBuffPending=false;if(!initialSelection){run.stage++;run.currentChoices=await riftBuildChoices(env,run.runId,run.stage,run.difficulty,run.basePower);}const cards=await riftDeckCardsInfo(env,user.id,run.deck),response={ok:true,run:riftPublicRun(run,cards)};await env.DB.batch([env.DB.prepare("UPDATE pve_rift_runs SET state_json=?,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='ACTIVE'").bind(JSON.stringify(riftStateForSave(run)),runId,user.id),env.DB.prepare("UPDATE pve_rift_action_receipts SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId)]);return json(response);
      }catch(error){await riftReceiptFail(env,requestId,error.message);throw error}
    }
    if(path==='rift/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),runId=String(body.runId||''),requestId=String(body.requestId||''),receipt=await riftReceiptStart(env,requestId,user.id,runId,'CLAIM');if(receipt.response)return json(receipt.response);if(receipt.error)return json({error:receipt.error},409);
      try{const reserved=await env.DB.prepare("UPDATE pve_rift_runs SET status='CLAIMING',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='COMPLETED_PENDING'").bind(runId,user.id).run();if(!reserved.meta.changes){await riftReceiptFail(env,requestId,'수령 가능한 원정 보상이 없습니다.');return json({error:'수령 가능한 원정 보상이 없습니다.'},409)}const row=await env.DB.prepare("SELECT * FROM pve_rift_runs WHERE run_id=? AND user_id=? AND status='CLAIMING'").bind(runId,user.id).first(),run=riftStateFromRow(row),settings=await riftSettings(env),weekly=await riftWeeklyRow(env,user.id,settings),eligible=run.rewardEligible&&weekly.rewardCount<settings.weeklyRewardLimit,rewardBonusPercent=Math.max(0,Number(run.battleRewardBonusPercent||0)),rewardMultiplier=1+rewardBonusPercent/100,coin=eligible?Math.max(0,Math.floor(Number(run.stash.coin||0)*rewardMultiplier)):0,shards=eligible?Math.max(0,Math.floor(Number(run.stash.shards||0)*rewardMultiplier)):0,magicCrystals=eligible?Math.max(0,Math.floor(Number(run.stash.crystals||0)*rewardMultiplier)):0,before=await env.DB.prepare('SELECT coin,card_shards,magic_crystals FROM users WHERE id=?').bind(user.id).first(),coinAfter=Number(before?.coin||0)+coin,shardsAfter=Number(before?.card_shards||0)+shards,magicCrystalsAfter=Number(before?.magic_crystals||0)+magicCrystals,response={ok:true,rewarded:eligible,reward:{coin,shards,crystals:magicCrystals,magicCrystals,baseCoin:Math.max(0,Math.floor(Number(run.stash.coin||0))),baseShards:Math.max(0,Math.floor(Number(run.stash.shards||0))),baseMagicCrystals:Math.max(0,Math.floor(Number(run.stash.crystals||0))),battleRewardBonusPercent:rewardBonusPercent},message:eligible?(rewardBonusPercent>0?`전투 승리 보너스 +${rewardBonusPercent}%가 적용된 원정 보상을 수령했습니다.`:'원정 보상을 수령했습니다.'):'이번 주 보상 횟수를 모두 사용해 기록만 반영되었습니다.'};const statements=[env.DB.prepare("UPDATE pve_rift_runs SET status='CLAIMED',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='CLAIMING'").bind(runId,user.id)];if(eligible){statements.unshift(env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+?,magic_crystals=magic_crystals+? WHERE id=?').bind(coin,shards,magicCrystals,user.id),env.DB.prepare("UPDATE pve_rift_weekly SET reward_count=reward_count+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND week_key=? AND reward_count<?").bind(user.id,run.weekKey,settings.weeklyRewardLimit));if(coin>0)statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'차원의 균열 원정 보상')").bind(user.id,coin,coinAfter));if(shards>0)statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'차원의 균열 원정 보상')").bind(user.id,shards,shardsAfter));if(magicCrystals>0)statements.push(env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,'차원의 균열 원정 보상','RIFT',?)").bind(user.id,magicCrystals,magicCrystalsAfter,runId));}statements.push(env.DB.prepare("UPDATE pve_rift_action_receipts SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId));await env.DB.batch(statements);const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();response.user=await profile(env,updated);response.weekly=await riftWeeklyRow(env,user.id,settings);response.magicCrystals=Number(updated?.magic_crystals||0);await env.DB.prepare("UPDATE pve_rift_action_receipts SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId).run();return json(response);
      }catch(error){await env.DB.prepare("UPDATE pve_rift_runs SET status='COMPLETED_PENDING',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='CLAIMING'").bind(runId,user.id).run();await riftReceiptFail(env,requestId,error.message);throw error}
    }
    if(path==='rift/abandon'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),runId=String(body.runId||'').trim();if(!runId)return json({error:'포기할 원정 정보가 없습니다.'},400);const result=await env.DB.prepare("UPDATE pve_rift_runs SET status='ABANDONED',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND COALESCE(status,'ACTIVE') NOT IN ('CLAIMED','ABANDONED')").bind(runId,user.id).run();if(!result.meta.changes){const current=await riftLatestRun(env,user.id);if(current)return json({error:'현재 진행 중인 다른 원정이 있습니다. 화면을 새로 불러와주세요.',run:current},409);return json({error:'포기할 원정을 찾을 수 없습니다.'},404)}return json({ok:true,runId});
    }

    if(path==='battle/config'){
      const user=await authenticate(request,env); if(!user) return json({error:'로그인이 필요합니다.'},401);
      const burning=await burningEventSettings(env),settings=applyBurningPveSettings(await battleSettings(env),burning);
      const monsters=await env.DB.prepare(`SELECT id,name,image_url AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss,COALESCE(monster_category,CASE WHEN is_boss=1 THEN 'BOSS' ELSE 'GENERAL' END) AS category,COALESCE(pve_tab,CASE WHEN is_boss=1 THEN 'BOSS' ELSE 'GENERAL' END) AS pveTab,COALESCE(pve_display_order,sort_order,0) AS displayOrder,COALESCE(pve_enabled,1) AS pveEnabled,COALESCE(tower_enabled,0) AS towerEnabled,COALESCE(tower_only,0) AS towerOnly FROM battle_monsters WHERE is_active=1 AND COALESCE(pve_enabled,1)=1 AND COALESCE(tower_only,0)=0 ORDER BY COALESCE(pve_display_order,sort_order,0),sort_order,id`).all();
      const [deck,characterBonus,energy]=await Promise.all([pveDeckCards(env,user.id),userEquipmentBonuses(env,user.id),battleEnergyState(env,user,settings)]);
      const publicMonsters=(monsters.results||[]).map(monster=>{
        const profile=pveDifficultyRuntime(settings,monster);
        return {...monster,pveTab:profile.difficulty,baseBattlePower:Number(monster.battlePower||0),battlePower:profile.effectiveBattlePower,baseRewardCoin:Number(monster.rewardCoin||0),rewardCoin:profile.effectiveRewardCoin,difficulty:profile.difficulty,nightmare:profile.isNightmare?{hpPercent:profile.hpPercent,attackPercent:profile.attackPercent,defensePercent:profile.defensePercent,speedPercent:profile.speedPercent,rewardPercent:profile.rewardPercent,bossUltimateCapPercent:profile.bossUltimateCapPercent,damageCapUnlocked:profile.bossUltimateUnlocked}:null,__enabled:profile.enabled};
      }).filter(monster=>monster.__enabled).map(({__enabled,...monster})=>monster);
      return json({settings,deck,characterBonus,energy,serverNow:new Date().toISOString(),monsters:publicMonsters,burningEvent:burningPublicState(burning),battleEngine:battleEngineState(settings,user)});
    }
    if(path==='battle/deck'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),ids=[...new Set((body.cardIds||[]).map(String))];
      if(ids.length!==5)return json({error:'PvE 덱은 보유 카드 5장으로 편성해야 합니다.'},400);
      const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT card_id FROM user_cards WHERE user_id=? AND COALESCE(quantity,0)>0 AND card_id IN (${marks})`).bind(user.id,...ids).all();
      if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      try{await validateDeckGradeLimits(env,ids,'PvE 덱')}catch(error){return json({error:error.message,code:error.code,grade:error.grade,count:error.count,limit:error.limit},400)}
      await env.DB.prepare('INSERT INTO pve_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,JSON.stringify(ids)).run();
      return json({ok:true,deck:ids});
    }
    if(path==='battle/deck'&&request.method==='DELETE'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await env.DB.prepare('DELETE FROM pve_decks WHERE user_id=?').bind(user.id).run();
      return json({ok:true,deck:[]});
    }
    if(path==='battle/auto'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'다른 기기 또는 창에서 다시 로그인되어 현재 로그인이 종료되었습니다.',code:'SESSION_REPLACED'},401);
      const burning=await burningEventSettings(env),settings=applyBurningPveSettings(await battleSettings(env),burning);if(!settings.enabled)return json({error:'현재 전투 콘텐츠가 중지되어 있습니다.'},503);
      const payload=await readBody(request),requestId=String(payload.requestId||'').trim(),monsterId=Number(payload.monsterId),ids=[...new Set((payload.cardIds||[]).map(String))];
      if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))return json({error:'자동사냥 요청 정보가 올바르지 않습니다.'},400);
      const previous=await env.DB.prepare('SELECT user_id,status,response_json FROM pve_auto_runs WHERE request_id=?').bind(requestId).first();
      if(previous){if(Number(previous.user_id)!==Number(user.id))return json({error:'잘못된 자동사냥 요청입니다.'},403);if(previous.status==='COMPLETED'&&previous.response_json)return json(JSON.parse(previous.response_json));return json({error:'동일한 자동사냥 요청이 이미 처리 중입니다.',code:'AUTO_HUNT_RUNNING'},409);}
      if(ids.length!==5)return json({error:'보유 카드 5장을 편성해야 합니다.'},400);
      try{await validateDeckGradeLimits(env,ids,'PvE 덱')}catch(error){return json({error:error.message,code:error.code,grade:error.grade,count:error.count,limit:error.limit},400)}
      const monster=await env.DB.prepare('SELECT * FROM battle_monsters WHERE id=? AND is_active=1 AND COALESCE(pve_enabled,1)=1 AND COALESCE(tower_only,0)=0').bind(monsterId).first();if(!monster)return json({error:'전투할 몬스터를 찾을 수 없습니다.'},404);
      const autoDifficulty=pveDifficultyRuntime(settings,monster);if(!autoDifficulty.enabled)return json({error:'현재 나이트메어 토벌은 중지되어 있습니다.',code:'NIGHTMARE_DISABLED'},503);
      const energyBefore=await battleEnergyState(env,user,settings);if(energyBefore.unlimited)return json({error:'무제한 계정에서는 남은 횟수 자동사냥을 사용할 수 없습니다.'},400);
      const battleCount=Math.floor(Number(energyBefore.energy||0)/Math.max(1,Number(energyBefore.costPerBattle||1)));if(battleCount<1)return json({error:'전투 횟수가 부족합니다.',code:'NO_BATTLE_ENERGY',energy:energyBefore},429);
      const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(user.id,...ids).all();if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      const cards=owned.results.map(c=>({...c,power:cardBattlePower(c,c.breakthrough_level,settings)})),uniqueBattle=await cardUniqueDeckState(env,user,cards,'PVE'),lockUntil=new Date(Date.now()+120000).toISOString().replace('T',' ').slice(0,19);
      await env.DB.prepare("INSERT INTO pve_auto_locks(user_id,request_id,expires_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP WHERE pve_auto_locks.expires_at<=datetime('now')").bind(user.id,requestId,lockUntil).run();
      const lock=await env.DB.prepare('SELECT request_id FROM pve_auto_locks WHERE user_id=?').bind(user.id).first();if(lock?.request_id!==requestId)return json({error:'이미 다른 창에서 자동사냥이 진행 중입니다.',code:'AUTO_HUNT_LOCKED'},409);
      await env.DB.prepare("INSERT INTO pve_auto_runs(request_id,user_id,monster_id,status) VALUES(?,?,?,'RUNNING')").bind(requestId,user.id,monsterId).run();
      try{
        let battles=0,wins=0,losses=0,totalReward=0,energy=energyBefore;const cardRewards=[],cubeRewards=[],magicRewards=[],equipmentRewards=[],unifiedDrops=[];
        // V1785: 자동사냥은 한 요청에서 최대 수십 회 반복된다. 매회 왕복하던 battle_logs INSERT 를
        // 모아 두었다가 루프 종료 후 batch 로 한 번에, 그것도 응답 지연 경로 밖에서 쓴다.
        const autoBattleLogs=[];
        const magicCfg=await magicSettings(env),pveMagic=magicCfg.acquisition?.pve||{};
        for(let i=0;i<battleCount;i++){
          try{energy=await consumeBattleEnergy(env,user,settings)}catch(e){if(e.code==='NO_BATTLE_ENERGY'){energy=e.energy;break}throw e}
          const battleRef=`${requestId}:${i+1}`,one=await resolveAutoBattle(env,user,settings,monster,cards,ids,uniqueBattle,battleRef,{collectBattleLog:statement=>autoBattleLogs.push(statement)});battles++;totalReward+=Number(one.reward||0);
          const cubeReward=await grantBattleCube(env,user.id,'PVE',battleRef,one.result==='WIN');if(cubeReward)cubeRewards.push(cubeReward);
          if(one.result==='WIN'){
            wins++;
            const magicReward=await resolveMagicCrystalReward(env,{userId:user.id,source:'PVE_DROP',referenceId:battleRef,enabled:pveMagic.enabled===true,chance:pveMagic.chance,amount:pveMagic.amount,dailyLimit:pveMagic.dailyLimit,reason:'일반 PVE 승리 확률 드랍'});if(magicReward?.amount>0)magicRewards.push(magicReward);
          }else losses++;if(one.cardReward)cardRewards.push(one.cardReward);if(one.equipmentReward)equipmentRewards.push(one.equipmentReward);if(one.unifiedDrop?.rewards?.length)unifiedDrops.push(one.unifiedDrop);
        }
        // V1785: 모아둔 감사 로그를 50개씩 끊어 배치로 기록한다. 응답은 기다리지 않는다.
        if(autoBattleLogs.length){
          const chunks=[];
          for(let index=0;index<autoBattleLogs.length;index+=50)chunks.push(autoBattleLogs.slice(index,index+50));
          deferWrite('battle_logs:auto',async()=>{for(const chunk of chunks)await env.DB.batch(chunk)});
        }
        // V1791: 자동사냥은 회차 수만큼 반복되므로 프로필 비용이 그대로 배수로 붙는다.
        // 이번 실행에서 지급된 카드만 모아 배치 1회로 읽는다.
        const response={ok:true,battles,wins,losses,totalReward,cardRewards,cubeRewards,magicRewards,equipmentRewards,unifiedDrops,difficulty:autoDifficulty.difficulty,magicCrystalTotal:magicRewards.reduce((sum,x)=>sum+Number(x.amount||0),0),energy,serverNow:new Date().toISOString(),user:await battleResponseProfile(env,user,grantedCardIdsFromBattle({cardRewards,unifiedDrops}))};
        await env.DB.prepare("UPDATE pve_auto_runs SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId).run();
        await env.DB.prepare('DELETE FROM pve_auto_locks WHERE user_id=? AND request_id=?').bind(user.id,requestId).run();return json(response);
      }catch(error){await env.DB.prepare("UPDATE pve_auto_runs SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(String(error?.message||error).slice(0,500),requestId).run();await env.DB.prepare('DELETE FROM pve_auto_locks WHERE user_id=? AND request_id=?').bind(user.id,requestId).run();throw error}
    }
    if(path==='battle/fight'&&request.method==='POST'){
      const user=await authenticate(request,env); if(!user) return json({error:'로그인이 필요합니다.'},401);
      const burning=await burningEventSettings(env),settings=applyBurningPveSettings(await battleSettings(env),burning); if(!settings.enabled)return json({error:'현재 전투 콘텐츠가 중지되어 있습니다.'},503);
      const engineState=battleEngineState(settings,user);
      const payload=await readBody(request),requestId=String(payload.requestId||crypto.randomUUID()),monsterId=Number(payload.monsterId),ids=[...new Set((payload.cardIds||[]).map(String))];
      if(ids.length!==5)return json({error:'보유 카드 5장을 편성해야 합니다.'},400);
      try{await validateDeckGradeLimits(env,ids,'PvE 덱')}catch(error){return json({error:error.message,code:error.code,grade:error.grade,count:error.count,limit:error.limit},400)}
      const monster=await env.DB.prepare('SELECT * FROM battle_monsters WHERE id=? AND is_active=1 AND COALESCE(pve_enabled,1)=1 AND COALESCE(tower_only,0)=0').bind(monsterId).first();
      if(!monster)return json({error:'전투할 몬스터를 찾을 수 없습니다.'},404);
      const difficulty=pveDifficultyRuntime(settings,monster);
      if(!difficulty.enabled)return json({error:'현재 나이트메어 토벌은 중지되어 있습니다.',code:'NIGHTMARE_DISABLED'},503);
      let energyAfter;try{energyAfter=await consumeBattleEnergy(env,user,settings)}catch(e){if(e.code==='NO_BATTLE_ENERGY')return json({error:e.message,code:e.code,energy:e.energy},429);throw e}
      const marks=ids.map(()=>'?').join(',');
      const ownedRows=(await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,COALESCE(m.name,'') AS name,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id LEFT JOIN members m ON m.id=c.member_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.id IN (${marks})`).bind(user.id,...ids).all()).results||[];
      if(ownedRows.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      const ownedById=new Map(ownedRows.map(card=>[String(card.id),card]));
      const cards=ids.map(id=>ownedById.get(String(id))).filter(Boolean).map(c=>({...c,id:String(c.id),power:cardBattlePower(c,c.breakthrough_level,settings)}));
      const uniqueBattle=await cardUniqueDeckState(env,user,cards,'PVE'),uniqueCardsById=new Map((uniqueBattle.cards||[]).map(card=>[String(card.id),card]));
      const battleCards=cards.map(card=>uniqueCardsById.get(String(card.id))||card);
      const basePlayerPower=Number(uniqueBattle.power||cards.reduce((a,c)=>a+c.power,0)),monsterPower=difficulty.effectiveBattlePower;
      const uniqueRuntime=uniqueBattle.enabled?resolveUniqueBattleRuntime(uniqueBattle,{mode:'PVE',opponentPower:monsterPower}):null;
      const uniqueEffectivePower=Math.max(0,Number(uniqueRuntime?.effectivePower||basePlayerPower));
      const activatedEntry=selectActivatedUltimate(settings,battleCards),activatedUltimate=activatedEntry?.rule||null,ultimateSourceCard=activatedEntry?.matchedCards?.[0]||null;
      const ultimateDamage=activatedUltimate&&ultimateSourceCard?Math.max(0,Math.floor(Number(ultimateSourceCard.power||0)*Number(activatedUltimate.coefficientPercent||0)/100)):0;
      // V1785: magicSettings 는 뒤쪽에서 직렬로 await 되던 런타임 설정 조회다.
      // 어차피 이 시점에 필요한 다른 조회들과 독립적이므로 같은 Promise.all 에 합친다.
      const [synergy,characterBonus,magicLoadout,pveMagicSettings]=await Promise.all([evaluateDeckSynergies(env,user,ids,'PVE',{forceOwnerTest:String(user.role||'').toUpperCase()==='OWNER'}),userEquipmentBonuses(env,user.id),magicBattleLoadout(env,user,'PVE'),magicSettings(env)]);
      const synergyMultiplier=1+Number(synergy.totals.attackPercent||0)/100+(monster.is_boss?Number(synergy.totals.bossDamagePercent||0)/100:0),cardPower=Math.max(0,Math.floor(uniqueEffectivePower*synergyMultiplier)),playerPower=cardPower+Number(characterBonus.pve||0);
      const totalBattleDamage=playerPower+ultimateDamage,preliminaryResult=totalBattleDamage>=monsterPower?'WIN':'LOSE';
      const bossIsBoss=Number(monster.is_boss||0)===1||monster.is_boss===true,bossUltimateEnabled=Number(monster.ultimate_enabled||0)===1||monster.ultimate_enabled===true,bossUltimateConfigured=bossIsBoss&&bossUltimateEnabled;
      const bossTrigger=String(monster.ultimate_trigger||'ON_LOSS').toUpperCase(),bossChance=Math.max(0,Math.min(100,Number(monster.ultimate_chance??100))),bossForceCast=Number(monster.ultimate_force_cast||0)===1||monster.ultimate_force_cast===true,bossChanceHit=bossChance>=100||Math.random()*100<bossChance;
      const bossShouldCast=bossUltimateConfigured&&(bossForceCast||bossTrigger==='ALWAYS'||(bossTrigger==='ON_LOSS'&&preliminaryResult==='LOSE')||(bossTrigger==='CHANCE'&&bossChanceHit));
      const bossPveDamagePercent=difficulty.bossUltimateUnlocked?difficulty.bossUltimateCapPercent:Math.max(0,Math.min(100,Number(monster.ultimate_pve_damage_percent??monster.ultimate_damage_percent??0))),bossUltimatePenalty=bossShouldCast?Math.max(0,Math.floor(playerPower*bossPveDamagePercent/100)):0;
      const bossUltimate=bossShouldCast?{name:String(monster.ultimate_name||'보스 궁극기'),description:String(monster.ultimate_description||''),warningText:String(monster.ultimate_warning_text||'BOSS ULTIMATE'),damagePercent:bossPveDamagePercent,forceCast:bossForceCast,target:String(monster.ultimate_target||'ALL'),theme:String(monster.ultimate_theme||'CRIMSON'),shake:Boolean(monster.ultimate_shake),zoom:Boolean(monster.ultimate_zoom),mediaUrl:String(monster.ultimate_media_url||''),soundUrl:String(monster.ultimate_sound_url||''),durationMs:Math.max(600,Math.min(25000,Number(monster.ultimate_duration_ms||2400))),volumePercent:Math.max(0,Math.min(100,Number(monster.ultimate_volume_percent??35))),penalty:bossUltimatePenalty,capPercent:difficulty.bossUltimateCapPercent,damageCapUnlocked:difficulty.bossUltimateUnlocked}:null;
      let battleV2=null,effectiveBattleDamage=Math.max(0,totalBattleDamage-bossUltimatePenalty),result;
      if(engineState.active){
        const seed=parseInt(drawIntegrityHash(`${user.id}:${monster.id}:${requestId}`),16)>>>0;
        const engineCards=battleCards.map(card=>({...card,id:String(card.id),power:Math.max(1,Math.floor(Number(card.power||0)*synergyMultiplier)),uniqueAbility:card.uniqueAbility||null}));
        battleV2=createPveBattleV2({cards:engineCards,magicCards:magicLoadout.cards,characterBonus:Number(characterBonus.pve||0),monster:difficulty.engineMonster,seed,ultimateDamage,bossUltimatePercent:bossShouldCast?bossPveDamagePercent:0,bossUltimateCapPercent:difficulty.bossUltimateCapPercent,singleHealerBonus:engineState.singleHealerBonus});
        result=battleV2.result.winner==='A'?'WIN':'LOSE';
      }else result=effectiveBattleDamage>=monsterPower?'WIN':'LOSE';
      const reward=result==='WIN'?burningRewardAmount(difficulty.effectiveRewardCoin,burning):0;
      // V1785: 코인 지급과 코인 로그를 D1 배치 1회로 묶는다.
      // batch 는 암묵적 트랜잭션 안에서 순차 실행되므로 coin_logs 의 balance_after 는
      // 앞선 UPDATE 가 반영된 값을 그대로 읽는다(기존 2회 왕복과 결과 동일).
      if(reward){
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id),
          env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(reward,`PVE 승리 보상: ${monster.name}`,user.id)
        ]);
      }
      let cardReward=null,equipmentReward=null,blackMiracleReward=null,unifiedDrop=null;if(result==='WIN'){if(settings.cardDrop?.enabled!==false){const cardRate=Math.max(0,Math.min(100,Number(settings.cardDrop?.defaultRate??0)));if(cardRate>0&&Math.random()*100<cardRate)cardReward=await grantBattleCard(env,user.id,settings);}const rewardSource=payload.autoBattle===true?'PVE_AUTO':'PVE';equipmentReward=await safeEquipmentDrop(env,{userId:user.id,sourceType:rewardSource,sourceId:String(monster.id),requestId});blackMiracleReward=await rollBlackMiracleDrop(env,{userId:user.id,source:rewardSource,referenceId:requestId});unifiedDrop=await safePveUnifiedDrop(env,{userId:user.id,requestId:`UNIFIED:${requestId}`,sourceType:rewardSource,sourceId:String(monster.id),triggerType:'WIN',context:{boss:bossIsBoss,difficulty:difficulty.difficulty},role:user.role,isNightmare:difficulty.isNightmare});}
      // V1785: battle_logs 는 감사 로그일 뿐 응답에서 읽지 않는다 → 응답 지연 경로에서 제외.
      deferWrite('battle_logs',()=>env.DB.prepare('INSERT INTO battle_logs(user_id,monster_id,deck_cards,player_power,monster_power,result,reward_coin) VALUES(?,?,?,?,?,?,?)').bind(user.id,monster.id,JSON.stringify(ids),playerPower,monsterPower,result,reward).run());
      const cubeReward=await grantBattleCube(env,user.id,'PVE',requestId,result==='WIN'),pveMagic=pveMagicSettings.acquisition?.pve||{};
      // V1785: 고등급 리롤 티켓 지급 결과는 응답에 포함되지 않는다(기존에도 변수만 만들고 쓰지 않았다).
      // 지급 자체는 그대로 수행하되 응답을 기다리게 하지 않는다.
      if(result==='WIN')deferWrite('highGradeRerollDrop',()=>grantHighGradeRerollDrop(env,{userId:user.id,content:'PVE',referenceId:requestId}));
      const magicReward=result==='WIN'?await resolveMagicCrystalReward(env,{userId:user.id,source:'PVE_DROP',referenceId:requestId,enabled:pveMagic.enabled===true,chance:pveMagic.chance,amount:pveMagic.amount,dailyLimit:pveMagic.dailyLimit,reason:'일반 PVE 승리 확률 드랍'}):null;
      // V1791: 전투가 바꾼 것만 배치 1회로 읽어 경량 프로필로 응답한다.
      // (기존: users 조회 1회 + profile() 10개 조회 + 보유 카드 전체 스캔)
      const battleProfile=await battleResponseProfile(env,user,grantedCardIdsFromBattle({
        cardRewards:cardReward?[cardReward]:[],
        unifiedDrops:unifiedDrop?[unifiedDrop]:[]
      }));
      return json({result,reward,burningEvent:burningPublicState(burning),battleEngine:engineState,battleV2,cardReward,cubeReward,magicReward,equipmentReward,blackMiracleReward,unifiedDrop,playerPower,cardPower,characterBonus,basePlayerPower,totalBattleDamage,effectiveBattleDamage,bossUltimate,bossUltimateState:{configured:bossUltimateConfigured,enabled:bossUltimateEnabled,isBoss:bossIsBoss,forceCast:bossForceCast,trigger:bossTrigger,chance:bossChance,shouldCast:bossShouldCast,capPercent:difficulty.bossUltimateCapPercent,damageCapUnlocked:difficulty.bossUltimateUnlocked},ultimateDamage,bonusDamage:ultimateDamage,ultimateSourceCard:ultimateSourceCard?{id:ultimateSourceCard.id,title:ultimateSourceCard.title,rarity:ultimateSourceCard.rarity,power:ultimateSourceCard.power,breakthroughLevel:ultimateSourceCard.breakthrough_level}:null,activatedUltimate,deckSynergy:synergy,uniqueAbility:uniqueBattleResponsePayload(uniqueBattle,uniqueRuntime),monsterPower,difficulty:{...difficulty,engineMonster:undefined},monster:{id:monster.id,name:monster.name,image:monster.image_url,isBoss:Boolean(monster.is_boss),difficulty:difficulty.difficulty,nightmare:difficulty.isNightmare},cards:battleCards,energy:energyAfter,serverNow:new Date().toISOString(),user:battleProfile});
    }


    if(path==='tower/config'&&request.method==='GET'){const settings=await towerSettings(env);return json(settings);}
    if(path==='tower/status'&&request.method==='GET'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const [towerConfig,characterBonus]=await Promise.all([towerSettings(env),userEquipmentBonuses(env,user.id)]);if(!towerConfig.enabled&&!isAdminRole(user))return json({error:'현재 무한의탑이 운영 중지 상태입니다.',code:'TOWER_DISABLED'},503);
      const season=await env.DB.prepare("SELECT * FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();
      if(!season)return json({active:false});
      await env.DB.prepare('INSERT OR IGNORE INTO tower_user_progress(season_id,user_id,current_floor,highest_floor) VALUES(?,?,1,0)').bind(season.id,user.id).run();
      const progress=await env.DB.prepare('SELECT * FROM tower_user_progress WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
      const configuredMax=await env.DB.prepare('SELECT MAX(v) max_floor FROM (SELECT MAX(end_floor) v FROM tower_floor_ranges WHERE season_id=? AND is_active=1 UNION ALL SELECT MAX(floor_no) v FROM tower_floors WHERE season_id=? AND is_active=1)').bind(season.id,season.id).first();
      const maxFloor=Math.max(0,Number(configuredMax?.max_floor||0));
      if(maxFloor<1)return json({active:true,configured:false,completed:false,maxFloor:0,tower:{id:season.id,name:'무한의탑',maxFloor:0},season:{id:season.id,name:'무한의탑',startsAt:null,endsAt:null,maxFloor:0},progress:{currentFloor:1,highestFloor:Number(progress.highest_floor||0),rank:0,completed:false},floor:null,deck:await pveDeckCards(env,user.id),characterBonus,ranking:[],message:'운영자가 무한의탑 층을 아직 설정하지 않았습니다.'});
      const completed=Number(progress.current_floor||1)>maxFloor||Number(progress.highest_floor||0)>=maxFloor;
      const floorNo=completed?maxFloor:Math.max(1,Math.min(maxFloor,Number(progress.current_floor||1)));
      let floor=completed?null:await env.DB.prepare(`SELECT r.*,bm.id monster_id,bm.name monster_name,bm.image_url monster_image,bm.battle_power base_power,bm.is_boss monster_is_boss FROM tower_floor_ranges r JOIN battle_monsters bm ON bm.id=r.monster_id WHERE r.season_id=? AND r.is_active=1 AND bm.is_active=1 AND COALESCE(bm.tower_enabled,0)=1 AND ?>=r.start_floor AND ?<=r.end_floor ORDER BY (r.end_floor-r.start_floor) ASC,r.id DESC LIMIT 1`).bind(season.id,floorNo,floorNo).first();if(!floor)floor=await env.DB.prepare('SELECT tf.*,tm.name monster_name,tm.image_url monster_image,tm.base_power,tm.is_boss monster_is_boss FROM tower_floors tf JOIN tower_monsters tm ON tm.id=tf.monster_id WHERE tf.season_id=? AND tf.floor_no=? AND tf.is_active=1').bind(season.id,floorNo).first();
      if(!floor)return json({active:true,configured:true,completed:false,maxFloor,tower:{id:season.id,name:'무한의탑',maxFloor},season:{id:season.id,name:'무한의탑',startsAt:null,endsAt:null,maxFloor},progress:{currentFloor:floorNo,highestFloor:Number(progress.highest_floor||0),rank:0,completed:false},floor:null,deck:await pveDeckCards(env,user.id),characterBonus,ranking:[],blocked:true,code:'TOWER_FLOOR_UNCONFIGURED',message:`${floorNo}층이 설정되지 않아 더 이상 진행할 수 없습니다.`});
      if(floor){floor.monster_image=String(floor.monster_image||'').trim().replace(/\\/g,'/');floor.monster_power=Number(floor.power_override||Math.floor(Number(floor.base_power||1000)*(1+Math.max(0,floorNo-1)*0.07)*(floorNo%10===0?1.35:1)));}
      const floorIsBoss=Boolean(floor)&&(Number(floor.is_boss||0)===1||Number(floor.monster_is_boss||0)===1||floorNo%10===0);
      const deck=await pveDeckCards(env,user.id);
      const rankRow=await env.DB.prepare('SELECT COUNT(*)+1 rank FROM tower_user_progress WHERE season_id=? AND (highest_floor>? OR (highest_floor=? AND COALESCE(highest_reached_at,\'9999\')<COALESCE(?,\'9999\')))').bind(season.id,Number(progress.highest_floor||0),Number(progress.highest_floor||0),progress.highest_reached_at).first();
      const ranking=(await env.DB.prepare('SELECT p.user_id,u.nickname,p.highest_floor,p.highest_reached_at FROM tower_user_progress p JOIN users u ON u.id=p.user_id WHERE p.season_id=? ORDER BY p.highest_floor DESC,p.highest_reached_at ASC LIMIT 50').bind(season.id).all()).results;
      return json({active:true,completed,maxFloor,tower:{id:season.id,name:'무한의탑',maxFloor},season:{id:season.id,name:'무한의탑',startsAt:null,endsAt:null,maxFloor},progress:{currentFloor:floorNo,highestFloor:Number(progress.highest_floor||0),rank:Number(rankRow?.rank||1),completed},floor:floor?{floorNo,monsterId:floor.monster_id,monsterName:floor.monster_name,monsterImage:floor.monster_image,monsterPower:floor.monster_power,rewardCoin:Number(floor.reward_coin||0),isBoss:floorIsBoss}:null,deck,characterBonus,ranking});
    }
    if(path==='tower/fight'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const towerBody=await readBody(request),towerRequestId=String(towerBody.requestId||crypto.randomUUID()).slice(0,120);
      const towerConfig=await towerSettings(env);if(!towerConfig.enabled&&!isAdminRole(user))return json({error:'현재 무한의탑이 운영 중지 상태입니다.',code:'TOWER_DISABLED'},503);
      const season=await env.DB.prepare("SELECT * FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();if(!season)return json({error:'진행 중인 무한의탑 시즌이 없습니다.'},404);
      await env.DB.prepare('INSERT OR IGNORE INTO tower_user_progress(season_id,user_id,current_floor,highest_floor) VALUES(?,?,1,0)').bind(season.id,user.id).run();
      const progress=await env.DB.prepare('SELECT * FROM tower_user_progress WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
      const configuredMax=await env.DB.prepare('SELECT MAX(v) max_floor FROM (SELECT MAX(end_floor) v FROM tower_floor_ranges WHERE season_id=? AND is_active=1 UNION ALL SELECT MAX(floor_no) v FROM tower_floors WHERE season_id=? AND is_active=1)').bind(season.id,season.id).first();
      const maxFloor=Math.max(0,Number(configuredMax?.max_floor||0));
      if(maxFloor<1)return json({error:'운영자가 무한의탑 층을 아직 설정하지 않았습니다.',code:'TOWER_NOT_CONFIGURED'},409);
      if(Number(progress.current_floor||1)>maxFloor||Number(progress.highest_floor||0)>=maxFloor)return json({error:'무한의탑 최고층 등반을 완료했습니다. 운영자가 진행도를 초기화하기 전까지 다시 1층부터 시작하지 않습니다.',code:'TOWER_COMPLETED',completed:true,maxFloor},409);
      const floorNo=Math.max(1,Math.min(maxFloor,Number(progress.current_floor||1)));
      const deckInfo=await raidDeckPower(env,user.id);const settings=await battleSettings(env);const ids=deckInfo.ids,marks=ids.map(()=>'?').join(',');
      const owned=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.image_url AS image,c.focus_x,c.focus_y,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND c.id IN (${marks})`).bind(user.id,...ids).all();
      let floor=await env.DB.prepare(`SELECT r.*,bm.id monster_id,bm.name monster_name,bm.image_url monster_image,bm.battle_power base_power,bm.is_boss monster_is_boss,
        bm.ultimate_enabled,bm.ultimate_name,bm.ultimate_description,bm.ultimate_trigger,bm.ultimate_chance,bm.ultimate_damage_percent,bm.ultimate_tower_damage_percent,
        bm.ultimate_force_cast,bm.ultimate_target,bm.ultimate_theme,bm.ultimate_warning_text,bm.ultimate_shake,bm.ultimate_zoom,bm.ultimate_media_url,bm.ultimate_sound_url,bm.ultimate_duration_ms,bm.ultimate_volume_percent
        FROM tower_floor_ranges r JOIN battle_monsters bm ON bm.id=r.monster_id
        WHERE r.season_id=? AND r.is_active=1 AND bm.is_active=1 AND COALESCE(bm.tower_enabled,0)=1 AND ?>=r.start_floor AND ?<=r.end_floor
        ORDER BY (r.end_floor-r.start_floor) ASC,r.id DESC LIMIT 1`).bind(season.id,floorNo,floorNo).first();
      if(!floor)floor=await env.DB.prepare(`SELECT tf.*,tm.name monster_name,tm.image_url monster_image,tm.base_power,tm.is_boss monster_is_boss,
        bm.id linked_battle_monster_id,bm.ultimate_enabled,bm.ultimate_name,bm.ultimate_description,bm.ultimate_trigger,bm.ultimate_chance,bm.ultimate_damage_percent,bm.ultimate_tower_damage_percent,
        bm.ultimate_force_cast,bm.ultimate_target,bm.ultimate_theme,bm.ultimate_warning_text,bm.ultimate_shake,bm.ultimate_zoom,bm.ultimate_media_url,bm.ultimate_sound_url,bm.ultimate_duration_ms,bm.ultimate_volume_percent
        FROM tower_floors tf JOIN tower_monsters tm ON tm.id=tf.monster_id
        LEFT JOIN battle_monsters bm ON bm.id=(SELECT b2.id FROM battle_monsters b2 WHERE b2.is_active=1 AND TRIM(b2.name)=TRIM(tm.name) ORDER BY COALESCE(b2.tower_enabled,0) DESC,b2.id DESC LIMIT 1)
        WHERE tf.season_id=? AND tf.floor_no=? AND tf.is_active=1`).bind(season.id,floorNo).first();
      if(!floor)return json({error:`${floorNo}층이 설정되지 않아 도전할 수 없습니다. 무한의탑 CMS에서 해당 층을 먼저 배치하세요.`,code:'TOWER_FLOOR_UNCONFIGURED',floorNo,maxFloor},409);
      const monsterPower=Number(floor.power_override||Math.floor(Number(floor.base_power||1000)*(1+Math.max(0,floorNo-1)*0.07)*(floorNo%10===0?1.35:1))),towerSynergy=await evaluateDeckSynergies(env,user,ids,'TOWER',{forceOwnerTest:String(user.role||'').toUpperCase()==='OWNER'}),towerUniqueRuntime=deckInfo.unique?.enabled?resolveUniqueBattleRuntime(deckInfo.unique,{mode:'TOWER',opponentPower:monsterPower}):null,towerCardPower=Math.max(0,Math.floor(Number(towerUniqueRuntime?.effectivePower??deckInfo.basePower??0)*(1+Number(towerSynergy.totals.attackPercent||0)/100+Number(towerSynergy.totals.bossDamagePercent||0)/100))),playerPower=towerCardPower+Number(deckInfo.characterBonus?.pve||0);
      let towerBossUltimate=null,effectiveTowerPower=playerPower;
      const floorIsBoss=Number(floor.is_boss||0)===1||Number(floor.monster_is_boss||0)===1||floorNo%10===0;
      if(floorIsBoss){
        // V1073.12: 층 조회에서 궁극기 원본 필드를 직접 전달받는다.
        // 이름/서로 다른 ID를 다시 추측해 조회하지 않아 ALWAYS·CHANCE 설정이 유실되는 문제를 막는다.
        const enabledRaw=floor.ultimate_enabled;
        const ultimateEnabled=Number(enabledRaw||0)===1||enabledRaw===true||['TRUE','ON','YES'].includes(String(enabledRaw||'').trim().toUpperCase());
        if(ultimateEnabled){
          const trigger=String(floor.ultimate_trigger||'ON_LOSS').trim().toUpperCase();
          const chance=Math.max(0,Math.min(100,Number(floor.ultimate_chance??100)));
          const chanceHit=chance>=100||Math.random()*100<chance;
          const forceRaw=floor.ultimate_force_cast;
          const forceCast=Number(forceRaw||0)===1||forceRaw===true||['TRUE','ON','YES'].includes(String(forceRaw||'').trim().toUpperCase());
          const preliminaryResult=playerPower>=monsterPower?'WIN':'LOSE';
          const cast=forceCast
            ||trigger==='ALWAYS'
            ||(trigger==='CHANCE'&&chanceHit)
            ||(trigger==='ON_LOSS'&&(preliminaryResult==='LOSE'||chanceHit));
          if(cast){
            const pct=Math.max(0,Math.min(100,Number(floor.ultimate_tower_damage_percent??floor.ultimate_damage_percent??0)));
            const penalty=Math.max(0,Math.floor(playerPower*pct/100));
            effectiveTowerPower=Math.max(0,playerPower-penalty);
            towerBossUltimate={
              name:String(floor.ultimate_name||'보스 궁극기'),description:String(floor.ultimate_description||''),
              warningText:String(floor.ultimate_warning_text||'BOSS ULTIMATE'),damagePercent:pct,forceCast,
              trigger,chance,target:String(floor.ultimate_target||'ALL'),theme:String(floor.ultimate_theme||'CRIMSON'),
              shake:Number(floor.ultimate_shake??1)!==0,zoom:Number(floor.ultimate_zoom??1)!==0,
              mediaUrl:String(floor.ultimate_media_url||''),soundUrl:String(floor.ultimate_sound_url||''),
              durationMs:Math.max(600,Math.min(25000,Number(floor.ultimate_duration_ms||2400))),
              volumePercent:Math.max(0,Math.min(100,Number(floor.ultimate_volume_percent??35))),penalty
            };
          }
        }
      }
      const result=effectiveTowerPower>=monsterPower?'WIN':'LOSE';let reward=0;
      let completed=false,nextFloor=floorNo;
      let magicReward=null,equipmentReward=null,blackMiracleReward=null;
      if(result==='WIN'){
        reward=Number(floor.reward_coin||Math.max(100,floorNo*100));completed=floorNo>=maxFloor;nextFloor=completed?maxFloor+1:floorNo+1;
        // V1785: 코인 지급과 층 진행도 갱신은 서로 독립적인 쓰기다. D1 배치 1회로 묶는다(왕복 2회 → 1회).
        const towerClearWrites=[env.DB.prepare('UPDATE tower_user_progress SET current_floor=?,highest_floor=MAX(highest_floor,?),highest_reached_at=CASE WHEN ?>highest_floor THEN CURRENT_TIMESTAMP ELSE highest_reached_at END,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?').bind(nextFloor,floorNo,floorNo,season.id,user.id)];
        if(reward)towerClearWrites.unshift(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id));
        await env.DB.batch(towerClearWrites);
        const magicCfg=await magicSettings(env),towerMagic=magicCfg.acquisition?.tower||{},magicAmount=magicRewardForTowerFloor(magicCfg,floorNo);
        magicReward=await resolveMagicCrystalReward(env,{userId:user.id,source:'TOWER_FIRST_CLEAR',referenceId:`${season.id}:${floorNo}`,enabled:towerMagic.enabled===true,chance:100,amount:magicAmount,dailyLimit:0,reason:`무한의탑 ${floorNo}층 최초 클리어`});
        equipmentReward=await safeEquipmentDrop(env,{userId:user.id,sourceType:'TOWER',sourceId:String(floorNo),requestId:towerRequestId});
        blackMiracleReward=await rollBlackMiracleDrop(env,{userId:user.id,source:'TOWER',referenceId:towerRequestId});
      }
      // V1785: tower_clear_history 는 API 전체에서 어디서도 다시 읽지 않는 기록용 테이블이다
      // (읽는 곳이 생기면 이 deferWrite 를 되돌려야 한다). 응답 지연 경로에서 제외.
      deferWrite('tower_clear_history',()=>env.DB.prepare('INSERT INTO tower_clear_history(season_id,user_id,floor_no,player_power,monster_power,result) VALUES(?,?,?,?,?,?)').bind(season.id,user.id,floorNo,playerPower,monsterPower,result).run());
      let weeklyPremium=null,weeklyPremiumError=null;
      try{weeklyPremium=await grantWeeklyPremiumCube(env,user.id,'TOWER',towerRequestId)}catch(cubeError){weeklyPremiumError=String(cubeError?.message||cubeError||'프리미엄 큐브 처리 실패');console.error('tower weekly premium cube failed',{userId:user.id,floorNo,requestId:towerRequestId,error:weeklyPremiumError})}
      const towerUniqueCardMap=new Map((deckInfo.unique?.cards||[]).map(card=>[String(card.id),card]));
      const towerBattleCards=owned.results.map(c=>{const uniqueCard=towerUniqueCardMap.get(String(c.id))||{};return {...c,...uniqueCard,id:String(c.id),title:c.title,image:c.image,grade:c.rarity,rarity:c.rarity,focusX:Number(c.focus_x||50),focusY:Number(c.focus_y||50),breakthroughLevel:Number(c.breakthrough_level||0)};});
      if(result==='WIN')await grantHighGradeRerollDrop(env,{userId:user.id,content:'TOWER',referenceId:towerRequestId});
      return json({result,completed,maxFloor,deckSynergy:towerSynergy,uniqueAbility:uniqueBattleResponsePayload(deckInfo.unique,towerUniqueRuntime),bossUltimate:towerBossUltimate,effectivePlayerPower:effectiveTowerPower,floorNo,nextFloor,reward,magicReward,equipmentReward,blackMiracleReward,characterBonus:deckInfo.characterBonus,towerCardPower,cubeReward:weeklyPremium?.reward||null,weeklyPremiumCube:weeklyPremium?.status||null,weeklyPremiumError,playerPower,monsterPower,isBoss:floorIsBoss,monster:{id:floor.monster_id,name:floor.monster_name,image:floor.monster_image},cards:towerBattleCards});
    }
    if(path==='deck-synergy/status'&&request.method==='GET'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await deckSynergySettings(env);if(!settings.enabled&&String(user.role||'').toUpperCase()!=='OWNER')return json({enabled:false});const deck=await pveDeckCards(env,user.id);const evaluation=await evaluateDeckSynergies(env,user,deck,'PVE',{forceOwnerTest:String(user.role||'').toUpperCase()==='OWNER'});return json({enabled:settings.enabled,ownerTest:evaluation.ownerTest,deck,evaluation});
    }
    if(path==='admin/deck-synergies'){
      const admin=await requirePermission(request,env,'BATTLE_MANAGE');if(!admin||String(admin.role||'').toUpperCase()!=='OWNER')return json({error:'덱 효과 관리는 OWNER 전용입니다.'},403);
      if(request.method==='GET'){
        const settings=await deckSynergySettings(env),rows=(await env.DB.prepare('SELECT * FROM deck_synergies ORDER BY sort_order,id').all()).results,cards=(await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,m.name AS memberName FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE COALESCE(c.is_active,1)=1 ORDER BY m.sort_order,c.id`).all()).results;
        const synergies=rows.map(r=>{let requiredCardIds=[],scopes=[],effects={};try{requiredCardIds=JSON.parse(r.required_card_ids||'[]')}catch{}try{scopes=JSON.parse(r.scopes||'[]')}catch{}try{effects=cleanDeckSynergyEffects(JSON.parse(r.effects_json||'{}'))}catch{effects=cleanDeckSynergyEffects({})}return {id:r.id,name:r.name,description:r.description||'',requiredCardIds,scopes,effects,isActive:r.is_active!==0,sortOrder:Number(r.sort_order||0)}});return json({settings,synergies,cards});
      }
      if(request.method==='POST'){
        const b=await readBody(request),action=String(b.action||'');
        if(action==='SAVE_SETTINGS'){const before=await deckSynergySettings(env),next={enabled:b.enabled===true,ownerTestEnabled:b.ownerTestEnabled!==false};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('deck_synergy_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();await writeAdminLog(env,admin,'DECK_SYNERGY_SETTINGS','APP_META','deck_synergy_settings_v1',before,next);return json({ok:true,settings:next});}
        if(action==='SAVE_SYNERGY'){const ids=[...new Set((b.requiredCardIds||[]).map(String))].slice(0,5);if(!String(b.name||'').trim())return json({error:'덱 효과 이름을 입력하세요.'},400);if(!ids.length)return json({error:'조건 카드를 1장 이상 선택하세요.'},400);const scopes=[...new Set((b.scopes||[]).map(x=>String(x).toUpperCase()).filter(x=>['PVE','PVP','RAID','TOWER'].includes(x)))],effects=cleanDeckSynergyEffects(b.effects||{});if(b.id)await env.DB.prepare('UPDATE deck_synergies SET name=?,description=?,required_card_ids=?,scopes=?,effects_json=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(b.name).trim().slice(0,80),String(b.description||'').slice(0,300),JSON.stringify(ids),JSON.stringify(scopes),JSON.stringify(effects),b.isActive===false?0:1,Number(b.sortOrder||0),Number(b.id)).run();else await env.DB.prepare('INSERT INTO deck_synergies(name,description,required_card_ids,scopes,effects_json,is_active,sort_order,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(String(b.name).trim().slice(0,80),String(b.description||'').slice(0,300),JSON.stringify(ids),JSON.stringify(scopes),JSON.stringify(effects),b.isActive===false?0:1,Number(b.sortOrder||0),admin.id).run();await writeAdminLog(env,admin,'DECK_SYNERGY_SAVE','DECK_SYNERGY',String(b.id||'NEW'),null,{name:b.name,requiredCardIds:ids,scopes,effects});return json({ok:true});}
        if(action==='DELETE_SYNERGY'){await env.DB.prepare('UPDATE deck_synergies SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(Number(b.id)).run();await writeAdminLog(env,admin,'DECK_SYNERGY_DISABLE','DECK_SYNERGY',String(b.id),null,{isActive:false});return json({ok:true});}
        if(action==='TEST'){const ids=[...new Set((b.cardIds||[]).map(String))];const evaluation=await evaluateDeckSynergies(env,admin,ids,String(b.scope||'PVE').toUpperCase(),{forceOwnerTest:true});const marks=ids.length?ids.map(()=>'?').join(','):'';let cards=[];if(ids.length)cards=(await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,m.name AS memberName FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id IN (${marks})`).bind(...ids).all()).results;return json({ok:true,evaluation,cards});}
        return json({error:'올바르지 않은 작업입니다.'},400);
      }
    }
    if(path==='admin/tower'){
      const admin=await requirePermission(request,env,'BATTLE_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      // V1073.1: route-local idempotent safety. A failed optional upgrade must never block the legacy tower CMS.
      const warnings=[];
      try{
        if(await tableExists(env,'battle_monsters')){
          for(const [column,definition] of [['pve_enabled','INTEGER NOT NULL DEFAULT 1'],['tower_enabled','INTEGER NOT NULL DEFAULT 0'],['tower_only','INTEGER NOT NULL DEFAULT 0']]){
            if(!await columnExists(env,'battle_monsters',column))await env.DB.prepare(`ALTER TABLE battle_monsters ADD COLUMN ${column} ${definition}`).run();
          }
        }
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tower_floor_ranges (id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,monster_id INTEGER NOT NULL,start_floor INTEGER NOT NULL,end_floor INTEGER NOT NULL,power_override INTEGER,reward_coin INTEGER NOT NULL DEFAULT 0,is_boss INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tower_floor_ranges_lookup ON tower_floor_ranges(season_id,start_floor,end_floor,is_active)`).run();
      }catch(e){warnings.push('신규 층 구간 구조 준비 실패: '+String(e.message||e));}
      if(request.method==='GET'){
        const safeResults=async(sql,bind=[])=>{try{const stmt=env.DB.prepare(sql);return (await (bind.length?stmt.bind(...bind):stmt).all()).results||[]}catch(e){warnings.push(String(e.message||e));return []}};
        let settings={enabled:true};try{settings=await towerSettings(env)}catch(e){warnings.push('운영 설정 조회 실패: '+String(e.message||e))}
        const seasons=await safeResults("SELECT * FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1");
        let monsters=await safeResults(`SELECT id,name,image_url AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss,is_active AS isActive,COALESCE(pve_enabled,1) AS pveEnabled,COALESCE(tower_enabled,0) AS towerEnabled,COALESCE(tower_only,0) AS towerOnly,COALESCE(ultimate_enabled,0) AS ultimateEnabled,COALESCE(ultimate_name,'') AS ultimateName FROM battle_monsters ORDER BY sort_order,id`);
        if(!monsters.length) monsters=await safeResults(`SELECT id,name,image_url AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss,is_active AS isActive,1 AS pveEnabled,0 AS towerEnabled,0 AS towerOnly,0 AS ultimateEnabled,'' AS ultimateName FROM battle_monsters ORDER BY sort_order,id`);
        const floors=await safeResults('SELECT tf.*,tm.name monster_name FROM tower_floors tf LEFT JOIN tower_monsters tm ON tm.id=tf.monster_id ORDER BY tf.season_id DESC,tf.floor_no');
        let ranges=await safeResults(`SELECT r.*,bm.name monster_name,bm.image_url monster_image,bm.battle_power base_power,bm.is_boss monster_is_boss,COALESCE(bm.ultimate_enabled,0) ultimate_enabled,COALESCE(bm.ultimate_name,'') ultimate_name FROM tower_floor_ranges r JOIN battle_monsters bm ON bm.id=r.monster_id WHERE r.is_active=1 ORDER BY r.season_id DESC,r.start_floor,r.id`);
        if(!ranges.length) ranges=await safeResults(`SELECT r.*,bm.name monster_name,bm.image_url monster_image,bm.battle_power base_power,bm.is_boss monster_is_boss,0 ultimate_enabled,'' ultimate_name FROM tower_floor_ranges r JOIN battle_monsters bm ON bm.id=r.monster_id WHERE r.is_active=1 ORDER BY r.season_id DESC,r.start_floor,r.id`);
        const ranking=await safeResults("SELECT p.user_id,u.nickname,p.current_floor,p.highest_floor,p.highest_reached_at FROM tower_user_progress p JOIN tower_seasons s ON s.id=p.season_id JOIN users u ON u.id=p.user_id WHERE s.status='ACTIVE' ORDER BY p.highest_floor DESC,p.highest_reached_at ASC LIMIT 100");
        return json({settings,seasons,monsters,floors,ranges,ranking,warnings:[...new Set(warnings)].slice(0,6)});
      }
      if(request.method==='POST'){
        const b=await readBody(request),action=String(b.action||'');
        if(action==='SAVE_SETTINGS'){await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tower_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:b.enabled!==false})).run();}
        else if(action==='SAVE_SEASON'){if(b.id)await env.DB.prepare('UPDATE tower_seasons SET name=?,status=?,starts_at=?,ends_at=?,max_floor=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(b.name||'무한의탑 시즌'),String(b.status||'ACTIVE'),b.startsAt||null,b.endsAt||null,Math.max(1,Number(b.maxFloor||100)),Number(b.id)).run();else await env.DB.prepare('INSERT INTO tower_seasons(name,status,starts_at,ends_at,max_floor) VALUES(?,?,?,?,?)').bind(String(b.name||'무한의탑 시즌'),String(b.status||'ACTIVE'),b.startsAt||null,b.endsAt||null,Math.max(1,Number(b.maxFloor||100))).run();}
        else if(action==='SAVE_MONSTER'){if(b.id)await env.DB.prepare('UPDATE tower_monsters SET name=?,image_url=?,base_power=?,is_boss=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(b.name||''),String(b.imageUrl||''),Math.max(1,Number(b.basePower||1)),b.isBoss?1:0,b.isActive===false?0:1,Number(b.sortOrder||0),Number(b.id)).run();else await env.DB.prepare('INSERT INTO tower_monsters(name,image_url,base_power,is_boss,is_active,sort_order) VALUES(?,?,?,?,?,?)').bind(String(b.name||''),String(b.imageUrl||''),Math.max(1,Number(b.basePower||1)),b.isBoss?1:0,b.isActive===false?0:1,Number(b.sortOrder||0)).run();}
        else if(action==='SAVE_FLOOR'){await env.DB.prepare('INSERT INTO tower_floors(season_id,floor_no,monster_id,power_override,reward_coin,is_boss,is_active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(season_id,floor_no) DO UPDATE SET monster_id=excluded.monster_id,power_override=excluded.power_override,reward_coin=excluded.reward_coin,is_boss=excluded.is_boss,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP').bind(Number(b.seasonId),Number(b.floorNo),Number(b.monsterId),b.powerOverride?Number(b.powerOverride):null,Math.max(0,Number(b.rewardCoin||0)),b.isBoss?1:0,b.isActive===false?0:1).run();}
        else if(action==='SAVE_RANGE'){
          const seasonId=Number(b.seasonId),monsterId=Number(b.monsterId),startFloor=Math.max(1,Number(b.startFloor||1)),endFloor=Math.max(startFloor,Number(b.endFloor||startFloor));
          if(!seasonId||!monsterId)return json({error:'시즌과 몬스터를 선택하세요.'},400);
          const overlap=await env.DB.prepare('SELECT id,start_floor,end_floor FROM tower_floor_ranges WHERE season_id=? AND is_active=1 AND id<>? AND NOT(end_floor<? OR start_floor>?) LIMIT 1').bind(seasonId,Number(b.id||0),startFloor,endFloor).first();
          if(overlap)return json({error:`${overlap.start_floor}~${overlap.end_floor}층 설정과 범위가 겹칩니다.`},409);
          await env.DB.prepare('UPDATE battle_monsters SET tower_enabled=1,tower_only=CASE WHEN ?=1 THEN 1 ELSE tower_only END,pve_enabled=CASE WHEN ?=1 THEN 0 ELSE pve_enabled END,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.towerOnly?1:0,b.towerOnly?1:0,monsterId).run();
          if(b.id)await env.DB.prepare('UPDATE tower_floor_ranges SET monster_id=?,start_floor=?,end_floor=?,power_override=?,reward_coin=?,is_boss=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(monsterId,startFloor,endFloor,b.powerOverride?Number(b.powerOverride):null,Math.max(0,Number(b.rewardCoin||0)),b.isBoss?1:0,Number(b.id)).run();
          else await env.DB.prepare('INSERT INTO tower_floor_ranges(season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active) VALUES(?,?,?,?,?,?,?,1)').bind(seasonId,monsterId,startFloor,endFloor,b.powerOverride?Number(b.powerOverride):null,Math.max(0,Number(b.rewardCoin||0)),b.isBoss?1:0).run();
        }
        else if(action==='DELETE_RANGE'){await env.DB.prepare('UPDATE tower_floor_ranges SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(Number(b.id)).run();}
        else if(action==='RESET_RANKING'){
          if(String(b.confirmText||'')!=='무한의탑 랭킹 초기화')return json({error:'확인 문구가 일치하지 않습니다.'},400);
          const active=await env.DB.prepare("SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();if(!active)return json({error:'무한의탑 운영 기준을 찾을 수 없습니다.'},404);
          await env.DB.prepare('UPDATE tower_user_progress SET highest_floor=0,highest_reached_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE season_id=?').bind(active.id).run();
        }
        else if(action==='RESET_PROGRESS'){
          if(String(b.confirmText||'')!=='무한의탑 진행도 초기화')return json({error:'확인 문구가 일치하지 않습니다.'},400);
          const active=await env.DB.prepare("SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();if(!active)return json({error:'무한의탑 운영 기준을 찾을 수 없습니다.'},404);
          await env.DB.prepare('UPDATE tower_user_progress SET current_floor=1,highest_floor=0,highest_reached_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE season_id=?').bind(active.id).run();
        }
        else if(action==='START_NEW_SEASON'||action==='SAVE_SEASON')return json({error:'무한의탑 시즌제는 사용하지 않습니다.'},409);
        else return json({error:'올바르지 않은 작업입니다.'},400);
        await writeAdminLog(env,admin,'TOWER_'+action,'TOWER',String(b.id||b.floorNo||''),null,b);return json({ok:true});
      }
    }


    if(path==='pvp/config'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureRankedPvpFoundation(env);
      await cleanupRankedPvpMaintenance(env);
      const lifecycle=await advancePvpSeasonLifecycle(env);
      if(lifecycle.settling&&typeof context.waitUntil==='function')context.waitUntil((async()=>{for(let i=0;i<8;i++){const next=await advancePvpSeasonLifecycle(env);if(!next.settling)break}})());
      await env.DB.batch([
        env.DB.prepare('CREATE TABLE IF NOT EXISTS pvp_deck_presets (user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no))'),
        env.DB.prepare('CREATE TABLE IF NOT EXISTS pvp_active_presets (user_id INTEGER PRIMARY KEY,preset_no INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
      ]);
      await env.DB.prepare("INSERT OR IGNORE INTO pvp_deck_presets(user_id,preset_no,card_ids) SELECT user_id,1,card_ids FROM pvp_decks WHERE user_id=?").bind(user.id).run();
      await env.DB.prepare('UPDATE pvp_decks SET card_ids=(SELECT card_ids FROM pvp_deck_presets WHERE user_id=? AND preset_no=1),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND EXISTS(SELECT 1 FROM pvp_deck_presets WHERE user_id=? AND preset_no=1)').bind(user.id,user.id,user.id).run();
      const burning=await burningEventSettings(env),settings=applyBurningPvpSettings(lifecycle.settings,burning),[profile,deck,score,titleMap,characterBonus,energy,battle]=await Promise.all([ensurePvpProfile(env,user,settings),pvpDeckCards(env,user.id),userCardScore(env,user.id),publicEquippedTitleMap(env,[user.id]),userEquipmentBonuses(env,user.id),pvpEnergyState(env,user,settings),battleSettings(env)]);
      const [presetRows,activeRow]=await Promise.all([env.DB.prepare('SELECT preset_no,card_ids FROM pvp_deck_presets WHERE user_id=? AND preset_no BETWEEN 1 AND 3 ORDER BY preset_no').bind(user.id).all(),env.DB.prepare('SELECT preset_no FROM pvp_active_presets WHERE user_id=?').bind(user.id).first()]);
      const presets={1:[],2:[],3:[]};for(const row of presetRows.results||[]){try{presets[Number(row.preset_no)]=JSON.parse(row.card_ids||'[]')}catch{presets[Number(row.preset_no)]=[]}}
      return json({settings,lifecycle:{settling:lifecycle.settling===true,phase:lifecycle.phase||null,startedNewSeason:lifecycle.startedNewSeason===true,completedSeason:lifecycle.completedSeason||null},battleSettings:battle,burningEvent:burningPublicState(burning),profile:{...profile,tier:resolveTier(Number(profile.season_score),settings.tiers),highestTier:resolveTier(Number(profile.highest_score),settings.tiers)},title:titleMap[String(user.id)]||null,deck,presets,activePreset:Math.max(1,Math.min(3,Number(activeRow?.preset_no||1))),cardScore:score,characterBonus,energy,battleEngine:battleEngineState(battle,user),bypass:isAdminRole(user),serverNow:new Date().toISOString()});
    }
    if(path==='pvp/deck'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);const body=await readBody(request),presetNo=Math.max(1,Math.min(3,Number(body.presetNo||1))),ids=[...new Set((body.cardIds||[]).map(String))];if(ids.length!==5)return json({error:'랭크전 덱은 보유 카드 5장으로 편성해야 합니다.'},400);
      const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT card_id FROM user_cards WHERE user_id=? AND COALESCE(quantity,0)>0 AND card_id IN (${marks})`).bind(user.id,...ids).all();if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      try{await validateDeckGradeLimits(env,ids,'랭크전 덱')}catch(error){return json({error:error.message,code:error.code,grade:error.grade,count:error.count,limit:error.limit},400)}
      await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS pvp_deck_presets (user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no))'),env.DB.prepare('CREATE TABLE IF NOT EXISTS pvp_active_presets (user_id INTEGER PRIMARY KEY,preset_no INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')]);
      const writes=[env.DB.prepare('INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,preset_no) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,presetNo,JSON.stringify(ids)),env.DB.prepare('INSERT INTO pvp_active_presets(user_id,preset_no,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET preset_no=excluded.preset_no,updated_at=CURRENT_TIMESTAMP').bind(user.id,presetNo)];if(presetNo===1)writes.push(env.DB.prepare('INSERT INTO pvp_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,JSON.stringify(ids)));await env.DB.batch(writes);return json({ok:true,deck:ids,presetNo,defensePreset:1,prestigeLimit:PRESTIGE_DECK_LIMIT,furLimit:FUR_DECK_LIMIT,zenithLimit:ZENITH_DECK_LIMIT});
    }
    if(path==='pvp/opponents'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      return json({matchingMode:'AUTO',opponents:[],message:'랭크전은 상대를 선택하지 않습니다. 티어와 편성 전투력을 기준으로 서버가 자동 배정합니다.'});
    }
    if(path==='pvp/match'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const [lifecycle,burning]=await Promise.all([advancePvpSeasonLifecycle(env),burningEventSettings(env)]),settings=applyBurningPvpSettings(lifecycle.settings,burning);
      if(lifecycle.settling)return json({error:'현재 시즌 정산 중입니다. 새 시즌이 자동 시작되면 매칭할 수 있습니다.',code:'PVP_SEASON_SETTLING',retryable:true,retryAfterMs:1500},409);
      if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);
      const energy=await pvpEnergyState(env,user,settings);if(!energy.unlimited&&energy.energy<energy.costPerBattle)return json({error:'랭크전 전투 횟수가 부족합니다.',energy},409);
      try{return json({ok:true,matchingMode:'AUTO',...(await createRankedMatchTicket(env,user,settings))})}catch(error){return json({error:error.message||'랭크전 매칭에 실패했습니다.'},Number(error.status||500))}
    }
    if(path==='pvp/fight'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),requestId=String(body.requestId||crypto.randomUUID());
      const lifecycle=await advancePvpSeasonLifecycle(env),burning=await burningEventSettings(env),settings=applyBurningPvpSettings(lifecycle.settings,burning);if(lifecycle.settling)return json({error:'현재 시즌 정산 중입니다.',code:'PVP_SEASON_SETTLING'},409);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);
      let rankedTicket;try{rankedTicket=await claimRankedMatchTicket(env,user.id,body.matchToken,settings)}catch(error){return json({error:error.message||'랭크전 매칭 확인에 실패했습니다.'},Number(error.status||500))}const defenderId=Number(rankedTicket.defender_id);if(!defenderId||defenderId===user.id)return json({error:'자동 배정된 상대가 올바르지 않습니다.'},400);
      const recent=await env.DB.prepare('SELECT defender_id FROM pvp_match_history WHERE attacker_id=? ORDER BY id DESC LIMIT 2').bind(user.id).all();
      if(recent.results.length===2&&Number(recent.results[0].defender_id)===defenderId&&Number(recent.results[1].defender_id)===defenderId)return json({error:'같은 상대와는 연속 3회 이상 대전할 수 없습니다. 다른 상대와 1회 대전한 뒤 다시 도전하세요.',code:'PVP_REPEAT_OPPONENT_LIMIT'},409);
      const attacker=await ensurePvpProfile(env,user,settings),defUser=await env.DB.prepare("SELECT * FROM users WHERE id=? AND status='ACTIVE' AND (banned_until IS NULL OR banned_until<=datetime('now'))").bind(defenderId).first();if(!defUser)return json({error:'상대를 찾을 수 없습니다.'},404);const defender=await ensurePvpProfile(env,defUser,settings);
      if(Number(attacker.season_score)!==Number(rankedTicket.attacker_score)||Number(defender.season_score)!==Number(rankedTicket.defender_score))return json({error:'매칭 후 시즌 점수가 변경되었습니다. 현재 점수 기준으로 다시 매칭해주세요.',code:'PVP_MATCH_SCORE_CHANGED'},409);
      const [aDeck,dDeck,battle,titleMap]=await Promise.all([pvpDeckSnapshot(env,user.id),pvpDeckSnapshot(env,defenderId,true),battleSettings(env),publicEquippedTitleMap(env,[user.id,defenderId])]);
      if(aDeck.length!==5)return json({error:'먼저 랭크전 덱 편성을 완료하세요.'},400);
      if(dDeck.length!==5)return json({error:'상대의 랭크전 덱이 완성되지 않았습니다.'},409);
      const aPrestigeCount=aDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='PRESTIGE').length,dPrestigeCount=dDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='PRESTIGE').length,aFurCount=aDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='FUR').length,dFurCount=dDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='FUR').length,aZenithCount=aDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='ZENITH').length,dZenithCount=dDeck.filter(card=>String(card.rarity||card.grade||'').toUpperCase()==='ZENITH').length;
      if(aFurCount>FUR_DECK_LIMIT)return json({error:`랭크전 덱에는 FUR 카드를 최대 ${FUR_DECK_LIMIT}장까지만 편성할 수 있습니다. 덱을 다시 저장해주세요.`,code:'FUR_DECK_LIMIT',furCount:aFurCount,limit:FUR_DECK_LIMIT},409);
      if(dFurCount>FUR_DECK_LIMIT)return json({error:'상대의 랭크전 덱이 FUR 편성 제한을 초과해 대전할 수 없습니다.',code:'OPPONENT_FUR_DECK_LIMIT'},409);
      if(aPrestigeCount>PRESTIGE_DECK_LIMIT)return json({error:`랭크전 덱에는 PRESTIGE 카드를 최대 ${PRESTIGE_DECK_LIMIT}장까지만 편성할 수 있습니다. 덱을 다시 저장해주세요.`,code:'PRESTIGE_DECK_LIMIT',prestigeCount:aPrestigeCount,limit:PRESTIGE_DECK_LIMIT},409);
      if(dPrestigeCount>PRESTIGE_DECK_LIMIT)return json({error:'상대의 랭크전 덱이 PRESTIGE 편성 제한을 초과해 대전할 수 없습니다.',code:'OPPONENT_PRESTIGE_DECK_LIMIT'},409);
      if(aZenithCount>ZENITH_DECK_LIMIT)return json({error:'랭크전 덱에는 ZENITH 카드를 1장만 편성할 수 있습니다. 덱을 다시 저장해주세요.',code:'ZENITH_DECK_LIMIT',zenithCount:aZenithCount,limit:ZENITH_DECK_LIMIT},409);
      if(dZenithCount>ZENITH_DECK_LIMIT)return json({error:'상대의 랭크전 덱이 ZENITH 1장 편성 제한을 초과해 대전할 수 없습니다.',code:'OPPONENT_ZENITH_DECK_LIMIT'},409);
      const defUserRole=await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(defenderId).first(),aIds=aDeck.map(c=>String(c.id)),dIds=dDeck.map(c=>String(c.id));
      const aCards=aDeck.map(card=>({...card,power:cardBattlePower(card,card.breakthrough_level,battle)})),dCards=dDeck.map(card=>({...card,power:cardBattlePower(card,card.breakthrough_level,battle)}));
      const [aSyn,dSyn,uniqueStates,aCharacterBonus,dCharacterBonus,aMagic,dMagic]=await Promise.all([
        evaluateDeckSynergies(env,user,aIds,'PVP',{forceOwnerTest:String(user.role||'').toUpperCase()==='OWNER'}),
        evaluateDeckSynergies(env,defUserRole,dIds,'PVP',{forceOwnerTest:String(defUserRole?.role||'').toUpperCase()==='OWNER'}),
        cardUniqueDeckStates(env,[{user,cards:aCards},{user:defUserRole,cards:dCards}],'PVP'),
        userEquipmentBonuses(env,user.id),
        userEquipmentBonuses(env,defenderId),
        magicBattleLoadout(env,user,'PVP'),
        magicBattleLoadout(env,defUserRole,'PVP')
      ]);
      const [aUnique,dUnique]=uniqueStates;
      const aBase=Number(aUnique.power||aCards.reduce((s,c)=>s+Number(c.power||0),0)),dBase=Number(dUnique.power||dCards.reduce((s,c)=>s+Number(c.power||0),0));
      const aUniqueRuntime=aUnique.enabled?resolveUniqueBattleRuntime(aUnique,{mode:'PVP',opponentPower:dBase}):null,dUniqueRuntime=dUnique.enabled?resolveUniqueBattleRuntime(dUnique,{mode:'PVP',opponentPower:aBase}):null;
      const aSynergyMultiplier=1+Number(aSyn.totals.attackPercent||0)/100,dSynergyMultiplier=1+Number(dSyn.totals.attackPercent||0)/100;
      const aCardPower=Math.max(0,Math.floor(Number(aUniqueRuntime?.effectivePower||aBase)*aSynergyMultiplier)),dCardPower=Math.max(0,Math.floor(Number(dUniqueRuntime?.effectivePower||dBase)*dSynergyMultiplier)),legacyAPower=aCardPower+Number(aCharacterBonus.pvp||0),legacyDPower=dCardPower+Number(dCharacterBonus.pvp||0);
      const currentMatchAPower=Math.max(1,aCards.reduce((sum,card)=>sum+Number(card.power||0),0)+Number(aCharacterBonus.pvp||0)),currentMatchDPower=Math.max(1,dCards.reduce((sum,card)=>sum+Number(card.power||0),0)+Number(dCharacterBonus.pvp||0));
      if(currentMatchAPower!==Number(rankedTicket.attacker_power)||currentMatchDPower!==Number(rankedTicket.defender_power))return json({error:'매칭 후 덱·장비·칭호 정보가 변경되었습니다. 새로 매칭해주세요.',code:'PVP_MATCH_FORMATION_CHANGED'},409);
      const engineState=battleEngineState(battle,user),aUniqueById=new Map((aUnique.cards||[]).map(card=>[String(card.id),card.uniqueAbility||null])),dUniqueById=new Map((dUnique.cards||[]).map(card=>[String(card.id),card.uniqueAbility||null]));
      let battleV2=null,battleSeed=0;
      if(engineState.active){
        const seed=parseInt(drawIntegrityHash(`${user.id}:${defenderId}:${requestId}:PVP_V2`),16)>>>0;battleSeed=seed;
        const attackerEngineCards=aCards.map(card=>({...card,id:String(card.id),power:Math.max(1,Math.floor(Number(card.power||0)*aSynergyMultiplier)),uniqueAbility:aUniqueById.get(String(card.id))||card.uniqueAbility||null}));
        const defenderEngineCards=dCards.map(card=>({...card,id:String(card.id),power:Math.max(1,Math.floor(Number(card.power||0)*dSynergyMultiplier)),uniqueAbility:dUniqueById.get(String(card.id))||card.uniqueAbility||null}));
        battleV2=createPvpBattleV2({attackerCards:attackerEngineCards,defenderCards:defenderEngineCards,attackerMagicCards:aMagic.cards,defenderMagicCards:dMagic.cards,attackerEquipmentBonus:Number(aCharacterBonus.pvp||0),defenderEquipmentBonus:Number(dCharacterBonus.pvp||0),seed,singleHealerBonus:engineState.singleHealerBonus});
      }
      const attackerWin=engineState.active?battleV2.result.winner==='A':legacyAPower>=legacyDPower;
      const aPower=engineState.active?Number(battleV2.teams.A.summary.power||legacyAPower):legacyAPower,dPower=engineState.active?Number(battleV2.teams.B.summary.power||legacyDPower):legacyDPower;
      const winnerId=attackerWin?user.id:defenderId,aBefore=Number(attacker.season_score),dBefore=Number(defender.season_score),aAdj=pvpSeasonScoreAdjustment(attackerWin,aBefore,dBefore),dAdj=pvpSeasonScoreAdjustment(!attackerWin,dBefore,aBefore),change=aAdj.change,defenderChange=dAdj.change,aAfter=Math.max(0,aBefore+(attackerWin?change:-change)),dAfter=Math.max(0,dBefore+(attackerWin?-defenderChange:defenderChange)),aCard=0,dCard=0;
      const pvpEnergy=await consumePvpEnergy(env,user,settings);
      // PvP battle coin is an active-challenge reward. Only the authenticated attacker receives it.
      // The asynchronous defender never receives win/lose coins from being challenged.
      const attackerCoinReward=burningRewardAmount(attackerWin?settings.winCoin:settings.loseCoin,burning);
      const auditResult=battleV2?.result||{},auditFinal=auditResult.final||{A:[],B:[]},auditSurvivors=auditResult.survivorCount||{A:(auditFinal.A||[]).filter(card=>Number(card.hp||0)>0).length,B:(auditFinal.B||[]).filter(card=>Number(card.hp||0)>0).length};
      const auditHpPercent=side=>{const rows=Array.isArray(auditFinal?.[side])?auditFinal[side]:[],current=rows.reduce((sum,card)=>sum+Math.max(0,Number(card.hp||0))+Math.max(0,Number(card.shield||0)),0),maximum=rows.reduce((sum,card)=>sum+Math.max(0,Number(card.maxHp||0))+Math.max(0,Number(card.maxShield||0)),0);return maximum>0?Math.round(current/maximum*1000)/10:0};
      const matchWrites=[
        env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=MAX(highest_score,?),wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(aAfter,aAfter,attackerWin?1:0,attackerWin?0:1,user.id),
        env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=MAX(highest_score,?),wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(dAfter,dAfter,attackerWin?0:1,attackerWin?1:0,defenderId),
        env.DB.prepare('INSERT INTO pvp_match_history(attacker_id,defender_id,attacker_name,defender_name,attacker_deck,defender_deck,attacker_card_score,defender_card_score,attacker_power,defender_power,winner_id,attacker_score_before,attacker_score_after,defender_score_before,defender_score_after,score_change) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(user.id,defenderId,user.nickname,defUser.nickname,JSON.stringify(aIds),JSON.stringify(dIds),aCard,dCard,aPower,dPower,winnerId,aBefore,aAfter,dBefore,dAfter,change),
        env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(attackerCoinReward,user.id)
      ];
      if(engineState.active)matchWrites.push(env.DB.prepare(`INSERT OR REPLACE INTO pvp_battle_audits_v1781(
        attacker_id,request_id,defender_id,winner_id,winner_side,result_reason,original_reason,battle_seed,
        attacker_survivors,defender_survivors,attacker_hp_percent,defender_hp_percent,action_count,final_state_json,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
        user.id,String(requestId).slice(0,128),defenderId,winnerId,String(auditResult.winner||''),String(auditResult.reason||''),String(auditResult.originalReason||''),battleSeed,
        Number(auditSurvivors.A||0),Number(auditSurvivors.B||0),auditHpPercent('A'),auditHpPercent('B'),Number(auditResult.actions||0),JSON.stringify(auditFinal)
      ));
      await env.DB.batch(matchWrites);
      const coinUser=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
      if(attackerCoinReward>0)await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PVP_ATTACK_BATTLE')").bind(user.id,attackerCoinReward,coinUser.coin).run();
      const cubeReward=await grantBattleCube(env,user.id,'PVP',requestId,attackerWin);
      if(attackerWin)await grantHighGradeRerollDrop(env,{userId:user.id,content:'PVP',referenceId:requestId});
      const pvpMagic=(await magicSettings(env)).acquisition?.pvp||{};
      const magicReward=attackerWin?await resolveMagicCrystalReward(env,{userId:user.id,source:'PVP_DROP',referenceId:requestId,enabled:pvpMagic.enabled===true,chance:pvpMagic.chance,amount:pvpMagic.amount,dailyLimit:pvpMagic.dailyLimit,reason:'일반 PVP 승리 확률 드랍'}):null;
      const equipmentReward=attackerWin?await safeEquipmentDrop(env,{userId:user.id,sourceType:'PVP',sourceId:'*',requestId}):null,blackMiracleReward=attackerWin?await rollBlackMiracleDrop(env,{userId:user.id,source:'PVP',referenceId:requestId}):null,unifiedDrop=attackerWin?await safeUnifiedDrop(env,{userId:user.id,requestId:`UNIFIED:${requestId}`,sourceType:'PVP',sourceId:'*',triggerType:'WIN',context:{defenderId},role:user.role}):null,freshCoinUser=await env.DB.prepare('SELECT coin,magic_crystals FROM users WHERE id=?').bind(user.id).first(),weeklyPremiumCube=await premiumCubeWeeklyStatus(env,user.id);
      return json({result:attackerWin?'WIN':'LOSE',burningEvent:burningPublicState(burning),battleEngine:engineState,battleV2,cubeReward,weeklyPremiumCube,magicReward,equipmentReward,blackMiracleReward,unifiedDrop,attackerCharacterBonus:aCharacterBonus,defenderCharacterBonus:dCharacterBonus,attackerCardPower:aCardPower,defenderCardPower:dCardPower,scoreChange:attackerWin?change:-change,scoreAfter:aAfter,coinReward:attackerCoinReward,coinAfter:freshCoinUser?.coin??coinUser.coin,magicCrystalsAfter:Number(freshCoinUser?.magic_crystals||0),rewardRecipient:'ATTACKER',attackerPower:aPower,defenderPower:dPower,attackerTitle:titleMap[String(user.id)]||null,defenderTitle:titleMap[String(defenderId)]||null,opponent:defUser.nickname,attackerDeck:aUnique.cards||aDeck,defenderDeck:dUnique.cards||dDeck,uniqueAbility:{attacker:uniqueBattleResponsePayload(aUnique,aUniqueRuntime),defender:uniqueBattleResponsePayload(dUnique,dUniqueRuntime)},scoreAdjustment:aAdj,opponentScoreAdjustment:dAdj,energy:pvpEnergy,serverNow:new Date().toISOString()});
    }
    if(path==='pvp/history'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);const rows=await env.DB.prepare('SELECT id,attacker_id,defender_id,attacker_name,defender_name,attacker_power,defender_power,winner_id,attacker_score_before,attacker_score_after,defender_score_before,defender_score_after,score_change,created_at FROM pvp_match_history WHERE attacker_id=? OR defender_id=? ORDER BY id DESC LIMIT ?').bind(user.id,user.id,Number(settings.historyLimit||100)).all();const opponentIds=[...new Set((rows.results||[]).map(r=>Number(r.attacker_id)===Number(user.id)?Number(r.defender_id):Number(r.attacker_id)).filter(Boolean))],titleMap=await publicEquippedTitleMap(env,opponentIds);return json({history:rows.results.map(r=>{const opponentId=Number(r.attacker_id)===Number(user.id)?Number(r.defender_id):Number(r.attacker_id);return {...r,direction:Number(r.attacker_id)===Number(user.id)?'ATTACK':'DEFENSE',result:Number(r.winner_id)===Number(user.id)?'WIN':'LOSE',opponent:Number(r.attacker_id)===Number(user.id)?r.defender_name:r.attacker_name,opponentTitle:titleMap[String(opponentId)]||null,myScoreAfter:Number(r.attacker_id)===Number(user.id)?r.attacker_score_after:r.defender_score_after,score_change:Math.abs(Number(r.attacker_id)===Number(user.id)?Number(r.attacker_score_after)-Number(r.attacker_score_before):Number(r.defender_score_after)-Number(r.defender_score_before))}})});
    }
    if(path==='pvp/ranking'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);await publicEquippedTitleMap(env,[]);const lifecycle=await advancePvpSeasonLifecycle(env),settings=lifecycle.settings;if(lifecycle.settling)return json({error:'현재 랭크전 시즌 정산 중입니다. 새 시즌이 자동으로 시작되면 랭킹이 열립니다.',code:'PVP_SEASON_SETTLING',retryable:true,retryAfterMs:1500},409);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);const rows=await env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses,t.id AS titleId,t.name AS titleName,t.badge_text AS titleBadgeText,t.style_preset AS titleStylePreset FROM pvp_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN user_title_loadout tl ON tl.user_id=u.id LEFT JOIN user_character_titles ut ON ut.user_id=u.id AND ut.title_id=tl.title_id AND (ut.expires_at IS NULL OR ut.expires_at>CURRENT_TIMESTAMP) LEFT JOIN character_titles t ON t.id=tl.title_id AND ut.title_id IS NOT NULL AND t.is_active=1 AND t.is_public=1 WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname LIMIT 100`).all();const ranking=rows.results.map((x,i)=>({...x,title:x.titleId?{id:Number(x.titleId),name:x.titleName,badgeText:x.titleBadgeText||x.titleName,stylePreset:String(x.titleStylePreset||'DEFAULT').toUpperCase()}:null,rank:i+1,tier:resolveTier(Number(x.season_score),settings.tiers)}));return json({settings,ranking,me:ranking.find(x=>Number(x.id)===Number(user.id))||null});
    }
    if(path==='pvp/reward/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await pvpSettings(env);if(settings.automaticSeasons!==false)return json({error:'랭크전 시즌 보상은 정산 후 메시지함으로 자동 지급됩니다.'},409);const settled=await completedPvpSettlement(env,settings);if(settled)return json({error:'시즌 정산 보상은 메시지함에서 수령하세요.'},409);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 랭크전이 중지되어 있습니다.'},503);if(!settings.tierRewardsEnabled)return json({error:'티어 달성 보상이 중지되어 있습니다.'},503);if(settings.rewardClaimMode==='SEASON_END'&&settings.endsAt&&utcMs(settings.endsAt)>Date.now()&&!isAdminRole(user))return json({error:'시즌 종료 후 보상을 받을 수 있습니다.'},409);const p=await ensurePvpProfile(env,user,settings),tier=resolveTier(Number(p.highest_score),settings.tiers),rewardCoin=Number(tier.rewardCoin||0),rewardShards=Number(tier.rewardShards||0),exists=await env.DB.prepare('SELECT 1 FROM pvp_reward_claims WHERE user_id=? AND season_name=? AND tier_id=?').bind(user.id,settings.seasonName,tier.id).first();if(exists)return json({error:'이미 수령한 시즌 티어 보상입니다.'},409);await env.DB.batch([env.DB.prepare('INSERT INTO pvp_reward_claims(user_id,season_name,tier_id,reward_coin,reward_shards) VALUES(?,?,?,?,?)').bind(user.id,settings.seasonName,tier.id,rewardCoin,rewardShards),env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(rewardCoin,rewardShards,user.id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?").bind(rewardCoin,`PVP ${settings.seasonName} ${tier.name} 티어 보상`,user.id),env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,?,card_shards,? FROM users WHERE id=?").bind(rewardShards,`PVP ${settings.seasonName} ${tier.name} 티어 보상`,user.id)]);const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();return json({ok:true,tier,reward:rewardCoin,rewardCoin,rewardShards,user:await profile(env,updated)});
    }
    if(path==='pvp/rank-reward/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);if(isAdminRole(user))return json({error:'운영 계정은 시즌 랭킹 및 랭킹 보상 대상에서 제외됩니다.'},403);const settings=await pvpSettings(env);if(settings.automaticSeasons!==false)return json({error:'랭크전 시즌 보상은 정산 후 메시지함으로 자동 지급됩니다.'},409);const settled=await completedPvpSettlement(env,settings);if(settled)return json({error:'시즌 정산 보상은 메시지함에서 수령하세요.'},409);if(!settings.rankRewardsEnabled)return json({error:'시즌 랭킹 보상이 중지되어 있습니다.'},503);const seasonEndMs=settings.endsAt?utcMs(settings.endsAt):0;if(!seasonEndMs||seasonEndMs>Date.now())return json({error:'최종 랭킹 보상은 시즌 종료 후에만 받을 수 있습니다.'},409);const rows=await env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.wins FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname`).all(),rank=rows.results.findIndex(x=>Number(x.id)===Number(user.id))+1;if(!rank)return json({error:'시즌 랭킹 기록이 없습니다.'},404);const reward=(settings.rankRewards||[]).find(x=>rank>=Number(x.from)&&rank<=Number(x.to));if(!reward)return json({error:'현재 순위에 해당하는 랭킹 보상이 없습니다.'},404);const exists=await env.DB.prepare('SELECT 1 FROM pvp_rank_reward_claims WHERE user_id=? AND season_name=?').bind(user.id,settings.seasonName).first();if(exists)return json({error:'이미 수령한 시즌 랭킹 보상입니다.'},409);const rewardCoin=Number(reward.rewardCoin||0),rewardShards=Number(reward.rewardShards||0);await env.DB.batch([env.DB.prepare('INSERT INTO pvp_rank_reward_claims(user_id,season_name,final_rank,reward_coin,reward_shards) VALUES(?,?,?,?,?)').bind(user.id,settings.seasonName,rank,rewardCoin,rewardShards),env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(rewardCoin,rewardShards,user.id)]);const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();return json({ok:true,rank,rewardCoin,rewardShards,user:await profile(env,updated)});
    }

    if(path==='mineral-exchange/config'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await mineralExchangeSettings(env),today=kstTodaySql();
      const used=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status IN ('PENDING','APPROVED')").bind(user.id,today).first();
      const mine=await env.DB.prepare("SELECT id,wago_nickname,mineral_amount,coin_amount,proof_text,status,reject_reason,created_at,reviewed_at FROM mineral_exchange_requests WHERE user_id=? ORDER BY id DESC LIMIT 10").bind(user.id).all();
      return json({settings,usedCoin:Number(used?.total||0),remainingCoin:Math.max(0,Number(settings.dailyLimitCoin)-Number(used?.total||0)),requests:mine.results});
    }
    if(path==='mineral-exchange/request'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await mineralExchangeSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 미네랄 교환 신청이 중지되어 있습니다.'},503);
      const body=await readBody(request),wagoNickname=String(body.wagoNickname||'').trim().slice(0,40),proofText=String(body.proofText||'').trim().slice(0,500),mineralAmount=Math.floor(Number(body.mineralAmount||0));
      if(!wagoNickname)return json({error:'와이고수 닉네임을 입력하세요.'},400);if(wagoNickname.length<2)return json({error:'와이고수 닉네임을 정확히 입력하세요.'},400);
      if(!proofText)return json({error:'기부 완료 내용을 입력하세요.'},400);if(!Number.isSafeInteger(mineralAmount)||mineralAmount<=0)return json({error:'기부한 미네랄 수량을 정확히 입력하세요.'},400);
      const rawCoin=mineralAmount*Number(settings.payoutCoin)/Number(settings.baseMineral),coinAmount=Math.floor(rawCoin);
      if(!Number.isInteger(rawCoin)||coinAmount<=0||coinAmount%1000!==0)return json({error:'교환 신청은 1,000코인 단위로만 가능합니다.'},400);
      const today=kstTodaySql(),used=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status IN ('PENDING','APPROVED')").bind(user.id,today).first();
      if(Number(used?.total||0)+coinAmount>Number(settings.dailyLimitCoin))return json({error:`하루 최대 교환 가능 개수는 ${Number(settings.dailyLimitCoin).toLocaleString()}코인입니다.`},409);
      const result=await env.DB.prepare("INSERT INTO mineral_exchange_requests(user_id,game_nickname,wago_nickname,mineral_amount,coin_amount,proof_text,status,requested_kst_date) VALUES(?,?,?,?,?,?,'PENDING',?)").bind(user.id,user.nickname,wagoNickname,mineralAmount,coinAmount,proofText,today).run();
      return json({ok:true,id:result.meta.last_row_id,coinAmount});
    }

    if(path==='secondary-verification/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureSecondVerificationFoundation(env);
      const [verification,wago,settings]=await Promise.all([
        secondVerificationForUser(env,user.id),
        env.DB.prepare('SELECT wago_nickname,wago_member_no,status,verification_code,comment_url,profile_url,issued_at,expires_at,verified_at,review_note,last_checked_at FROM wago_verifications WHERE user_id=?').bind(user.id).first(),
        wagoVerificationSettings(env)
      ]);
      return json({
        verification:verification||null,
        wago:wago||null,
        settings:{enabled:settings.enabled,postUrl:settings.postUrl,codeMinutes:settings.codeMinutes},
        playdk:{enabled:playdkConfigured(env),startUrl:`${playdkBaseUrl(env)}/api/v2/g/${encodeURIComponent(String(env.PLAYDK_GAME_CODE||'skm'))}`}
      });
    }
    if(path==='secondary-verification/playdk'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureSecondVerificationFoundation(env);
      if(!playdkConfigured(env))return json({error:'PLAY DK 인증 서버 설정이 아직 완료되지 않았습니다.',code:'PLAYDK_NOT_CONFIGURED'},503);
      const existing=await secondVerificationForUser(env,user.id);
      if(existing?.provider==='WAGO')return secondaryProviderConflict('WAGO');
      const verifiedWago=await env.DB.prepare("SELECT 1 FROM wago_verifications WHERE user_id=? AND status='VERIFIED'").bind(user.id).first();
      if(verifiedWago)return secondaryProviderConflict('WAGO');
      const body=await readBody(request),token=String(body.token||'').trim();
      if(!token||token.length>2048)return json({error:'PLAY DK 인증 토큰이 올바르지 않습니다.',code:'PLAYDK_TOKEN_INVALID'},400);
      let identity;
      try{identity=await playdkIdentityClient(env).getUserInfo(token)}
      catch(error){
        if(error instanceof PlaydkApiError){
          const expired=error.status===400||error.status===404;
          console.warn('PLAY DK secondary verification failed',{status:error.status,path:error.path,expired});
          return json({error:expired?'PLAY DK 인증 시간이 만료되었거나 이미 사용한 요청입니다. 인증 버튼을 다시 눌러주세요.':'PLAY DK 인증 서버에서 사용자 정보를 확인하지 못했습니다.',code:expired?'PLAYDK_TOKEN_EXPIRED':'PLAYDK_UPSTREAM_ERROR'},expired?401:502);
        }
        throw error;
      }
      if(existing?.provider==='PLAYDK'){
        if(String(existing.provider_user_id)!==identity.uuid)return json({error:'이미 다른 PLAY DK 계정이 연결되어 있습니다. 관리자에게 연결 해제를 요청하세요.',code:'PLAYDK_ACCOUNT_MISMATCH'},409);
        await env.DB.prepare("UPDATE user_second_verifications SET provider_name=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND provider='PLAYDK'").bind(identity.name,user.id).run();
        return json({ok:true,verified:true,verification:{provider:'PLAYDK',providerName:identity.name,verifiedAt:existing.verified_at},duplicate:true});
      }
      const linked=await env.DB.prepare("SELECT user_id FROM user_second_verifications WHERE provider='PLAYDK' AND provider_user_id=?").bind(identity.uuid).first();
      if(linked&&Number(linked.user_id)!==Number(user.id))return json({error:'이 PLAY DK 계정은 이미 다른 숲켓몬 계정에 인증되어 있습니다.',code:'PLAYDK_ALREADY_LINKED'},409);
      try{
        await env.DB.batch([
          env.DB.prepare("INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name,verified_at,updated_at) VALUES(?,'PLAYDK',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(user.id,identity.uuid,identity.name),
          env.DB.prepare("DELETE FROM wago_verifications WHERE user_id=? AND status<>'VERIFIED'").bind(user.id)
        ]);
      }catch(error){
        if(isSecondaryProviderConflict(error))return json({error:'다른 2차 인증이 먼저 연결되었습니다. 상태를 새로 확인해주세요.',code:'SECONDARY_VERIFICATION_RACE'},409);
        throw error;
      }
      return json({ok:true,verified:true,verification:{provider:'PLAYDK',providerName:identity.name}});
    }
    if(path==='wago-verification/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureSecondVerificationFoundation(env);
      const settings=await wagoVerificationSettings(env),row=await env.DB.prepare('SELECT wago_nickname,wago_member_no,status,verification_code,comment_url,profile_url,issued_at,expires_at,verified_at,review_note,last_checked_at FROM wago_verifications WHERE user_id=?').bind(user.id).first(),secondary=await secondVerificationForUser(env,user.id);
      return json({settings:{enabled:settings.enabled,postUrl:settings.postUrl,codeMinutes:settings.codeMinutes},verification:row||null,secondary:secondary||null});
    }
    if(path==='wago-verification/request'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const secondary=await secondVerificationForUser(env,user.id);if(secondary?.provider==='PLAYDK')return secondaryProviderConflict('PLAYDK');
      const settings=await wagoVerificationSettings(env);if(!settings.enabled)return json({error:'현재 와고 인증이 중지되어 있습니다.'},503);
      const body=await readBody(request),nickname=String(body.wagoNickname||'').trim().slice(0,40),memberNo='';
      if(nickname.length<2)return json({error:'와고 닉네임을 정확히 입력하세요.'},400);
      if(!settings.postUrl)return json({error:'현재 인증 게시글이 준비되지 않았습니다.'},503);
      const code=makeVerificationCode(),minutes=Math.max(5,Math.min(60,Number(settings.codeMinutes)||20));
      await env.DB.prepare(`INSERT INTO wago_verifications(user_id,wago_nickname,wago_member_no,verification_code,status,expires_at,issued_at,updated_at) VALUES(?,?,?,?, 'PENDING',datetime('now',?),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET wago_nickname=excluded.wago_nickname,wago_member_no=excluded.wago_member_no,verification_code=excluded.verification_code,status='PENDING',comment_url=NULL,profile_url=NULL,wago_member_no='',expires_at=excluded.expires_at,issued_at=CURRENT_TIMESTAMP,verified_at=NULL,review_note=NULL,updated_at=CURRENT_TIMESTAMP`).bind(user.id,nickname,memberNo,code,`+${minutes} minutes`).run();
      return json({ok:true,verificationCode:code,postUrl:settings.postUrl,expiresMinutes:minutes});
    }
    if(path==='wago-verification/check'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const secondary=await secondVerificationForUser(env,user.id);if(secondary?.provider==='PLAYDK')return secondaryProviderConflict('PLAYDK');
      const settings=await wagoVerificationSettings(env),v=await env.DB.prepare('SELECT * FROM wago_verifications WHERE user_id=?').bind(user.id).first();if(!v)return json({error:'먼저 인증코드를 발급하세요.'},404);
      if(v.status==='VERIFIED')return json({ok:true,verified:true,verification:v});if(new Date(v.expires_at+'Z')<new Date())return json({error:'인증코드 유효시간이 만료되었습니다. 새 코드를 발급하세요.'},410);
      if(!settings.postUrl)return json({error:'현재 인증 게시글이 준비되지 않았습니다.'},503);
      const inspected=await inspectWagoComment(settings,v);
      await env.DB.prepare("UPDATE wago_verifications SET comment_url=?,profile_url=NULL,last_checked_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(settings.postUrl,inspected.ok?inspected.notice:inspected.error,user.id).run();
      if(!inspected.ok)return json({error:inspected.error},409);
      const duplicate=await env.DB.prepare("SELECT user_id FROM wago_verifications WHERE wago_member_no=? AND status='VERIFIED' AND user_id<>?").bind(inspected.memberNo,user.id).first();if(duplicate)return json({error:'이미 다른 숲켓몬 계정에 인증된 회원번호입니다.'},409);
      try{await env.DB.prepare("UPDATE wago_verifications SET status='VERIFIED',wago_member_no=?,comment_url=?,profile_url=NULL,verified_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(inspected.memberNo,inspected.commentUrl,inspected.notice,user.id).run()}
      catch(error){if(isSecondaryProviderConflict(error))return json({error:'다른 2차 인증이 먼저 연결되었습니다. 상태를 새로 확인해주세요.',code:'SECONDARY_VERIFICATION_RACE'},409);throw error}
      return json({ok:true,verified:true,message:`댓글 작성자 회원번호 ${inspected.memberNo}번을 확인하여 자동 인증되었습니다.`});
    }
    if(path==='wago-daily-quest/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureWagoDailyPostProgressTable(env);
      const settings=await wagoDailyQuestSettings(env),today=kstDate();
      const verification=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      const postProgress=await env.DB.prepare('SELECT post_count,last_checked_at FROM wago_daily_post_progress_v2 WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      const postClaim=await env.DB.prepare('SELECT reward_coin,post_count,claimed_at FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      return json({settings:{enabled:settings.enabled,postEnabled:settings.postEnabled!==false,requiredPosts:Number(settings.requiredPosts||15),postRewardCoin:Number(settings.postRewardCoin||1200),rewardCoin:Number(settings.postRewardCoin||1200)},verified:verification?.status==='VERIFIED',wagoNickname:verification?.wago_nickname||'',wagoMemberNo:verification?.wago_member_no||'',verificationBasis:'MEMBER_NO',postCount:Number(postProgress?.post_count||0),postLastCheckedAt:postProgress?.last_checked_at||null,postClaimed:Boolean(postClaim),postClaim:postClaim||null,excluded:dailyQuestAdminExcluded(user,settings)});
    }
    if(path==='wago-daily-quest/check'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureWagoDailyPostProgressTable(env);
      const body=await readBody(request),questType=String(body.questType||'POST').toUpperCase();
      const settings=await wagoDailyQuestSettings(env);if(settings.enabled===false)return json({error:'현재 일일퀘스트가 중지되어 있습니다.'},503);
      if(dailyQuestAdminExcluded(user,settings))return json({error:'운영 계정의 일일퀘스트 테스트가 중지되어 있습니다.'},403);
      const v=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      if(v?.status!=='VERIFIED'||!v.wago_member_no)return json({error:'와고 2단계 인증 완료 후 이용할 수 있습니다.'},403);
      const today=kstDate(),cooldown=Math.max(5,Number(settings.checkCooldownSeconds)||20);
      if(questType!=='POST')return json({error:'지원하지 않는 일일퀘스트입니다.'},400);
      if(settings.postEnabled===false)return json({error:'게시글 일일퀘스트가 중지되어 있습니다.'},503);
      const old=await env.DB.prepare('SELECT post_count,last_checked_at FROM wago_daily_post_progress_v2 WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      if(old?.last_checked_at&&Date.now()-Date.parse(String(old.last_checked_at).replace(' ','T')+'Z')<cooldown*1000)return json({ok:true,questType:'POST',postCount:Number(old.post_count||0),requiredPosts:Number(settings.requiredPosts||15),rewardCoin:Number(settings.postRewardCoin||1200),cooldown:true});
      const inspected=await inspectWagoDailyPosts(settings,v.wago_member_no,v.wago_nickname,today);if(!inspected.ok)return json({error:inspected.error},502);
      const stablePostCount=Number(inspected.postCount||0);
      const stablePostIds=[...new Set(inspected.postIds||[])];
      await env.DB.prepare(`INSERT INTO wago_daily_post_progress_v2(user_id,quest_date,post_count,post_ids_json,last_checked_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,quest_date) DO UPDATE SET post_count=excluded.post_count,post_ids_json=excluded.post_ids_json,last_checked_at=CURRENT_TIMESTAMP`).bind(user.id,today,stablePostCount,JSON.stringify(stablePostIds)).run();
      return json({ok:true,questType:'POST',postCount:stablePostCount,requiredPosts:Number(settings.requiredPosts||15),rewardCoin:Number(settings.postRewardCoin||1200)});
    }
    if(path==='wago-daily-quest/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureWagoDailyPostProgressTable(env);
      const body=await readBody(request),questType=String(body.questType||'POST').toUpperCase();
      const settings=await wagoDailyQuestSettings(env);if(settings.enabled===false)return json({error:'현재 일일퀘스트가 중지되어 있습니다.'},503);
      if(dailyQuestAdminExcluded(user,settings))return json({error:'운영 계정의 일일퀘스트 테스트가 중지되어 있습니다.'},403);
      const v=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      if(v?.status!=='VERIFIED'||!v.wago_member_no)return json({error:'와고 2단계 인증 완료 후 이용할 수 있습니다.'},403);
      const today=kstDate();
      if(questType!=='POST')return json({error:'지원하지 않는 일일퀘스트입니다.'},400);
      if(settings.postEnabled===false)return json({error:'게시글 일일퀘스트가 중지되어 있습니다.'},503);
      const already=await env.DB.prepare('SELECT id FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?').bind(user.id,today).first();if(already)return json({error:'오늘 게시글 퀘스트 보상은 이미 수령했습니다.'},409);
      const oldPost=await env.DB.prepare('SELECT post_count,post_ids_json FROM wago_daily_post_progress_v2 WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      const inspected=await inspectWagoDailyPosts(settings,v.wago_member_no,v.wago_nickname,today);if(!inspected.ok)return json({error:inspected.error},502);
      const stablePostCount=Number(inspected.postCount||0);
      const stablePostIds=[...new Set(inspected.postIds||[])];
      const required=Math.max(1,Number(settings.requiredPosts)||15),reward=Math.max(0,Number(settings.postRewardCoin)||1200);
      await env.DB.prepare(`INSERT INTO wago_daily_post_progress_v2(user_id,quest_date,post_count,post_ids_json,last_checked_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,quest_date) DO UPDATE SET post_count=excluded.post_count,post_ids_json=excluded.post_ids_json,last_checked_at=CURRENT_TIMESTAMP`).bind(user.id,today,stablePostCount,JSON.stringify(stablePostIds)).run();
      if(stablePostCount<required)return json({error:`오늘 SOOP 게시판 작성글이 ${stablePostCount}개입니다. ${required}개 작성 후 수령할 수 있습니다.`,postCount:stablePostCount,requiredPosts:required},409);
      const inserted=await env.DB.prepare('INSERT OR IGNORE INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count) VALUES(?,?,?,?)').bind(user.id,today,reward,stablePostCount).run();
      if(!inserted.meta.changes)return json({error:'오늘 게시글 퀘스트 보상은 이미 수령했습니다.'},409);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id),
        env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin+?,'WAGO_DAILY_QUEST' FROM users WHERE id=?").bind(reward,reward,user.id)
      ]);
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({ok:true,questType:'POST',rewardCoin:reward,postCount:stablePostCount,user:await profile(env,updated)});
    }

    if(path==='messages'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureMessageRewardClaimV1222(env);
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`SELECT m.id,m.title,m.body,m.message_type,m.coupon_code,m.is_read,m.created_at,m.read_at,r.reward_type,r.reward_amount,r.claimed_at,0 AS needs_recovery
          FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=m.user_id
          WHERE m.user_id=? AND m.hidden_at IS NULL ORDER BY m.id DESC LIMIT 100`).bind(user.id).all();
        let recoveryRows=[];
        try{
          const recovery=await env.DB.prepare(`SELECT m.id,m.title,m.body,m.message_type,m.coupon_code,1 AS is_read,m.created_at,m.read_at,r.reward_type,r.reward_amount,r.claimed_at,1 AS needs_recovery
            FROM user_messages m
            JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=m.user_id
            JOIN wago_extension_reward_receipts w ON w.message_id=m.id AND w.user_id=m.user_id
            JOIN users u ON u.id=m.user_id
            LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
            WHERE m.user_id=? AND m.hidden_at IS NOT NULL AND r.claimed_at IS NOT NULL
              AND c.reward_id IS NULL AND UPPER(COALESCE(r.reward_type,''))='COIN'
              AND COALESCE(w.balance_after,0)=COALESCE(w.balance_before,0)
              AND COALESCE(u.coin,0)=COALESCE(w.balance_before,0)
            ORDER BY m.id DESC LIMIT 5`).bind(user.id).all();
          recoveryRows=recovery.results||[];
        }catch{}
        const messages=[...recoveryRows,...(rows.results||[])];
        return json({messages,unread:messages.filter(x=>!x.is_read).length,recoveryCount:recoveryRows.length});
      }
      if(request.method==='PATCH'){
        const body=await readBody(request),id=Number(body.id);if(!id)return json({error:'메시지 정보가 올바르지 않습니다.'},400);
        if(String(body.action||'').toUpperCase()==='HIDE'){
          const hidden=await env.DB.prepare('UPDATE user_messages SET hidden_at=CURRENT_TIMESTAMP,is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=? AND hidden_at IS NULL').bind(id,user.id).run();
          if(!hidden.meta.changes)return json({error:'메시지를 찾을 수 없거나 이미 삭제했습니다.'},404);
          return json({ok:true,messageDeleted:true});
        }
        await env.DB.prepare('UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?').bind(id,user.id).run();return json({ok:true});
      }
    }
    if(path==='messages/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await ensureMessageRewardClaimV1222(env);
      const body=await readBody(request),messageId=Number(body.messageId);if(!messageId)return json({error:'메시지 정보가 올바르지 않습니다.'},400);
      const reward=await env.DB.prepare(`SELECT r.id,r.message_id,r.reward_type,r.reward_amount,r.claimed_at,m.title,m.hidden_at
        FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id
        WHERE r.message_id=? AND r.user_id=?`).bind(messageId,user.id).first();
      if(!reward)return json({error:'수령할 보상이 없습니다.'},404);
      const rewardType=String(reward.reward_type||'').toUpperCase(),rewardAmount=Math.floor(Number(reward.reward_amount||0));
      const rewardSpec=verifiedMessageRewardSpec(rewardType);if(!rewardSpec||rewardAmount<=0)return json({error:'지원하지 않는 메시지 보상입니다.'},400);
      const alreadyClaimed=String(reward.claimed_at||'').trim()!=='';
      let allowClaimedRecovery=false;
      if(alreadyClaimed){
        const existing=await env.DB.prepare('SELECT reward_id FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?').bind(reward.id,user.id).first();
        if(existing)return json({error:'이미 정상 수령한 보상입니다.'},409);
        allowClaimedRecovery=await canSafelyRecoverFailedMessageRewardV1222(env,user,reward,messageId);
        if(!allowClaimedRecovery)return json({error:'이전 수령 기록은 자동 복구 조건을 확인할 수 없습니다. 관리자에게 해당 메시지 재지급을 요청하세요.',code:'MESSAGE_REWARD_MANUAL_REISSUE_REQUIRED'},409);
      }
      const claimed=await claimMessageRewardDirectV1222(env,user,reward,messageId,{allowClaimedRecovery});
      if(claimed.duplicate)return json({error:'이미 정상 수령한 보상입니다.'},409);
      const updated=claimed.updated;if(!updated)return json({error:'보상 수령 후 계정 정보를 확인하지 못했습니다.'},500);
      const balanceAfter=Number(claimed.balanceAfter||0);
      return json({ok:true,rewardType,rewardAmount,rewardLabel:claimed.rewardLabel||rewardSpec.label,itemCode:claimed.itemCode||null,balanceBefore:claimed.balanceBefore,balanceAfter,inventoryBalanceAfter:rewardSpec.inventory?balanceAfter:null,coinAfter:Number(updated.coin||0),cardShardsAfter:Number(updated.card_shards||0),messageDeleted:true,recovered:allowClaimedRecovery===true,user:await profile(env,updated)});
    }

    if(path==='admin/secondary-verifications'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      await ensureSecondVerificationFoundation(env);
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`SELECT s.user_id,s.provider,s.provider_user_id,s.provider_name,s.verified_at,s.updated_at,u.nickname AS game_nickname,u.status AS user_status
          FROM user_second_verifications s JOIN users u ON u.id=s.user_id ORDER BY s.verified_at DESC LIMIT 500`).all();
        return json({verifications:rows.results||[]});
      }
      if(request.method==='DELETE'){
        const body=await readBody(request),userId=Number(body.userId),reason=String(body.reason||'관리자 연결 해제').trim().slice(0,200);
        if(!userId)return json({error:'대상 계정이 올바르지 않습니다.'},400);
        const before=await env.DB.prepare('SELECT * FROM user_second_verifications WHERE user_id=?').bind(userId).first();if(!before)return json({error:'연결된 2차 인증이 없습니다.'},404);
        if(before.provider==='WAGO')await env.DB.prepare("UPDATE wago_verifications SET status='PENDING',verified_at=NULL,reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='VERIFIED'").bind(admin.id,reason,userId).run();
        else await env.DB.prepare("DELETE FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(userId).run();
        await writeAdminLog(env,admin,'SECONDARY_VERIFICATION_UNLINK','USER',userId,before,{provider:before.provider,reason});
        return json({ok:true,provider:before.provider});
      }
    }
    if(path==='admin/wago-verifications'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      await ensureSecondVerificationFoundation(env);
      if(request.method==='GET'){const settings=await wagoVerificationSettings(env),rows=await env.DB.prepare(`SELECT w.*,u.nickname AS game_nickname FROM wago_verifications w JOIN users u ON u.id=w.user_id ORDER BY CASE w.status WHEN 'REVIEW' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,w.id DESC LIMIT 500`).all();return json({settings,verifications:rows.results});}
      if(request.method==='PATCH'){
        const body=await readBody(request);
        if(body.settings){if(admin.role!=='OWNER')return json({error:'인증 설정 변경은 OWNER만 가능합니다.'},403);const before=await wagoVerificationSettings(env),next={...before,enabled:body.settings.enabled!==false,postUrl:String(body.settings.postUrl||'').trim().slice(0,500),codeMinutes:Math.max(5,Math.min(60,Number(body.settings.codeMinutes)||20)),checkCooldownSeconds:Math.max(5,Math.min(60,Number(body.settings.checkCooldownSeconds)||10))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_verification_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();await writeAdminLog(env,admin,'WAGO_SETTINGS','APP_META','wago_verification_settings_v1',before,next);return json({ok:true,settings:next});}
        const id=Number(body.id),action=String(body.action||'').toUpperCase();const before=await env.DB.prepare('SELECT * FROM wago_verifications WHERE id=?').bind(id).first();if(!before)return json({error:'인증 요청이 없습니다.'},404);
        if(action==='APPROVE'){const dup=await env.DB.prepare("SELECT id FROM wago_verifications WHERE wago_member_no=? AND status='VERIFIED' AND id<>?").bind(before.wago_member_no,id).first();if(dup)return json({error:'이미 인증된 회원번호입니다.'},409);try{await env.DB.prepare("UPDATE wago_verifications SET status='VERIFIED',verified_at=CURRENT_TIMESTAMP,reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,String(body.note||'CMS 승인').slice(0,200),id).run()}catch(error){if(isSecondaryProviderConflict(error))return json({error:'이 계정에는 이미 PLAY DK 2차 인증이 연결되어 있습니다.',code:'SECONDARY_PROVIDER_ALREADY_VERIFIED'},409);throw error}}
        else if(action==='REJECT')await env.DB.prepare("UPDATE wago_verifications SET status='REJECTED',reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,String(body.note||'인증 정보 불일치').slice(0,200),id).run();
        else if(action==='RESET')await env.DB.prepare("UPDATE wago_verifications SET status='PENDING',verified_at=NULL,reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,'재인증 요청',id).run();else return json({error:'올바르지 않은 처리입니다.'},400);
        await writeAdminLog(env,admin,`WAGO_${action}`,'WAGO_VERIFICATION',id,before,{action,note:body.note||''});return json({ok:true});
      }
    }
    const ensureWagoExtensionRewardReceipts=async()=>{
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wago_extension_reward_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, admin_id INTEGER NOT NULL, user_id INTEGER NOT NULL, wago_nickname TEXT NOT NULL, wago_member_no TEXT, amount INTEGER NOT NULL, reason TEXT NOT NULL, source_url TEXT, source_key TEXT, balance_before INTEGER NOT NULL DEFAULT 0, balance_after INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wago_extension_rewards_user ON wago_extension_reward_receipts(user_id,created_at)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wago_extension_rewards_source ON wago_extension_reward_receipts(source_key,created_at)`).run();
      const receiptColumns=await env.DB.prepare('PRAGMA table_info(wago_extension_reward_receipts)').all();
      if(!(receiptColumns.results||[]).some(column=>String(column.name)==='message_id')){
        await env.DB.prepare('ALTER TABLE wago_extension_reward_receipts ADD COLUMN message_id INTEGER').run();
      }
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1074_wago_extension_rewards','1',CURRENT_TIMESTAMP)").run();
    };

    const normalizeWagoExtensionNickname=value=>{
      let nickname=String(value||'').replace(/\u00a0/g,' ').trim();
      nickname=nickname.replace(/\[\s*i\s*\]?\s*$/i,'').replace(/\s*\[i\]\s*$/i,'').replace(/\s*#\d+.*$/,'').replace(/\s+/g,' ').trim();
      for(let i=0;i<2;i++){if(nickname.length%2===0&&nickname.slice(0,nickname.length/2)===nickname.slice(nickname.length/2))nickname=nickname.slice(0,nickname.length/2).trim();}
      return nickname.slice(0,80);
    };

    if(path==='admin/wago-extension/resolve'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COIN_GRANT');if(!admin)return json({error:'코인 지급 권한이 없습니다.'},403);
      const body=await readBody(request),wagoNickname=normalizeWagoExtensionNickname(body.wagoNickname);
      if(!wagoNickname)return json({error:'와고 닉네임을 확인할 수 없습니다.'},400);
      const rows=await env.DB.prepare(`SELECT u.id,u.nickname,u.coin,u.status,w.wago_nickname,w.wago_member_no,w.verified_at
        FROM wago_verifications w JOIN users u ON u.id=w.user_id
        WHERE UPPER(TRIM(w.wago_nickname))=UPPER(TRIM(?)) AND UPPER(TRIM(w.status))='VERIFIED'
        ORDER BY w.verified_at DESC,w.id DESC LIMIT 3`).bind(wagoNickname).all();
      const matches=rows.results||[];
      if(!matches.length)return json({error:'2단계 인증 연결 기록이 없습니다.',code:'WAGO_NOT_VERIFIED',wagoNickname},404);
      if(matches.length>1)return json({error:'동일 와고 닉네임에 인증 완료 계정이 여러 개 연결되어 있습니다. CMS에서 연결 기록을 정리하세요.',code:'WAGO_DUPLICATE_LINK',wagoNickname,matches:matches.map(x=>({gameNickname:x.nickname,wagoMemberNo:x.wago_member_no}))},409);
      const user=matches[0];
      if(String(user.status||'ACTIVE').toUpperCase()!=='ACTIVE')return json({error:'연결된 숲켓몬 계정이 이용 정지 상태입니다.',code:'TARGET_INACTIVE'},409);
      return json({ok:true,wagoNickname:user.wago_nickname,wagoMemberNo:user.wago_member_no,gameUser:{id:user.id,nickname:user.nickname,coin:Number(user.coin||0)},verifiedAt:user.verified_at});
    }

    if(path==='admin/wago-extension/grant'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      await ensureWagoExtensionRewardReceipts();
      const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,120),userId=Number(body.targetUserId),wagoNickname=normalizeWagoExtensionNickname(body.wagoNickname),amount=Math.floor(Number(body.amount||0)),reason=String(body.reason||'').trim().slice(0,120),sourceUrl=String(body.sourceUrl||'').trim().slice(0,700),sourceKey=String(body.sourceKey||'').trim().slice(0,300);
      if(!requestId||!userId||!wagoNickname||!reason||amount<1||amount>1000000)return json({error:'지급 정보가 올바르지 않습니다.'},400);
      const previous=await env.DB.prepare('SELECT request_id,user_id,amount,balance_after,created_at FROM wago_extension_reward_receipts WHERE request_id=?').bind(requestId).first();
      if(previous)return json({ok:true,duplicate:true,delivery:'MESSAGE',receipt:previous});
      const linked=await env.DB.prepare(`SELECT w.user_id,w.wago_nickname,w.wago_member_no,u.nickname,u.coin,u.status
        FROM wago_verifications w JOIN users u ON u.id=w.user_id
        WHERE w.user_id=? AND UPPER(TRIM(w.wago_nickname))=UPPER(TRIM(?)) AND UPPER(TRIM(w.status))='VERIFIED' LIMIT 1`).bind(userId,wagoNickname).first();
      if(!linked)return json({error:'현재 2단계 인증 연결 정보와 일치하지 않습니다.',code:'WAGO_LINK_CHANGED'},409);
      if(String(linked.status||'ACTIVE').toUpperCase()!=='ACTIVE')return json({error:'정지되거나 비활성화된 계정에는 지급할 수 없습니다.'},409);
      if(sourceKey){const duplicateSource=await env.DB.prepare('SELECT id,request_id,amount,created_at FROM wago_extension_reward_receipts WHERE source_key=? AND user_id=? AND reason=? ORDER BY id DESC LIMIT 1').bind(sourceKey,userId,reason).first();if(duplicateSource&&!body.allowDuplicate)return json({error:'같은 게시글 또는 댓글에 동일 사유로 이미 지급된 기록이 있습니다.',code:'SOURCE_ALREADY_REWARDED',previous:duplicateSource},409);}
      const beforeCoin=Number(linked.coin||0);
      const title=String(body.title||'숲켓몬 이벤트 코인 지급').trim().slice(0,100);
      const messageBody=String(body.messageBody||`${reason} 보상으로 ${amount.toLocaleString()}코인이 도착했습니다. 메시지에서 수령해 주세요.`).trim().slice(0,1000);
      const messageResult=await env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'ADMIN',?,?,'COIN_REWARD')").bind(userId,title,messageBody).run();
      const messageId=Number(messageResult?.meta?.last_row_id||0);if(!messageId)throw new Error('코인 보상 메시지 저장 ID 확인 실패');
      await env.DB.batch([
        env.DB.prepare("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(?,?,'COIN',?)").bind(messageId,userId,amount),
        env.DB.prepare('INSERT INTO wago_extension_reward_receipts(request_id,admin_id,user_id,wago_nickname,wago_member_no,amount,reason,source_url,source_key,balance_before,balance_after,message_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestId,admin.id,userId,linked.wago_nickname,linked.wago_member_no,amount,reason,sourceUrl,sourceKey,beforeCoin,beforeCoin,messageId)
      ]);
      await writeAdminLog(env,admin,'WAGO_EXTENSION_COIN_MESSAGE_SEND','USER_MESSAGE',messageId,null,{userId,nickname:linked.nickname,wagoNickname:linked.wago_nickname,amount,reason,sourceUrl,sourceKey,delivery:'MESSAGE'});
      return json({ok:true,delivery:'MESSAGE',messageId,rewardCoin:amount,gameUser:{id:userId,nickname:linked.nickname,coin:beforeCoin},notice:'코인 보상 메시지를 발송했습니다. 유저가 메시지에서 수령하면 코인이 반영됩니다.'});
    }
    if(path==='admin/wago-extension/recent'&&request.method==='GET'){
      const admin=await requirePermission(request,env,'COIN_GRANT');if(!admin)return json({error:'코인 지급 권한이 없습니다.'},403);
      await ensureWagoExtensionRewardReceipts();
      const requestUrl=new URL(request.url),targetUserId=Math.max(0,Number(requestUrl.searchParams.get('userId')||0));
      const where=targetUserId?'WHERE r.user_id=?':'';
      const limit=targetUserId?10:50;
      let rows;
      try{
        const sql=`SELECT r.request_id,r.admin_id,r.user_id,r.wago_nickname,r.wago_member_no,r.amount,r.reason,r.source_url,r.message_id,r.created_at,
            u.nickname AS game_nickname,COALESCE(a.nickname,'알 수 없음') AS admin_nickname,mr.claimed_at,
            CASE WHEN r.message_id IS NULL THEN 'UNKNOWN' WHEN mr.claimed_at IS NOT NULL THEN 'CLAIMED' ELSE 'SENT' END AS reward_status
          FROM wago_extension_reward_receipts r
          LEFT JOIN users u ON u.id=r.user_id
          LEFT JOIN users a ON a.id=r.admin_id
          LEFT JOIN user_message_rewards mr ON mr.message_id=r.message_id AND mr.user_id=r.user_id AND mr.reward_type='COIN'
          ${where} ORDER BY r.id DESC LIMIT ${limit}`;
        rows=targetUserId?await env.DB.prepare(sql).bind(targetUserId).all():await env.DB.prepare(sql).all();
      }catch(historyJoinError){
        const fallbackSql=`SELECT r.request_id,r.admin_id,r.user_id,r.wago_nickname,r.wago_member_no,r.amount,r.reason,r.source_url,r.created_at,
            u.nickname AS game_nickname,COALESCE(a.nickname,'알 수 없음') AS admin_nickname,
            NULL AS message_id,NULL AS claimed_at,'UNKNOWN' AS reward_status
          FROM wago_extension_reward_receipts r
          LEFT JOIN users u ON u.id=r.user_id
          LEFT JOIN users a ON a.id=r.admin_id
          ${where} ORDER BY r.id DESC LIMIT ${limit}`;
        rows=targetUserId?await env.DB.prepare(fallbackSql).bind(targetUserId).all():await env.DB.prepare(fallbackSql).all();
      }
      return json({ok:true,items:rows.results||[],targetUserId:targetUserId||null});
    }

    if((path==='admin/verified-reward-message-send'||path==='admin/verified-coin-message-send')&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      await ensureVerifiedRewardMessageV1276(env);
      await ensureSecondVerificationFoundation(env);
      const body=await readBody(request);
      const requestedType=path==='admin/verified-coin-message-send'?'COIN':String(body.rewardType||'COIN').trim().toUpperCase();
      const spec=verifiedMessageRewardSpec(requestedType);
      if(!spec||!['COIN','MASTER_STAR','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX','HIGH_GRADE_REROLL_TICKET'].includes(requestedType))return json({error:'지원하지 않는 인증자 메시지 보상입니다.'},400);
      const rawAmount=Number(String(body.rewardAmount??body.rewardCoin??'').replace(/,/g,'').trim());
      if(!Number.isFinite(rawAmount)||rawAmount<1||rawAmount>spec.max)return json({error:`지급 ${spec.label} 수량은 1~${spec.max.toLocaleString()} 범위로 입력하세요.`},400);
      const rewardAmount=Math.floor(rawAmount);
      const title=String(body.title||`2차 인증 ${spec.label} 보상`).trim().slice(0,100);
      const messageBody=String(body.body||`2차 인증 완료 보상으로 ${spec.label} ${rewardAmount.toLocaleString()}개 보상이 도착했습니다. 메시지에서 수령해 주세요.`).trim().slice(0,1000);
      const includeOwner=body.includeOwner===true,includeAdmin=body.includeAdmin===true;
      const campaignKey=String(body.requestId||globalThis.crypto?.randomUUID?.()||`verified-reward-${Date.now()}-${Math.random().toString(36).slice(2)}`).trim().slice(0,120);
      if(!campaignKey)return json({error:'발송 요청 식별자를 생성하지 못했습니다.'},500);
      const recipientWhere=`UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' AND (UPPER(TRIM(COALESCE(u.role,'USER'))) NOT IN ('OWNER','ADMIN') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='OWNER') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='ADMIN'))`;
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
          SELECT s.user_id,'ADMIN',?,?,?,? FROM user_second_verifications s JOIN users u ON u.id=s.user_id WHERE ${recipientWhere}`)
          .bind(title,messageBody,spec.messageType,campaignKey,includeOwner?1:0,includeAdmin?1:0),
        env.DB.prepare(`INSERT OR IGNORE INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
          SELECT m.id,m.user_id,?,? FROM user_messages m WHERE m.campaign_key=?`)
          .bind(requestedType,rewardAmount,campaignKey)
      ]);
      const roleRows=await env.DB.prepare(`SELECT UPPER(TRIM(COALESCE(u.role,'USER'))) AS role,COUNT(*) AS count
        FROM user_messages m JOIN users u ON u.id=m.user_id WHERE m.campaign_key=? GROUP BY UPPER(TRIM(COALESCE(u.role,'USER')))`)
        .bind(campaignKey).all();
      let sentUsers=0,sentOwners=0,sentAdmins=0;
      for(const row of roleRows.results||[]){const count=Number(row.count||0);if(row.role==='OWNER')sentOwners+=count;else if(row.role==='ADMIN')sentAdmins+=count;else sentUsers+=count}
      const sent=sentUsers+sentOwners+sentAdmins;
      if(!sent)return json({error:'발송 대상인 2단계 인증 완료 유저가 없습니다.'},404);
      await writeAdminLog(env,admin,'VERIFIED_REWARD_MESSAGE_SEND','USER_MESSAGE',campaignKey,null,{sent,sentUsers,sentOwners,sentAdmins,rewardType:requestedType,rewardAmount,rewardLabel:spec.label,title,includeOwner,includeAdmin,campaignKey});
      return json({ok:true,sent,sentUsers,sentOwners,sentAdmins,rewardType:requestedType,rewardAmount,rewardLabel:spec.label,rewardCoin:requestedType==='COIN'?rewardAmount:0,campaignKey,delivery:'MESSAGE'});
    }

    if(path==='admin/verified-coupon-send'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COUPON_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      return json({error:'인증 완료 유저 쿠폰 일괄 발송 기능은 운영 정책에 따라 중지되었습니다. 코인 보상 메시지 발송 기능을 사용하세요.',code:'VERIFIED_COUPON_SEND_DISABLED'},410);
    }

    if(path==='recent-high-grade'){
      return json({items:await recentHighGradeItems(env)});
    }
    if(path==='recent-equipment'){
      return json({items:await recentMythicEquipmentItems(env)});
    }
    if(path==='ranking'){
      const viewer=await authenticate(request,env),settings=await battleSettings(env),tiers=(await tierSettings(env)).cardScoreTiers;
      const now=Date.now();let allRanking=collectionRankingCache?.expiresAt>now?collectionRankingCache.value:null;
      if(!allRanking){
        const rows=await env.DB.prepare(`SELECT u.id,u.nickname,c.id AS card_id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level,COUNT(uc.card_id) AS card_count
          FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id AND COALESCE(uc.quantity,0)>0 LEFT JOIN cards_effective_v1210 c ON c.id=uc.card_id
          WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
          GROUP BY u.id,u.nickname,c.id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level ORDER BY u.id`).all();
        const map=new Map();for(const r of rows.results){if(!map.has(r.id))map.set(r.id,{id:Number(r.id),nickname:r.nickname,score:0,card_count:0,max_breakthrough:0});const x=map.get(r.id);if(r.rarity){x.score+=cardBattlePower({...r,id:r.card_id},Number(r.breakthrough_level||0),settings)*Number(r.card_count||0);x.card_count+=Number(r.card_count||0);x.max_breakthrough=Math.max(x.max_breakthrough,Number(r.breakthrough_level||0));}}
        allRanking=[...map.values()].sort((a,b)=>b.score-a.score||b.card_count-a.card_count||a.nickname.localeCompare(b.nickname,'ko')).map((x,i)=>({...x,rank:i+1,tier:resolveTier(x.score,tiers)}));
        collectionRankingCache={value:allRanking,expiresAt:now+300000};
      }
      const ranking=allRanking.slice(0,100),me=viewer?allRanking.find(x=>Number(x.id)===Number(viewer.id))||null:null;
      return json({ranking,tiers,me});
    }


    if(path==='coupon/redeem'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const code=String(payload.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40);
      if(!code) return json({error:'쿠폰 코드를 입력하세요.'},400);
      const coupon=await env.DB.prepare(`SELECT * FROM coupons WHERE code=?`).bind(code).first();
      if(!coupon) return json({error:'존재하지 않거나 삭제된 쿠폰입니다.'},404);
      const requestedKey=String(payload.operationKey||'').trim(),operationKey=/^[A-Za-z0-9:_-]{8,120}$/.test(requestedKey)?requestedKey:`COUPON:${coupon.id}:${user.id}:${crypto.randomUUID()}`;
      const priorReceipt=await env.DB.prepare('SELECT reward_type,reward_amount FROM coupon_redemptions WHERE coupon_id=? AND user_id=? AND operation_key=?').bind(coupon.id,user.id,operationKey).first();
      if(priorReceipt){const priorType=String(priorReceipt.reward_type||'COIN').toUpperCase(),priorAmount=Number(priorReceipt.reward_amount||0),priorSpec=verifiedMessageRewardSpec(priorType),updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();return json({ok:true,replayed:true,rewardType:priorType,rewardAmount:priorAmount,rewardLabel:priorSpec?.label||'쿠폰 보상',rewardCoin:priorType==='COIN'?priorAmount:0,message:`${priorSpec?.label||'쿠폰 보상'} ${priorAmount.toLocaleString()}개를 받았습니다.`,user:await profile(env,updated)})}
      if(Number(coupon.is_active)!==1||coupon.deleted_at)return json({error:'존재하지 않거나 삭제된 쿠폰입니다.'},404);
      if(Number(coupon.used_count)>=Number(coupon.max_uses)) return json({error:'쿠폰 사용 한도가 모두 소진되었습니다.'},409);
      const used=await env.DB.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND user_id=?').bind(coupon.id,user.id).first();
      if(used) return json({error:'이미 사용한 쿠폰입니다.'},409);
      const rewardType=String(coupon.reward_type||'COIN').toUpperCase();
      const rewardAmount=Math.max(1,Math.floor(Number(coupon.reward_amount||coupon.reward_coin||0)));
      const rewardSpec=verifiedMessageRewardSpec(rewardType);
      if(!rewardSpec||!['COIN','MASTER_STAR','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX','HIGH_GRADE_REROLL_TICKET'].includes(rewardType))return json({error:'쿠폰 보상 설정이 올바르지 않습니다.'},500);
      const receiptExists=`EXISTS(SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND user_id=? AND operation_key=?)`;
      const statements=[
        env.DB.prepare(`INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin,reward_type,reward_amount,operation_key) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coupons WHERE id=? AND is_active=1 AND deleted_at IS NULL AND used_count<max_uses)`).bind(coupon.id,user.id,rewardType==='COIN'?rewardAmount:0,rewardType,rewardAmount,operationKey,coupon.id),
        env.DB.prepare(`UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_active=1 AND deleted_at IS NULL AND used_count<max_uses AND ${receiptExists}`).bind(coupon.id,coupon.id,user.id,operationKey)
      ];
      if(rewardType==='COIN'){
        statements.push(
          env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${receiptExists}`).bind(rewardAmount,user.id,coupon.id,user.id,operationKey),
          env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'COUPON' FROM users WHERE id=? AND ${receiptExists}`).bind(user.id,rewardAmount,user.id,coupon.id,user.id,operationKey)
        );
      }else{
        statements.push(
          env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${receiptExists} ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,rewardType,rewardAmount,rewardAmount,coupon.id,user.id,operationKey),
          env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'COUPON','COUPON',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND ${receiptExists}`).bind(user.id,rewardType,rewardAmount,String(coupon.id),user.id,rewardType,coupon.id,user.id,operationKey)
        );
      }
      try{await env.DB.batch(statements)}catch(error){
        const message=String(error?.message||'');
        if(/UNIQUE|constraint/i.test(message)){const same=await env.DB.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND user_id=? AND operation_key=?').bind(coupon.id,user.id,operationKey).first();if(!same)return json({error:'이미 사용한 쿠폰입니다.'},409)}
        else throw error;
      }
      const receipt=await env.DB.prepare('SELECT reward_type,reward_amount FROM coupon_redemptions WHERE coupon_id=? AND user_id=? AND operation_key=?').bind(coupon.id,user.id,operationKey).first();
      if(!receipt)return json({error:'쿠폰 사용 한도가 모두 소진되었거나 쿠폰이 중지되었습니다.'},409);
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({ok:true,rewardType,rewardAmount,rewardLabel:rewardSpec.label,rewardCoin:rewardType==='COIN'?rewardAmount:0,message:`${rewardSpec.label} ${rewardAmount.toLocaleString()}개를 받았습니다.`,user:await profile(env,updated)});
    }

    if(path==='admin/daily-quests'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const settings=await wagoDailyQuestSettings(env),today=kstDate();
        const statsRow=await env.DB.prepare(`SELECT
          (SELECT COUNT(DISTINCT user_id) FROM wago_daily_quest_progress WHERE quest_date=?) AS participants,
          (SELECT COUNT(*) FROM wago_daily_quest_progress WHERE quest_date=? AND post_count>=?) AS postCompleted,
          (SELECT COUNT(*) FROM wago_daily_quest_claims WHERE quest_date=?) AS postClaims,
          (SELECT COALESCE(SUM(reward_coin),0) FROM wago_daily_quest_claims WHERE quest_date=?) AS postCoins`).bind(today,today,Number(settings.requiredPosts||15),today,today).first();
        const users=await env.DB.prepare(`SELECT u.nickname,u.role,w.wago_nickname,w.wago_member_no,COALESCE(p.post_count,0) AS post_count,p.last_checked_at,pc.claimed_at AS post_claimed_at
          FROM users u LEFT JOIN wago_verifications w ON w.user_id=u.id
          LEFT JOIN wago_daily_quest_progress p ON p.user_id=u.id AND p.quest_date=?
          LEFT JOIN wago_daily_quest_claims pc ON pc.user_id=u.id AND pc.quest_date=?
          WHERE p.user_id IS NOT NULL OR pc.user_id IS NOT NULL
          ORDER BY COALESCE(p.last_checked_at,pc.claimed_at) DESC LIMIT 300`).bind(today,today).all();
        const claims=await env.DB.prepare(`SELECT u.nickname,'POST' AS quest_type,c.reward_coin,c.claimed_at FROM wago_daily_quest_claims c JOIN users u ON u.id=c.user_id ORDER BY c.claimed_at DESC LIMIT 200`).all();
        return json({settings:{...settings,commentEnabled:false},stats:statsRow||{},users:users.results,claims:claims.results});
      }
      if(request.method==='PATCH'){
        if(admin.role!=='OWNER')return json({error:'일일퀘스트 설정 변경은 OWNER만 가능합니다.'},403);
        const body=await readBody(request),before=await wagoDailyQuestSettings(env),v=body.settings||{};
        const next={...before,enabled:v.enabled!==false,postEnabled:v.postEnabled!==false,commentEnabled:false,boardUrl:'https://ygosu.com/board/soop',requiredPosts:Math.max(1,Math.min(200,Number(v.requiredPosts)||15)),postRewardCoin:Math.max(0,Math.floor(Number(v.postRewardCoin??v.rewardCoin)||1200)),maxPages:Math.max(1,Math.min(20,Number(v.maxPages)||10)),checkCooldownSeconds:Math.max(5,Math.min(300,Number(v.checkCooldownSeconds)||20)),adminTestAllowed:v.adminTestAllowed!==false};
        next.rewardCoin=next.postRewardCoin;
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();
        await writeAdminLog(env,admin,'DAILY_QUEST_SETTINGS','APP_META','wago_daily_quest_settings_v1',before,next);
        return json({ok:true,settings:next});
      }
    }

    if(path==='admin/dashboard'){
      const admin=await authenticate(request,env);if(!admin||!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(admin.role))return json({error:'관리자 권한이 없습니다.'},403);
      const access=await adminPermissionProfile(env,admin);
      if(access.restricted)return json({role:admin.role,admin:{id:admin.id,nickname:admin.nickname,role:admin.role,last_login_at:admin.last_login_at,restrictedPermissions:true,permissions:access.permissions},stats:{users:0,usersToday:0,draws24h:0,cards:0,totalCoin:0,banned:0,coupons:0,urOwned:0,ssrOwned:0},restricted:true});
      if(!await requirePermission(request,env,'DASHBOARD'))return json({error:'관리자 권한이 없습니다.'},403);
      const fresh=url.searchParams.get('fresh')==='1';
      const stats=await adminDashboardSnapshot(env,{fresh});
      return json({role:admin.role,admin:{id:admin.id,nickname:admin.nickname,role:admin.role,last_login_at:admin.last_login_at,restrictedPermissions:false,permissions:[]},stats,cache:{ttlMs:ADMIN_DASHBOARD_BURST_CACHE_MS,fresh}});
    }

    if(path==='admin/draw-performance'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'설정 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        await ensureDrawReceiptV2(env);
        const rows=await env.DB.batch([
          env.DB.prepare(`SELECT status,COUNT(*) count FROM draw_request_receipts_v2 GROUP BY status`),
          env.DB.prepare(`SELECT COUNT(*) count FROM draw_request_receipts_v2 WHERE updated_at<datetime('now','-3 days')`),
          env.DB.prepare(`SELECT COUNT(*) count FROM limited_acquisition_audit WHERE created_at>=datetime('now','-1 day')`)
        ]);
        return json({receiptsByStatus:rows[0]?.results||[],oldReceiptCount:Number(rows[1]?.results?.[0]?.count||0),limitedAudit24h:Number(rows[2]?.results?.[0]?.count||0),policy:{archivedDays:1,completedFailedDays:3,retryableDays:7,batch:DRAW_RECEIPT_CLEANUP_BATCH,sampleMod:DRAW_RECEIPT_CLEANUP_SAMPLE_MOD}});
      }
      if(request.method==='POST'){
        const body=await readBody(request),result=await boundedDrawReceiptCleanup(env,{limit:body.limit,force:true});
        await writeAdminLog(env,admin,'DRAW_RECEIPT_BOUNDED_CLEANUP','SYSTEM','draw_request_receipts_v2',null,result);
        return json({ok:true,...result});
      }
    }

    if(path==='admin/logs'){
      const admin=await requirePermission(request,env,'ADMIN_LOG'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      const rows=await env.DB.prepare(`SELECT l.*,u.nickname AS admin_nickname FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id ORDER BY l.id DESC LIMIT 300`).all();
      return json({logs:rows.results});
    }

    if(path==='admin/tiers'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'티어 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const lifecycle=await advancePvpSeasonLifecycle(env);
        if(lifecycle.settling&&typeof context.waitUntil==='function')context.waitUntil((async()=>{for(let i=0;i<8;i++){const next=await advancePvpSeasonLifecycle(env);if(!next.settling)break}})());
        // 관리자 화면은 저장 직후 이전 런타임 캐시가 보이면 안 된다.
        const settings=await readTierSettings(env),battle=await battleSettings(env),livePvp=await readPvpSettings(env);settings.pvp={...settings.pvp,...livePvp};
        const rows=await env.DB.prepare(`SELECT u.nickname,c.id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id AND COALESCE(uc.quantity,0)>0 LEFT JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).all();
        const map=new Map();for(const r of rows.results){if(!map.has(r.nickname))map.set(r.nickname,{nickname:r.nickname,score:0});if(r.rarity)map.get(r.nickname).score+=cardBattlePower(r,Number(r.breakthrough_level||0),battle)}
        const pvpRows=await env.DB.prepare(`SELECT u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname LIMIT 100`).all();
        const pvpStats=await env.DB.prepare(`SELECT COUNT(*) AS profiles,COALESCE(SUM(wins+losses),0)/2 AS matches,COALESCE(MAX(season_score),0) AS top_score FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).first();
        const settlement=await env.DB.prepare('SELECT id,season_key,season_name,status,participant_count,reward_user_count,message_count,started_at,completed_at,error_message FROM pvp_season_settlements WHERE season_key=? ORDER BY id DESC LIMIT 1').bind(pvpSeasonKey(livePvp)).first();
        return json({settings,ranking:[...map.values()].sort((a,b)=>b.score-a.score).slice(0,100),pvpRanking:pvpRows.results.map((x,i)=>({...x,rank:i+1,tier:resolveTier(Number(x.season_score),livePvp.tiers)})),pvpStats,pvpSettlement:settlement||null,pvpLifecycle:lifecycle});
      }
      if(request.method==='PATCH'||request.method==='POST'){
        const payload=await readBody(request),before={tiers:await readTierSettings(env),pvp:await readPvpSettings(env)},base=defaultTierSettings();
        const tiers=(Array.isArray(payload.cardScoreTiers)?payload.cardScoreTiers:before.tiers.cardScoreTiers).map((t,i)=>({id:String(t.id||base.cardScoreTiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||'티어').slice(0,20),min:Math.max(0,Math.floor(Number(t.min)||0)),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):'#7ceeff',aura:t.aura!==false})).sort((a,b)=>a.min-b.min);
        const livePvp=cleanPvpSettings({...before.pvp,...(payload.pvp||{})}),clean={cardScoreTiers:tiers,pvp:livePvp};
        if(livePvp.endsAt&&livePvp.startsAt&&new Date(livePvp.endsAt)<=new Date(livePvp.startsAt))return json({error:'시즌 종료일은 시작일보다 뒤여야 합니다.'},400);
        await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tier_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)),env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(livePvp))]);
        // 저장 성공 즉시 게임/관리자 공용 런타임 캐시를 폐기한다.
        runtimeSettingsCache.delete('tier');
        runtimeSettingsCache.delete('pvp');
        const savedTiers=await readTierSettings(env),savedPvp=await readPvpSettings(env),saved={...savedTiers,pvp:{...savedTiers.pvp,...savedPvp}};
        await writeAdminLog(env,admin,'PVP_SEASON_SETTINGS_UPDATE','SETTINGS','pvp',before,saved);return json({ok:true,settings:saved});
      }
    }


    if(path==='admin/pvp-settlement'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'PvP 정산 권한이 없습니다.'},403);
      const settings=await pvpSettings(env),seasonKey=pvpSeasonKey(settings);
      const existing=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first();
      // Only build the expensive live ranking while creating a snapshot or serving a preview.
      // Message delivery and finalization use the persisted snapshot instead.
      const needsPreview=request.method==='GET'||!existing||existing.status==='PREPARING'||existing.status==='FAILED';
      let preview=[];
      if(needsPreview){
        const [rankedRows,tierClaims,rankClaims]=await Promise.all([
          env.DB.prepare(`SELECT u.id AS user_id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname`).all(),
          env.DB.prepare('SELECT user_id FROM pvp_reward_claims WHERE season_name=?').bind(settings.seasonName).all(),
          env.DB.prepare('SELECT user_id FROM pvp_rank_reward_claims WHERE season_name=?').bind(settings.seasonName).all()
        ]);
        const tierClaimed=new Set(tierClaims.results.map(x=>Number(x.user_id))),rankClaimed=new Set(rankClaims.results.map(x=>Number(x.user_id)));
        preview=rankedRows.results.map((x,i)=>{const row={...x,final_rank:i+1},r=pvpSettlementRewardFor(row,settings,tierClaimed.has(Number(x.user_id)),rankClaimed.has(Number(x.user_id)));return {...row,tier:r.tier,rewardCoin:r.tierCoin+r.rankCoin,rewardShards:r.tierShards+r.rankShards}});
      }
      if(request.method==='GET')return json({settings,existing:existing||null,preview:preview.slice(0,100),summary:{participants:preview.length,rewardUsers:preview.filter(x=>x.rewardCoin>0||x.rewardShards>0).length,rewardCoin:preview.reduce((a,x)=>a+x.rewardCoin,0),rewardShards:preview.reduce((a,x)=>a+x.rewardShards,0)}});
      if(request.method==='POST'){
        const body=await readBody(request),confirmName=String(body.confirmSeasonName||'').trim();
        if(settings.enabled!==false)return json({error:'안전을 위해 PvP 사용 여부를 OFF로 저장한 뒤 정산하세요.'},409);
        if(!settings.seasonName||confirmName!==settings.seasonName)return json({error:'확인용 시즌명이 현재 시즌명과 일치하지 않습니다.'},400);
        if(existing?.status==='COMPLETED')return json({ok:true,done:true,settlementId:Number(existing.id),participants:Number(existing.participant_count||0),messages:Number(existing.message_count||0),resetProfiles:0,status:'COMPLETED'});
        let settlement=existing;
        if(!settlement){await env.DB.prepare("INSERT INTO pvp_season_settlements(season_key,season_name,season_title,status,initial_score,participant_count,created_by) VALUES(?,?,?,'PREPARING',?,?,?)").bind(seasonKey,settings.seasonName,settings.seasonTitle||'',Number(settings.initialScore||1000),preview.length,admin.id).run();settlement=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first()}
        const sid=Number(settlement.id);
        try{
          let status=String(settlement.status||'PREPARING');
          if(status==='FAILED'){await env.DB.prepare("UPDATE pvp_season_settlements SET status='PREPARING',error_message=NULL WHERE id=?").bind(sid).run();status='PREPARING'}
          if(status==='PREPARING'){
            const have=await env.DB.prepare('SELECT COUNT(*) count FROM pvp_season_settlement_ranks WHERE settlement_id=?').bind(sid).first();
            const offset=Number(have?.count||0),chunk=preview.slice(offset,offset+120);
            if(chunk.length){await env.DB.batch(chunk.map(row=>env.DB.prepare(`INSERT OR IGNORE INTO pvp_season_settlement_ranks(settlement_id,user_id,nickname,final_rank,season_score,highest_score,wins,losses,tier_id,tier_name,reward_coin,reward_shards) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sid,row.user_id,row.nickname,row.final_rank,row.season_score,row.highest_score,row.wins,row.losses,row.tier?.id||'',row.tier?.name||'',row.rewardCoin,row.rewardShards)))}
            const nowCount=offset+chunk.length;
            if(nowCount<preview.length)return json({ok:true,done:false,status:'PREPARING',phase:'SNAPSHOT',processed:nowCount,total:preview.length,settlementId:sid});
            await env.DB.prepare("UPDATE pvp_season_settlements SET status='SNAPSHOTTED',participant_count=?,error_message=NULL WHERE id=?").bind(preview.length,sid).run();status='SNAPSHOTTED';
          }
          if(status==='SNAPSHOTTED'){
            const rows=await env.DB.prepare(`SELECT r.* FROM pvp_season_settlement_ranks r WHERE r.settlement_id=? AND (r.reward_coin>0 OR r.reward_shards>0) AND EXISTS(SELECT 1 FROM (SELECT 'COIN' t UNION ALL SELECT 'SHARDS') q WHERE (q.t='COIN' AND r.reward_coin>0 OR q.t='SHARDS' AND r.reward_shards>0) AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type=q.t AND d.status='SENT')) ORDER BY r.final_rank LIMIT 20`).bind(sid).all();
            let made=0;
            for(const row of rows.results){for(const [rewardType,amount] of [['COIN',Number(row.reward_coin||0)],['SHARDS',Number(row.reward_shards||0)]]){if(amount<=0)continue;const sentAlready=await env.DB.prepare("SELECT id FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND user_id=? AND reward_type=? AND status='SENT'").bind(sid,row.user_id,rewardType).first();if(sentAlready)continue;await env.DB.prepare("INSERT OR IGNORE INTO pvp_season_settlement_deliveries(settlement_id,user_id,reward_type,reward_amount,status) VALUES(?,?,?,?,'RESERVED')").bind(sid,row.user_id,rewardType,amount).run();const delivery=await env.DB.prepare('SELECT * FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND user_id=? AND reward_type=?').bind(sid,row.user_id,rewardType).first();if(!delivery||delivery.status==='SENT')continue;const title=`${settings.seasonName} PvP 시즌 정산 보상`,unit=rewardType==='COIN'?'코인':'카드조각',bodyText=`${settings.seasonName} 최종 ${row.final_rank}위 (${row.tier_name}) 정산 보상입니다.\n\n${unit} ${amount.toLocaleString()}개\n\n아래 보상 수령 버튼을 눌러주세요.`;const ins=await env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'SYSTEM',?,?,'PVP_SEASON_REWARD')").bind(row.user_id,title,bodyText).run();const messageId=Number(ins.meta?.last_row_id||0);if(!messageId)throw new Error(`보상 메시지 생성 실패: ${row.nickname}`);await env.DB.batch([env.DB.prepare("UPDATE pvp_season_settlement_deliveries SET message_id=?,status='SENT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESERVED'").bind(messageId,delivery.id),env.DB.prepare('INSERT OR IGNORE INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(?,?,?,?)').bind(messageId,row.user_id,rewardType,amount)]);made++}}
            const pending=await env.DB.prepare(`SELECT COUNT(*) count FROM pvp_season_settlement_ranks r WHERE r.settlement_id=? AND ((r.reward_coin>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='COIN' AND d.status='SENT')) OR (r.reward_shards>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='SHARDS' AND d.status='SENT')))` ).bind(sid).first();
            const sent=await env.DB.prepare("SELECT COUNT(*) count FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND status='SENT'").bind(sid).first();
            if(Number(pending?.count||0)>0)return json({ok:true,done:false,status:'SNAPSHOTTED',phase:'MESSAGES',processed:Number(sent?.count||0),remaining:Number(pending.count),settlementId:sid});
            const rewardUsers=await env.DB.prepare('SELECT COUNT(DISTINCT user_id) count FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND status=\'SENT\'').bind(sid).first();
            await env.DB.prepare("UPDATE pvp_season_settlements SET status='MESSAGES_READY',reward_user_count=?,message_count=?,error_message=NULL WHERE id=?").bind(Number(rewardUsers?.count||0),Number(sent?.count||0),sid).run();status='MESSAGES_READY';
          }
          if(status==='MESSAGES_READY'){
            const initialScore=Number(settings.initialScore||1000);const reset=await env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=?,wins=0,losses=0,updated_at=CURRENT_TIMESTAMP').bind(initialScore,initialScore).run();await env.DB.prepare("UPDATE pvp_season_settlements SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=?").bind(sid).run();const doneRow=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE id=?').bind(sid).first(),participants=Number(doneRow?.participant_count||0);await writeAdminLog(env,admin,'PVP_SEASON_SETTLEMENT','PVP_SEASON',settings.seasonName,null,{settlementId:sid,participants,messages:Number(doneRow?.message_count||0),resetProfiles:Number(reset.meta?.changes||0)});return json({ok:true,done:true,status:'COMPLETED',settlementId:sid,participants,messages:Number(doneRow?.message_count||0),resetProfiles:Number(reset.meta?.changes||0)});
          }
          return json({ok:true,done:false,status,settlementId:sid});
        }catch(error){await env.DB.prepare("UPDATE pvp_season_settlements SET status=CASE WHEN status='MESSAGES_READY' THEN status ELSE 'FAILED' END,error_message=? WHERE id=?").bind(String(error?.message||error).slice(0,500),sid).run();return json({error:`정산이 중단되었습니다: ${String(error?.message||error)}`},500)}
      }
    }

    if(path==='admin/breakthrough-cinematic'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET') return json({cinematic:await breakthroughCinematicConfig(env)});
      if(request.method==='PATCH'||request.method==='POST'){
        const payload=await readBody(request);
        if(!payload?.cinematic||typeof payload.cinematic!=='object')return json({error:'강화 성공 영상 연출 설정값이 없습니다.'},400);
        const before=await breakthroughCinematicConfig(env),cinematic=cleanBreakthroughCinematic(payload.cinematic);
        if(cinematic.enabled&&!String(cinematic.mediaUrl||'').trim())return json({error:'연출을 사용할 때는 GIF / WebM / MP4 경로가 필요합니다.'},400);
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_cinematic_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(cinematic)).run();
        const saved=await breakthroughCinematicConfig(env);
        if(JSON.stringify(saved)!==JSON.stringify(cinematic))return json({error:'강화 성공 영상 연출 저장 검증에 실패했습니다.'},500);
        try{await writeAdminLog(env,admin,'BREAKTHROUGH_CINEMATIC_UPDATE','SETTINGS','breakthrough_cinematic',before,saved)}catch(logError){console.error('breakthrough cinematic admin log failed',logError)}
        return json({ok:true,cinematic:saved});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }

    if(path==='admin/breakthrough-settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET') return json({config:await breakthroughConfig(env),grades:BREAKTHROUGH_GRADES,pity:await breakthroughPity(env),maHigh:await maMasterStarBreakthroughConfig(env),limitedHigh:await limitedMasterStarBreakthroughConfig(env),cinematic:await breakthroughCinematicConfig(env)});
      if(request.method==='PATCH'){
        const payload=await readBody(request),incoming=payload.config;
        if(!incoming||typeof incoming!=='object')return json({error:'돌파 설정값이 없습니다.'},400);
        const clean=defaultBreakthroughConfig();
        for(const grade of BREAKTHROUGH_GRADES){
          const maxLevel=breakthroughMaxLevel(grade);
          if(!Array.isArray(incoming[grade])||incoming[grade].length!==maxLevel)return json({error:`${grade} 등급은 ${maxLevel}단계 설정이 필요합니다.`},400);
          for(let i=0;i<maxLevel;i++){
            const cost=Number(incoming[grade][i]?.cost),rate=Number(incoming[grade][i]?.rate);
            if(!Number.isInteger(cost)||cost<1||cost>10000000)return json({error:`${grade} ★${i}→★${i+1} 조각 비용을 확인하세요.`},400);
            if(!Number.isFinite(rate)||rate<0||rate>100)return json({error:`${grade} ★${i}→★${i+1} 성공 확률은 0~100%입니다.`},400);
            clean[grade][i]={cost,rate:Math.round(rate*10000)/10000};
          }
        }
        const before={config:await breakthroughConfig(env),maHigh:await maMasterStarBreakthroughConfig(env),limitedHigh:await limitedMasterStarBreakthroughConfig(env),cinematic:await breakthroughCinematicConfig(env)};
        const pity=cleanBreakthroughPity(payload.pity||await breakthroughPity(env)),maHigh=cleanMaMasterStarBreakthrough(payload.maHigh||await maMasterStarBreakthroughConfig(env)),limitedHigh=cleanLimitedMasterStarBreakthrough(payload.limitedHigh||await limitedMasterStarBreakthroughConfig(env)),cinematic=cleanBreakthroughCinematic(payload.cinematic||await breakthroughCinematicConfig(env));
        if(maHigh.enabled&&maHigh.steps.some(step=>Number(step.retirementShardRefund)<=0))return json({error:'MA +11~+13 운영을 켜려면 각 단계의 퇴사 환급 카드 조각을 1개 이상 설정하세요.'},400);
        await env.DB.batch([
          env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_config',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)),
          env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_pity_ssr_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(pity)),
          env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('ma_master_star_breakthrough_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(maHigh)),
          env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('limited_master_star_breakthrough_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(limitedHigh)),
          env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_cinematic_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(cinematic))
        ]);
        maMasterStarBreakthroughCache=null;limitedMasterStarBreakthroughCache=null;
        runtimeSettingsCache.delete('breakthroughConfig'); // V1792: 돌파 설정도 캐시하므로 저장 즉시 무효화
        try{await writeAdminLog(env,admin,'BREAKTHROUGH_SETTINGS_UPDATE','SETTINGS','breakthrough',before,{config:clean,pity,maHigh,limitedHigh,cinematic})}catch(logError){console.error('breakthrough settings admin log failed',logError)}
        return json({ok:true,config:clean,grades:BREAKTHROUGH_GRADES,pity,maHigh,limitedHigh,cinematic});
      }
    }



    if(path==='admin/raid'){
      const admin=await requirePermission(request,env,'DASHBOARD');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);if(admin.role!=='OWNER')return json({error:'레이드 관리는 OWNER 전용입니다.'},403);await ensureRaidOverhaulV1293(env);
      const payload=request.method==='GET'?{}:await readBody(request);
      if(request.method==='GET'){
        const [bosses,current,policies]=await Promise.all([env.DB.prepare('SELECT id,name,image_url AS image,max_hp AS maxHp,defense_rate AS defenseRate,is_active AS isActive,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt FROM raid_bosses ORDER BY sort_order,id').all(),env.DB.prepare("SELECT ri.id,ri.status,ri.starts_at AS startsAt,ri.ends_at AS endsAt,ri.current_hp AS currentHp,ri.participant_count AS participantCount,rb.name AS bossName,rb.max_hp AS maxHp,COALESCE(x.slot_id,'LEGACY') AS slotId FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id LEFT JOIN raid_instance_v1293 x ON x.instance_id=ri.id WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 1").first(),raidBossOpenPolicies(env)]);
        return json({settings:await raidSettings(env),bosses:bosses.results.map(b=>({...b,userOpenEnabled:Boolean(policies[String(b.id)]?.enabled),openCost:Number(policies[String(b.id)]?.cost||0)})),current:current||null});
      }
      if(request.method==='PATCH'&&payload.settings){if(String(payload.settings.scheduleMode||'').toUpperCase()==='SCHEDULED'&&(!Array.isArray(payload.settings.openDays)||!payload.settings.openDays.length))return json({error:'레이드 개방 요일을 하나 이상 선택하세요.'},400);const before=await raidSettings(env),clean=cleanRaidSettings(payload.settings),activeSlots=(clean.timeSlots||[]).filter(x=>x.enabled);if(clean.minParticipants>clean.maxParticipants)return json({error:'최소 시작 인원은 최대 참가 인원보다 클 수 없습니다.'},400);if(activeSlots.some(x=>x.openTime===x.closeTime))return json({error:'사용 중인 레이드 타임의 개방·종료 시간을 서로 다르게 설정하세요.'},400);for(let i=0;i<activeSlots.length;i++)for(let j=i+1;j<activeSlots.length;j++)if(raidSlotsOverlap(activeSlots[i],activeSlots[j]))return json({error:`${activeSlots[i].label}와 ${activeSlots[j].label} 개방 시간이 겹칩니다.`},400);const rankBands=[...(clean.rewards?.rankRewards||[])].sort((a,b)=>a.from-b.from||a.to-b.to);for(let i=1;i<rankBands.length;i++)if(rankBands[i].from<=rankBands[i-1].to)return json({error:'최종 순위 보상 구간이 서로 겹칩니다.'},400);const milestoneValues=(clean.rewards?.damageMilestones||[]).map(x=>Number(x.damage));if(new Set(milestoneValues).size!==milestoneValues.length)return json({error:'누적 피해 보상 기준값이 중복되었습니다.'},400);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();runtimeSettingsCache.delete('raid');const saved=await readRaidSettings(env);if(JSON.stringify(saved)!==JSON.stringify(clean))return json({error:'레이드 설정 저장 후 검증값이 일치하지 않습니다. 다시 저장하지 말고 운영 로그를 확인해주세요.'},500);await writeAdminLog(env,admin,'RAID_SETTINGS_UPDATE','SETTINGS','raid',before,saved);return json({ok:true,settings:saved});}
      if(request.method==='POST'&&payload.action==='CREATE_BOSS'){const name=String(payload.name||'').trim().slice(0,40),image=String(payload.image||'').trim().slice(0,500),maxHp=Math.max(1,Math.floor(Number(payload.maxHp)||1)),defenseRate=Math.max(0,Math.min(99,Number(payload.defenseRate)||0)),sortOrder=Math.floor(Number(payload.sortOrder)||0);if(!name)return json({error:'레이드 보스 이름을 입력하세요.'},400);const r=await env.DB.prepare('INSERT INTO raid_bosses(name,image_url,max_hp,defense_rate,is_active,sort_order) VALUES(?,?,?,?,?,?)').bind(name,image,maxHp,defenseRate,payload.isActive===false?0:1,sortOrder).run();const policies=await raidBossOpenPolicies(env);policies[String(r.meta.last_row_id)]={enabled:payload.userOpenEnabled===true,cost:Math.max(0,Math.floor(Number(payload.openCost)||0))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_user_open_bosses_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(policies)).run();await writeAdminLog(env,admin,'RAID_BOSS_CREATE','RAID_BOSS',String(r.meta.last_row_id),null,{name,maxHp});return json({ok:true,id:r.meta.last_row_id},201);}
      if(request.method==='PATCH'&&payload.boss){const b=payload.boss,id=Number(b.id);if(!id)return json({error:'보스 ID가 필요합니다.'},400);await env.DB.prepare('UPDATE raid_bosses SET name=?,image_url=?,max_hp=?,defense_rate=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(b.name||'').trim().slice(0,40),String(b.image||'').trim().slice(0,500),Math.max(1,Math.floor(Number(b.maxHp)||1)),Math.max(0,Math.min(99,Number(b.defenseRate)||0)),b.isActive===false?0:1,Math.floor(Number(b.sortOrder)||0),id).run();const policies=await raidBossOpenPolicies(env);policies[String(id)]={enabled:b.userOpenEnabled===true,cost:Math.max(0,Math.min(100000000,Math.floor(Number(b.openCost)||0)))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_user_open_bosses_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(policies)).run();await writeAdminLog(env,admin,'RAID_BOSS_UPDATE','RAID_BOSS',String(id),null,b);return json({ok:true,boss:{...b,...policies[String(id)]}});}
      if(request.method==='POST'&&payload.action==='START'){const bossId=Number(payload.bossId),boss=await env.DB.prepare('SELECT * FROM raid_bosses WHERE id=? AND is_active=1').bind(bossId).first();if(!boss)return json({error:'활성 레이드 보스를 선택하세요.'},400);const active=await env.DB.prepare("SELECT COUNT(*) count FROM raid_instances WHERE status IN ('LOBBY','BATTLE')").first();if(Number(active?.count||0)>=10)return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409);const cfg=await raidSettings(env),schedule=raidScheduleState(cfg,admin);if(!schedule.isOpen)return json({error:'현재는 CMS에서 설정한 레이드 개방 시간이 아닙니다.',schedule},403);const startsAt=new Date(Date.now()+cfg.lobbySeconds*1000).toISOString(),endsAt=new Date(Date.now()+(cfg.lobbySeconds+cfg.battleSeconds)*1000).toISOString(),r=await env.DB.prepare("INSERT INTO raid_instances(boss_id,status,starts_at,ends_at,current_hp,participant_count) VALUES(?,'LOBBY',?,?,?,0)").bind(bossId,startsAt,endsAt,boss.max_hp).run();await snapshotRaidInstanceV1293(env,Number(r.meta.last_row_id),String(schedule.currentSlot?.id||'ADMIN'),cfg);await raidRewardSnapshot(env,Number(r.meta.last_row_id),cfg,true);await writeAdminLog(env,admin,'RAID_START','RAID_INSTANCE',String(r.meta.last_row_id),null,{bossId});return json({ok:true,id:r.meta.last_row_id});}
      if(request.method==='POST'&&payload.action==='END'){const id=Number(payload.instanceId);if(!id)return json({error:'진행 중 레이드가 없습니다.'},400);const cfg=await raidSettings(env);await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await ensureRaidFinalizedV1293(env,id,cfg);await writeAdminLog(env,admin,'RAID_FORCE_END','RAID_INSTANCE',String(id),null,null);return json({ok:true});}
    }

    if(path==='admin/battle/single-healer'){
      const admin=await requirePermission(request,env,'CARD_EDIT');if(!admin)return json({error:'전투 관리 권한이 없습니다.'},403);
      const before=await battleSettings(env);
      if(request.method==='GET')return json({singleHealerBonus:before.engine?.singleHealerBonus});
      if(request.method==='PATCH'){
        const payload=await readBody(request),clean=cleanBattleSettingsPayload({...before,engine:{...before.engine,singleHealerBonus:payload.singleHealerBonus||{}}},defaultBattleSettings());
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();
        runtimeSettingsCache.delete('battle');const saved=await readBattleSettings(env);runtimeSettingsCache.set('battle',{promise:Promise.resolve(saved),expiresAt:Date.now()+1000});
        await writeAdminLog(env,admin,'SINGLE_HEALER_BALANCE_UPDATE','SETTINGS','battle_single_healer',before.engine?.singleHealerBonus,saved.engine?.singleHealerBonus);
        return json({ok:true,singleHealerBonus:saved.engine?.singleHealerBonus});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }
    if(path==='admin/battle'){
      const admin=await requirePermission(request,env,'CARD_EDIT'); if(!admin)return json({error:'전투 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const monsters=await env.DB.prepare(`SELECT id,name,replace(image_url,char(92),'/') AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss,is_active AS isActive,sort_order AS sortOrder,ultimate_enabled AS ultimateEnabled,ultimate_name AS ultimateName,ultimate_description AS ultimateDescription,ultimate_trigger AS ultimateTrigger,ultimate_chance AS ultimateChance,ultimate_damage_percent AS ultimateDamagePercent,ultimate_max_uses AS ultimateMaxUses,ultimate_target AS ultimateTarget,ultimate_theme AS ultimateTheme,ultimate_warning_text AS ultimateWarningText,ultimate_shake AS ultimateShake,ultimate_zoom AS ultimateZoom,ultimate_media_url AS ultimateMediaUrl,ultimate_sound_url AS ultimateSoundUrl,ultimate_duration_ms AS ultimateDurationMs,ultimate_volume_percent AS ultimateVolumePercent,ultimate_force_cast AS ultimateForceCast,ultimate_pve_damage_percent AS ultimatePveDamagePercent,ultimate_tower_damage_percent AS ultimateTowerDamagePercent,COALESCE(monster_category,CASE WHEN is_boss=1 THEN 'BOSS' ELSE 'GENERAL' END) AS category,COALESCE(pve_tab,CASE WHEN is_boss=1 THEN 'BOSS' ELSE 'GENERAL' END) AS pveTab,COALESCE(pve_display_order,sort_order,0) AS displayOrder,COALESCE(pve_enabled,1) AS pveEnabled,COALESCE(tower_enabled,0) AS towerEnabled,COALESCE(tower_only,0) AS towerOnly FROM battle_monsters WHERE is_active=1 ORDER BY COALESCE(pve_display_order,sort_order,0),sort_order,id`).all();
        return json({settings:await battleSettings(env),monsters:monsters.results});
      }
      const payload=await readBody(request);
      if(Object.prototype.hasOwnProperty.call(payload,'image'))payload.image=String(payload.image||'').trim().replace(/\\/g,'/');
      if(request.method==='PATCH'&&payload.settings&&!payload.settings.engine?.singleHealerBonus){
        const currentBattle=await battleSettings(env);
        payload.settings.engine={...(payload.settings.engine||{}),singleHealerBonus:currentBattle.engine?.singleHealerBonus};
      }
      if(request.method==='PATCH'&&payload.settings){
        const currentBattle=await battleSettings(env);
        if(!payload.settings.nightmare)payload.settings.nightmare=currentBattle.nightmare;
        else if(!Object.prototype.hasOwnProperty.call(payload.settings.nightmare,'bossProfiles'))payload.settings.nightmare={...payload.settings.nightmare,bossProfiles:currentBattle.nightmare?.bossProfiles||{}};
      }
      if(request.method==='PATCH'&&payload.nightmare){
        const before=await battleSettings(env),nightmarePayload=Object.prototype.hasOwnProperty.call(payload.nightmare,'bossProfiles')?payload.nightmare:{...payload.nightmare,bossProfiles:before.nightmare?.bossProfiles||{}},nightmare=normalizeNightmareSettings(nightmarePayload);
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_nightmare_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(nightmare)).run();
        runtimeSettingsCache.delete('battle');
        const saved=await readBattleSettings(env);runtimeSettingsCache.set('battle',{promise:Promise.resolve(saved),expiresAt:Date.now()+1000});
        if(JSON.stringify(saved.nightmare)!==JSON.stringify(nightmare))return json({error:'나이트메어 설정 저장 검증에 실패했습니다.',code:'NIGHTMARE_SETTINGS_VERIFY_FAILED'},500);
        await writeAdminLog(env,admin,'NIGHTMARE_SETTINGS_UPDATE','SETTINGS','battle_nightmare',before.nightmare,saved.nightmare);
        return json({ok:true,settings:saved,nightmare:saved.nightmare});
      }
      if(request.method==='PATCH'&&Array.isArray(payload.ultimateRules)){
        const before=await battleSettings(env);
        const ultimateRules=payload.ultimateRules.slice(0,50).map((u,i)=>({enabled:u?.enabled!==false,name:String(u?.name||`ULTIMATE ${i+1}`).slice(0,40),requiredGrade:normalizeUltimateRequiredGrade(u?.requiredGrade),minBreakthrough:Math.max(0,Math.min(20,Math.floor(Number(u?.minBreakthrough||0)))),requiredCount:Math.max(1,Math.min(5,Math.floor(Number(u?.requiredCount||1)))),activationChance:Math.max(0,Math.min(100,Number(u?.activationChance??100))),mediaUrl:String(u?.mediaUrl||'/assets/effects/SKILL.gif').replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(u?.durationMs||3000)))),coefficientPercent:Math.max(0,Math.min(100000,Number(u?.coefficientPercent??u?.damageValue??500)))}));
        const clean={...before,ultimateRules};
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();
        runtimeSettingsCache.delete('battle');
        const saved=await readBattleSettings(env);
        runtimeSettingsCache.set('battle',{promise:Promise.resolve(saved),expiresAt:Date.now()+1000});
        await writeAdminLog(env,admin,'ULTIMATE_SETTINGS_UPDATE','SETTINGS','battle_ultimate',before.ultimateRules,saved.ultimateRules);
        return json({ok:true,settings:saved,ultimateRules:saved.ultimateRules});
      }
      if(request.method==='PATCH'&&payload.settings){const before=await battleSettings(env),base=defaultBattleSettings(),x=payload.settings,clean=cleanBattleSettingsPayload(x,base);const gradeRateTotal=Object.values(clean.cardDrop.gradeRates).reduce((a,b)=>a+Number(b||0),0);if(Math.abs(gradeRateTotal-100)>0.001)return json({error:`카드 드롭 등급 확률 합계가 100%여야 합니다. 현재 ${gradeRateTotal.toFixed(2)}%입니다.`},400);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();runtimeSettingsCache.delete('battle');const saved=await readBattleSettings(env);runtimeSettingsCache.set('battle',{promise:Promise.resolve(saved),expiresAt:Date.now()+1000});if(JSON.stringify(saved)!==JSON.stringify(clean))return json({error:'전투 설정 저장 후 재조회 값이 일치하지 않습니다.',code:'BATTLE_SETTINGS_VERIFY_FAILED'},500);await writeAdminLog(env,admin,'BATTLE_SETTINGS_UPDATE','SETTINGS','battle',before,saved);return json({ok:true,settings:saved});}
      if(request.method==='POST'){const name=String(payload.name||'').trim().slice(0,40),image=String(payload.image||'').trim().slice(0,500),power=Math.max(1,Math.floor(Number(payload.battlePower)||1)),reward=Math.max(0,Math.floor(Number(payload.rewardCoin)||0));if(!name)return json({error:'몬스터 이름을 입력하세요.'},400);const r=await env.DB.prepare('INSERT INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,ultimate_enabled,ultimate_name,ultimate_description,ultimate_trigger,ultimate_chance,ultimate_damage_percent,ultimate_max_uses,ultimate_target,ultimate_theme,ultimate_warning_text,ultimate_shake,ultimate_zoom,ultimate_media_url,ultimate_sound_url,ultimate_duration_ms,ultimate_volume_percent,ultimate_force_cast,ultimate_pve_damage_percent,ultimate_tower_damage_percent,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(name,image,power,reward,payload.isBoss?1:0,1,Math.floor(Number(payload.sortOrder)||0),payload.ultimateEnabled?1:0,String(payload.ultimateName||'').slice(0,60),String(payload.ultimateDescription||'').slice(0,300),String(payload.ultimateTrigger||'ON_LOSS'),Math.max(0,Math.min(100,Number(payload.ultimateChance??100))),Math.max(0,Math.min(100,Number(payload.ultimateDamagePercent??15))),Math.max(1,Math.min(9,Number(payload.ultimateMaxUses||1))),String(payload.ultimateTarget||'ALL'),String(payload.ultimateTheme||'CRIMSON'),String(payload.ultimateWarningText||'BOSS ULTIMATE').slice(0,60),payload.ultimateShake===false?0:1,payload.ultimateZoom===false?0:1,String(payload.ultimateMediaUrl||'').trim().slice(0,500),String(payload.ultimateSoundUrl||'').trim().slice(0,500),Math.max(600,Math.min(25000,Math.floor(Number(payload.ultimateDurationMs)||2400))),Math.max(0,Math.min(100,Number(payload.ultimateVolumePercent??35))),payload.ultimateForceCast?1:0,Math.max(0,Math.min(100,Number(payload.ultimatePveDamagePercent??payload.ultimateDamagePercent??15))),Math.max(0,Math.min(100,Number(payload.ultimateTowerDamagePercent??payload.ultimateDamagePercent??15))),String(payload.category|| (payload.isBoss?'BOSS':'GENERAL')).toUpperCase(),String(payload.pveTab||(payload.isBoss?'HELL':'NORMAL')).toUpperCase(),Math.floor(Number(payload.displayOrder??payload.sortOrder)||0),payload.pveEnabled===false?0:1,payload.towerEnabled?1:0,payload.towerOnly?1:0).run();return json({ok:true,id:r.meta.last_row_id},201);}
      if(request.method==='PATCH'){const id=Number(payload.id);if(!id)return json({error:'몬스터 ID가 필요합니다.'},400);if(payload.isActive===false)return json({ok:true,deleted:await deleteBattleMonster(env,id)});await env.DB.prepare('UPDATE battle_monsters SET name=?,image_url=?,battle_power=?,reward_coin=?,is_boss=?,is_active=1,sort_order=?,ultimate_enabled=?,ultimate_name=?,ultimate_description=?,ultimate_trigger=?,ultimate_chance=?,ultimate_damage_percent=?,ultimate_max_uses=?,ultimate_target=?,ultimate_theme=?,ultimate_warning_text=?,ultimate_shake=?,ultimate_zoom=?,ultimate_media_url=?,ultimate_sound_url=?,ultimate_duration_ms=?,ultimate_volume_percent=?,ultimate_force_cast=?,ultimate_pve_damage_percent=?,ultimate_tower_damage_percent=?,monster_category=?,pve_tab=?,pve_display_order=?,pve_enabled=?,tower_enabled=?,tower_only=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(payload.name||'').trim().slice(0,40),String(payload.image||'').trim().slice(0,500),Math.max(1,Math.floor(Number(payload.battlePower)||1)),Math.max(0,Math.floor(Number(payload.rewardCoin)||0)),payload.isBoss?1:0,Math.floor(Number(payload.sortOrder)||0),payload.ultimateEnabled?1:0,String(payload.ultimateName||'').slice(0,60),String(payload.ultimateDescription||'').slice(0,300),String(payload.ultimateTrigger||'ON_LOSS'),Math.max(0,Math.min(100,Number(payload.ultimateChance??100))),Math.max(0,Math.min(100,Number(payload.ultimateDamagePercent??15))),Math.max(1,Math.min(9,Number(payload.ultimateMaxUses||1))),String(payload.ultimateTarget||'ALL'),String(payload.ultimateTheme||'CRIMSON'),String(payload.ultimateWarningText||'BOSS ULTIMATE').slice(0,60),payload.ultimateShake===false?0:1,payload.ultimateZoom===false?0:1,String(payload.ultimateMediaUrl||'').trim().slice(0,500),String(payload.ultimateSoundUrl||'').trim().slice(0,500),Math.max(600,Math.min(25000,Math.floor(Number(payload.ultimateDurationMs)||2400))),Math.max(0,Math.min(100,Number(payload.ultimateVolumePercent??35))),payload.ultimateForceCast?1:0,Math.max(0,Math.min(100,Number(payload.ultimatePveDamagePercent??payload.ultimateDamagePercent??15))),Math.max(0,Math.min(100,Number(payload.ultimateTowerDamagePercent??payload.ultimateDamagePercent??15))),String(payload.category||(payload.isBoss?'BOSS':'GENERAL')).toUpperCase(),String(payload.pveTab||(payload.isBoss?'HELL':'NORMAL')).toUpperCase(),Math.floor(Number(payload.displayOrder??payload.sortOrder)||0),payload.pveEnabled===false?0:1,payload.towerEnabled?1:0,payload.towerOnly?1:0,id).run();return json({ok:true});}
      if(request.method==='DELETE'){const id=Number(payload.id);if(!id)return json({error:'몬스터 ID가 필요합니다.'},400);return json({ok:true,deleted:await deleteBattleMonster(env,id)});}
    }

    if(path==='admin/mineral-exchange'){
      const admin=await requirePermission(request,env,'DASHBOARD');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const settings=await mineralExchangeSettings(env),rows=await env.DB.prepare(`SELECT r.*,u.nickname AS current_game_nickname,a.nickname AS reviewer_name FROM mineral_exchange_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users a ON a.id=r.reviewed_by ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.id DESC LIMIT 300`).all();
        return json({settings,requests:rows.results});
      }
      if(request.method==='PATCH'){
        const body=await readBody(request);
        if(body.settings){const settings=cleanMineralExchangeSettings(body.settings);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('mineral_exchange_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(settings)).run();await writeAdminLog(env,admin,'MINERAL_EXCHANGE_SETTINGS','SETTINGS','mineral_exchange',null,settings);return json({ok:true,settings})}
        const id=Math.floor(Number(body.id||0)),action=String(body.action||'').toUpperCase();if(!id||!['APPROVE','REJECT'].includes(action))return json({error:'처리 정보가 올바르지 않습니다.'},400);
        const req=await env.DB.prepare('SELECT * FROM mineral_exchange_requests WHERE id=?').bind(id).first();if(!req)return json({error:'신청 내역을 찾을 수 없습니다.'},404);if(req.status!=='PENDING')return json({error:'이미 처리된 신청입니다.'},409);
        if(action==='REJECT'){const reason=String(body.reason||'관리자 거절').trim().slice(0,200);await env.DB.prepare("UPDATE mineral_exchange_requests SET status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,reject_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(admin.id,reason,id).run();await writeAdminLog(env,admin,'MINERAL_EXCHANGE_REJECT','MINERAL_EXCHANGE',id,req,{...req,status:'REJECTED',reason});return json({ok:true})}
        const todayLimit=await mineralExchangeSettings(env),approved=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status='APPROVED'").bind(req.user_id,req.requested_kst_date).first();
        if(Number(approved?.total||0)+Number(req.coin_amount)>Number(todayLimit.dailyLimitCoin))return json({error:'해당 날짜의 하루 최대 교환 한도를 초과하여 승인할 수 없습니다.'},409);
        const target=await env.DB.prepare('SELECT coin,nickname FROM users WHERE id=?').bind(req.user_id).first();if(!target)return json({error:'신청 유저를 찾을 수 없습니다.'},404);const nextCoin=Number(target.coin||0)+Number(req.coin_amount);
        await env.DB.batch([env.DB.prepare("UPDATE mineral_exchange_requests SET status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(admin.id,id),env.DB.prepare('UPDATE users SET coin=? WHERE id=?').bind(nextCoin,req.user_id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'MINERAL_EXCHANGE')").bind(req.user_id,req.coin_amount,nextCoin)]);
        await writeAdminLog(env,admin,'MINERAL_EXCHANGE_APPROVE','MINERAL_EXCHANGE',id,req,{...req,status:'APPROVED',coinGranted:req.coin_amount});return json({ok:true,coinAmount:req.coin_amount});
      }
    }

    if(path==='admin/rift-settings'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'균열 원정 설정 권한이 없습니다.'},403);if(String(admin.role||'').toUpperCase()!=='OWNER')return json({error:'균열 원정 보상 설정은 OWNER 전용입니다.'},403);
      if(request.method==='GET'){
        const settings=await riftSettings(env),weekKey=premiumCubeWeekKey(),weekly=await env.DB.prepare('SELECT COALESCE(SUM(started_count),0) started_count,COALESCE(SUM(completed_count),0) completed_count,COALESCE(SUM(reward_count),0) reward_count,COALESCE(MAX(highest_difficulty),0) highest_difficulty,COUNT(*) participants FROM pve_rift_weekly WHERE week_key=?').bind(weekKey).first(),runs=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END),0) active_count,COALESCE(SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END),0) failed_count,COALESCE(SUM(CASE WHEN status='CLAIMED' THEN 1 ELSE 0 END),0) claimed_count FROM pve_rift_runs WHERE week_key=?").bind(weekKey).first();return json({settings,weekKey,stats:{participants:Number(weekly?.participants||0),startedCount:Number(weekly?.started_count||0),completedCount:Number(weekly?.completed_count||0),rewardCount:Number(weekly?.reward_count||0),highestDifficulty:Number(weekly?.highest_difficulty||0),activeCount:Number(runs?.active_count||0),failedCount:Number(runs?.failed_count||0),claimedCount:Number(runs?.claimed_count||0)}});
      }
      if(request.method==='PATCH'||request.method==='POST'){
        const body=await readBody(request),before=await riftSettings(env),settings=cleanRiftSettings(body.settings||body);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('pve_rift_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(settings)).run();await writeAdminLog(env,admin,'RIFT_SETTINGS_UPDATE','SETTINGS','pve_rift_settings_v1',before,settings);return json({ok:true,settings});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }

    if(path==='admin/settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const rows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','hall_of_fame_enabled','hall_of_fame_title','hall_of_fame_name','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users','new_user_coin','critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects')").all();
        return json({settings:Object.fromEntries(rows.results.map(x=>[x.key,x.value])),attendance:await attendanceSettings(env),cubes:await cubeSettings(env),cubeDrops:await cubeDropSettings(env),cubeBoost:await cubeBoostSettings(env),weeklyPremiumCube:await weeklyPremiumCubeSettings(env),role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        const maintenanceKeys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users'];
        const criticalKeys=['critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects'];
        const ownerKeys=['site_notice','new_user_coin','hall_of_fame_enabled','hall_of_fame_title','hall_of_fame_name'];
        if(payload.weeklyPremiumCube){const beforeWeekly=await weeklyPremiumCubeSettings(env),candidate=cleanWeeklyPremiumCubeSettings(payload.weeklyPremiumCube);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('weekly_premium_cube_settings_v1129',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(candidate)).run();weeklyPremiumCubeSettingsCache=null;await writeAdminLog(env,admin,'WEEKLY_PREMIUM_CUBE_SETTINGS_UPDATE','SETTINGS','weekly_premium_cube_settings_v1129',beforeWeekly,candidate);}
        if(payload.cubeDrops){const beforeDrops=await cubeDropSettings(env),candidate=cleanCubeDropSettings(payload.cubeDrops),pveTotal=cubeDropTotal(candidate,'PVE'),pvpTotal=cubeDropTotal(candidate,'PVP');if(pveTotal>100.0001)return json({error:`PVE 활성 큐브 확률 합계가 100%를 초과합니다. 현재 ${pveTotal.toFixed(2)}%입니다.`},400);if(pvpTotal>100.0001)return json({error:`PVP 활성 큐브 확률 합계가 100%를 초과합니다. 현재 ${pvpTotal.toFixed(2)}%입니다.`},400);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('cube_drop_settings_v1072',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(candidate)).run();await writeAdminLog(env,admin,'CUBE_DROP_SETTINGS_UPDATE','SETTINGS','cube_drop_settings_v1072',beforeDrops,candidate);}
        if(payload.cubeBoost){const beforeBoost=await cubeBoostSettings(env),candidate=cleanCubeBoostSettings(payload.cubeBoost);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('cube_drop_boost_settings_v1072',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(candidate)).run();await writeAdminLog(env,admin,'CUBE_DROP_BOOST_SETTINGS_UPDATE','SETTINGS','cube_drop_boost_settings_v1072',beforeBoost,candidate);}
        if(payload.cubes){const beforeCubes=await cubeSettings(env),candidate={};for(const code of CUBE_CODES){candidate[code]={};for(const grade of Object.keys(defaultCubeSettings()[code]))candidate[code][grade]=Math.max(0,Math.min(100,Number(payload.cubes?.[code]?.[grade])||0));const total=Object.values(candidate[code]).reduce((a,b)=>a+b,0);if(Math.abs(total-100)>.001)return json({error:`${code} 등급 확률 합계가 100%여야 합니다. 현재 ${total.toFixed(2)}%입니다.`},400);}await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('inventory_cube_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(candidate)).run();await writeAdminLog(env,admin,'CUBE_SETTINGS_UPDATE','SETTINGS','inventory_cubes',beforeCubes,candidate);}
        if(payload.attendance){const beforeAttendance=await attendanceSettings(env),cleanAttendance=cleanAttendanceSettings(payload.attendance);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(cleanAttendance)).run();await writeAdminLog(env,admin,'ATTENDANCE_SETTINGS_UPDATE','SETTINGS','attendance',beforeAttendance,cleanAttendance);}
        if(admin.role!=='OWNER'&&ownerKeys.some(key=>key in payload)) return json({error:'OWNER 전용 서비스 설정입니다.'},403);
        const beforeRows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','hall_of_fame_enabled','hall_of_fame_title','hall_of_fame_name','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users','new_user_coin','critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects')").all();
        const before=Object.fromEntries(beforeRows.results.map(x=>[x.key,x.value]));
        for(const key of [...maintenanceKeys,...criticalKeys,...ownerKeys]) if(key in payload) await env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,String(payload[key]??'')).run();
        if(criticalKeys.some(key=>key in payload))criticalSettingsCache=null;
        if(maintenanceKeys.some(key=>key in payload))maintenanceSettingsCache=null;
        const action=String(payload.maintenance_mode)==='1'&&before.maintenance_mode!=='1'?'MAINTENANCE_START':String(payload.maintenance_mode)==='0'&&before.maintenance_mode==='1'?'MAINTENANCE_END':'SETTINGS_UPDATE';
        await writeAdminLog(env,admin,action,'SETTINGS','global',before,payload); return json({ok:true,maintenance:await maintenanceSettings(env)});
      }
    }

    if(path==='admin/coupon-create-permanent-v3'){
      const admin=await requirePermission(request,env,'COUPON_MANAGE')||await requirePermission(request,env,'COUPON_ISSUE'); if(!admin)return json({error:'쿠폰 발급 권한이 없습니다.'},403);
      if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
      const p=await readBody(request);
      const code=String(p.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40);
      const rewardType=String(p.rewardType||'').trim().toUpperCase();
      const rewardAmount=Number(p.rewardAmount);
      const maxUses=Number(p.maxUses);
      const rewardSpecs={COIN:{max:100000000,label:'코인'},MASTER_STAR:{max:1000000,label:'마스터의 별'},PREMIUM_CUBE:{max:100000,label:'프리미엄 큐브'},EQUIPMENT_SUPPLY_BOX:{max:100000,label:'장비 보급상자'},HIGH_GRADE_REROLL_TICKET:{max:100000,label:'고등급 재뽑기권'}};
      const spec=rewardSpecs[rewardType];
      if(!/^[A-Z0-9_-]{4,40}$/.test(code))return json({error:'쿠폰 코드는 영문 대문자·숫자·_·- 조합 4~40자로 입력하세요.'},400);
      if(!spec)return json({error:'선택한 쿠폰 보상 종류가 올바르지 않습니다.'},400);
      if(!Number.isInteger(rewardAmount)||rewardAmount<1||rewardAmount>spec.max)return json({error:`${spec.label} 지급 수량을 확인하세요.`},400);
      if(!Number.isInteger(maxUses)||maxUses<1||maxUses>1000000)return json({error:'전체 최대 사용 횟수를 확인하세요.'},400);
      await releaseDeletedCouponCode(env,code,admin.id);
      const exists=await env.DB.prepare('SELECT id FROM coupons WHERE code=? AND deleted_at IS NULL LIMIT 1').bind(code).first();
      if(exists)return json({error:'이미 존재하는 쿠폰 코드입니다.'},409);
      try{
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,starts_at,ends_at,max_uses,is_active,created_by) VALUES(?,?,?,?,NULL,NULL,?,1,?)`).bind(code,rewardType==='COIN'?rewardAmount:0,rewardType,rewardAmount,maxUses,admin.id),
          env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'COUPON_CREATE_V3','COUPON',code,null,JSON.stringify({code,rewardType,rewardAmount,maxUses,permanent:true}))
        ]);
        const coupon=await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND deleted_at IS NULL LIMIT 1').bind(code).first();
        if(!coupon)return json({error:'쿠폰 저장 후 조회에 실패했습니다.'},500);
        return json({ok:true,coupon,rewardLabel:spec.label},201);
      }catch(error){
        const message=String(error?.message||'');
        if(/UNIQUE|constraint|already exists/i.test(message))return json({error:'이미 존재하는 쿠폰 코드입니다.'},409);
        console.error('coupon v3 create failed',message);
        return json({error:'영구 쿠폰 저장 중 오류가 발생했습니다.'},500);
      }
    }

    if(path==='admin/coupons'||path==='admin/coupons-v2'){
      const manager=await requirePermission(request,env,'COUPON_MANAGE'),issuer=manager||await requirePermission(request,env,'COUPON_ISSUE'),admin=issuer;
      if(!admin)return json({error:'쿠폰 발급 권한이 없습니다.'},403);
      if(request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM coupons WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300').all();return json({coupons:rows.results||[]});}
      if(request.method==='POST'){
        const p=await readBody(request),code=String(p.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40),rewardType=String(p.rewardType||'COIN').toUpperCase(),rewardAmount=Number(p.rewardAmount),max=Number(p.maxUses),spec=verifiedMessageRewardSpec(rewardType);
        if(!/^[A-Z0-9_-]{4,40}$/.test(code))return json({error:'쿠폰 코드는 영문 대문자·숫자·_·- 조합 4~40자로 입력하세요.'},400);
        if(!spec||!['COIN','MASTER_STAR','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX','HIGH_GRADE_REROLL_TICKET'].includes(rewardType))return json({error:'쿠폰 보상 종류를 확인하세요.'},400);
        if(!Number.isInteger(rewardAmount)||rewardAmount<1||rewardAmount>Number(spec.max||10000000))return json({error:'쿠폰 보상 수량을 확인하세요.'},400);
        if(!Number.isInteger(max)||max<1||max>1000000)return json({error:'총 사용 한도를 확인하세요.'},400);
        await releaseDeletedCouponCode(env,code,admin.id);
        const before=await env.DB.prepare('SELECT id FROM coupons WHERE code=? AND deleted_at IS NULL LIMIT 1').bind(code).first();
        if(before)return json({error:'이미 존재하는 쿠폰 코드입니다.'},409);
        try{
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO coupons(code,reward_coin,reward_type,reward_amount,starts_at,ends_at,max_uses,created_by) VALUES(?,?,?,?,NULL,NULL,?,?)`).bind(code,rewardType==='COIN'?rewardAmount:0,rewardType,rewardAmount,max,admin.id),
            env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'COUPON_CREATE','COUPON',code,null,JSON.stringify({code,rewardType,rewardAmount,max,permanent:true}))
          ]);
          const coupon=await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND deleted_at IS NULL LIMIT 1').bind(code).first();
          return json({ok:true,coupon},201);
        }catch(error){
          const message=String(error?.message||'');
          if(/UNIQUE|constraint|already exists/i.test(message))return json({error:'이미 존재하는 쿠폰 코드입니다.'},409);
          console.error('coupon create failed',message);
          return json({error:'쿠폰 발급 처리 중 오류가 발생했습니다. 관리자 로그인은 유지됩니다.'},500);
        }
      }
      if(request.method==='PATCH'){
        if(!manager)return json({error:'쿠폰 수정 권한이 없습니다.'},403);
        const p=await readBody(request),before=await env.DB.prepare('SELECT * FROM coupons WHERE id=? AND deleted_at IS NULL').bind(Number(p.id)).first();if(!before)return json({error:'쿠폰이 없습니다.'},404);
        const maxUses=p.maxUses==null?null:Number(p.maxUses);if(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<Math.max(1,Number(before.used_count||0))||maxUses>1000000))return json({error:'총 사용 한도를 확인하세요. 이미 사용된 횟수보다 작게 설정할 수 없습니다.'},400);
        await env.DB.prepare('UPDATE coupons SET is_active=?,starts_at=NULL,ends_at=NULL,max_uses=COALESCE(?,max_uses),updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(p.isActive===false?0:1,maxUses,before.id).run();
        const after=await env.DB.prepare('SELECT * FROM coupons WHERE id=?').bind(before.id).first();await writeAdminLog(env,admin,'COUPON_UPDATE','COUPON',before.id,before,after);return json({ok:true,coupon:after});
      }
      if(request.method==='DELETE'){
        if(!manager)return json({error:'쿠폰 삭제 권한이 없습니다.'},403);
        const p=await readBody(request),ids=[...new Set((Array.isArray(p.ids)?p.ids:[]).map(Number).filter(x=>Number.isInteger(x)&&x>0))].slice(0,5000);
        if(!ids.length)return json({error:'삭제할 쿠폰을 선택하세요.'},400);

        // V1063: Cloudflare D1/SQLite SQL variable limit 대응.
        // 대량 ID를 하나의 IN 절에 바인딩하지 않고 50개 단위로 조회·삭제한다.
        const chunkSize=50,beforeRows=[];
        for(let offset=0;offset<ids.length;offset+=chunkSize){
          const chunk=ids.slice(offset,offset+chunkSize),placeholders=chunk.map(()=>'?').join(',');
          const rows=await env.DB.prepare(`SELECT * FROM coupons WHERE deleted_at IS NULL AND id IN (${placeholders}) ORDER BY id DESC`).bind(...chunk).all();
          if(Array.isArray(rows.results))beforeRows.push(...rows.results);
        }
        if(!beforeRows.length)return json({error:'삭제 가능한 쿠폰이 없습니다.'},404);

        const uniqueRows=[...new Map(beforeRows.map(row=>[Number(row.id),row])).values()];
        const targetIds=uniqueRows.map(row=>Number(row.id));
        let deletedCount=0;
        for(let offset=0;offset<targetIds.length;offset+=chunkSize){
          const chunk=targetIds.slice(offset,offset+chunkSize),placeholders=chunk.map(()=>'?').join(',');
          const result=await env.DB.prepare(`UPDATE coupons SET is_active=0,deleted_at=CURRENT_TIMESTAMP,deleted_by=?,updated_at=CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND id IN (${placeholders})`).bind(admin.id,...chunk).run();
          deletedCount+=Number(result?.meta?.changes||0);
        }
        await writeAdminLog(env,admin,'COUPON_BULK_DELETE','COUPON',targetIds.join(','),uniqueRows,{deletedCount,requestedCount:ids.length,ids:targetIds});
        return json({ok:true,deletedCount,ids:targetIds});
      }
    }

    if(path==='admin/users/card-grant'){
      const admin=await requirePermission(request,env,'USER_MANAGE');
      if(!admin)return json({error:'카드 수동 지급 권한이 없습니다.'},403);
      const manualGrantMaxLevel=grade=>{
        grade=String(grade||'').trim().toUpperCase();
        if(grade==='MA')return 13;
        return BREAKTHROUGH_GRADES.includes(grade)?10:0;
      };
      if(request.method==='GET'){
        const userId=Math.floor(Number(url.searchParams.get('userId')||0));
        const q=String(url.searchParams.get('q')||'').trim().slice(0,60);
        if(!Number.isInteger(userId)||userId<1)return json({error:'카드를 지급할 유저를 선택하세요.'},400);
        const targetUser=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first();
        if(!targetUser)return json({error:'유저를 찾을 수 없습니다.'},404);
        if(targetUser.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정에는 카드를 지급할 수 없습니다.'},403);
        const filters=["UPPER(c.rarity)<>'LIMITED'","c.is_active=1","COALESCE(c.card_status,'PUBLIC')='PUBLIC'","COALESCE(m.is_active,1)=1"],binds=[userId];
        if(q){filters.push("(c.id LIKE ? OR c.title LIKE ? OR m.name LIKE ? OR UPPER(c.rarity) LIKE ?)");const like=`%${q}%`;binds.push(like,like,like,like.toUpperCase());}
        const rows=await env.DB.prepare(`SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.image_url AS image,m.name,
          COALESCE(uc.quantity,0) AS ownedQuantity,COALESCE(uc.breakthrough_level,0) AS breakthroughLevel
          FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
          LEFT JOIN user_cards uc ON uc.user_id=? AND uc.card_id=c.id
          WHERE ${filters.join(' AND ')}
          ORDER BY CASE UPPER(c.rarity) WHEN 'FUR' THEN 1 WHEN 'PRESTIGE' THEN 2 WHEN 'LIMITED' THEN 3 WHEN 'MA' THEN 4 WHEN 'SSR' THEN 5 WHEN 'UR' THEN 6 WHEN 'HR' THEN 7 WHEN 'SR' THEN 8 WHEN 'R' THEN 9 WHEN 'U' THEN 10 ELSE 11 END,m.sort_order,c.title,c.id LIMIT 80`).bind(...binds).all();
        return json({user:targetUser,storageMode:'SINGLE_ROW_PER_USER_CARD',prestigeSupported:true,excludedGrades:['LIMITED'],cards:(rows.results||[]).map(card=>({...card,ownedQuantity:Number(card.ownedQuantity||0),breakthroughLevel:Number(card.breakthroughLevel||0),maxBreakthrough:manualGrantMaxLevel(card.grade)}))});
      }
      if(request.method==='POST'){
        const body=await readBody(request),userId=Math.floor(Number(body.userId||0)),cardId=String(body.cardId||'').trim(),breakthroughLevel=Number(body.breakthroughLevel),reason=String(body.reason||'관리자 카드 수동 지급').trim().slice(0,200),requestId=String(body.requestId||crypto.randomUUID()).trim().slice(0,120);
        if(!Number.isInteger(userId)||userId<1)return json({error:'카드를 지급할 유저를 선택하세요.'},400);
        if(!cardId)return json({error:'지급할 카드를 선택하세요.'},400);
        if(!Number.isInteger(breakthroughLevel)||breakthroughLevel<0)return json({error:'강화 수치는 0 이상의 정수로 입력하세요.'},400);
        if(!reason)return json({error:'카드 지급 사유를 입력하세요.'},400);
        const [targetUser,card]=await Promise.all([
          env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first(),
          env.DB.prepare(`SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.is_active,c.card_status,m.name,COALESCE(m.is_active,1) AS member_active
            FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=?`).bind(cardId).first()
        ]);
        if(!targetUser)return json({error:'유저를 찾을 수 없습니다.'},404);
        if(targetUser.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정에는 카드를 지급할 수 없습니다.'},403);
        if(!card)return json({error:'카드를 찾을 수 없습니다.'},404);
        if(card.grade==='LIMITED')return json({error:'LIMITED 등급 카드는 이 기능으로 지급할 수 없습니다.'},400);
        if(Number(card.is_active)!==1||Number(card.member_active)!==1||String(card.card_status||'PUBLIC').toUpperCase()!=='PUBLIC')return json({error:'현재 공개·활성 상태인 카드만 지급할 수 있습니다.'},409);
        const maxBreakthrough=manualGrantMaxLevel(card.grade);
        if(breakthroughLevel>maxBreakthrough)return json({error:maxBreakthrough>0?`${card.grade} 등급의 강화 수치는 0~${maxBreakthrough}까지만 지정할 수 있습니다.`:`${card.grade} 등급은 현재 강화 수치 0으로만 지급할 수 있습니다.`},400);
        const owned=await env.DB.prepare('SELECT quantity,COALESCE(breakthrough_level,0) AS breakthrough_level FROM user_cards WHERE user_id=? AND card_id=?').bind(userId,cardId).first();
        const quantityBefore=Number(owned?.quantity||0),levelBefore=Number(owned?.breakthrough_level||0),alreadyOwned=quantityBefore>0;
        if(alreadyOwned&&levelBefore!==breakthroughLevel)return json({error:`현재 구조는 같은 카드를 별도 강화 행으로 저장할 수 없습니다. 이 유저가 보유한 카드는 +${levelBefore}이므로 +${breakthroughLevel} 지급을 차단했습니다. 동일 강화 수치로 지급하거나 다른 카드를 선택하세요.`,current:{quantity:quantityBefore,breakthroughLevel:levelBefore}},409);
        const quantityAfter=Math.max(0,quantityBefore)+1,effectiveLevel=alreadyOwned?levelBefore:breakthroughLevel;
        const beforeData={requestId,userId,nickname:targetUser.nickname,cardId,cardTitle:card.title,memberName:card.name,grade:card.grade,quantity:quantityBefore,breakthroughLevel:levelBefore};
        const afterData={...beforeData,quantity:quantityAfter,breakthroughLevel:effectiveLevel,reason,grantMode:alreadyOwned?'DUPLICATE_QUANTITY_INCREMENT':'NEW_CARD_WITH_LEVEL'};
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(?,?,1,?)
            ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=CASE WHEN user_cards.quantity<0 THEN 1 ELSE user_cards.quantity+1 END,
            breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN excluded.breakthrough_level ELSE user_cards.breakthrough_level END,last_obtained_at=CURRENT_TIMESTAMP`).bind(userId,cardId,breakthroughLevel),
          env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'USER_CARD_MANUAL_GRANT','USER_CARD',`${userId}:${cardId}`,JSON.stringify(beforeData),JSON.stringify(afterData))
        ]);
        const verified=await env.DB.prepare('SELECT quantity,COALESCE(breakthrough_level,0) AS breakthrough_level FROM user_cards WHERE user_id=? AND card_id=?').bind(userId,cardId).first();
        if(Number(verified?.quantity)!==quantityAfter||Number(verified?.breakthrough_level)!==effectiveLevel)return json({error:'카드 지급 후 검증 값이 일치하지 않습니다. 관리자 로그에서 처리 내역을 확인하세요.'},500);
        return json({ok:true,requestId,user:{id:targetUser.id,nickname:targetUser.nickname},card:{id:card.id,title:card.title,name:card.name,grade:card.grade},quantityBefore,quantityAfter,breakthroughLevel:effectiveLevel,grantMode:afterData.grantMode,reason});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }

    if(path==='admin/users/master-star'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'유저 관리 권한이 없습니다.'},403);
      const payload=await readBody(request),userId=Number(payload.userId),amount=Number(payload.amount),reason=String(payload.reason||'관리자 마스터의 별 조정').trim().slice(0,100);
      if(!Number.isInteger(userId)||userId<1)return json({error:'대상 유저를 다시 선택하세요.'},400);
      if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000000)return json({error:'마스터의 별 수량은 -1,000,000~1,000,000 범위의 0이 아닌 정수로 입력하세요.'},400);
      if(!reason)return json({error:'처리 사유를 입력하세요.'},400);
      const target=await env.DB.prepare('SELECT id,nickname,role FROM users WHERE id=?').bind(userId).first();
      if(!target)return json({error:'유저를 찾을 수 없습니다.'},404);
      if(target.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정은 수정할 수 없습니다.'},403);
      await env.DB.prepare("INSERT OR IGNORE INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,'MASTER_STAR',0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(userId).run();
      const beforeRow=await env.DB.prepare("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId).first(),beforeBalance=Math.max(0,Number(beforeRow?.quantity||0));
      const changed=await env.DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity+?,unseen_quantity=CASE WHEN ?>0 THEN unseen_quantity+? ELSE MIN(unseen_quantity,quantity+?) END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity+?>=0").bind(amount,amount,Math.max(0,amount),amount,userId,amount).run();
      if(!Number(changed.meta?.changes||0))return json({error:`보유 마스터의 별 ${beforeBalance.toLocaleString()}개보다 많이 회수할 수 없습니다.`},409);
      const balanceRow=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId).first(),balance=Math.max(0,Number(balanceRow?.quantity||0));
      await env.DB.batch([
        env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES(?,'MASTER_STAR',?,?,?,'ADMIN_ADJUST',?,?)").bind(userId,amount,balance,reason,String(admin.id),admin.id),
        env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'MASTER_STAR_ADJUST','USER',?,?,?)").bind(admin.id,String(userId),JSON.stringify({nickname:target.nickname,balance:beforeBalance}),JSON.stringify({nickname:target.nickname,balance,amount,reason}))
      ]);
      return json({ok:true,user:{id:target.id,nickname:target.nickname},amount,balance});
    }

    if(path==='admin/users/magic-crystal'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'유저 관리 권한이 없습니다.'},403);
      const payload=await readBody(request),userId=Number(payload.userId),amount=Number(payload.amount),reason=String(payload.reason||'관리자 마법 결정 조정').trim().slice(0,100);
      if(!Number.isInteger(userId)||userId<1)return json({error:'대상 유저를 다시 선택하세요.'},400);
      if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000000)return json({error:'마법 결정 수량은 -1,000,000~1,000,000 범위의 0이 아닌 정수로 입력하세요.'},400);
      if(!reason)return json({error:'처리 사유를 입력하세요.'},400);
      const target=await env.DB.prepare('SELECT id,nickname,role,COALESCE(magic_crystals,0) AS magic_crystals FROM users WHERE id=?').bind(userId).first();
      if(!target)return json({error:'유저를 찾을 수 없습니다.'},404);
      if(target.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정은 수정할 수 없습니다.'},403);
      const beforeBalance=Math.max(0,Number(target.magic_crystals||0)),balance=beforeBalance+amount;
      if(balance<0)return json({error:`보유 마법 결정 ${beforeBalance.toLocaleString()}개보다 많이 회수할 수 없습니다.`},409);
      const changed=await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=? AND magic_crystals+?>=0').bind(amount,userId,amount).run();
      if(!Number(changed.meta?.changes||0))return json({error:'마법 결정 잔액 변경에 실패했습니다. 새로고침 후 다시 시도하세요.'},409);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,'ADMIN_ADJUST',?)").bind(userId,amount,balance,reason,String(admin.id)),
        env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'MAGIC_CRYSTAL_ADJUST','USER',?,?,?)").bind(admin.id,String(userId),JSON.stringify({nickname:target.nickname,balance:beforeBalance}),JSON.stringify({nickname:target.nickname,balance,amount,reason}))
      ]);
      const verified=await env.DB.prepare('SELECT magic_crystals AS balance FROM users WHERE id=?').bind(userId).first();
      if(Number(verified?.balance)!==balance)return json({error:'마법 결정 지급 후 잔액 검증에 실패했습니다.'},500);
      return json({ok:true,user:{id:target.id,nickname:target.nickname},amount,balance});
    }

    if(path==='admin/users/action'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE'); if(!admin)return json({error:'유저 관리 권한이 없습니다.'},403);
      const p=await readBody(request),userId=Number(p.userId),action=String(p.action||'');
      const before=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();
      if(!before)return json({error:'유저를 찾을 수 없습니다.'},404);
      if(before.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정은 수정할 수 없습니다.'},403);
      if(action==='NICKNAME'){
        const rawNickname=String(p.nickname||'').replace(/\u00a0/g,' ').trim(),newNickname=rawNickname.replace(/\s+/g,' '),reason=String(p.reason||'관리자 닉네임 변경').trim().slice(0,160)||'관리자 닉네임 변경';
        if(!newNickname)return json({error:'변경할 닉네임을 입력하세요.'},400);
        if(newNickname.length>20)return json({error:'닉네임은 20자 이하로 입력하세요.'},400);
        if(newNickname===before.nickname)return json({error:'현재 닉네임과 동일합니다.'},400);
        const duplicate=await env.DB.prepare('SELECT id,nickname FROM users WHERE id<>? AND nickname=? COLLATE NOCASE LIMIT 1').bind(userId,newNickname).first();
        if(duplicate)return json({error:'이미 사용 중인 닉네임입니다.'},409);
        const maintenanceRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='maintenance_test_users'").first();
        const maintenanceNames=String(maintenanceRow?.value||'').split(',').map(name=>name.trim()).filter(Boolean),maintenanceUpdated=maintenanceNames.some(name=>name===before.nickname);
        const nextMaintenanceNames=maintenanceUpdated?maintenanceNames.map(name=>name===before.nickname?newNickname:name).join(', '):String(maintenanceRow?.value||'');
        const afterData={...before,nickname:newNickname,nicknameChangeReason:reason,maintenanceTestUserUpdated:maintenanceUpdated};
        const statements=[
          env.DB.prepare('UPDATE users SET nickname=? WHERE id=?').bind(newNickname,userId),
          env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'NICKNAME_CHANGE','USER',String(userId),JSON.stringify(before),JSON.stringify(afterData))
        ];
        if(maintenanceUpdated)statements.push(env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='maintenance_test_users'").bind(nextMaintenanceNames));
        try{
          await env.DB.batch(statements);
        }catch(error){
          if(String(error?.message||error).toLowerCase().includes('unique'))return json({error:'이미 사용 중인 닉네임입니다.'},409);
          throw error;
        }
        const after=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();
        return json({ok:true,user:after,previousNickname:before.nickname,reason});
      }
      else if(action==='COIN'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경 코인을 입력하세요.'},400);if(before.coin+amount<0)return json({error:'보유 코인보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();const afterCoin=before.coin+amount;await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)').bind(userId,amount,afterCoin,String(p.reason||'관리자 조정').slice(0,100),admin.id).run();}
      else if(action==='SHARDS'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경할 카드 조각 수량을 입력하세요.'},400);const current=Number(before.card_shards||0);if(current+amount<0)return json({error:'보유 카드 조각보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(amount,userId).run();const balance=current+amount;await env.DB.prepare('INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,?)').bind(userId,amount,balance,String(p.reason||'관리자 조정').slice(0,100)).run();}
      else if(action==='INVENTORY'){const itemCode=String(p.itemCode||'').trim().toUpperCase(),amount=Number(p.amount);if(!Number.isInteger(amount)||amount<1||amount>9999)return json({error:'지급할 아이템 수량은 1~9,999개로 입력하세요.'},400);const item=await env.DB.prepare('SELECT code,name FROM inventory_items WHERE code=? AND is_active=1').bind(itemCode).first();if(!item)return json({error:'지급 가능한 인벤토리 아이템이 아닙니다.'},400);await env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId,itemCode,amount,amount).run();const inventory=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,itemCode).first();await env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES(?,?,?,?,?,'ADMIN_GRANT',?,?)").bind(userId,itemCode,amount,Number(inventory?.quantity||0),String(p.reason||'관리자 아이템 지급').slice(0,100),String(admin.id),admin.id).run();}
      else if(action==='CARDS_RESET')await env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId).run();
      else if(action==='ATTENDANCE_RESET')await env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId).run();
      else if(action==='ACCOUNT_RESET')await env.DB.batch([env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM draw_logs WHERE user_id=?').bind(userId),env.DB.prepare('UPDATE users SET coin=5000,card_shards=0 WHERE id=?').bind(userId)]);
      else if(action==='BAN'){const days=String(p.days||'1'),until=days==='PERMANENT'?'9999-12-31 23:59:59':new Date(Date.now()+Number(days)*86400000).toISOString().replace('T',' ').slice(0,19);await env.DB.batch([env.DB.prepare("UPDATE users SET status='BANNED',banned_until=?,ban_reason=? WHERE id=?").bind(until,String(p.reason||'').slice(0,200),userId),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)]);}
      else if(action==='UNBAN')await env.DB.prepare("UPDATE users SET status='ACTIVE',banned_until=NULL,ban_reason=NULL WHERE id=?").bind(userId).run();
      else if(action==='FORCE_MAIN'){
        const message=String(p.reason||'운영자가 화면 복구를 실행했습니다.').trim().slice(0,160)||'운영자가 화면 복구를 실행했습니다.';
        const command=await env.DB.prepare(`INSERT INTO user_runtime_commands(user_id,command_type,payload_json,created_by,expires_at) VALUES(?,'FORCE_MAIN',?,?,datetime('now','+30 minutes'))`).bind(userId,JSON.stringify({target:'buy',message}),admin.id).run();
        const after=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();
        await writeAdminLog(env,admin,'FORCE_MAIN','USER',userId,before,{...after,commandId:Number(command?.meta?.last_row_id||0),message});
        return json({ok:true,user:after,commandId:Number(command?.meta?.last_row_id||0),message});
      }
      else return json({error:'지원하지 않는 작업입니다.'},400);
      const after=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();await writeAdminLog(env,admin,action,'USER',userId,before,after);return json({ok:true,user:after});
    }

    if(path==='admin/users'){
      const admin=await requirePermission(request,env,'USER_MANAGE');
      if(!admin) return json({error:'유저 관리 권한이 없습니다.'},403);
      if(request.method!=='GET') return json({error:'지원하지 않는 요청입니다.'},405);
      await ensureSecondVerificationFoundation(env);
      const q=(url.searchParams.get('q')||'').trim().slice(0,30),verification=String(url.searchParams.get('verification')||'ALL').toUpperCase();
      const filters=[],binds=[];if(q){filters.push('u.nickname LIKE ?');binds.push(`%${q}%`);}if(verification==='VERIFIED')filters.push('s.user_id IS NOT NULL');else if(verification==='PENDING')filters.push("s.user_id IS NULL AND w.status IN ('PENDING','REVIEW')");else if(verification==='UNVERIFIED')filters.push("s.user_id IS NULL AND (w.id IS NULL OR w.status NOT IN ('VERIFIED','PENDING','REVIEW'))");
      // Select the 100 visible users first, then aggregate cards for only those
      // users. The previous join grouped the entire user_cards table before the
      // LIMIT and read roughly 600k rows for every CMS refresh.
      const selectedOrder=q?'u.nickname ASC':'u.created_at DESC',resultOrder=q?'su.nickname ASC':'su.created_at DESC';
      const sql=`WITH selected_users AS MATERIALIZED (
          SELECT u.id,u.nickname,u.coin,u.card_shards,u.role,u.status,u.created_at,u.last_login_at,
            CASE WHEN s.user_id IS NOT NULL THEN 'VERIFIED' ELSE w.status END AS verification_status,
            s.provider AS verification_provider,s.provider_name AS verification_name,s.provider_user_id AS verification_provider_user_id,
            w.wago_nickname,w.wago_member_no,COALESCE(s.verified_at,w.verified_at) AS verified_at,u.magic_crystals,
            (SELECT COALESCE(quantity,0) FROM cnine_user_inventory inv WHERE inv.user_id=u.id AND inv.item_code='MASTER_STAR') AS master_stars,
            (SELECT COALESCE(quantity,0) FROM cnine_user_inventory inv WHERE inv.user_id=u.id AND inv.item_code='SCRAPYARD_ENTRY_TICKET') AS scrapyard_tickets
          FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id LEFT JOIN wago_verifications w ON w.user_id=u.id ${filters.length?'WHERE '+filters.join(' AND '):''}
          ORDER BY ${selectedOrder} LIMIT 100
        ), card_stats AS (
          SELECT uc.user_id,COUNT(uc.card_id) AS card_count,
            COALESCE(SUM(CASE WHEN c.rarity='UR' THEN 1 ELSE 0 END),0) AS ur_count,
            COALESCE(SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END),0) AS ssr_count,
            COALESCE(SUM(CASE WHEN c.rarity='LIMITED' THEN 1 ELSE 0 END),0) AS limited_count,
            COALESCE(SUM(CASE WHEN c.rarity='PRESTIGE' THEN 1 ELSE 0 END),0) AS prestige_count,
            COALESCE(SUM(CASE WHEN c.rarity='FUR' THEN 1 ELSE 0 END),0) AS fur_count
          FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id
          WHERE COALESCE(uc.quantity,0)>0 AND uc.user_id IN (SELECT id FROM selected_users)
          GROUP BY uc.user_id
        )
        SELECT su.*,COALESCE(cs.card_count,0) AS card_count,COALESCE(cs.ur_count,0) AS ur_count,
          COALESCE(cs.ssr_count,0) AS ssr_count,COALESCE(cs.limited_count,0) AS limited_count,
          COALESCE(cs.prestige_count,0) AS prestige_count,COALESCE(cs.fur_count,0) AS fur_count
        FROM selected_users su LEFT JOIN card_stats cs ON cs.user_id=su.id ORDER BY ${resultOrder}`;
      const stmt=env.DB.prepare(sql);const rows=binds.length?await stmt.bind(...binds).all():await stmt.all();
      return json({users:rows.results,role:admin.role,verification});
    }

    if(path==='admin/users/private-key-reset'&&request.method==='POST'){
      const admin=await authenticate(request,env);
      if(!admin||!['OWNER','ADMIN'].includes(admin.role)) return json({error:'개인키 재발급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      if(!Number.isInteger(userId)||userId<1) return json({error:'재발급할 유저를 선택하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET private_key_hash=? WHERE id=?').bind(privateKeyHash,userId),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)
      ]);
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'PRIVATE_KEY_RESET','USER',String(userId),JSON.stringify(before),JSON.stringify({nickname:before.nickname,sessionsRevoked:true})).run();
      return json({ok:true,user:{id:before.id,nickname:before.nickname},privateKey});
    }
    if(path==='admin/coins'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COIN_GRANT');
      if(!admin) return json({error:'코인 지급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      const amount=Number(payload.amount);
      const reason=String(payload.reason||'관리자 수동 지급').trim().slice(0,100);
      if(!Number.isInteger(userId)||userId<1) return json({error:'지급할 유저를 선택하세요.'},400);
      if(!Number.isInteger(amount)||amount<1||amount>1000000) return json({error:'지급 코인은 1~1,000,000 사이의 정수로 입력하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const result=await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();
      if(!result.meta.changes) return json({error:'코인 지급에 실패했습니다.'},500);
      const after=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)')
        .bind(userId,amount,after.coin,reason||'관리자 수동 지급',admin.id).run();
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'COIN_GRANT','USER',String(userId),JSON.stringify(before),JSON.stringify({...after,amount,reason})).run();
      return json({ok:true,user:after,amount,reason});
    }

    if(path==='burning-event/status'){
      const forceFresh=new URL(request.url).searchParams.get('fresh')==='1';
      const pair=await burningEventPair(env,{fresh:forceFresh});
      return json({burningEvent:burningPublicState(pair.active),serverNow:new Date().toISOString()});
    }
    if(path==='admin/burning-event'||path==='admin/hyper-burning-event'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'운영 설정 권한이 없습니다.'},403);
      const isHyper=path==='admin/hyper-burning-event',mode=isHyper?'HYPER':'BURNING',metaKey=isHyper?HYPER_BURNING_EVENT_META_KEY:BURNING_EVENT_META_KEY,otherKey=isHyper?BURNING_EVENT_META_KEY:HYPER_BURNING_EVENT_META_KEY;
      if(request.method==='GET'){
        const pair=await burningEventPair(env,{fresh:true}),settings=isHyper?pair.hyper:pair.normal;
        return json({settings,activeMode:pair.active.enabled?pair.active.mode:'NONE',activeEvent:burningPublicState(pair.active)});
      }
      if(request.method==='PATCH'){
        const body=await readBody(request),pairBefore=await burningEventPair(env,{fresh:true}),before=isHyper?pairBefore.hyper:pairBefore.normal,otherBefore=isHyper?pairBefore.normal:pairBefore.hyper;
        const payload=body.settings||body,requested=cleanBurningEventSettings({...before,...payload,...(payload.enabled===true&&!Object.prototype.hasOwnProperty.call(payload,'endsAt')?{endsAt:null}:{})},mode),turningOn=before.enabled!==true&&requested.enabled===true,changedAt=new Date().toISOString(),shouldDisableOther=requested.enabled===true&&otherBefore.enabled===true;
        const next=cleanBurningEventSettings({...requested,generation:turningOn?Number(before.generation||0)+1:Number(before.generation||0),activatedAt:turningOn?changedAt:before.activatedAt,updatedAt:changedAt},mode);
        const otherNext=shouldDisableOther?cleanBurningEventSettings({...otherBefore,enabled:false,updatedAt:changedAt},isHyper?'BURNING':'HYPER'):otherBefore;
        const statements=[env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(metaKey,JSON.stringify(next))];
        if(shouldDisableOther)statements.push(env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(otherKey,JSON.stringify(otherNext)));
        await env.DB.batch(statements);
        burningEventCache=null;invalidateEquipmentPromotionCache();
        const verified=await burningEventPair(env,{fresh:true}),verifiedSettings=isHyper?verified.hyper:verified.normal;
        await writeAdminLog(env,admin,isHyper?'HYPER_BURNING_EVENT_UPDATE':'BURNING_EVENT_UPDATE','APP_META',metaKey,before,verifiedSettings);
        return json({ok:true,settings:verifiedSettings,otherSettings:isHyper?verified.normal:verified.hyper,activeMode:verified.active.enabled?verified.active.mode:'NONE',activeEvent:burningPublicState(verified.active),activated:turningOn});
      }
    }

    if(path==='admin/card-packs'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'카드팩 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const packs=await env.DB.prepare("SELECT * FROM card_packs WHERE id<>'summer-new' ORDER BY sort_order,id").all();
        const cfgRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_preview_configs'").first();
        let previews={}; try{previews=JSON.parse(cfgRow?.value||'{}')}catch{}
        const cards=await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.card_status AS cardStatus,m.name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.card_status IN ('PENDING','PUBLIC') ORDER BY c.created_at DESC,c.id DESC LIMIT 120`).all();
        const furPoolCounts={};
        await Promise.all((packs.results||[]).filter(pack=>FUR_FIRST_PITY_PACKS.has(String(pack.id))).map(async pack=>{const ctx=await loadDrawContext(env,pack);furPoolCounts[String(pack.id)]=(ctx.poolsByGrade.get('FUR')||[]).length;}));
        return json({packs:packs.results.map(p=>({...p,allowed:JSON.parse(p.allowed_rarities||'[]')})),previews,cards:cards.results,pitySettings:await pitySettings(env),furFirstSettings:await furFirstSettings(env),furPoolCounts});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request); const id=String(payload.id||'');
        const before=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(id).first();
        if(!before||id==='summer-new') return json({error:'카드팩을 찾을 수 없습니다.'},404);
        const name=String(payload.name||before.name).trim().slice(0,60);
        const subtitle=String(payload.subtitle||before.subtitle).trim().slice(0,60);
        const description=String(payload.description||before.description).trim().slice(0,220);
        const theme=['basic','advanced','premium','pickup'].includes(String(payload.theme))?String(payload.theme):before.theme;
        const price=Math.max(0,Math.floor(Number(payload.price??before.price)||0));
        const g10=String(payload.guarantee10||before.guarantee_10).toUpperCase();
        const g20=String(payload.guarantee20||before.guarantee_20).toUpperCase();
        const active=payload.isActive?1:0; const sort=Math.floor(Number(payload.sortOrder??before.sort_order)||0);
        if(!name||!subtitle||!description) return json({error:'팩 이름, 영문명, 설명을 입력하세요.'},400);
        if(!DRAW_RARITIES.includes(g10)||!DRAW_RARITIES.includes(g20)) return json({error:'보장 등급을 확인하세요.'},400);
        await env.DB.prepare('UPDATE card_packs SET name=?,subtitle=?,description=?,theme=?,price=?,guarantee_10=?,guarantee_20=?,is_active=?,sort_order=? WHERE id=?')
          .bind(name,subtitle,description,theme,price,g10,g20,active,sort,id).run();
        packCatalogCache=null;drawContextCache.clear();
        const cfgRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_preview_configs'").first();
        let configs={}; try{configs=JSON.parse(cfgRow?.value||'{}')}catch{}
        const pc=payload.preview||{};
        configs[id]={badge:String(pc.badge||'').slice(0,24),headline:String(pc.headline||'').slice(0,80),showNewCards:pc.showNewCards!==false,showNames:pc.showNames!==false,showGrades:pc.showGrades!==false,columns:Math.max(2,Math.min(6,Number(pc.columns)||5)),cardIds:Array.isArray(pc.cardIds)?pc.cardIds.map(String).slice(0,30):[]};
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pack_preview_configs',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(configs)).run();
        if(payload.pitySettings&&PITY_PACKS.has(id)){const beforePity=await pitySettings(env),clean=cleanPitySettings({...beforePity,[id]:payload.pitySettings});await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();pitySettingsCache=null;}
        let savedFurFirst=await furFirstSettings(env,{fresh:true});
        if(payload.furFirstSettings&&FUR_FIRST_PITY_PACKS.has(id)){
          savedFurFirst=cleanFurFirstSettings(payload.furFirstSettings);
          await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(FUR_FIRST_PITY_META_KEY,JSON.stringify(savedFurFirst)).run();
          furFirstSettingsCache={value:savedFurFirst,expiresAt:Date.now()+30000};
        }
        const after=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(id).first();
        await writeAdminLog(env,admin,'PACK_DETAIL_UPDATE','CARD_PACK',id,before,{...after,preview:configs[id],furFirstSettings:savedFurFirst});
        return json({ok:true,pack:after,preview:configs[id],furFirstSettings:savedFurFirst});
      }
    }

    if(path==='admin/card-rates'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'확률 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const packs=await env.DB.prepare('SELECT id,name,allowed_rarities FROM card_packs ORDER BY sort_order,id').all();
        const rates=await env.DB.prepare('SELECT pack_id,rarity,rate FROM card_pack_rates ORDER BY pack_id').all();
        return json({packs:packs.results.map(p=>({...p,allowed:JSON.parse(p.allowed_rarities)})),rates:rates.results,rarities:DRAW_RARITIES});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request); const packId=String(payload.packId||'');
        const pack=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(packId).first();
        if(!pack) return json({error:'카드팩을 찾을 수 없습니다.'},404);
        const rates=payload.rates||{}; const normalRarities=DRAW_RARITIES.filter(r=>r!=='LIMITED');
        const total=normalRarities.reduce((sum,r)=>sum+(Number(rates[r])||0),0);
        if(Math.abs(total-100)>0.0001) return json({error:`일반 등급 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(4)}%입니다.`},400);
        for(const rarity of normalRarities){
          const rate=Number(rates[rarity])||0; if(rate<0||rate>100) return json({error:'확률은 0~100 사이여야 합니다.'},400);
          await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,rarity,rate).run();
        }
        const limitedRate=LIMITED_DRAW_PACKS.has(packId)?(Number(rates.LIMITED)||0):0;
        if(limitedRate<0||limitedRate>100) return json({error:'한정판 별도 확률은 0~100 사이여야 합니다.'},400);
        await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,'LIMITED',limitedRate).run();
        const allowed=normalRarities.filter(r=>(Number(rates[r])||0)>0); if(LIMITED_DRAW_PACKS.has(packId)) allowed.push('LIMITED');
        await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),packId).run();packCatalogCache=null;
        await writeAdminLog(env,admin,'PACK_RATE_UPDATE','CARD_PACK',packId,null,{...rates,LIMITED:limitedRate});
        return json({ok:true,total,limitedRate});
      }
    }


    if(path==='admin/card-retirement'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'CARD_EDIT');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(admin.role!=='OWNER')return json({error:'퇴사 카드 처리는 OWNER만 가능합니다.'},403);
      const body=await readBody(request),cardId=String(body.cardId||'').trim(),action=String(body.action||'PREVIEW').toUpperCase();
      if(!cardId)return json({error:'카드를 선택하세요.'},400);
      const card=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.card_status,m.name AS member_name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=?`).bind(cardId).first();
      if(!card)return json({error:'카드가 없습니다.'},404);

      const cfg=await breakthroughConfig(env),maHigh=await maMasterStarBreakthroughConfig(env);
      const gradeRules=(Array.isArray(cfg[card.rarity])?cfg[card.rarity]:[]).map(rule=>({refundShards:Math.max(0,Number(rule?.cost)||0)}));
      if(String(card.rarity||'').toUpperCase()==='MA')for(const step of maHigh.steps)gradeRules.push({refundShards:Math.max(0,Number(step?.retirementShardRefund)||0)});
      const cumulative=[0];
      for(const rule of gradeRules)cumulative.push(cumulative[cumulative.length-1]+Math.max(0,Number(rule?.refundShards)||0));
      const pendingBatch=String(card.card_status||'').toUpperCase()==='RETIRE_PENDING'
        ? await env.DB.prepare("SELECT * FROM card_retirement_batches WHERE card_id=? AND status='PENDING'").bind(card.id).first()
        : null;
      const ownedRows=(await env.DB.prepare('SELECT user_id,COALESCE(breakthrough_level,0) AS breakthrough_level FROM user_cards WHERE card_id=? AND COALESCE(quantity,0)>0 ORDER BY user_id').bind(cardId).all()).results||[];
      const unsupported=ownedRows.filter(row=>{const level=Math.max(0,Number(row.breakthrough_level)||0);if(level>gradeRules.length)return true;if(String(card.rarity||'').toUpperCase()==='MA'&&level>10)return maHigh.steps.slice(0,level-10).some(step=>Number(step?.retirementShardRefund||0)<=0);return false});
      if(unsupported.length){
        const maxLevel=Math.max(...unsupported.map(row=>Math.max(0,Number(row.breakthrough_level)||0)));
        return json({error:`${card.rarity} +${maxLevel} 카드의 정확한 퇴사 환급 카드 조각 설정이 없습니다. 과소 지급 방지를 위해 퇴사 처리를 중단했습니다.`},409);
      }
      const currentSnapshots=ownedRows.map(row=>{
        const level=Math.max(0,Math.min(gradeRules.length,Number(row.breakthrough_level)||0));
        const shards=Number(cumulative[level]||0);
        return {userId:Number(row.user_id),level,requiredShards:shards,refundShards:shards,messageId:null};
      });
      let snapshots=currentSnapshots;
      if(pendingBatch){
        const stored=(await env.DB.prepare('SELECT user_id,breakthrough_level,required_shards,refund_shards,message_id FROM card_retirement_refunds WHERE batch_id=? ORDER BY user_id').bind(pendingBatch.id).all()).results||[];
        const storedMap=new Map(stored.map(row=>[Number(row.user_id),{
          userId:Number(row.user_id),level:Number(row.breakthrough_level||0),
          requiredShards:Number(row.required_shards||0),refundShards:Number(row.refund_shards||0),
          messageId:row.message_id==null?null:Number(row.message_id)
        }]));
        for(const row of currentSnapshots)if(!storedMap.has(row.userId))storedMap.set(row.userId,row);
        snapshots=[...storedMap.values()].sort((a,b)=>a.userId-b.userId);
      }
      const refundable=snapshots.filter(row=>row.refundShards>0);
      const directRefundable=refundable.filter(row=>row.messageId==null);
      const legacyMessageRefundable=refundable.filter(row=>row.messageId!=null);
      const maxLevel=gradeRules.length;
      const levelExpr=`MAX(0,MIN(${maxLevel},CAST(COALESCE(uc.breakthrough_level,0) AS INTEGER)))`;
      const refundCase=maxLevel>0
        ? `CASE ${levelExpr} ${cumulative.map((value,index)=>`WHEN ${index} THEN ${Math.max(0,Math.floor(Number(value)||0))}`).join(' ')} ELSE 0 END`
        : '0';
      const normalizedRetirementGrade=String(card.rarity||'').toUpperCase();
      const rerollTicket=RETIREMENT_REROLL_TICKETS[normalizedRetirementGrade]||null;
      if((normalizedRetirementGrade==='LIMITED'||normalizedRetirementGrade==='FUR')&&!rerollTicket){
        return json({error:`${normalizedRetirementGrade} 퇴사 재뽑기권 설정이 없어 안전을 위해 처리를 중단했습니다.`},500);
      }
      const summary={
        cardId:card.id,title:card.title,memberName:card.member_name,grade:card.rarity,
        ownedUsers:snapshots.length,refundUsers:refundable.length,
        totalRequiredShards:refundable.reduce((sum,row)=>sum+row.requiredShards,0),
        totalRefundShards:refundable.reduce((sum,row)=>sum+row.refundShards,0),
        directRefundUsers:directRefundable.length,directRefundShards:directRefundable.reduce((sum,row)=>sum+row.refundShards,0),
        legacyMessageRefundUsers:legacyMessageRefundable.length,legacyMessageRefundShards:legacyMessageRefundable.reduce((sum,row)=>sum+row.refundShards,0),
        refundRate:100,rerollTicketCode:rerollTicket?.code||null,rerollTicketName:rerollTicket?.name||null,
        rerollTicketUsers:rerollTicket?snapshots.length:0,status:card.card_status
      };
      if(action==='PREVIEW')return json({ok:true,summary});

      if(action==='QUEUE'){
        if(String(card.card_status||'').toUpperCase()==='RETIRED')return json({error:'이미 퇴사 처리가 완료된 카드입니다.'},409);
        await env.DB.prepare("INSERT OR IGNORE INTO card_retirement_batches(card_id,card_title,member_name,status,refund_rate,created_by) VALUES(?,?,?,'PENDING',100,?)").bind(card.id,card.title,card.member_name,admin.id).run();
        const batch=await env.DB.prepare('SELECT * FROM card_retirement_batches WHERE card_id=?').bind(card.id).first();
        if(!batch)return json({error:'퇴사 정산 배치를 생성하지 못했습니다.'},500);
        if(String(batch.status||'').toUpperCase()!=='PENDING')return json({error:'이미 퇴사 확정이 완료된 카드입니다.'},409);

        const results=await env.DB.batch([
          env.DB.prepare(`INSERT OR IGNORE INTO card_retirement_refunds(batch_id,user_id,breakthrough_level,required_shards,refund_shards,message_id)
            SELECT ?,uc.user_id,${levelExpr},${refundCase},${refundCase},NULL
            FROM user_cards uc
            WHERE uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(batch.id,card.id),
          env.DB.prepare("UPDATE cards SET is_active=0,card_status='RETIRE_PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(card_status,'PUBLIC')!='RETIRED'").bind(card.id)
        ]);
        const snapshotCount=Number((await env.DB.prepare('SELECT COUNT(*) AS cnt FROM card_retirement_refunds WHERE batch_id=?').bind(batch.id).first())?.cnt||0);
        const snapshotRefund=await env.DB.prepare('SELECT COUNT(CASE WHEN refund_shards>0 THEN 1 END) AS users,COALESCE(SUM(refund_shards),0) AS shards FROM card_retirement_refunds WHERE batch_id=?').bind(batch.id).first();
        let logWarning='';
        try{await writeAdminLog(env,admin,'CARD_RETIREMENT_QUEUE','CARD',card.id,card,{...summary,batchId:batch.id,snapshotCount})}catch(error){logWarning=String(error?.message||error||'관리자 로그 기록 실패')}
        return json({
          ok:true,batchId:batch.id,snapshotUsers:snapshotCount,
          refundUsers:Number(snapshotRefund?.users||0),totalRefundShards:Number(snapshotRefund?.shards||0),
          summary:{...summary,status:'RETIRE_PENDING'},logWarning
        });
      }

      if(action==='FINALIZE'){
        const batch=await env.DB.prepare('SELECT * FROM card_retirement_batches WHERE card_id=?').bind(card.id).first();
        if(!batch)return json({error:'먼저 삭제 대기 처리를 진행하세요.'},409);
        if(String(batch.status||'').toUpperCase()!=='PENDING')return json({error:'이미 퇴사 확정이 완료된 카드입니다.'},409);
        const statements=[
          env.DB.prepare(`INSERT OR IGNORE INTO card_retirement_refunds(batch_id,user_id,breakthrough_level,required_shards,refund_shards,message_id)
            SELECT ?,uc.user_id,${levelExpr},${refundCase},${refundCase},NULL
            FROM user_cards uc
            WHERE uc.card_id=? AND COALESCE(uc.quantity,0)>0
            AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(batch.id,card.id,batch.id),
          env.DB.prepare(`UPDATE users SET card_shards=card_shards+COALESCE((SELECT rr.refund_shards FROM card_retirement_refunds rr WHERE rr.batch_id=? AND rr.user_id=users.id AND rr.message_id IS NULL),0)
            WHERE id IN (SELECT user_id FROM card_retirement_refunds WHERE batch_id=? AND refund_shards>0 AND message_id IS NULL)
            AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(batch.id,batch.id,batch.id),
          env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id)
            SELECT rr.user_id,rr.refund_shards,u.card_shards,'CARD_RETIREMENT_REFUND',?
            FROM card_retirement_refunds rr JOIN users u ON u.id=rr.user_id
            WHERE rr.batch_id=? AND rr.refund_shards>0 AND rr.message_id IS NULL
            AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(String(card.id),batch.id,batch.id)
        ];
        let ticketGrantResultIndex=-1;
        if(rerollTicket){
          const ticketReferenceId=String(card.id);
          const missingGrantFilter=`NOT EXISTS (
            SELECT 1 FROM inventory_logs il
            WHERE il.user_id=rr.user_id
              AND il.item_code=?
              AND il.reason='CARD_RETIREMENT_REROLL'
              AND il.reference_type='CARD_RETIREMENT'
              AND il.reference_id=?
          )`;
          const ticketInsertIndex=statements.length;
          statements.push(
            env.DB.prepare(`INSERT OR IGNORE INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
              SELECT rr.user_id,?,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
              FROM card_retirement_refunds rr
              WHERE rr.batch_id=? AND ${missingGrantFilter}
              AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(rerollTicket.code,batch.id,rerollTicket.code,ticketReferenceId,batch.id),
            env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity+1,unseen_quantity=unseen_quantity+1,updated_at=CURRENT_TIMESTAMP
              WHERE item_code=? AND user_id IN (
                SELECT rr.user_id FROM card_retirement_refunds rr
                WHERE rr.batch_id=? AND ${missingGrantFilter}
              )
              AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(rerollTicket.code,batch.id,rerollTicket.code,ticketReferenceId,batch.id),
            env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
              SELECT rr.user_id,?,1,ui.quantity,'CARD_RETIREMENT_REROLL','CARD_RETIREMENT',?,?,CURRENT_TIMESTAMP
              FROM card_retirement_refunds rr JOIN cnine_user_inventory ui ON ui.user_id=rr.user_id AND ui.item_code=?
              WHERE rr.batch_id=? AND ${missingGrantFilter}
              AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')`).bind(rerollTicket.code,ticketReferenceId,admin.id,rerollTicket.code,batch.id,rerollTicket.code,ticketReferenceId,batch.id)
          );
          ticketGrantResultIndex=ticketInsertIndex+1;
        }
        statements.push(
          env.DB.prepare("UPDATE cards SET is_active=0,card_status='RETIRED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS (SELECT 1 FROM card_retirement_batches WHERE id=? AND status='PENDING')").bind(card.id,batch.id),
          env.DB.prepare("UPDATE card_retirement_batches SET status='FINALIZED',finalized_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(batch.id)
        );
        const results=await env.DB.batch(statements),finalized=results[results.length-1];
        if(!finalized?.meta?.changes)return json({error:'이미 퇴사 확정이 완료됐거나 처리 상태가 변경되었습니다.'},409);
        const settlement=await env.DB.prepare(`SELECT
          COUNT(*) AS ownedUsers,
          COUNT(CASE WHEN refund_shards>0 THEN 1 END) AS refundUsers,
          COALESCE(SUM(refund_shards),0) AS refundShards,
          COUNT(CASE WHEN refund_shards>0 AND message_id IS NULL THEN 1 END) AS directRefundUsers,
          COALESCE(SUM(CASE WHEN message_id IS NULL THEN refund_shards ELSE 0 END),0) AS directRefundShards,
          COUNT(CASE WHEN refund_shards>0 AND message_id IS NOT NULL THEN 1 END) AS legacyMessageRefundUsers,
          COALESCE(SUM(CASE WHEN message_id IS NOT NULL THEN refund_shards ELSE 0 END),0) AS legacyMessageRefundShards
          FROM card_retirement_refunds WHERE batch_id=?`).bind(batch.id).first();
        const ticketGrantedNow=rerollTicket&&ticketGrantResultIndex>=0?Number(results[ticketGrantResultIndex]?.meta?.changes||0):0;
        const ticketSettlement=rerollTicket?await env.DB.prepare(`SELECT COUNT(DISTINCT il.user_id) AS cnt
          FROM inventory_logs il
          WHERE il.item_code=? AND il.reason='CARD_RETIREMENT_REROLL'
            AND il.reference_type='CARD_RETIREMENT' AND il.reference_id=?
            AND il.user_id IN (SELECT user_id FROM card_retirement_refunds WHERE batch_id=?)`).bind(rerollTicket.code,String(card.id),batch.id).first():null;
        const ticketRecipients=rerollTicket?Number(ticketSettlement?.cnt||0):0;
        let logWarning='';
        try{
          await writeAdminLog(env,admin,'CARD_RETIREMENT_FINALIZE','CARD',card.id,card,{
            status:'RETIRED',batchId:batch.id,refundUsers:Number(settlement?.refundUsers||0),
            refundShards:Number(settlement?.refundShards||0),directRefundUsers:Number(settlement?.directRefundUsers||0),
            directRefundShards:Number(settlement?.directRefundShards||0),legacyMessageRefundUsers:Number(settlement?.legacyMessageRefundUsers||0),
            legacyMessageRefundShards:Number(settlement?.legacyMessageRefundShards||0),
            rerollTicketCode:rerollTicket?.code||null,ticketRecipients,ticketGrantedNow
          });
        }catch(error){logWarning=String(error?.message||error||'관리자 로그 기록 실패')}
        return json({
          ok:true,status:'RETIRED',
          refundUsers:Number(settlement?.refundUsers||0),refundShards:Number(settlement?.refundShards||0),
          directRefundUsers:Number(settlement?.directRefundUsers||0),directRefundShards:Number(settlement?.directRefundShards||0),
          legacyMessageRefundUsers:Number(settlement?.legacyMessageRefundUsers||0),legacyMessageRefundShards:Number(settlement?.legacyMessageRefundShards||0),
          rerollTicketCode:rerollTicket?.code||null,rerollTicketName:rerollTicket?.name||null,
          ticketRecipients,ticketGrantedNow,logWarning
        });
      }
      return json({error:'올바르지 않은 처리입니다.'},400);
    }

    if(path==='admin/card-acquisition-effects'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const gradeKey=grade=>`__GRADE_${grade}__`;
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`SELECT card_id,enabled,media_url AS mediaUrl,audio_url AS audioUrl,skip_allowed AS skipAllowed,duration_ms AS durationMs FROM card_acquisition_effects WHERE card_id IN ('__GRADE_LIMITED__','__GRADE_PRESTIGE__','__GRADE_FUR__')`).all();
        const settings={LIMITED:{enabled:1,mediaUrl:'/assets/effects/L2CARD.mp4',audioUrl:'',skipAllowed:1,durationMs:10000},PRESTIGE:{enabled:0,mediaUrl:'',audioUrl:'',skipAllowed:1,durationMs:8000},FUR:{enabled:0,mediaUrl:'',audioUrl:'',skipAllowed:1,durationMs:8000}};
        for(const row of rows.results||[]){
          const grade=String(row.card_id||'').replace('__GRADE_','').replace('__','');
          if(settings[grade]) settings[grade]={enabled:Number(row.enabled||0),mediaUrl:row.mediaUrl||'',audioUrl:row.audioUrl||'',skipAllowed:Number(row.skipAllowed)!==0?1:0,durationMs:Number(row.durationMs||8000)};
        }
        return json({settings});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request);
        const grade=String(payload.grade||'').toUpperCase();
        if(!['LIMITED','PRESTIGE','FUR'].includes(grade)) return json({error:'LIMITED, PRESTIGE 또는 FUR 등급만 설정할 수 있습니다.'},400);
        const enabled=payload.enabled?1:0;
        const mediaUrl=String(payload.mediaUrl||'').trim().slice(0,500);
        const audioUrl=String(payload.audioUrl||'').trim().slice(0,500);
        const skipAllowed=payload.skipAllowed===false?0:1;
        const durationMs=Math.max(1000,Math.min(30000,Number(payload.durationMs||8000)));
        if(enabled&&!mediaUrl) return json({error:'연출 사용 시 영상 경로가 필요합니다.'},400);
        const key=gradeKey(grade);
        const before=await env.DB.prepare('SELECT * FROM card_acquisition_effects WHERE card_id=?').bind(key).first();
        await env.DB.prepare(`INSERT INTO card_acquisition_effects(card_id,enabled,media_url,audio_url,skip_allowed,duration_ms,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(card_id) DO UPDATE SET enabled=excluded.enabled,media_url=excluded.media_url,audio_url=excluded.audio_url,skip_allowed=excluded.skip_allowed,duration_ms=excluded.duration_ms,updated_at=CURRENT_TIMESTAMP`).bind(key,enabled,mediaUrl,audioUrl,skipAllowed,durationMs).run();
        const setting={grade,enabled,mediaUrl,audioUrl,skipAllowed,durationMs};
        await writeAdminLog(env,admin,'CARD_ACQUISITION_GRADE_FX_UPDATE','CARD_GRADE',grade,before,setting);
        cardAcquisitionGradeFxCache=null;invalidateCatalogCaches();
        return json({ok:true,setting});
      }
      return json({error:'지원하지 않는 요청입니다.'},405);
    }


    if(path==='admin/limited-audit/options'){
      const admin=await requirePermission(request,env,'ADMIN_LOG');if(!admin)return json({error:'감사 기록 조회 권한이 없습니다.'},403);
      const params=new URL(request.url).searchParams,type=String(params.get('type')||'cards').toLowerCase(),q=String(params.get('q')||'').trim().slice(0,60);
      if(type==='users'){
        if(q.length<1)return json({users:[]});
        const like=`%${q}%`,rows=await env.DB.prepare(`SELECT id,nickname,role,status FROM users WHERE nickname LIKE ? OR CAST(id AS TEXT)=? ORDER BY CASE WHEN nickname=? THEN 0 ELSE 1 END,nickname LIMIT 30`).bind(like,q,q).all();
        return json({users:rows.results});
      }
      const like=`%${q}%`,rows=await env.DB.prepare(`SELECT c.id,c.title,m.name,c.is_active AS isActive,c.card_status AS cardStatus,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,c.image_url AS image
        FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity)='LIMITED' AND (?='' OR c.title LIKE ? OR m.name LIKE ? OR c.id LIKE ?)
        ORDER BY c.is_active DESC,m.sort_order,c.title LIMIT 100`).bind(q,like,like,like).all();
      return json({cards:rows.results.map(x=>({...x,remaining:Math.max(0,Number(x.limitedTotal||0)-Number(x.issuedCount||0))}))});
    }
    if(path==='admin/limited-audit/preview'){
      const admin=await requirePermission(request,env,'ADMIN_LOG');if(!admin)return json({error:'감사 기록 조회 권한이 없습니다.'},403);
      const params=new URL(request.url).searchParams,userId=Math.floor(Number(params.get('userId')||0)),cardId=String(params.get('cardId')||'').trim();
      if(!userId||!cardId)return json({error:'유저와 리미티드 카드를 선택하세요.'},400);
      const row=await env.DB.prepare(`SELECT u.id AS userId,u.nickname,u.role,u.status,c.id AS cardId,c.title,m.name,c.is_active AS isActive,c.card_status AS cardStatus,
        c.limited_total AS limitedTotal,c.issued_count AS issuedCount,COALESCE(uc.quantity,0) AS ownedQuantity,COALESCE(uc.breakthrough_level,0) AS breakthroughLevel
        FROM users u CROSS JOIN cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN user_cards uc ON uc.user_id=u.id AND uc.card_id=c.id
        WHERE u.id=? AND c.id=? AND UPPER(c.rarity)='LIMITED'`).bind(userId,cardId).first();
      if(!row)return json({error:'유저 또는 리미티드 카드를 찾을 수 없습니다.'},404);
      return json({preview:{...row,remaining:Math.max(0,Number(row.limitedTotal||0)-Number(row.issuedCount||0))},role:admin.role});
    }
    if(path==='admin/limited-audit'){
      const admin=await requirePermission(request,env,'ADMIN_LOG');if(!admin)return json({error:'감사 기록 조회 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const params=new URL(request.url).searchParams,q=String(params.get('q')||'').trim().slice(0,80),status=String(params.get('status')||'').trim().slice(0,40),source=String(params.get('source')||'').trim().slice(0,40),from=String(params.get('from')||'').trim().slice(0,30),to=String(params.get('to')||'').trim().slice(0,30),limit=Math.max(10,Math.min(200,Math.floor(Number(params.get('limit')||80))));
        const where=[],bind=[];
        if(q){where.push(`(a.user_nickname LIKE ? OR a.card_title LIKE ? OR a.card_id LIKE ? OR a.request_id LIKE ? OR a.draw_group_id LIKE ? OR a.source_id LIKE ? OR CAST(a.user_id AS TEXT)=?)`);const like=`%${q}%`;bind.push(like,like,like,like,like,like,q)}
        if(status){where.push('a.status=?');bind.push(status)}
        if(source){where.push('a.source_type=?');bind.push(source)}
        if(from){where.push('a.created_at>=?');bind.push(from.replace('T',' '))}
        if(to){where.push("a.created_at<=datetime(?, '+1 day')");bind.push(to.replace('T',' '))}
        const filter=where.length?'WHERE '+where.join(' AND '):'';
        const rows=await env.DB.prepare(`SELECT a.*,COALESCE(u.nickname,a.user_nickname) AS currentNickname,COALESCE(c.title,a.card_title) AS currentCardTitle,
          COALESCE(uc.quantity,0) AS currentOwnedQuantity,c.limited_total AS currentLimitedTotal,c.issued_count AS currentIssuedCount,
          COALESCE(ad.nickname,'') AS adminNickname
          FROM limited_acquisition_audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN cards_effective_v1210 c ON c.id=a.card_id
          LEFT JOIN user_cards uc ON uc.user_id=a.user_id AND uc.card_id=a.card_id LEFT JOIN users ad ON ad.id=a.admin_id
          ${filter} ORDER BY a.id DESC LIMIT ?`).bind(...bind,limit).all();
        const statsRows=await env.DB.prepare(`SELECT status,COUNT(*) AS count FROM limited_acquisition_audit GROUP BY status`).all();
        const stats={total:0,completed:0,failed:0,manual:0};
        for(const row of statsRows.results){const n=Number(row.count||0);stats.total+=n;if(['COMPLETED','LEGACY_CONFIRMED','COMPLETED_WITH_WARNING','MANUAL_COMPLETED'].includes(row.status))stats.completed+=n;if(String(row.status).includes('FAILED')||row.status==='SOLD_OUT_REPLACED')stats.failed+=n}
        const manualRow=await env.DB.prepare("SELECT COUNT(*) AS count FROM limited_acquisition_audit WHERE source_type='ADMIN_MANUAL'").first();stats.manual=Number(manualRow?.count||0);
        return json({logs:rows.results,stats,role:admin.role});
      }
      if(request.method==='POST'){
        if(String(admin.role||'').toUpperCase()!=='OWNER')return json({error:'리미티드 수동 지급은 OWNER 전용입니다.'},403);
        const body=await readBody(request),action=String(body.action||'').toUpperCase();
        if(action!=='MANUAL_GRANT')return json({error:'지원하지 않는 작업입니다.'},400);
        const requestId=String(body.requestId||crypto.randomUUID()).trim().slice(0,120),userId=Math.floor(Number(body.userId||0)),cardId=String(body.cardId||'').trim(),grantMode=String(body.grantMode||'RECOVERY').toUpperCase(),reason=String(body.reason||'').trim().slice(0,300),evidence=String(body.evidenceNote||'').trim().slice(0,500),referenceRequestId=String(body.referenceRequestId||'').trim().slice(0,120),allowDuplicate=body.allowDuplicate===true;
        if(!requestId||!userId||!cardId)return json({error:'유저와 리미티드 카드를 선택하세요.'},400);
        if(!['RECOVERY','ISSUE'].includes(grantMode))return json({error:'지급 유형이 올바르지 않습니다.'},400);
        if(reason.length<3)return json({error:'수동 지급 사유를 3자 이상 입력하세요.'},400);
        const prior=await env.DB.prepare('SELECT status,response_json,error_message FROM limited_manual_grant_receipts WHERE request_id=?').bind(requestId).first();
        if(prior?.status==='COMPLETED'&&prior.response_json){try{return json(JSON.parse(prior.response_json))}catch{}}
        if(prior?.status==='PENDING')return json({error:'같은 수동 지급 요청을 처리 중입니다.'},409);
        if(prior?.status==='FAILED')await env.DB.prepare('DELETE FROM limited_manual_grant_receipts WHERE request_id=?').bind(requestId).run();
        const receipt=await env.DB.prepare("INSERT OR IGNORE INTO limited_manual_grant_receipts(request_id,admin_id,user_id,card_id,grant_mode,status) VALUES(?,?,?,?,?,'PENDING')").bind(requestId,admin.id,userId,cardId,grantMode).run();
        if(!receipt.meta.changes)return json({error:'같은 수동 지급 요청이 이미 존재합니다.'},409);
        let stockReserved=false,stockBefore=null;
        try{
          const target=await env.DB.prepare(`SELECT u.id AS userId,u.nickname,u.status,c.id AS cardId,c.title,c.rarity,c.is_active AS isActive,c.card_status AS cardStatus,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,COALESCE(uc.quantity,0) AS ownedQuantity
            FROM users u CROSS JOIN cards_effective_v1210 c LEFT JOIN user_cards uc ON uc.user_id=u.id AND uc.card_id=c.id WHERE u.id=? AND c.id=?`).bind(userId,cardId).first();
          if(!target||String(target.rarity||'').toUpperCase()!=='LIMITED')throw new Error('유저 또는 리미티드 카드를 찾을 수 없습니다.');
          const quantityBefore=Math.max(0,Number(target.ownedQuantity||0));
          if(quantityBefore>0&&!allowDuplicate)throw new Error(`이미 해당 카드를 ${quantityBefore}장 보유 중입니다. 중복 지급 확인을 켜야 지급할 수 있습니다.`);
          stockBefore=Math.max(0,Number(target.issuedCount||0));
          if(grantMode==='ISSUE'){
            const reserved=await env.DB.prepare("UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' AND limited_total IS NOT NULL AND issued_count<limited_total").bind(cardId).run();
            if(!reserved.meta.changes)throw new Error('한정 재고가 모두 소진되어 신규 지급할 수 없습니다. 누락 복구라면 재고 미차감 유형을 선택하세요.');
            stockReserved=true;
          }
          const stockAfter=stockBefore+(stockReserved?1:0),quantityAfter=quantityBefore+1,eventKey=`manual:${requestId}`,sourceId=referenceRequestId||(grantMode==='RECOVERY'?'MISSING_RESTORE':'NEW_ISSUE');
          const response={ok:true,requestId,userId,nickname:target.nickname,cardId,title:target.title,grantMode,quantityBefore,quantityAfter,stockBefore,stockAfter,remaining:Math.max(0,Number(target.limitedTotal||0)-stockAfter),reason};
          const adminAfter={userId,nickname:target.nickname,cardId,title:target.title,grantMode,quantityBefore,quantityAfter,stockBefore,stockAfter,reason,evidence,requestId,referenceRequestId};
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(?,?,1,0)
              ON CONFLICT(user_id,card_id) DO UPDATE SET breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN 0 ELSE user_cards.breakthrough_level END,quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(userId,cardId),
            env.DB.prepare("INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?, 'LIMITED',0,?)").bind(requestId,userId,grantMode==='RECOVERY'?'ADMIN_LIMITED_RESTORE':'ADMIN_LIMITED_ISSUE',cardId,quantityBefore===0?1:0),
            env.DB.prepare(`INSERT INTO limited_acquisition_audit(event_key,request_id,draw_group_id,source_type,source_id,user_id,user_nickname,card_id,card_title,pack_id,status,coin_cost,stock_before,stock_after,quantity_before,quantity_after,is_duplicate,stock_reserved,card_granted,admin_id,admin_reason,evidence_note,created_at,updated_at,completed_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(eventKey,requestId,requestId,'ADMIN_MANUAL',sourceId,userId,target.nickname,cardId,target.title,grantMode==='RECOVERY'?'ADMIN_LIMITED_RESTORE':'ADMIN_LIMITED_ISSUE','MANUAL_COMPLETED',0,stockBefore,stockAfter,quantityBefore,quantityAfter,quantityBefore>0?1:0,stockReserved?1:0,1,admin.id,reason,evidence||null),
            env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'LIMITED_MANUAL_GRANT','USER_CARD',`${userId}:${cardId}`,JSON.stringify({quantity:quantityBefore,stock:stockBefore}),JSON.stringify(adminAfter)),
            env.DB.prepare("UPDATE limited_manual_grant_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(JSON.stringify(response),requestId)
          ]);
          recentHighGradeCache=null;
          return json(response);
        }catch(error){
          if(stockReserved)await env.DB.prepare('UPDATE cards SET issued_count=CASE WHEN issued_count>0 THEN issued_count-1 ELSE 0 END WHERE id=?').bind(cardId).run();
          const message=String(error?.message||'리미티드 수동 지급에 실패했습니다.').slice(0,500);
          const snapshots=await env.DB.prepare(`SELECT COALESCE(u.nickname,'') AS nickname,COALESCE(c.title,'') AS title,COALESCE(c.issued_count,0) AS issuedCount,COALESCE(uc.quantity,0) AS ownedQuantity
            FROM (SELECT ? AS user_id,? AS card_id) x LEFT JOIN users u ON u.id=x.user_id LEFT JOIN cards_effective_v1210 c ON c.id=x.card_id LEFT JOIN user_cards uc ON uc.user_id=x.user_id AND uc.card_id=x.card_id`).bind(userId,cardId).first();
          const failedKey=`manual-failed:${requestId}`;
          await beginLimitedAcquisitionAudit(env,{eventKey:failedKey,requestId,drawGroupId:requestId,sourceType:'ADMIN_MANUAL',sourceId:referenceRequestId||(grantMode==='RECOVERY'?'MISSING_RESTORE':'NEW_ISSUE'),userId,userNickname:snapshots?.nickname||'',cardId,cardTitle:snapshots?.title||'',packId:grantMode==='RECOVERY'?'ADMIN_LIMITED_RESTORE':'ADMIN_LIMITED_ISSUE',status:'MANUAL_FAILED',stockBefore:stockBefore??Number(snapshots?.issuedCount||0),stockAfter:stockBefore??Number(snapshots?.issuedCount||0),quantityBefore:Number(snapshots?.ownedQuantity||0),quantityAfter:Number(snapshots?.ownedQuantity||0),isDuplicate:Number(snapshots?.ownedQuantity||0)>0,stockReserved:false,cardGranted:false,adminId:admin.id,adminReason:reason,evidenceNote:evidence,errorMessage:message});
          await finishLimitedAcquisitionAudit(env,failedKey,{status:'MANUAL_FAILED',stockReserved:false,cardGranted:false,errorMessage:message});
          await env.DB.prepare("UPDATE limited_manual_grant_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(message,requestId).run();
          await writeAdminLog(env,admin,'LIMITED_MANUAL_GRANT_FAILED','USER_CARD',`${userId}:${cardId}`,null,{requestId,referenceRequestId,grantMode,reason,error:message});
          return json({error:message},409);
        }
      }
      return json({error:'지원하지 않는 요청 방식입니다.'},405);
    }
    if(path==='admin/limited-stock'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method!=='GET') return json({error:'지원하지 않는 요청입니다.'},405);
      const rows=await env.DB.prepare(`SELECT
          c.id,
          c.title,
          c.member_id AS memberId,
          m.name AS memberName,
          c.image_url AS image,
          c.focus_x AS focusX,
          c.focus_y AS focusY,
          c.is_active AS isActive,
          COALESCE(c.card_status,'PUBLIC') AS cardStatus,
          COALESCE(c.limited_total,0) AS limitedTotal,
          COALESCE(c.issued_count,0) AS issuedCount,
          COALESCE(SUM(CASE WHEN COALESCE(uc.quantity,0)>0 THEN uc.quantity ELSE 0 END),0) AS heldCount,
          COUNT(DISTINCT CASE WHEN COALESCE(uc.quantity,0)>0 THEN uc.user_id END) AS ownerCount
        FROM cards_effective_v1210 c
        JOIN members m ON m.id=c.member_id
        LEFT JOIN user_cards uc ON uc.card_id=c.id
        WHERE UPPER(c.rarity)='LIMITED' AND c.limited_total IS NOT NULL
        GROUP BY c.id,c.title,c.member_id,m.name,c.image_url,c.focus_x,c.focus_y,c.is_active,c.card_status,c.limited_total,c.issued_count
        ORDER BY m.sort_order,c.id`).all();
      const cards=(rows.results||[]).map(row=>{
        const limitedTotal=Math.max(0,Number(row.limitedTotal||0));
        const issuedCount=Math.max(0,Number(row.issuedCount||0));
        const remainingCount=Math.max(0,limitedTotal-issuedCount);
        return {
          ...row,
          isActive:Boolean(row.isActive),
          limitedTotal,
          issuedCount,
          remainingCount,
          heldCount:Math.max(0,Number(row.heldCount||0)),
          ownerCount:Math.max(0,Number(row.ownerCount||0)),
          soldOut:limitedTotal>0&&remainingCount<=0
        };
      });
      const summary=cards.reduce((acc,card)=>{
        acc.cardTypes+=1;
        acc.totalLimit+=card.limitedTotal;
        acc.totalIssued+=card.issuedCount;
        acc.totalRemaining+=card.remainingCount;
        acc.totalHeld+=card.heldCount;
        if(card.soldOut) acc.soldOutTypes+=1;
        if(card.isActive&&card.cardStatus==='PUBLIC'&&!card.soldOut) acc.availableTypes+=1;
        return acc;
      },{cardTypes:0,totalLimit:0,totalIssued:0,totalRemaining:0,totalHeld:0,soldOutTypes:0,availableTypes:0});
      return json({cards,summary,generatedAt:new Date().toISOString()});
    }

    if(path==='admin/cards'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const cardView=`SELECT c.id,c.title,c.member_id AS memberId,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.is_active,c.card_status AS cardStatus,c.batch_name AS batchName,c.batch_date AS batchDate,c.draw_weight AS drawWeight,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,c.power_type AS powerType,c.base_power AS basePower,CASE WHEN fx.card_id IS NULL THEN 0 ELSE 1 END AS acquisitionFxConfigured,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN 1 ELSE COALESCE(fx.enabled,0) END AS acquisitionFxEnabled,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN '/assets/effects/L2CARD.mp4' ELSE COALESCE(fx.media_url,'') END AS acquisitionMediaUrl,COALESCE(fx.audio_url,'') AS acquisitionAudioUrl,COALESCE(fx.skip_allowed,1) AS acquisitionSkipAllowed,CASE WHEN fx.card_id IS NULL AND UPPER(c.rarity)='LIMITED' THEN 10000 ELSE COALESCE(fx.duration_ms,8000) END AS acquisitionDurationMs
        FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_acquisition_effects fx ON fx.card_id=('__GRADE_' || UPPER(c.rarity) || '__')`;
      const normalizeCard=async payload=>{
        const title=String(payload.title||'').trim().slice(0,80);
        const grade=String(payload.grade||'C').toUpperCase();
        const image=String(payload.image||'').trim().replace(/\\/g,'/').slice(0,500);
        const memberId=Number(payload.memberId);
        const focusX=Math.max(0,Math.min(100,Number(payload.focusX??50)));
        const focusY=Math.max(0,Math.min(100,Number(payload.focusY??50)));
        const requestedStatus=String(payload.cardStatus||'').toUpperCase();
        const cardStatus=['PENDING','PUBLIC','INACTIVE'].includes(requestedStatus)?requestedStatus:(payload.isActive===false?'INACTIVE':'PUBLIC');
        const isActive=cardStatus==='PUBLIC'?1:0;
        const batchName=String(payload.batchName||'').trim().slice(0,100)||null;
        const batchDate=String(payload.batchDate||'').trim().slice(0,10)||null;
        let drawWeight=Math.max(0,Math.min(100000,Number(payload.drawWeight??1)||0));
        if(grade==='PRESTIGE') drawWeight=0;
        let limitedTotal=null;
        const issuedCount=Math.max(0,Math.floor(Number(payload.issuedCount??0)||0));
        if(!title) throw new Error('카드명을 입력하세요.');
        if(!image) throw new Error('이미지 경로 또는 URL을 입력하세요.');
        if(!Number.isInteger(memberId)||memberId<1) throw new Error('멤버를 선택하세요.');
        if(!RARITIES.includes(grade)) throw new Error('올바르지 않은 카드 등급입니다.');
        const member=await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(memberId).first();
        if(!member) throw new Error('존재하지 않는 멤버입니다.');
        const supportsPowerType=['SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH'].includes(grade);
        let powerType=payload.powerType===null||payload.powerType===undefined||payload.powerType===''?null:String(payload.powerType).toUpperCase();
        let basePower=payload.basePower===null||payload.basePower===undefined||payload.basePower===''?null:Math.max(0,Math.floor(Number(payload.basePower)||0));
        if(!supportsPowerType){powerType=null;basePower=null}
        else if(grade==='PRESTIGE'){
          powerType='CUSTOM';
          basePower=Math.max(1,Math.min(100000000,Math.floor(Number(basePower||3100))));
        }
        else if(['FUR','ZENITH'].includes(grade)){powerType='FIXED';basePower=grade==='ZENITH'?5500:3200}
        else if(powerType!==null){
          if(!['NORMAL','HIGH','TOP'].includes(powerType)) throw new Error('올바르지 않은 전투력 유형입니다.');
          basePower=CARD_POWER_TYPES[grade][powerType];
        }else basePower=null;
        const storageGrade=['PRESTIGE','ZENITH'].includes(grade)?'FUR':grade;
        const rarityOverride=['PRESTIGE','ZENITH'].includes(grade)?grade:null;
        return {title,grade,storageGrade,rarityOverride,image,memberId,focusX,focusY,isActive,cardStatus,batchName,batchDate,drawWeight,limitedTotal,issuedCount,powerType,basePower};
      };
      const nextCardId=()=>`CN-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
      const normalizeNewMemberDraft=raw=>{
        if(!raw||typeof raw!=='object') return null;
        const name=String(raw.name||'').replace(/\s+/g,' ').trim().slice(0,40);
        const suppliedSlug=String(raw.slug||'').trim().toLowerCase().slice(0,60);
        if(!name) throw new Error('신규 멤버명을 입력하세요.');
        if(suppliedSlug&&!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(suppliedSlug)) throw new Error('멤버 코드는 영문 소문자·숫자·하이픈·밑줄만 사용할 수 있습니다.');
        return {name,suppliedSlug};
      };
      const createMemberForCard=async raw=>{
        const draft=normalizeNewMemberDraft(raw);
        if(!draft) return null;
        const duplicateName=await env.DB.prepare('SELECT id,name,is_active FROM members WHERE name=? COLLATE NOCASE LIMIT 1').bind(draft.name).first();
        if(duplicateName) throw new Error(`이미 등록된 멤버명입니다: ${duplicateName.name}`);
        let slug=draft.suppliedSlug;
        if(slug){
          const duplicateSlug=await env.DB.prepare('SELECT id FROM members WHERE slug=? COLLATE NOCASE LIMIT 1').bind(slug).first();
          if(duplicateSlug) throw new Error('이미 사용 중인 멤버 코드입니다.');
        }else{
          for(let attempt=0;attempt<8;attempt++){
            const suffix=crypto.randomUUID().replaceAll('-','').slice(0,10).toLowerCase();
            const candidate=`member-${suffix}`;
            const duplicate=await env.DB.prepare('SELECT id FROM members WHERE slug=? LIMIT 1').bind(candidate).first();
            if(!duplicate){slug=candidate;break}
          }
          if(!slug) throw new Error('멤버 코드 자동 생성에 실패했습니다. 다시 시도해주세요.');
        }
        const orderRow=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0)+10 AS nextOrder FROM members').first();
        const sortOrder=Math.max(0,Math.floor(Number(orderRow?.nextOrder||10)));
        try{
          const created=await env.DB.prepare('INSERT INTO members(name,slug,profile_image,is_active,sort_order) VALUES(?,?,NULL,1,?)').bind(draft.name,slug,sortOrder).run();
          const memberId=Number(created.meta?.last_row_id||0);
          if(!memberId) throw new Error('신규 멤버 ID를 확인하지 못했습니다.');
          return {id:memberId,name:draft.name,slug,sortOrder,isActive:true};
        }catch(error){
          const message=String(error?.message||'');
          if(/UNIQUE|constraint/i.test(message)) throw new Error('동일한 멤버명 또는 멤버 코드가 이미 등록되어 있습니다.');
          throw error;
        }
      };
      const removeUnusedCreatedMember=async member=>{
        if(!member?.id) return;
        try{await env.DB.prepare('DELETE FROM members WHERE id=? AND NOT EXISTS(SELECT 1 FROM cards WHERE member_id=?)').bind(member.id,member.id).run()}catch{}
      };
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`${cardView} ORDER BY m.sort_order,c.id`).all();
        const members=await env.DB.prepare('SELECT id,name,slug FROM members WHERE is_active=1 ORDER BY sort_order,id').all();
        return json({cards:rows.results,members:members.results,role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        if(Array.isArray(payload.cards)){
          if(payload.cards.length<1||payload.cards.length>100) return json({error:'일괄 등록은 한 번에 1~100장까지 가능합니다.'},400);
          const created=[];
          for(const raw of payload.cards){
            const card=await normalizeCard(raw);
            const id=nextCardId();
            await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
              .bind(id,card.memberId,card.title,card.storageGrade,card.rarityOverride,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
            const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
            created.push(after);
          }
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
            .bind(admin.id,'CARD_BULK_CREATE','CARD',String(created.length),JSON.stringify(created.map(x=>x.id))).run();
          return json({ok:true,cards:created},201);
        }
        if(payload.cloneFrom){
          const source=await env.DB.prepare('SELECT * FROM cards_effective_v1210 WHERE id=?').bind(payload.cloneFrom).first();
          if(!source) return json({error:'복제할 카드가 없습니다.'},404);
          const card=await normalizeCard({
            title:payload.title||`${source.title} 복사본`,grade:payload.grade||source.rarity,image:payload.image||source.image_url,
            memberId:payload.memberId||source.member_id,focusX:payload.focusX??source.focus_x,focusY:payload.focusY??source.focus_y,isActive:payload.isActive??Boolean(source.is_active),cardStatus:payload.cardStatus||source.card_status,batchName:payload.batchName??source.batch_name,batchDate:payload.batchDate??source.batch_date,drawWeight:payload.drawWeight??source.draw_weight,limitedTotal:payload.limitedTotal??source.limited_total,issuedCount:0,powerType:payload.powerType===undefined?source.power_type:payload.powerType,basePower:payload.basePower===undefined?source.base_power:payload.basePower
          });
          const id=nextCardId();
          await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(id,card.memberId,card.title,card.storageGrade,card.rarityOverride,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
          const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
            .bind(admin.id,'CARD_CLONE','CARD',id,JSON.stringify({source:payload.cloneFrom}),JSON.stringify(after)).run();
          return json({ok:true,card:after},201);
        }
        let createdMember=null,createdCardId=null;
        try{
          if(payload.newMember){
            createdMember=await createMemberForCard(payload.newMember);
            payload.memberId=createdMember.id;
          }
          const card=await normalizeCard(payload);
          const id=nextCardId();
          await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(id,card.memberId,card.title,card.storageGrade,card.rarityOverride,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
          createdCardId=id;
          const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
          const logs=[env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)').bind(admin.id,'CARD_CREATE','CARD',id,JSON.stringify(after))];
          if(createdMember) logs.unshift(env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)').bind(admin.id,'MEMBER_CREATE','MEMBER',String(createdMember.id),JSON.stringify({...createdMember,source:'CARD_CREATE_DIALOG'})));
          await env.DB.batch(logs);
          return json({ok:true,card:after,memberCreated:Boolean(createdMember),member:createdMember},201);
        }catch(error){
          if(createdMember&&!createdCardId) await removeUnusedCreatedMember(createdMember);
          throw error;
        }
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request);
        if(Array.isArray(payload.ids)){
          const ids=[...new Set(payload.ids.map(x=>String(x||'').trim()).filter(Boolean))];
          const status=String(payload.status||'').toUpperCase();
          if(!ids.length) return json({error:'처리할 카드를 선택하세요.'},400);
          if(ids.length>200) return json({error:'한 번에 최대 200장까지 처리할 수 있습니다.'},400);
          if(!['PUBLIC','INACTIVE','PENDING','RETIRE_PENDING','RETIRED'].includes(status)) return json({error:'올바르지 않은 카드 상태입니다.'},400);
          const active=status==='PUBLIC'?1:0;
          const placeholders=ids.map(()=>'?').join(',');
          await env.DB.prepare(`UPDATE cards SET card_status=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).bind(status,active,...ids).run();
          drawContextCache.clear();invalidateCatalogCaches();
          await writeAdminLog(env,admin,'CARD_BULK_STATUS','CARD',ids.join(','),null,{status,count:ids.length});
          return json({ok:true,status,updatedIds:ids});
        }
        const before=await env.DB.prepare('SELECT * FROM cards_effective_v1210 WHERE id=?').bind(payload.id).first();
        if(!before) return json({error:'카드가 없습니다.'},404);
        // 일반 카드 정보 수정은 기존 공개 상태를 절대 변경하지 않는다.
        // CMS의 '게임에 노출' 체크박스가 실제로 변경된 요청만 공개/비공개 상태를 갱신한다.
        const updateVisibility=payload.updateVisibility===true;
        const beforeActive=Number(before.is_active)===1;
        const beforeStatus=String(before.card_status||(beforeActive?'PUBLIC':'INACTIVE')).toUpperCase();
        const card=await normalizeCard({
          title:payload.title??before.title,grade:payload.grade??before.rarity,image:payload.image??before.image_url,
          memberId:payload.memberId??before.member_id,focusX:payload.focusX??before.focus_x,focusY:payload.focusY??before.focus_y,isActive:updateVisibility?(payload.isActive??Boolean(before.is_active)):Boolean(before.is_active),cardStatus:updateVisibility?(payload.cardStatus||before.card_status):before.card_status,batchName:payload.batchName===undefined?before.batch_name:payload.batchName,batchDate:payload.batchDate===undefined?before.batch_date:payload.batchDate,drawWeight:payload.drawWeight??before.draw_weight,limitedTotal:payload.limitedTotal===undefined?before.limited_total:payload.limitedTotal,issuedCount:before.issued_count,powerType:payload.powerType===undefined?before.power_type:payload.powerType,basePower:payload.basePower===undefined?before.base_power:payload.basePower
        });
        await env.DB.prepare('UPDATE cards SET member_id=?,title=?,rarity=?,rarity_override=?,image_url=?,focus_x=?,focus_y=?,is_active=?,card_status=?,batch_name=?,batch_date=?,draw_weight=?,limited_total=?,power_type=?,base_power=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(card.memberId,card.title,card.storageGrade,card.rarityOverride,card.image,card.focusX,card.focusY,card.isActive,card.cardStatus,card.batchName,card.batchDate,card.drawWeight,card.limitedTotal,card.powerType,card.basePower,payload.id).run();
        drawContextCache.clear();invalidateCatalogCaches();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(payload.id).first();
        const visibilityChanged=updateVisibility&&(beforeActive!==Boolean(card.isActive)||beforeStatus!==String(card.cardStatus).toUpperCase());
        const actionType=visibilityChanged?(card.isActive?'CARD_SHOW':'CARD_HIDE'):'CARD_EDIT';
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
          .bind(admin.id,actionType,'CARD',payload.id,JSON.stringify(before),JSON.stringify(after)).run();
        return json({ok:true,card:after,visibilityChanged});
      }
      if(request.method==='DELETE'){
        if(admin.role!=='OWNER') return json({error:'완전 삭제는 OWNER만 가능합니다.'},403);
        const payload=await readBody(request);
        const ids=[...new Set((Array.isArray(payload.ids)?payload.ids:[payload.id]).map(x=>String(x||'').trim()).filter(Boolean))];
        if(ids.length<1) return json({error:'삭제할 카드를 선택하세요.'},400);
        if(ids.length>200) return json({error:'한 번에 최대 200장까지 삭제할 수 있습니다.'},400);
        const placeholders=ids.map(()=>'?').join(',');
        const found=await env.DB.prepare(`SELECT * FROM cards_effective_v1210 WHERE id IN (${placeholders})`).bind(...ids).all();
        const existingIds=found.results.map(x=>x.id);
        if(!existingIds.length) return json({error:'삭제할 카드가 없습니다.'},404);
        const statements=[];
        for(const id of existingIds){
          statements.push(env.DB.prepare('DELETE FROM user_cards WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM draw_logs WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM cards WHERE id=?').bind(id));
        }
        await env.DB.batch(statements);
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,existingIds.length>1?'CARD_BULK_DELETE':'CARD_DELETE','CARD',existingIds.join(','),JSON.stringify(found.results)).run();
        return json({ok:true,deletedIds:existingIds,deletedId:existingIds.length===1?existingIds[0]:null});
      }
    }
    return json({error:'요청한 기능을 찾을 수 없습니다.'},404);
  }catch(error){
    console.error(error);
    if(isTransientD1Error(error))return json({
      error:'현재 저장 서버가 혼잡합니다. 잠시 후 같은 요청으로 다시 시도해주세요.',
      code:'D1_OVERLOADED',retryable:true,retryAfterMs:15000
    },503);
    return json({error:error.message||'서버 오류가 발생했습니다.'},500);
  }
}

// V1790: D1 읽기 복제(Sessions API).
//
// 세션 객체는 env.DB 와 동일한 prepare/batch 인터페이스를 가지므로,
// 요청 시작 시 한 번 만들어 env.DB 자리에 끼워 넣으면
// 기존 1,400여 개 쿼리를 한 줄도 고치지 않고 전부 복제본 경로를 타게 된다.
// 쓰기는 Sessions API 가 알아서 프라이머리로 보낸다.
//
// 정합성 원칙:
//   - 변경 요청(GET 이 아닌 것)은 'first-primary'.
//     전투 에너지 차감·재화 검사처럼 "읽고 판단해서 쓰는" 흐름이 많아
//     복제 지연이 끼면 이중 지급·이중 차감이 날 수 있다. 안전을 택한다.
//   - 조회 요청은 클라이언트가 돌려준 북마크를 사용한다.
//     북마크는 "최소 이만큼은 최신인 복제본" 을 보장하므로
//     자기가 방금 쓴 결과를 못 보는 일(read-your-writes 위반)이 없다.
//   - 북마크가 없으면 'first-unconstrained' (첫 조회는 아무 복제본이나).
//
// 바인딩/런타임이 withSession 을 지원하지 않으면 기존 env.DB 를 그대로 쓴다.
// V1792: 요청당 D1 사용량 계측.
//
// 지금까지는 "어디가 느린가"를 코드를 읽어 추정할 수밖에 없었다.
// 이제 라우트별로 D1 왕복이 몇 번인지 응답 헤더와 로그에 남긴다.
// 동작은 전혀 바꾸지 않는다 (카운터만 증가).
//
// 구현 주의:
//   - batch() 에 넘기는 statement 는 반드시 "진짜" D1 statement 여야 한다.
//     래퍼를 그대로 넘기면 실패하므로 D1_RAW 심볼로 원본을 꺼내 넘긴다.
//   - 코드베이스가 쓰는 D1 API 는 prepare / batch / withSession 과
//     statement 의 first / all / run 뿐임을 확인했지만,
//     혹시 모를 다른 메서드는 Proxy 가 원본으로 그대로 넘긴다.
const D1_RAW=Symbol('cnineRawD1Statement');
function newD1Stats(){return {queries:0,batches:0,statements:0,ms:0}}
function wrapD1Statement(raw,stats){
  const timed=async run=>{
    const startedAt=Date.now();
    try{return await run()}finally{stats.ms+=Math.max(0,Date.now()-startedAt)}
  };
  return {
    [D1_RAW]:raw,
    bind:(...args)=>wrapD1Statement(raw.bind(...args),stats),
    first:(...args)=>{stats.queries+=1;return timed(()=>raw.first(...args))},
    all:(...args)=>{stats.queries+=1;return timed(()=>raw.all(...args))},
    run:(...args)=>{stats.queries+=1;return timed(()=>raw.run(...args))},
    raw:(...args)=>{stats.queries+=1;return timed(()=>raw.raw(...args))}
  };
}
function instrumentD1(db,stats){
  if(!db||typeof db.prepare!=='function')return db;
  return new Proxy(db,{
    get(target,prop){
      if(prop===D1_RAW)return target;
      if(prop==='prepare')return sql=>wrapD1Statement(target.prepare(sql),stats);
      if(prop==='batch')return statements=>{
        const list=Array.isArray(statements)?statements:[];
        stats.batches+=1;stats.statements+=list.length;
        const startedAt=Date.now();
        return Promise.resolve(target.batch(list.map(statement=>statement&&statement[D1_RAW]?statement[D1_RAW]:statement)))
          .finally(()=>{stats.ms+=Math.max(0,Date.now()-startedAt)});
      };
      const value=Reflect.get(target,prop,target);
      return typeof value==='function'?value.bind(target):value;
    }
  });
}

const D1_BOOKMARK_HEADER='x-cnine-d1-bookmark';
function startD1Session(env,request){
  if(typeof env?.DB?.withSession!=='function')return {db:env?.DB,session:null};
  const readOnly=String(request.method||'GET').toUpperCase()==='GET';
  const bookmark=readOnly?String(request.headers.get(D1_BOOKMARK_HEADER)||'').trim():'';
  const constraint=readOnly?(bookmark||'first-unconstrained'):'first-primary';
  try{
    const session=env.DB.withSession(constraint);
    return {db:session,session};
  }catch(error){
    console.warn('D1 withSession unavailable, falling back to direct binding',error);
    return {db:env.DB,session:null};
  }
}

export async function onRequest(context){
  const startedAt=Date.now(),request=context.request,url=new URL(request.url);
  const actionPath=url.pathname.replace(/^\/api\/?/,'');let mutationLock=null,response;
  // 이 요청 동안에는 env.DB 가 곧 세션이다. context 도 같이 갈아끼워
  // handleRequest 내부의 모든 env.DB 사용처가 자동으로 세션을 쓰게 한다.
  const {db:sessionDb,session:d1Session}=startD1Session(context.env,request);
  // V1792: 세션 위에 계측 래퍼를 한 겹 더 씌운다. getBookmark 는 원본 세션에서 읽는다.
  const d1Stats=newD1Stats();
  const instrumentedDb=instrumentD1(sessionDb||context.env?.DB,d1Stats);
  const env=instrumentedDb?{...context.env,DB:instrumentedDb}:context.env;
  context={...context,env,waitUntil:typeof context.waitUntil==='function'?context.waitUntil.bind(context):undefined};
  if(serializedGameAction(actionPath,request.method)){
    // V1784: 세션 조회를 점검 게이트 조회와 같은 배치로 먼저 태워, 이후 authenticate()와
    // handleRequest()의 점검 게이트가 추가 D1 왕복 없이 캐시된 결과를 쓰게 한다.
    try{await requestMaintenanceMode(request,context.env)}catch(_){}
    const user=await authenticate(request,context.env);
    if(user){
      mutationLock=await acquireUserMutationLock(context.env,user.id,actionPath);
      if(!mutationLock)response=json({error:'같은 계정의 다른 게임 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.',code:'USER_ACTION_IN_PROGRESS',retryable:true,retryAfterMs:800},409);
    }
  }
  // V1784: 락 해제는 응답 지연 경로에서 뺀다. waitUntil 로 넘겨도 쓰기는 그대로 수행되며,
  // 실패하더라도 lease(8~60초)가 만료되면 자동 회수된다.
  try{if(!response)response=await handleRequest(context)}finally{
    if(mutationLock){
      const release=releaseUserMutationLock(context.env,mutationLock).catch(error=>console.warn('user mutation lock release failed',error));
      if(typeof context.waitUntil==='function')context.waitUntil(release);else await release;
    }
  }
  if(response.status===401){
    const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(raw){
      try{
        const tokenHash=await hash(raw),revoked=await context.env.DB.prepare("SELECT reason FROM revoked_player_sessions_v1533 WHERE token_hash=? AND reason='MULTI_CLIENT_REPLACED'").bind(tokenHash).first();
        if(revoked)response=json({error:'다른 클라이언트에서 로그인되어 현재 접속이 종료되었습니다. 숲켓몬은 계정당 1개의 클라이언트만 이용할 수 있습니다.',code:'MULTI_CLIENT_BLOCKED',sessionEnded:true},401);
      }catch(_){}
    }
  }
  const durationMs=Math.max(0,Date.now()-startedAt),headers=new Headers(response.headers);
  if(durationMs>=2000)console.warn('SLOW_API_REQUEST',JSON.stringify({path:actionPath,method:request.method,status:response.status,durationMs}));
  // V1792: D1 사용량을 응답에 노출한다. DevTools Network > Timing 에서 바로 보인다.
  headers.set('server-timing',`app;dur=${durationMs}, d1;dur=${d1Stats.ms};desc="${d1Stats.queries}q ${d1Stats.batches}b"`);
  headers.set('x-cnine-response-ms',String(durationMs));
  headers.set('x-cnine-d1-queries',String(d1Stats.queries+d1Stats.statements));
  // V1790: 이번 요청이 도달한 복제 시점을 클라이언트에 돌려준다.
  // 클라이언트가 다음 요청에 그대로 실어 보내면, 방금 쓴 내용을 반드시 볼 수 있다.
  if(d1Session){
    try{
      const bookmark=d1Session.getBookmark?.();
      if(bookmark){
        headers.set(D1_BOOKMARK_HEADER,bookmark);
        // 교차 출처로 붙는 경우에도 브라우저가 이 헤더를 읽을 수 있어야 한다.
        const exposed=headers.get('access-control-expose-headers');
        headers.set('access-control-expose-headers',exposed?`${exposed}, ${D1_BOOKMARK_HEADER}`:`${D1_BOOKMARK_HEADER}, x-cnine-response-ms`);
      }
    }catch(error){console.warn('D1 bookmark read failed',error)}
  }
  // V1792: 느린 요청뿐 아니라 "조회가 많은" 요청도 남긴다.
  // 빠르지만 D1 을 많이 치는 라우트가 동시접속에서 먼저 무너지기 때문이다.
  const d1Total=d1Stats.queries+d1Stats.statements;
  if(durationMs>=1000||d1Total>=20||stableSmallHash(`${request.method}:${url.pathname}:${request.headers.get('cf-ray')||''}`)%128===0){
    console.log(JSON.stringify({type:'api_timing',method:request.method,path:url.pathname,status:response.status,durationMs,
      d1Queries:d1Stats.queries,d1Batches:d1Stats.batches,d1BatchStatements:d1Stats.statements,d1Total,d1Ms:d1Stats.ms,
      ray:request.headers.get('cf-ray')||''}));
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

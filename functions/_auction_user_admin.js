import {AUCTION_MAX_BID} from '../shared/auction-user-policy-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {auctionRowLock} from './_auction_user_assets.js';
import {jointError} from './_joint_request.js';
const KEY='auction_user_bgm_revision_v1';
export async function readAuctionAdminBgm(env){
 const [revision,rows]=await Promise.all([env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first(),env.DB.prepare('SELECT min_bid,max_bid,bgm_url,bgm_duration,sort_order FROM auction_bgm_rules_v1554 WHERE auction_id=0 ORDER BY sort_order,min_bid').all()]);
 return {revision:Number(revision?.value||0),rules:rows.results.map(r=>({minBid:Number(r.min_bid),maxBid:Number(r.max_bid),bgmUrl:r.bgm_url,duration:Number(r.bgm_duration),sortOrder:Number(r.sort_order)}))};
}
export async function saveAuctionAdminBgm(env,user,body){
 if(user.role!=='OWNER')throw jointError('AUCTION_PERMISSION','운영자 권한이 필요합니다.',403);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.rules)||body.rules.length>80)throw jointError('AUCTION_BGM','BGM 설정과 버전을 확인하세요.');
 const rules=body.rules.map((r,i)=>{
  if(!Number.isSafeInteger(r.minBid)||r.minBid<0||r.minBid>AUCTION_MAX_BID||!Number.isSafeInteger(r.maxBid)||r.maxBid<0||r.maxBid>AUCTION_MAX_BID||(r.maxBid>0&&r.maxBid<r.minBid)||!Number.isSafeInteger(r.duration)||r.duration<1||r.duration>60||typeof r.bgmUrl!=='string'||!r.bgmUrl.trim()||r.bgmUrl.length>2000||/^(?:javascript|data|blob):/i.test(r.bgmUrl.trim()))throw jointError('AUCTION_BGM','금액·음악 경로·재생 시간(1~60초)을 확인하세요.');
  return {minBid:r.minBid,maxBid:r.maxBid,bgmUrl:r.bgmUrl.trim().replace(/\\/g,'/'),duration:r.duration,sortOrder:i};
 });
 const before=await readAuctionAdminBgm(env);if(before.revision!==body.revision)throw jointError('AUCTION_CONFLICT','BGM 설정이 변경되었습니다. 새로 불러오세요.',409);
 const DB=env.DB,p=(s,...a)=>DB.prepare(s).bind(...a),token=crypto.randomUUID();
 try{await DB.batch([...auctionRowLock(DB,'SELECT id FROM auction_user_clock_v1 WHERE id=1'),jointGuard(DB,token,body.revision===0?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',body.revision===0?[KEY]:[KEY,String(body.revision)]),p('DELETE FROM auction_bgm_rules_v1554 WHERE auction_id=0'),...rules.map(r=>p('INSERT INTO auction_bgm_rules_v1554(auction_id,min_bid,max_bid,bgm_url,bgm_duration,sort_order) VALUES(0,?,?,?,?,?)',r.minBid,r.maxBid,r.bgmUrl,r.duration,r.sortOrder)),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',KEY,String(body.revision+1)),p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'AUCTION_BGM_SAVE','AUCTION','SHARED',JSON.stringify(before),JSON.stringify({revision:body.revision+1,rules})),p('UPDATE auction_user_clock_v1 SET version=version+1 WHERE id=1'),jointGuardEnd(DB,token)]);}catch(error){if(/CHECK|constraint|verified/i.test(error.message))throw jointError('AUCTION_CONFLICT','다른 창에서 BGM 설정을 저장했습니다. 새로 불러오세요.',409);throw error;}
 return {revision:body.revision+1,rules};
}

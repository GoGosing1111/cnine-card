import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {COW_ROOM_PUBLIC_RELEASE_ENABLED} from '../shared/pve-public-release-v2092.mjs';
import {readExpeditionPolicy} from './_expedition_v3_settings.js';
import {jointError} from './_joint_request.js';
import {cowPortalBattleEligible} from '../shared/cow-portal-eligibility.mjs';

export const COW_PORTAL_POLICY=Object.freeze({standardPercent:2,apocalypsePercent:3,basis:'COMPLETED_BATTLE',entry:'ONE_PORTAL_ONE_RUN'});
export const COW_PORTAL_TABLE='cow_room_portal_rolls_v1';
export const COW_PORTAL_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS ${COW_PORTAL_TABLE}(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,source_type TEXT NOT NULL CHECK(source_type IN('HUNT','SWEEP')),source_ref TEXT NOT NULL,difficulty TEXT NOT NULL,result TEXT NOT NULL CHECK(result IN('WIN','LOSE')),rate_percent INTEGER NOT NULL,roll_ppm INTEGER NOT NULL CHECK(roll_ppm>=0 AND roll_ppm<1000000),state TEXT NOT NULL CHECK(state IN('MISSED','OPEN','CONSUMED')),consumed_request_id TEXT,created_at TEXT NOT NULL,consumed_at TEXT,UNIQUE(user_id,source_type,source_ref))`,
  `CREATE INDEX IF NOT EXISTS cow_room_portal_open_user_v1 ON ${COW_PORTAL_TABLE}(user_id,state,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cow_room_portal_run_v1 ON ${COW_PORTAL_TABLE}(user_id,consumed_request_id) WHERE consumed_request_id IS NOT NULL`
];
const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const uid=user=>{const n=Number(user?.id);if(!Number.isSafeInteger(n)||n<1)throw jointError('PVE_V3_AUTH','로그인이 필요합니다.',401);return n;};
export function cowPortalRate({isApocalypse=false}={}){return isApocalypse===true?COW_PORTAL_POLICY.apocalypsePercent:COW_PORTAL_POLICY.standardPercent;}
function randomPpm(){
  const size=1000000,limit=Math.floor(0x100000000/size)*size;
  let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
  return value%size;
}
const visible=row=>row?.state==='OPEN'?{id:row.id,state:'OPEN',sourceType:row.source_type,difficulty:row.difficulty,ratePercent:Number(row.rate_percent),createdAt:row.created_at}:null;

// Only server-verified completed PVE actions call this. The public release hold
// precedes every database read, so preparing the feature cannot grant portals.
export async function discoverCowPortal(env,user,event){
  if(!cowPortalBattleEligible(event))return null;
  if(!V3_JOINT_RELEASE_ENABLED&&!COW_ROOM_PUBLIC_RELEASE_ENABLED)return null;
  const policy=await readExpeditionPolicy(env,'COW_ROOM');
  if(policy.mode!=='ON'||policy.approved!==true)return null;
  return discoverCowPortalReady(env,user,event);
}
export async function discoverCowPortalReady(env,user,event,{randomInt=randomPpm,now=Date.now}={}){
  if(!cowPortalBattleEligible(event))return null;
  const userId=uid(user);
  if(!event||!['HUNT','SWEEP'].includes(event.sourceType)||!['WIN','LOSE'].includes(event.result)||typeof event.sourceRef!=='string'||event.sourceRef.length<1||event.sourceRef.length>250)
    throw jointError('PVE_V3_PORTAL_EVENT','완료된 PVE 전투 기록을 확인하세요.');
  // Apocalypse remains manual combat only; this does not enable its sweep mode.
  if(event.sourceType==='SWEEP'&&event.isApocalypse===true)return null;
  const values=[userId,event.sourceType,event.sourceRef];
  const existing=await p(env,`SELECT * FROM ${COW_PORTAL_TABLE} WHERE user_id=? AND source_type=? AND source_ref=?`,...values).first();
  if(existing)return visible(existing);
  const rate=cowPortalRate(event),roll=randomInt();
  if(!Number.isSafeInteger(roll)||roll<0||roll>=1000000)throw jointError('PVE_V3_PORTAL_RANDOM','포탈 판정을 확인할 수 없습니다.',503);
  const difficulty=event.isApocalypse===true?'APOCALYPSE':'STANDARD';
  // PIPE-0920: INSERT 와 확인 SELECT 를 한 batch 로 보낸다(PostgreSQL 어댑터가 한 왕복으로 묶는다). 결과는 같다.
  const [,confirmed]=await env.DB.batch([
    p(env,`INSERT INTO ${COW_PORTAL_TABLE}(id,user_id,source_type,source_ref,difficulty,result,rate_percent,roll_ppm,state,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,source_type,source_ref) DO NOTHING`,
    crypto.randomUUID(),...values,difficulty,event.result,rate,roll,roll<rate*10000?'OPEN':'MISSED',new Date(now()).toISOString()),
    p(env,`SELECT * FROM ${COW_PORTAL_TABLE} WHERE user_id=? AND source_type=? AND source_ref=?`,...values)
  ]);
  return visible((confirmed?.results||[])[0]||null);
}
export async function cowPortalStatus(env,user){
  const userId=uid(user);
  const [count,first]=await Promise.all([
    p(env,`SELECT COUNT(*) AS total FROM ${COW_PORTAL_TABLE} WHERE user_id=? AND state='OPEN'`,userId).first(),
    p(env,`SELECT * FROM ${COW_PORTAL_TABLE} WHERE user_id=? AND state='OPEN' ORDER BY created_at,id LIMIT 1`,userId).first()
  ]);
  return {available:Number(count?.total||0),next:visible(first),policy:COW_PORTAL_POLICY};
}
export async function requireCowPortal(env,user){
  const row=await p(env,`SELECT * FROM ${COW_PORTAL_TABLE} WHERE user_id=? AND state='OPEN' ORDER BY created_at,id LIMIT 1`,uid(user)).first();
  if(!row)throw jointError('PVE_V3_PORTAL_REQUIRED','PVE 토벌·소탕에서 젖소방 포탈을 발견해야 입장할 수 있습니다.',409);
  return visible(row);
}

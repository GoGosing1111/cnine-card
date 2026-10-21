import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointHash,jointInventoryChange} from './_joint_transactions.js';
import {accountRankAward} from './_account_rank.js';
import {prepareTowerForgeProtectionClear} from './_forge_tower_protection.js';
import {resolveAvatarDropRate} from './_avatar_drop.js';

export const TOWER_ABYSS_PROTOCOL='TOWER_ABYSS_20261022';
const KIND='TOWER_ABYSS',pointer=uid=>`tower_abyss_active:${uid}`;
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const fail=(code,message,status=409,extra={})=>{throw Object.assign(new Error(message),{code,status,...extra});};
function identity(user,body){
 const uid=Number(user.id),requestId=body?.requestId;
 if(!Number.isSafeInteger(uid)||uid<1||typeof requestId!=='string'||!/^[-A-Za-z0-9_]{12,100}$/.test(requestId))fail('TOWER_REQUEST','전투 요청 번호를 확인하세요.',400);
 return {uid,requestId,rid:`tower-abyss:${uid}:${requestId}`};
}
const read=(env,uid,rid)=>p(env,'SELECT * FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?',rid,uid,KIND).first();
async function encodePlan(plan){
 const raw=new TextEncoder().encode(JSON.stringify(plan.response));
 if(raw.byteLength>4000000)fail('TOWER_RECORD_SIZE','전투 기록을 저장하지 못했습니다. 다시 시도하세요.',503);
 const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
 const {response,...rest}=plan;return JSON.stringify({...rest,responseGzip:btoa(binary)});
}
async function decodePlan(encoded){
 const plan=JSON.parse(encoded);if(plan.response)return plan;
 const raw=Uint8Array.from(atob(plan.responseGzip),c=>c.charCodeAt(0));
 const response=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 delete plan.responseGzip;return {...plan,response};
}
async function present(row,now=Date.now()){
 const plan=row.plan||await decodePlan(row.plan_json);
 return {...plan.response,requestId:plan.requestId,settlement:{protocol:TOWER_ABYSS_PROTOCOL,status:row.status==='COMPLETED'&&plan.extrasComplete?'COMPLETED':'PENDING',startedAt:plan.startedAt,notBefore:plan.notBefore,requiredMs:plan.notBefore-plan.startedAt,remainingMs:Math.max(0,plan.notBefore-now)},reward:row.status==='COMPLETED'?plan.rewardCoin:0};
}
export async function towerAbyssPending(env,user,{now=Date.now}={}){
 const marker=await p(env,'SELECT value FROM app_meta WHERE key=?',pointer(user.id)).first();
 const row=marker?await read(env,user.id,marker.value):null;
 return {pending:row&&row.status!=='CANCELLED'?await present(row,now()):null};
}
// The caller holds the existing strict account lock. CAS guards also protect
// against an expired lease: only one durable encounter can occupy the account.
export async function towerAbyssStart(env,user,body,prepare,{now=Date.now}={}){
 const {uid,requestId,rid}=identity(user,body);
 if(body.protocol!==TOWER_ABYSS_PROTOCOL)fail('TOWER_CLIENT_UPDATE','무한의탑이 개편됐습니다. 새로고침 후 다시 도전하세요.');
 const floor=Number(body.floorNo);if(!Number.isSafeInteger(floor)||floor<1||floor>1000)fail('TOWER_FLOOR','도전층을 확인하세요.',400);
 const inputHash=await jointHash({protocol:TOWER_ABYSS_PROTOCOL,uid,floor});
 const prior=await read(env,uid,rid);
 if(prior){if(prior.input_hash!==inputHash)fail('TOWER_REQUEST_CONFLICT','같은 전투 요청 번호의 층이 다릅니다.');if(prior.status==='CANCELLED')fail('TOWER_FLOOR_CHANGED','취소된 전투입니다. 현재 도전층을 다시 확인하세요.');return present(prior,now());}
 const active=await towerAbyssPending(env,user,{now});if(active.pending)return active.pending;
 const prepared=await prepare();
 if(prepared instanceof Response){const error=await prepared.json();fail(error.code||'TOWER_UNAVAILABLE',error.error||'현재 도전할 수 없습니다.',prepared.status);}
 const startedAt=now();
 const response=prepared.response;
 if(response.floorNo!==floor||!['WIN','LOSE'].includes(response.result))throw Error('Invalid tower encounter');
 const rewardCoin=response.result==='WIN'?Number(prepared.rewardCoin):0;
 if(!Number.isSafeInteger(rewardCoin)||rewardCoin<0||rewardCoin>1e14)throw Error('Invalid tower reward');
 const events=response.battleV2?.result?.timeline||[],actions=events.filter(e=>['TURN','COUNTER','MERCENARY_WINDUP'].includes(e.type)).length;
 // Server time is a minimum progression gate, not a claim that a browser has
 // displayed every frame. The shipping client also requires full playback.
 const requiredMs=Math.max(8000,Math.min(180000,Math.max(Number(response.elapsedCombatMs)||0,actions*250)));
 const plan={...prepared,requestId,startedAt,notBefore:startedAt+requiredMs,rewardCoin,extrasComplete:false};
 const encoded=await encodePlan(plan);
 const token=crypto.randomUUID(),DB=env.DB;
 const writes=DB.dialect==='postgres'?[p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',uid)]:[];
 writes.push(jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[pointer(uid)]),
  p(env,"INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,?,?,?,'PENDING',?)",rid,uid,KIND,inputHash,encoded,new Date(startedAt).toISOString()),
  p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',pointer(uid),rid),jointGuardEnd(DB,token));
 try{await DB.batch(writes);}catch(error){const stored=await read(env,uid,rid);if(stored&&stored.input_hash===inputHash)return present(stored,now());const running=await towerAbyssPending(env,user,{now});if(running.pending)return running.pending;throw error;}
 return present({plan,status:'PENDING'},now());
}
async function towerRerollPlan(env,uid,rid){
 const cfg=await p(env,"SELECT value FROM app_meta WHERE key='high_grade_reroll_settings_v1'").first();
 const rate=Math.max(0,Math.min(100,Number(JSON.parse(cfg?.value||'{}').dropRates?.TOWER)||0));
 if(!rate)return {statements:[],reward:null};
 const effective=(await resolveAvatarDropRate(env,uid,rate,'TOWER')).total,won=Math.random()*100<effective;
 const statements=[p(env,'INSERT INTO high_grade_reroll_drop_receipts(user_id,content_code,reference_id,won) VALUES(?,?,?,?)',uid,'TOWER',rid,won?1:0)];
 if(won)statements.push(...jointInventoryChange(env.DB,uid,'HIGH_GRADE_REROLL_TICKET',1,'무한의탑 최초 클리어',rid));
 return {statements,reward:{won,itemCode:'HIGH_GRADE_REROLL_TICKET',quantity:won?1:0}};
}
export async function towerAbyssFinish(env,user,body,deps,{now=Date.now}={}){
 const {uid,rid}=identity(user,body),DB=env.DB;
 let row=await read(env,uid,rid);if(!row)fail('TOWER_NOT_FOUND','저장된 전투를 찾을 수 없습니다.',404);
 if(row.status==='CANCELLED')fail('TOWER_FLOOR_CHANGED','현재 도전층을 다시 확인하세요.');
 let plan=await decodePlan(row.plan_json);
 if(now()<plan.notBefore)fail('TOWER_PLAYBACK_PENDING','전투 완료 시간이 지나야 보상과 다음 층을 확정할 수 있습니다.',409,{retryAfterMs:plan.notBefore-now()});
 if(row.status!=='COMPLETED'){
  const progress=await p(env,"SELECT current_floor,highest_floor FROM tower_user_progress WHERE season_id=? AND user_id=? AND season_id=(SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1)",plan.seasonId,uid).first();
  if(Number(progress?.current_floor)!==plan.response.floorNo||Number(progress?.highest_floor)>=plan.response.floorNo){
   await DB.batch([
    p(env,"UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING' AND NOT EXISTS(SELECT 1 FROM tower_user_progress WHERE season_id=? AND user_id=? AND current_floor=? AND highest_floor<? AND season_id=(SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1))",new Date(now()).toISOString(),rid,uid,plan.seasonId,uid,plan.response.floorNo,plan.response.floorNo),
    p(env,"DELETE FROM app_meta WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND status='CANCELLED')",pointer(uid),rid,rid)
   ]);
   fail('TOWER_FLOOR_CHANGED','운영자가 도전층을 변경했습니다. 현재 진행도를 확인하세요.');
  }
  const token=crypto.randomUUID(),floor=plan.response.floorNo,win=plan.response.result==='WIN';
  const writes=DB.dialect==='postgres'?[p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',uid)]:[];
  writes.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND status='PENDING') AND EXISTS(SELECT 1 FROM tower_user_progress WHERE season_id=? AND user_id=? AND current_floor=? AND highest_floor<? AND season_id=(SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1)) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)",[rid,uid,plan.seasonId,uid,floor,floor,pointer(uid),rid]));
  if(win){
   const forge=await prepareTowerForgeProtectionClear(env,{userId:uid,seasonId:plan.seasonId,floorNo:floor}),reroll=await towerRerollPlan(env,uid,rid);
   plan.response.forgeProtectionReward=forge.reward;plan.response.highGradeRerollReward=reroll.reward;
   writes.push(p(env,'UPDATE users SET coin=coin+? WHERE id=?',plan.rewardCoin,uid),
    p(env,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',plan.rewardCoin,`무한의탑 ${floor}층 최초 클리어`,uid),
    p(env,'UPDATE tower_user_progress SET current_floor=?,highest_floor=?,highest_reached_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?',floor+1,floor,plan.seasonId,uid),
    ...await accountRankAward(env,uid,'TOWER',`${plan.seasonId}:${floor}`),...forge.statements,...reroll.statements);
  }
  writes.push(p(env,'INSERT INTO tower_clear_history(season_id,user_id,floor_no,player_power,monster_power,result) VALUES(?,?,?,?,?,?)',plan.seasonId,uid,floor,plan.response.playerPower,plan.response.monsterPower,plan.response.result),
   p(env,"UPDATE joint_operations_v1 SET status='COMPLETED',plan_json=?,completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'",await encodePlan(plan),new Date(now()).toISOString(),rid,uid),jointGuardEnd(DB,token));
  try{await DB.batch(writes);}catch(error){row=await read(env,uid,rid);if(row?.status!=='COMPLETED')throw error;plan=await decodePlan(row.plan_json);}
 }
 if(!plan.extrasComplete){
  // Existing secondary drops use their own stable receipt keys. Persist each
  // completed response so disconnects resume without repeating the core grant.
  if(plan.response.result==='WIN')for(const key of ['magicReward','equipmentReward','blackMiracleReward']){
   if(Object.hasOwn(plan.response,key))continue;
   const value=await deps[key](plan,rid);
   if(value?.pending)fail('TOWER_REWARD_PENDING','추가 보상을 확인 중입니다. 같은 전투 결과를 다시 확인하세요.',503,{retryAfterMs:1500});
   plan.response[key]=value??null;
   await p(env,'UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=? AND user_id=?',await encodePlan(plan),rid,uid).run();
  }
  plan.extrasComplete=true;
  await DB.batch([p(env,'UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=? AND user_id=?',await encodePlan(plan),rid,uid),p(env,'DELETE FROM app_meta WHERE key=? AND value=?',pointer(uid),rid)]);
 }
 return present({plan,status:'COMPLETED'},now());
}

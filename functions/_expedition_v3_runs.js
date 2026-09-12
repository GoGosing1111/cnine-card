import {planForgeProtectionDrop} from './_forge_protection_drop.js';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {buildCowRoomBattle} from './_cow_room_v3.js';
import {readExpeditionPolicy,validateExpeditionPolicy} from './_expedition_v3_settings.js';
import {planUnifiedDropRoll,prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointError} from './_joint_request.js';
const RUN='expedition_v3_runs_v1',DAY='expedition_v3_daily_v1',PROGRESS='expedition_v3_progress_v1',LEASE=120000;
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const key=(user,content,requestId)=>{
  if(!Number.isSafeInteger(Number(user?.id))||Number(user.id)<1)throw jointError('PVE_V3_AUTH','로그인이 필요합니다.',401);
  if(content!=='COW_ROOM')throw jointError('PVE_V3_CONTENT','콘텐츠를 확인하세요.');
  if(requestId!==undefined&&(typeof requestId!=='string'||!/^[A-Za-z0-9_:-]{1,105}$/.test(requestId)))throw jointError('PVE_V3_REQUEST','요청 번호를 확인하세요.');
  return Number(user.id);
};
const encode=value=>{const raw=JSON.stringify(value);if(new TextEncoder().encode(raw).length>750000)throw jointError('PVE_V3_PAYLOAD','전투 기록이 너무 큽니다.');return raw;};
const parse=raw=>JSON.parse(String(raw));
const dayKey=at=>new Date(at+9*3600000).toISOString().slice(0,10);
const pending=row=>({ok:true,status:'RUNNING',requestId:row.request_id,difficulty:row.selection,retryAfterMs:1500,resultPending:true});
const owns=`EXISTS(SELECT 1 FROM ${RUN} WHERE user_id=? AND content=? AND request_id=? AND state='PREPARED' AND lease_token=?)`;
export const EXPEDITION_V3_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS ${RUN}(user_id INTEGER NOT NULL,content TEXT NOT NULL,request_id TEXT NOT NULL,selection TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'PREPARED',checkpoint_json TEXT NOT NULL,response_json TEXT,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,integrity INTEGER NOT NULL DEFAULT 1,last_error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,content,request_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS expedition_v3_active_user ON ${RUN}(user_id) WHERE state<>'COMPLETED'`,
  `CREATE TABLE IF NOT EXISTS ${DAY}(user_id INTEGER NOT NULL,content TEXT NOT NULL,day_key TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,coin INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,content,day_key))`,
  `CREATE TABLE IF NOT EXISTS ${PROGRESS}(user_id INTEGER NOT NULL,content TEXT NOT NULL,best_cleared INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,content))`
];
export async function ensureExpeditionV3Schema(env){
  if(typeof env.DB.execSchema==='function')await env.DB.execSchema(EXPEDITION_V3_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')));
  else for(const sql of EXPEDITION_V3_SCHEMA)await env.DB.prepare(sql).run();
}
async function get(env,uid,content,rid){return p(env,`SELECT * FROM ${RUN} WHERE user_id=? AND content=? AND request_id=?`,uid,content,rid).first();}
async function active(env,uid){return p(env,`SELECT * FROM ${RUN} WHERE user_id=? AND state<>'COMPLETED'`,uid).first();}
export async function expeditionV3Status(env,user,content,deps={}){
  const uid=key(user,content),now=(deps.now||Date.now)(),day=dayKey(now),policy=validateExpeditionPolicy(content,await (deps.readPolicy||readExpeditionPolicy)(env,content));
  const [current,budget,progress]=await Promise.all([active(env,uid),p(env,`SELECT * FROM ${DAY} WHERE user_id=? AND content=? AND day_key=?`,uid,content,day).first(),
    p(env,`SELECT best_cleared FROM ${PROGRESS} WHERE user_id=? AND content=?`,uid,content).first()]);
  const attempts=Number(budget?.attempts||0),coin=Number(budget?.coin||0);
  return {ok:true,accountId:uid,content,status:current?'RUNNING':'IDLE',...(current?{...pending(current),activeContent:current.content}:{}),policy,progress:{bestCleared:Number(progress?.best_cleared||0),maxUnlocked:1},
    budget:{day,attempts,remaining:Math.max(0,policy.dailyRuns-attempts),coin,coinRemaining:Math.max(0,policy.dailyCoinCap-coin)},
    difficulties:[{id:'PASTURE',name:'붉은 목초지'}]};
}
export async function expeditionV3Result(env,user,content,rid){const row=await get(env,key(user,content,rid),content,rid);return row?.state==='COMPLETED'?{...parse(row.response_json),replayed:true}:row?pending(row):{ok:true,status:'NOT_FOUND'};}
async function settle(env,user,row,token,deps){
  const uid=Number(user.id),content=row.content,rid=row.request_id,saved=parse(row.checkpoint_json),now=(deps.now||Date.now)();
  if(saved.userId!==uid||saved.content!==content||saved.requestId!==rid||saved.selection!==row.selection)throw jointError('PVE_V3_RECORD','전투 기록의 소유자를 확인할 수 없습니다.',409);
  const grants=await prepareUnifiedDropGrant(env,saved.plan,{writePoolLedger:false});
  const response={...saved.battle,ok:true,status:'COMPLETED',requestId:rid,difficulty:{id:saved.selection,name:saved.name},success:saved.success,
    rewards:grants.rewards,budget:saved.budget,entryCost:saved.policy.entryCoin,policyVersion:saved.policy.version,refreshAccount:true};
  const proof=grants.proofs.length?grants.proofs.map(q=>`(${q.sql})`).join(' AND '):'1=1';
  await env.DB.batch([
    p(env,`INSERT INTO ${RUN}(user_id,content,request_id,selection,checkpoint_json,integrity) SELECT ?,?,?,'','',NULL WHERE NOT EXISTS(SELECT 1 FROM ${RUN} WHERE user_id=? AND content=? AND request_id=? AND state='PREPARED' AND lease_token=? AND lease_until>?) OR NOT EXISTS(SELECT 1 FROM users WHERE id=?)`,uid,content,rid,uid,content,rid,token,now,uid),
    ...grants.statements,
    p(env,`UPDATE ${RUN} SET integrity=CASE WHEN ${proof} THEN 1 ELSE NULL END WHERE user_id=? AND content=? AND request_id=? AND lease_token=?`,...grants.proofs.flatMap(q=>q.values),uid,content,rid,token),
    ...(saved.success?[p(env,`INSERT INTO ${PROGRESS}(user_id,content,best_cleared) VALUES(?,?,?) ON CONFLICT(user_id,content) DO UPDATE SET best_cleared=1`,uid,content,1)]:[]),
    p(env,`UPDATE ${RUN} SET state='COMPLETED',response_json=?,lease_token=NULL,lease_until=0,last_error=NULL WHERE user_id=? AND content=? AND request_id=? AND lease_token=?`,encode(response),uid,content,rid,token)
  ]);
  return response;
}
export async function runExpeditionV3(env,user,content,body,deps={}){
  const uid=key(user,content,body?.requestId),rid=body.requestId,selection=body.difficulty;
  if(selection!=='PASTURE')throw jointError('PVE_V3_SELECTION','원정 구간을 확인하세요.');
  let row=await get(env,uid,content,rid);
  if(row&&row.selection!==selection)throw jointError('PVE_V3_REQUEST_CONFLICT','같은 요청 번호의 구간이 다릅니다.',409);
  if(row?.state==='COMPLETED')return {...parse(row.response_json),replayed:true};
  const unfinished=await active(env,uid);
  if(unfinished&&(unfinished.request_id!==rid||unfinished.content!==content))throw jointError('PVE_V3_RUNNING','진행 중인 원정을 먼저 복구하세요.',409);
  const at=(deps.now||Date.now)(),token=crypto.randomUUID();
  if(row){
    if(Number(row.lease_until)>at)return pending(row);
    const claim=await p(env,`UPDATE ${RUN} SET lease_token=?,lease_until=? WHERE user_id=? AND content=? AND request_id=? AND state='PREPARED' AND lease_until<=?`,token,at+LEASE,uid,content,rid,at).run();
    if(Number(claim.meta?.changes)!==1)return pending(row);
  }else{
    const state=await expeditionV3Status(env,user,content,deps),policy=state.policy;
    if(policy.mode==='OFF'||policy.mode==='TEST'&&user.role!=='OWNER'||policy.mode==='ON'&&!policy.approved)throw jointError('PVE_V3_CLOSED','현재 입장할 수 없는 원정입니다.',423);
    if(state.budget.remaining<=0)throw jointError('PVE_V3_DAILY_LIMIT','오늘 입장 횟수를 모두 사용했습니다.',409);
    const snapshot=await (deps.loadSnapshot||loadScrapyardV3Snapshot)(env,user,deps),seed=crypto.getRandomValues(new Uint32Array(1))[0],battle=buildCowRoomBattle({snapshot,seed});
    const success=battle.battleV2.result.winner==='A',coin=success?Math.min(policy.clearCoin[0],state.budget.coinRemaining):0;
    const plan=await planUnifiedDropRoll(env,{userId:uid,requestId:`${content}_V3:${rid}`,sourceType:content,sourceId:selection,triggerType:success?'CLEAR':'DEFEAT',role:user.role,context:{difficulty:selection}});
    // Defeats have no rewards; CMS material drops cannot circumvent the coin cap.
    plan.rewards=success?plan.rewards.filter(r=>r.rewardType!=='COIN'):[];
    plan.rewards.push(...await planForgeProtectionDrop(env,content,{cleared:success}));
    if(coin>0)plan.rewards.push({rewardType:'COIN',rewardRef:'COIN',rewardName:'원정 보상',quantity:coin,poolId:null,entryId:null});
    const saved={userId:uid,content,requestId:rid,selection,name:state.difficulties.find(s=>s.id===selection).name,snapshot,seed,battle,success,policy,plan,
      budget:{...state.budget,attempts:state.budget.attempts+1,remaining:state.budget.remaining-1,coin:state.budget.coin+coin,coinRemaining:state.budget.coinRemaining-coin}};
    const args=[uid,content,rid,token],day=state.budget.day,dayCoin=state.budget.coin;
    const statements=[
      p(env,`INSERT INTO ${RUN}(user_id,content,request_id,selection,checkpoint_json,lease_token,lease_until) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?) AND COALESCE((SELECT attempts FROM ${DAY} WHERE user_id=? AND content=? AND day_key=?),0)=?`,uid,content,rid,selection,encode(saved),token,at+LEASE,uid,policy.entryCoin,uid,content,day,state.budget.attempts),
      p(env,`UPDATE users SET coin=coin-? WHERE id=? AND coin>=? AND ${owns}`,policy.entryCoin,uid,policy.entryCoin,...args),
      p(env,`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,? FROM users WHERE id=? AND ${owns}`,uid,-policy.entryCoin,`${content} V3 입장 ${rid}`,uid,...args),
      p(env,`INSERT INTO ${DAY}(user_id,content,day_key,attempts,coin) SELECT ?,?,?,?,? WHERE ${owns} ON CONFLICT(user_id,content,day_key) DO UPDATE SET attempts=excluded.attempts,coin=excluded.coin`,uid,content,day,state.budget.attempts+1,dayCoin+coin,...args),
      p(env,`INSERT INTO ${RUN}(user_id,content,request_id,selection,checkpoint_json,integrity) SELECT ?,?,?,'','',NULL WHERE NOT (${owns}) OR NOT EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0)`,uid,content,rid,...args,uid)
    ];
    if(env.DB.dialect==='postgres')statements.unshift(p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',uid));
    try{await env.DB.batch(statements);}catch(error){row=await get(env,uid,content,rid);if(!row)throw jointError('PVE_V3_ENTRY_CONFLICT','잔액 또는 원정 상태가 바뀌었습니다. 다시 확인하세요.',409);}
    row=await get(env,uid,content,rid);
    if(row.lease_token!==token)return row.state==='COMPLETED'?{...parse(row.response_json),replayed:true}:pending(row);
  }
  try{return await settle(env,user,row,token,deps);}catch(error){
    const done=await get(env,uid,content,rid);if(done?.state==='COMPLETED')return {...parse(done.response_json),replayed:true};
    await p(env,`UPDATE ${RUN} SET lease_token=NULL,lease_until=0,last_error=? WHERE user_id=? AND content=? AND request_id=? AND lease_token=? AND state='PREPARED'`,String(error.code||error.message).slice(0,180),uid,content,rid,token).run();
    throw jointError('PVE_V3_RESULT_PENDING','보상 정산을 다시 확인 중입니다. 같은 원정을 복구하세요.',503);
  }
}

import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const QUEST_SETTINGS_KEY='quest_weekly_settings_v20260924';
const SCHEMA='quest_hub_foundation_20260924_v1';
export const WEEKLY_QUESTS=Object.freeze([
 {id:'POST',title:'PLAY DK 게시글 작성',target:200,unit:'개',description:'월요일부터 일요일까지 작성한 게시글을 합산합니다.'},
 {id:'CORE_RAID',title:'붕괴코어 레이드 참여',target:3,unit:'회',description:'실제 공략 전투를 완료한 레이드 방을 1회씩 집계합니다. 같은 방의 추가 공략은 중복 계산하지 않습니다.'},
 {id:'TERRITORY',title:'영토전 참여',target:1,unit:'회',description:'직접 진행하여 완료한 영토전 공격을 집계합니다. 자동 편성과 방어는 제외됩니다.'},
 {id:'CLAN',title:'클랜전 참여',target:2,unit:'회',description:'직접 진행하여 완료한 클랜전 전투를 집계합니다. 승패와 관계없이 인정하며 방어는 제외됩니다.'}
]);
export const QUEST_REWARDS=Object.freeze({COIN:'코인',MASTER_STAR:'마스터의 별',PREMIUM_CUBE:'프리미엄 큐브',EQUIPMENT_SUPPLY_BOX:'장비 보급상자',HIGH_GRADE_REROLL_TICKET:'고등급 재뽑기권',STARLIGHT_ARMOR_CORE:'미스틱 에너지'});
const parse=(value,fallback={})=>{try{return JSON.parse(value)}catch{return fallback}};
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const sqlDate=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
export function questPeriod(now=Date.now()){
 const local=new Date(now+9*3600000),today=local.toISOString().slice(0,10),day=local.getUTCDay();
 const monday=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-(day+6)%7)-9*3600000;
 const end=monday+7*86400000,days=Array.from({length:7},(_,i)=>new Date(monday+9*3600000+i*86400000).toISOString().slice(0,10));
 return {today,weekKey:days[0],lastDate:days[6],start:sqlDate(monday),end:sqlDate(end),resetsAt:new Date(end).toISOString(),days:days.filter(date=>date<=today),allDays:days,timezone:'Asia/Seoul'};
}
export function defaultQuestSettings(){return {revision:0,quests:Object.fromEntries(WEEKLY_QUESTS.map(q=>[q.id,{enabled:false,rewardType:'COIN',rewardAmount:0}]))}}
export function validateQuestSettings(input,before){
 const next=defaultQuestSettings();next.revision=before.revision+1;
 if(!input?.quests||typeof input.quests!=='object')fail('퀘스트별 보상 설정을 입력하세요.',400);
 for(const q of WEEKLY_QUESTS){
  const value=input.quests[q.id];if(!value||typeof value.enabled!=='boolean')fail('각 퀘스트의 지급 ON/OFF를 선택하세요.',400);
  const rewardAmount=Number(value.rewardAmount),rewardType=String(value.rewardType||'');
  if(!QUEST_REWARDS[rewardType]||value.rewardAmount===''||value.rewardAmount===null||!Number.isSafeInteger(rewardAmount)||rewardAmount<0)fail('지원되는 보상과 0 이상의 안전한 정수를 입력하세요.',400);
  if(value.enabled&&rewardAmount<=0)fail('보상을 1개 이상 설정한 뒤 지급을 켜세요.',400);
  next.quests[q.id]={enabled:value.enabled,rewardType,rewardAmount};
 }
 return next;
}
export async function ensureQuestHub(env){
 if(readRuntimeData(env,SCHEMA))return;
 const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
 if(!marker){
  const schema=[
   `CREATE TABLE IF NOT EXISTS quest_weekly_posts_v1(user_id BIGINT NOT NULL,week_key TEXT NOT NULL,provider_user_id TEXT NOT NULL,board_slugs_json TEXT NOT NULL,post_count BIGINT NOT NULL,days_json TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(user_id,week_key))`,
   `CREATE TABLE IF NOT EXISTS quest_weekly_claims_v1(user_id BIGINT NOT NULL,week_key TEXT NOT NULL,quest_id TEXT NOT NULL,claim_token TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('PENDING','COMPLETED')),progress BIGINT NOT NULL,reward_type TEXT NOT NULL,reward_amount BIGINT NOT NULL,message_id BIGINT,created_at TEXT NOT NULL DEFAULT ${env.DB.dialect==='postgres'?'sqlite_now()':'CURRENT_TIMESTAMP'},PRIMARY KEY(user_id,week_key,quest_id))`
  ];
  const tables=new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(row=>row.name));
  for(const [table,userColumn,dateColumn] of [['raid_core_attempts_v2024','user_id','resolved_at'],['territory_war_v3_actions','user_id','updated_at'],['clan_war_battles','attacker_user_id','updated_at']]){
   if(tables.has(table))schema.push(`CREATE INDEX IF NOT EXISTS idx_quest_weekly_${table} ON ${table}(${userColumn},status,${dateColumn})`);
  }
  if(env.DB.dialect==='postgres')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
  await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(QUEST_SETTINGS_KEY,JSON.stringify(defaultQuestSettings())),
  env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(SCHEMA,'1')
  ]);
 }
 cacheRuntimeData(env,SCHEMA,true);
}
async function settings(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(QUEST_SETTINGS_KEY).first();
 return {raw:row?.value||'',value:{...defaultQuestSettings(),...parse(row?.value)}};
}
const identity=(env,user)=>env.DB.prepare("SELECT provider_user_id,provider_name FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(user.id).first();
const boards=daily=>JSON.stringify([...daily.boardSlugs].sort());
async function savedPosts(env,user,period,verification,daily){
 const row=await env.DB.prepare('SELECT * FROM quest_weekly_posts_v1 WHERE user_id=? AND week_key=?').bind(user.id,period.weekKey).first();
 return row?.provider_user_id===verification?.provider_user_id&&row.board_slugs_json===boards(daily)?row:null;
}
async function activityCounts(env,user,period){
 const range=column=>`REPLACE(SUBSTR(${column},1,19),'T',' ')>=? AND REPLACE(SUBSTR(${column},1,19),'T',' ')<?`;
 const queries={
  CORE_RAID:`SELECT COUNT(DISTINCT room_id) c FROM raid_core_attempts_v2024 WHERE user_id=? AND status='COMPLETED' AND COALESCE(result_json,'') NOT LIKE '%CORE_BATTLE_ABANDONED%' AND ${range('resolved_at')}`,
  TERRITORY:`SELECT COUNT(*) c FROM territory_war_v3_actions WHERE user_id=? AND status IN ('APPLIED','COMPLETED') AND ${range('updated_at')}`,
  CLAN:`SELECT COUNT(*) c FROM clan_war_battles WHERE attacker_user_id=? AND status='COMPLETED' AND ${range('updated_at')}`
 };
 return Object.fromEntries(await Promise.all(Object.entries(queries).map(async([key,sql])=>{
  try{return [key,{count:Number((await env.DB.prepare(sql).bind(user.id,period.start,period.end).first())?.c||0),available:true}]}
  catch(error){if(/no such table|relation .* does not exist/i.test(String(error?.message)))return [key,{count:0,available:false}];throw error}
 })));
}
export async function checkWeeklyPosts(env,user,deps,{force=false}={}){
 const period=questPeriod(deps.now?.()),daily=await deps.dailySettings(env),verification=await identity(env,user);
 if(!verification?.provider_user_id)fail('PLAY DK 2차 인증을 먼저 완료하세요.',403);
 if(deps.excluded(user,daily))fail('현재 운영 계정의 퀘스트 이용이 중지되어 있습니다.',403);
 const previous=await savedPosts(env,user,period,verification,daily),cooldown=Math.max(20,Number(daily.checkCooldownSeconds)||20)*1000;
 if(!force&&previous&&(deps.now?.()??Date.now())-Date.parse(previous.checked_at)<cooldown)return {postCount:Number(previous.post_count),days:parse(previous.days_json,[]),checkedAt:previous.checked_at,cooldown:true};
 const results=[],queue=[...period.days],client=deps.playdkClient(env);
 // Two bounded lanes, up to seven date lookups. No incomplete total is persisted.
 const lanes=await Promise.allSettled(Array.from({length:2},async()=>{while(queue.length){
  const date=queue.shift(),result=await client.getDailyPostCount({userUuid:verification.provider_user_id,questDate:date,boardSlugs:daily.boardSlugs});
  if(result.questDate!==date||result.userUuid!==verification.provider_user_id||result.timezone!=='Asia/Seoul'||JSON.stringify([...(result.boardSlugs||[])].sort())!==boards(daily)||!Number.isSafeInteger(result.count)||result.count<0)fail('DK 집계 날짜 또는 계정 응답이 일치하지 않습니다. 다시 확인해 주세요.',502);
  results.push({date,count:result.count});
 }}));
 const failed=lanes.find(lane=>lane.status==='rejected');if(failed)throw failed.reason;
 const current=questPeriod(deps.now?.());if(current.today!==period.today)fail('집계 중 날짜가 바뀌었습니다. 새 날짜로 다시 확인해 주세요.');
 const latest=await identity(env,user);if(latest?.provider_user_id!==verification.provider_user_id)fail('인증 계정이 변경되었습니다. 다시 확인해 주세요.');
 results.sort((a,b)=>a.date.localeCompare(b.date));const count=results.reduce((sum,row)=>sum+row.count,0),checkedAt=new Date(deps.now?.()??Date.now()).toISOString();
 if(!Number.isSafeInteger(count))fail('DK 집계 결과 범위를 확인할 수 없습니다.',502);
 await env.DB.prepare(`INSERT INTO quest_weekly_posts_v1(user_id,week_key,provider_user_id,board_slugs_json,post_count,days_json,checked_at) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(user_id,week_key) DO UPDATE SET provider_user_id=excluded.provider_user_id,board_slugs_json=excluded.board_slugs_json,post_count=excluded.post_count,days_json=excluded.days_json,checked_at=excluded.checked_at`)
  .bind(user.id,period.weekKey,verification.provider_user_id,boards(daily),count,JSON.stringify(results),checkedAt).run();
 return {postCount:count,days:results,checkedAt};
}
export async function questHubStatus(env,user,deps){
 const period=questPeriod(deps.now?.()),[{value:config},daily,verification]=await Promise.all([settings(env),deps.dailySettings(env),identity(env,user)]);
 const [activities,posts,claims,dayProgress,dayClaim]=await Promise.all([
  activityCounts(env,user,period),savedPosts(env,user,period,verification,daily),env.DB.prepare('SELECT quest_id,message_id FROM quest_weekly_claims_v1 WHERE user_id=? AND week_key=? AND status=\'COMPLETED\'').bind(user.id,period.weekKey).all(),
  env.DB.prepare('SELECT post_count,last_checked_at FROM wago_daily_post_progress_v2 WHERE user_id=? AND quest_date=?').bind(user.id,period.today).first(),
  env.DB.prepare('SELECT reward_coin,claimed_at FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?').bind(user.id,period.today).first()
 ]);
 const verified=Boolean(verification),excluded=deps.excluded(user,daily),blocked=!verified||excluded;
 return {period,verified,excluded,playdkName:verification?.provider_name||'',
  daily:{id:'DAILY_POST',title:'PLAY DK 게시글 작성',target:15,unit:'개',count:Number(dayProgress?.post_count||0),checkedAt:dayProgress?.last_checked_at||null,claimed:Boolean(dayClaim),rewardType:'COIN',rewardAmount:Number(daily.postRewardCoin??0),rewardLabel:'코인',enabled:daily.enabled!==false&&daily.postEnabled!==false,blocked,description:'하루에 글 15개를 작성하고 일일 보상을 받으세요. 매일 00:00 KST에 초기화됩니다.'},
  weekly:WEEKLY_QUESTS.map(q=>({...q,...config.quests[q.id],rewardLabel:QUEST_REWARDS[config.quests[q.id]?.rewardType]||'',count:q.id==='POST'?Number(posts?.post_count||0):activities[q.id].count,
   available:q.id==='POST'?Boolean(posts):activities[q.id].available,checkedAt:q.id==='POST'?posts?.checked_at||null:null,days:q.id==='POST'?parse(posts?.days_json,[]):[],
   claimed:(claims.results||[]).some(row=>row.quest_id===q.id),blocked}))};
}
export async function claimWeeklyQuest(env,user,questId,deps){
 const quest=WEEKLY_QUESTS.find(q=>q.id===questId);if(!quest)fail('지원하지 않는 주간 퀘스트입니다.',400);
 const period=questPeriod(deps.now?.()),cfg=await settings(env),reward=cfg.value.quests[quest.id];
 const existing=await env.DB.prepare("SELECT message_id FROM quest_weekly_claims_v1 WHERE user_id=? AND week_key=? AND quest_id=? AND status='COMPLETED'").bind(user.id,period.weekKey,quest.id).first();
 if(existing)return {ok:true,replayed:true,messageId:existing.message_id,delivery:'MESSAGE'};
 if(!reward?.enabled||!QUEST_REWARDS[reward.rewardType]||!Number.isSafeInteger(reward.rewardAmount)||reward.rewardAmount<=0)fail('보상 설정 후 운영자가 지급을 시작할 예정입니다.');
 if(quest.id==='POST')await checkWeeklyPosts(env,user,deps,{force:true});
 const status=await questHubStatus(env,user,deps),progress=status.weekly.find(q=>q.id===quest.id);
 if(status.period.weekKey!==period.weekKey)fail('새 주간이 시작되었습니다. 다시 확인해 주세요.');
 if(progress.blocked)fail('PLAY DK 2차 인증 및 퀘스트 이용 상태를 확인하세요.',403);
 if(!progress.available||progress.count<quest.target)fail('아직 퀘스트 목표를 달성하지 못했습니다.');
 await deps.ensureMessages(env);
 const verification=await identity(env,user),token=crypto.randomUUID(),campaign=`weekly-quest:${period.weekKey}:${quest.id}`,db=env.DB,p=(sql,...args)=>db.prepare(sql).bind(...args);
 const guard="EXISTS(SELECT 1 FROM quest_weekly_claims_v1 WHERE claim_token=? AND status='PENDING')";
 const writes=[];
 if(db.dialect==='postgres')writes.push(p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id),p('SELECT key FROM app_meta WHERE key=? FOR SHARE',QUEST_SETTINGS_KEY));
 writes.push(p(`INSERT OR IGNORE INTO quest_weekly_claims_v1(user_id,week_key,quest_id,claim_token,status,progress,reward_type,reward_amount)
  SELECT ?,?,?,?,'PENDING',?,?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
  AND EXISTS(SELECT 1 FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK' AND provider_user_id=?)
  AND CURRENT_TIMESTAMP>=? AND CURRENT_TIMESTAMP<?`,user.id,period.weekKey,quest.id,token,progress.count,reward.rewardType,reward.rewardAmount,QUEST_SETTINGS_KEY,cfg.raw,user.id,verification?.provider_user_id||'',period.start,period.end));
 writes.push(p(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
  SELECT ?,'SYSTEM',?,?,'ITEM_REWARD',? WHERE ${guard}`,user.id,`주간퀘스트 · ${quest.title}`,`${period.weekKey} ~ ${period.lastDate}\n${quest.title} ${quest.target}${quest.unit} 달성 보상입니다.`,campaign,token));
 writes.push(p(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
  SELECT id,user_id,?,? FROM user_messages WHERE user_id=? AND campaign_key=? AND ${guard}`,reward.rewardType,reward.rewardAmount,user.id,campaign,token));
 // CHECK rejects incomplete delivery, rolling back the entire message + receipt batch.
 writes.push(p(`UPDATE quest_weekly_claims_v1 SET message_id=(SELECT id FROM user_messages WHERE user_id=? AND campaign_key=?),
  status=CASE WHEN EXISTS(SELECT 1 FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id WHERE m.user_id=? AND m.campaign_key=? AND r.user_id=m.user_id AND r.reward_type=? AND r.reward_amount=?) THEN 'COMPLETED' ELSE 'INVALID' END WHERE claim_token=?`,user.id,campaign,user.id,campaign,reward.rewardType,reward.rewardAmount,token));
 await db.batch(writes);
 const receipt=await db.prepare("SELECT message_id,claim_token FROM quest_weekly_claims_v1 WHERE user_id=? AND week_key=? AND quest_id=? AND status='COMPLETED'").bind(user.id,period.weekKey,quest.id).first();
 if(!receipt)fail('주간 또는 보상 설정이 변경되었습니다. 새로 확인해 주세요.');
 return {ok:true,replayed:receipt.claim_token!==token,messageId:receipt.message_id,delivery:'MESSAGE'};
}
export async function handleQuestHub({path,request,env,deps}){
 if(!path.startsWith('quests/')&&path!=='admin/weekly-quests')return null;
 try{
  const adminPath=path==='admin/weekly-quests',user=await (adminPath?deps.requirePermission(request,env,'USER_MANAGE'):deps.authenticate(request,env));
  if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  await deps.ensureDaily(env);await ensureQuestHub(env);
  if(adminPath){
   const before=await settings(env);
   if(request.method==='GET')return deps.json({settings:before.value,definitions:WEEKLY_QUESTS,rewardTypes:QUEST_REWARDS,period:questPeriod(deps.now?.()),canEdit:user.role==='OWNER'});
   if(request.method!=='PATCH')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   if(user.role!=='OWNER')return deps.json({error:'OWNER만 보상을 설정할 수 있습니다.'},403);
   const body=await deps.readBody(request);if(body.revision!==before.value.revision)fail('다른 운영자가 설정을 변경했습니다. 새로고침 후 다시 저장하세요.');
   const next={...validateQuestSettings(body.settings,before.value),operationToken:crypto.randomUUID()},value=JSON.stringify(next);
   const batch=await env.DB.batch([
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(value,QUEST_SETTINGS_KEY,before.raw),
    env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'WEEKLY_QUEST_SETTINGS','APP_META',?,?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)").bind(user.id,QUEST_SETTINGS_KEY,before.raw,value,QUEST_SETTINGS_KEY,value)
   ]);
   if(!batch[0]?.meta?.changes)fail('설정이 변경되었습니다. 새로고침 후 다시 저장하세요.');
   return deps.json({ok:true,settings:next});
  }
  if(path==='quests/status'&&request.method==='GET')return deps.json(await questHubStatus(env,user,deps));
  if(path==='quests/weekly/check'&&request.method==='POST')return deps.json({ok:true,...await checkWeeklyPosts(env,user,deps)});
  if(path==='quests/weekly/claim'&&request.method==='POST'){const body=await deps.readBody(request);return deps.json(await claimWeeklyQuest(env,user,String(body.questId||''),deps))}
  return deps.json({error:'지원하지 않는 퀘스트 요청입니다.'},404);
 }catch(error){return deps.json({error:error?.status===400||error?.status===403||error?.status===409?error.message:'퀘스트 집계를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',code:'QUEST_HUB_ERROR'},[400,401,403,409,429].includes(error.status)?error.status:502)}
}

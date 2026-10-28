import {MADARA_LINES,MADARA_ROLES,createMadaraRoom,addMadaraMember,readyMadaraMember,startMadaraRoom,actMadaraRoom,leaveMadaraRoom,kickMadaraMember,tickMadaraRoom,madaraView,madaraBattlePayload} from './_raid_madara.js';
import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {ensurePetOpeningItems} from './_pet_opening.js';
import {readRewardRevealPolicy} from './_reward_reveal.js';
import {madaraWeeklyReward,madaraRewardFor,prepareMadaraRewards,madaraCounterChanged} from './_raid_madara_rewards.js';
import {originalRaidPresentation,presentVarsenTicket} from '../shared/monster-original-ip-presentation-v1.mjs';

export const MADARA_TICKET='MADARA_RAID_ENTRY_TICKET',MADARA_SETTINGS='raid_madara_settings_v1';
const ROOMS='raid_madara_rooms_v1',ACTIVE='raid_madara_active_v1',RECEIPTS='raid_madara_receipts_v1';
const fail=(code,message,status=409)=>{throw jointError('MADARA_'+code,message,status);};
const owner=user=>user?.role==='OWNER',id=value=>String(value??''),integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export const defaultMadaraSettings=()=>({revision:0,mode:'TEST',testUserIds:[],bossCombatPower:440000,lobbyMinutes:15,enrageSeconds:360,mechanicTimePercent:100,entryTicketCost:1,testEntryFree:true,rewardsEnabled:false,weeklyRewardLimit:3,pigCoinReward:0,coinReward:0,masterStarReward:0,petEssenceReward:0});
export function validateMadaraSettings(raw){
  if(!raw||!integer(raw.revision,0,1e9)||!['OFF','TEST','ON'].includes(raw.mode)||!Array.isArray(raw.testUserIds)||raw.testUserIds.length>100||new Set(raw.testUserIds).size!==raw.testUserIds.length||!raw.testUserIds.every(n=>integer(n,1,Number.MAX_SAFE_INTEGER)))fail('SETTINGS','공개 모드와 테스트 계정(최대 100명)을 확인하세요.',400);
  const ranges={bossCombatPower:[1000,2000000000],lobbyMinutes:[1,60],enrageSeconds:[180,1800],mechanicTimePercent:[80,200],entryTicketCost:[0,10],weeklyRewardLimit:[1,30],coinReward:[0,1000000000000],masterStarReward:[0,100000000],petEssenceReward:[0,1000000]};
  const pigCoinReward=raw.pigCoinReward??0;if(!integer(pigCoinReward,0,1000000000))fail('SETTINGS','피그코인 수량을 확인하세요.',400);
  const next={revision:raw.revision,mode:raw.mode,testUserIds:[...raw.testUserIds].sort((a,b)=>a-b),pigCoinReward};
  for(const [key,range] of Object.entries(ranges)){if(!integer(raw[key],...range))fail('SETTINGS',`${key} 설정 범위(${range[0]}~${range[1]})를 확인하세요.`,400);next[key]=raw[key];}
  for(const key of ['testEntryFree','rewardsEnabled']){if(typeof raw[key]!=='boolean')fail('SETTINGS','입장·보상 사용 여부를 확인하세요.',400);next[key]=raw[key];}
  return next;
}
export function madaraAccess(user,cfg){const accessible=Boolean(user)&&(cfg.mode==='ON'||cfg.mode==='TEST'&&(owner(user)||cfg.testUserIds.includes(Number(user.id))));return {mode:cfg.mode,accessible,visible:accessible,owner:owner(user)};}
function requireAccess(user,cfg){if(cfg.mode==='OFF')fail('OFF','바르센 레이드는 현재 운영 중지 상태입니다.',423);if(!madaraAccess(user,cfg).accessible)fail('TEST_ONLY','지정된 바르센 테스트 참여자만 입장할 수 있습니다.',403);}
export async function ensureMadaraLive(env){
  if(readRuntimeData(env,'madara-live-schema-v1'))return;
  const sql=[
    `CREATE TABLE IF NOT EXISTS ${ROOMS}(room_id TEXT PRIMARY KEY,host_id BIGINT NOT NULL,host_name TEXT NOT NULL,status TEXT NOT NULL,state_json TEXT NOT NULL,version BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_madara_lobby_v1 ON ${ROOMS}(status,expires_at,created_at)`,
    `CREATE TABLE IF NOT EXISTS ${ACTIVE}(user_id BIGINT PRIMARY KEY,room_id TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_madara_active_room_v1 ON ${ACTIVE}(room_id)`,
    `CREATE TABLE IF NOT EXISTS ${RECEIPTS}(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,kind TEXT NOT NULL,input_json TEXT NOT NULL,room_id TEXT NOT NULL,response_json TEXT NOT NULL)`
  ];
  // PostgreSQL checks table ownership even for an existing CREATE INDEX IF
  // NOT EXISTS. The runtime role can use migrated tables without owning them.
  const ready=env.DB.dialect==='postgres'&&await env.DB.prepare(`SELECT 1 AS ready WHERE
    to_regclass('raid_madara_rooms_v1') IS NOT NULL AND to_regclass('raid_madara_active_v1') IS NOT NULL
    AND to_regclass('raid_madara_receipts_v1') IS NOT NULL AND to_regclass('idx_madara_lobby_v1') IS NOT NULL
    AND to_regclass('idx_madara_active_room_v1') IS NOT NULL`).first();
  if(!ready){if(typeof env.DB.execSchema==='function')await env.DB.execSchema(sql);else await env.DB.batch(sql.map(q=>env.DB.prepare(q)));}
  await ensureJointAtomicSchema(env);await ensurePetOpeningItems(env);
  const ticket=presentVarsenTicket({code:MADARA_TICKET,image_url:''});
  await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,image_url=excluded.image_url')
    .bind(MADARA_TICKET,ticket.name,ticket.subtitle,'공대 생성 시 설정된 수량을 사용합니다. 참가자는 무료이며 생성 후 반환되지 않습니다.','ENTRY_TICKET','ZENITH',ticket.image_url,128).run();
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(MADARA_SETTINGS,JSON.stringify(defaultMadaraSettings())).run();
  cacheRuntimeData(env,'madara-live-schema-v1',true,1800000);
}
export async function madaraSettingsRow(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MADARA_SETTINGS).first();
  if(!row)return {raw:null,settings:defaultMadaraSettings()};
  try{return {raw:row.value,settings:validateMadaraSettings(JSON.parse(row.value))};}catch{fail('SETTINGS_UNAVAILABLE','바르센 운영 설정을 불러오지 못했습니다.',503);}
}
async function selectedUsers(env,ids){if(!ids.length)return [];const r=await env.DB.prepare('SELECT id,nickname,role,status,banned_until FROM users WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id').bind(...ids).all();return r.results.map(u=>({...u,id:Number(u.id)}));}
async function saveSettings(env,user,body,before){
  const next=validateMadaraSettings(body.settings);if(next.revision!==before.settings.revision)fail('SETTINGS_CONFLICT','다른 창에서 설정을 바꿨습니다. 다시 불러오세요.');
  if((await selectedUsers(env,next.testUserIds)).length!==next.testUserIds.length)fail('TEST_USERS','존재하지 않는 계정이 포함되어 있습니다.',400);
  next.revision++;const token=crypto.randomUUID(),raw=JSON.stringify({...next,saveToken:token,updatedBy:Number(user.id)});
  const write=before.raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(MADARA_SETTINGS,raw):env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,MADARA_SETTINGS,before.raw);
  try{await env.DB.batch([write,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[MADARA_SETTINGS,raw]),env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'MADARA_RAID_SETTINGS','RAID',?,?,?)").bind(user.id,MADARA_SETTINGS,before.raw,raw),jointGuardEnd(env.DB,token)]);}
  catch(error){if((await madaraSettingsRow(env)).raw!==raw)fail('SETTINGS_CONFLICT','설정 저장이 충돌했습니다. 다시 불러오세요.');throw error;}
  return {ok:true,settings:next,testUsers:await selectedUsers(env,next.testUserIds)};
}
async function receipt(env,user,kind,body){
  if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))fail('REQUEST_ID','요청 식별자가 필요합니다.',400);
  const input={...body};delete input.requestId;
  const key=id(user.id)+':'+body.requestId,signature=JSON.stringify([kind,Object.keys(input).sort().map(k=>[k,input[k]])]);
  const row=await env.DB.prepare(`SELECT * FROM ${RECEIPTS} WHERE request_id=?`).bind(key).first();
  if(row&&(Number(row.user_id)!==Number(user.id)||row.kind!==kind||row.input_json!==signature))fail('REQUEST_CONFLICT','같은 요청 식별자의 내용이 달라졌습니다.');
  return {key,signature,result:row?JSON.parse(row.response_json):null};
}
const receiptWrite=(env,user,kind,key,roomId,result)=>env.DB.prepare(`INSERT INTO ${RECEIPTS}(request_id,user_id,kind,input_json,room_id,response_json) VALUES(?,?,?,?,?,?)`).bind(key.key,user.id,kind,key.signature,roomId,JSON.stringify(result));
async function loadRoom(env,roomId){const row=await env.DB.prepare(`SELECT * FROM ${ROOMS} WHERE room_id=?`).bind(roomId).first();if(!row)fail('ROOM_MISSING','공대를 찾을 수 없습니다.',404);return {row,room:JSON.parse(row.state_json)};}
function memberOf(room,user){if(room.banned.includes(id(user.id)))fail('KICKED','강퇴된 공대에는 다시 참가할 수 없습니다.',403);const me=room.members.find(m=>m.id===id(user.id)&&!m.left);if(!me)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);return me;}
function tick(room,now){tickMadaraRoom(room,Math.max(now,room.clock));if(room.status==='LOBBY'&&now>=room.lobbyEndsAt){room.status='CANCELLED';room.finishedAt=now;room.failure={code:'LOBBY_EXPIRED',reason:'공대 모집 시간이 끝났습니다.'};}}
async function commitRoom(env,row,room,extra=[],plan){
  plan??=await prepareMadaraRewards(env,row,room);const token=crypto.randomUUID(),version=Number(row.version)+1;room.commitToken=token;const raw=JSON.stringify(room);
  try{await env.DB.batch([env.DB.prepare(`UPDATE ${ROOMS} SET state_json=?,status=?,host_id=?,host_name=?,version=? WHERE room_id=? AND version=?`).bind(raw,room.status,Number(room.hostId||row.host_id),room.members.find(m=>m.id===room.hostId)?.name||row.host_name,version,room.id,Number(row.version)),
    jointGuard(env.DB,token,`EXISTS(SELECT 1 FROM ${ROOMS} WHERE room_id=? AND version=? AND state_json=?)`,[room.id,version,raw]),...plan.statements,...extra,
    ...(!['LOBBY','ACTIVE'].includes(room.status)?[env.DB.prepare(`DELETE FROM ${ACTIVE} WHERE room_id=?`).bind(room.id)]:[]),jointGuardEnd(env.DB,token)]);}
  catch(error){if(await madaraCounterChanged(env,plan))fail('WEEKLY_CONFLICT','주간 보상 정산이 갱신 중입니다. 같은 요청으로 다시 시도하세요.');throw error;}
}
async function advanceRoom(env,roomId,now){
  for(let retry=0;retry<4;retry++){const loaded=await loadRoom(env,roomId),{room}=loaded;const before=[room.status,room.revision,room.eventSeq,room.step].join(':');tick(room,now);
    if(before===[room.status,room.revision,room.eventSeq,room.step].join(':'))return loaded;
    try{await commitRoom(env,loaded.row,room);return {room,row:{...loaded.row,version:Number(loaded.row.version)+1}};}
    catch(error){if(error.code!=='MADARA_WEEKLY_CONFLICT'&&Number((await loadRoom(env,roomId)).row.version)===Number(loaded.row.version))throw error;}
  }fail('BUSY','공대 전황이 갱신 중입니다. 같은 요청으로 다시 시도하세요.');
}
async function currentRoom(env,user,now){const row=await env.DB.prepare(`SELECT room_id FROM ${ACTIVE} WHERE user_id=?`).bind(user.id).first();if(!row)return null;const loaded=await advanceRoom(env,row.room_id,now);return ['LOBBY','ACTIVE'].includes(loaded.room.status)?loaded:null;}
const varsen=originalRaidPresentation('MADARA');
const boss=power=>({id:'MADARA',name:varsen.name,isBoss:true,is_boss:1,battle_power:power,pve_hp_percent:250,pve_attack_percent:100,pve_defense_percent:100,pve_speed_percent:100,pve_forced_action_every:5,image:varsen.sourceArt,battleSprite:varsen.battleSprite,spiritSprite:'/preview/madara-raid-v1/assets/azure-spirit-v1.png'});
const entryCost=cfg=>cfg.mode==='TEST'&&cfg.testEntryFree?0:cfg.entryTicketCost;
async function account(env,user,cfg,roomId){const row=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,MADARA_TICKET).first();return {id:id(user.id),name:user.nickname,tickets:Math.max(0,Number(row?.quantity||0)),cost:entryCost(cfg),temporary:false,roomId};}
function resultFor(room,user,cfg,{payload=false,since=0}={}){
  memberOf(room,user);const state=madaraView(room,id(user.id),{since});state.release={mode:room.releaseMode,currentMode:cfg.mode,runtimeEnabled:true,rewardLocked:!room.rewardPolicy?.enabled,scope:'LIVE'};state.lobbyEndsAt=room.lobbyEndsAt;state.clearReward=madaraRewardFor(room,user.id);
  return {ok:true,roomId:room.id,state,...(payload?{payload:{...madaraBattlePayload(room,id(user.id)),reviewOnly:false}}:{})};
}
async function openRoom(env,user,cfg,body,deps,now){
  const prior=await receipt(env,user,'create',body);if(prior.result)return prior.result;
  if(body.clientRulesVersion!==2)fail('CLIENT_UPDATE','새로고침 후 공대를 만들어 주세요. 입장권은 사용되지 않았습니다.');
  if(await currentRoom(env,user,now))fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');
  const deck=await deps.raidDeckPower(env,user.id,undefined,'RAID'),roomId=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
  const room=createMadaraRoom({id:roomId,hostId:id(user.id),monster:boss(cfg.bossCombatPower),now,seed:crypto.getRandomValues(new Uint32Array(1))[0],settings:{enrageSeconds:cfg.enrageSeconds,mechanicTimePercent:cfg.mechanicTimePercent}});
  addMadaraMember(room,{id:id(user.id),name:user.nickname,role:body.role,deck},now);room.releaseMode=cfg.mode;room.settingsRevision=cfg.revision;room.lobbyEndsAt=now+cfg.lobbyMinutes*60000;room.joinCount=1;
  const cost=entryCost(cfg),token=crypto.randomUUID(),response=resultFor(room,user,cfg);response.entryReceipt={cost,roomId};
  const extra=cost?[jointGuard(env.DB,token+':ticket','EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)',[user.id,MADARA_TICKET,cost]),
    env.DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=CASE WHEN unseen_quantity>quantity-? THEN quantity-? ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=?').bind(cost,cost,cost,user.id,MADARA_TICKET,cost),
    env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'바르센 공대 생성','MADARA_RAID_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(-cost,roomId,user.id,MADARA_TICKET),jointGuardEnd(env.DB,token+':ticket')]:[];
  try{await env.DB.batch([env.DB.prepare(`INSERT INTO ${ACTIVE}(user_id,room_id) VALUES(?,?)`).bind(user.id,roomId),...extra,
    env.DB.prepare(`INSERT INTO ${ROOMS}(room_id,host_id,host_name,status,state_json,version,created_at,expires_at) VALUES(?,?,?,?,?,0,?,?)`).bind(roomId,user.id,user.nickname,room.status,JSON.stringify(room),now,room.lobbyEndsAt),receiptWrite(env,user,'create',prior,roomId,response)]);}
  catch(error){const replay=await receipt(env,user,'create',body);if(replay.result)return replay.result;if((await account(env,user,cfg,null)).tickets<cost)fail('TICKET_REQUIRED',`바르센 레이드 입장권 ${cost}장이 필요합니다.`);if(await currentRoom(env,user,now))fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');throw error;}
  return response;
}
async function roomCommand(env,user,cfg,kind,body,deps,now,since){
  const prior=await receipt(env,user,kind,body);if(prior.result)return prior.result;
  if(typeof body.roomId!=='string'||! /^[A-F0-9]{10}$/.test(body.roomId))fail('ROOM_ID','참가할 공대를 선택하세요.',400);
  if(kind==='join'){const active=await currentRoom(env,user,now);if(active&&active.room.id!==body.roomId)fail('ALREADY_JOINED','다른 공대에 참가 중입니다.');}
  for(let retry=0;retry<4;retry++){
    const {row,room}=await loadRoom(env,body.roomId);now=Math.max(Date.now(),now,room.clock);tick(room,now);const extra=[];
    if(room.banned.includes(id(user.id)))fail('KICKED','강퇴된 공대에는 다시 참가할 수 없습니다.',403);
    if(['join','ready','start'].includes(kind)&&body.clientRulesVersion!==2)fail('CLIENT_UPDATE','새로고침 후 다시 참가·준비해 주세요.');
    if(kind==='join'){
      if(room.status!=='LOBBY')fail('STARTED','이미 출정했거나 모집이 끝난 공대입니다.');
      if(!room.members.some(m=>m.id===id(user.id))){if(room.joinCount>=100)fail('JOIN_LIMIT','참가 변경 한도를 초과했습니다.');addMadaraMember(room,{id:id(user.id),name:user.nickname,role:body.role,deck:await deps.raidDeckPower(env,user.id,undefined,'RAID')},now);room.joinCount++;extra.push(env.DB.prepare(`INSERT INTO ${ACTIVE}(user_id,room_id) VALUES(?,?)`).bind(user.id,room.id));}
    }else{
      const me=memberOf(room,user);
      if(!['LOBBY','ACTIVE'].includes(room.status)&&kind!=='leave')fail('FINISHED','종료된 공대입니다.');
      if(kind==='ready'){
        if(typeof body.ready!=='boolean')fail('READY','준비 상태를 확인하세요.',400);
        if(body.ready){const deck=await deps.raidDeckPower(env,user.id,undefined,'RAID');const position=room.members.indexOf(me);room.members.splice(position,1);room.fighters=room.fighters.filter(f=>f.ownerId!==me.id);delete room.loadouts[me.id];addMadaraMember(room,{id:me.id,name:me.name,role:me.role,deck},now);room.members.splice(position,0,room.members.pop());}
        readyMadaraMember(room,id(user.id),body.ready);
      }else if(kind==='start'){
        const users=await selectedUsers(env,room.members.map(m=>Number(m.id)));
        if(users.length!==room.members.length||users.some(u=>u.status!=='ACTIVE'||Date.parse(u.banned_until||'')>now||!madaraAccess(u,cfg).accessible))fail('MEMBER_ACCESS','참가자의 계정 상태와 TEST 권한을 확인하세요.',403);
        startMadaraRoom(room,id(user.id),now);room.rewardPolicy={enabled:cfg.mode==='ON'&&room.releaseMode==='ON'&&cfg.rewardsEnabled,coin:cfg.coinReward,masterStars:cfg.masterStarReward,petEssence:cfg.petEssenceReward,pigCoins:cfg.pigCoinReward,weeklyLimit:cfg.weeklyRewardLimit,settingsRevision:cfg.revision};
        room.revealPolicy=cfg.mode==='ON'&&room.releaseMode==='ON'?await readRewardRevealPolicy(env,'MADARA'):null;
      }else if(kind==='kick'){kickMadaraMember(room,id(user.id),id(body.targetId),now);extra.push(env.DB.prepare(`DELETE FROM ${ACTIVE} WHERE user_id=? AND room_id=?`).bind(Number(body.targetId),room.id));}
      else if(kind==='leave'){leaveMadaraRoom(room,id(user.id),now);extra.push(env.DB.prepare(`DELETE FROM ${ACTIVE} WHERE user_id=? AND room_id=?`).bind(user.id,room.id));if(!room.members.some(m=>!m.left)){room.status='CANCELLED';room.finishedAt=now;}}
      else if(kind==='action'){if(body.actorId!==undefined&&id(body.actorId)!==id(user.id))fail('ACTOR','자신의 역할만 조작할 수 있습니다.',403);actMadaraRoom(room,id(user.id),{requestId:body.requestId,action:body.action,taskId:body.taskId,token:body.token,target:body.target,actorId:id(user.id)},now);}
      else fail('ROUTE','지원하지 않는 공대 명령입니다.',404);
    }
    const plan=await prepareMadaraRewards(env,row,room),result=kind==='leave'?{ok:true,roomId:room.id}:resultFor(room,user,cfg,{payload:kind==='start',since});
    extra.push(receiptWrite(env,user,kind,prior,room.id,result));
    try{await commitRoom(env,row,room,extra,plan);return result;}catch(error){const replay=await receipt(env,user,kind,body);if(replay.result)return replay.result;if(error.code!=='MADARA_WEEKLY_CONFLICT'&&Number((await loadRoom(env,room.id)).row.version)===Number(row.version))throw error;}
  }fail('BUSY','공대 명령이 갱신 중입니다. 같은 요청으로 다시 시도하세요.');
}
export async function handleMadaraRaid({path,request,env,deps}){
  if(!path.startsWith('raid/madara/')&&!path.startsWith('admin/raid/madara/'))return null;
  const json=(value,status=200)=>{if(value.state)value.state.responseNow=Date.now();const response=deps.json(value,status);response.headers.set('cache-control','private, no-store');return response;};
  try{
    const user=await deps.authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    if(path.startsWith('admin/')&&!owner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    await ensureMadaraLive(env);const before=await madaraSettingsRow(env),cfg=before.settings,url=new URL(request.url),now=Date.now();
    if(path==='admin/raid/madara/test-users'&&request.method==='GET'){
      const query=String(url.searchParams.get('q')||'').trim();if(!query||query.length>80)fail('QUERY','정확한 닉네임 또는 계정번호를 입력하세요.',400);
      const numeric=/^[1-9]\d{0,15}$/.test(query)&&Number.isSafeInteger(Number(query));
      const r=await(numeric?env.DB.prepare('SELECT id,nickname FROM users WHERE id=? OR nickname=? ORDER BY id LIMIT 20').bind(Number(query),query):env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? ORDER BY id LIMIT 20').bind(query)).all();return json({users:r.results.map(u=>({...u,id:Number(u.id)}))});
    }
    if(path==='admin/raid/madara/settings'){
      if(request.method==='GET')return json({ok:true,settings:cfg,testUsers:await selectedUsers(env,cfg.testUserIds)});
      if(request.method==='POST')return json(await saveSettings(env,user,await readJointBody(request,{fields:['settings'],maxBytes:16384}),before));
      return json({error:'지원하지 않는 요청입니다.'},405);
    }
    if(path==='raid/madara/feature'&&request.method==='GET')return json({ok:true,...madaraAccess(user,cfg)});
    const kind=path.slice('raid/madara/'.length);if(kind!=='leave')requireAccess(user,cfg);
    if(kind==='lobby'&&request.method==='GET'){
      const active=await currentRoom(env,user,now),list=await env.DB.prepare(`SELECT state_json FROM ${ROOMS} WHERE status='LOBBY' AND expires_at>? ORDER BY created_at DESC LIMIT 40`).bind(now).all();
      const rooms=list.results.map(row=>{const r=JSON.parse(row.state_json);return {id:r.id,hostName:r.members.find(m=>m.id===r.hostId)?.name||'공대장',status:r.status,createdAt:r.createdAt,members:r.members.length,maxMembers:6,roles:Object.fromEntries(Object.keys(MADARA_ROLES).map(role=>[role,r.members.filter(m=>m.role===role).length])),canJoin:!active&&r.members.length<6&&!r.banned.includes(id(user.id)),blocked:r.banned.includes(id(user.id))?'강퇴된 공대':active?'공대 참가 중':'인원 마감'};});
      return json({ok:true,account:await account(env,user,cfg,active?.room.id||null),rooms,feature:madaraAccess(user,cfg),weeklyReward:await madaraWeeklyReward(env,user.id,cfg.weeklyRewardLimit,now),settings:{enrageSeconds:cfg.enrageSeconds,mechanicTimePercent:cfg.mechanicTimePercent,rewardsEnabled:cfg.rewardsEnabled,coinReward:cfg.coinReward,pigCoinReward:cfg.pigCoinReward,masterStarReward:cfg.masterStarReward,petEssenceReward:cfg.petEssenceReward,weeklyRewardLimit:cfg.weeklyRewardLimit},serverNow:now});
    }
    if(kind==='state'&&request.method==='GET'){
      const roomId=url.searchParams.get('roomId')||(await currentRoom(env,user,now))?.room.id;if(!roomId)fail('ROOM_MISSING','참가 중인 공대가 없습니다.',404);
      memberOf((await loadRoom(env,roomId)).room,user); // Do not advance or disclose another party on an unauthorized request.
      const loaded=await advanceRoom(env,roomId,now),result=resultFor(loaded.room,user,cfg,{payload:url.searchParams.get('payload')==='1',since:Math.max(0,Number(url.searchParams.get('since'))||0)});
      return json({...result,account:await account(env,user,cfg,loaded.room.id)});
    }
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const fields={create:['requestId','role','clientRulesVersion'],join:['requestId','roomId','role','clientRulesVersion'],ready:['requestId','roomId','ready','clientRulesVersion'],start:['requestId','roomId','clientRulesVersion'],kick:['requestId','roomId','targetId'],leave:['requestId','roomId'],action:['requestId','roomId','actorId','action','taskId','token','target']}[kind];if(!fields)fail('ROUTE','지원하지 않는 공대 명령입니다.',404);
    const body=await readJointBody(request,{fields});
    const result=await deps.withUserMutationLock(env,user.id,path,()=>kind==='create'?openRoom(env,user,cfg,body,deps,now):roomCommand(env,user,cfg,kind,body,deps,now,Math.max(0,Number(url.searchParams.get('since'))||0)));
    return json({...result,account:await account(env,user,cfg,kind==='leave'?null:result.roomId)});
  }catch(error){const known=Number.isInteger(error.status);return json({ok:false,error:known?error.message:'요청을 완료하지 못했습니다. 같은 요청으로 다시 시도하세요.',code:known?error.code:'MADARA_RETRYABLE',retryable:!known||['MADARA_BUSY','MADARA_WEEKLY_CONFLICT'].includes(error.code)||error.status>=500},known?error.status:503);}
}

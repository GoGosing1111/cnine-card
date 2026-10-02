import {createLichRoom,addLichMember,setLichLoadout,removeLichLoadout,startLichRoom,tickLichRoom,actLichRoom,lichView,lichBattlePayload,ROLES} from './_raid_lich_king.js';
import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {reconcileCoopDuties} from './_raid_lich_coop.js';

export const LICH_TICKET='LICH_KING_ENTRY_TICKET';
export const LICH_SETTINGS='raid_lich_settings_v1';
const ROOMS='raid_lich_rooms_v1',ACTIVE='raid_lich_active_v1',RECEIPTS='raid_lich_receipts_v1';
const fail=(code,message,status=409)=>{throw jointError('LICH_'+code,message,status);};
const owner=user=>user?.role==='OWNER';
const id=value=>String(value??'');
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const readJson=value=>JSON.parse(value);
export const defaultLichSettings=()=>({revision:0,mode:'TEST',testUserIds:[],bossCombatPower:320000,lobbyMinutes:15,rewardLocked:true});
export function lichAccess(user,settings){
  const accessible=Boolean(user)&&(settings.mode==='ON'||settings.mode==='TEST'&&(owner(user)||settings.testUserIds.includes(Number(user.id))));
  return {mode:settings.mode,accessible,visible:accessible,owner:owner(user),rewardLocked:true};
}
export function validateLichSettings(raw){
  if(!raw||!integer(raw.revision,0,1e9)||!['ON','TEST','OFF'].includes(raw.mode)||
    !Array.isArray(raw.testUserIds)||raw.testUserIds.length>100||new Set(raw.testUserIds).size!==raw.testUserIds.length||
    !raw.testUserIds.every(n=>integer(n,1,Number.MAX_SAFE_INTEGER))||!integer(raw.bossCombatPower,1000,2000000000)||!integer(raw.lobbyMinutes,1,60))
    fail('SETTINGS','공개 모드, 테스트 계정(최대 100명), 고정 전투력, 모집 시간을 확인하세요.',400);
  return {revision:raw.revision,mode:raw.mode,testUserIds:[...raw.testUserIds].sort((a,b)=>a-b),bossCombatPower:raw.bossCombatPower,lobbyMinutes:raw.lobbyMinutes,rewardLocked:true};
}
export async function ensureLichLive(env){
  if(readRuntimeData(env,'lich-live-schema-v1'))return;
  const sql=[
    'CREATE TABLE IF NOT EXISTS '+ROOMS+'(room_id TEXT PRIMARY KEY,host_id BIGINT NOT NULL,host_name TEXT NOT NULL,status TEXT NOT NULL,state_json TEXT NOT NULL,version BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS idx_lich_rooms_lobby_v1 ON '+ROOMS+'(status,expires_at,created_at)',
    'CREATE TABLE IF NOT EXISTS '+ACTIVE+'(user_id BIGINT PRIMARY KEY,room_id TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS idx_lich_active_room_v1 ON '+ACTIVE+'(room_id)',
    'CREATE TABLE IF NOT EXISTS '+RECEIPTS+'(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,kind TEXT NOT NULL,input_json TEXT NOT NULL,room_id TEXT NOT NULL,response_json TEXT NOT NULL)'
  ];
  if(typeof env.DB.execSchema==='function')await env.DB.execSchema(sql);
  else await env.DB.batch(sql.map(q=>env.DB.prepare(q)));
  await ensureJointAtomicSchema(env);
  await env.DB.prepare("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING")
    .bind(LICH_TICKET,'리치왕 정벌 입장권','FROZEN THRONE ENTRY','공대장이 공대를 만들 때 1장 소모. 참가자는 추가 차감 없이 입장하며 공대장이 역할을 배분합니다.','ENTRY_TICKET','ZENITH','assets/items/lich-king-entry-ticket-v1.svg',127).run();
  cacheRuntimeData(env,'lich-live-schema-v1',true,1800000);
}
async function settingsRow(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LICH_SETTINGS).first();
  if(!row)return {raw:null,settings:defaultLichSettings()};
  try{return {raw:row.value,settings:validateLichSettings(readJson(row.value))};}
  catch{fail('SETTINGS_UNAVAILABLE','리치왕 운영 설정을 불러오지 못했습니다.',503);}
}
async function selectedUsers(env,ids){
  if(!ids.length)return [];
  const r=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id').bind(...ids).all();
  return r.results.map(row=>({...row,id:Number(row.id)}));
}
async function saveSettings(env,user,body,before){
  const next=validateLichSettings(body.settings);
  if(next.revision!==before.settings.revision)fail('SETTINGS_CONFLICT','다른 창에서 설정을 바꿨습니다. 다시 불러오세요.');
  if((await selectedUsers(env,next.testUserIds)).length!==next.testUserIds.length)fail('TEST_USERS','존재하지 않는 계정이 포함되어 있습니다.',400);
  next.revision++;const token=crypto.randomUUID(),raw=JSON.stringify({...next,saveToken:token,updatedBy:Number(user.id)});
  const write=before.raw===null
    ?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(LICH_SETTINGS,raw)
    :env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,LICH_SETTINGS,before.raw);
  try{await env.DB.batch([write,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[LICH_SETTINGS,raw]),
    env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'LICH_RAID_SETTINGS','RAID',?,?,?)").bind(user.id,LICH_SETTINGS,before.raw,raw),jointGuardEnd(env.DB,token)]);}
  catch(error){if((await settingsRow(env)).raw!==raw)fail('SETTINGS_CONFLICT','설정 저장이 충돌했습니다. 다시 불러오세요.');throw error;}
  return {ok:true,settings:next,testUsers:await selectedUsers(env,next.testUserIds)};
}
function requireAccess(user,cfg){
  if(cfg.mode==='OFF')fail('OFF','리치왕 정벌은 현재 운영 중지 상태입니다.',423);
  if(!lichAccess(user,cfg).accessible)fail('TEST_ONLY','지정된 리치왕 테스트 참여자만 입장할 수 있습니다.',403);
}
function requestIdentity(user,kind,body){
  if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))fail('REQUEST_ID','요청 식별자가 필요합니다.',400);
  const input={...body};delete input.requestId;
  return {key:String(user.id)+':'+body.requestId,signature:JSON.stringify([kind,Object.keys(input).sort().map(k=>[k,input[k]])])};
}
async function receipt(env,user,kind,body){
  const key=requestIdentity(user,kind,body),row=await env.DB.prepare('SELECT * FROM '+RECEIPTS+' WHERE request_id=?').bind(key.key).first();
  if(row&&(Number(row.user_id)!==Number(user.id)||row.kind!==kind||row.input_json!==key.signature))fail('REQUEST_CONFLICT','같은 요청 식별자를 다른 명령에 사용할 수 없습니다.');
  return {...key,result:row?readJson(row.response_json):null};
}
function receiptWrite(env,user,kind,key,roomId,result){
  return env.DB.prepare('INSERT INTO '+RECEIPTS+'(request_id,user_id,kind,input_json,room_id,response_json) VALUES(?,?,?,?,?,?)')
    .bind(key.key,user.id,kind,key.signature,roomId,JSON.stringify(result));
}
async function loadRoom(env,roomId){
  const row=await env.DB.prepare('SELECT * FROM '+ROOMS+' WHERE room_id=?').bind(roomId).first();
  if(!row)fail('ROOM_MISSING','공대를 찾을 수 없습니다.',404);
  return {row,room:readJson(row.state_json)};
}
function tick(room,now){
  tickLichRoom(room,Math.max(now,room.clock));
  if(room.status==='LOBBY'&&now>=room.lobbyEndsAt){room.status='CANCELLED';room.finishedAt=now;room.failure={code:'LOBBY_EXPIRED',reason:'공대 모집 시간이 끝났습니다.'};}
}
function memberOf(room,user){
  if(room.kicked?.includes(id(user.id)))fail('KICKED','공대장에 의해 강제퇴장되었습니다. 같은 공대에 재입장할 수 없습니다.',403);
  const member=room.members.find(m=>m.id===id(user.id));
  if(!member)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  return member;
}
function resultFor(room,user,cfg,{payload=false,since=0}={}){
  memberOf(room,user);
  const state=lichView(room,id(user.id),since);
  state.release={mode:room.releaseMode,currentMode:cfg.mode,rewardLocked:true,scope:'LIVE_TEST'};
  state.lobbyEndsAt=room.lobbyEndsAt;state.hostName=room.hostName;state.hostId=room.hostId;state.maxMembers=6;
  return {ok:true,state,...(payload?{payload:{...lichBattlePayload(room,id(user.id)),reviewOnly:false}}:{})};
}
async function commitRoom(env,row,room,extra=[]){
  const token=crypto.randomUUID(),version=Number(row.version)+1;
  room.commitToken=token;const raw=JSON.stringify(room);
  // CAS obtains the room row lock before any membership/economy statements.
  // A losing writer rolls its entire batch back rather than consuming a ticket.
  await env.DB.batch([
    env.DB.prepare('UPDATE '+ROOMS+' SET state_json=?,status=?,version=? WHERE room_id=? AND version=?').bind(raw,room.status,version,room.id,Number(row.version)),
    jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM '+ROOMS+' WHERE room_id=? AND version=? AND state_json=?)',[room.id,version,raw]),
    ...extra,
    ...(!['LOBBY','ACTIVE'].includes(room.status)?[env.DB.prepare('DELETE FROM '+ACTIVE+' WHERE room_id=?').bind(room.id)]:[]),
    jointGuardEnd(env.DB,token)
  ]);
}
async function advanceRoom(env,roomId,now){
  for(let retry=0;retry<3;retry++){
    const loaded=await loadRoom(env,roomId),{room}=loaded;
    const before=[room.status,room.eventSeq,room.step].join(':');tick(room,now);
    if(before===[room.status,room.eventSeq,room.step].join(':'))return loaded;
    try{await commitRoom(env,loaded.row,room);return {...loaded,row:{...loaded.row,version:Number(loaded.row.version)+1}};}
    catch(error){if((await loadRoom(env,roomId)).row.version===loaded.row.version)throw error;}
  }
  fail('BUSY','공대 전황이 갱신 중입니다. 다시 확인하세요.',409);
}
async function currentRoom(env,user,now){
  const row=await env.DB.prepare('SELECT room_id FROM '+ACTIVE+' WHERE user_id=?').bind(user.id).first();
  if(!row)return null;
  const loaded=await advanceRoom(env,row.room_id,now);
  if(!['LOBBY','ACTIVE'].includes(loaded.room.status))return null;
  return loaded;
}
const boss=power=>({id:'LICH_KING',name:'리치왕',isBoss:true,is_boss:1,battle_power:power,pve_hp_percent:240,pve_attack_percent:100,pve_defense_percent:100,pve_speed_percent:100,pve_forced_action_every:5,
  image:'/preview/lich-king-raid-poster-v1/lich-king-source-art-v1.png',battleSprite:'/preview/lich-king-raid-v1/assets/lich-king-battle-sd-v1.png'});
async function openRoom(env,user,cfg,body,deps,now){
  const prior=await receipt(env,user,'open',body);if(prior.result)return prior.result;
  const active=await currentRoom(env,user,now);
  if(active)fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다. 현재 공대로 복귀하세요.');
  const deck=await deps.raidDeckPower(env,user.id,undefined,'RAID');
  const roomId='LK-'+crypto.randomUUID(),room=createLichRoom({id:roomId,hostId:id(user.id),mode:'PARTY',rulesVersion:2,cards:deck.cards,monster:boss(cfg.bossCombatPower),now,seed:crypto.getRandomValues(new Uint32Array(1))[0]});
  addLichMember(room,{id:id(user.id),name:user.nickname,role:'ASSAULT'});
  setLichLoadout(room,id(user.id),deck,user.nickname);
  room.members[0].ready=false;room.hostName=user.nickname;room.kicked=[];room.joinCount=1;
  room.lobbyEndsAt=now+cfg.lobbyMinutes*60000;room.releaseMode=cfg.mode;
  const token=crypto.randomUUID(),response={ok:true,roomId};
  await env.DB.batch([
    env.DB.prepare('INSERT INTO '+ACTIVE+'(user_id,room_id) VALUES(?,?)').bind(user.id,roomId),
    jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)',[user.id,LICH_TICKET]),
    env.DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=CASE WHEN unseen_quantity>quantity-1 THEN quantity-1 ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=1').bind(user.id,LICH_TICKET),
    env.DB.prepare('INSERT INTO '+ROOMS+'(room_id,host_id,host_name,status,state_json,version,created_at,expires_at) VALUES(?,?,?,?,?,0,?,?)').bind(roomId,user.id,user.nickname,room.status,JSON.stringify(room),now,room.lobbyEndsAt),
    env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,-1,quantity,'리치왕 공대 생성','LICH_RAID_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(roomId,user.id,LICH_TICKET),
    receiptWrite(env,user,'open',prior,roomId,response),jointGuardEnd(env.DB,token)
  ]).catch(async error=>{
    const replay=await receipt(env,user,'open',body);if(replay.result)return;
    const balance=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,LICH_TICKET).first();
    if(Number(balance?.quantity||0)<1)fail('TICKET_REQUIRED','리치왕 정벌 입장권 1장이 필요합니다.');
    if(await currentRoom(env,user,now))fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');
    throw error;
  });
  return (await receipt(env,user,'open',body)).result;
}
async function roomCommand(env,user,cfg,kind,body,deps,now,since=0){
  const prior=await receipt(env,user,kind,body);if(prior.result)return prior.result;
  if(typeof body.roomId!=='string'||!/^LK-[a-f0-9-]{36}$/.test(body.roomId))fail('ROOM_ID','참가할 공대를 선택하세요.',400);
  if(kind==='join'){
    const active=await currentRoom(env,user,now);
    if(active&&active.room.id!==body.roomId)fail('ALREADY_JOINED','다른 공대에 참가 중입니다.');
  }
  for(let retry=0;retry<3;retry++){
    const {row,room}=await loadRoom(env,body.roomId);now=Math.max(Date.now(),now,room.clock);tick(room,now);
    const extra=[],isHost=room.hostId===id(user.id);
    if(room.kicked.includes(id(user.id)))fail('KICKED','강제퇴장된 공대에는 다시 참가할 수 없습니다.',403);
    if(kind==='join'){
      if(room.status!=='LOBBY')fail('STARTED','이미 출정했거나 모집이 끝난 공대입니다.');
      if(!room.members.some(m=>m.id===id(user.id))){
        if(room.joinCount>=100)fail('JOIN_LIMIT','공대의 참가 변경 한도를 초과했습니다.');
        addLichMember(room,{id:id(user.id),name:user.nickname,role:'ASSAULT'},now);
        setLichLoadout(room,id(user.id),await deps.raidDeckPower(env,user.id,undefined,'RAID'),user.nickname);
        room.members.at(-1).role='UNASSIGNED';room.members.at(-1).ready=false;room.joinCount++;
        extra.push(env.DB.prepare('INSERT INTO '+ACTIVE+'(user_id,room_id) VALUES(?,?)').bind(user.id,room.id));
      }
    }else{
      const me=memberOf(room,user);
      if(!['LOBBY','ACTIVE'].includes(room.status)&&kind!=='leave')fail('FINISHED','종료된 공대입니다.');
      if(kind==='assign'){
        if(!isHost)fail('HOST_ONLY','공대장만 역할을 배분할 수 있습니다.',403);
        if(!ROLES[body.role])fail('ROLE','정벌대·봉인대·구출대 중에서 선택하세요.',400);
        const target=room.members.find(m=>m.id===id(body.targetId));if(!target)fail('TARGET','참가자를 찾을 수 없습니다.',404);
        target.role=body.role;target.ready=false;room.revision++;
        reconcileCoopDuties(room);
      }else if(kind==='ready'){
        if(room.status!=='LOBBY'||!ROLES[me.role]||typeof body.ready!=='boolean')fail('READY','역할을 배정받은 뒤 준비하세요.');
        if(body.ready)setLichLoadout(room,id(user.id),await deps.raidDeckPower(env,user.id,undefined,'RAID'),user.nickname);
        me.ready=body.ready;room.revision++;
      }else if(kind==='kick'){
        if(!isHost)fail('HOST_ONLY','공대장만 강제퇴장할 수 있습니다.',403);
        if(id(body.targetId)===room.hostId)fail('HOST_KICK','공대장은 강제퇴장할 수 없습니다.',400);
        const target=room.members.find(m=>m.id===id(body.targetId));if(!target)fail('TARGET','참가자를 찾을 수 없습니다.',404);
        room.kicked.push(target.id);room.members=room.members.filter(m=>m!==target);room.revision++;
        removeLichLoadout(room,target.id);
        extra.push(env.DB.prepare('DELETE FROM '+ACTIVE+' WHERE user_id=? AND room_id=?').bind(Number(target.id),room.id));
      }else if(kind==='start'){
        if(!isHost)fail('HOST_ONLY','공대장만 출정할 수 있습니다.',403);
        if(room.status==='LOBBY'){
          if(room.members.length<3||!room.members.every(m=>m.ready))fail('NOT_READY','최소 3명과 전원 준비 완료가 필요합니다.');
          const users=await selectedUsers(env,room.members.map(m=>Number(m.id)));
          if(users.length!==room.members.length||users.some(u=>u.status!=='ACTIVE'||!lichAccess(u,cfg).accessible))fail('MEMBER_ACCESS','참가자의 이용 상태·TEST 권한을 확인하고 공대를 다시 정리하세요.',403);
          // Older waiting rooms acquire missing snapshots before starting.
          for(const member of room.members)if(!room.loadouts?.[member.id])
            setLichLoadout(room,member.id,await deps.raidDeckPower(env,Number(member.id),undefined,'RAID'),member.name);
          startLichRoom(room,id(user.id),now);
        }
      }else if(kind==='leave'){
        if(isHost&&['LOBBY','ACTIVE'].includes(room.status)){
          room.status='CANCELLED';room.finishedAt=now;room.failure={code:'HOST_CANCELLED',reason:'공대장이 공대를 해산했습니다.'};
        }else{room.members=room.members.filter(m=>m!==me);removeLichLoadout(room,me.id);room.revision++;}
        extra.push(env.DB.prepare('DELETE FROM '+ACTIVE+' WHERE user_id=? AND room_id=?').bind(user.id,room.id));
      }else if(kind==='action'){
        actLichRoom(room,id(user.id),{requestId:body.requestId,challengeId:body.challengeId,action:body.action,target:body.target,stepToken:body.stepToken},now);
      }else fail('ROUTE','지원하지 않는 공대 명령입니다.',404);
    }
    const result=kind==='leave'?{ok:true,roomId:room.id}:resultFor(room,user,cfg,{payload:kind==='start',since});
    result.roomId=room.id;
    // Every request, role change and removal is committed with the same state.
    extra.push(receiptWrite(env,user,kind,prior,room.id,result));
    try{await commitRoom(env,row,room,extra);return result;}
    catch(error){
      const replay=await receipt(env,user,kind,body);if(replay.result)return replay.result;
      if(Number((await loadRoom(env,room.id)).row.version)===Number(row.version))throw error;
    }
  }
  fail('BUSY','다른 공대 명령이 처리 중입니다. 같은 요청으로 다시 시도하세요.',409);
}
export async function handleLichRaid({path,request,env,deps}){
  if(!path.startsWith('raid/lich/')&&!path.startsWith('admin/raid/lich/'))return null;
  const json=(value,status=200)=>{if(value.state)value.state.responseNow=Date.now();const response=deps.json(value,status);response.headers.set('cache-control','private, no-store');return response;};
  try{
    const user=await deps.authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    if(path.startsWith('admin/')&&!owner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    await ensureLichLive(env);const before=await settingsRow(env),cfg=before.settings,url=new URL(request.url),now=Date.now();
    if(path==='admin/raid/lich/test-users'&&request.method==='GET'){
      const query=String(url.searchParams.get('q')||'').trim();if(!query||query.length>80)fail('QUERY','정확한 닉네임 또는 계정번호를 입력하세요.',400);
      const numeric=/^[1-9]\d{0,15}$/.test(query)&&Number.isSafeInteger(Number(query));
      const rows=await(numeric?env.DB.prepare('SELECT id,nickname FROM users WHERE id=? OR nickname=? ORDER BY id LIMIT 20').bind(Number(query),query):env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? ORDER BY id LIMIT 20').bind(query)).all();
      return json({users:rows.results.map(u=>({...u,id:Number(u.id)}))});
    }
    if(path==='admin/raid/lich/settings'){
      if(request.method==='GET')return json({ok:true,settings:cfg,testUsers:await selectedUsers(env,cfg.testUserIds)});
      if(request.method==='POST')return json(await saveSettings(env,user,await readJointBody(request,{fields:['settings'],maxBytes:16384}),before));
      return json({error:'지원하지 않는 요청입니다.'},405);
    }
    if(path==='raid/lich/feature'&&request.method==='GET')return json({ok:true,...lichAccess(user,cfg)});
    requireAccess(user,cfg);
    if(path==='raid/lich/status'&&request.method==='GET'){
      const requested=url.searchParams.get('roomId'),active=requested?await advanceRoom(env,requested,now):await currentRoom(env,user,now);
      if(active)return json(resultFor(active.room,user,cfg,{payload:url.searchParams.get('payload')==='1',since:Math.max(0,Number(url.searchParams.get('since'))||0)}));
      const [balance,list]=await Promise.all([
        env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,LICH_TICKET).first(),
        env.DB.prepare("SELECT room_id,host_name,state_json,created_at,expires_at FROM "+ROOMS+" WHERE status='LOBBY' AND expires_at>? ORDER BY created_at DESC LIMIT 30").bind(now).all()
      ]);
      return json({ok:true,state:null,feature:lichAccess(user,cfg),entry:{code:LICH_TICKET,name:'리치왕 정벌 입장권',quantity:Math.max(0,Number(balance?.quantity||0)),required:1},
        rooms:list.results.map(row=>{const room=readJson(row.state_json);return {id:row.room_id,hostName:row.host_name,members:room.members.length,maxMembers:6,roles:Object.keys(ROLES).map(role=>({role,count:room.members.filter(m=>m.role===role).length})),lobbyEndsAt:row.expires_at,joinable:!room.kicked.includes(id(user.id))&&room.members.length<6};}),me:{id:Number(user.id),name:user.nickname}});
    }
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const kind=path.slice('raid/lich/'.length);
    const fields={open:['requestId'],join:['requestId','roomId'],assign:['requestId','roomId','targetId','role'],ready:['requestId','roomId','ready'],kick:['requestId','roomId','targetId'],start:['requestId','roomId'],leave:['requestId','roomId'],action:['requestId','roomId','challengeId','action','target','stepToken']}[kind];
    if(!fields)fail('ROUTE','지원하지 않는 공대 명령입니다.',404);
    const body=await readJointBody(request,{fields});
    const since=Number(url.searchParams.get('since'))||0;
    const operation=()=>kind==='open'?openRoom(env,user,cfg,body,deps,now):roomCommand(env,user,cfg,kind,body,deps,now,Number.isSafeInteger(since)&&since>=0?since:0);
    // Reuse the existing account mutation lock; room CAS serializes different users.
    const result=await deps.withUserMutationLock(env,user.id,path,operation);
    return json(result);
  }catch(error){
    const known=Number.isInteger(error.status);
    return json({ok:false,error:known?error.message:'요청을 완료하지 못했습니다. 같은 요청으로 다시 시도하세요.',code:known?error.code:'LICH_RETRYABLE',retryable:!known||error.status>=500},known?error.status:503);
  }
}

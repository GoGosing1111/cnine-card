import {createNoxRoom,addNoxMember,readyNoxMember,startNoxRoom,leaveNoxRoom,tickNoxRoom,actNoxRoom,noxView,noxBattlePayload,loadNoxPveDeck} from './_raid_nox.js';
import {readJointBody,jointError} from './_joint_request.js';
import {noxClearKey,NOX_CLEAR_GOAL} from './_milestone_trophies.js';
import {pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';

export const NOX_SETTINGS='raid_nox_settings_v1',NOX_ENTRY_COINS='3000000000000',NOX_CREATE_COINS='10000000000000',NOX_CLIENT_VERSION=5;
export const NOX_WEEKLY_REWARD_LIMIT=3;
const NOX_REWARDS=Object.freeze({
  NORMAL:Object.freeze({coins:'100000000000000',masterStars:'1000000000'}),
  HELL:Object.freeze({coins:'300000000000000',masterStars:'2500000000'})
});
export const NOX_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS raid_nox_rooms_v1(room_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,version BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL,expires_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS raid_nox_active_v1(user_id BIGINT PRIMARY KEY,room_id TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_nox_active_room_v1 ON raid_nox_active_v1(room_id)`,
  `CREATE TABLE IF NOT EXISTS raid_nox_receipts_v1(user_id BIGINT NOT NULL,request_id TEXT NOT NULL,signature TEXT NOT NULL,response_json TEXT NOT NULL,PRIMARY KEY(user_id,request_id))`,
  `CREATE TABLE IF NOT EXISTS raid_nox_entry_fees_v1(room_id TEXT NOT NULL,user_id BIGINT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('TEST','ON')),coins BIGINT NOT NULL CHECK(coins>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(room_id,user_id))`
];
const fail=(code,message,status=409)=>{throw jointError('NOX_'+code,message,status);};
export const defaultNoxSettings=()=>({revision:0,mode:'OFF',testUserIds:[]});
export function validateNoxSettings(raw){
  if(!raw||!Number.isSafeInteger(raw.revision)||raw.revision<0||!['OFF','TEST','ON'].includes(raw.mode)||!Array.isArray(raw.testUserIds)||raw.testUserIds.length>500||raw.testUserIds.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(raw.testUserIds).size!==raw.testUserIds.length)fail('SETTINGS','운영 모드와 테스트 참가자를 확인하세요.',400);
  return {revision:raw.revision,mode:raw.mode,testUserIds:[...raw.testUserIds].sort((a,b)=>a-b)};
}
export function noxAccess(user,cfg){
  const active=user&&(!user.status||user.status==='ACTIVE')&&!(Date.parse(user.banned_until||'')>Date.now());
  const official=cfg.mode==='ON';
  const accessible=Boolean(active&&(official||cfg.mode==='TEST'&&(user.role==='OWNER'||cfg.testUserIds.includes(Number(user.id)))));
  return {mode:cfg.mode,accessible,visible:accessible,entryCoins:official?NOX_ENTRY_COINS:'0',openEntryCoins:NOX_ENTRY_COINS,createCoins:official?NOX_CREATE_COINS:'0',rewardLocked:!official,rewards:NOX_REWARDS,weeklyRewardLimit:NOX_WEEKLY_REWARD_LIMIT};
}
function access(user,cfg){if(!noxAccess(user,cfg).accessible)fail(cfg.mode==='OFF'?'OFF':'TEST_ONLY',cfg.mode==='OFF'?'종언의 주파수는 현재 입장 중지 상태입니다.':'지정된 테스트 참가자만 입장할 수 있습니다.',cfg.mode==='OFF'?423:403);}
function database(env){const DB=env.DB;if(DB?.dialect!=='postgres'||!DB.client||!DB.enqueue)fail('DATABASE','레이드 연결을 확인하고 있습니다. 잠시 후 다시 시도하세요.',503);return DB;}
const query=DB=>(text,values=[])=>DB.client.query({text,values}).then(r=>r.rows);
const read=(env,work)=>{const DB=database(env);return DB.enqueue(()=>work(query(DB)));};
async function transaction(env,work){return read(env,async q=>{await q('BEGIN');try{await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='10s'");const result=await work(q);await q('COMMIT');return result;}catch(error){try{await q('ROLLBACK');}catch{}throw error;}});}
async function config(q,lock=''){const [row]=await q('SELECT value FROM app_meta WHERE key=$1'+lock,[NOX_SETTINGS]);return {raw:row?.value??null,cfg:row?validateNoxSettings(JSON.parse(row.value)):defaultNoxSettings()};}
const member=(room,user)=>{const me=room.members.find(m=>m.id===String(user.id)&&!m.left);if(!me)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);return me;};
const ongoing=r=>r.status==='LOBBY'||r.status==='ACTIVE';
function entryCoinsFor(room){
  // An unstarted official room can use a lower fee than its original quote.
  if(room.status==='LOBBY'&&room.releaseMode==='ON'&&BigInt(room.entryCoins)>BigInt(NOX_ENTRY_COINS))return NOX_ENTRY_COINS;
  return room.entryCoins;
}
function tick(room,now){tickNoxRoom(room,Math.max(room.clock,now));if(room.status==='LOBBY'&&now>=room.lobbyEndsAt){room.status='CANCELLED';room.failure={reason:'공대 모집 시간이 끝났습니다.'};room.revision++;}}
const signature=room=>[room.revision,room.eventSeq,room.status,room.lastAttackAt].join(':');
function result(room,user,cfg,{payload=false,since=0}={}){
  const state=noxView(room,String(user.id),since);
  state.release={...noxAccess(user,cfg),mode:room.releaseMode,currentMode:cfg.mode,rewardLocked:room.releaseMode!=='ON',runtimeEnabled:true,scope:'LIVE'};
  state.entryCoins=entryCoinsFor(room);
  state.feePaid=Boolean(room.feePaid);
  state.lobbyEndsAt=room.lobbyEndsAt;
  state.reward=room.rewards?.[user.id]??null;
  return {ok:true,roomId:room.id,state,...(payload?{payload:{...noxBattlePayload(room,String(user.id)),reviewOnly:false}}:{})};
}
async function load(q,roomId,lock=''){if(typeof roomId!=='string'||!/^[A-F0-9]{10}$/.test(roomId))fail('ROOM_ID','공대 코드 10자리를 확인하세요.',400);const [row]=await q('SELECT * FROM raid_nox_rooms_v1 WHERE room_id=$1'+lock,[roomId]);if(!row)fail('ROOM_MISSING','참가 중인 공대를 찾을 수 없습니다.',404);return {row,room:JSON.parse(row.state_json)};}
async function snapshot(q,roomId,user){
  if(typeof roomId!=='string'||!/^[A-F0-9]{10}$/.test(roomId))fail('ROOM_ID','공대 코드 10자리를 확인하세요.',400);
  const [row]=await q('SELECT r.*,m.value AS config_raw FROM app_meta m LEFT JOIN raid_nox_rooms_v1 r ON r.room_id=$1 WHERE m.key=$2',[roomId,NOX_SETTINGS]);
  const raw=row?.config_raw??null,cfg=raw?validateNoxSettings(JSON.parse(raw)):defaultNoxSettings();access(user,cfg);if(!row?.room_id)fail('ROOM_MISSING','참가 중인 공대를 찾을 수 없습니다.',404);
  return {row,room:JSON.parse(row.state_json),raw,cfg};
}
const SAVE_ROOM_SQL='UPDATE raid_nox_rooms_v1 SET state_json=$1,version=version+1,status=$2,expires_at=$3 WHERE room_id=$4 AND version=$5 RETURNING version';
const SAVE_OFFICIAL_CLEAR_SQL=`WITH saved AS (${SAVE_ROOM_SQL}), credited AS (
  INSERT INTO app_meta AS prior (key,value)
  SELECT member_key,jsonb_build_object('count',1,'acquiredAt',NULL)::text
    FROM saved CROSS JOIN unnest($6::text[]) AS members(member_key) ORDER BY member_key
  ON CONFLICT(key) DO UPDATE SET value=jsonb_build_object(
    'count',(prior.value::jsonb->>'count')::bigint+1,
    'acquiredAt',CASE WHEN (prior.value::jsonb->>'count')::bigint=${NOX_CLEAR_GOAL-1}
                      THEN $7::text ELSE prior.value::jsonb->>'acquiredAt' END)::text
) SELECT version FROM saved`;
const officialClear=(row,room)=>row.status==='ACTIVE'&&room.status==='CLEAR'&&room.releaseMode==='ON';
const weekPrefix=weekKey=>'raid_nox_weekly_reward_v1:'+weekKey+':';
const weeklyStatus=(week,used)=>({...week,limit:NOX_WEEKLY_REWARD_LIMIT,used,remaining:NOX_WEEKLY_REWARD_LIMIT-used});
async function weeklyReward(q,userId,now){
  const week=pigCoinRewardWeek(now);
  const [count]=await q('SELECT value::integer AS used FROM app_meta WHERE key=$1',[weekPrefix(week.weekKey)+userId]);
  return weeklyStatus(week,count?.used??0);
}
const GRANT_CLEAR_REWARDS_SQL=`WITH participants AS (
  SELECT id,$2::text||id::text AS reward_key FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE
), weekly AS (
  INSERT INTO app_meta AS tally(key,value,updated_at)
  SELECT reward_key,'1',CURRENT_TIMESTAMP FROM participants
  ON CONFLICT(key) DO UPDATE SET value=(tally.value::integer+1)::text,updated_at=CURRENT_TIMESTAMP
    WHERE tally.value::integer<$3::integer
  RETURNING key,value::integer AS used
), coins AS (
  UPDATE users AS wallet SET coin=wallet.coin+$4::bigint
  FROM participants JOIN weekly ON weekly.key=participants.reward_key
  WHERE wallet.id=participants.id
  RETURNING wallet.id,wallet.coin,weekly.used
), coin_ledger AS (
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
  SELECT id,$4::bigint,coin,'종언의 주파수 클리어 #'||$6 FROM coins
), stars AS (
  INSERT INTO cnine_user_inventory AS inventory(user_id,item_code,quantity,unseen_quantity)
  SELECT id,'MASTER_STAR',$5::bigint,$5::bigint FROM coins
  ON CONFLICT(user_id,item_code) DO UPDATE SET
    quantity=inventory.quantity+excluded.quantity,
    unseen_quantity=inventory.unseen_quantity+excluded.unseen_quantity,
    updated_at=CURRENT_TIMESTAMP
  RETURNING user_id,quantity
), star_ledger AS (
  INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
  SELECT user_id,'MASTER_STAR',$5::bigint,quantity,'NOX_RAID_CLEAR','NOX_RAID',$6 FROM stars
) SELECT participants.id::text AS id,coins.used FROM participants LEFT JOIN coins USING(id)`;
async function grantClearRewards(q,room){
  const week=pigCoinRewardWeek(room.finishedAt);
  const reward=NOX_REWARDS[room.difficulty==='HELL'?'HELL':'NORMAL'];
  const rows=await q(GRANT_CLEAR_REWARDS_SQL,[room.clearParticipantIds,weekPrefix(week.weekKey),NOX_WEEKLY_REWARD_LIMIT,reward.coins,reward.masterStars,room.id]);
  return Object.fromEntries(rows.map(({id,used})=>[id,{
    status:used===null?'LIMIT':'PAID',
    ...(used===null?{}:reward),
    weekly:weeklyStatus(week,used??NOX_WEEKLY_REWARD_LIMIT)
  }]));
}
async function save(q,row,room){
  const cleared=officialClear(row,room);
  if(cleared){
    // Only the writer holding the matching room version can settle this clear.
    // Its rewards, trophy and result commit together, including the receipt.
    const [locked]=await q('SELECT room_id FROM raid_nox_rooms_v1 WHERE room_id=$1 AND version=$2 FOR UPDATE',[room.id,row.version]);
    if(!locked)return false;
    room.rewards=await grantClearRewards(q,room);
  }
  const params=[JSON.stringify(room),room.status,room.endsAt?room.endsAt+600000:room.lobbyEndsAt,room.id,row.version];
  if(cleared)params.push(room.clearParticipantIds.map(noxClearKey),new Date(room.finishedAt).toISOString());
  const rows=await q(cleared?SAVE_OFFICIAL_CLEAR_SQL:SAVE_ROOM_SQL,params);
  if(cleared&&!rows.length)fail('BUSY','공대를 갱신하고 있습니다.',503);
  return rows.length>0;
}
function persist(env,row,room){return (officialClear(row,room)?transaction:read)(env,q=>save(q,row,room));}
async function activeRoom(q,user,now){const [active]=await q('SELECT room_id FROM raid_nox_active_v1 WHERE user_id=$1',[user.id]);if(!active)return null;const {room}=await load(q,active.room_id);if(ongoing(room)&&(room.status!=='LOBBY'||now<room.lobbyEndsAt)&&(room.status!=='ACTIVE'||now<room.endsAt))return room.id;await q('DELETE FROM raid_nox_active_v1 WHERE user_id=$1 AND room_id=$2',[user.id,active.room_id]);return null;}
async function selected(q,ids,lock=''){return ids.length?await q('SELECT id,nickname,role,status,banned_until,coin::text AS coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id'+lock,[ids]):[];}
const publicUsers=rows=>rows.map(({coin,...u})=>({...u,id:Number(u.id)}));
async function admin(env,user,request,url,kind){
  if(user.role!=='OWNER')fail('OWNER','OWNER 권한이 필요합니다.',403);
  if(kind==='test-users'&&request.method==='GET'){const term=(url.searchParams.get('q')||'').trim();if(!term||term.length>80)fail('QUERY','정확한 닉네임 또는 계정번호를 입력하세요.',400);return read(env,async q=>({users:publicUsers(await q('SELECT id,nickname FROM users WHERE nickname=$1 OR id=$2 ORDER BY id LIMIT 20',[term,/^[1-9]\d{0,14}$/.test(term)?Number(term):0]))}));}
  if(kind!=='settings')fail('ROUTE','지원하지 않는 요청입니다.',404);
  if(request.method==='GET')return read(env,async q=>{const {cfg}=await config(q);return {ok:true,settings:cfg,testUsers:publicUsers(await selected(q,cfg.testUserIds)),entryCoins:NOX_ENTRY_COINS};});
  if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{fields:['settings'],maxBytes:16384}),next=validateNoxSettings(body.settings);
  return transaction(env,async q=>{const before=await config(q,' FOR UPDATE');if(before.cfg.revision!==next.revision)fail('SETTINGS_CONFLICT','운영 설정이 바뀌었습니다. 다시 불러오세요.');const users=await selected(q,next.testUserIds);if(users.length!==next.testUserIds.length)fail('TEST_USERS','존재하지 않는 계정이 있습니다.',400);next.revision++;const raw=JSON.stringify(next);await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[NOX_SETTINGS,raw]);await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'NOX_RAID_SETTINGS','RAID',$2,$3,$4)",[user.id,NOX_SETTINGS,before.raw,raw]);return {ok:true,settings:next,testUsers:publicUsers(users),entryCoins:NOX_ENTRY_COINS};});
}
async function state(env,user,roomId,options,now){
  for(let attempt=0;attempt<8;attempt++){
    const loaded=await read(env,async q=>{if(!roomId){const [a]=await q('SELECT room_id FROM raid_nox_active_v1 WHERE user_id=$1',[user.id]);roomId=a?.room_id;if(!roomId)fail('ROOM_MISSING','참가 중인 공대가 없습니다.',404);}const found=await snapshot(q,roomId,user);member(found.room,user);return found;});
    const before=signature(loaded.room);tick(loaded.room,Date.now());if(signature(loaded.room)===before)return result(loaded.room,user,loaded.cfg,options);
    if(await persist(env,loaded.row,loaded.room))return result(loaded.room,user,loaded.cfg,options);
  }fail('BUSY','공대 전황을 갱신하고 있습니다. 다시 시도하세요.',503);
}
async function command(env,user,kind,body,deps,now){
  if(typeof body.requestId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))fail('REQUEST_ID','요청 식별자가 필요합니다.',400);
  if(['create','join','ready','start'].includes(kind)&&body.clientVersion!==NOX_CLIENT_VERSION)fail('CLIENT_UPDATE','새로고침 후 다시 입장하세요.');
  const fingerprint=JSON.stringify([kind,Object.keys(body).filter(k=>k!=='requestId').sort().map(k=>[k,body[k]])]);
  // Loading the saved deck does not hold the room/wallet transaction open.
  const deck=['create','join'].includes(kind)||kind==='ready'&&body.ready?await loadNoxPveDeck(env,user.id,deps):null;
  return transaction(env,async q=>{
    await q('SELECT pg_advisory_xact_lock(731019,$1::integer)',[user.id]);
    const [receipt]=await q('SELECT signature,response_json FROM raid_nox_receipts_v1 WHERE user_id=$1 AND request_id=$2',[user.id,body.requestId]);
    if(receipt){if(receipt.signature!==fingerprint)fail('REQUEST_CONFLICT','같은 요청 식별자의 내용이 달라졌습니다.');return JSON.parse(receipt.response_json);}
    const {cfg}=await config(q,' FOR SHARE');if(kind!=='leave')access(user,cfg);let room,row;
    if(kind==='create'){
      if(await activeRoom(q,user,now))fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');
      room=createNoxRoom({id:crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase(),hostId:String(user.id),size:body.size,difficulty:body.difficulty,seed:crypto.getRandomValues(new Uint32Array(1))[0],now});
      Object.assign(room,{releaseMode:cfg.mode,entryCoins:cfg.mode==='ON'?NOX_ENTRY_COINS:'0',lobbyEndsAt:now+900000,feePaid:false});addNoxMember(room,{id:String(user.id),name:user.nickname,cards:deck.cards,deckSnapshot:deck},now);
      if(cfg.mode==='ON'){
        if(body.acceptedCreateCoins!==NOX_CREATE_COINS)fail('CREATE_FEE_CONSENT','공대 생성비 10조 코인을 확인해 주세요.');
        const charged=await q(`WITH debit AS (
          UPDATE users SET coin=coin-$1::bigint WHERE id=$2 AND coin>=$1::bigint RETURNING id,coin
        ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
        SELECT id,-$1::bigint,coin,$3 FROM debit RETURNING user_id`,[NOX_CREATE_COINS,user.id,'종언의 주파수 공대 생성 #'+room.id]);
        if(!charged.length)fail('CREATE_COINS','공대 생성에 필요한 10조 코인이 부족합니다.');
      }
      await q('INSERT INTO raid_nox_rooms_v1(room_id,state_json,status,expires_at) VALUES($1,$2,$3,$4)',[room.id,JSON.stringify(room),room.status,room.lobbyEndsAt]);
      await q('INSERT INTO raid_nox_active_v1(user_id,room_id) VALUES($1,$2)',[user.id,room.id]);
    }else{
      if(kind==='join'){const active=await activeRoom(q,user,now);if(active&&active!==body.roomId)fail('ALREADY_JOINED','다른 공대에 참가 중입니다.');}
      ({room,row}=await load(q,body.roomId,' FOR UPDATE'));
      if(kind!=='join')member(room,user);
      if(['join','ready','start'].includes(kind)&&room.releaseMode!==cfg.mode)fail('MODE_CHANGED','운영 모드가 바뀌었습니다. 공대를 나간 뒤 새로 만들어 주세요. 입장료는 차감되지 않았습니다.');
      tick(room,Date.now());
      if(kind==='join'){addNoxMember(room,{id:String(user.id),name:user.nickname,cards:deck.cards,deckSnapshot:deck},now);await q('INSERT INTO raid_nox_active_v1(user_id,room_id) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',[user.id,room.id]);}
      else if(kind==='ready'){
        if(typeof body.ready!=='boolean')fail('READY','준비 상태를 확인하세요.',400);
        if(body.ready){if(body.acceptedCoins!==entryCoinsFor(room))fail('FEE_CONSENT','표시된 입장료를 확인하고 전투 준비를 눌러 주세요.');if(room.status!=='LOBBY')fail('STARTED','이미 출전한 공대입니다.');const index=room.members.findIndex(m=>m.id===String(user.id));room.members.splice(index,1);addNoxMember(room,{id:String(user.id),name:user.nickname,cards:deck.cards,deckSnapshot:deck},now);const refreshed=room.members.pop();refreshed.role=index%3;refreshed.acceptedCoins=body.acceptedCoins;room.members.splice(index,0,refreshed);}
        readyNoxMember(room,String(user.id),body.ready);
      }else if(kind==='start'){
        if(room.status!=='LOBBY')fail('STARTED','이미 출전했거나 종료된 공대입니다.');
        const entryCoins=entryCoinsFor(room);
        // A player who accepted the original quote has consented to the lower fee.
        if(room.members.some(m=>m.acceptedCoins!==entryCoins&&m.acceptedCoins!==room.entryCoins))fail('FEE_CONSENT','전원이 입장료를 확인하고 준비해야 합니다.');
        const users=await selected(q,room.members.map(m=>Number(m.id)),' FOR UPDATE');
        if(users.length!==room.size||users.some(u=>!noxAccess(u,cfg).accessible))fail('MEMBER_ACCESS','공대원의 계정 상태와 입장 권한을 확인하세요.',403);
        if(users.some(u=>BigInt(u.coin)<BigInt(entryCoins)))fail('COINS','입장료 잔액이 부족한 공대원이 있어 출전이 취소됐습니다.');
        // One transaction: all wallet debits, exact ledgers, unique fee receipts,
        // room start and request receipt either commit together or roll back.
        startNoxRoom(room,String(user.id),Date.now());room.entryCoins=entryCoins;room.feePaid=true;
        for(const u of users){if(entryCoins!=='0'){
          await q('UPDATE users SET coin=coin-$1::bigint WHERE id=$2',[entryCoins,u.id]);
          await q('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,-$1::bigint,coin,$2 FROM users WHERE id=$3',[entryCoins,'종언의 주파수 입장 #'+room.id,u.id]);
        }await q('INSERT INTO raid_nox_entry_fees_v1(room_id,user_id,mode,coins) VALUES($1,$2,$3,$4::bigint)',[room.id,u.id,room.releaseMode,entryCoins]);}
      }else if(kind==='leave'){leaveNoxRoom(room,String(user.id),Date.now());if(room.status==='LOBBY'&&!room.members.length){room.status='CANCELLED';room.revision++;}await q('DELETE FROM raid_nox_active_v1 WHERE user_id=$1 AND room_id=$2',[user.id,room.id]);}
      else fail('ROUTE','지원하지 않는 요청입니다.',404);
      if(!await save(q,row,room))fail('BUSY','공대를 갱신하고 있습니다.',503);
      if(!ongoing(room))await q('DELETE FROM raid_nox_active_v1 WHERE room_id=$1',[room.id]);
    }
    const response=kind==='leave'?{ok:true}:result(room,user,cfg,{payload:['create','join','ready'].includes(kind)});
    await q('INSERT INTO raid_nox_receipts_v1(user_id,request_id,signature,response_json) VALUES($1,$2,$3,$4)',[user.id,body.requestId,fingerprint,JSON.stringify(response)]);return response;
  });
}

async function action(env,user,body,since,arrival){
  for(let retry=0;retry<3;retry++){
    const {cfg,raw,row,room}=await read(env,q=>snapshot(q,body.roomId,user));
    const me=member(room,user),index=room.members.indexOf(me),previousSeq=me.lastSequence,previousEvent=room.eventSeq,previousChallenge=room.challenge?.id;
    if(me.receipts[body.seq]||body.stream&&body.seq<=me.lastSequence){actNoxRoom(room,String(user.id),body,Math.max(room.clock,arrival),{receiptNow:arrival});return result(room,user,cfg,{since});}
    if(room.status==='CLEAR')return result(room,user,cfg,{since});
    const before=signature(room);tick(room,Math.max(room.clock,arrival));
    if(signature(room)!==before){
      if(await persist(env,row,room)&&room.status==='CLEAR')return result(room,user,cfg,{since});
      continue;
    }
    actNoxRoom(room,String(user.id),body,room.clock,{receiptNow:arrival});
    if(room.status!=='ACTIVE'){if(await persist(env,row,room))return result(room,user,cfg,{since});continue;}
    const events=room.events.filter(e=>e.seq>previousEvent),strike=room.challenge.stage==='COOP'?{[user.id]:room.challenge.strikes[user.id]}:{};
    // Independent players merge only their own state. A global room CAS made
    // six simultaneous rhythm streams retry/queue behind each other. This one
    // UPDATE retains other members, atomically numbers events and guards the
    // phase, settings and this member's sequence. No network-held row lock.
    const updated=await read(env,q=>q(`UPDATE raid_nox_rooms_v1 r SET version=version+1,state_json=(
      jsonb_set(jsonb_set(r.state_json::jsonb,ARRAY['members',$1::text],$2::jsonb),'{challenge,strikes}',COALESCE(r.state_json::jsonb#>'{challenge,strikes}','{}'::jsonb)||$3::jsonb)
      ||jsonb_build_object('clock',GREATEST((r.state_json::jsonb->>'clock')::bigint,$4::bigint),'revision',(r.state_json::jsonb->>'revision')::bigint+1,'eventSeq',(r.state_json::jsonb->>'eventSeq')::bigint+jsonb_array_length($5::jsonb),
      'events',(SELECT COALESCE(jsonb_agg(e ORDER BY n),'[]'::jsonb) FROM (SELECT e,n FROM jsonb_array_elements((r.state_json::jsonb->'events')||(SELECT COALESCE(jsonb_agg(e||jsonb_build_object('seq',(r.state_json::jsonb->>'eventSeq')::bigint+n) ORDER BY n),'[]'::jsonb) FROM jsonb_array_elements($5::jsonb) WITH ORDINALITY t(e,n))) WITH ORDINALITY t(e,n) ORDER BY n DESC LIMIT 240) recent))
      )::text WHERE room_id=$6 AND status='ACTIVE' AND state_json::jsonb#>>'{challenge,id}'=$7
      AND (state_json::jsonb#>>ARRAY['members',$1::text,'lastSequence'])::bigint=$8
      AND EXISTS(SELECT 1 FROM app_meta WHERE key=$9 AND value=$10) RETURNING state_json`,[String(index),JSON.stringify(me),JSON.stringify(strike),room.clock,JSON.stringify(events),room.id,previousChallenge,previousSeq,NOX_SETTINGS,raw]));
    if(updated.length){const latest=JSON.parse(updated[0].state_json);latest.clock=Math.max(latest.clock,Date.now());return result(latest,user,cfg,{since});}
  }fail('BUSY','입력을 동기화하고 있습니다. 같은 입력을 다시 전송하세요.',503);
}
export async function handleNoxLive({path,request,env,deps}){
  if(!path.startsWith('raid/nox/')&&!path.startsWith('admin/raid/nox/'))return null;
  const send=(value,status=200)=>{value.serverReceivedAt=arrival;value.serverNow=Date.now();if(value.state)value.state.responseNow=value.serverNow;const r=deps.json(value,status);r.headers.set('cache-control','private, no-store');return r;};
  const arrival=Date.now();
  try{
    const user=await deps.authenticate(request,env);if(!user)return send({error:'로그인이 필요합니다.'},401);
    const url=new URL(request.url);if(path.startsWith('admin/'))return send(await admin(env,user,request,url,path.slice('admin/raid/nox/'.length)));
    const kind=path.slice('raid/nox/'.length),since=Math.max(0,Number(url.searchParams.get('since'))||0);
    if(kind==='state'&&request.method==='GET')return send(await state(env,user,url.searchParams.get('roomId'),{since,payload:url.searchParams.get('payload')==='1'},arrival));
    if(kind==='action'&&request.method==='POST'){const body=await readJointBody(request,{fields:['roomId','seq','challengeId','inputs','stream'],maxBytes:8192});return send(await action(env,user,body,since,arrival));}
    if(kind==='feature'&&request.method==='GET')return send(await read(env,async q=>{
      const {cfg}=await config(q),feature=noxAccess(user,cfg);
      if(feature.accessible&&!feature.rewardLocked&&url.searchParams.get('weekly')==='1')feature.weeklyReward=await weeklyReward(q,user.id,arrival);
      return {ok:true,...feature};
    }));
    const {cfg}=await read(env,q=>config(q));
    if(kind!=='leave')access(user,cfg);
    if(kind==='deck'&&request.method==='GET'){const deck=await loadNoxPveDeck(env,user.id,deps);const roomId=await read(env,async q=>(await q('SELECT room_id FROM raid_nox_active_v1 WHERE user_id=$1',[user.id]))[0]?.room_id||null);return send({ok:true,cards:deck.cards,account:{id:Number(user.id),name:user.nickname},roomId,feature:noxAccess(user,cfg)});}
    if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
    const fields=['roomId','requestId','clientVersion','size','ready','acceptedCoins',...(kind==='create'?['difficulty','acceptedCreateCoins']:[])];
    const body=await readJointBody(request,{fields,maxBytes:8192});
    return send(await command(env,user,kind,body,deps,arrival));
  }catch(error){const known=Number.isInteger(error.status);return send({ok:false,error:known?error.message:'요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.',code:known?error.code:'NOX_RETRYABLE',retryable:!known||error.status>=500},known?error.status:503);}
}

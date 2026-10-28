import {WarChatRoom} from './war-chat.js';
import {DurableObject} from 'cloudflare:workers';
import {MonsterDefenseHost} from './monster-defense.js';
import {MonsterDefenseDirectory} from './monster-defense-directory.js';
import {createCoopRoom,coopCommand,advanceCoopRoom,coopView,coopTerminal} from '../../../functions/_cooperative_room.js';
import {COOP_RULES,validCoopRoom,coopDifficulty} from '../../../shared/cooperative-battleground-v1.mjs';
import {COOP_DIRECTORY,COOP_LIST_LIMIT,COOP_LIST_LEASE_MS,coopRoomListing} from '../../../shared/cooperative-room-list-v1.mjs';
import {nextCoopPatternAt} from '../../../functions/_cooperative_patterns.js';
import {coopUnpaidRewards,settleCoopRewards} from '../../../functions/_cooperative_rewards.js';
import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {spendCoopEnergy} from '../../../functions/_cooperative_energy.js';

// Per-player routing and one reserved public directory; no new binding/migration.
// Directory writes happen on lobby changes and a coarse lease renewal, never per
// battle event. Only public summaries are stored, not accounts, decks or tickets.
export class CooperativePlayer extends DurableObject{
 defenseDirectory(){return this.monsterDefenseDirectory??=new MonsterDefenseDirectory(this.ctx);}
 publishDefenseRoom(input){return this.defenseDirectory().publish(input);}
 defenseRooms(difficulty){return this.defenseDirectory().rooms(difficulty);}
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS active (id INTEGER PRIMARY KEY,room TEXT NOT NULL)');}
 getRoom(){return this.ctx.storage.sql.exec('SELECT room FROM active WHERE id=1').toArray()[0]?.room||null;}
 setRoom(room){if(!room)this.ctx.storage.sql.exec('DELETE FROM active WHERE id=1');else this.ctx.storage.sql.exec('INSERT INTO active(id,room) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET room=excluded.room',room);return room;}
 directory(){
  if(this.directoryReady)return;
  this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS lobbies(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,difficulty TEXT,created_at INTEGER,lease_until INTEGER,retire_at INTEGER,json TEXT)');
  this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS lobbies_retire ON lobbies(retire_at)');
  this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS lobbies_created ON lobbies(created_at DESC,id DESC)');
  this.directoryReady=true;
 }
 async publishRoom({id,revision,listing,retireAt}){
  if(!validCoopRoom(id)||!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(retireAt))throw Error('Invalid cooperative listing');
  if(listing&&(listing.id!==id||!coopDifficulty(listing.difficulty)||!Number.isSafeInteger(listing.createdAt)||!Number.isSafeInteger(listing.expiresAt)))throw Error('Invalid cooperative summary');
  this.directory();const now=Date.now();
  // Keep removal tombstones through the room lifetime so delayed publications
  // cannot bring a started/disbanded room back into the public list.
  this.ctx.storage.sql.exec(`INSERT INTO lobbies VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
   revision=excluded.revision,difficulty=excluded.difficulty,created_at=excluded.created_at,lease_until=excluded.lease_until,retire_at=excluded.retire_at,json=excluded.json
   WHERE excluded.revision>=lobbies.revision`,id,revision,listing?.difficulty||null,listing?.createdAt||0,listing?Math.min(listing.expiresAt,now+COOP_LIST_LEASE_MS):0,retireAt,listing?JSON.stringify(listing):null);
  const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>now+60000)await this.ctx.storage.setAlarm(now+60000);
 }
 rooms(difficulty=''){
  this.directory();const now=Date.now();
  const rows=this.ctx.storage.sql.exec('SELECT json FROM lobbies WHERE json IS NOT NULL AND lease_until>? AND (?=\'\' OR difficulty=?) ORDER BY created_at DESC,id DESC LIMIT ?',now,difficulty,difficulty,COOP_LIST_LIMIT+1).toArray();
  return {ok:true,rooms:rows.slice(0,COOP_LIST_LIMIT).map(r=>JSON.parse(r.json)),hasMore:rows.length>COOP_LIST_LIMIT,serverNow:now};
 }
 async alarm(){
  this.directory();const now=Date.now();this.ctx.storage.sql.exec('DELETE FROM lobbies WHERE retire_at<=?',now);
  const next=this.ctx.storage.sql.exec('SELECT MIN(retire_at) deadline FROM lobbies').toArray()[0]?.deadline;
  if(next)await this.ctx.storage.setAlarm(Math.max(now+60000,next));
 }
}
export class CooperativeRoom extends DurableObject{
 chatHost(){return this.warChatHost??=new WarChatRoom(this.ctx,this.env);}
 chatTicket(input){return this.chatHost().ticket(input);}
 defenseHost(){return this.monsterDefenseHost??=new MonsterDefenseHost(this.ctx,this.env);}
 defenseRpc(action,input){return this.defenseHost().rpc(action,input);}
 defenseLeave(user){return this.defenseHost().leave(user);}
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY,json TEXT NOT NULL)');ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tickets(token TEXT PRIMARY KEY,user_id INTEGER,client TEXT,expires INTEGER)');}
 read(){const raw=this.ctx.storage.sql.exec('SELECT json FROM room WHERE id=1').toArray()[0]?.json;return raw?JSON.parse(raw):null;}
 save(room){this.ctx.storage.sql.exec('INSERT INTO room(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(room));}
 async completeEntry(room){
  if(!room.entryPending)return true;
  let connection;
  try{
   if(this.env.HYPERDRIVE)connection=await createPostgresD1Compat(this.env.HYPERDRIVE.connectionString);
   room.energyEntry=await spendCoopEnergy({...this.env,DB:connection?.db||this.env.DB},room);
   delete room.entryPending;delete room.entryError;
   room.loadingEndsAt=Date.now()+COOP_RULES.loadingMs;
   for(const member of room.members)member.lastSeen=Date.now();
   this.save(room);return true;
  }catch(error){
   if(['COOP_ENERGY_EMPTY','COOP_CLOSED'].includes(error.code)){
    const requestKey=room.entryPending.requestKey;
    room.status='LOBBY';room.entryError=error.message;room.receipts=room.receipts.filter(r=>r.id!==requestKey);
    for(const key of ['entryPending','payload','states','durationMs','loadingEndsAt','bossAtMs'])delete room[key];
    for(const member of room.members){member.ready=false;member.loaded=false;}
    room.version++;this.save(room);return false;
   }
   await this.ctx.storage.setAlarm(Date.now()+5000);
   throw Object.assign(Error('출전 행동력 확인 중입니다. 잠시 후 다시 연결해 주세요.'),{code:'COOP_ENERGY_PENDING',status:503});
  }finally{await connection?.close();}
 }
 async settleRewards(room){
  if(room.clearRewards)return true;
  const unpaid=coopUnpaidRewards(room);
  if(unpaid){room.clearRewards=unpaid;this.save(room);return true;}
  if(Date.now()<(this.rewardRetryAt||0))return false;
  this.rewardSettlement??=(async()=>{
   let connection;
   try{
    // Deployed Durable Objects use the same PostgreSQL Hyperdrive as the API.
    // Local D1 fixtures stay local; never fall back after a PostgreSQL error.
    if(this.env.HYPERDRIVE)connection=await createPostgresD1Compat(this.env.HYPERDRIVE.connectionString);
    const rewards=await settleCoopRewards({...this.env,DB:connection?.db||this.env.DB},room);
    const fresh=this.read();fresh.clearRewards=rewards;this.save(fresh);this.rewardFailures=0;return rewards;
   }finally{await connection?.close();}
  })();
  try{room.clearRewards=await this.rewardSettlement;return true;}
  catch{this.rewardFailures=(this.rewardFailures||0)+1;this.rewardRetryAt=Date.now()+Math.min(300000,15000*2**Math.min(5,this.rewardFailures-1));console.warn('Cooperative reward settlement pending; terminal room retained');return false;}
  finally{this.rewardSettlement=null;}
 }
 async publishListing(room){
  const now=Date.now(),listing=coopRoomListing(room,now),signature=JSON.stringify(listing);
  if(signature===this.publishedSignature&&(!listing||now-this.publishedAt<30000))return true;
  room.directoryRevision=(room.directoryRevision||0)+1;this.save(room);
  const revision=room.directoryRevision;
  try{
   await this.env.COOP_PLAYERS.getByName(COOP_DIRECTORY).publishRoom({id:room.id,revision,listing,retireAt:room.expiresAt+3600000});
   if(revision>=(this.publishedRevision||0)){this.publishedRevision=revision;this.publishedSignature=signature;this.publishedAt=now;}
   return true;
  }catch{console.warn('Cooperative lobby directory publication will retry');return false;}
 }
 async schedule(room){
  const published=await this.publishListing(room);
  if(coopTerminal(room)){
   const settled=await this.settleRewards(room);
   await this.ctx.storage.setAlarm(settled?Date.now()+(published?3600000:5000):this.rewardRetryAt||Date.now()+15000);return;
  }
  const deadlines=room.status==='LOBBY'?[room.expiresAt,...room.members.map(m=>m.lastSeen+COOP_RULES.disconnectMs)]:[
   ...room.members.filter(m=>!m.result).map(m=>m.lastSeen+COOP_RULES.disconnectMs),
   room.status==='LOADING'?room.loadingEndsAt:room.startsAt+room.durationMs,nextCoopPatternAt(room)];
  if(!published)deadlines.push(Date.now()+5000);
  await this.ctx.storage.setAlarm(Math.max(Date.now()+50,Math.min(...deadlines)));
 }
 broadcast(room){
  for(const ws of this.ctx.getWebSockets()){
   const session=ws.deserializeAttachment();
   try{const view=coopView(room,{id:session.id},Date.now(),session.revision);ws.send(JSON.stringify(view));session.revision=room.battleRevision;ws.serializeAttachment(session);}
   catch{try{ws.close(1000,'대기방 종료');}catch{}}
  }
 }
 async create(input){
  let room=this.read();
  if(room){if(room.hostId!==Number(input.user.id)||room.creationRequest!==input.requestId)return {ok:false,status:409,code:'COOP_ROOM_EXISTS',error:'대기방 코드가 이미 사용 중입니다.'};return {ok:true,roomId:room.id};}
  try{room=createCoopRoom({...input,now:Date.now()});}
  catch(e){return {ok:false,status:e.status||400,code:e.code||'COOP_INPUT',error:e.code?e.message:'대기방 정보를 확인하세요.'};}
  room.creationRequest=input.requestId;this.save(room);await this.schedule(room);return {ok:true,roomId:room.id};
 }
 async state(user,revision=-1){
  return this.ctx.blockConcurrencyWhile(()=>this.stateLocked(user,revision));
 }
 async stateLocked(user,revision=-1){
  const room=this.read();if(!room)return {ok:false,status:404,code:'COOP_MISSING',error:'대기방을 찾을 수 없습니다.'};
  await this.completeEntry(room);
  advanceCoopRoom(room,Date.now());this.save(room);await this.schedule(room);
  try{return coopView(room,user,Date.now(),revision);}catch(e){return {ok:false,status:e.status||400,code:e.code,error:e.message};}
 }
 async command(user,kind,input){
  return this.ctx.blockConcurrencyWhile(()=>this.commandLocked(user,kind,input));
 }
 async commandLocked(user,kind,input){
  const room=this.read();if(!room)return {ok:false,status:404,code:'COOP_MISSING',error:'대기방을 찾을 수 없습니다.'};
  await this.completeEntry(room);
  // Persist timeouts even if the submitted command is rejected.
  const beforeSignal=JSON.stringify([room.status,room.battleRevision,room.pattern?.id,room.pattern?.status,room.members.map(m=>m.result)]);
  advanceCoopRoom(room,Date.now());this.save(room);
  const signature=JSON.stringify([Number(user.id),kind,input.clientId,input.cardIds,input.mercenaryCode,input.patternId,input.action]);
  const prior=input.requestId&&room.receipts.find(r=>r.id===user.id+':'+input.requestId);
  if(prior&&prior.signature!==signature)return {ok:false,status:409,code:'COOP_REQUEST_CONFLICT',error:'같은 요청으로 다른 작업을 할 수 없습니다.'};
  try{
   if(!prior){
    const wasLobby=room.status==='LOBBY';
    coopCommand(room,user,kind,input,Date.now());room.version++;
    if(input.requestId){room.receipts.push({id:user.id+':'+input.requestId,signature});room.receipts=room.receipts.slice(-100);}
    if(wasLobby&&room.status==='LOADING'&&room.rewardPolicy?.entryEnergy){
     room.entryPending={requestKey:user.id+':'+input.requestId};this.save(room);
     await this.completeEntry(room);
    }
   }
   this.save(room);await this.schedule(room);
   const afterSignal=JSON.stringify([room.status,room.battleRevision,room.pattern?.id,room.pattern?.status,room.members.map(m=>m.result)]);
   if(kind!=='ping'||beforeSignal!==afterSignal)this.broadcast(room);
   return kind==='leave'?{ok:true}:coopView(room,user,Date.now(),input.revision??-1);
  }catch(e){const saved=this.read();if(!saved.entryPending){await this.schedule(saved);this.broadcast(saved);}return {ok:false,status:e.status||400,code:e.code||'COOP_ERROR',error:e.code?e.message:'전투 편성을 확인하지 못했습니다.'};}
 }
 async issueTicket(user,clientId){
  const result=await this.command(user,'connect',{clientId});
  if(!result.ok||result.state.myResult)return result;
  const token=crypto.randomUUID(),expires=Date.now()+60000;
  this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires<? OR user_id=?',Date.now(),Number(user.id));
  this.ctx.storage.sql.exec('INSERT INTO tickets VALUES(?,?,?,?)',token,Number(user.id),clientId,expires);
  return {...result,ticket:token};
 }
 async fetch(request){
  if(new URL(request.url).pathname==='/api/war-chat/stream')return this.chatHost().live(request);
  if(new URL(request.url).pathname.includes('/defense/live/'))return this.defenseHost().live(request,new URL(request.url).pathname.split('/').at(-1));
  if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('Upgrade required',{status:426});
  // Only the authenticated API route can reach this private namespace.
  const token=new URL(request.url).searchParams.get('ticket');
  const ticket=this.ctx.storage.sql.exec('DELETE FROM tickets WHERE token=? AND expires>? RETURNING user_id,client',token,Date.now()).toArray()[0];
  if(!ticket)return Response.json({ok:false,code:'COOP_TICKET',error:'연결 시간이 만료되었습니다.'},{status:401});
  const user={id:Number(ticket.user_id)},clientId=ticket.client;
  const result=await this.command(user,'connect',{clientId});
  if(!result.ok)return Response.json(result,{status:result.status});
  if(result.state.myResult)return Response.json({ok:false,code:'COOP_FINISHED',error:'이미 종료되거나 이탈한 전투입니다.'},{status:409});
  for(const old of this.ctx.getWebSockets(String(user.id)))try{old.close(4001,'접속 갱신');}catch{}
  const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server,[String(user.id)]);
  server.serializeAttachment({id:user.id,clientId,revision:result.state.battleRevision});server.send(JSON.stringify(result));
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws,message){
  if(ws.deserializeAttachment()?.chat===true)return this.chatHost().message(ws,message);
  const session=ws.deserializeAttachment();
  try{
   if(typeof message!=='string'||message.length>1024)throw Error('size');
   const body=JSON.parse(message);if(!['ping','loaded','leave','mechanic'].includes(body.type))throw Error('command');
   if(body.type==='ping'&&Date.now()-(session.lastPing||0)<700)return;
   if(body.type==='ping'){session.lastPing=Date.now();ws.serializeAttachment(session);}
   const result=await this.command({id:session.id},body.type,{clientId:session.clientId,revision:session.revision,...(body.type==='mechanic'?{patternId:body.patternId,action:body.action}:{})});
   if(body.type==='ping'&&result.ok){session.revision=result.state.battleRevision;ws.serializeAttachment(session);ws.send(JSON.stringify({...result,clientSentAt:Number.isFinite(body.clientSentAt)?body.clientSentAt:null}));}
   else if(!result.ok)ws.send(JSON.stringify(result));
  }catch{ws.send(JSON.stringify({ok:false,code:'COOP_MESSAGE',error:'연결 요청을 확인하세요.'}));}
 }
 async webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}}
 async webSocketError(ws){try{ws.close(1011,'연결 오류');}catch{}}
 async alarm(){
  return this.ctx.blockConcurrencyWhile(()=>this.alarmLocked());
 }
 async alarmLocked(){
  const room=this.read();if(!room)return;
  if(room.kind==='WAR_CHAT_V1')return this.chatHost().alarm();
  if(room.kind==='MONSTER_DEFENSE_V1')return this.defenseHost().alarm();
  try{await this.completeEntry(room);}catch{return;}
  if(coopTerminal(room)&&room.clearRewards&&Date.now()>(room.finishedAt||room.expiresAt)+3600000){for(const ws of this.ctx.getWebSockets())try{ws.close(1000,'대기방 종료');}catch{}await this.ctx.storage.deleteAll();return;}
  advanceCoopRoom(room,Date.now());this.save(room);await this.schedule(room);this.broadcast(room);
 }
}

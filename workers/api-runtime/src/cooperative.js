import {DurableObject} from 'cloudflare:workers';
import {createCoopRoom,coopCommand,advanceCoopRoom,coopView,coopTerminal} from '../../../functions/_cooperative_room.js';
import {COOP_RULES} from '../../../shared/cooperative-battleground-v1.mjs';

// Per-player routing only. Commands are serialized by the existing user lock.
export class CooperativePlayer extends DurableObject{
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS active (id INTEGER PRIMARY KEY,room TEXT NOT NULL)');}
 getRoom(){return this.ctx.storage.sql.exec('SELECT room FROM active WHERE id=1').toArray()[0]?.room||null;}
 setRoom(room){if(!room)this.ctx.storage.sql.exec('DELETE FROM active WHERE id=1');else this.ctx.storage.sql.exec('INSERT INTO active(id,room) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET room=excluded.room',room);return room;}
}
export class CooperativeRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY,json TEXT NOT NULL)');ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tickets(token TEXT PRIMARY KEY,user_id INTEGER,client TEXT,expires INTEGER)');}
 read(){const raw=this.ctx.storage.sql.exec('SELECT json FROM room WHERE id=1').toArray()[0]?.json;return raw?JSON.parse(raw):null;}
 save(room){this.ctx.storage.sql.exec('INSERT INTO room(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(room));}
 async schedule(room){
  if(coopTerminal(room)){await this.ctx.storage.setAlarm(Date.now()+3600000);return;}
  const deadlines=room.status==='LOBBY'?[room.expiresAt,...room.members.map(m=>m.lastSeen+COOP_RULES.disconnectMs)]:[
   ...room.members.filter(m=>!m.result).map(m=>m.lastSeen+COOP_RULES.disconnectMs),
   room.status==='LOADING'?room.loadingEndsAt:room.startsAt+room.durationMs];
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
  const room=this.read();if(!room)return {ok:false,status:404,code:'COOP_MISSING',error:'대기방을 찾을 수 없습니다.'};
  advanceCoopRoom(room,Date.now());this.save(room);await this.schedule(room);
  try{return coopView(room,user,Date.now(),revision);}catch(e){return {ok:false,status:e.status||400,code:e.code,error:e.message};}
 }
 async command(user,kind,input){
  const room=this.read();if(!room)return {ok:false,status:404,code:'COOP_MISSING',error:'대기방을 찾을 수 없습니다.'};
  // Persist timeouts even if the submitted command is rejected.
  advanceCoopRoom(room,Date.now());this.save(room);
  const signature=JSON.stringify([Number(user.id),kind,input.clientId,input.cardIds,input.mercenaryCode]);
  const prior=input.requestId&&room.receipts.find(r=>r.id===user.id+':'+input.requestId);
  if(prior&&prior.signature!==signature)return {ok:false,status:409,code:'COOP_REQUEST_CONFLICT',error:'같은 요청으로 다른 작업을 할 수 없습니다.'};
  try{
   if(!prior){coopCommand(room,user,kind,input,Date.now());room.version++;if(input.requestId){room.receipts.push({id:user.id+':'+input.requestId,signature});room.receipts=room.receipts.slice(-100);}}
   this.save(room);await this.schedule(room);this.broadcast(room);
   return kind==='leave'?{ok:true}:coopView(room,user,Date.now(),input.revision??-1);
  }catch(e){const saved=this.read();await this.schedule(saved);this.broadcast(saved);return {ok:false,status:e.status||400,code:e.code||'COOP_ERROR',error:e.code?e.message:'전투 편성을 확인하지 못했습니다.'};}
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
  const session=ws.deserializeAttachment();
  try{
   if(typeof message!=='string'||message.length>1024)throw Error('size');
   const body=JSON.parse(message);if(!['ping','loaded','leave'].includes(body.type))throw Error('command');
   if(body.type==='ping'&&Date.now()-(session.lastPing||0)<700)return;
   if(body.type==='ping'){session.lastPing=Date.now();ws.serializeAttachment(session);}
   const result=await this.command({id:session.id},body.type,{clientId:session.clientId,revision:session.revision});
   if(!result.ok)ws.send(JSON.stringify(result));
  }catch{ws.send(JSON.stringify({ok:false,code:'COOP_MESSAGE',error:'연결 요청을 확인하세요.'}));}
 }
 async webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}}
 async webSocketError(ws){try{ws.close(1011,'연결 오류');}catch{}}
 async alarm(){
  const room=this.read();if(!room)return;
  if(coopTerminal(room)&&Date.now()>(room.finishedAt||room.expiresAt)+3600000){for(const ws of this.ctx.getWebSockets())try{ws.close(1000,'대기방 종료');}catch{}await this.ctx.storage.deleteAll();return;}
  advanceCoopRoom(room,Date.now());this.save(room);this.broadcast(room);await this.schedule(room);
 }
}

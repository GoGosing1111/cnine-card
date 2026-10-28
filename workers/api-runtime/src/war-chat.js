import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {chatGate} from '../../../functions/_war_chat.js';
import {WAR_CHAT_LIMITS as L,validChatRoom,chatText} from '../../../shared/war-chat-v1.mjs';
const error=(code,message,status=403)=>({ok:false,code:'CHAT_'+code,error:message,status});
const DEDUP_MS=300000;
export class WarChatRoom{
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.gate=null;this.checked=0;
  this.sql.exec('CREATE TABLE IF NOT EXISTS chat_tickets(token TEXT PRIMARY KEY,user_id INTEGER,session TEXT,expires INTEGER)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS chat_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,body TEXT,created INTEGER)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS chat_receipts(user_id INTEGER,nonce TEXT,body TEXT,sent INTEGER,seq INTEGER,created INTEGER,PRIMARY KEY(user_id,nonce))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS chat_receipts_created ON chat_receipts(created)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS chat_limits(key TEXT PRIMARY KEY,at INTEGER,count INTEGER)');
 }
 row(sql,...args){return this.sql.exec(sql,...args).toArray()[0];}
 room(){return JSON.parse(this.row('SELECT json FROM room WHERE id=1')?.json||'null');}
 sockets(){return this.ctx.getWebSockets().filter(ws=>ws.deserializeAttachment()?.chat===true);}
 close(ws,code,reason){try{ws.send(JSON.stringify({type:'closed',code,reason}));ws.close(code,reason);}catch{}}
 send(ws,data){try{if(ws.bufferedAmount>131072){this.close(ws,4003,'slow');return;}ws.send(JSON.stringify(data));}catch{this.close(ws,1011,'retry');}}
 prune(){
  const now=Date.now();this.sql.exec('DELETE FROM chat_tickets WHERE expires<=?',now);
  this.sql.exec('DELETE FROM chat_receipts WHERE created<?',now-DEDUP_MS-15000);
  this.sql.exec('DELETE FROM chat_messages WHERE created<? OR seq<COALESCE((SELECT seq FROM chat_messages ORDER BY seq DESC LIMIT 1 OFFSET ?),0)',now-L.retentionMs,L.retained-1);
  this.sql.exec('DELETE FROM chat_limits WHERE at<?',now-60000);
 }
 async ticket(input){
  const {userId,room,sessionHash}=input;
  if(!Number.isSafeInteger(userId)||userId<1||!validChatRoom(room)||!/^\w{64}$/.test(sessionHash||''))return error('INPUT','접속 정보를 확인하세요.',400);
  const current=this.room();if(current&&(current.kind!=='WAR_CHAT_V1'||current.id!==room))return error('ROOM','방을 확인하세요.');
  if(!current)this.sql.exec('INSERT INTO room(id,json) VALUES(1,?)',JSON.stringify({kind:'WAR_CHAT_V1',id:room}));
  const now=Date.now(),last=this.row('SELECT at FROM chat_limits WHERE key=?','ticket:'+userId);
  if(last&&now-last.at<750)return error('RATE','잠시 후 다시 연결하세요.',429);
  this.sql.exec('INSERT OR REPLACE INTO chat_limits VALUES(?,?,1)','ticket:'+userId,now);
  this.sql.exec('DELETE FROM chat_tickets WHERE expires<=? OR user_id=?',now,userId);
  const token=crypto.randomUUID();this.sql.exec('INSERT INTO chat_tickets VALUES(?,?,?,?)',token,userId,sessionHash,now+L.ticketMs);
  this.prune();if(this.sockets().length)await this.schedule();else await this.scheduleIdle();return {ok:true,room,ticket:token};
 }
 async refresh(extra=[]){
  // One in-flight roster/session validation per room. No per-message SQL on PG.
  if(this.refreshing){await this.refreshing;if(extra.every(x=>this.gate?.sessions.some(s=>s.token_hash===x)))return;}
  if(Date.now()-this.checked<L.gateMs&&extra.every(x=>this.gate?.sessions.some(s=>s.token_hash===x)))return;
  this.refreshing=(async()=>{
   let connection;
   try{
    if(this.env.HYPERDRIVE)connection=await createPostgresD1Compat(this.env.HYPERDRIVE.connectionString);
    const hashes=[...extra,...this.sockets().map(ws=>ws.deserializeAttachment().session)];
    this.gate=await chatGate({DB:connection?.db||this.env.DB},this.room().id,hashes);this.checked=Date.now();
   }catch{this.gate=null;this.checked=0;}
   finally{await connection?.close();}
  })();
  try{await this.refreshing;}finally{this.refreshing=null;}
  this.reap();
 }
 member(s){
  if(!this.gate?.enabled||!this.gate.sessions.some(x=>x.token_hash===s.session&&Number(x.user_id)===s.id))return null;
  return this.gate.members.find(x=>x.userId===s.id);
 }
 reap(){for(const ws of this.sockets())if(!this.member(ws.deserializeAttachment()))this.close(ws,this.gate?.enabled?4004:this.gate?4005:1013,this.gate?.enabled?'membership':this.gate?'off':'retry');}
 async live(request){
  if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('Upgrade required',{status:426});
  const t=this.row('DELETE FROM chat_tickets WHERE token=? AND expires>? RETURNING user_id,session',new URL(request.url).searchParams.get('ticket'),Date.now());
  if(!t)return Response.json(error('TICKET','다시 연결하세요.',401),{status:401});
  await this.refresh([t.session]);const s={chat:true,id:Number(t.user_id),session:t.session};
  if(!this.member(s))return Response.json(error('ACCESS','채팅방 이용 상태가 변경되었습니다.'),{status:403});
  const sockets=this.sockets(),same=sockets.filter(ws=>ws.deserializeAttachment().id===s.id);
  if(sockets.length>=L.sockets&&same.length<L.userSockets)return Response.json(error('CAPACITY','접속자가 많습니다. 잠시 후 다시 연결하세요.',429),{status:429});
  for(const ws of same.slice(0,Math.max(0,same.length-L.userSockets+1)))this.close(ws,4001,'other-tab');
  const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server,['war-chat',String(s.id)]);server.serializeAttachment(s);
  this.prune();
  const messages=this.sql.exec('SELECT seq,user_id AS userId,name,body,created FROM chat_messages ORDER BY seq DESC LIMIT ?',L.history).toArray().reverse();
  this.send(server,{type:'history',room:this.room().id,you:s.id,messages,serverNow:Date.now()});
  await this.schedule();return new Response(null,{status:101,webSocket:client});
 }
 async message(ws,raw){
  if(typeof raw!=='string'||raw.length>4096){this.close(ws,1008,'invalid');return;}
  let msg;try{msg=JSON.parse(raw);}catch{this.close(ws,1008,'invalid');return;}
  const s=ws.deserializeAttachment();if(!s?.chat)return;
  if(msg.type==='ping'){
   if(Date.now()-(s.ping||0)<15000)return;s.ping=Date.now();ws.serializeAttachment(s);
   await this.refresh();if(this.member(s))this.send(ws,{type:'pong',serverNow:Date.now()});return;
  }
  const body=chatText(msg.body),now=Date.now();
  if(msg.type!=='send'||!/^[-a-f0-9]{36}$/.test(msg.nonce||'')||!body||!Number.isSafeInteger(msg.sent)||msg.sent>now+15000||msg.sent<now-DEDUP_MS){this.send(ws,{...error('INPUT','300자 이내로 입력하세요. 오래된 전송은 내용을 확인하고 새로 보내세요.',400),nonce:msg.nonce});return;}
  await this.refresh();const member=this.member(s);if(!member){this.reap();return;}
  // All following SQLite mutations are synchronous: duplicate/rate checks and
  // persistence cannot interleave, including simultaneous tabs and socket retries.
  const prior=this.row('SELECT * FROM chat_receipts WHERE user_id=? AND nonce=?',s.id,msg.nonce);
  if(prior){this.send(ws,prior.body===body&&prior.sent===msg.sent?{type:'ack',nonce:msg.nonce,seq:prior.seq}:{...error('CONFLICT','같은 전송 번호의 내용이 다릅니다.',409),nonce:msg.nonce});return;}
  const user=this.row('SELECT at FROM chat_limits WHERE key=?','send:'+s.id),bucket=this.row("SELECT at,count FROM chat_limits WHERE key='room'"),sec=now-now%1000;
  if(user&&now-user.at<L.sendGapMs||bucket?.at===sec&&bucket.count>=L.roomPerSecond){this.send(ws,{...error('RATE','메시지가 많습니다. 잠시 후 다시 보내세요.',429),nonce:msg.nonce});return;}
  const seq=this.ctx.storage.transactionSync(()=>{const seq=this.row('INSERT INTO chat_messages(user_id,name,body,created) VALUES(?,?,?,?) RETURNING seq',s.id,member.nickname,body,now).seq;
  this.sql.exec('INSERT INTO chat_receipts VALUES(?,?,?,?,?,?)',s.id,msg.nonce,body,msg.sent,seq,now);
  this.sql.exec('INSERT OR REPLACE INTO chat_limits VALUES(?,?,1)','send:'+s.id,now);
  this.sql.exec("INSERT OR REPLACE INTO chat_limits VALUES('room',?,?)",sec,bucket?.at===sec?bucket.count+1:1);
  this.prune();return seq;});
  const payload={type:'message',message:{seq,userId:s.id,name:member.nickname,body,created:now}};
  for(const peer of this.sockets())if(this.member(peer.deserializeAttachment()))this.send(peer,payload);
  this.send(ws,{type:'ack',nonce:msg.nonce,seq});
 }
 async schedule(){const next=Date.now()+L.gateMs,alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>next)await this.ctx.storage.setAlarm(next);}
 async scheduleIdle(){
  // Idle rooms do not poll PostgreSQL. One expiry alarm erases stale records,
  // including rooms that are never opened again after their round ends.
  const next=[this.row('SELECT MIN(expires) n FROM chat_tickets')?.n,
   this.row('SELECT MIN(created)+? n FROM chat_receipts',DEDUP_MS+15000)?.n,
   this.row('SELECT MIN(created)+? n FROM chat_messages',L.retentionMs)?.n,
   this.row('SELECT MIN(at)+60000 n FROM chat_limits')?.n].filter(x=>Number.isFinite(x));
  if(next.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,Math.min(...next)+1));
 }
 async alarm(){
  this.prune();if(!this.sockets().length){await this.scheduleIdle();return;}
  this.checked=0;await this.refresh();if(this.sockets().some(ws=>this.member(ws.deserializeAttachment())))await this.schedule();else await this.scheduleIdle();
 }
}

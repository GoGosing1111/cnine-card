import {DurableObject} from 'cloudflare:workers';
import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {readAccountSync} from '../../../functions/_account_sync.js';
import {normalizeAccountSync,ACCOUNT_SYNC_POLL_MS,ACCOUNT_SYNC_LEASE_MS} from '../../../shared/account-sync-v1.mjs';
export class AccountSync extends DurableObject{
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sync_tickets(token TEXT PRIMARY KEY,user_id INTEGER,client TEXT,expires INTEGER)');}
 listening(){return this.ctx.getWebSockets().some(ws=>ws.deserializeAttachment()?.expires>Date.now());}
 async issueTicket({userId,clientId,snapshot}){
  if(!Number.isSafeInteger(userId)||userId<1||!/^[a-zA-Z0-9:_-]{12,120}$/.test(clientId))throw Error('Invalid sync identity');
  const existing=await this.ctx.storage.get('userId');if(existing&&existing!==userId)throw Error('Sync account mismatch');
  await this.ctx.storage.put('userId',userId);await this.publish(snapshot);
  const token=crypto.randomUUID(),now=Date.now();
  this.ctx.storage.sql.exec('DELETE FROM sync_tickets WHERE expires<=? OR client=?',now,clientId);
  this.ctx.storage.sql.exec('INSERT INTO sync_tickets VALUES(?,?,?,?)',token,userId,clientId,now+15000);
  return {ticket:token};
 }
 async publish(value){
  const next=normalizeAccountSync(value),old=await this.ctx.storage.get('snapshot');
  if(old&&BigInt(next.revision)<=BigInt(old.revision))return;
  await this.ctx.storage.put('snapshot',next);
  for(const ws of this.ctx.getWebSockets())try{const s=ws.deserializeAttachment();if(s.expires<=Date.now()){ws.close(4000,'renew');continue;}ws.send(JSON.stringify({type:'account',snapshot:next,serverNow:Date.now()}));}catch{}
 }
 async fetch(request){
  if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('Upgrade required',{status:426});
  const ticket=this.ctx.storage.sql.exec('DELETE FROM sync_tickets WHERE token=? AND expires>? RETURNING user_id,client',new URL(request.url).searchParams.get('ticket'),Date.now()).toArray()[0];
  if(!ticket)return Response.json({code:'SYNC_TICKET'},{status:401});
  const sockets=this.ctx.getWebSockets();if(sockets.length>=4)try{sockets[0].close(4000,'limit');}catch{}
  const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);
  server.serializeAttachment({id:ticket.user_id,client:ticket.client,expires:Date.now()+ACCOUNT_SYNC_LEASE_MS});
  server.send(JSON.stringify({type:'account',snapshot:await this.ctx.storage.get('snapshot'),serverNow:Date.now()}));
  await this.schedule();return new Response(null,{status:101,webSocket:client});
 }
 async schedule(){const next=Date.now()+ACCOUNT_SYNC_POLL_MS,alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>next)await this.ctx.storage.setAlarm(next);}
 async alarm(){
  for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.expires<=Date.now())try{ws.close(4000,'renew');}catch{}
  if(!this.listening())return;
  let connection;
  try{if(this.env.HYPERDRIVE)connection=await createPostgresD1Compat(this.env.HYPERDRIVE.connectionString);
   await this.publish(await readAccountSync({DB:connection?.db||this.env.DB},await this.ctx.storage.get('userId')));
  }catch{console.warn('ACCOUNT_SYNC_RECONCILE_RETRY');}
  finally{await connection?.close();if(this.listening())await this.schedule();}
 }
 webSocketMessage(ws,message){
  try{if(typeof message!=='string'||message.length>128)throw Error();const value=JSON.parse(message),s=ws.deserializeAttachment();
   if(value.type!=='ping'||s.expires<=Date.now()){ws.close(4000,'renew');return;}
   if(Date.now()-(s.lastPing||0)<5000)return;s.lastPing=Date.now();ws.serializeAttachment(s);ws.send(JSON.stringify({type:'pong',serverNow:Date.now()}));
  }catch{try{ws.close(1008,'invalid');}catch{}}
 }
 webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}}
 webSocketError(ws){try{ws.close(1011,'retry');}catch{}}
}

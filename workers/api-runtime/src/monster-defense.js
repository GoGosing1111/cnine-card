import {createRoom,joinRoom,leaveRoom,commandRoom,advanceRoom,publicSnapshot,defaultLoadout} from '../../../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_RULES} from '../../../shared/monster-defense-v1.mjs';
import {readJointBody} from '../../../functions/_joint_request.js';
const terminal=room=>['VICTORY','DEFEAT'].includes(room.phase);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
// Only namespaced defense rooms call this host. Existing cooperative rooms and
// their rewards keep their own implementation and storage records.
export class MonsterDefenseHost{
 constructor(ctx){this.ctx=ctx;}
 read(){const value=this.ctx.storage.sql.exec('SELECT json FROM room WHERE id=1').toArray()[0]?.json;return value?JSON.parse(value):null;}
 save(room){this.ctx.storage.sql.exec('INSERT INTO room(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(room));}
 advance(room,now=Date.now()){
  if(now-room.createdAt>=DEFENSE_RULES.roomMs||(!terminal(room)&&room.time>=DEFENSE_RULES.battleMs)){
   room.phase='DEFEAT';room.completedAt=room.time;room.spawnQueue=[];room.players.forEach(p=>p.reviveAt=0);
  }
  const delta=Math.min(DEFENSE_RULES.maxCatchupMs,Math.max(0,now-room.serverAt)),steps=Math.floor(delta/100)*100;
  if(room.phase==='LOBBY'||terminal(room))room.serverAt=now;
  else if(steps){advanceRoom(room,steps);room.serverAt+=steps;}
  for(const p of room.players)if(!p.bot)p.connected=now-(p.lastSeen||0)<8000;
 }
 async schedule(room){await this.ctx.storage.setAlarm(terminal(room)?Math.max(Date.now()+1000,room.createdAt+DEFENSE_RULES.roomMs):Date.now()+(room.phase==='LOBBY'?6000:1000));}
 member(room,id){const p=room.players.find(p=>p.id===String(id));if(!p)fail('이 방의 대원이 아닙니다.',403);return p;}
 async ticket(room,user){
  const player=this.member(room,user.id);player.lastSeen=Date.now();player.connected=true;
  const token=crypto.randomUUID()+crypto.randomUUID(),expires=Date.now()+DEFENSE_RULES.sessionMs;
  this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires<?',Date.now());
  this.ctx.storage.sql.exec('INSERT INTO tickets VALUES(?,?,?,?)',token,Number(user.id),'defense',expires);
  this.ctx.storage.sql.exec('DELETE FROM tickets WHERE user_id=? AND token NOT IN (SELECT token FROM tickets WHERE user_id=? ORDER BY expires DESC,token DESC LIMIT 3)',Number(user.id),Number(user.id));
  this.save(room);await this.schedule(room);
  return {ok:true,token,expires,roomId:room.id,playerId:player.id,snapshot:publicSnapshot(room)};
 }
 async rpc(action,input){
  try{
   let room=this.read();const user=input.user;
   if(action==='create'){
    if(room){if(room.creationRequest!==input.requestId||room.hostId!==String(user.id))fail('이미 사용 중인 방 코드입니다.',409);return await this.ticket(room,user);}
    room=createRoom({...input,now:Date.now()});room.kind='MONSTER_DEFENSE_V1';room.serverAt=Date.now();room.creationRequest=input.requestId;room.receipts=[];room.settingsRevision=input.settingsRevision;
    joinRoom(room,{id:String(user.id),name:user.nickname,loadout:input.loadout});
    if(room.practice)for(let i=1;i<room.capacity;i++)joinRoom(room,{id:'bot-'+i,name:'자동 대원 '+i,bot:true,loadout:i===1?{mercenaries:['V-001','V-004'],card:'BONGJUN'}:defaultLoadout()});
    return await this.ticket(room,user);
   }
   if(!room||room.kind!=='MONSTER_DEFENSE_V1')fail('진행 중인 디펜스 방이 없습니다.',404);
   this.advance(room);this.save(room);
   if(action==='inspect'){this.member(room,user.id);return {ok:true,roomId:room.id,terminal:terminal(room),phase:room.phase};}
   if(action==='join'){
    if(!room.players.some(p=>p.id===String(user.id))){if(room.practice)fail('연습 방에는 참가할 수 없습니다.');joinRoom(room,{id:String(user.id),name:user.nickname,loadout:input.loadout});}
    return await this.ticket(room,user);
   }
   if(action==='ticket')return await this.ticket(room,user);
   fail('지원하지 않는 방 요청입니다.');
  }catch(e){return {ok:false,status:e.status||400,error:e.message};}
 }
 async live(request,action){
  try{
   // Read the bounded body before loading mutable state: no await between
   // reading the room, applying a command and saving its receipt.
   const body=action==='command'&&request.method==='POST'?await readJointBody(request,{maxBytes:4096,fields:['requestId','command']}):null;
   const fingerprint=body?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body.command)))),b=>b.toString(16).padStart(2,'0')).join(''):null;
   const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
   if(!/^[a-f0-9-]{72}$/.test(token||''))fail('디펜스 연결을 갱신해 주세요.',401);
   const ticket=this.ctx.storage.sql.exec('SELECT user_id,expires FROM tickets WHERE token=? AND expires>?',token,Date.now()).toArray()[0];
   if(!ticket)fail('디펜스 연결이 만료됐습니다. 다시 연결합니다.',401);
   const room=this.read();if(!room||room.kind!=='MONSTER_DEFENSE_V1')fail('디펜스 방이 종료됐습니다.',404);
   this.advance(room);const p=this.member(room,ticket.user_id);p.lastSeen=Date.now();p.connected=true;this.save(room);
   if(action==='state'&&request.method==='GET'){
    const now=Date.now();if(now-(p.pollAt||0)>1000){p.pollAt=now;p.polls=0;}p.polls=(p.polls||0)+1;this.save(room);if(p.polls>15)fail('상태를 너무 자주 조회했습니다.',429);
    await this.schedule(room);const after=Math.max(0,Number(new URL(request.url).searchParams.get('after'))||0);
    return Response.json(publicSnapshot(room,after),{headers:{'cache-control':'no-store'}});
   }
   if(action!=='command'||request.method!=='POST')fail('지원하지 않는 명령입니다.',405);
   if(!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId||'')||!body.command)fail('명령 ID를 확인하세요.');
   const key=p.id+':'+body.requestId,prior=room.receipts.find(r=>r.key===key);
   if(prior){if(prior.fingerprint!==fingerprint)fail('같은 요청 ID로 다른 명령을 보낼 수 없습니다.',409);return Response.json({ok:true,duplicate:true});}
   if(room.receipts.length>=4096)fail('이번 방의 명령 한도에 도달했습니다.',429);
   const now=Date.now();if(now-(p.rateAt||0)>1000){p.rateAt=now;p.requests=0;}p.requests=(p.requests||0)+1;
   this.save(room);if(p.requests>15)fail('명령을 너무 빠르게 보냈습니다.',429);
   commandRoom(room,p.id,body.command);room.receipts.push({key,fingerprint});this.save(room);await this.schedule(room);
   return Response.json({ok:true,seq:room.seq},{headers:{'cache-control':'no-store'}});
  }catch(e){return Response.json({ok:false,error:e instanceof SyntaxError?'올바른 JSON 명령을 보내세요.':e.message},{status:e.status||400,headers:{'cache-control':'no-store'}});}
 }
 async leave(user){
  const room=this.read();if(!room)return {ok:true};this.advance(room);
  if(!terminal(room)&&room.phase!=='LOBBY')return {ok:false,status:409,error:'진행 중에는 화면 나가기를 사용하세요. 전투 종료 후 새 방을 만들 수 있습니다.'};
  leaveRoom(room,String(user.id));this.ctx.storage.sql.exec('DELETE FROM tickets WHERE user_id=?',Number(user.id));
  if(!room.players.some(p=>!p.bot)){await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();}
  else{this.save(room);await this.schedule(room);}return {ok:true};
 }
 async alarm(){const room=this.read();if(!room)return;if(Date.now()-room.createdAt>=DEFENSE_RULES.roomMs){await this.ctx.storage.deleteAll();return;}this.advance(room);this.save(room);await this.schedule(room);}
}

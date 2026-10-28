import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {warChatFixture} from './helpers/war-chat-fixture.mjs';
import {chatSettings,chatText,validChatRoom,chatRetryMs} from '../shared/war-chat-v1.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let n=0;n<200;n++){if(fn())return;await wait(50);}throw Error('Chat event timeout');};
async function socket(t,f,ticket,{expected=101,room=ticket.room,origin=f.origin}={}){
 const ws=new WebSocket(f.origin.replace('http:','ws:')+'/api/war-chat/stream?room='+encodeURIComponent(room)+'&ticket='+ticket.ticket,{origin}),messages=[],closed=[];t.after(()=>ws.terminate());ws.on('message',b=>{const m=JSON.parse(b);messages.push(m);if(m.type==='closed')closed.push(m.code);});ws.on('error',()=>{});ws.on('close',(code)=>closed.push(code));
 const status=await new Promise(r=>{ws.once('open',()=>r(101));ws.once('unexpected-response',(_q,s)=>{s.resume();ws.terminate();r(s.statusCode);});});assert.equal(status,expected);if(expected===101)await until(()=>messages.some(x=>x.type==='history'));return {ws,messages,closed};
}
test('strict OFF defaults, room scopes, text limits and bounded retry jitter',()=>{
 assert.deepEqual(chatSettings(),{revision:0,clan:false,territory:false,faction:false});assert.equal(chatSettings({clan:'true'}).clan,false);
 for(const s of ['war-chat:clan:12:1','war-chat:territory:86:A','war-chat:faction:qa-round:2'])assert(validChatRoom(s));
 for(const s of ['coop:12','war-chat:territory:86:3','war-chat:clan:12:0','war-chat:clan:12:9'])assert(!validChatRoom(s));
 assert.equal(chatText('a'.repeat(301)),null);assert.equal(chatText('  \n '),null);assert.equal(chatText('숨김\u202e'),null);assert.equal(chatText(' 안녕\n팀 '),'안녕 팀');assert.equal(chatText('😀'.repeat(300)).length,600);assert.equal(chatRetryMs(100,()=>1),31000);
});
test('OWNER-only CMS: initial OFF, strict payload/origin, concurrent CAS and atomic audit',async t=>{
 const f=await warChatFixture(t);assert.deepEqual((await f.call('admin/war-chat')).settings,chatSettings());
 for(const user of [2,3,0])assert.equal((await f.call('admin/war-chat',{user,method:'POST',body:{kind:'clan',enabled:true,revision:0}})).status,user?403:401);
 assert.equal((await f.ticket(2)).code,'CHAT_OFF');
 assert.equal((await f.call('admin/war-chat',{method:'POST',headers:{origin:'https://enemy.invalid'},body:{kind:'clan',enabled:true,revision:0}})).status,403);
 assert.equal((await f.call('admin/war-chat',{method:'POST',body:{kind:'clan',enabled:'ON',revision:0}})).status,400);
 const results=await Promise.all(['clan','territory'].map(kind=>f.call('admin/war-chat',{method:'POST',body:{kind,enabled:true,revision:0}})));assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM admin_logs').first()).n,1);
 await f.db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON admin_logs BEGIN SELECT RAISE(ABORT,'injected');END;");
 const before=(await f.call('admin/war-chat')).settings;assert.equal((await f.enable('faction')).status,503);assert.deepEqual((await f.call('admin/war-chat')).settings,before);
});
test('real sockets: ticket isolation/reuse, history reload, idempotency, rate limits and OFF revocation',async t=>{
 const f=await warChatFixture(t);await f.enable('territory');
 const a=await f.ticket(2),b=await f.ticket(3);await socket(t,f,a,{expected:401,room:b.room});await socket(t,f,a,{expected:403,origin:'https://enemy.invalid'});
 const first=await socket(t,f,a),other=await socket(t,f,b);await socket(t,f,a,{expected:401});
 const msg={type:'send',nonce:crypto.randomUUID(),sent:Date.now(),body:'<script>globalThis.chatXss=1</script> 아군만'};first.ws.send(JSON.stringify(msg));await until(()=>first.messages.some(x=>x.type==='ack'));
 assert.equal(other.messages.filter(x=>x.type==='message').length,0);await fetch(f.origin+'/__rehydrate?room='+encodeURIComponent(a.room));first.ws.send(JSON.stringify(msg));await until(()=>first.messages.filter(x=>x.type==='ack').length===2);assert.equal(first.messages.filter(x=>x.type==='message').length,1);
 first.ws.send(JSON.stringify({...msg,body:'변조'}));await until(()=>first.messages.some(x=>x.code==='CHAT_CONFLICT'));
 first.ws.send(JSON.stringify({...msg,nonce:crypto.randomUUID()}));await until(()=>first.messages.some(x=>x.code==='CHAT_RATE'));
 await wait(800);const fresh=await socket(t,f,await f.ticket(2));assert.equal(fresh.messages[0].messages.length,1);assert.equal(fresh.messages[0].messages[0].body,msg.body);
 await fetch(f.origin+'/__seed?room='+encodeURIComponent(a.room));assert.equal((await (await fetch(f.origin+'/__inspect?room='+encodeURIComponent(a.room))).json()).messages,200);
 const history=await socket(t,f,await f.ticket(4));assert.equal(history.messages[0].messages.length,100);assert(!history.messages[0].messages.some(m=>m.body==='기록 0'));
 await f.enable('territory',false);await until(()=>first.closed.length&&fresh.closed.length&&other.closed.length);assert.equal((await f.ticket(2)).code,'CHAT_OFF');
});
test('each kind uses current membership; session revocation, bans, room rollover and DB failure fail closed',async t=>{
 const f=await warChatFixture(t);for(const kind of ['clan','territory','faction'])await f.enable(kind);
 const channels=[];for(const kind of ['clan','territory','faction']){const ticket=await f.ticket(2,kind);assert.equal(ticket.status,200);channels.push(await socket(t,f,ticket));}
 await f.db.prepare("UPDATE territory_war_v3_users SET side='B' WHERE user_id=2").run();await until(()=>channels[1].closed.length);assert.equal(channels[0].closed.length,0);
 await f.db.prepare('DELETE FROM sessions WHERE user_id=2').run();await until(()=>channels[0].closed.length&&channels[2].closed.length);
 const next=await f.ticket(4,'faction'),c=await socket(t,f,next);await fetch(f.origin+'/__fault?room='+encodeURIComponent(next.room)+'&on=1');c.ws.send(JSON.stringify({type:'send',nonce:crypto.randomUUID(),sent:Date.now(),body:'실패 차단'}));await until(()=>c.closed.length);assert.equal(c.messages.filter(x=>x.type==='message').length,0);
 const cl=await socket(t,f,await f.ticket(6,'clan'));await f.db.exec("UPDATE users SET status='BANNED' WHERE id=6;");await until(()=>cl.closed.length);
 const tw=await socket(t,f,await f.ticket(8));await f.db.exec("INSERT INTO territory_war_v3_rounds VALUES(87,'RECRUITING','2099-01-01');");await until(()=>tw.closed.length);assert.equal((await f.ticket(4)).code,'CHAT_MEMBERSHIP');
});
test('40 concurrent senders share room validation and persist only bounded history with no enemy delivery',async t=>{
 const f=await warChatFixture(t,{people:82});await f.enable('territory');const clients=[];
 for(let id=2;id<=80;id+=2)clients.push(await socket(t,f,await f.ticket(id)));
 const enemy=await socket(t,f,await f.ticket(81)),room='war-chat:territory:86:A',inspect=()=>fetch(f.origin+'/__inspect?room='+encodeURIComponent(room)).then(r=>r.json());
 const before=await inspect();const start=Date.now();clients.forEach((c,i)=>c.ws.send(JSON.stringify({type:'send',nonce:crypto.randomUUID(),sent:Date.now(),body:'동시 메시지 '+i})));
 await until(()=>clients.every(c=>c.messages.some(m=>m.type==='ack'||m.code==='CHAT_RATE')));const elapsed=Date.now()-start,after=await inspect();
 assert(after.messages>0&&after.messages<=40);assert(after.queries-before.queries<=3,'queries are shared by room, never one membership read per message');assert.equal(enemy.messages.filter(x=>x.type==='message').length,0);
 const delivered=clients[0].messages.filter(x=>x.type==='message').map(x=>x.message.seq);assert.equal(new Set(delivered).size,delivered.length);
 const counts=Object.values(Object.groupBy(clients[0].messages.filter(x=>x.type==='message'),m=>Math.floor(m.message.created/1000))).map(x=>x.length);assert(counts.every(n=>n<=30),'room throughput is capped in every second');
 t.diagnostic(JSON.stringify({connections:41,parallelSends:40,stored:after.messages,sharedGateQueries:after.queries-before.queries,elapsedMs:elapsed,enemyMessages:0}));
});

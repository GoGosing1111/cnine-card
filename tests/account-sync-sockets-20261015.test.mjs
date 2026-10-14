import test from 'node:test';
import assert from 'node:assert/strict';
import * as miniflare from 'miniflare';
import {build} from 'esbuild';
import WebSocket from 'ws';
import {fileURLToPath} from 'node:url';

const until=async fn=>{for(let n=0;n<180;n++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Account synchronization timeout');};
test('real account sockets isolate identities, reject ticket reuse/origin spoofing and reconcile a missed notification',async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const entry=`export {AccountSync} from './workers/api-runtime/src/account-sync.js';
 import {handleAccountSync,accountSyncStream,publishAccountSync} from './functions/_account_sync.js';
 export default {async fetch(request,env){
  const u=new URL(request.url),path=u.pathname.replace(/^\\/api\\//,'');
  if(path==='sync/stream')return accountSyncStream(request,env);
  if(u.pathname==='/__fixture'){const {account,revision,publish}=await request.json();await env.DB.prepare('INSERT INTO account_sync_versions_v1(user_id,revision,domains) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,domains=excluded.domains').bind(account,String(revision),JSON.stringify({wallet:String(revision)})).run();if(publish)await publishAccountSync(env,account);return Response.json({ok:true});}
  const id=Number(request.headers.get('authorization')?.match(/^Bearer qa-([12])$/)?.[1]||0);
  return await handleAccountSync({path,request,env,deps:{authenticate:async()=>id?{id,status:'ACTIVE'}:null,json:(v,status=200,headers={})=>Response.json(v,{status,headers})}})||new Response('Not found',{status:404});
 }};`;
 const result=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'account-sync-fixture.mjs'},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false,
  plugins:[{name:'no-production-postgres',setup(b){b.onResolve({filter:/_postgres_d1_compat\.js$/},()=>({path:'pg-disabled',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function createPostgresD1Compat(){throw Error('Production DB is not available to this test')}"}));}}]});
 const options={script:result.outputFiles[0].text,modules:true,compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],cf:false,host:'127.0.0.1',port:0,log:new miniflare.Log(miniflare.LogLevel.ERROR),d1Databases:{DB:'account-sync-fixture'},durableObjects:{ACCOUNT_SYNC:{className:'AccountSync',useSQLite:true}}};
 const mf=new miniflare.Miniflare((miniflare.convertV4MiniflareOptions||((x)=>x))(options)),sockets=[];
 try{
  const origin=(await mf.ready).origin,db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE account_sync_versions_v1(user_id INTEGER PRIMARY KEY,revision TEXT,domains TEXT);');
  const change=(account,revision,publish=false)=>fetch(origin+'/__fixture',{method:'POST',body:JSON.stringify({account,revision,publish})});
  const ticket=async(id,extra={})=>{const r=await fetch(origin+'/api/sync/ticket',{method:'POST',headers:{authorization:'Bearer qa-'+id,'content-type':'application/json',origin,'x-cnine-client-id':'fixture-client-'+id,...extra},body:'{}'});return {status:r.status,...await r.json()};};
  const connect=async(account,key,expected=101,from=origin)=>{
   const ws=new WebSocket(origin.replace('http:','ws:')+'/api/sync/stream?account='+account+'&ticket='+key,{origin:from}),messages=[];sockets.push(ws);ws.on('message',raw=>messages.push(JSON.parse(raw)));ws.on('error',()=>{});
   const status=await new Promise(resolve=>{ws.once('open',()=>resolve(101));ws.once('unexpected-response',(_q,r)=>{const code=r.statusCode;r.resume();ws.terminate();resolve(code);});});assert.equal(status,expected);return {ws,messages};
  };
  assert.equal((await ticket(0)).status,401);assert.equal((await ticket(1,{origin:'https://outside.example'})).status,403);
  await change(1,1);await change(2,7);
  const a=await ticket(1),b=await ticket(2);assert.equal(a.status,200);
  await connect(2,a.ticket,401);await connect(1,a.ticket,403,'https://outside.example');
  const first=await connect(1,a.ticket),other=await connect(2,b.ticket);await connect(1,a.ticket,401);
  await until(()=>first.messages.length&&other.messages.length);assert.equal(first.messages[0].snapshot.revision,'1');assert.equal(other.messages[0].snapshot.revision,'7');
  await change(1,2,true);await until(()=>first.messages.some(m=>m.snapshot?.revision==='2'));assert(!other.messages.some(m=>m.snapshot?.revision==='2'));
  await change(1,3);await until(()=>first.messages.some(m=>m.snapshot?.revision==='3'));
  first.ws.send(JSON.stringify({type:'ping'}));await until(()=>first.messages.some(m=>m.type==='pong'));
  assert(first.messages.every(m=>!('coin' in m)&&!('token' in m)&&!('user' in m)));
  const renewed=await ticket(1);const fresh=await connect(1,renewed.ticket);await until(()=>fresh.messages.length);assert.equal(fresh.messages[0].snapshot.revision,'3');
 }finally{for(const ws of sockets)ws.terminate();await mf.dispose();}
});

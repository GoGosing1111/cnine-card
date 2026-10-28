import * as miniflare from 'miniflare';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {CLAN_RESUMPTION_VERSION} from '../../shared/clan-resumption-v1.mjs';
const root=fileURLToPath(new URL('../..',import.meta.url));
export async function warChatFixture(t,{people=8}={}){
 const entry=`import {CooperativeRoom as Base} from './workers/api-runtime/src/cooperative.js';
 import {handleWarChat,warChatStream} from './functions/_war_chat.js';
 import {prepareApiRuntimeRequest,openApiRuntimeRequest} from './functions/_api_runtime_transport.js';
 export class ChatFixture extends Base {
  constructor(ctx,env){const metrics={queries:0,fault:false};const DB={prepare(sql){metrics.queries++;if(metrics.fault)throw Error('Injected DB failure');return env.DB.prepare(sql);},batch:(x)=>env.DB.batch(x)};super(ctx,{...env,DB});this.metrics=metrics;}
  async chatInspect(){return {alarm:await this.ctx.storage.getAlarm(),checked:this.chatHost().checked,enabled:this.chatHost().gate?.enabled,sockets:this.ctx.getWebSockets().length,queries:this.metrics.queries,messages:this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM chat_messages').toArray()[0].n,receipts:this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM chat_receipts').toArray()[0].n};}
  chatFault(value){this.metrics.fault=value;this.chatHost().checked=0;}
  chatRehydrate(){this.warChatHost=null;}
  chatSeed(){for(let i=0;i<210;i++)this.ctx.storage.sql.exec('INSERT INTO chat_messages(user_id,name,body,created) VALUES(2,?,?,?)','검수','기록 '+i,Date.now()-(i===0?90000000:10000));this.chatHost().prune();}
  chatLoseAck(){const host=this.chatHost(),send=host.send.bind(host);let dropped=false;host.send=(ws,msg)=>{if(msg.type==='ack'&&!dropped){dropped=true;return;}send(ws,msg);};}
 }
 export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname.replace(/^\\/api\\//,'');
  if(url.pathname==='/__sql'){const rows=await request.json();return Response.json(await env.DB.batch(rows.map(x=>env.DB.prepare(x.sql).bind(...(x.args||[])))));}
  if(url.pathname==='/__inspect')return Response.json(await env.COOP_ROOMS.getByName(url.searchParams.get('room')).chatInspect());
  if(url.pathname==='/__fault'){await env.COOP_ROOMS.getByName(url.searchParams.get('room')).chatFault(url.searchParams.get('on')==='1');return Response.json({ok:true});}
  if(url.pathname==='/__rehydrate'){await env.COOP_ROOMS.getByName(url.searchParams.get('room')).chatRehydrate();return Response.json({ok:true});}
  if(url.pathname==='/__seed'){await env.COOP_ROOMS.getByName(url.searchParams.get('room')).chatSeed();return Response.json({ok:true});}
  if(url.pathname==='/__lose-ack'){await env.COOP_ROOMS.getByName(url.searchParams.get('room')).chatLoseAck();return Response.json({ok:true});}
  if(path==='war-chat/stream'){const p=await prepareApiRuntimeRequest(request,{API_RUNTIME_KEY:env.API_RUNTIME_KEY}),opened=await openApiRuntimeRequest(p,env);return warChatStream(opened.request,opened.env);}
  const id=Number(request.headers.get('authorization')?.match(/^Bearer chat-qa-(\\d+)$/)?.[1]||0);
  if(path==='war-chat/ticket'||path==='admin/war-chat')return handleWarChat({path,request,env,deps:{authenticate:async()=>id?env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first():null}});
  return env.ASSETS.fetch(request);
 }};`;
 const compiled=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'war-chat-fixture-entry.mjs'},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false,plugins:[{name:'no-production-db',setup(b){b.onResolve({filter:/_postgres_d1_compat\.js$/},()=>({path:'no-pg',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:"export function createPostgresD1Compat(){throw Error('No production database in test')}"}));}}]});
 const options={script:compiled.outputFiles[0].text,modules:true,compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],cf:false,host:'127.0.0.1',port:0,log:new miniflare.Log(miniflare.LogLevel.ERROR),bindings:{API_RUNTIME_KEY:Buffer.alloc(32,74).toString('base64')},d1Databases:{DB:'war-chat-qa'},durableObjects:{COOP_ROOMS:{className:'ChatFixture',useSQLite:true}},serviceBindings:{ASSETS:async request=>{
  const url=new URL(request.url),p=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=resolve(root,'.'+decodeURIComponent(p)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel))return new Response('Forbidden',{status:403});
  try{let data;try{data=await readFile(file);}catch{data=execFileSync('git',['show','HEAD:'+rel.replaceAll('\\','/')],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:30e6});}return new Response(data,{headers:{'content-type':({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
 }}};
 const mf=new miniflare.Miniflare((miniflare.convertV4MiniflareOptions||((x)=>x))(options));t.after(()=>mf.dispose());
 const origin=(await mf.ready).origin,db=await mf.getD1Database('DB');
 await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,banned_until TEXT);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at TEXT);CREATE TABLE admin_logs(id INTEGER PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE clan_seasons(id INTEGER PRIMARY KEY,phase TEXT,ends_at TEXT);CREATE TABLE clan_members(season_id INTEGER,user_id INTEGER,clan_id INTEGER,PRIMARY KEY(season_id,user_id));CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,ends_at TEXT);CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,status TEXT,PRIMARY KEY(round_id,user_id));CREATE TABLE organization_rounds_v1(id TEXT PRIMARY KEY,scope TEXT,phase TEXT);CREATE TABLE organization_members_v1(round_id TEXT,user_id INTEGER,organization_id INTEGER,PRIMARY KEY(round_id,user_id));`);
 const seed=[db.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').bind('clan_resumption_v1',JSON.stringify({version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:Date.parse('2026-10-25T15:30:00+09:00'),seasonId:12,roundId:'qa-round'})),db.prepare("INSERT INTO clan_seasons VALUES(12,'ACTIVE','2099-01-01')"),db.prepare("INSERT INTO territory_war_v3_rounds VALUES(86,'ACTIVE','2099-01-01')"),db.prepare("INSERT INTO organization_rounds_v1 VALUES('qa-round','LIVE','ASSIGNED')")];
 for(let id=1;id<=people;id++){const side=id%2===0?1:2;seed.push(db.prepare('INSERT INTO users VALUES(?,?,?,?,NULL)').bind(id,id===2?'<img src=x onerror=alert(1)>':'검수 참가자 '+id,id===1?'OWNER':id===3?'ADMIN':'USER','ACTIVE'),db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(createHash('sha256').update('chat-qa-'+id).digest('hex'),id,'2099-01-01'),db.prepare('INSERT INTO clan_members VALUES(12,?,?)').bind(id,side),db.prepare("INSERT INTO territory_war_v3_users VALUES(86,?,?,'ACTIVE')").bind(id,side===1?'A':'B'),db.prepare("INSERT INTO organization_members_v1 VALUES('qa-round',?,?)").bind(id,side));}
 for(let i=0;i<seed.length;i+=80)await db.batch(seed.slice(i,i+80));
 const call=async(path,{user=1,method='GET',body,headers={}}={})=>{const response=await fetch(origin+'/api/'+path,{method,headers:{origin,'content-type':'application/json',authorization:'Bearer chat-qa-'+user,...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const enable=async(kind,enabled=true)=>{const c=await call('admin/war-chat');return call('admin/war-chat',{method:'POST',body:{revision:c.settings.revision,kind,enabled}});};
 return {origin,mf,db,call,enable,ticket:(user,kind='territory')=>call('war-chat/ticket',{user,method:'POST',body:{kind}})};
}

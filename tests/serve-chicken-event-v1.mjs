// Loopback-only visual QA: real event transactions, isolated in-memory PostgreSQL.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {LIMITED_PACK_SCHEMA} from '../functions/_mercenary_limited_pack.js';
import {prepareChickenEvent,chickenAdmin,handleChickenEvent} from '../functions/_chicken_event.js';
import {CHICKEN_TICKET} from '../shared/chicken-event-v1.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),f=await fixture();
for(const sql of LIMITED_PACK_SCHEMA)await f.pg.exec(sql);
await prepareChickenEvent(f.pg);
await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,10,10)',[CHICKEN_TICKET]);
await f.pg.query("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-996',100,0),('V-990',100,0)");
const before=await chickenAdmin(f.env,{id:99});
await chickenAdmin(f.env,{id:99},{revision:before.revision,settings:{visible:true,enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),rewards:[{kind:'LIMITED',code:'V-996',quantity:1,chancePpm:1000000}]}});
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:4238');
 if(url.pathname==='/qa/chicken-admin/'){
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>철구네 치킨 CMS · 격리 검수</title><link rel="stylesheet" href="/admin/chicken-event-v1.css"><style>body{background:#080e19;color:#eaf1ff;font:15px system-ui;margin:0;padding:20px}button,input{font:inherit}#view-settings{max-width:1100px;margin:auto}a{color:#c5ff64}</style><div id="view-settings"><h1>로컬 CMS 검수 · 운영 DB 연결 없음</h1><div class="sectionIntro"></div></div><script>localStorage.setItem('cnine_admin_token','local-qa-only');</script><script type="module" src="/admin/chicken-event-v1.js"></script></html>`);return;
 }
 if(url.pathname.startsWith('/api/')){
  if(url.pathname==='/api/events/golden-axe/feature'){res.setHeader('content-type','application/json');res.end('{"visible":false}');return;}
  if(url.pathname==='/api/shell/summary'){res.setHeader('content-type','application/json');res.end(JSON.stringify({avatarFeature:{visible:false},alchemyFeature:{visible:false}}));return;}
  let body='';for await(const chunk of req)body+=chunk;
  const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
  const response=await handleChickenEvent({path:url.pathname.slice(5),request,env:f.env,deps:{authenticate:async()=>({id:1,status:'ACTIVE'}),requirePermission:async()=>({id:99,role:'OWNER'}),readBody:r=>r.json(),json:(v,s=200)=>Response.json(v,{status:s}),withUserMutationLock:(_env,_id,_path,fn)=>fn()}});
  if(!response){res.statusCode=404;res.end('{}');return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep))throw Error('Outside site');
 if((await stat(path)).isDirectory())path=resolve(path,'index.html');
 res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(path));
}catch{res.statusCode=404;res.end('Not found');}}).listen(4238,'127.0.0.1',()=>console.log('Chicken QA http://127.0.0.1:4238/preview/chicken-event-v1/'));

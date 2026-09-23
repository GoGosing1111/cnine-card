// Local-only QA: real event/CMS transactions against disposable PGlite.
// Never proxy a production API or read production credentials.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixtures/chuseok-v1.mjs';
import {handleChuseok} from '../functions/_chuseok.js';
import {handleGoldenAxe} from '../functions/_golden_axe.js';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),f=await fixture();
if(process.argv.includes('--open'))for(const event of ['songpyeon','envelope'])await f.configure([{id:'local-coin',kind:'COIN',ref:'',amount:1234,rate:100}],event);
await f.pg.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'SUPERSTAR_UPGRADE_13_TICKET',2,2),(1,'VEHICLE_PARTS_150_CHOICE',2,2)");
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf','.mp3':'audio/mpeg'};
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4238');
  if(url.pathname==='/qa/chuseok-admin/'){
   res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>추석 CMS · 격리 검수</title><link rel="stylesheet" href="/admin/chuseok-v1.css"><style>body{background:#080c17;color:#edf2fc;font:15px system-ui;padding:20px}#view-settings{max-width:1180px;margin:auto}</style><div id="view-settings"><h1>로컬 CMS 검수 · 운영 DB 연결 없음</h1><div class="sectionIntro"></div></div><script>localStorage.setItem('cnine_admin_token','local-qa-only');</script><script type="module" src="/admin/chuseok-v1.js"></script></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/shell/summary'){res.setHeader('content-type','application/json');res.end(JSON.stringify({avatarFeature:{visible:false},alchemyFeature:{visible:false}}));return;}
   let body='';for await(const chunk of req)body+=chunk;
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),args={path:url.pathname.slice(5),request,env:f.env,deps:{authenticate:async()=>({id:1,status:'ACTIVE'}),requirePermission:async()=>({id:99,role:'OWNER'}),readBody:r=>r.json(),json:(v,s=200)=>Response.json(v,{status:s})}};
   const response=await handleChuseok(args)||await handleGoldenAxe(args);if(!response){res.statusCode=404;res.end('{}');return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep))throw Error('Path outside site');if((await stat(path)).isDirectory())path=resolve(path,'index.html');
  res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.setHeader('cache-control','no-store');
  let content=await readFile(path);if(url.pathname==='/events/chuseok/')content=content.toString().replace('<body>','<body><div style="background:#253c30;color:#c8ff6b;text-align:center;font:11px system-ui;padding:6px">격리 로컬 검수 · 운영 계정·DB 연결 없음</div>');
  res.end(content);
 }catch(e){console.error(e.message);res.statusCode=404;res.end('Not found');}
}).listen(4238,'127.0.0.1',()=>console.log('Chuseok QA: http://127.0.0.1:4238/events/chuseok/ · CMS: /qa/chuseok-admin/'));

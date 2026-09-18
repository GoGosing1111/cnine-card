// Local-only QA with the real transaction implementation and an isolated PGlite DB.
// No production token, account, database, API proxy or grants are used.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixtures/golden-axe-v1.mjs';
import {handleGoldenAxe} from '../functions/_golden_axe.js';
import {SUPERSTAR_13,PARTS_CHOICE} from '../js/golden-axe-model-v1.js';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),f=await fixture();await f.configure('H_BODY');
await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,2,2),(1,$2,2,2)',[SUPERSTAR_13,PARTS_CHOICE]);
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf','.mp3':'audio/mpeg'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:4237');if(url.pathname==='/qa/golden-axe-admin/'){res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>금도끼 CMS · 격리 검수</title><link rel="stylesheet" href="/admin/golden-axe-v1.css"><style>body{background:#080e19;color:#eaf1ff;font:15px system-ui;margin:0;padding:20px}button,input{font:inherit}#view-settings{max-width:1100px;margin:auto}a{color:#c5ff64}</style><div id="view-settings"><h1>로컬 CMS 검수 · 운영 DB 연결 없음</h1><div class="sectionIntro"></div></div><script>localStorage.setItem('cnine_admin_token','local-qa-only');</script><script type="module" src="/admin/golden-axe-v1.js"></script></html>`);return;}if(url.pathname.startsWith('/api/')){
 if(url.pathname==='/api/shell/summary'){res.setHeader('content-type','application/json');res.end(JSON.stringify({avatarFeature:{visible:false},alchemyFeature:{visible:false}}));return;}
 let body='';for await(const chunk of req)body+=chunk;const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{} )});const response=await handleGoldenAxe({path:url.pathname.slice(5),request,env:f.env,deps:{authenticate:async()=>({id:1,status:'ACTIVE'}),requirePermission:async()=>({id:99,role:'OWNER'}),readBody:r=>r.json(),json:(v,s=200)=>Response.json(v,{status:s})}});if(!response){res.statusCode=404;res.end('{}');return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep))throw Error('Path outside site');if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(path));}catch(e){res.statusCode=404;res.end('Not found');}}).listen(4237,'127.0.0.1',()=>console.log('Golden axe real-code QA: http://127.0.0.1:4237/events/golden-axe/'));

// Disposable local DB and the real player shell. Never connects to production.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {handleIconFusion,runIconFusion} from '../functions/_icon_fusion.js';
import {handleIconCms} from '../functions/_icon_cms.js';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),port=Number(process.env.ICON_QA_PORT||8977),origin=`http://127.0.0.1:${port}`;
let f,roll=0,posts=0,lose=false;
const localCards=ICON_LIVE_CARDS.map(c=>({...c,id:c.cardId,title:c.name,member:c.name,image:c.sourceArt}));
for(const [id,grade,file] of [['CN-SUPER','SUPERSTAR','assets/ui/project-v/characters/superstar/manifest-v1.json'],['CN-FUR','FUR','assets/ui/project-v/characters/fur/manifest-v2.json']]){const c=JSON.parse(fs.readFileSync(path.join(root,file))).characters[0];localCards.push({id,title:c.title,member:c.member,name:c.member,grade,image:c.sourceArt,basePower:10000});}
async function reset(){await f?.close();f=await iconFusionFixture(null,{postgres:true});f.deps.requirePermission=async()=>f.user;roll=0;posts=0;lose=false;for(const c of localCards.slice(-2))await f.p('UPDATE cards SET image_url=?,title=? WHERE id=?',c.image,c.title,c.id).run();}
await reset();
const profile=async()=>{const s=await f.snapshot();return {id:7,nickname:'아이콘 검수',role:'OWNER',coin:s.coin,masterStars:s.stars,pigCoin:0,owned:s.cards.filter(c=>c.quantity>0).map(c=>c.card_id),quantities:Object.fromEntries(s.cards.map(c=>[c.card_id,c.quantity])),breakthroughs:Object.fromEntries(s.cards.map(c=>[c.card_id,c.breakthrough_level]))};};
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2'};
const send=(res,status,data,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof data==='string'?data:JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`)return send(res,403,{});
 const url=new URL(req.url,origin),chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
 if(url.pathname==='/__qa/reset'&&req.method==='POST'){await reset();return send(res,200,{ok:true});}
 if(url.pathname==='/__qa/control'&&req.method==='POST'){const c=JSON.parse(body);roll=c.roll??roll;lose=c.lose===true;if(c.video)await f.setting('icon_fusion_settings_v1',{revision:1,enabled:true,successVideoUrl:'/assets/videos/qa-missing.mp4',successVideoDurationMs:1000});if(typeof c.enabled==='boolean')await f.setting('icon_fusion_settings_v1',{revision:1,enabled:c.enabled,successVideoUrl:'',successVideoDurationMs:12000});if(c.rearm)await f.p("UPDATE user_cards SET breakthrough_level=13 WHERE card_id IN ('CN-SUPER','CN-FUR')").run();return send(res,200,{ok:true});}
 if(url.pathname==='/__qa/state')return send(res,200,{...await f.snapshot(),posts});
 if(url.pathname==='/__qa/cms')return send(res,200,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/css/icon-grade-v1.css"><link rel="stylesheet" href="/admin/icon-admin-v1.css"><style>body{display:block;background:#0a0d14;color:#fff;padding:16px}main{max-width:1320px;margin:auto}</style><main id="root"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');</script><script type="module">import {mountIconCms} from '/admin/icon-admin-v1.mjs';mountIconCms(document.querySelector('#root'));</script></html>`,'text/html; charset=utf-8');
 if(url.pathname.startsWith('/api/')){
  const apiPath=url.pathname.slice(5),request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
  if(apiPath==='icons/fusion'&&req.method==='POST'){
   posts++;const result=await f.deps.withUserMutationLock(f.env,7,apiPath,()=>runIconFusion(f.env,f.user,JSON.parse(body),{randomInt:()=>roll}));
   if(lose){lose=false;return send(res,503,{error:'QA lost acknowledgement',retryable:true});}return send(res,200,result);
  }
  const response=await handleIconFusion({path:apiPath,request,env:f.env,deps:f.deps})||await handleIconCms({path:apiPath,request,env:f.env,deps:f.deps});
  if(response)return send(res,response.status,await response.json());
  if(['me','me/summary'].includes(apiPath))return send(res,200,{user:await profile(),prison:{incarcerated:false}});
  if(apiPath==='me/collection')return send(res,200,{collection:await profile()});
  if(apiPath==='cards')return send(res,200,{cards:localCards});
  if(apiPath==='packs')return send(res,200,{packs:[]});
  if(apiPath==='loot-shop/balance')return send(res,200,{pigCoins:0});
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Unrelated QA write rejected'});
  return send(res,200,{ok:true,enabled:false,items:[],commands:[],maintenance:{active:false}});
 }
 if(url.pathname==='/data/cards.json')return send(res,200,localCards);
 if(!['GET','HEAD'].includes(req.method))return send(res,405,{});
 const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
 if(rel.split(/[\\/]/).some(s=>s.startsWith('.'))||!['index.html','style.css','manifest.webmanifest','favicon.ico'].includes(rel)&&!['assets','css','js','shared','admin','preview','data','pve-v3'].includes(rel.split('/')[0]))return send(res,404,{});
 let file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return send(res,404,{});if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return send(res,404,{});
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});req.method==='HEAD'?res.end():fs.createReadStream(file).pipe(res);
 }catch(error){send(res,error.status||500,{error:error.message,code:error.code,retryable:error.retryable});}});
server.listen(port,'127.0.0.1',()=>console.log(origin));
process.on('SIGINT',()=>server.close(async()=>{await f.close();process.exit();}));

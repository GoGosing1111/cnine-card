import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {polishFixture} from '../tests/helpers/equipment-polish-db.mjs';
import {handleEquipmentPolish} from '../functions/_equipment_polish.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),f=await polishFixture();
const port=Number(process.env.POLISH_REVIEW_PORT||8938);
let reviewRole='USER';
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2','.json':'application/json'};
const links='<div style="background:#171d2c;color:white;padding:12px">격리 검수 · 운영 계정/재화와 무관 <a href="/__review/auth/OWNER">OWNER</a> · <a href="/__review/auth/USER">일반 유저</a> · <a href="/__review/cms">연마 CMS</a> · <a href="/equipment-forge/">강화 센터</a></div>';
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port),role=reviewRole;
    const send=(body,type='text/html; charset=utf-8',status=200)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(body);};
    if(url.pathname.startsWith('/__review/auth/')){
      const next=url.pathname.split('/').at(-1);if(!['OWNER','USER'].includes(next))return send('Invalid role','text/plain',400);
      reviewRole=next;res.writeHead(303,{'cache-control':'no-store',location:'/equipment-forge/'});return res.end();
    }
    if(url.pathname==='/__review/cms')return send('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/equipment-polish-admin-v1.css"><style>body{background:#10131e;color:#eee;font-family:system-ui;margin:0}main{max-width:1220px;margin:auto;padding:24px}nav{display:flex;gap:12px}button,input,select,textarea{font:inherit}</style>'+links+'<main><span id="roleBadge">'+role+'</span><nav id="nav"></nav><h1 id="pageTitle">연마 CMS 격리 검수</h1><div id="cms"></div></main><script type="module" src="/admin/equipment-polish-admin-v1.mjs"></script></html>');
    if(url.pathname.startsWith('/api/')){
      const path=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(url,{method:req.method,headers:{...req.headers,authorization:'Bearer local-polish-'+role},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handleEquipmentPolish({path,request,env:f.env,deps:f.deps});
      if(response){res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));}
      // Existing forge page is used only as the entry shell; its transactions are never enabled.
      if(path==='character/equipment/forge/state')return send(JSON.stringify({publicVisible:true,executionMode:'OFF',canEnhance:false,canRestore:false,notice:'격리 검수 강화 화면',items:[],inventory:[],materials:[],nextCursor:null}),'application/json');
      return send(JSON.stringify({error:'격리 연마 검수에 포함되지 않은 API'}),'application/json',404);
    }
    let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+sep))return send('Not found','text/plain',404);
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    let body=await readFile(file);
    if(extname(file)==='.html')body=Buffer.from(body.toString().replace('<body>','<body>'+links));
    return send(body,types[extname(file)]||'application/octet-stream');
  }catch{return res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Isolated equipment polish review: http://127.0.0.1:'+port+'/__review/auth/OWNER'));

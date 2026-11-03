import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {execFileSync} from 'node:child_process';
import {userAuctionFixture} from './auction-user-fixture-20261103.mjs';
export async function startAuctionPreview(){
 const f=await userAuctionFixture(),root=path.resolve(import.meta.dirname,'../..'),assets=new Map();let queue=Promise.resolve();
 const first=await f.host(1,'MERCENARY',1,{startPrice:1e12});await f.host(3,'PET',1,{startPrice:1e11});await f.host(1,'MASTER_STAR',1e8,{startPrice:1e7});
 await f.service.bid(f.user(3),{lotId:first.lot.id,amount:1e12,requestId:f.requestId()});
 const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
 let realTime=Date.now();const clock=setInterval(()=>{const current=Date.now();f.advance(current-realTime);realTime=current;},1000);
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/'){res.writeHead(302,{location:'/preview/auction-user-20261103/index.html'});return res.end();}
   if(url.pathname.startsWith('/__auction-preview/')){
    const action=url.pathname.split('/').pop(),user=f.user(Number(req.headers['x-preview-user']||2));if(!user)return json(res,{error:'Unknown preview account'},401);
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)return json(res,{error:'Too large'},413);}const body=raw?JSON.parse(raw):null;
    if(!['state','catalog','host','bid','cancel','notice','return'].includes(action))return json(res,{error:'Unknown preview route'},404);
    if(['host','bid','cancel','notice','return'].includes(action)&&req.method!=='POST')return json(res,{error:'POST required'},405);
    const run=async()=>{if(action==='state')return f.service.state(user);if(action==='catalog')return {assets:await f.catalog(user)};if(action==='host')return f.service.host(user,body);if(action==='bid')return f.service.bid(user,body);if(action==='cancel')return f.service.cancel(user,body.lotId);if(action==='notice')return f.service.claimNotice(user,body.lotId);if(action==='return')return f.service.claimReturn(user,body.lotId);};
    const result=queue.then(run);queue=result.catch(()=>{});return json(res,await result);
   }
   if(url.pathname.startsWith('/api/'))return json(res,{error:'Live API unavailable in this isolated preview'},403);
   if(!['GET','HEAD'].includes(req.method))return json(res,{error:'Read only assets'},405);
   const key=url.pathname==='/'?'/preview/auction-user-20261103/index.html':decodeURIComponent(url.pathname),file=path.resolve(root,'.'+key);
   if(!file.startsWith(root+path.sep))return json(res,{error:'Outside preview root'},403);
   let bytes;if(fs.existsSync(file)&&fs.statSync(file).isFile())bytes=fs.readFileSync(file);
   else if(key.startsWith('/assets/')){if(!assets.has(key)){try{assets.set(key,execFileSync('git',['-c','gc.auto=0','cat-file','blob','HEAD:'+key.slice(1)],{cwd:root,maxBuffer:25e6,stdio:['ignore','pipe','ignore']}));}catch{assets.set(key,null);}}bytes=assets.get(key);}
   if(!bytes)return json(res,{error:'Not found: '+key},404);
   const type={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(bytes);
  }catch(e){json(res,{error:e.message},e.status||500);}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));return {origin:'http://127.0.0.1:'+server.address().port,fixture:f,close:async()=>{clearInterval(clock);server.closeAllConnections();await new Promise(r=>server.close(r));f.close();}};
}
if(process.argv.includes('--serve')){const server=await startAuctionPreview();console.log(server.origin);}

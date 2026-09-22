// Read-only localhost fixture. Every mutation is rejected; no production account credentials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), port = Number(process.env.FUSION_QA_PORT || 8827);
const response = await fetch('https://cnine-card.pages.dev/api/mercenary-codex');
if (!response.ok) throw Error('Cannot load the public catalog');
const catalog = await response.json(), counters = { reads:0, rejectedWrites:0 };
const sample = catalog.cards.filter(c => !c.artOnly && ['S','SS','SSS'].includes(c.rank));
const account = { accountId:4242,available:true,coin:'0',loadout:{mercenaryCode:sample[0]?.code,revision:1},
  cards:sample.map((c,i)=>({...c,level:1,duplicates:i%4+1,totalCopies:i%4+2,canDeploy:true})) };
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const prefixes=['/mercenary-codex/','/assets/ui/','/assets/sfx/v3-advancement-awakening-v1/','/assets/fonts/','/css/','/js/','/shared/'];
http.createServer((req,res)=>{
  const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return json(403,{});
  if(!['GET','HEAD'].includes(req.method)){counters.rejectedWrites++;return json(405,{error:'Read-only QA'});}
  const url=new URL(req.url,'http://127.0.0.1:'+port),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/api/mercenary-codex')return json(200,catalog);
  if(pathname==='/api/mercenaries/v3/state'){counters.reads++;return json(200,account);}
  if(pathname==='/__qa/report')return json(200,{...counters,cards:account.cards.map(c=>({code:c.code,duplicates:c.duplicates,totalCopies:c.totalCopies}))});
  if(pathname.startsWith('/api/'))return json(200,{ok:true,enabled:false,visible:false,items:[]});
  if(!prefixes.some(p=>pathname.startsWith(p))||pathname.split(/[\\/]/).some(p=>p.startsWith('.')))return json(404,{});
  let file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep))return json(403,{});
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep))return json(404,{});
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
  req.method==='HEAD'?res.end():fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log('Fusion QA http://127.0.0.1:'+port+'/mercenary-codex/?fusion=preview'));

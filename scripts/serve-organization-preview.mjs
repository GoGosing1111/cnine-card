import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {organizationFixture} from '../tests/helpers/organization-fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const port=4287,origin='http://127.0.0.1:'+port;
const fixture=await organizationFixture(null,{people:150});
await fixture.pg.query('INSERT INTO qa_ratings VALUES(1,12000,1)');
const roundId=await fixture.prepare({enroll:140});
await fixture.post('organization/withdraw',{roundId,revision:1},{user:2});
const mime={'.html':'text/html; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
  try{
    res.setHeader('Cache-Control','no-store');
    const url=new URL(req.url,origin);
    if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403);res.end('Loopback only');return;}
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='GET'&&req.headers.origin!==origin){res.writeHead(403);res.end('Same-origin local preview only');return;}
      let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>32000){res.writeHead(413);res.end('Request too large');return;}body+=chunk;}
      const apiPath=url.pathname.slice(5)+url.search;
      if(!/^(admin\/organization|organization\/)/.test(apiPath)){res.writeHead(404);res.end('Unknown local route');return;}
      const result=await fixture.call(apiPath,{user:Number(req.headers['x-qa-user']||2),method:req.method,body:body?JSON.parse(body):undefined,headers:{Origin:req.headers.origin||origin,'Content-Type':req.headers['content-type']||'application/json'}});
      res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result.data));return;
    }
    const requested=url.pathname==='/'?'/preview/organization-system-v1/index.html':decodeURIComponent(url.pathname);
    const allowed=requested==='/preview/organization-system-v1/index.html'||['/js/organization-system-v1.mjs','/js/organization-admission-v1.mjs','/shared/organization-interview-v1.mjs','/shared/organization-system-v1.mjs','/shared/organization-preparation-v1.mjs','/css/organization-admission-v1.css'].includes(requested)||requested==='/css/organization-system-v1.css'||requested.startsWith('/assets/ui/organization/')||requested.startsWith('/assets/fonts/');
    const file=path.resolve(root,'.'+requested),relative=path.relative(root,file);
    if(!allowed||relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  }catch(error){console.error(error);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local preview failed'}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Organization isolated preview: '+origin+' · 150 fictional accounts, 139 surveys; no live database'));
process.on('SIGINT',()=>server.close(async()=>{await fixture.closeDb();process.exit(0);}));

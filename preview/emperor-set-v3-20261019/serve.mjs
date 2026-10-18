import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url))),port=3555;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
http.createServer((req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1:'+port),rel=decodeURIComponent(url.pathname);
  if(!/^\/(assets|css|js|preview|shared)\//.test(rel)||rel.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404);return res.end();}
  let file=path.resolve(root,'.'+rel);if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.realpathSync(file).startsWith(root+path.sep)||!types[path.extname(file)]){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':types[path.extname(file)],'cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/preview/emperor-set-v3-20261019/'));

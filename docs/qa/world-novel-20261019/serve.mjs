import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,user:null,authenticated:false,items:[],favorites:[]}));return;}
  if(!['GET','HEAD'].includes(req.method)||pathname.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.realpathSync(file).startsWith(root+path.sep))throw Error('Outside root');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
}).listen(8949,'127.0.0.1',()=>console.log('World story review: http://127.0.0.1:8949/world/'));

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.mp3':'audio/mpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let route;try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch{res.writeHead(400);res.end();return;}
  if(route.startsWith('/api/')||route.split('/').some(part=>part.startsWith('.')||part==='node_modules')){res.writeHead(403);res.end('Read-only preview: route blocked');return;}
  let target=path.resolve(root,'.'+route);
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
    if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');
    const real=fs.realpathSync(target);if(!real.startsWith(root+path.sep))throw new Error('Outside workspace');
    const stat=fs.statSync(real);res.writeHead(200,{'Content-Type':mime[path.extname(real)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(real).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(8791,'127.0.0.1',()=>console.log('Read-only skill preview: http://127.0.0.1:8791/preview/battle-suit-skill-chip-v1/'));

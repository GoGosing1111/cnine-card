import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.BOSS_PREVIEW_PORT||4243);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:'+port),rel=decodeURIComponent(url.pathname).replace(/^\/+/,''),parts=rel.split(/[\\/]/);
  if(!['preview','assets','css','js','pve-v3','shared'].includes(parts[0])||parts.some(p=>p.startsWith('.'))){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/preview/apocalypse-bosses-v1/'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

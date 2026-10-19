import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),port=Number(process.env.CYAN_KNIGHT_PREVIEW_PORT||8991);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.wav':'audio/wav'};
http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port),relative=decodeURIComponent(u.pathname).replace(/^\/+/,''),parts=relative.split(/[\\/]/);
  if(!['GET','HEAD'].includes(req.method)||parts.some(p=>p.startsWith('.')||p==='..')||!['preview','assets','css','js','shared'].includes(parts[0])){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file),size=fs.statSync(file).size,headers={'content-type':ext==='.webm'?'video/webm':types[ext]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','accept-ranges':'bytes'};
  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if(range){
   const start=Number(range[1]),end=range[2]?Math.min(size-1,Number(range[2])):size-1;
   if(start>=size||start>end){res.writeHead(416,{'content-range':`bytes */${size}`});res.end();return;}
   res.writeHead(206,{...headers,'content-length':end-start+1,'content-range':`bytes ${start}-${end}/${size}`});
   if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);
  }else{
   res.writeHead(200,{...headers,'content-length':size});
   if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }
 }catch{res.writeHead(400);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`CYAN KNIGHT preview: http://127.0.0.1:${port}/preview/mercenary-cyan-knight-battle-20261020-v1/`));

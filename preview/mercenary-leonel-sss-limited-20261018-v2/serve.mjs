import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),port=Number(process.env.LEONEL_PREVIEW_PORT||8985);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav'};
http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port),relative=decodeURIComponent(u.pathname).replace(/^\/+/,''),parts=relative.split(/[\\/]/);
  if(!['GET','HEAD'].includes(req.method)||parts.some(p=>p.startsWith('.')||p==='..')||!['preview','assets','css','js','shared'].includes(parts[0])){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  const size=fs.statSync(file).size,range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(range){const start=Number(range[1]),end=range[2]?Math.min(size-1,Number(range[2])):size-1;if(start> end||start>=size){res.writeHead(416,{'content-range':`bytes */${size}`});res.end();return;}res.writeHead(206,{'content-type':types[path.extname(file)]||'application/octet-stream','content-length':end-start+1,'content-range':`bytes ${start}-${end}/${size}`,'accept-ranges':'bytes','cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','content-length':size,'accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Leonel preview: http://127.0.0.1:${port}/preview/mercenary-leonel-sss-limited-20261018-v2/`));

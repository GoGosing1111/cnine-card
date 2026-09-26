import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),port=Number(process.env.BERKAN_PREVIEW_PORT||8841);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.wav':'audio/wav'};
http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port),relative=decodeURIComponent(u.pathname).replace(/^\/+/,''),parts=relative.split(/[\\/]/);
  if(!['GET','HEAD'].includes(req.method)||parts.some(p=>p.startsWith('.')||p==='..')||!['preview','assets','css','js','shared'].includes(parts[0])){res.writeHead(404);res.end();return;}
  if(relative==='preview/mercenary-berkan-sss-v1/battle.html'){res.writeHead(302,{location:u.pathname.slice(0,-5)+u.search});res.end();return;}
  // Candidate roster is served only by this loopback-only review server.
  // The on-disk production roster, CMS and account APIs remain untouched.
  const localCandidate=relative==='assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'
   ?'preview/mercenary-berkan-sss-v1/release/roster.json':relative;
  let file=path.resolve(root,localCandidate);if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(relative==='preview/mercenary-berkan-sss-v1/battle')file+='.html';
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Berkan preview: http://127.0.0.1:${port}/preview/mercenary-berkan-sss-v1/`));

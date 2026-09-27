import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),port=Number(process.env.CARD_FX_PREVIEW_PORT||8975);
const files=new Set(['index.html','style.css','app.mjs','fx.mjs','model.mjs','legendary.mjs','assets/celestial-relic-frame-v1.png']);
const shared=new Set(['/css/player-card-v2052.css','/js/player-card-v2052.js','/js/player-card-model-v2052.js','/js/ui-fx-vendor-v2045.bundle.js','/assets/ui/cninelogo.png','/assets/ui/tiers/challenger-v2032.png','/assets/ui/avatars-v1/lobby-v1/avatar-f09-terran-empress-joeun-lobby-v1-640.webp']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'};
http.createServer((req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.writeHead(302,{location:'/preview/player-card-enhancement-v1/'});return res.end()}
  const relative=pathname.startsWith('/preview/player-card-enhancement-v1/')?pathname.slice('/preview/player-card-enhancement-v1/'.length)||'index.html':null;
  if(!(relative&&files.has(relative))&&!shared.has(pathname)&&!/^\/assets\/ui\/player-card\/[a-z0-9-]+\.webp$/.test(pathname)){res.writeHead(404);return res.end()}
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404);return res.end()}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end()}
}).listen(port,'127.0.0.1',()=>console.log(`Player card enhancement preview: http://127.0.0.1:${port}/preview/player-card-enhancement-v1/`));

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.env.RANK_PREVIEW_PORT||8936);
const shared=new Set(['/assets/ui/cninelogo.png','/css/player-card-v2052.css','/js/player-card-v2052.js','/js/soopketmon-v21-exact-shell-adapter.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    const url=new URL(req.url,`http://127.0.0.1:${port}`),name=decodeURIComponent(url.pathname);
    if(!name.startsWith('/preview/account-rank-v1/')&&!shared.has(name)){res.writeHead(404);return res.end();}
    let file=path.resolve(root,'.'+name);
    if(!file.startsWith(path.resolve(root)+path.sep)||name.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.'))){res.writeHead(404);return res.end();}
    if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.realpathSync(file).startsWith(path.resolve(root)+path.sep))throw Error('Outside preview');
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Account rank review: http://127.0.0.1:${port}/preview/account-rank-v1/`));

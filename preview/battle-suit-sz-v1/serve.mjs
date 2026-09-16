import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),port=8796;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{try{if(!['GET','HEAD'].includes(req.method))throw Error('Method');const route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(!/^\/(preview|assets)\//.test(route)||route.split('/').some(p=>p.startsWith('.')))throw Error('Route');let target=path.resolve(root,'.'+route);if(!target.startsWith(root+path.sep))throw Error('Path');if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');target=fs.realpathSync(target);if(!target.startsWith(root+path.sep))throw Error('Path');res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`S-BODY / Z-BODY: http://127.0.0.1:${port}/preview/battle-suit-sz-v1/`));

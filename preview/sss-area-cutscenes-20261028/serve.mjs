import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url)),prefix='/preview/sss-area-cutscenes-20261028/';
const roots=[repo,'C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site','C:/Users/User/Downloads/upload/cnine-card','C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'video/webm'};
export const server=http.createServer((req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end('Read-only preview');return;}
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(pathname==='/'){res.writeHead(302,{location:prefix}).end();return;}
 if(pathname.includes('\\')||pathname.split('/').some(p=>p.startsWith('.'))||!['/preview/','/assets/','/js/','/css/','/shared/','/pve-v3/'].some(p=>pathname.startsWith(p))){res.writeHead(403).end();return;}
 let file;
 for(const base of roots){let candidate=path.resolve(base,pathname.slice(1));const rel=path.relative(base,candidate);if(rel.startsWith('..')||path.isAbsolute(rel))continue;if(fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory())candidate=path.join(candidate,'index.html');if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()){file=candidate;break;}}
 if(!file){res.writeHead(404).end('Not found');return;}const type=mime[path.extname(file)];if(!type){res.writeHead(403).end();return;}
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500).end('Preview read failed');}
});
server.listen(Number(process.env.SSS_PREVIEW_PORT)||8928,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+prefix));

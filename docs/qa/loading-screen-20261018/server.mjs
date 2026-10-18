import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
const root=path.resolve('C:/Users/User/.codex/worktrees/jokro-live/cnine-card'),port=8988,mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
try{if(req.headers.host!=='127.0.0.1:'+port||!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return;}
const url=new URL(req.url,'http://'+req.headers.host);if(url.pathname.startsWith('/api/')){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'로그인이 필요합니다.'}));return;}
const rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';if(!['index.html','service-worker.js','manifest.webmanifest'].includes(rel)&&!['assets','css','js','shared','preview'].includes(rel.split('/')[0])){res.writeHead(404);res.end();return;}
const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||rel.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.'))){res.writeHead(403);res.end();return;}
let bytes=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
}catch{res.writeHead(404);res.end();}});
server.listen(port,'127.0.0.1',()=>console.log('Read-only actual index: http://127.0.0.1:'+port));process.on('SIGINT',()=>server.close(()=>process.exit(0)));

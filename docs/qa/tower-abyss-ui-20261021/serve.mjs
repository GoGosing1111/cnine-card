import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'video/webm'};
http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const data=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(8937,'127.0.0.1',()=>console.log('Tower UI QA http://127.0.0.1:8937/docs/qa/tower-abyss-ui-20261021/index.html?pve=tower'));

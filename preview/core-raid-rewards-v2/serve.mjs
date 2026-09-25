import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.env.PORT||8973);
const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/'){response.writeHead(302,{location:'/preview/core-raid-rewards-v2/index.html'});return response.end();}
  let name;try{name=decodeURIComponent(url.pathname);}catch{response.writeHead(400);return response.end();}
  const file=path.resolve(root,'.'+name);
  if(!/^\/(?:assets|js|preview\/core-raid-rewards-v2)\//.test(name)||!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);return response.end();}
  response.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(response);
}).listen(port,'127.0.0.1',()=>console.log(`Reward animation V2: http://127.0.0.1:${port}/`));

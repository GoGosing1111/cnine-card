import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.cwd(),port=Number(process.env.PET_REWORK_PORT||18874),cache=new Map();
const petVariants=await fs.readFile(path.join(root,'assets/ui/pets/rework-20261114/codex-v3/pets.json'),'utf8').then(JSON.parse).catch(()=>({}));
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
async function file(name){try{return await fs.readFile(path.join(root,name));}catch(error){if(error.code!=='ENOENT')throw error;if(!cache.has(name))cache.set(name,execFileSync('git',['show','HEAD:'+name],{cwd:root,maxBuffer:16e6,stdio:['ignore','pipe','ignore']}));return cache.get(name);}}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname).replace(/^\//,'');if(!name)name='pet-codex/index.html';if(name.endsWith('/'))name+='index.html';
 if(name.includes('..')||path.isAbsolute(name)){res.writeHead(400);res.end();return;}
 if(name==='pet-codex/app.mjs')name='preview/pet-rework-20261114/demo.mjs';
 if(req.headers['x-pet-asset-variant']==='source-png'){const pet=Object.values(petVariants).find(row=>row.thumb==='/'+name||row.portrait==='/'+name);if(pet)name=pet.source;}
 if(req.headers['x-pet-asset-variant']==='source-png'&&/^assets\/ui\/pets\/rework-20261114\/(stat|trait)-dice\.webp$/.test(name))name=name.replace('.webp','-source.png');
 if(name==='api'||name.startsWith('api/')){res.writeHead(403);res.end('Live API disabled in local review');return;}
 const bytes=await file(name);res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}});
server.listen(port,'127.0.0.1',()=>console.log('Pet codex local review: http://127.0.0.1:'+port+'/pet-codex/'));

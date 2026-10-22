import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {jointFixture} from '../../../tests/helpers/joint-db.mjs';
import {operatingTowerFixture} from '../../../tests/helpers/tower-live-route.mjs';
const root=process.cwd(),profiles=new Map();
const images=(await fs.readdir('assets/cards')).filter(p=>p.endsWith('.webp')).slice(20,25);
async function profile(name){
 if(profiles.has(name))return profiles.get(name);
 const promise=(async()=>{
  const f=await jointFixture(),deck=f.deps.raidDeckPower;
  f.deps.raidDeckPower=async(...a)=>{const d=await deck(...a);d.cards=d.cards.map((c,i)=>({...c,image:'/assets/cards/'+encodeURIComponent(images[i])}));return d;};
  const tower=await operatingTowerFixture(f,{floorNo:1,maxFloor:120,rewardCoin:1000000000,monsterPower:1000000});
  return {f,tower,cards:(await f.deps.raidDeckPower(f.env,7,null,'TOWER')).cards};
 })();profiles.set(name,promise);return promise;
}
const app=await fs.readFile('js/app.js','utf8'),block=app.slice(app.indexOf('  battleV2:{'),app.indexOf('    initialize:()=>window.ProjectVBattleV3Live'));
const scripts=[...block.slice(block.indexOf('scripts:[')).matchAll(/'([^']+\.js\?[^']*)'/g)].map(m=>'/'+m[1]);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jfif':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'video/webm'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),m=/^\/qa-api\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname);
 if(m){
  const {f,tower,cards}=await profile(m[1]);f.setClock(Date.now());
  if(m[2]==='fixture'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({cards,scripts}));}
  if(m[2]==='audit'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({coin:await f.coin(),progress:await f.p('SELECT current_floor,highest_floor FROM tower_user_progress WHERE user_id=7').first(),grants:Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs WHERE user_id=7').first()).n)}));}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
  const result=await tower.handle(m[2],new Request('https://game.example/api/'+m[2],{method:req.method,headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},...(body?{body}:{})}));
  res.writeHead(result.status,{'content-type':'application/json','cache-control':'no-store'});return res.end(await result.text());
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
}catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}}).listen(8940,'127.0.0.1',()=>console.log('Isolated Tower QA: http://127.0.0.1:8940/docs/qa/tower-account-entry-20261022/index.html?pve=tower&profile=desktop'));

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {jointFixture} from '../tests/helpers/joint-db.mjs';
import {handlePveV3Ready} from '../functions/_pve_v3_routes.js';
import {mercenaryFixture} from '../tests/helpers/mercenary-db.mjs';
import {forgeFixture} from '../tests/helpers/forge-db.mjs';
import {handleMercenaryAccountReady,isMercenaryAccountPath} from '../functions/_mercenary_account_routes.js';
import {handleForgeRuntimeReady,isForgeRuntimePath} from '../functions/_equipment_forge_routes.js';
import {loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {discoverCowPortalReady} from '../functions/_cow_room_portal.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.JOINT_QA_PORT||8899),hostname=`127.0.0.1:${port}`,origin=`http://${hostname}`;
const dataDir=path.resolve(root,'../qa');fs.mkdirSync(dataDir,{recursive:true});
const databaseFile=path.join(dataDir,`joint-account-${Date.now()}.sqlite`);
const f=await jointFixture(null,{filename:databaseFile});
await mercenaryFixture(null,{base:f});await forgeFixture(null,{base:f});
f.deps.loadMercenaryBattleSnapshot=loadMercenaryBattleSnapshot;
let forgeRoll=0;f.deps.forgeRandomInt=()=>[0,999999,600000,999999][forgeRoll++%4];
await f.p("UPDATE character_equipment_items SET image_url='assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png' WHERE id=1").run();
// Restart the local server with updated code while preserving the reviewer's
// drafts and account state. The previous database remains an untouched backup.
if(process.env.JOINT_QA_RESTORE_DATABASE){
  const source=path.resolve(process.env.JOINT_QA_RESTORE_DATABASE);
  if(path.dirname(source)!==dataDir||!/^joint-account-\d+\.sqlite$/.test(path.basename(source))||source===databaseFile)throw Error('Restore requires a previous local QA database');
  f.DB.sql.close();fs.copyFileSync(source,databaseFile);f.DB.sql=new DatabaseSync(databaseFile);
}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/fur/manifest-v2.json'),'utf8')).characters.slice(0,5);
const ids=catalog.map(c=>String(c.cardId));
f.deps.raidDeckPower=async(_env,uid,requested,mode)=>{if(requested!==null||!['PVE','TOWER'].includes(mode))throw Error('Saved deck required');return {ids,cards:catalog.map((c,i)=>({...c,id:ids[i],title:c.member,rarity:'FUR',power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],power:20000000,base_power:20000000,image:c.sourceArt})),power:100000000,characterBonus:{pve:0},battleSettings:{engine:{}}};};
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.woff2':'font/woff2'};
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==hostname)return send(res,403,{error:'Local QA only'});
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/cow-portal-result'&&req.method==='POST'){
    if(req.headers.authorization!=='Bearer local-account-7')return send(res,401,{error:'Local QA account required'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>300)return send(res,413,{error:'Too large'});}
    const body=JSON.parse(raw);if(!['HUNT','SWEEP','APOCALYPSE'].includes(body.event))return send(res,400,{error:'Unknown QA event'});
    const cowPortals=[];
    for(let i=0;i<(body.event==='SWEEP'?4:1);i++){
      const portal=await discoverCowPortalReady(f.env,f.user,{sourceType:body.event==='SWEEP'?'SWEEP':'HUNT',sourceRef:crypto.randomUUID(),isApocalypse:body.event==='APOCALYPSE',result:'WIN'},{randomInt:()=>body.event==='SWEEP'&&i%2?999999:0});
      if(portal)cowPortals.push(portal);
    }
    return send(res,200,{event:body.event,cowPortals});
  }
  if(url.pathname==='/__qa/login')return send(res,200,'<!doctype html><html lang="ko"><meta charset="utf-8"><title>공동 출시 로컬 계정 검수</title><body style="background:#102017;color:white;font:18px sans-serif;padding:60px"><h1>로컬 계정 검수</h1><p>운영 계정·재화와 분리된 SQLite 검수 데이터입니다.</p><button id="login">검수 계정 7로 접속</button><script>document.getElementById("login").onclick=()=>{localStorage.setItem("cnine_card_api_token","local-account-7");localStorage.setItem("cnine_admin_token","local-account-7");location.href="/pve-v3/?content=tower"}</script></body></html>','text/html');
  if(url.pathname.startsWith('/api/')){let body;const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>64000)return send(res,413,{error:'Too large'});chunks.push(chunk);}if(length)body=Buffer.concat(chunks);
    const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body,duplex:'half'}:{})});
    const apiPath=url.pathname.slice(5),handler=isForgeRuntimePath(apiPath)?handleForgeRuntimeReady:isMercenaryAccountPath(apiPath)||apiPath==='admin/mercenaries/runtime'?handleMercenaryAccountReady:handlePveV3Ready;
    const response=await handler({path:apiPath,request,env:f.env,deps:f.deps});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{});
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/,''),target=path.resolve(root,rel);
  const pure=['functions/_battle_v2_preview.js','functions/_mercenary_combat.js','admin/pve-v3-settings.mjs','admin/pve-v3-settings.css','admin/joint-runtime-settings.mjs','admin/joint-runtime-settings.css'].includes(rel);
  if(!target.startsWith(root+path.sep)||rel.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))||!pure&&!['pve-v3','mercenary-hangar','equipment-forge','preview','assets','css','js','shared','style.css'].includes(rel.split('/')[0]))return send(res,404,{});
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;if(!fs.existsSync(file))return send(res,404,{});
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}catch(e){send(res,500,{error:e.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Local account QA: ${origin}/__qa/login (production release remains OFF)`));
process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));

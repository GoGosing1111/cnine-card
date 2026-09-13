import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {hyperOpeningFeature} from '../functions/_hyper_pack_opening.js';
import {hyperPackCatalogRow} from '../functions/_hyper_pack.js';
import {readScrapyardStatus} from '../functions/_scrapyard.js';
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
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {MERCENARY_CMS_SEED as mercenarySeed} from '../functions/_mercenary_cms_seed.js';
import {prepareSSkillAssignments} from '../shared/mercenary-s-skill-assignment-v3.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {V3_LIVE_CONNECTIONS} from '../shared/v3-live-connections.mjs';
import {v3JointReleaseState} from '../shared/v3-joint-release-v1.mjs';
import {operatingTowerFixture} from '../tests/helpers/tower-live-route.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.JOINT_QA_PORT||8899),hostname=`127.0.0.1:${port}`,origin=`http://${hostname}`;
const dataDir=path.resolve(root,'../qa');fs.mkdirSync(dataDir,{recursive:true});
const databaseFile=path.join(dataDir,`joint-account-${Date.now()}.sqlite`);
const f=await jointFixture(null,{filename:databaseFile});
const mercenary=await mercenaryFixture(null,{base:f});await forgeFixture(null,{base:f});
// Explicit local-only fixtures. No production flag, CMS or account is modified.
if(process.env.JOINT_QA_SKILL_CONNECTIONS==='1'){
 const plan=JSON.parse(fs.readFileSync(path.join(root,'preview/project-v-mercenary-system-v1/skill-s-ss-plan-v3.json'))),draft=structuredClone(mercenary.document);
 for(const c of draft.mercenaries)c.rank=plan.targets.find(r=>r.code===c.code)?.rank||(c.code==='V-021'?'SSS':'C');
 for(const skill of draft.skills){skill.review='REVIEWED';skill.balance={damageRatio:1,cooldownTurns:3,cost:0};}
 const document=prepareSSkillAssignments(draft,mercenarySeed.document,mercenarySeed.catalog,plan);
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(document)).run();
 for(const row of plan.targets)await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:row.code,acquisitionId:crypto.randomUUID()}));
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-001',revision:0});
 await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();
 await f.setting('mercenary_runtime_policy_v1',{...mercenary.policy,opening:{...mercenary.policy.opening,coinPerOpen:500000000}});
 for(const outcome of mercenary.draw.outcomes)outcome.chancePpm=outcome.id==='CARD_S'?1000000:0;
 await mercenary.setDraw(mercenary.draw);
}
f.deps.loadMercenaryBattleSnapshot=loadMercenaryBattleSnapshot;
f.deps.requirePermission=(request,env)=>f.deps.authenticate(request,env);
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
const native=process.env.JOINT_QA_NATIVE==='1';
if(native){
 await f.setting('mercenary_runtime_policy_v1',{...mercenary.policy,mode:'OFF',opening:{...mercenary.policy.opening,coinPerOpen:500000000}});
 await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();
 const cow=JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='expedition_v3_cow_room'").first()).value);await f.setting('expedition_v3_cow_room',{...cow,mode:'ON',approved:true});
}
const nativeCards=catalog.map((c,i)=>({...c,id:ids[i],title:c.member,rarity:'FUR',grade:'FUR',powerType:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],basePower:20000000,image:c.sourceArt}));
const nativeTower=native?await operatingTowerFixture(f,{floorNo:69,rewardCoin:25000000}):null;
if(native){
 const monsters=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'),'utf8')).sprites;
 for(const id of [68,69]){const m=monsters.find(row=>row.monsterId===id);await f.p('INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss) VALUES(?,?,?,?,?)',id,m.name,m.sourceArt,id===68?400000:2000000,id===69?1:0).run();}
 await f.p('UPDATE tower_floor_ranges SET monster_id=68,power_override=400000,is_boss=0,end_floor=69 WHERE id=2094').run();
 await f.p('INSERT INTO tower_floor_ranges(id,season_id,start_floor,end_floor,reward_coin,monster_id,is_active,power_override,is_boss) VALUES(2095,1,70,70,500000000,69,1,2000000,1)').run();
}
const profile=async()=>({id:7,nickname:'로컬 검수',role:'OWNER',coin:await f.coin(),owned:ids,quantities:Object.fromEntries(ids.map(id=>[id,1])),breakthroughs:{},masterStars:100});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.woff2':'font/woff2'};
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==hostname)return send(res,403,{error:'Local QA only'});
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/connections-cms')return send(res,200,'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>운영 연결 CMS 검수</title><link rel="stylesheet" href="/admin/admin.css"><body style="background:#111923;color:#eee;padding:24px"><header><h1 id="pageTitle">운영 연결 CMS 검수</h1><span id="roleBadge">OWNER</span></header><nav id="nav"></nav><main id="cms"></main><script type="module" src="/admin/v3-live-connections.mjs"></script></body></html>','text/html');
  if(url.pathname==='/__qa/cow-portal-result'&&req.method==='POST'){
    if(req.headers.authorization!=='Bearer local-account-7')return send(res,401,{error:'Local QA account required'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>300)return send(res,413,{error:'Too large'});}
    const body=JSON.parse(raw);if(!['HUNT','SWEEP','APOCALYPSE'].includes(body.event))return send(res,400,{error:'Unknown QA event'});
    const cowPortals=[];
    for(let i=0;i<(body.event==='SWEEP'?4:1);i++){
      const portal=await discoverCowPortalReady(f.env,f.user,{battleMode:'PVE',sourceType:body.event==='SWEEP'?'SWEEP':'HUNT',sourceRef:crypto.randomUUID(),isApocalypse:body.event==='APOCALYPSE',result:'WIN'},{randomInt:()=>body.event==='SWEEP'&&i%2?999999:0});
      if(portal)cowPortals.push(portal);
    }
    return send(res,200,{event:body.event,cowPortals});
  }
  if(url.pathname==='/__qa/login')return send(res,200,'<!doctype html><html lang="ko"><meta charset="utf-8"><title>공동 출시 로컬 계정 검수</title><body style="background:#102017;color:white;font:18px sans-serif;padding:60px"><h1>로컬 계정 검수</h1><p>운영 계정·재화와 분리된 SQLite 검수 데이터입니다.</p><button id="login">검수 계정 7로 접속</button><script>document.getElementById("login").onclick=()=>{localStorage.setItem("cnine_card_api_token","local-account-7");localStorage.setItem("cnine_admin_token","local-account-7");location.href="/pve-v3/?content=tower"}</script></body></html>','text/html');
  if(url.pathname.startsWith('/api/')){let body;const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>64000)return send(res,413,{error:'Too large'});chunks.push(chunk);}if(length)body=Buffer.concat(chunks);
    const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body,duplex:'half'}:{})});
    if(url.pathname==='/api/mercenary-cards/feature'&&req.method==='GET')return send(res,200,native?await hyperOpeningFeature(f.env):{connected:true,userOpeningEnabled:true,localQa:true});
    if(url.pathname==='/api/pve/v3/feature'&&req.method==='GET')return send(res,200,{...v3JointReleaseState(),localQa:true});
    const apiPath=url.pathname.slice(5);
    if(native){
      if(['me','me/summary'].includes(apiPath))return send(res,200,{user:await profile(),prison:{incarcerated:false}});
      if(apiPath==='me/collection')return send(res,200,{collection:await profile()});
      if(apiPath==='cards')return send(res,200,{cards:nativeCards});
      if(apiPath==='packs')return send(res,200,{packs:[hyperPackCatalogRow((await hyperOpeningFeature(f.env)).userOpeningEnabled)]});
      if(apiPath==='service/status')return send(res,200,{maintenance:{active:false}});
      if(apiPath==='battle/config')return send(res,200,{deck:ids,monsters:[{id:1,name:'목초지 입장 검수',image:'assets/cards/monster/sla2.jfif',battlePower:500000}],settings:{},battleEngine:{active:true,mode:'V3',version:'V3'},characterBonus:{pve:0},energy:{energy:30,maxEnergy:30,costPerBattle:1}});
      if(apiPath==='scrapyard/status')return send(res,200,await readScrapyardStatus(f.env,f.user,f.deps.raidDeckPower));
      if(apiPath.startsWith('tower/')){const response=await nativeTower.handle(apiPath,request);return send(res,response.status,await response.json());}
      if(!['cow-room/v3/','scrapyard/v3/','admin/mercenaries','mercenar','hyper-pack','pve/v3/'].some(prefix=>apiPath.startsWith(prefix)))return send(res,200,{ok:true,enabled:false,items:[],commands:[],maintenance:{active:false}});
    }
    const handler=native&&(isMercenaryAccountPath(apiPath)||apiPath==='admin/mercenaries/opening')?handleMercenaryAccount:apiPath==='admin/mercenaries'||apiPath.startsWith('admin/mercenaries/draw')?handleMercenaryCms:isForgeRuntimePath(apiPath)?handleForgeRuntimeReady:isMercenaryAccountPath(apiPath)||apiPath==='admin/mercenaries/runtime'?handleMercenaryAccountReady:handlePveV3Ready;
    const response=await handler({path:apiPath,request,env:f.env,deps:f.deps});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{});
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||(native?'index.html':''),target=path.resolve(root,rel);
  const pure=native&&['index.html','service-worker.js','manifest.webmanifest','favicon.ico','admin/hyper-pack-opening.mjs','admin/hyper-pack-v2076.js','admin/hyper-pack-opening.css'].includes(rel)||['functions/_battle_v2_preview.js','functions/_mercenary_combat.js','admin/pve-v3-settings.mjs','admin/pve-v3-settings.css','admin/joint-runtime-settings.mjs','admin/joint-runtime-settings.css','admin/v3-live-connections.mjs','admin/v3-live-connections.css','admin/admin.css'].includes(rel);
  if(!target.startsWith(root+path.sep)||rel.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))||!pure&&!['pve-v3','mercenary-hangar','equipment-forge','preview','assets','css','js','shared','style.css'].includes(rel.split('/')[0]))return send(res,404,{});
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;if(!fs.existsSync(file))return send(res,404,{});
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}catch(e){send(res,500,{error:e.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Local account QA: ${origin}/__qa/login (production release remains OFF)`));
process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));

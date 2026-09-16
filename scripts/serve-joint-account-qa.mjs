import {handleAccountRank,readAccountRank,rankCards,accountRankBenefits,settleRankedHunt} from '../functions/_account_rank.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {TROPHY_CATALOG} from '../functions/_player_card.js';
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
import {applyMercenaryBalanceV2097} from '../shared/mercenary-skill-balance-v2097.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {V3_LIVE_CONNECTIONS} from '../shared/v3-live-connections.mjs';
import {v3JointReleaseState} from '../shared/v3-joint-release-v1.mjs';
import {operatingTowerFixture} from '../tests/helpers/tower-live-route.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.JOINT_QA_PORT||8899),hostname=`127.0.0.1:${port}`,origin=`http://${hostname}`;
const staticOrigin=process.env.JOINT_QA_STATIC_ORIGIN||'';
if(staticOrigin&&staticOrigin!=='https://cnine-card.pages.dev')throw Error('Only the existing production site can supply QA static files');
const dataDir=path.resolve(root,'../qa');fs.mkdirSync(dataDir,{recursive:true});
const databaseFile=path.join(dataDir,`joint-account-${Date.now()}.sqlite`);
const f=await jointFixture(null,{filename:databaseFile});
const mercenary=await mercenaryFixture(null,{base:f});await forgeFixture(null,{base:f});
if(process.env.JOINT_QA_MERCENARY_CODE){
 const code=process.env.JOINT_QA_MERCENARY_CODE;
 if(!mercenarySeed.catalog.cards.some(c=>c.code===code))throw Error('Unknown QA mercenary');
 await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:code,revision:0});
}
// Explicit local-only fixtures. No production flag, CMS or account is modified.
if(process.env.JOINT_QA_SKILL_CONNECTIONS==='1'){
 const plan=JSON.parse(fs.readFileSync(path.join(root,'preview/project-v-mercenary-system-v1/skill-s-ss-plan-v3.json'))),draft=structuredClone(mercenary.document);
 for(const c of draft.mercenaries)c.rank=plan.targets.find(r=>r.code===c.code)?.rank||(c.code==='V-021'?'SSS':'C');
 for(const skill of draft.skills){skill.review='REVIEWED';skill.balance={damageRatio:1,cooldownTurns:3,cost:0};}
 const document=applyMercenaryBalanceV2097(prepareSSkillAssignments(draft,mercenarySeed.document,mercenarySeed.catalog,plan),mercenarySeed.catalog);
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
const qaCardPower=Number(process.env.JOINT_QA_CARD_POWER||20000000);
let qaCharacterBonus={pve:0};
if(process.env.JOINT_QA_BATTLE_SUIT==='1'){
 const assets=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
 const advanced=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/account-battle-suits/sz-body-v2124.json'),'utf8'));
 const suit=process.env.JOINT_QA_SUIT_CODE?advanced.suits.find(s=>s.code===process.env.JOINT_QA_SUIT_CODE):assets.suits[2],weapon=assets.weapons[Number(process.env.JOINT_QA_WEAPON_INDEX||0)],pvePower=300000;
 if(!suit||!weapon)throw Error('Unknown QA battle-suit/weapon');
 const {SKILL_CHIP_CATALOG}=await import('../shared/battle-suit-skill-chips.mjs');
 qaCharacterBonus={pve:pvePower,battleSuitPve:pvePower,equippedBattleSuit:{code:suit.code,name:suit.name,pvePower,battleSprite:suit.battleSprite||suit.image,appearance:{battleSprite:suit.battleSprite||suit.image,battleHeight:278},skillChips:process.env.JOINT_QA_NO_CHIPS==='1'?[]:SKILL_CHIP_CATALOG.map(c=>c.code)},equippedWeapon:{code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}}};
}
f.deps.raidDeckPower=async(_env,uid,requested,mode)=>{if(requested!==null||!['PVE','TOWER'].includes(mode))throw Error('Saved deck required');return {ids,cards:catalog.map((c,i)=>({...c,id:ids[i],title:c.member,rarity:'FUR',power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],power:qaCardPower,base_power:qaCardPower,image:c.sourceArt})),power:qaCardPower*5+qaCharacterBonus.pve,characterBonus:qaCharacterBonus,battleSettings:{engine:{}}};};
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
if(native){await f.p('ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1').run();await f.p('CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT)').run();await f.p('INSERT INTO pve_decks(user_id,card_ids) VALUES(7,?)',JSON.stringify(ids)).run();}
const profile=async()=>({accountRank:await readAccountRank(f.env,7),id:7,nickname:'로컬 검수',role:'OWNER',coin:await f.coin(),owned:ids,quantities:Object.fromEntries(ids.map(id=>[id,1])),breakthroughs:{},masterStars:100});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.woff2':'font/woff2'};
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==hostname)return send(res,403,{error:'Local QA only'});
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/sz-loadout'&&req.method==='POST'){
    const assets=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
    const advanced=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/account-battle-suits/sz-body-v2124.json'),'utf8'));
    const suit=advanced.suits.find(s=>s.code===url.searchParams.get('suit')),weapon=assets.weapons[Number(url.searchParams.get('weapon'))];
    if(!suit||!weapon)return send(res,400,{error:'Unknown QA loadout'});
    qaCharacterBonus={pve:300000,battleSuitPve:300000,equippedBattleSuit:{code:suit.code,name:suit.name,pvePower:300000,battleSprite:suit.battleSprite,appearance:{battleSprite:suit.battleSprite},skillChips:[]},equippedWeapon:{code:weapon.equipmentCode,battleSprite:weapon.battleSprite,appearance:{battleSprite:weapon.battleSprite}}};
    return send(res,200,{code:suit.code,weapon:weapon.equipmentCode,localQa:true});
  }
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
  if(url.pathname==='/__qa/login')return send(res,200,'<!doctype html><html lang="ko"><meta charset="utf-8"><title>공동 출시 로컬 계정 검수</title><body style="background:#102017;color:white;font:18px sans-serif;padding:60px"><h1>로컬 계정 검수</h1><p>운영 계정·재화와 분리된 SQLite 검수 데이터입니다.</p><button id="login">검수 계정 7로 접속</button><script>document.getElementById("login").onclick=()=>{localStorage.setItem("cnine_card_api_token","local-account-7");localStorage.setItem("cnine_admin_token","local-account-7");location.href="/?screen=home"}</script></body></html>','text/html');
  if(url.pathname.startsWith('/api/')){let body;const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>64000)return send(res,413,{error:'Too large'});chunks.push(chunk);}if(length)body=Buffer.concat(chunks);
    const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body,duplex:'half'}:{})});
    if(url.pathname==='/api/mercenary-cards/feature'&&req.method==='GET')return send(res,200,native?await hyperOpeningFeature(f.env):{connected:true,userOpeningEnabled:true,localQa:true});
    if(url.pathname==='/api/pve/v3/feature'&&req.method==='GET')return send(res,200,{...v3JointReleaseState(),localQa:true});
    const apiPath=url.pathname.slice(5);
    if(native&&apiPath.startsWith('account-rank/')){
      const response=await handleAccountRank({path:apiPath,request,env:f.env,deps:{...f.deps,readBody:r=>r.json(),pveDeckCards:async()=>ids,validateDeckGradeLimits:async()=>{}}});
      return send(res,response.status,await response.json());
    }
    if(native){
      if(['me','me/summary'].includes(apiPath))return send(res,200,{user:await profile(),prison:{incarcerated:false}});
      if(apiPath==='player-card')return send(res,200,{player:{id:7,nickname:'로컬 검수',accountRank:await readAccountRank(f.env,7)},ranked:{season:'검수 시즌',history:[]},trophies:TROPHY_CATALOG.map(t=>({...t,owned:false,count:0})),clanHistory:[]});
      if(apiPath==='me/collection')return send(res,200,{collection:await profile()});
      if(apiPath==='cards')return send(res,200,{cards:nativeCards});
      if(apiPath==='packs')return send(res,200,{packs:[hyperPackCatalogRow((await hyperOpeningFeature(f.env)).userOpeningEnabled)]});
      if(apiPath==='service/status')return send(res,200,{maintenance:{active:false}});
      if(apiPath==='inventory')return send(res,200,{items:[],totalQuantity:0,ownedTypes:0});
      if(apiPath==='loot-shop/balance')return send(res,200,{pigCoins:0});
      if(apiPath==='battle/fight'){const b=await request.json(),deck=await f.deps.raidDeckPower(f.env,7,null,'PVE'),monster={id:1,name:'목초지 입장 검수',image:'assets/cards/monster/sla2.jfif',battle_power:500000};const battleV2=createPveBattleV2({cards:rankCards(deck.cards,await accountRankBenefits(f.env,7,'HUNT')),monster,battleSuit:qaCharacterBonus.equippedBattleSuit?{...qaCharacterBonus.equippedBattleSuit,weapon:qaCharacterBonus.equippedWeapon}:null,seed:42});if(battleV2.result.winner==='A')await settleRankedHunt(f.env,7,'HUNT',b.requestId||crypto.randomUUID(),100,'QA HUNT');return send(res,200,{ok:true,battleV2,battleEngine:{active:true},result:battleV2.result.winner==='A'?'WIN':'LOSE',cards:deck.cards,monster,characterBonus:qaCharacterBonus,equippedBattleSuit:qaCharacterBonus.equippedBattleSuit,equippedWeapon:qaCharacterBonus.equippedWeapon,playerPower:deck.power,monsterPower:500000,reward:100,user:await profile()});}
      if(apiPath==='battle/config')return send(res,200,{deck:ids,deckRules:{gradeLimits:{FUR:5}},monsters:[{id:1,name:'목초지 입장 검수',image:'assets/cards/monster/sla2.jfif',battlePower:500000}],settings:{},battleEngine:{active:true,mode:'V3',version:'V3'},characterBonus:qaCharacterBonus,energy:{energy:30,maxEnergy:30,costPerBattle:1}});
      if(apiPath==='pvp/match')return send(res,200,{token:'local-match',opponent:{id:8,nickname:'검수 상대',season_score:0}});
      if(apiPath==='pvp/fight'){const deck=await f.deps.raidDeckPower(f.env,7,null,'PVE'),enemy=deck.cards.map(c=>({...c,power:100000})),battleV2=createPvpBattleV2({attackerCards:deck.cards,defenderCards:enemy,seed:42});return send(res,200,{ok:true,battleV2,battleEngine:{active:true},result:battleV2.result.winner==='A'?'WIN':'LOSE',attackerDeck:deck.cards,defenderDeck:enemy,attackerPower:deck.power,defenderPower:500000,opponent:'검수 상대',scoreAfter:25,scoreChange:25,coinAfter:await f.coin(),energy:{unlimited:true,energy:30,maxEnergy:30},serverNow:new Date().toISOString()});}
      if(apiPath==='pvp/config')return send(res,200,{deck:ids,deckRules:{gradeLimits:{FUR:5}},presets:{1:ids,2:[],3:[]},activePreset:1,settings:{enabled:true,seasonName:'로컬 랭크전 검수',tiers:[]},profile:{season_score:0,tier:{id:'bronze',name:'브론즈',color:'#b87333'}},battleEngine:{active:true,mode:'V3',version:'V3'},characterBonus:{pvp:0},energy:{energy:30,maxEnergy:30,costPerBattle:1,unlimited:true}});
      if(apiPath==='scrapyard/status')return send(res,200,await readScrapyardStatus(f.env,f.user,f.deps.raidDeckPower));
      if(apiPath.startsWith('tower/')){const response=await nativeTower.handle(apiPath,request);return send(res,response.status,await response.json());}
      if(!['cow-room/v3/','scrapyard/v3/','admin/mercenaries','mercenar','hyper-pack','pve/v3/'].some(prefix=>apiPath.startsWith(prefix)))return send(res,200,{ok:true,enabled:false,items:[],commands:[],maintenance:{active:false}});
    }
    const handler=native&&(isMercenaryAccountPath(apiPath)||apiPath==='admin/mercenaries/opening')?handleMercenaryAccount:apiPath==='mercenary-codex'||apiPath==='admin/mercenaries'||apiPath.startsWith('admin/mercenaries/draw')?handleMercenaryCms:isForgeRuntimePath(apiPath)?handleForgeRuntimeReady:isMercenaryAccountPath(apiPath)||apiPath==='admin/mercenaries/runtime'?handleMercenaryAccountReady:handlePveV3Ready;
    const response=await handler({path:apiPath,request,env:f.env,deps:f.deps});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{});
  if(process.env.JOINT_QA_FAIL_BATTLE==='1'&&url.pathname==='/preview/project-v-v3/project-v-pixi-battle.bundle.js')return send(res,503,'QA injected renderer load failure','text/plain');
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||(native?'index.html':''),target=path.resolve(root,rel);
  const pure=native&&['index.html','service-worker.js','manifest.webmanifest','favicon.ico','admin/hyper-pack-opening.mjs','admin/hyper-pack-v2076.js','admin/hyper-pack-opening.css','admin/mercenary-draw-admin-v1.js','admin/mercenary-draw-admin-v1.css'].includes(rel)||['functions/_battle_v2_preview.js','functions/_mercenary_combat.js','admin/pve-v3-settings.mjs','admin/pve-v3-settings.css','admin/joint-runtime-settings.mjs','admin/joint-runtime-settings.css','admin/v3-live-connections.mjs','admin/v3-live-connections.css','admin/admin.css'].includes(rel);
  if(!target.startsWith(root+path.sep)||rel.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))||!pure&&!['pve-v3','mercenary-codex','mercenary-hangar','equipment-forge','preview','assets','css','js','shared','data','style.css'].includes(rel.split('/')[0]))return send(res,404,{});
  if(staticOrigin&&!rel.startsWith('functions/')){const remote=await fetch(new URL(url.pathname+url.search,staticOrigin),{method:req.method});res.writeHead(remote.status,{'content-type':remote.headers.get('content-type')||'application/octet-stream','cache-control':'no-store'});if(req.method==='HEAD')res.end();else{for await(const chunk of remote.body||[])res.write(chunk);res.end();}return;}
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;if(!fs.existsSync(file))return send(res,404,{});
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}catch(e){send(res,500,{error:e.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Local account QA: ${origin}/__qa/login (production release remains OFF)`));
process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));

// Loopback-only synthetic accounts and SQLite. No production bindings.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {apocalypseFixture} from '../tests/helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';
const root=fileURLToPath(new URL('../',import.meta.url)),f=await apocalypseFixture(),traffic=[];
const input=JSON.parse(fs.readFileSync(path.join(root,'tests/helpers/icon-apocalypse-20261006.json')));
const args={...structuredClone(input.iconArgs),characterBonus:10000000,seed:3};
args.cards[2]={id:'CN-1C000004',title:'오조은',name:'오조은',grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:'CN-1C000004',grade:'ICON'},input.roles,'PVE'),supremacy:args.cards[2].iconRole.supremacy}};
const cards=args.cards.map(c=>({...c,rarity:c.grade,basePower:c.power,image:c.grade==='ICON'?'/assets/cards/ICON/'+(c.id==='CN-1C000004'?'oh-joeun-source-v1.png':'diim.jpg'):''}));
args.cards=cards;
const deck=cards.map(c=>c.id),monster={...args.monster,battlePower:args.monster.battle_power,isBoss:true,pveTab:'APOCALYPSE',image:args.monster.image_url,rewardCoin:1000};
const energy={energy:5,maxEnergy:5,costPerBattle:1,rechargeMinutes:30};
const user={id:2,serverUserId:2,nickname:'ICON 조은 전투 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const battle=createPveBattleV2(args); console.log(JSON.stringify({winner:battle.result.winner,casts:battle.result.iconRoles,heal:battle.result.timeline.filter(e=>e.iconRole==='SUPPORT'&&e.type==='ICON_SKILL').map(e=>e.targets.map(t=>t.amount))}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(route==='/qa-state.json'){const states=(await f.p("SELECT value FROM app_meta WHERE key LIKE 'apocalypse_battle_v2:%'").all()).results.map(r=>{const s=JSON.parse(r.value);return {requestId:s.requestId,status:s.status,reason:s.reason,won:s.won,settlement:s.settlement?.result}});return json(res,{states,traffic,coin:Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),wins:Number((await f.p("SELECT COUNT(*) n FROM battle_logs WHERE result='WIN'").first()).n)})}
 if(route.startsWith('/api/')){
 const key=route.slice(5);let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');let data;
 if(['me','me/summary'].includes(key))data={user,prison:{incarcerated:false}};

 else if(key==='cards')data={cards};
 else if(key==='battle/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,monsters:[monster],energy,apocalypseEnergy:energy,battleEngine:{active:true},serverNow:new Date().toISOString()};
 else if(key==='pvp/config')data={settings:{enabled:true},deckRules:{gradeLimits:{ICON:2,FUR:2,ZENITH:5}},deck,presets:{1:deck,2:[],3:[]},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈'}},battleEngine:{active:true},energy,serverNow:new Date().toISOString()};
 else if(key==='pvp/match')data={token:'local-pvp-test',opponent:{id:3,nickname:'PVP 회귀 검수',power:10000000}};
 else if(key==='pvp/fight')data={result:'WIN',scoreAfter:1020,scoreChange:20,coinReward:1000,coinAfter:2100,attackerPower:100000000,defenderPower:10000000,opponent:'PVP 회귀 검수',energy,serverNow:new Date().toISOString(),battleV2:createPvpBattleV2({attackerCards:cards.slice(0,5),defenderCards:cards.slice(0,5).map(c=>({...c,power:2000000,basePower:2000000})),seed:21})};
 else if(key==='battle/deck')data={deck:body.cardIds};
 else if(key==='battle/fight'){
 await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:75});
 const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:75,won:true,battleV2:battle,plan:{reward:1000,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:0,mysticEnergy:0}},log:{ids:deck,playerPower:100000000,monsterPower:7500000}});
 data={result:'PENDING',reward:0,battleV2:structuredClone(battle),apocalypseChallenge:challenge,monster,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},user,energy,energyKind:'APOCALYPSE',serverNow:new Date().toISOString()};
 }else if(key.startsWith('battle/apocalypse-challenge/')){
 const action=key.split('/').at(-1);traffic.push({action,id:body.requestId,noncePresent:!!body.runToken,time:Date.now()});
 const result=await apocalypseChallengeAction(f.env,user,action,body);data={...result,serverNow:Date.now(),...(['CLAIMED','FAILED'].includes(result.status)?{user:{...user,coin:Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin)}}:{})};
 }else data={'service/status':{maintenance:{active:false}},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
 if(key==='pvp/fight')data.result=data.battleV2.result.winner==='A'?'WIN':'LOSE';
 return json(res,data);
 }
 if(route==='/review/'){
 const qaControl='';
 const init='<base href="/"><script>localStorage.setItem("cnine_card_user_v10",'+JSON.stringify(JSON.stringify(user))+');localStorage.setItem("cnine_card_api_token","apocalypse-local-review");localStorage.setItem("cnine_battle_sound","OFF");localStorage.setItem("cnine_pve_view_mode","deck");</script>';
 res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+init+qaControl));
 }
 let target=path.resolve(root,'.'+decodeURIComponent(route));if(!target.startsWith(root+path.sep))return json(res,{error:'Not found'},404);if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target))return json(res,{error:'Not found'},404);
 res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500)}}).listen(8984,'127.0.0.1',()=>console.log('Synthetic Apocalypse QA ready: http://127.0.0.1:8984/review/?screen=battle'));

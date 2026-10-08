// Loopback-only main application review. All accounts, rooms and claims are local.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {configFor,input,projected} from './measure-world-raid-balance-20261008.mjs';
import {raidCombatSnapshotV1293,raidRewardPlanV1293,raidRewardDisplayV1293} from '../functions/_raid_overhaul.js';
import {worldRaidCombatRulesV2} from '../functions/_world_raid_presentation_v2.js';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),port=Number(process.env.WORLD_RAID_QA_PORT||8987);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/prestige/manifest-v1.json')));
const cards=manifest.characters.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,name:c.member,grade:'PRESTIGE',rarity:'PRESTIGE',type:['ATTACK','DEFENSE','SPEED','HP','BALANCED'][i],image:c.sourceArt,sourceArt:c.sourceArt,power:1200000,basePower:1200000}));
const user={id:1,serverUserId:1,nickname:'공대장',role:'USER',coin:12345678,cardShards:1000,masterStars:1000,pigCoin:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
let state={code:'NAGATO',seconds:65,status:'BATTLE',room:97001,claimed:false},requests=0,claims=0;
function status(){
 const cfg=configFor(state.code,true),p=cfg.bossProfile,now=Date.now(),start=now-state.seconds*1000;
 const powers=[...input.players].sort((a,b)=>b.totalPower-a.totalPower),players=Array.from({length:20},(_,i)=>({userId:i+1,nickname:i===0?'공대장':`공대원 ${String(i+1).padStart(2,'0')}`,totalPower:powers[Math.floor((i+.3)*powers.length/20)].totalPower,cards,totalDamage:projected(powers[Math.floor((i+.3)*powers.length/20)].totalPower,cfg)}));
 const sim=raidCombatSnapshotV1293(players,{status:'BATTLE',starts_at:new Date(start).toISOString(),max_hp:p.maxHp},cfg,now);
 const participants=sim.states.map(s=>({...s.row,shownDamage:Math.floor(s.shownDamage),currentHp:s.currentHp,maxHp:s.maxHp,isDefeated:s.isDefeated,rewardClaimed:state.claimed?1:0})).sort((a,b)=>b.shownDamage-a.shownDamage),me=participants.find(p=>p.userId===1);
 const current={id:state.room,status:state.status,startsAt:new Date(state.status==='LOBBY'?now+115000:start).toISOString(),endsAt:new Date(start+cfg.battleSeconds*1000).toISOString(),bossName:p.name,bossImage:p.sourceArt,bossBattleSprite:p.battleSprite,bossTitle:p.title,bossAccent:p.accent,powerRating:p.powerRating,currentHp:state.status==='ENDED'?0:sim.bossHp,maxHp:p.maxHp,participantCount:participants.length,attackTicks:sim.attackTicks,ultimateCasts:sim.ultimateCasts,ultimate:p.ultimate,minions:sim.minions,minionsDefeated:sim.minionsDefeated,bossDamageReduction:sim.bossDamageReduction,phase:sim.phase,shieldHp:sim.shieldHp,shieldMaxHp:sim.shieldMaxHp,shieldBroken:sim.shieldBroken,breakProgress:sim.breakProgress,enraged:sim.phase===3,result:state.status==='ENDED'?'CLEAR':null,combatRules:worldRaidCombatRulesV2(cfg)};
 const reward=raidRewardPlanV1293({cfg,instanceId:state.room,userId:1,totalDamage:me.shownDamage,finalRank:1,cleared:true,minionsDefeated:2});
 return{current,settings:input.common,me,participants,schedule:{isOpen:true,canEnter:true},rooms:[],serverNow:new Date(now).toISOString(),claimableReward:state.status==='ENDED'?{...raidRewardDisplayV1293(reward),instanceId:state.room,source:'SERVER_CONFIRMED',cleared:true,finalDamage:me.shownDamage,finalRank:1}:null};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{const json=(body,code=200)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};try{
 const url=new URL(req.url,`http://127.0.0.1:${port}`),route=url.pathname;let raw='';if(req.method==='POST')for await(const chunk of req)raw+=chunk;
 if(route==='/qa/control'&&req.method==='POST'){const changes=JSON.parse(raw||'{}');state={...state,...changes};return json(status());}
 if(route==='/qa/state')return json({state,requests,claims});
 if(route.startsWith('/api/')){
  const key=route.slice(5);let data;
  if(key==='raid/status'){requests++;data=status();}
  else if(key==='raid/claim'){if(!state.claimed){state.claimed=true;claims++;}data={ok:true,instanceId:state.room,user};}
  else data={me:{user},'me/summary':{user,prison:{incarcerated:false}},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},'loot-shop/balance':{pigCoins:0},'service/status':{maintenance:{active:false}},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'battle/config':{settings:{enabled:true},deck:cards.map(c=>c.id),monsters:[],energy:{energy:10,maxEnergy:10},characterBonus:{pve:0,equippedBattleSuit:null}},'character/loadout':{bonuses:{pve:0,equippedBattleSuit:null}},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return json(data);
 }
 if(route==='/review/'){
  const init='<base href="/"><script>localStorage.setItem("cnine_card_user_v10",'+JSON.stringify(JSON.stringify(user))+');localStorage.setItem("cnine_card_api_token","world-raid-local-review");localStorage.setItem("cnine_battle_sound","OFF");localStorage.setItem("cnine_pve_view_mode","deck");</script>';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+init));
 }
 let target=path.resolve(root,'.'+decodeURIComponent(route));if(!target.startsWith(root+path.sep))return json({error:'Not found'},404);if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target))return json({error:'Not found'},404);
 res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
}catch(error){json({error:error.message},500);}});
server.listen(port,'127.0.0.1',()=>console.log(`World raid QA ready: http://127.0.0.1:${port}/review/?screen=battle`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

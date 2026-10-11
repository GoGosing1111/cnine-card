// Local visual QA server. Uses the real index, styles, UI and V3 battle renderer;
// every account, balance, round and API mutation below is synthetic and in memory.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {__territoryClanTest as T,massAssaultPreview} from '../functions/_territory_war.js';
import {territorySkillCatalog} from '../functions/_territory_clan_warfare.js';
import {battlefieldSkillCatalog,BATTLEFIELD_DEFAULTS} from '../shared/territory-battlefield-v5.mjs';
import {NETWORK_EDGES,networkControl} from '../shared/territory-network-v6.mjs';
import {factionReviewCards} from '../tests/helpers/clan-faction-fixture.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const root=fileURLToPath(new URL('../',import.meta.url)),now=Date.now(),iso=n=>new Date(n).toISOString();
const user={id:1,serverUserId:1,nickname:'전장 검수 참가자',role:'OWNER',coin:1234567,cardShards:10,masterStars:10,pigCoin:0,owned:factionReviewCards.map(c=>c.id),quantities:Object.fromEntries(factionReviewCards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const operations={...territorySkillCatalog(T.OPERATIONS,T.DEFAULTS),...battlefieldSkillCatalog()},control=networkControl(),fronts=control.nodes.map(n=>({a_access:n.a_access,b_access:n.b_access,id:n.index+1,node_index:n.index,node_code:n.code,node_name:n.name,node_type:n.type,sequence:n.index+1,status:'ACTIVE',a_hp:420000,b_hp:310000,a_max_hp:500000,b_max_hp:500000,started_at:iso(now-60000)}));
const mine={user_id:1,side:'A',status:'ACTIVE',mandatory_clan:0,deck_power:1000000,formation_power:1000000,energy:12,attacks:76,damage:265000,formation_breakdown_json:'{"deckComplete":true}',contribution_rank:1,contribution_total:146};
const receipts=new Map(),votes=new Set(),commandMessages=[{id:1,side:'A',user_id:1,nickname:'수호 지휘관',message:'북부 고지를 지키고 중앙 교차로로 합류합니다.',created_at:'2026-10-11 12:30:00'}];let selected=4;
function state(index=selected){
  selected=Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<=8?Number(index):4;
  const front=fronts[selected],nodes=control.nodes.map(n=>({...n,...fronts[n.index],index:n.index,front_id:n.index+1,canEnter:Boolean(n.a_access)}));
  const skills=side=>Object.fromEntries(Object.keys(operations).map(op=>[op,{ready:true,readyAt:null,voteKey:`V25:70:${front.id}:${side}:${op}:0`,votes:votes.has(`${front.id}:${op}`)?1:0,voted:side==='A'&&votes.has(`${front.id}:${op}`)}]));
  return {mode:'ON',settings:{...T.DEFAULTS,teamAName:'수호',teamBName:'정화',energyMax:15},allocation:'INDIVIDUAL',round:{id:70,warfare_version:6,status:'ACTIVE',battle_name:'삼면 전선',current_front_index:selected,current_front_id:front.id,ends_at:iso(now+36000000),version:1},clans:{enabled:false,teams:[]},network:{version:6,revision:1,nodes,edges:NETWORK_EDGES,counts:control.counts,selectedIndex:selected,selectedFrontId:front.id,canEnter:nodes[selected].canEnter},nodes,front,counts:{total:146,A:73,B:73},mine,registration:{canRegister:false,canCancel:false},counter:{model:'SKILL_COOLDOWN',cooldownMinutes:45,requiredVotes:25,mineSide:'A',isCommander:false,canActivate:false,canVote:nodes[selected].canEnter,operations,A:{skills:skills('A'),readyCount:12,ready:true,operation:{active:false}},B:{skills:skills('B'),readyCount:12,ready:true,operation:{active:false}}},commanders:{mineSide:'A',A:{user_id:1,nickname:'수호 지휘관',command_score:365000},B:{user_id:3,nickname:'동부 지휘관'},canBroadcast:true},commandMessages,ranking:[{user_id:1,side:'A',nickname:user.nickname,attacks:mine.attacks,damage:mine.damage}],recentActions:[],recentResults:[],truce:{active:false},comeback:{active:false},fatigue:{active:false},lastDefense:{active:false},serverNow:iso(Date.now()),battlefield:{version:5,frontId:front.id,config:BATTLEFIELD_DEFAULTS,relay:{meter:9,owner:'A',goal:20},A:{charge:78,disabledUntil:0,supplyUntil:0,breachUntil:0,cannonDueAt:0},B:{charge:46,disabledUntil:0,supplyUntil:0,breachUntil:0,cannonDueAt:0},supply:{active:true,cycle:1,endsAt:now+300000,aPoints:12,bPoints:7,goal:20},mine:{points:18,charge:40},events:[]}};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(value));};
  if(url.pathname==='/qa-territory-admin'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>영토전 CMS 검수</title><link rel="stylesheet" href="/admin/admin-v945.css"><main id="cms" style="max-width:1280px;margin:auto;padding:24px"><section id="view-territorywar"><div id="territoryWarAdminRoot"></div></section></main><script src="/admin/territory-war-admin-v1362.js"></script>');
  }
  if(url.pathname.startsWith('/api/')){
    const key=url.pathname.slice(5);let raw='';for await(const part of req)raw+=part;let body={};try{body=JSON.parse(raw||'{}')}catch{}
    if(key==='admin/territory-war/settings'){const current=state(url.searchParams.get('nodeIndex')??4),plans=Object.fromEntries(['A','B'].map(side=>[side,massAssaultPreview(current.round,current.front,current.settings,null,side)]));return json({settings:current.settings,state:current,isOwner:true,massAssaultBySide:plans,roundBonusEquipment:[]});}
    if(['territory-war/state','territory-war/state-lite'].includes(key))return json(state(url.searchParams.get('nodeIndex')??selected));
    if(key==='territory-war/commander-message'){const message=String(body.message||'').trim();commandMessages.push({id:commandMessages.length+1,side:'A',user_id:1,nickname:'수호 지휘관',message,created_at:iso(Date.now()).replace('T',' ').slice(0,19)});return json({ok:true,state:state(body.nodeIndex??selected)});}
    if(key==='territory-war/activate-operation'){const frontId=Number(String(body.voteKey).split(':')[2]);votes.add(`${frontId}:${body.operation}`);return json({ok:true,result:{voted:true,activated:false,votes:1,requiredVotes:25,operation:body.operation},state:state(frontId-1)});}
    if(key==='territory-war/attack'){
      if(receipts.has(body.requestId))return json(receipts.get(body.requestId));
      const index=Number(body.frontId)-1;if(!control.nodes[index]?.a_access)return json({error:'진입 경로가 없습니다.'},409);
      const objective=body.objective||'SIEGE',damage=objective==='SIEGE'?2500:0;fronts[index].b_hp-=damage;mine.energy--;mine.attacks++;mine.damage+=damage;
      const battleV2=createPvpBattleV2({attackerCards:factionReviewCards.map(c=>({...c,power:20000000,breakthrough_level:0})),defenderCards:factionReviewCards.map(c=>({...c,power:2000,breakthrough_level:0})),seed:17});
      const response={ok:true,state:state(index),result:{requestId:body.requestId,frontId:Number(body.frontId),objective,facilityPoints:objective==='RELAY'?4:0,attackerWon:true,winnerSide:'A',targetSide:'B',damage,personalWinCoin:0,nodeIndex:index,nodeName:fronts[index].node_name,opponent:{nickname:'검수 상대'},battleV2}};receipts.set(body.requestId,response);console.log(JSON.stringify({testAttack:{frontId:body.frontId,nodeIndex:index,objective}}));return json(response);
    }
    if(key==='territory-war/action-status')return json(receipts.get(url.searchParams.get('requestId'))||{pending:true});
    return json(({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',startsAt:iso(now-172800000),remainingMs:86400000}},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:iso(now),items:[]},'pvp/config':{settings:{enabled:true}}})[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
  }
  if(url.pathname==='/service-worker.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});return res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));");}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  if(file===path.join(root,'index.html')){
    const boot=`<script>localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_card_api_token','local-network-review');localStorage.setItem('cnine_user_v1',${JSON.stringify(JSON.stringify(user))});</script>`;
    return res.end(fs.readFileSync(file,'utf8').replace('<head>','<head>'+boot).replace('</body>','<button id="qaTerritoryOpen" style="position:fixed;top:10px;left:10px;z-index:99999;padding:12px;background:#c8ff6b;color:#111" onclick="this.hidden=true;openTerritoryWar()">영토전 검수 열기</button></body>'));
  }
  fs.createReadStream(file).pipe(res);
}).listen(0,'127.0.0.1',function(){console.log('Territory QA: http://127.0.0.1:'+this.address().port);});

// Loopback-only synthetic account server. No production bindings or credentials.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {factionFixture,factionReviewCards} from '../tests/helpers/clan-faction-fixture.mjs';
import {factionOverview,mutateFaction} from '../functions/_clan_faction.js';
import {FACTION_RULES as R} from '../shared/clan-faction-rules-v1.mjs';
import {prepareFactionSessionQA} from '../tests/helpers/clan-faction-sessions-qa.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));let f=await factionFixture({seeded:true,realBattle:true});
let sessionQA=process.env.FACTION_SESSIONS_QA==='1'?await prepareFactionSessionQA(f):null;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
function reviewUser(user){return {...user,serverUserId:Number(user.id),coin:1234567890,cardShards:123456,masterStars:2300,pigCoin:0,owned:factionReviewCards.map(c=>c.id),quantities:Object.fromEntries(factionReviewCards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};}
async function overview(user){const d=await factionOverview(f.env,f.season,user,f.deps);return {ok:true,mode:'ON',verified:true,season:{seasonNo:2,phase:'ACTIVE',startsAt:f.season.starts_at,endsAt:f.season.ends_at},membership:{...d.clans.find(c=>c.clanId===d.mine.clanId),userId:Number(user.id),isMaster:d.mine.isMaster,memberCount:d.roster.length,primaryColor:'#2f7cff',accentColor:'#d8e8ff',score:50,wins:5,losses:2,slogan:'함께 싸우고, 더 넓은 전장을 차지한다.'},roster:d.roster,teams:d.clans.map((c,i)=>({...c,masterNickname:c.name+' 지휘관',memberCount:12,score:50-i*3,wins:5,losses:2})),officialClans:d.clans,rules:{maxMembers:20},champions:{enabled:true,status:'UPCOMING',seeds:[],matches:[]},war:{id:17,clanAId:1,clanBId:2,scoreA:28,scoreB:24,roundNo:8,status:'ACTIVE',endsAt:new Date(Date.now()+42*60000).toISOString(),energy:{available:8,cap:10,useLimit:21,usesRemaining:18,cost:1,canAttack:true,windowOpen:true},attacksUsed:3,availableOpponentCount:11,liveDeckReady:true,battleCount:34,scorePerWin:3},serverNow:new Date().toISOString()};}
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  const userId=Number(req.headers['x-review-user']||req.headers.authorization?.match(/faction-review-(\d+)/)?.[1]||url.searchParams.get('as'))||1;
  const user=await f.p('SELECT * FROM users WHERE id=?',userId).first();if(!user)throw Error('Unknown synthetic user');
  if(route.startsWith('/api/')){
    f.clock.now=sessionQA?sessionQA.now:Date.now();const api=route.slice(5);let data={};
    if(api==='preview/reset'&&req.method==='POST'){await f.close();f=await factionFixture({seeded:true,realBattle:true});if(sessionQA)sessionQA=await prepareFactionSessionQA(f);data={ok:true};}
    else if(api==='preview/session'&&req.method==='POST'&&sessionQA){
      const phase=url.searchParams.get('phase');
      if(phase==='closed')sessionQA.now=sessionQA.start+7*3600000;
      else if(phase==='end'){
        const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first();
        sessionQA.now=JSON.parse(row.state_json).session.endsAt;
      }
      else if(phase==='territory')await f.p("INSERT INTO territory_war_v3_rounds VALUES(1,'ACTIVE',?,?,NULL)",new Date(sessionQA.now).toISOString(),new Date(sessionQA.now+86400000).toISOString()).run();
      else if(phase==='territory-restart')await f.p('UPDATE territory_war_v3_rounds SET starts_at=? WHERE id=1',new Date(sessionQA.now+30*60000).toISOString()).run();
      else if(phase==='resume'){
        sessionQA.now+=3600000;
        await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED',settled_at=? WHERE status='ACTIVE'",new Date(sessionQA.now).toISOString()).run();
      }
      else if(phase==='deferred')sessionQA.now=sessionQA.start+3*3600000+60000;
      data={ok:true};
    }
    else if(api==='clan/overview')data=await overview(user);
    else if(api.startsWith('clan/faction/')){const action=api.slice(13);if(req.method==='GET')data=await factionOverview(f.env,f.season,user,f.deps,{alertsOnly:action==='alerts'});else{let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw Error('Body too large');}data=await mutateFaction(f.env,f.season,user,action,JSON.parse(body||'{}'),f.deps);}}
    else if(api==='preview/invasion'&&req.method==='POST'){
      const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),s=JSON.parse(row.state_json),z=s.districts.find(d=>d.id==='11440');z.owner=1;z.defense='defense1';z.protectedUntil=0;
      s.battles=s.battles.filter(b=>b.districtId!==z.id);s.battles.unshift({id:crypto.randomUUID(),districtId:z.id,attacker:2,attackerName:'T1',defender:1,squad:'attack1',defenseSquad:'defense1',attackers:[101,102,103],defenders:[1,6,7],initiator:101,initiatorName:'T1 지휘관',attackerHp:760000,defenderHp:880000,status:'ACTIVE',startedAt:f.clock.now,endsAt:f.clock.now+R.battleDurationMs});
      await f.p('UPDATE clan_faction_state SET state_json=?,revision=revision+1 WHERE season_id=7',JSON.stringify(s)).run();data={ok:true};
    }else data={
      'service/status':{maintenance:{active:false}},'me/summary':{user:reviewUser(user),prison:{incarcerated:false}},me:{user:reviewUser(user)},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},
      'chief/status':{chief:{active:true,ordinal:3,nickname:'오늘의 족장',startsAt:new Date(Date.now()-86400000).toISOString(),remainingMs:86400000}},
      'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},
      'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
    }[api]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return;
  }
  if(route==='/review-live/'){
    const init=`<base href="/"><script>localStorage.setItem('cnine_card_user_v10',${JSON.stringify(JSON.stringify(reviewUser(user)))});localStorage.setItem('cnine_card_api_token','faction-review-${userId}');</script>`;
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+init);
    res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;
  }
  let target=path.resolve(root,'.'+decodeURIComponent(route));if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return;}if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  if(!fs.existsSync(target)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
}catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
const port=Number(process.env.FACTION_QA_PORT)||8960;
server.listen(port,'127.0.0.1',()=>console.log(`Clan faction preview: http://127.0.0.1:${port}/preview/clan-faction-v1/`));

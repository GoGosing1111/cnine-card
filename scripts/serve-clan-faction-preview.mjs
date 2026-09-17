// Loopback-only synthetic account server. No production bindings or credentials.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {factionFixture} from '../tests/helpers/clan-faction-fixture.mjs';
import {factionOverview,mutateFaction} from '../functions/_clan_faction.js';
import {FACTION_RULES as R} from '../shared/clan-faction-rules-v1.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));let f=await factionFixture({seeded:true,realBattle:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
async function overview(){const d=await factionOverview(f.env,f.season,f.user,f.deps);return {ok:true,mode:'ON',verified:true,season:{seasonNo:2,phase:'ACTIVE',startsAt:f.season.starts_at,endsAt:f.season.ends_at},membership:{...d.clans[0],userId:1,isMaster:true,memberCount:d.roster.length,primaryColor:'#2f7cff',accentColor:'#d8e8ff',score:50,wins:5,losses:2,slogan:'함께 싸우고, 더 넓은 전장을 차지한다.'},roster:d.roster,teams:d.clans.map((c,i)=>({...c,masterNickname:c.name+' 지휘관',memberCount:12,score:50-i*3,wins:5,losses:2})),officialClans:d.clans,rules:{maxMembers:20},champions:{enabled:true,status:'UPCOMING',seeds:[],matches:[]},war:{id:17,clanAId:1,clanBId:2,scoreA:28,scoreB:24,roundNo:8,status:'ACTIVE',endsAt:new Date(Date.now()+42*60000).toISOString(),energy:{available:8,cap:10,useLimit:21,usesRemaining:18,cost:1,canAttack:true,windowOpen:true},attacksUsed:3,availableOpponentCount:11,liveDeckReady:true,battleCount:34,scorePerWin:3},serverNow:new Date().toISOString()};}
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(route.startsWith('/api/')){
    f.clock.now=Date.now();const api=route.slice(5);let data={};
    if(api==='preview/reset'&&req.method==='POST'){await f.close();f=await factionFixture({seeded:true,realBattle:true});data={ok:true};}
    else if(api==='clan/overview')data=await overview();
    else if(api.startsWith('clan/faction/')){const action=api.slice(13);if(req.method==='GET')data=await factionOverview(f.env,f.season,f.user,f.deps,{alertsOnly:action==='alerts'});else{let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw Error('Body too large');}data=await mutateFaction(f.env,f.season,f.user,action,JSON.parse(body||'{}'),f.deps);}}
    else if(api==='preview/invasion'&&req.method==='POST'){
      const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),s=JSON.parse(row.state_json),z=s.districts.find(d=>d.id==='11440');z.owner=1;z.defense='defense1';z.protectedUntil=0;
      s.battles=s.battles.filter(b=>b.districtId!==z.id);s.battles.unshift({id:crypto.randomUUID(),districtId:z.id,attacker:2,attackerName:'T1',defender:1,squad:'attack1',defenseSquad:'defense1',attackers:[101,102,103],defenders:[1,6,7],initiator:101,initiatorName:'T1 지휘관',attackerHp:760000,defenderHp:880000,status:'ACTIVE',startedAt:f.clock.now,endsAt:f.clock.now+R.battleDurationMs});
      await f.p('UPDATE clan_faction_state SET state_json=?,revision=revision+1 WHERE season_id=7',JSON.stringify(s)).run();data={ok:true};
    }else{res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'검수 서버에 없는 API입니다.'}));return;}
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return;
  }
  let target=path.resolve(root,'.'+decodeURIComponent(route));if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return;}if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  if(!fs.existsSync(target)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
}catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
server.listen(8960,'127.0.0.1',()=>console.log('Clan faction preview: http://127.0.0.1:8960/preview/clan-faction-v1/'));

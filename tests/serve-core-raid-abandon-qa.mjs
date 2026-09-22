// Isolated loopback-only QA. No production credentials, accounts or DB writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';
import {factionReviewCards} from './helpers/clan-faction-fixture.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {handleRaidCoreProtocol} from '../functions/_raid_core_protocol.js';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const h=await coreLifecycleFixture();
const cards=factionReviewCards.map(c=>({...c,power:2000000,power_type:c.type}));
h.deps.raidDeckPower=async()=>({ids:cards.map(c=>c.id),cards,power:10000000,cardPower:10000000,characterBonus:{pve:0}});
h.deps.createPveBattleV2=createPveBattleV2;
const user={id:1,serverUserId:1,nickname:'붕괴 코어 로컬 검수',role:'OWNER',coin:1234567890,cardShards:123456,masterStars:2300,pigCoin:0,
  owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const boot=`<script>localStorage.setItem('cnine_card_user_v10',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('cnine_card_api_token','core-local-qa');</script>`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:8962');
  const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  try{
    if(url.pathname==='/__qa__/audit')return json({
      room:await h.row('SELECT * FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId),
      member:await h.row('SELECT * FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId),
      attempts:(await h.env.DB.prepare('SELECT attempt_id,status,result_json FROM raid_core_attempts_v2024').all()).results
    });
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/core/')){
        const body=Buffer.concat(chunks).toString();
        const result=await handleRaidCoreProtocol({path:key,env:h.env,deps:h.deps,request:new Request(url,{method:req.method,
          headers:req.headers,...(body?{body}:{})})});
        return json(result.body,result.status);
      }
      const data={
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},
        'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',startsAt:new Date(Date.now()-86400000).toISOString(),remainingMs:86400000}},
        'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},
        'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
      return json(data);
    }
    let target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);return res.end();}
    if(process.env.CORE_QA_PRODUCTION_ASSETS==='1'){
      // Read public deployed files, but every API request above remains synthetic.
      const source=await fetch('https://cnine-card.pages.dev'+url.pathname+url.search);
      res.writeHead(source.status,{'content-type':source.headers.get('content-type')||'application/octet-stream','cache-control':'no-store'});
      if(url.pathname==='/')return res.end((await source.text()).replace('<head>','<head>'+boot));
      return res.end(Buffer.from(await source.arrayBuffer()));
    }
    if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
    if(!fs.existsSync(target)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});
    if(target===path.join(root,'index.html')){
      const html=fs.readFileSync(target,'utf8');
      return res.end(html.replace('<head>','<head>'+boot));
    }
    fs.createReadStream(target).pipe(res);
  }catch(error){json({error:error.message},500);}
});
server.listen(8962,'127.0.0.1',()=>console.log('Core raid QA: http://127.0.0.1:8962/ (synthetic in-memory SQL only)'));
process.on('SIGINT',()=>server.close(()=>{h.close();process.exit(0);}));

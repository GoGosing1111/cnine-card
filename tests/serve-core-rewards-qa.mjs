// Loopback QA only: the production handlers run against disposable SQLite fixtures.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {handleRaidCoreProtocol,coreRaidWeeklyReward} from '../functions/_raid_core_protocol.js';
import {CORE_REWARD_KEY} from '../functions/_core_raid_rewards.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));let f=await coreRewardFixture();
const type=process.env.CORE_REWARD_QA_TYPE||'MERCENARY';
await f.setChoices([{rewardType:type,rewardRef:type==='MERCENARY'?'V-021':'MASTER_STAR',quantity:1}]);
const port=Number(process.env.CORE_REWARD_QA_PORT||8971);
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0b111e;color:#e0eafb;font-family:Arial,"Malgun Gothic",sans-serif;margin:0;padding:20px}button{cursor:pointer}main{max-width:1100px;margin:auto}*{box-sizing:border-box}</style>';
const player=`<!doctype html><html lang="ko"><head>${head}<link rel="stylesheet" href="/css/core-protocol-raid-v1924.css"><title>붕괴 코어 보상 검수</title></head><body><main id="app"><p>로컬 격리 검수 · 실제 계정에 지급되지 않습니다.</p><div id="pveRaidHubView"><button data-raid-content="core">붕괴 코어</button><button data-raid-content="world">월드 레이드</button><div id="pveRaidView"></div><div id="pveCoreRaidView"></div></div></main><script>sessionStorage.setItem('cnine_raid_content_tab_v2024','core');window.CNineCoreRaidBridge={apiRequest:async(path,opts={})=>{const res=await fetch('/api/'+path,{...opts,headers:{...opts.headers,'content-type':'application/json'}});const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error),data);return data;},saveUser:user=>window.lastPaidUser=user,apiUserToLocal:user=>user};</script><script src="/js/core-protocol-raid-v1924.js"></script><script>CoreProtocolRaidV1924.openActive().then(()=>CoreProtocolRaidV1924.activate('core'));</script></body></html>`;
const admin=`<!doctype html><html lang="ko"><head>${head}<title>레이드 보상 CMS 검수</title><link rel="stylesheet" href="/admin/admin-v945.css"></head><body><main><p>로컬 격리 CMS · 운영 설정을 변경하지 않습니다.</p><section id="coreAdminBase"><h2>레이드 CMS</h2><label>기존 기본 보상 <input id="coreRaidRewardCoin" value="10000000000" readonly></label></section></main><script type="module">import{mountCoreRewardAdmin}from'/admin/core-raid-rewards-v1.mjs';mountCoreRewardAdmin(document.getElementById('coreAdminBase'));</script></body></html>`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port),json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  try{
    if(url.pathname==='/__qa__/reset'&&req.method==='POST'){await f.close();f=await coreRewardFixture();await f.setChoices([{rewardType:type,rewardRef:type==='MERCENARY'?'V-021':'MASTER_STAR',quantity:1}]);return json({ok:true});}
    if(url.pathname==='/__qa__/fail'){f.fail(url.searchParams.get('sql')||'');return json({ok:true});}
    if(url.pathname==='/__qa__/audit')return json({user:await f.row('SELECT coin,card_shards FROM users WHERE id=1'),mercenaries:(await f.DB.prepare('SELECT mercenary_code,total_copies FROM user_mercenary_cards_v1').all()).results,weekly:await coreRaidWeeklyReward(f.env,1),policy:JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=?',CORE_REWARD_KEY)).value)});
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
      const result=await handleRaidCoreProtocol({path:url.pathname.slice(5),env:f.env,deps:f.deps,request:new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})})});return json(result.body,result.status);
    }
    if(url.pathname==='/'||url.pathname==='/admin/__qa__'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(url.pathname==='/'?player:admin);}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
  }catch(error){json({error:error.message},500);}
});
server.listen(port,'127.0.0.1',()=>console.log('Core rewards QA http://127.0.0.1:'+port));
process.on('SIGINT',()=>server.close(async()=>{await f.close();process.exit(0);}));

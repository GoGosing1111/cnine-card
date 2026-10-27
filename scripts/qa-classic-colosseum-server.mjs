import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {classicFixture} from '../tests/helpers/classic-colosseum-db.mjs';
import {handleClassicColosseum} from '../functions/_classic_colosseum.js';
export async function startClassicQa(port=8987){
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),f=classicFixture();
 const zenith=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/zenith/manifest-v1.json'))).characters.slice(0,6);
 for(const [i,c]of zenith.entries())f.db.prepare('UPDATE cards_effective_v1210 SET id=?,title=?,rarity=?,image_url=? WHERE id=?').run(c.cardId,c.title||c.member,'ZENITH',c.sourceArt,'CARD-'+i);
 f.loadout.cardIds=zenith.slice(0,5).map(c=>c.cardId);
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8'),battleScripts=[...app.match(/battleV2:\{([\s\S]*?)\n  \}/)[1].matchAll(/'(js\/[^']+|preview\/[^']+)'/g)].map(m=>m[1]);
 const muted=`localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_lobby_bgm_enabled','OFF');HTMLMediaElement.prototype.play=function(){this.muted=true;return Promise.resolve()};`;
 const standalone=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>클래식 멸망전 · 로컬 검수</title>${['css/style.css','css/command-ui-v1.css','css/battle-v2-live.css','css/battle-v3-live.css'].map(s=>`<link rel="stylesheet" href="/${s}">`).join('')}<style>body{background:#07101c;margin:0;color:#eff3ff;font-family:Arial,'Malgun Gothic',sans-serif}main{max-width:1320px;margin:24px auto;padding:0 16px}.qa-strip{padding:8px 16px;background:#17273d;font-size:12px;display:flex;gap:16px;flex-wrap:wrap}.qa-strip a{color:#c8ff6b}@media(max-width:600px){main{margin:12px auto;padding:0 8px}}#modal:not(.show){display:none}</style><script>${muted}</script><div class="qa-strip">격리된 로컬 검수 · 운영 계정 사용 없음<a href="/__classic?user=1">운영자</a><a href="/__classic?user=2">별의수호자</a><a href="/__classic?user=3">붉은달</a><a href="/__login?user=1">실제 게임 메뉴</a></div><main id="qa-root"></main><div id="modal"></div>${battleScripts.map(s=>`<script src="/${s}"></script>`).join('')}<script type="module">import {mountClassicColosseum,showClassicNotifications} from '/js/classic-colosseum-v1.mjs';const user=Number(new URLSearchParams(location.search).get('user')||1);const api=async(path,options={})=>{const r=await fetch('/api/'+path,{method:options.method||'GET',headers:{'content-type':'application/json','authorization':'Bearer classic-qa-'+user},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),data);return data;};const root=document.getElementById('qa-root');window.classicQa={api,user};const mount=()=>mountClassicColosseum({root,api,ensureBattle:()=>ProjectVBattleV3Live.ensureRuntime()});await mount();setInterval(async()=>{const d=await api('user/runtime-command');showClassicNotifications({data:d.classicColosseum,api,navigate:mount});},4000);</script></html>`;
 const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json;charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),user=Number(String(req.headers.authorization||'').match(/classic-qa-(\d+)/)?.[1]||url.searchParams.get('user')||1);
  if(url.pathname==='/__classic'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(standalone);return;}
  if(url.pathname==='/__login'){
   const row=f.db.prepare('SELECT * FROM users WHERE id=?').get(user),local={nickname:row.nickname,role:row.role,serverUserId:user,coin:row.coin,key:'LOCAL-CLASSIC-QA',owned:f.loadout.cardIds,quantities:Object.fromEntries(f.loadout.cardIds.map(id=>[id,1])),testCoinGrantedV13:true};
   res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(`<script>${muted}localStorage.setItem('cnine_card_api_token','classic-qa-${user}');localStorage.setItem('cnine_card_user_v10',${JSON.stringify(JSON.stringify(local))});location.href='/?screen=classicColosseum'</script>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   const apiPath=url.pathname.slice(5);let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000)return json(res,413,{error:'Too large'});}
   const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:{'x-classic-user':String(user),'content-type':'application/json'},...(raw?{body:raw}:{})});
   const response=await handleClassicColosseum({path:apiPath,request,env:f.env,deps:f.deps});if(response)return json(res,response.status,await response.json());
   if(apiPath==='user/runtime-command')return json(res,200,{command:null,unreadMessages:0,classicColosseum:await f.notices(user),prison:{incarcerated:false}});
   if(['me','me/summary','auth/login'].includes(apiPath)){const row=f.db.prepare('SELECT * FROM users WHERE id=?').get(user);return json(res,200,{user:{...row,owned:f.loadout.cardIds,quantities:Object.fromEntries(f.loadout.cardIds.map(id=>[id,1])),breakthroughs:{},history:[]},token:'classic-qa-'+user,prison:{incarcerated:false}});}
   if(apiPath==='cards')return json(res,200,{cards:f.db.prepare('SELECT id,title,rarity AS grade,image_url AS image,base_power AS power FROM cards_effective_v1210 WHERE is_active=1').all()});
   if(apiPath==='packs')return json(res,200,{packs:[],burningEvent:{enabled:false}});
   if(apiPath==='service/status')return json(res,200,{ok:true,maintenance:{active:false}});
   if(apiPath==='pvp/config')return json(res,200,{settings:{enabled:true},presets:{},deck:f.loadout.cardIds});
   return json(res,200,{enabled:false,visible:false,items:[],cards:[],settings:{enabled:false},messages:[],history:[],operations:[]});
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return json(res,403,{error:'Forbidden'});
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){json(res,500,{error:error.message});}});
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {server,f,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(()=>{f.close();resolve();}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const qa=await startClassicQa(Number(process.env.CLASSIC_QA_PORT||8987));console.log(qa.origin+'/__classic');}

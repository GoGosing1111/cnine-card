import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {duoFixture} from '../tests/helpers/ranked-duo-db.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {operatingMercenaries} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {createDuoBattleV2,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.DUO_QA_PORT||8917);
const f=await duoFixture({after(){}}),cards=JSON.parse(fs.readFileSync(path.join(root,'preview/mercenary-ice-crystal-dual-sword-v1/release/combat-payloads.json'))).cards;
const fur=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/fur/manifest-v2.json'))).characters.find(c=>c.cardId==='CN-346F8DB0DEB84D41');
cards[4]={id:fur.cardId,cardId:fur.cardId,title:fur.title,name:fur.member,rarity:'FUR',image:fur.sourceArt,sourceArt:fur.sourceArt,power_type:'ATTACK',power:20000000};
for(const [i,c]of cards.entries()){
 await f.p('UPDATE cards SET id=?,title=?,rarity=?,power_type=?,base_power=?,image_url=? WHERE id=?',c.id,c.title,c.rarity,c.power_type,2000000,c.image,'C-'+i).run();
 await f.p('UPDATE user_cards SET card_id=? WHERE card_id=?',c.id,'C-'+i).run();
}
for(const table of ['pvp_decks','pvp_deck_presets'])await f.p('UPDATE '+table+' SET card_ids=?',JSON.stringify(cards.map(c=>c.id))).run();
const doc=structuredClone(MERCENARY_CMS_SEED.document);
for(const m of operatingMercenaries){Object.assign(doc.mercenaries.find(c=>c.code===m.code),{rank:m.rank,position:m.position,role:m.role});doc.assignments.find(a=>a.code===m.code).skillIds=m.skills.map(s=>s.id);for(const skill of m.skills)Object.assign(doc.skills.find(s=>s.id===skill.id),skill);}
await f.p('UPDATE mercenary_cms_documents_v1 SET payload_json=?',JSON.stringify(doc)).run();
for(const id of [2,3,4,5]){await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1)',id,'V-004').run();await f.p('INSERT INTO user_mercenary_loadout_v1 VALUES(?,?)',id,'V-004').run();}
await f.ready();
const resources=fs.readFileSync(path.join(root,'js/app.js'),'utf8').match(/battleV2:\{([\s\S]*?)\n  \}/)[1];
const scripts=[...resources.matchAll(/'(js\/[^']+|preview\/[^']+)'/g)].map(m=>m[1]);
const styles=['css/card.css','css/battle-v2-live.css','css/battle-v3-live.css','css/ranked-duo-v1.css','admin/ranked-duo-v1.css'];
const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>듀오 시즌 · 로컬 검수</title>'+styles.map(src=>'<link rel="stylesheet" href="/'+src+'">').join('')+'<style>body{margin:0;background:#050b13;color:#eff5fc;font-family:Arial,"Malgun Gothic",sans-serif}main{padding:32px 18px}.qa-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 20px;background:#1b3046;font-size:12px}.qa-bar button{padding:8px}#modal:not(.show){display:none}#modal.show{display:block;position:fixed;inset:0;z-index:1000}#qa-diagnostics{white-space:pre-wrap;font-size:10px}</style><div class="qa-bar">로컬 검수 · 운영 계정과 분리<button id="qa-cms">시즌 운영 화면</button><button id="qa-player">유저 화면</button><button id="qa-formation">24명 진형 확인</button><button id="qa-legacy">기존 1:1 확인</button><button id="qa-pve">기존 PVE 확인</button></div><main id="qa-root"></main><pre id="qa-diagnostics"></pre><div id="modal"></div>'+scripts.map(src=>'<script src="/'+src+'"></script>').join('')+'<script type="module" src="/__duo-app.mjs"></script></html>';
const client=`import {mountRankedDuo} from '/js/ranked-duo-v1.mjs';import {mountDuoCms} from '/admin/ranked-duo-v1.mjs';
const root=document.getElementById('qa-root'),api=async(path,options={})=>{const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),data);return data;};
const player=()=>{root.className='';return mountRankedDuo({root,userId:2,api,navigate:()=>{},ensureBattle:()=>ProjectVBattleV3Live.ensureRuntime()});};document.getElementById('qa-player').onclick=player;document.getElementById('qa-cms').onclick=()=>{root.className='duo-admin';return mountDuoCms(root);};
let engine,renderer;const mount=ProjectVPixiBattle.mountForBattle;ProjectVPixiBattle.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
for(const id of ['qa-formation','qa-legacy','qa-pve'])document.getElementById(id).onclick=async()=>{renderer?.destroy();const data=await api(id==='qa-pve'?'qa/pve':id==='qa-legacy'?'qa/legacy':'qa/formation'),modal=document.getElementById('modal'),live=ProjectVBattleV3Live.prepareLoading({modal,mode:id==='qa-pve'?'PVE':'PVP',playerName:'참가자 2 + 참가자 5',opponentName:'참가자 3 + 참가자 4'});renderer=await ProjectVBattleV3Live.createRenderer({...live,modal,data,mode:id==='qa-pve'?'PVE':'PVP'});await ProjectVPixiBattle.restoreDeployedFormation();const close=document.createElement('button');close.textContent='진형 검수 닫기';close.className='duo-battle-exit';close.onclick=()=>{renderer.destroy();modal.className='modal';};live.stage.append(close);document.getElementById('qa-diagnostics').textContent=JSON.stringify((g=>({actors:g.actors?.length,viewport:g.viewport,formation:g.formation}))(engine.viewportGeometry()));};
window.addEventListener('error',e=>document.getElementById('qa-diagnostics').textContent+='ERROR '+e.message);
player();`;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/__duo'||url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(url.pathname==='/__duo-app.mjs'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(client);return;}
  if(url.pathname.startsWith('/api/')){const pathname=url.pathname.slice(5);let result;if(pathname.startsWith('qa/')){
   const merc=operatingMercenaries.find(m=>m.code==='V-004'),squad=id=>({ownerId:id,ownerName:'참가자 '+id,cards:cards.map(c=>({...c,power:20000000})),mercenary:merc});
   result={status:200,data:{battleV2:pathname==='qa/pve'?createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'초원 슬라임',battle_power:20000000},seed:17}):pathname==='qa/legacy'?createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc}):createDuoBattleV2({attackerSquads:[squad(2),squad(5)],defenderSquads:[squad(3),squad(4)],seed:42})}};
  }else{let body='';for await(const chunk of req)body+=chunk;result=await f.call(pathname+url.search,{user:pathname.startsWith('admin/')?1:2,method:req.method,body:body?JSON.parse(body):{}});}
   res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result.data));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  const types={'.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 }catch(error){console.error(error);res.writeHead(500);res.end(JSON.stringify({error:error.message}));}
}).listen(port,'127.0.0.1',()=>console.log('Duo local QA: http://127.0.0.1:'+port+'/__duo'));

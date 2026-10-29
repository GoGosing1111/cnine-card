import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../../output/revan-live-20261027/release-checkout/functions/_battle_v2_preview.js';
import {rankedSnapshot as snapshot} from '../../output/revan-live-20261027/release-checkout/tests/helpers/mercenary-rank-growth-20261029.mjs';
import {DUAL_REVIEW_CARDS} from '../../output/revan-live-20261027/release-checkout/functions/_companion_preparation.js';
const root=path.resolve('C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout'),publicBase=process.env.QA_PUBLIC_BASE||'',out=new URL(publicBase?'./public-entry/':'./entry/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const deck=DUAL_REVIEW_CARDS.filter(c=>c.grade!=='ICON').slice(0,5).map(c=>({...c,rarity:c.grade,power:1000000}));
const at=(level,code='V-968')=>snapshot(code,1);
const monster={id:1,name:'흑무 전투 검수',battle_power:1e10,image:'assets/cards/monster/sla2.jfif',isBoss:true};
const dataByMode={};
for(const mode of ['PVE','PVP']){
 const battleV2=mode==='PVE'?createPveBattleV2({cards:deck,mercenary:at(21),monster,seed:17}):mode==='PVP'?createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:at(21),defenderMercenary:at(5,'V-968'),seed:17}):createDuoBattleV2({attackerSquads:[7,8].map((ownerId,i)=>({ownerId,ownerName:'검수 '+ownerId,cards:deck,mercenary:at(i?16:21)})),defenderSquads:[9,10].map(ownerId=>({ownerId,ownerName:'검수 '+ownerId,cards:deck,mercenary:at(5,'V-968')})),seed:17});
 assert(battleV2.teams.A.mercenaries.some(m=>m.mercenaryLevelApplied));
 dataByMode[mode]={battleV2,cards:deck,monster,result:battleV2.result.winner==='A'?'WIN':'LOSE',user:{id:7,nickname:'흑무 검수'},reward:0,coinReward:0,scoreAfter:1000,scoreChange:0,attackerPower:6000000,defenderPower:6000000};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(publicBase){const r=await fetch(publicBase+url.pathname+url.search,{signal:AbortSignal.timeout(30000)});res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){try{const b=execFileSync('git',['show','HEAD:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','ignore']});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(b);}catch{missing.push(url.pathname);return res.writeHead(404).end();}}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of (publicBase?[390]:[1440,390])){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
  for(const mode of (publicBase?['PVP']:['PVE','PVP'])){
   const data=dataByMode[mode];
   await page.evaluate(async({data,deck,mode})=>{
    API_MODE=true;API_TOKEN='local-test-only';cards=deck;window.cnineCardCatalog=()=>deck;setPveViewMode('hunt');
    const owned=deck.map(c=>c.id),energy={energy:100,maxEnergy:100,costPerBattle:1,unlimited:true};
    localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'흑무 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned,quantities:Object.fromEntries(owned.map(id=>[id,1])),breakthroughs:{},testCoinGrantedV13:true}));
    const config={settings:{enabled:true},deck:owned,battleEngine:{active:true,version:'V3'},energy,profile:{season_score:1000},monsters:[{id:1,name:'흑무 전투 검수',battlePower:1e10,rewardCoin:0,isBoss:true}],rankedSeries:{codes:['V-960','V-961','V-962','V-963','V-964','V-965'],cards:[],ready:true,ownedCount:6,revision:1}};
    window.__capRequests=[];window.apiRequest=async(route,options={})=>{__capRequests.push({route,method:options.method||'GET'});if(route==='battle/config'||route==='pvp/config')return structuredClone(config);if(route==='battle/fight'||route==='pvp/fight')return structuredClone(data);if(route==='pvp/match')return {opponent:{id:8,nickname:'검수 상대'},token:'local-test-token'};return {items:[],cards:[],operations:[],enabled:false,visible:false,user:{id:7,nickname:'흑무 검수'}};};
    await ensureFeatureResources('battleV2');if(!window.__capOriginalMount){window.__capOriginalMount=ProjectVPixiBattle.mountForBattle;ProjectVPixiBattle.mountForBattle=async(...a)=>(window.__capEngine=await window.__capOriginalMount(...a));}
    window.__capEngine=null;
    if(mode==='PVE'){battleState.reuseBattleSnapshot=false;renderShell('battle');}else{pvpState.tab='match';renderShell('pvp');}
   },{data,deck,mode});
   const start=page.locator(mode==='PVE'?'#battleStart':'#rankedMatchStart');await start.waitFor({state:'visible',timeout:15000});await start.click();
   await page.waitForFunction(()=>window.__capEngine?.characters?.some(a=>a.cardId==='V-968'&&a.root.visible&&a.root.alpha>0),null,{timeout:30000});
   const actors=await page.evaluate(()=>__capEngine.characters.filter(a=>a.cardId==='V-968').map(a=>({id:a.id,visible:a.root?.visible,alpha:a.root?.alpha})));
   assert(actors.some(a=>String(a.id).includes('V-968')),'Heukmu actor must render');
   await page.screenshot({path:new URL(width+'-'+mode+'.png',out).pathname.replace(/^\/(.:)/,'$1')});
   await page.evaluate(()=>{__capEngine.reducedMotion=true;});
   const result=page.locator(mode==='PVE'?'#pveResultConfirm':'#pvpResultConfirm');await result.waitFor({state:'visible',timeout:120000});
   await result.click();await start.waitFor({state:'visible',timeout:15000});
   assert.deepEqual(errors,[]);reports.push({width,mode,entry:mode==='DUO'?'owner-local duo payload through common ranked renderer':'actual start button',result:true,return:true,actors,levels:data.battleV2.teams.A.mercenaries.map(m=>m.level)});console.log(JSON.stringify({width,mode,result:true,return:true}));
  }
  await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(new URL('report.json',out),JSON.stringify({reports,publicBase,productionWrites:0},null,2));
}catch(e){fs.writeFileSync(new URL('failure.json',out),JSON.stringify({error:e.stack,missing,reports},null,2));throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

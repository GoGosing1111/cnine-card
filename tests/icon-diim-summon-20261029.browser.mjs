import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {iconFurFixture} from './helpers/icon-fur15-fixture.mjs';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {DUAL_REVIEW_CARDS} from '../functions/_companion_preparation.js';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
const root=process.cwd(),out=process.env.QA_OUT,publicBase=process.env.QA_PUBLIC_BASE||'';
assert(out);fs.mkdirSync(out,{recursive:true});
const spec=ICON_EXPANSION_CARDS[1],raw=[{id:spec.cardId,rarity:'ICON',grade:'ICON',name:spec.name,title:spec.name,image:spec.sourceArt,power:360000},...DUAL_REVIEW_CARDS.filter(c=>c.grade!=='ICON').slice(0,4).map(c=>({...c,rarity:c.grade,power:100000}))];
const source=fs.readFileSync('functions/api/[[path]].js','utf8'),f=iconFurFixture(),dataByMode={};
for(const mode of ['PVE','PVP','DUO']){
 const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards:raw}],mode==='PVE'?'PVE':'PVP',{fresh:true,batched:true});
 const byId=new Map(state.cards.map(c=>[c.id,c])),mapping=source.match(mode==='PVE'?/const engineCards=cards\.map\([^\n]+/:/const attackerEngineCards=aCards\.map\([^\n]+/)[0];
 const deck=mode==='DUO'?state.cards:vm.runInNewContext(mapping+';'+(mode==='PVE'?'engineCards':'attackerEngineCards'),{cards:raw,aCards:raw,uniqueCardsById:byId,aUniqueById:byId,synergyMultiplier:1,aSynergyMultiplier:1});
 const monster={id:1,name:'디임 병기 검수',battle_power:10000000,image:'assets/cards/monster/sla2.jfif',isBoss:true};
 const battleV2=mode==='PVE'?createPveBattleV2({cards:deck,monster,seed:17}):mode==='PVP'?createPvpBattleV2({attackerCards:deck,defenderCards:deck,seed:17}):createDuoBattleV2({attackerSquads:[1,2].map(ownerId=>({ownerId,ownerName:'검수 '+ownerId,cards:deck})),defenderSquads:[3,4].map(ownerId=>({ownerId,ownerName:'검수 '+ownerId,cards:deck})),seed:17});
 assert(battleV2.result.timeline.some(e=>e.type==='ICON_SUMMON'));
 dataByMode[mode]={battleV2,cards:deck,monster,result:battleV2.result.winner==='A'?'WIN':'LOSE',user:{id:7,nickname:'병기 검수'},reward:0,coinReward:0,scoreAfter:1000,scoreChange:0,attackerPower:1000000,defenderPower:1000000};
}
f.close();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(publicBase){const r=await fetch(publicBase+url.pathname+url.search);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
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
  for(const mode of (publicBase?['PVE']:['PVE','PVP','DUO'])){
   const data=dataByMode[mode];
   await page.evaluate(async({data,deck,mode})=>{
    API_MODE=true;API_TOKEN='local-test-only';cards=deck;window.cnineCardCatalog=()=>deck;setPveViewMode('hunt');
    const owned=deck.map(c=>c.id),energy={energy:100,maxEnergy:100,costPerBattle:1,unlimited:true};
    localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'병기 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned,quantities:Object.fromEntries(owned.map(id=>[id,1])),breakthroughs:{},testCoinGrantedV13:true}));
    const config={settings:{enabled:true},deck:owned,battleEngine:{active:true,version:'V3'},energy,profile:{season_score:1000},monsters:[{id:1,name:'디임 병기 검수',battlePower:10000000,rewardCoin:0,isBoss:true}],rankedSeries:{codes:['V-960','V-961','V-962','V-963','V-964','V-965'],cards:[],ready:true,ownedCount:6,revision:1}};
    window.entryRequests=[];apiRequest=async(route,options={})=>{entryRequests.push({route,method:options.method||'GET'});if(route==='battle/config'||route==='pvp/config')return structuredClone(config);if(route==='battle/fight'||route==='pvp/fight')return structuredClone(data);if(route==='pvp/match')return {opponent:{id:8,nickname:'검수 상대'},token:'local-test-token'};return {items:[],cards:[],operations:[],enabled:false,visible:false,user:{id:7,nickname:'병기 검수'}};};
    await ensureFeatureResources('battleV2');if(!window.__iconOriginalMount){window.__iconOriginalMount=ProjectVPixiBattle.mountForBattle;ProjectVPixiBattle.mountForBattle=async(...a)=>(window.__iconEngine=await window.__iconOriginalMount(...a));}
    if(mode==='PVE'){battleState.reuseBattleSnapshot=false;renderShell('battle');}else{pvpState.tab='match';renderShell('pvp');}
   },{data,deck:raw,mode});
   const start=page.locator(mode==='PVE'?'#battleStart':'#rankedMatchStart');await start.waitFor({state:'visible',timeout:15000});await start.click();
   await page.waitForFunction(()=>ProjectVPixiBattle.diagnostics()?.iconTechniques?.metrics?.summonAttacks>0,null,{timeout:60000});
   const visual=await page.evaluate(()=>{const e=__iconEngine;return {metrics:ProjectVPixiBattle.diagnostics().iconTechniques.metrics,weapons:[...e.iconTechniqueWeapons.values()].map(a=>({id:a.id,active:a.battleActive,visible:a.root.visible,renderable:a.root.renderable,alpha:a.root.alpha,bounds:a.root.getBounds().rectangle,texture:!!a.fullBodySprite.texture.source}))};});
   assert(visual.weapons.some(w=>w.active&&w.visible&&w.renderable&&w.alpha>0&&w.texture));assert.deepEqual(visual.metrics.missingActors,[]);
   await page.screenshot({path:path.join(out,width+'-'+mode+'-weapon.png')});
   await page.evaluate(()=>{__iconEngine.reducedMotion=true;});
   const result=page.locator(mode==='PVE'?'#pveResultConfirm':'#pvpResultConfirm');await result.waitFor({state:'visible',timeout:120000});
   const metrics=await page.evaluate(()=>ProjectVPixiBattle.diagnostics().iconTechniques.metrics);
   const expected=data.battleV2.result.timeline.filter(e=>['ICON_TECHNIQUE','ICON_SUMMON','ICON_SUMMON_END'].includes(e.type)).length;
   assert.equal(metrics.applied,expected);assert(metrics.summonAttacks>0);
   await result.click();await start.waitFor({state:'visible',timeout:15000});
   assert.deepEqual(errors,[]);reports.push({width,mode,entry:mode==='DUO'?'duo payload through common ranked renderer':'actual start button',result:true,return:true,visual,metrics});console.log(JSON.stringify({width,mode,summons:metrics.summons,shots:metrics.summonAttacks,events:metrics.applied}));
  }
  await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,publicBase,productionWrites:0},null,2));
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,missing,reports},null,2));throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

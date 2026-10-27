import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/bloodmoon-balance-20261027'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-F500880B2ED34350','CN-519C181C18DF4B8E','CN-BE9EB8304A744ECF','CN-48BBCAC81D0E44FA'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payload=(code,mode,side)=>{const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};return {battleV2:mode==='PVE'?createPveBattleV2({cards:deck,mercenary,monster:{id:1,name:'검수 보스',battle_power:1.6e10},seed:77}):createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:side==='A'?mercenary:null,defenderMercenary:side==='B'?mercenary:null,seed:77})};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){file=path.resolve('C:/Users/User/Downloads/cnine-z-body-sword-20260918/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of (publicBase?[390]:[1440,390])){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
  for(const [code,mode] of [['V-961','PVE'],['V-961','PVP'],['V-965','PVE'],['V-965','PVP']]){
   const data=payload(code,mode,'A');data.battleV2.result.timeline=data.battleV2.result.timeline.filter(e=>e.actorId==='A:MERCENARY:'+code&&e.type.startsWith('MERCENARY_')).slice(0,15);
   Object.assign(data,{result:'LOSE',user:{id:7,nickname:'전투 검수'},reward:0,coinReward:0,scoreAfter:1000,scoreChange:0,attackerPower:1e8,defenderPower:1e8});
   await page.evaluate(({data,deck,mode})=>{
    API_MODE=true;API_TOKEN='local-test-only';cards=deck;window.cnineCardCatalog=()=>deck;setPveViewMode('hunt');
    const owned=deck.map(c=>c.id),energy={energy:100,maxEnergy:100,costPerBattle:1,unlimited:true};
    localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'전투 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned,quantities:Object.fromEntries(owned.map(id=>[id,1])),breakthroughs:{},testCoinGrantedV13:true}));
    const config={settings:{enabled:true},deck:owned,battleEngine:{active:true,version:'V3'},energy,profile:{season_score:1000},monsters:[{id:1,name:'전투 검수',battlePower:1.6e10,rewardCoin:0,isBoss:true}],rankedSeries:{codes:['V-960','V-961','V-962'],cards:[],ready:true,ownedCount:3,revision:1}};
    window.entryRequests=[];apiRequest=async(route,options={})=>{entryRequests.push({route,method:options.method||'GET'});if(route==='battle/config'||route==='pvp/config')return structuredClone(config);if(route==='battle/fight'||route==='pvp/fight')return structuredClone(data);if(route==='pvp/match')return {opponent:{id:8,nickname:'검수 상대'},token:'local-test-token'};return {items:[],cards:[],operations:[],enabled:false,visible:false,user:{id:7,nickname:'전투 검수'}};};
    if(mode==='PVE'){battleState.reuseBattleSnapshot=false;renderShell('battle');}else{pvpState.tab='match';renderShell('pvp');}
   },{data,deck,mode});
   const start=page.locator(mode==='PVE'?'#battleStart':'#rankedMatchStart');try{await start.waitFor({state:'visible',timeout:15000});}catch(e){console.error(JSON.stringify(await page.evaluate(()=>({body:document.body.innerText.slice(-2500),requests:entryRequests,context:runtimeCommandContext,battle:battleState}))));throw e;}await start.click({timeout:20000});
   const result=page.locator(mode==='PVE'?'#pveResultConfirm':'#pvpResultConfirm');
   try{await result.waitFor({state:'visible',timeout:70000});}catch(error){await page.screenshot({path:path.join(out,'entry-failure-'+width+'-'+mode+'.png')});console.error((await page.locator('#modal').innerText()).slice(-1200));console.error(JSON.stringify({errors,dialogs}));throw error;}
   assert.match(await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion),/bloodmoon-balance-20261027-v2$/);
   assert.equal(await page.locator('#modal').getByText('정의되지 않은 용병 스킬입니다.',{exact:false}).count(),0);
   await page.screenshot({path:path.join(out,'entry-result-'+width+'-'+code+'-'+mode+'.png')});await result.click();
   await start.waitFor({state:'visible',timeout:15000});const requests=await page.evaluate(()=>entryRequests);
   assert(requests.some(r=>r.route===(mode==='PVE'?'battle/fight':'pvp/fight')&&r.method==='POST'));if(mode==='PVP')assert(requests.some(r=>r.route==='pvp/match'&&r.method==='POST'));
   reports.push({width,code,mode,events:data.battleV2.result.timeline.map(e=>({type:e.type,effect:e.effect,skillId:e.skillId})),startButton:true,resultVisible:true,returned:true,requests:requests.filter(r=>r.method==='POST')});console.log(width+' '+code+' '+mode+' buttons/result/return PASS');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'entry-browser.json'),JSON.stringify({status:'PASSED',assetSource:publicBase||'local source',reports,productionTransactions:0},null,2));console.log(JSON.stringify({status:'PASSED',checks:reports.length,productionTransactions:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

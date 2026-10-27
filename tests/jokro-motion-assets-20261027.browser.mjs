import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/jokro-motion-assets-20261027'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const baseline=process.argv.includes('--baseline');
const previous='56e21a0ae5ae509b6a94bc119f38241d49127079',oldBundle=execFileSync('git',['show',previous+':preview/project-v-v3/project-v-pixi-battle.bundle.js'],{encoding:'utf8',maxBuffer:40e6}),oldWrapper=execFileSync('git',['show',previous+':js/battle-v3-live.js'],{encoding:'utf8',maxBuffer:4e6});
const previousRuntime=oldWrapper.match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
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
 for(const width of (baseline||publicBase?[390]:[1440,390])){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  let manifestRequests=0;page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/preview/mercenary-jokro-iaido-20261017-v1/manifest.json'){manifestRequests++;return route.fulfill({status:503,contentType:'text/plain',body:'Injected manifest failure'});}
   if(!publicBase&&url.pathname==='/preview/project-v-v3/project-v-pixi-battle.bundle.js'){requests.push(url.pathname+url.search);if(baseline||!url.searchParams.has('battleRecovery'))return route.fulfill({contentType:'text/javascript',body:oldBundle});}
   if(!publicBase&&url.pathname==='/js/battle-v3-live.js'){requests.push(url.pathname+url.search);if(baseline||!url.searchParams.has('battleRecovery'))return route.fulfill({contentType:'text/javascript',body:oldWrapper});}
   return route.continue();
  });
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'전투 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();});
  const runtime=await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion),recoveryRequests=requests.filter(u=>u.includes('battleRecovery='));
  if(!baseline){assert(runtime.endsWith('-jokro-manifest-bundled-20261027-v1'));if(!publicBase){assert(runtime.startsWith(previousRuntime+'-'));assert.equal(recoveryRequests.length,2);}}
  for(const code of ['V-979'])for(const [mode,side] of (baseline||publicBase?[['PVP','A']]:[['PVP','A'],['PVP','B'],['PVE','A']])){
   const data=payload(code,mode,side),id=side+':MERCENARY:'+code;
   const events=mode==='PVE'?data.battleV2.result.timeline.filter(e=>e.actorId===id&&e.skillId==='MS-979').slice(0,3):[data.battleV2.result.timeline.find(e=>e.actorId===id&&e.type==='TURN'&&e.damage>0)];
   assert(events.length&&events.every(Boolean));
   const mounted=await page.evaluate(async({data,deck,mode,events})=>{
    window.cnineCardCatalog=()=>deck;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
    api.mountForBattle=async(...args)=>(engine=await original(...args));
    try{
     const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'족로 검수',opponentName:'검수 상대'});
     const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode,playerName:'족로 검수'});
     await engine.deployCards({instant:true,force:true});window.jokroBattleQA={renderer,engine,events};
     return {mercenaries:engine.mercenaries.map(a=>({code:a.cardId,side:a.team,visible:a.root.visible,textureValid:a.fullBodySprite.texture.width>0}))};
    }catch(e){return {error:e.message};}finally{api.mountForBattle=original;}
   },{data,deck,mode,events});
   if(baseline){assert.match(mounted.error,/JOKRO_MOTION_ASSETS/);assert(manifestRequests>0);reports.push({width,mode,side,injectedStatus:503,manifestRequests,...mounted});await page.screenshot({path:path.join(out,'baseline.png')});continue;}
   assert.equal(mounted.error,undefined,JSON.stringify(mounted));assert.equal(mounted.mercenaries.length,1);assert(mounted.mercenaries.every(a=>a.code===code&&a.visible&&a.textureValid));
   await page.waitForFunction(()=>jokroBattleQA.engine.jokroStates?.size===1,{},{timeout:60000});
   const embedded=await page.evaluate(()=>[...jokroBattleQA.engine.jokroStates.values()][0].fx.manifest);
   assert.deepEqual(embedded,JSON.parse(fs.readFileSync('preview/mercenary-jokro-iaido-20261017-v1/manifest.json')));
   const result=await page.evaluate(async()=>{
    const {engine:e,events}=jokroBattleQA,show=e.showAccountBattleUnitDamage,banner=e.queueBanner,hp=e.syncTargetHp;let damageApplications=0,hpWrites=0;const banners=[];
    e.showAccountBattleUnitDamage=function(...args){damageApplications++;return show.apply(this,args);};
    e.queueBanner=function(...args){banners.push(args);return banner.apply(this,args);};
    e.syncTargetHp=function(...args){hpWrites++;return hp.apply(this,args);};
    try{const completed=await e.playEvents(events);return {completed,damageApplications,hpWrites,banners,events:events.map(x=>({type:x.type,effect:x.effect,skillId:x.skillId})),last:e.lastMercenaryPlayback};}
    catch(error){return {error:error.message};}finally{e.showAccountBattleUnitDamage=show;e.queueBanner=banner;e.syncTargetHp=hp;}
   });
   assert.equal(result.error,undefined,JSON.stringify(result));assert.notEqual(result.completed,false,JSON.stringify(result));assert.equal(result.damageApplications,mode==='PVE'?events.find(e=>e.type==='MERCENARY_JOKRO_AREA').hits.filter(h=>!h.dodge).length:1);
   assert.equal(manifestRequests,0,'the battle never fetches the unavailable manifest');
   assert(await page.locator('#modal canvas').isVisible());await page.screenshot({path:path.join(out,mode+'-'+side+'-'+width+'.png')});
   reports.push({width,code,mode,side,...mounted,...result,manifestRequests,approvedManifestIdentical:true,stalePairReplaced:!publicBase,recoveryRequests:recoveryRequests.length});console.log(width+' '+code+' '+mode+' '+side+' PASS');
   await page.evaluate(async()=>{jokroBattleQA.renderer.destroy();await ProjectVPixiBattle.whenReleased();});
  }
  if(!baseline)assert.deepEqual(errors,[]);await context.close();
 }
 assert.deepEqual(missing,[]);const result={status:'PASSED',assetSource:publicBase||'local source',reports,productionTransactions:0};fs.writeFileSync(path.join(out,baseline?'baseline.json':'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:reports.length,productionTransactions:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

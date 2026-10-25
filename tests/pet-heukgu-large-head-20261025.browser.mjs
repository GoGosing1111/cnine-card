import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {livePetDefinition} from '../functions/_pet_account.js';
import {planUpdate} from '../scripts/ops/pet-heukgu-large-head-20261025.mjs';
import {validatePetCmsDocument} from '../shared/pet-cms-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/pet-heukgu-large-head-20261025/browser'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const reviewed=JSON.parse(fs.readFileSync('docs/qa/pet-heukgu-large-head-20261025/read.json'));
const planned=planUpdate({revision:reviewed.revision,document:reviewed.document},validatePetCmsDocument);
const previous='b10a233d4',oldBundle=execFileSync('git',['show',previous+':preview/project-v-v3/project-v-pixi-battle.bundle.js'],{encoding:'utf8',maxBuffer:40e6}),oldWrapper=execFileSync('git',['show',previous+':js/battle-v3-live.js'],{encoding:'utf8',maxBuffer:4e6});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const original=JSON.parse(fs.readFileSync('preview/sx-live-v1/fixtures.json')).multi;
const suitArt='/assets/ui/project-v/account-battle-suits/z-sword-v1/z-body.png';
const suit={...original.equippedBattleSuit,code:'BATTLE_SUIT_Z_BODY',name:'Z-BODY',pvePower:50000000,image:suitArt,battleSprite:suitArt,appearance:{battleSprite:suitArt,battleHeight:278},skillChips:[]};
const pet=(raw,mode,ownerId)=>({definition:livePetDefinition(raw,mode),magnet:true,cmsRevision:reviewed.revision,loadoutRevision:1,ownerId});
const payload=mode=>{
 const heukgu=pet(planned.afterPet,mode,7),otherRaw=reviewed.document.pets.find(p=>p.code==='PET-BONGSOON'),other=pet(otherRaw,mode,8);
 assert(heukgu.definition&&other.definition);
 const mercenary={...limitedDeploymentSnapshot('V-974'),combat:fixture.combat};
 const battleV2=mode==='PVE'?createPveBattleV2({cards:deck,battleSuit:suit,mercenary,pet:heukgu,monster:{id:1,name:'전투 검수',battle_power:1.6e10},seed:77}):createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerPet:heukgu,defenderPet:other,seed:77});
 return {battleV2,cards:deck,accountNickname:'흑구 검수',playerName:'흑구 검수',...(mode==='PVE'?{equippedBattleSuit:suit,characterBonus:{...original.characterBonus,battleSuitPve:suit.pvePower,equippedBattleSuit:suit},battleSuitRuntime:{...original.battleSuitRuntime,enabled:true}}:{})};
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(url.pathname.endsWith('/')||fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 let body;try{body=fs.readFileSync(file);}catch{const rel=path.relative(root,file).replaceAll('\\','/');try{body=execFileSync('git',['show','HEAD:'+rel],{cwd:root,maxBuffer:40e6,stdio:['ignore','pipe','ignore']});}catch{if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of (publicBase?[390]:[1440,390,320])){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(!publicBase&&url.pathname==='/preview/project-v-v3/project-v-pixi-battle.bundle.js'){requests.push(url.pathname+url.search);if(!url.searchParams.has('battleRecovery'))return route.fulfill({contentType:'text/javascript',body:oldBundle});}
   if(!publicBase&&url.pathname==='/js/battle-v3-live.js'){requests.push(url.pathname+url.search);if(!url.searchParams.has('battleRecovery'))return route.fulfill({contentType:'text/javascript',body:oldWrapper});}return route.continue();});
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'흑구 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');await ensureFeatureResources('battleV2');document.querySelector('[data-miracle-close]')?.click();});
  assert((await page.evaluate(()=>ProjectVPixiBattle.runtimeVersion)).endsWith('-heukgu-large-head-20261025-v3'));
  const recoveryRequests=requests.filter(u=>u.includes('battleRecovery='));if(!publicBase)assert.equal(recoveryRequests.length,2);
  for(const mode of ['PVE','PVP']){
   const data=payload(mode),events=data.battleV2.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');assert.equal(events.length,mode==='PVE'?1:2);
   await page.evaluate(async({data,deck,mode,events})=>{
    window.cnineCardCatalog=()=>deck;const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
    api.mountForBattle=async(...args)=>(engine=await original(...args));
    try{const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'흑구 검수',opponentName:'상대'});
     const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode,playerName:'흑구 검수'});await engine.deployCards({instant:true,force:true});window.heukguQA={renderer,engine};await engine.playEvents(events);
    }finally{api.mountForBattle=original;}
   },{data,deck,mode,events});
   await page.waitForFunction(count=>heukguQA.engine.petSupports?.size===count&&[...heukguQA.engine.petSupports.values()].every(r=>r.applied&&r.sprite.texture.width>1000&&r.root.visible),mode==='PVE'?1:2,{timeout:60000});
   await page.waitForFunction(()=>!heukguQA.engine.effectLayer.children.some(c=>c.label?.startsWith('PET_CAST_')),{},{timeout:15000});
   const result=await page.evaluate(()=>{const e=heukguQA.engine;return {runtime:ProjectVPixiBattle.runtimeVersion,suitActive:!!e.accountBattleUnit?.active,petCount:e.petSupports.size,pets:[...e.petSupports.values()].map(r=>({code:r.snapshot.definition.code,source:r.snapshot.definition.battleSprite,layoutSize:r.layoutSize,displaySize:r.displaySize,haloScale:r.halo.scale.x,textureWidth:r.sprite.texture.width,textureHeight:r.sprite.texture.height,magnet:r.badge?.text,visible:r.root.visible,applied:r.applied,root:{x:r.root.x,y:r.root.y},bounds:r.sprite.getBounds(),label:r.name.getBounds()})),canvasVisible:!!document.querySelector('#modal canvas')};});
   for(const p of result.pets){assert(Math.abs(p.displaySize/p.layoutSize-(p.code==='PET-HEUKGU'?.92:.8))<1e-10);assert(Math.abs(p.haloScale-p.layoutSize*.8/126)<1e-10);assert.equal(p.magnet,'자석');assert(p.visible&&p.applied);if(p.code==='PET-HEUKGU'){assert(p.source.endsWith('/pet-heukgu-large-head-v3.png'));assert.equal(p.textureWidth,1182);}}
   if(mode==='PVE')assert(result.suitActive,'Verify the actual suit-adjacent pet position');
   await page.screenshot({path:path.join(out,'battle-'+width+'-'+mode+'.png')});reports.push({width,mode,stalePairReplaced:!publicBase,...result});console.log(width+' '+mode+' PASS');
   await page.evaluate(async()=>{heukguQA.renderer.destroy();await ProjectVPixiBattle.whenReleased();});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',assetSource:publicBase||'local',reports,productionTransactions:0},null,2));console.log(JSON.stringify({status:'PASSED',checks:reports.length}));
}catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error.stack),missing,reports},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

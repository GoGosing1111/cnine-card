// Actual shipped renderer and local fixtures; no live accounts or reward writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {petSupportFixture,reviewPet} from './helpers/pet-support-fixture.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.BATTLE_UI_QA_OUTPUT;
assert(out);fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-987'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,pet:reviewPet('ATTACK_PERCENT'),accountNickname:'시라누이'},seed:7919,limitMs:15000}).payload;
const samples={HUNT:hunt,...Object.fromEntries(['PVE','PVP','COOP'].map(mode=>[mode,petSupportFixture({mode,type:'ALL'})]))};
const huntHtml=fs.readFileSync(path.join(root,'pve/legion-hunt/index.html'),'utf8');
const commonHtml=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/card.css"><link rel="stylesheet" href="/css/battle-v2-live.css"><link rel="stylesheet" href="/css/battle-v3-live.css"><link rel="stylesheet" href="/raid/cooperative/style.css"><style>body{margin:0;background:#080e19}#modal{position:fixed;inset:0;height:100dvh!important}.battle-v3-live-shell{height:100%!important;max-height:100%!important;min-height:0!important}</style><div id="modal"></div><script src="/js/project-v-battle-art-adapter-v1.js"></script><script src="/js/project-v-tier-battle-art-adapter-v1.js"></script><script src="/js/project-v-monster-battle-art-adapter-v1.js"></script><script src="/js/responsive-battle-sprites-v1815.js"></script><script src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script src="/js/battle-v3-live.js"></script><script type="module" src="/qa-boot.mjs"></script></html>`;
const boot=`import {mountCoopBattle} from '/raid/cooperative/battle.mjs';
try{
 window.qaPhase='payload';
 const mode=new URLSearchParams(location.search).get('mode'),payload=await fetch('/qa-data?mode='+mode).then(r=>r.json());localStorage.setItem('cnine_battle_sound','OFF');window.cnineCardCatalog=()=>payload.cards||[];
 window.qaPhase='mount';const api=ProjectVPixiBattle,live=ProjectVBattleV3Live;let engine;for(const key of ['mountForBattle','resetSession']){const original=api[key];api[key]=async(...args)=>(engine=await original(...args));}
 const modal=document.getElementById('hunt-modal')||document.getElementById('modal');let renderer;
 if(mode==='COOP')renderer=await mountCoopBattle(modal,payload);else{const view=live.prepareLoading({modal,mode,playerName:'원정대',opponentName:'검수 상대'});renderer=await live.createRenderer({...view,modal,mode,data:payload,playUltimateCinematics:false});await api.restoreDeployedFormation();}
 window.qaPhase='restore';api.restorePetSupport(5000);if(mode==='HUNT')engine.attachGroundDrops({});
 window.UIQA={engine,renderer,payload,mode,ready:true};
}catch(e){window.qaError=e.stack;console.error(e);}`;
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 const send=(type,data)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);};
 if(url.pathname==='/qa')return send('text/html;charset=utf-8',mode==='HUNT'?huntHtml.replace(/<script defer src="\/preview\/sustained-hunt-v2\/app\.js[^\"]*"><\/script>/,'').replace('</head>','<script type="module" src="/qa-boot.mjs"></script></head>'):commonHtml);
 if(url.pathname==='/qa-boot.mjs')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify(samples[mode]));
 if(url.pathname.startsWith('/api/'))return send('application/json','{"enabled":false,"items":[]}');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const width of [1440,390])for(const mode of ['HUNT','PVE','PVP','COOP']){
  const page=await browser.newPage({viewport:{width,height:width===390?844:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});page.on('pageerror',e=>{errors.push(mode+': '+e.stack);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,250));});
  await page.goto(base+'/qa?mode='+mode);await page.waitForFunction(()=>window.UIQA?.ready||window.qaError,null,{timeout:30000}).catch(async e=>{console.log('BOOT',await page.evaluate(()=>({phase:window.qaPhase,error:window.qaError,text:document.body.innerText.slice(0,800),api:window.ProjectVPixiBattle?.runtimeVersion})));await page.screenshot({path:path.join(out,'failed.png')});throw e;});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  const chips=page.locator('.pet-support-chip');await chips.first().waitFor();assert.equal(await chips.count(),mode==='COOP'?3:mode==='PVP'?2:1);
  const state=await page.evaluate(()=>{const q=UIQA,rail=document.querySelector('.jinmu-dialogue-rail'),chip=document.querySelector('.pet-support-chip');return {mode:q.mode,rail:rail?.getBoundingClientRect().toJSON(),railColor:rail?getComputedStyle(rail).backgroundColor:null,canvas:q.engine.host.getBoundingClientRect().toJSON(),inset:q.engine.dialogueTopInset,chip:chip.getBoundingClientRect().toJSON(),chipBackground:getComputedStyle(chip).backgroundColor,tooltipCount:document.querySelectorAll('.pet-support-tooltip:not([hidden])').length,overflow:document.documentElement.scrollWidth>innerWidth+1,backdrop:q.engine.backdropBounds};});
  assert.equal(state.overflow,false);assert.equal(state.tooltipCount,0);assert.equal(state.chipBackground,'rgba(0, 0, 0, 0)');assert(state.chip.width<=44);assert(state.chip.right<=width+1);
  if(mode==='HUNT'){assert.equal(state.railColor,'rgba(0, 0, 0, 0)');assert(state.canvas.top<state.rail.bottom);assert(state.inset>0);}
  await page.screenshot({path:path.join(out,width+'-'+mode+'.png')});
  if(width===390)await chips.first().tap();else await chips.first().hover();
  const tip=page.locator('.pet-support-tooltip:not([hidden])');await tip.waitFor();assert.match(await tip.innerText(),/\+20%/);
  if(mode==='PVE')assert.equal(await tip.locator('.pet-support-effect').count(),5);
  const tr=await tip.boundingBox();assert(tr.x>=0&&tr.x+tr.width<=width+1);assert(tr.y>=0&&tr.y+tr.height<=(width===390?844:900)+1);
  await page.screenshot({path:path.join(out,width+'-'+mode+'-tooltip.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.pet-support-tooltip:not([hidden])').count(),0);
  if(width!==390){await chips.first().focus();await tip.waitFor();await page.keyboard.press('Escape');}
  if(mode==='HUNT'){
   await page.evaluate(()=>{const e=UIQA.engine;UIQA.coins=e.groundDrops.collectCoins([e.station('cards',3,'ENEMY'),e.station('cards',4,'ENEMY')]);});
   await page.waitForFunction(()=>UIQA.engine.effectLayer.children.some(c=>c.label==='HUNT_COIN_PICKUP'));
   await page.waitForTimeout(350);await page.screenshot({path:path.join(out,width+'-coins.png')});await page.evaluate(()=>UIQA.coins);
   assert.equal(await page.evaluate(()=>UIQA.engine.effectLayer.children.filter(c=>c.label==='HUNT_COIN_PICKUP').length),0);
  }
  await page.evaluate(async()=>{UIQA.renderer.destroy();await ProjectVPixiBattle.setVisible(false);});assert.equal(await chips.first().isVisible(),false);await page.evaluate(()=>ProjectVPixiBattle.destroy());assert.equal(await chips.count(),0);checks.push({width,...state});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors:errors.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {HEUKMU_ART} from '../shared/mercenary-heukmu-v1.mjs';
import {BLOODMOON_MERCENARIES} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {APOCALYPSE_MINIONS} from '../shared/apocalypse-legion-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.V3_HUD_QA_OUT;
if(!out)throw Error('V3_HUD_QA_OUT required');fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json')));
const monsters=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'))),bossArt=monsters.sprites.find(m=>m.monsterId===78);
function dataFor(kind){
 const pvp=['PVP','DUO'].includes(kind),data=structuredClone(fixture);data.mode=pvp?'PVP':'HUNT';
 data.v3RenderContext={accountBattleUnitPve:false};data.battleV2.result={timeline:[],winner:null};data.battleV2.teams.A.supports=[];
 data.battleV2.teams.A.mercenaries=[kind==='DIALOGUE'?limitedDeploymentSnapshot('V-996'):HEUKMU_ART,BLOODMOON_MERCENARIES[0]].map((art,i)=>({...art,id:'A:MERC:'+art.code,cardId:art.code,title:art.name,grade:art.rank,hp:100000,maxHp:100000,shield:20000,maxShield:20000,slot:i,isMercenary:true,actorKind:'MERCENARY',image:art.sourceArt,originalCardArt:art.sourceArt}));
 if(pvp){delete data.monster;data.battleV2.teams.B=structuredClone(data.battleV2.teams.A);for(const c of [...data.battleV2.teams.B.cards,...data.battleV2.teams.B.mercenaries]){c.id=c.id.replace(/^A:/,'B:');c.side='B';}}
 else{
  data.monster={id:78,monsterId:78,name:'아즈마',image:bossArt.sourceArt,apocalypse:true,isBoss:true};data.battleV2.rules={enemyFormation:'BOSS_WITH_SIX_MINIONS'};
  data.battleV2.teams.B.cards=[{id:'B:0:MONSTER:78',cardId:'MONSTER:78',monsterId:78,name:'아즈마',title:'아즈마',grade:'BOSS',isBoss:true,isMonster:true,hp:1000000,maxHp:1000000,shield:0,maxShield:0,sourceArt:bossArt.sourceArt,image:bossArt.sourceArt},...Array.from({length:6},(_,i)=>{const m=APOCALYPSE_MINIONS[i%3];return {...m,id:'B:'+(i+1)+':MONSTER:'+m.monsterId,cardId:'MONSTER:'+m.monsterId+':'+i,title:m.name,grade:'MONSTER',image:m.sourceArt,hp:100000,maxHp:100000,shield:0,maxShield:0,isMonster:true,isBoss:false};})];data.battleV2.teams.B.mercenaries=[];
 }
 if(kind.startsWith('COOP')||kind==='DUO'){
  const coop=kind.startsWith('COOP'),count=coop?Number(kind.slice(-1)):2;
  if(coop)data.battleV2.teams.B.cards=data.battleV2.teams.B.cards.slice(0,3);
  data.battleV2.rules={...data.battleV2.rules,formation:coop?'COOP_THREE_SQUADS':'DUO_TWO_SQUADS',mercenariesPerOwner:2};
  for(const side of coop?['A']:['A','B']){
   const team=data.battleV2.teams[side],cards=team.cards.slice(0,coop?2:5),mercs=team.mercenaries;
   team.members=Array.from({length:count},(_,s)=>({ownerId:s+1,ownerName:'분대장 '+(s+1),ownerRankLevel:2}));
   const copy=(rows,merc)=>Array.from({length:count},(_,s)=>rows.map((c,i)=>({...c,id:`${side}:S${s}:${merc?'MERC':'CARD'}:${i}:${c.cardId}`,side,squadIndex:s,localSlot:i+(merc?coop?2:5:0),ownerId:s+1,ownerName:'분대장 '+(s+1)}))).flat();
   team.cards=copy(cards,false);team.mercenaries=copy(mercs,true);
  }
 }
 return data;
}
const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/card.css"><link rel="stylesheet" href="/css/battle-v2-live.css"><link rel="stylesheet" href="/css/battle-v3-live.css"><style>body{margin:0;background:#080c17}</style><div id="modal"></div><script src="/js/project-v-battle-art-adapter-v1.js"></script><script src="/js/project-v-tier-battle-art-adapter-v1.js"></script><script src="/js/project-v-monster-battle-art-adapter-v1.js"></script><script src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script src="/js/battle-v3-live.js"></script></html>';
const cache=new Map(),missing=[],mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');if(url.pathname==='/fixture'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname.startsWith('/api/'))return res.writeHead(403).end();
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 let bytes=cache.get(file);if(!bytes){
  if(process.env.V3_HUD_PUBLIC_BASE){const r=await fetch(process.env.V3_HUD_PUBLIC_BASE+url.pathname+url.search);assert.equal(r.status,200,url.pathname);bytes=Buffer.from(await r.arrayBuffer());}
  else bytes=fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','show','HEAD:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','ignore']});
  cache.set(file,bytes);
 }res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
}catch(e){missing.push(req.url);res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
const cases=process.env.V3_HUD_CASES?JSON.parse(process.env.V3_HUD_CASES):[['HUNT',1440,900],['HUNT',390,844],['HUNT',844,390],['PVP',1440,900],['PVP',390,844],['DUO',1440,900],['DUO',390,844],['DUO',844,390],['COOP2',390,844],['COOP3',390,844],['COOP3',1440,900],['COOP3',844,390]];
try{
 for(const [kind,width,height]of cases){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(origin+'/fixture');
  const data=dataFor(kind),expected=kind==='WORLD'?5:kind==='DUO'?28:kind.startsWith('COOP')?Number(kind.slice(-1))*4:kind==='PVP'?14:7;
  await page.evaluate(async({data,kind})=>{
   const api=ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...a)=>window.qaEngine=await mount(...a);
   window.qaView=ProjectVBattleV3Live.prepareLoading({modal:document.querySelector('#modal'),mode:data.mode,playerName:'내 분대',opponentName:data.monster?.name||'상대 분대'});
   if(kind==='APOCALYPSE'){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/css/pve-apocalypse-v1952.css';document.head.append(link);await new Promise(r=>link.onload=r);
    qaView.stage.classList.add('apocalypse-battle-field');
   }
   if(kind==='WORLD'){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/css/world-raid-v3-live.css';document.head.append(link);await new Promise(r=>link.onload=r);
    window.ensureFeatureResources=async()=>{};
    // Freeze only unrelated ultimate FX; run the actual live raid UI/controller.
    window.WorldRaidNativeFxV2={cancel(){},frames:async()=>[],metrics:{}};
    const me={userId:7,nickname:'내 분대',cards:data.battleV2.teams.A.cards,currentHp:750,maxHp:1000,shownDamage:2500,totalPower:100000};
    const current={id:78,bossName:'아즈마',bossImage:data.monster.image,bossBattleSprite:data.battleV2.teams.B.cards[0].projectVMonsterArt?.primaryUrl,status:'BATTLE',currentHp:80000,maxHp:100000,phase:1,attackTicks:0,ultimateCasts:0,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+120000).toISOString(),combatRules:{bossAttackIntervalMs:6000},ultimate:{name:'레이드 궁극기'},minions:[]};
    const world={current,me,participants:[me],settings:{},serverNow:new Date().toISOString()};
    const {openWorldRaidV3}=await import('/js/world-raid-v3-live.mjs');
    window.qaRenderer=await openWorldRaidV3({modal:document.querySelector('#modal'),view:qaView,data:world,getData:()=>world});
   }else window.qaRenderer=await ProjectVBattleV3Live.createRenderer({...qaView,modal:document.querySelector('#modal'),mode:data.mode,data});
   await qaEngine.deployCards({instant:true,force:true});qaView.phase.textContent='자동 전투';
   await document.fonts.ready;await Promise.all([...document.querySelectorAll('.v3-hud-portrait img')].map(img=>img.decode().catch(()=>{})));
  },{data,kind});
  await page.waitForTimeout(350);
  const inspect=()=>page.evaluate(()=>{
   const b=qaView.stage.getBoundingClientRect(),root=qaEngine.root,s=qaEngine.backdropBounds;
   const portraits=[...document.querySelectorAll('[data-hud-actor]')].map(n=>{const r=n.getBoundingClientRect();return {id:n.dataset.hudActor,side:n.dataset.side,matched:qaEngine.characters.some(a=>a.id===n.dataset.hudActor),visible:r.left>=b.left&&r.right<=b.right+1&&r.top>=b.top&&r.bottom<=b.bottom+1,image:n.querySelector('img').naturalWidth>0,box:{x:r.x,y:r.y,width:r.width,height:r.height}};});
   return {canvas:qaView.host.querySelectorAll('canvas').length,host:{width:qaView.host.clientWidth,height:qaView.host.clientHeight},portraits,interactive:document.querySelectorAll('.v3-hud-rail button,.v3-hud-rail a,.v3-hud-rail [tabindex]').length,overflow:document.documentElement.scrollWidth>innerWidth,background:{left:s.x*root.scale.x+root.x,top:s.y*root.scale.y+root.y,right:(s.x+s.width)*root.scale.x+root.x,bottom:(s.y+s.height)*root.scale.y+root.y},actors:qaEngine.viewportGeometry().actors};
  });
  let audit=await inspect();await page.screenshot({path:path.join(out,`${kind}-${width}.png`)});
  reports.push({kind,width,height,errors,audit});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,missing},null,2));
  assert.deepEqual(errors,[]);assert.equal(audit.canvas,1);assert.equal(audit.portraits.length,expected);assert(audit.portraits.every(p=>p.matched&&p.visible&&p.image),'All portraits matched, loaded and visible');assert.equal(new Set(audit.portraits.map(p=>p.box.width.toFixed(2))).size,1,'Every portrait has the same fixed width');if(width===390)assert.equal(audit.portraits[0].box.width,50);assert.equal(audit.interactive,0);assert.equal(audit.overflow,false);assert.deepEqual(audit.host,{width,height});assert(audit.background.left<=0&&audit.background.top<=0&&audit.background.right>=width&&audit.background.bottom>=height);
  if(kind==='WORLD'){
   const clear=await page.evaluate(()=>{const a=document.querySelector('#battlePhase').getBoundingClientRect(),b=document.querySelector('.wr3-controls').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;});assert(clear,'Raid clock must not overlap controls');
   if(width===390){await page.locator('[data-wr3-party]').click();assert(await page.locator('.wr3-party').isVisible());await page.locator('[data-wr3-hide]').click();}
   await page.locator('[data-wr3-close]').click();assert.equal(await page.locator('#modal canvas').count(),0);reports.at(-1).raidControls=true;await page.close();console.log(JSON.stringify({kind,width,portraits:expected,passed:true}));continue;
  }
  const state=await page.evaluate(async()=>{
   const a=qaEngine.characters.find(a=>a.team==='ALLY'),b=qaEngine.characters.find(b=>b.team==='ENEMY'&&b.cardId===a.cardId);
   a.setHp(23);a.setShield(50,100);if(b)b.setHp(74);qaView.stage.__v3Hud.sync();
   const find=id=>[...document.querySelectorAll('[data-hud-actor]')].find(n=>n.dataset.hudActor===id),own=find(a.id),other=b&&find(b.id);
   const before={own:Number(own.querySelector('[role=meter]').getAttribute('aria-valuenow')),other:other?Number(other.querySelector('[role=meter]').getAttribute('aria-valuenow')):null,shield:Number(own.style.getPropertyValue('--shield'))};
   a.setHp(0);qaView.stage.__v3Hud.sync();const ko=own.classList.contains('is-ko');a.setHp(88);qaView.stage.__v3Hud.sync();return {...before,ko,revived:!own.classList.contains('is-ko')};
  });
  assert.equal(state.own,23);if(kind==='PVP'||kind==='DUO')assert.equal(state.other,74);assert.equal(state.shield,.5);assert(state.ko&&state.revived);reports.at(-1).state=state;
  if(kind==='DIALOGUE'){
   const geometry=await page.evaluate(()=>{
    const banner=qaEngine.uiLayer.banner;banner.nameText.text='전술 스킬 발동';banner.typeText.text='검수';banner.alpha=1;qaEngine.app.render();
    const b=banner.getBounds(),d=document.querySelector('.jinmu-dialogue-rail').getBoundingClientRect(),h=document.querySelector('.battle-v3-header').getBoundingClientRect(),first=document.querySelector('[data-hud-actor]').getBoundingClientRect();
    return {banner:{left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height},dialogue:{top:d.top,bottom:d.bottom},headerBottom:h.bottom,firstTop:first.top};
   });
   assert(geometry.dialogue.top>=geometry.headerBottom-.1);assert(geometry.firstTop>=geometry.dialogue.bottom);assert(geometry.banner.left>=0&&geometry.banner.top>=geometry.dialogue.bottom&&geometry.banner.right<=width&&geometry.banner.bottom<=height);reports.at(-1).dialogue=geometry;
   await page.screenshot({path:path.join(out,`dialogue-banner-${width}.png`)});
  }
  if(kind==='HUNT'||kind==='APOCALYPSE'){
   const expectedZone=width===1440?1:width===390?0:-1;
   await page.evaluate(async()=>{
    const {playDodge}=await import('/js/apocalypse-challenge-v1.mjs?v=20261102-v1');
    window.qaAnswers=[];let answer=false;
    window.apiRequest=async(route,options)=>{const action=route.split('/').at(-1),body=JSON.parse(options.body),base={requestId:'local-hud',serverNow:Date.now(),expiresAt:Date.now()+60000};if(action==='open')return {...base,status:'OPEN',openedAt:Date.now(),windowMs:1600,safeZone:1};if(action==='answer'){qaAnswers.push(body.zone);answer=body.zone===1;}return {...base,status:answer?'ANSWERED':'FAILED',success:answer,settlement:{success:answer}};};
    window.qaDodge=playDodge({stage:qaView.stage,phase:qaView.phase,data:{apocalypseChallenge:{requestId:'local-hud'}},apocalypseAttempt:{runToken:'local-memory',ensure(){},stopPulse(){}}});
   });
   await page.locator('.apocalypse-dodge').waitFor();
   const controls=await page.locator('[data-dodge-zone]').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};}));
   assert(controls.every(b=>b.visible&&b.w>=44&&b.h>=44));
   await page.screenshot({path:path.join(out,`dodge-${width}.png`)});
   if(kind==='APOCALYPSE'){
    const overlay=await page.evaluate(()=>{const s=getComputedStyle(qaView.stage,'::after');return {content:s.content,display:s.display,width:s.width,height:s.height,background:s.backgroundColor};});
    reports.at(-1).apocalypseOverlay=overlay;
    assert(overlay.display==='none'||overlay.content==='none','Apocalypse must not paint a battlefield-covering badge/overlay');
   }
   if(expectedZone>=0){if(width===1440)await page.keyboard.press('2');else await page.locator('[data-dodge-zone="0"]').click();await page.keyboard.press('3');assert.equal(await page.locator('[data-dodge-zone]:disabled').count(),3);}
   const outcome=await page.evaluate(()=>qaDodge),answers=await page.evaluate(()=>qaAnswers);assert.deepEqual(answers,[expectedZone]);assert.equal(outcome.success,expectedZone===1);reports.at(-1).dodge={controls,answers,outcome};
  }
  const complete=await page.evaluate(async()=>{
   const final={A:qaEngine.characters.filter(a=>a.team==='ALLY'&&!a.isMercenary).map(a=>({id:a.id,hp:750,maxHp:1000})),B:qaEngine.characters.filter(a=>a.team==='ENEMY'&&!a.isMercenary).map(a=>({id:a.id,hp:0,maxHp:1000})),mercenaries:{A:qaEngine.characters.filter(a=>a.team==='ALLY'&&a.isMercenary).map(a=>({id:a.id,hp:0,maxHp:1000})),B:qaEngine.characters.filter(a=>a.team==='ENEMY'&&a.isMercenary).map(a=>({id:a.id,hp:0,maxHp:1000}))}};
   qaView.msg.innerHTML=ProjectVBattleV3Live.resultHtml({mode:'PVP',win:true,data:{result:'WIN',reward:100,battleV2:{result:{winner:'A',final}}}});qaRenderer.showResult();qaView.stage.__v3Hud.finalState(final);
   const current=[...document.querySelectorAll('[data-hud-actor]')].map(n=>({side:n.dataset.side,merc:n.classList.contains('is-mercenary'),hp:Number(n.querySelector('[role=meter]').getAttribute('aria-valuenow'))}));
   return {current,ticking:qaEngine.app.ticker.started,visible:qaView.msg.getBoundingClientRect().height>0};
  });
  assert(complete.current.every(c=>c.hp===(c.side==='A'&&!c.merc?75:0)));assert.equal(complete.ticking,false);assert(complete.visible);reports.at(-1).final=complete;
  if(kind==='PVP'&&width===390){await page.screenshot({path:path.join(out,'result-390.png')});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);audit=await inspect();assert.equal(audit.canvas,1);assert(audit.portraits.every(p=>p.visible));reports.at(-1).rotated=true;}
  await page.evaluate(()=>qaRenderer.destroy());await page.close();console.log(JSON.stringify({kind,width,portraits:expected,passed:true}));
 }
 assert.deepEqual(missing,[]);
}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,missing,productionWrites:0},null,2));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const field=process.env.QA_FIELD||'PVP';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {chromium,webkit,devices} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/ryujin-live-20261119'),reproduce=process.env.QA_REPRODUCE==='1',publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payload=code=>{const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};if(field==='HUNT')return createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'류진 검수'},seed:7919,limitMs:15000}).payload;return {battleV2:createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77})};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/api/mercenary-codex'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})));}
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){try{const rel=path.relative(root,file).replaceAll('\\','/');const bytes=execFileSync('git',['show','HEAD:'+rel],{cwd:root,windowsHide:true,maxBuffer:64e6,stdio:['ignore','pipe','ignore']});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);}catch{}}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=process.env.QA_WEBKIT==='1'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];

try{
 for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||[1440,390])){
  const context=await browser.newContext({...(process.env.QA_WEBKIT==='1'?devices['iPhone 13']:{}),viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],warnings=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/?screen=pvp',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{API_MODE=false;API_TOKEN='';localStorage.setItem(STORAGE_KEY,JSON.stringify({nickname:'류진 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));renderShell('buy');if(!document.getElementById('modal'))document.body.insertAdjacentHTML('beforeend','<div id="modal" class="modal"></div>');document.querySelector('[data-miracle-close]')?.click();});
  const data=payload('V-958'),runs=[];
  for(let repeat=0;repeat<2;repeat++){
   const started=Date.now();
   await page.evaluate(async({data,deck,field})=>{
    await ensureFeatureResources('battleV2');window.cnineCardCatalog=()=>deck;
    const api=ProjectVPixiBattle,original=api.mountForBattle;let engine;
    api.mountForBattle=async(...args)=>(engine=await original(...args));
    try{const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'류진 검수',opponentName:'검수 상대'});
     const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode:field,playerName:'류진 검수'});
     await engine.deployCards({instant:true,force:true});window.bc={engine,renderer};
    }finally{api.mountForBattle=original;}
   },{data,deck,field});
   await page.waitForFunction(()=>bc.engine.ryujinStates?.size===2&&[...bc.engine.ryujinStates.values()].every(s=>s.adapter.effects.aura.instances.size===1),null,{timeout:60000});
   const readyMs=Date.now()-started;
   await page.evaluate(()=>{bc.frames=[];bc.running=true;let prev=performance.now();function frame(t){if(!bc.running)return;bc.frames.push(t-prev);prev=t;bc.raf=requestAnimationFrame(frame);}bc.raf=requestAnimationFrame(frame);});
   await page.waitForTimeout(1500);
   const setup=await page.evaluate(()=>({canvas:document.querySelectorAll('#modal canvas').length,states:[...bc.engine.ryujinStates.values()].map(s=>({id:s.actor.id,facing:s.actor.view.scale.x,autoUpdate:s.adapter.rig.autoUpdate,bodyVisible:s.actor.fullBodySprite.visible,aura:s.adapter.effects.aura.audit()}))}));
   assert.equal(setup.canvas,1);assert(setup.states.every(s=>s.autoUpdate===false&&s.bodyVisible===false&&s.aura.instances===1));
   if(!repeat)await page.screenshot({path:path.join(out,'idle-'+width+'.png')});
   if(process.env.QA_PROFILE==='1'){
    const profile=await page.evaluate(async()=>{
     const e=bc.engine,states=[...e.ryujinStates.values()],rows=[];
     const sample=()=>new Promise(resolve=>{let n=0,last=performance.now(),times=[];const o={prerender(){const now=performance.now();if(n++>3)times.push(now-last);last=now;if(n===24){e.app.renderer.runners.prerender.remove(o);times.sort((a,b)=>a-b);resolve({p50:times[10],p95:times.at(-1),samples:times.length});}}};e.app.renderer.runners.prerender.add(o);});
     const gl=e.app.renderer.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');
     for(const mode of ['approved','filters-off','ryujin-hidden']){for(const s of states){const it=s.adapter.effects.aura.instances.get(s.adapter);for(const f of [it.outline,it.groundLight,it.mist,it.bladeOutline])f.enabled=mode==='approved';s.actor.view.visible=mode!=='ryujin-hidden';}rows.push({mode,...await sample()});}
     for(const s of states){s.actor.view.visible=true;const it=s.adapter.effects.aura.instances.get(s.adapter);for(const f of [it.outline,it.groundLight,it.mist,it.bladeOutline])f.enabled=true;}
     return {rows,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    });fs.writeFileSync(path.join(out,'renderer-profile.json'),JSON.stringify(profile,null,2));console.log(JSON.stringify(profile));
   }
   const basic=['attack_basic','skill_double_cut','skill_thrust'];
   const skills={'MS-1109':['skill_dash','skill_launch','skill_return','skill_wave','skill_vortex','skill_helix','skill_air_slam','skill_crescent','skill_return_chase'],'MS-1110':['skill_orbit','skill_twin','skill_cross'],'MS-1111':['skill_finisher']};
   const actions=process.env.QA_PROFILE==='1'?[]:repeat?['attack_basic','skill_finisher']:width===1440?[...basic,...Object.values(skills).flat()]:['attack_basic','skill_wave','skill_twin','skill_finisher'];
   const outcomes=[];
   for(const action of actions){
    const skillId=Object.keys(skills).find(k=>skills[k].includes(action));
    await page.evaluate(({action,skillId,basic,repeat})=>{
     const e=bc.engine,s=[...e.ryujinStates.values()][repeat?1:0],targets=repeat?e.allies:e.enemies;
     for(const target of targets){target.setHp(100);target.setState('IDLE');}
     bc.applied=[];const original=e.syncTargetHp;e.syncTargetHp=function(t,v){bc.applied.push(t.id);return original.call(this,t,v);};
     bc.start={x:s.actor.root.x,y:s.actor.root.y};bc.actor=s.actor;
     if(!skillId)s.basicCount=basic.indexOf(action);
     const work=skillId?e.playMercenaryEvent({type:'MERCENARY_RYUJIN_AREA',battleMode:'PVE',actorId:s.actor.id,skillId,visualMode:action,hits:targets.map(t=>({targetId:t.id,damage:10,absorbed:5,targetHpAfter:t.serverMaxHp*.9,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))}):e.normalAttack(0,{attacker:s.actor,target:targets[0],damage:10,targetHp:90});
     bc.work=Promise.resolve(work).finally(()=>{e.syncTargetHp=original;});
    },{action,skillId,basic,repeat});
    if(action==='skill_finisher'&&!repeat){await page.waitForTimeout(3300);await page.screenshot({path:path.join(out,'finisher-'+width+'.png')});}
    const result=await page.evaluate(async()=>{await bc.work;const e=bc.engine,s=e.ryujinStates.get(bc.actor);return {last:e.lastMercenaryPlayback,applied:bc.applied,home:bc.start,end:{x:s.actor.root.x,y:s.actor.root.y},busy:s.adapter.busy,effect:s.adapter.effects.session?.audit()||null,pose:s.adapter.entry.animation.name};});
    assert.equal(result.last.code,'V-958');assert.equal(result.last.mode,action);assert.equal(result.last.spineAutoUpdate,false);assert.equal(result.last.clockOwner,'V3_REGISTERED_GSAP');
    const count=skillId?5:1;assert.equal(result.applied.length,count);assert.equal(new Set(result.applied).size,count);assert.equal(result.last.damageApplications,count);
    assert.deepEqual(result.home,result.end);assert.equal(result.busy,false);assert.equal(result.effect,null);assert.equal(result.pose,'idle');outcomes.push({action,...result});
   }
   const lifecycle=await page.evaluate(async()=>{
    const e=bc.engine,s=[...e.ryujinStates.values()][0],target=e.enemies[0];target.setHp(100);let impacts=0;
    const p=e.normalAttack(0,{attacker:s.actor,target,damage:1,targetHp:80,onImpact:()=>impacts++});e.cancelTimelines();await p;
    const cancelled={impacts,busy:s.adapter.busy,session:s.adapter.effects.session?.audit()||null};
    await e.setVisible(false);await e.setVisible(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const resumed={ambient:!!s.adapter.ambient,instances:s.adapter.effects.aura.instances.size};
    bc.running=false;cancelAnimationFrame(bc.raf);const sorted=bc.frames.slice(2).sort((a,b)=>a-b),frame={samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),over33:sorted.filter(x=>x>33.34).length,over50:sorted.filter(x=>x>50).length};
    bc.renderer.destroy();await ProjectVPixiBattle.whenReleased();const first=s.adapter.renderCount;await new Promise(r=>setTimeout(r,120));
    return {cancelled,resumed,frame,exit:{canvases:document.querySelectorAll('#modal canvas').length,loops:e.simpleTimelines.size,states:e.ryujinStates.size,updates:s.adapter.renderCount-first}};
   });
   assert.equal(lifecycle.cancelled.impacts,0);assert.equal(lifecycle.cancelled.session,null);assert.equal(lifecycle.resumed.ambient,true);assert.equal(lifecycle.resumed.instances,1);assert.deepEqual(lifecycle.exit,{canvases:0,loops:0,states:0,updates:0});
   runs.push({repeat,readyMs,setup,outcomes,lifecycle});console.log(JSON.stringify({width,repeat,readyMs,frame:lifecycle.frame,exit:lifecycle.exit}));
  }
  await page.goto(base+'/mercenary-codex/?view=limited&q='+encodeURIComponent('류진')+'&rank=SSS#V-958',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('inspection')?.textContent.includes('류진'),null,{timeout:20000});
  if(width<=760)await page.locator('.roster-row[data-code="V-958"]').click();
  await page.locator('#inspection .combat-details > summary').click();const codex=await page.locator('#inspection').innerText();assert(codex.includes('4,000,000'));assert(codex.includes('종결'));
  await page.screenshot({path:path.join(out,'codex-'+width+'.png'),fullPage:true});assert.deepEqual(errors,[]);
  reports.push({width,runs,codex,warnings});await context.close();
 }
 fs.writeFileSync(path.join(out,(process.env.QA_WEBKIT==='1'?'webkit':'chromium')+'-battle.json'),JSON.stringify({ok:true,reports,missing,productionTransactions:0,conditions:'Windows headless browser; mobile viewport/device emulation; local assets and server-generated combat fixtures, no physical phone'},null,2));
}catch(e){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:e.stack,missing,reports},null,2));throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

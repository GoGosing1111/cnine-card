import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),probe=process.argv.includes('--probe');
const out=process.env.MERCENARY_VISUAL_QA_OUTPUT||path.join(os.tmpdir(),'mercenary-visual-lifecycle-20261015');fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const samples={};
for(const code of ['V-988','V-999']){
 const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};
 const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:mercenary.name},seed:7919,limitMs:15000});
 const event=hunt.payload.battleV2.result.timeline.find(e=>e.type===`MERCENARY_${code==='V-988'?'KAIRON':'HELIOS'}_AREA`&&e.hits.length===12);assert(event);
 const payload=structuredClone(hunt.payload);payload.battleV2.result.timeline=[];
 const merc={...mercenary,id:'A:MERCENARY:'+code,cardId:code,hp:100,maxHp:100,shield:0,maxShield:0};
 const pvp={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
 const enemy=structuredClone(pvp);enemy.battleV2.teams.A.mercenaries=[];enemy.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:'+code}];
 samples[code]={payload,event,pvp,enemy};
}
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const params=new URLSearchParams(location.search),code=params.get('code'),mode=params.get('mode'),data=await fetch('/qa-data?'+params).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=mode==='area'?'HUNT':'PVP',prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:field});
 const renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>4;
 const actor=engine.mercenaries.find(a=>a.cardId===code),state=code==='V-988'?engine.kaironStates.get(actor):engine.heliosStates.get(actor);
 window.VisualQA={engine,renderer,actor,state,event:data.event,code,mode,ready:true};
 }catch(e){window.qaError=e.stack;}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),code=url.searchParams.get('code'),mode=url.searchParams.get('mode');
 const send=(type,data)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);};
 if(url.pathname==='/qa.html')return send('text/html; charset=utf-8',baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${mode==='area'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,'<body><main id="lab-modal"></main></body>'));
 if(url.pathname==='/qa-boot.js')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify({deck,event:samples[code].event,payload:mode==='area'?samples[code].payload:mode==='enemy'?samples[code].enemy:samples[code].pvp}));
 if(url.pathname.startsWith('/api/'))return send('application/json','{"enabled":false,"items":[]}');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const viewport of (probe?[{width:1440,height:1000}]:[{width:1440,height:1000},{width:390,height:844}]))for(const [code,mode] of [['V-988','basic'],['V-988','enemy'],['V-988','area'],['V-999','area']]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base+'/qa.html?code='+code+'&mode='+mode);await page.waitForFunction(()=>window.VisualQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  await page.evaluate(()=>{
   const q=VisualQA,e=q.engine;q.damage=[];q.hp=[];
   const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(target,data)=>{q.damage.push(target.id);return show(target,data);};
   const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(target,hp)=>{q.hp.push(target.id);return sync(target,hp);};
   const timeline=e.timeline.bind(e);e.timeline=(build,cleanup,rate,options)=>timeline(tl=>{build(tl);if(options?.owners?.includes(q.actor)){q.timeline=tl;q.timing={releaseAt:options.releaseAt,duration:tl.duration(),fixedRate:rate};tl.call(()=>{q.capture=true;tl.pause();},[],.025);}},cleanup,rate,options);
   q.start=()=>{q.done=false;q.capture=false;q.promise=q.mode==='area'?e.playEvents([q.event],{timedInternal:true}):e.normalAttack(0,{attacker:q.actor,target:(q.actor.team==='ALLY'?e.enemies:e.allies)[0],damage:23,targetHp:77});q.promise.then(()=>q.done=true).catch(error=>q.error=error.stack);};
   q.inspect=()=>{const s=q.actor.fullBodySprite;return {bodyHeight:s.height,bodyWidth:s.width,visible:s.visible,renderable:s.renderable,alpha:s.alpha,viewAlpha:q.actor.view.alpha,textureWidth:s.texture.width,idleTexture:s.texture===q.actor.fullBodyRestPose.texture,direction:Math.sign(q.actor.view.scale.x),busy:q.state.busy,done:q.done,fx:q.state.fx.pool.filter(s=>s.visible&&s.alpha>.05).length,hpCalls:q.hp.length,damageCalls:q.damage.length};};q.start();
  });
  await page.waitForFunction(()=>VisualQA.capture||VisualQA.error,null,{timeout:15000});assert.equal(await page.evaluate(()=>VisualQA.error),undefined);
  const result=await page.evaluate(()=>{
   const q=VisualQA,contact=q.mode==='area'?(q.code==='V-988'?3.25:2.48)/2.6:.955/2.6,peak=q.mode==='area'?contact+.45:contact+.02;
   const before=q.inspect();q.timeline.time(peak,false);return {timing:{...q.timing,timeScale:q.timeline.timeScale()},before,peak:q.inspect(),peakTime:peak};
  });
  await page.screenshot({path:path.join(out,`${viewport.width}-${code}-${mode}-impact.png`),fullPage:true,animations:'disabled'});
  const finish=await page.evaluate(async()=>{const q=VisualQA;await Promise.resolve();const earlyReleased=q.done;q.timeline.time(q.timeline.duration(),false);await q.promise;return {earlyReleased,final:q.inspect(),last:q.engine.lastMercenaryPlayback};});
  await page.screenshot({path:path.join(out,`${viewport.width}-${code}-${mode}-idle.png`),fullPage:true,animations:'disabled'});
  // A second shot followed by a normal next action settles the old tail. Its
  // cleanup must restore the original idle texture before generic idle tweens.
  let repeated;
  if(code==='V-988'&&mode!=='area'){
   await page.evaluate(()=>VisualQA.start());await page.waitForFunction(()=>VisualQA.capture||VisualQA.error);
   repeated=await page.evaluate(async()=>{const q=VisualQA;q.timeline.time(.955/2.6+.06,false);await Promise.resolve();q.engine.settlePendingTails([q.actor]);await q.promise;return q.inspect();});
  }
  const cancelled=await page.evaluate(()=>{const q=VisualQA;q.engine.cancelTimelines();return {stopped:q.state.stopped,ambient:!!q.state.ambient,pool:q.state.fx.pool.some(p=>p.visible),body:q.inspect()};});
  const check={width:viewport.width,code,mode,...result,...finish,repeated,cancelled};checks.push(check);
  if(!probe){
   for(const body of [result.before,result.peak,finish.final,repeated,cancelled.body].filter(Boolean)){assert(body.bodyHeight>250,`${code} ${mode}: body shrank to ${body.bodyHeight}`);assert(body.visible&&body.renderable&&body.alpha>.9);assert.equal(body.direction,mode==='enemy'?-1:1);}
   assert.equal(finish.final.hpCalls,mode==='area'?12:1);assert.equal(finish.final.damageCalls,mode==='area'?12:1);
   if(code==='V-988'){assert(finish.final.idleTexture);assert(cancelled.body.idleTexture);if(repeated)assert(repeated.idleTexture);}
   if(mode==='area'){assert.equal(result.timing.releaseAt,null);assert.equal(result.timing.timeScale,1);assert.equal(finish.earlyReleased,false);assert(result.peak.fx>0);}
   assert.equal(cancelled.stopped,true);assert.equal(cancelled.ambient,false);assert.equal(cancelled.pool,false);
  }
  console.log(JSON.stringify({width:viewport.width,code,mode,passed:!probe}));
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({probe,checks,errors},null,2)+'\n');console.log(JSON.stringify({passed:!probe,scenarios:checks.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

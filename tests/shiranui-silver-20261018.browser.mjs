// Local isolated fixtures only. No production account, economy, or CMS writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.SHIRANUI_QA_OUTPUT||path.join(root,'docs/qa/shiranui-silver-20261018');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=catalog.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const mercenary={...limitedDeploymentSnapshot('V-987'),combat:fixture.combat};
const hunt=createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'시라누이'},seed:7919,limitMs:15000});
const areaEvent=hunt.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_SHIRANUI_AREA'&&e.hits.length===12);assert(areaEvent);
const areaPayload=structuredClone(hunt.payload);areaPayload.battleV2.result.timeline=[];
const merc={...mercenary,id:'A:MERCENARY:V-987',cardId:'V-987',hp:100,maxHp:100,shield:0,maxShield:0};
const pvpPayload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc]},B:{cards:deck}},result:{timeline:[]}}};
const enemyPayload=structuredClone(pvpPayload);enemyPayload.battleV2.teams.A.mercenaries=[];enemyPayload.battleV2.teams.B.mercenaries=[{...merc,id:'B:MERCENARY:V-987'}];
const baseHtml=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const mode=new URLSearchParams(location.search).get('mode'),data=await fetch('/qa-data?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),field=['area','skill','reduced'].includes(mode)?'HUNT':'PVP',prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:field,playerName:'시라누이',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:field,playerName:'시라누이'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>1;
 window.ShiranuiQA={engine,renderer,event:data.event,mode,ready:true};document.getElementById('health').textContent='실제 V3 전투 연결 완료';
 }catch(e){window.qaError=e.stack;console.error(e);}});`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),mode=url.searchParams.get('mode');
 if(url.pathname==='/qa/battle'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(baseHtml.replace('<script defer src="preview.bundle.js"></script>',`<script defer src="${['area','skill','reduced'].includes(mode)?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script defer src="/qa-boot.js"></script>`).replace(/<body>[\s\S]*<\/body>/,`<body><header><small>SSS LIMITED · DESIGNATED ACCOUNT</small><h1>시라누이 · ${mode==='area'?'망령 포대':'AR 연발 사격'}</h1><p>카이론 동일 밸런스 · 일반 획득 불가</p></header><nav class="toolbar"><span id="health">V3 전장 연결 중</span></nav><main id="lab-modal"></main></body>`));
 }
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 if(url.pathname==='/qa-data')return json(res,{deck,payload:['area','skill','reduced'].includes(mode)?areaPayload:mode==='enemy'?enemyPayload:pvpPayload,event:mode==='area'?areaEvent:null});
 if(url.pathname.startsWith('/api/'))return json(res,{items:[],visible:false,enabled:false});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message},500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  for(const mode of (process.env.SHIRANUI_QA_MODES||'basic,skill,enemy,area,reduced').split(',')){
   const p=await browser.newPage({viewport,serviceWorkers:'block',recordVideo:{dir:out,size:viewport}});p.on('pageerror',e=>errors.push(label+' '+mode+': '+e.message));
   await p.goto(base+'/qa/battle?mode='+mode);await p.waitForFunction(()=>window.ShiranuiQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.qaError),undefined);
   if(['skill','area','reduced'].includes(mode))await p.evaluate(async()=>{
    const image=new Image();image.src='/assets/ui/project-v/mercenaries/shiranui-fx-20261018/dialogue.webp';await image.decode();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   });
   await p.evaluate(()=>{
    const q=window.ShiranuiQA,e=q.engine,a=e.mercenaries[0],s=e.shiranuiStates.get(a);q.actor=a;q.hpCalls=[];q.damageCalls=[];
    s.fx.updateBodyAura({time:0});q.center0=s.fx.bodyAuraPosition;s.fx.updateBodyAura({time:2});q.center2=s.fx.bodyAuraPosition; if(q.mode==='skill'||q.mode==='reduced')s.basicCount=2;if(q.mode==='reduced'){e.reducedMotion=true;s.fx.reducedMotion=true;}
    const sync=e.syncTargetHp.bind(e);e.syncTargetHp=(t,h)=>{q.hpCalls.push({id:t.id,hp:h});return sync(t,h);};
    const show=e.showAccountBattleUnitDamage.bind(e);e.showAccountBattleUnitDamage=(t,d)=>{q.damageCalls.push(t.id);return show(t,d);};
    const timeline=e.timeline.bind(e),contact=(q.mode==='area'?2.5:(q.mode==='skill'||q.mode==='reduced')?.51:.35)/2.6;
    q.originalTimeline=timeline;
    e.timeline=(build,cleanup,rate,options)=>timeline(t=>{build(t);if(options?.owners?.includes(a)){q.timeline=t;t.call(()=>{q.contact=true;t.pause();},[],contact);}},cleanup,rate,options);
    q.promise=q.mode==='area'?e.playMercenaryEvent(q.event):e.normalAttack(0,{attacker:a,target:(a.team==='ALLY'?e.enemies:e.allies)[0],damage:23,targetHp:77});
    Promise.resolve(q.promise).catch(error=>q.error=error.stack);
   });
   await p.waitForFunction(()=>window.ShiranuiQA.contact||window.ShiranuiQA.error,null,{timeout:20000});
   const result=await p.evaluate(()=>{const q=window.ShiranuiQA,fx=q.engine.shiranuiStates.get(q.actor).fx;return {error:q.error,hpCalls:q.hpCalls,damageCalls:q.damageCalls,center0:q.center0,center2:q.center2,fx:fx.diagnostics(),direction:q.actor.view.scale.x,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(result.error,undefined);assert.equal(result.overflow,false);assert.deepEqual(result.center0,result.center2);assert.equal(result.fx.bodyAuraVisible,true);assert.equal(result.fx.auraVisible,true);assert.equal(result.fx.rifleShots,mode==='area'?25:(mode==='skill'||mode==='reduced')?30:9);assert(result.fx.contacts.filter(c=>c.kind==='RIFLE').every(c=>Math.sign(Math.cos(c.angle))===(mode==='enemy'?-1:1)));
   assert.equal(result.hpCalls.length,mode==='area'?12:1);assert.equal(new Set(result.hpCalls.map(r=>r.id)).size,result.hpCalls.length);assert.equal(result.damageCalls.length,mode==='area'?12:1);
   assert.equal(Math.sign(result.direction),mode==='enemy'?-1:1);assert.equal(result.fx.damageAuthority,'SERVER_ONLY');
   await p.screenshot({path:path.join(out,label+'-'+mode+'.png'),fullPage:true});
   assert.equal(result.fx.silverVersion,'SHIRANUI_SILVER_FX_20261018_V2');
   assert.equal(result.fx.dialogue.visible,['skill','area','reduced'].includes(mode));
   if(['skill','reduced'].includes(mode)){
    const sample=await p.evaluate(()=>{
     const q=window.ShiranuiQA,fx=q.engine.shiranuiStates.get(q.actor).fx,rail=document.querySelector('.jinmu-dialogue-rail');
     const top=q.engine.host.getBoundingClientRect().top,bottom=rail.getBoundingClientRect().bottom;
     const samples=[.43,1.12,3.83,4.25].map(t=>{fx.clock.time=t;fx.render(t);return fx.diagnostics();});
     return {top,bottom,samples,body:fx.merc.fullBodySprite.texture.width,lines:rail.innerText};
    });
    assert(Math.abs(sample.top-sample.bottom)<1);assert(sample.samples[0].activeFrames.some(f=>f.key==='silver-tracer'&&f.frame<4&&f.alpha===1));
    assert(sample.samples[1].activeFrames.some(f=>f.key==='silver-tracer'&&f.frame>=4));
    const tail=await p.evaluate(()=>{const q=window.ShiranuiQA,fx=q.engine.shiranuiStates.get(q.actor).fx;fx.clock.time=fx.plan.rifleLaunches.at(-1)+.15;fx.render(fx.clock.time);return fx.diagnostics();});
    assert(tail.activeFrames.some(f=>f.key==='silver-tracer'&&f.frame>=4));assert(!tail.activeFrames.some(f=>f.key==='silver-tracer'&&f.frame<4));
    assert(sample.samples[2].activeFrames.some(f=>f.key==='silver-rupture'&&f.frame>=3));
    assert.equal(sample.samples[2].contacts.filter(c=>c.kind==='RIFLE').length,30);
    await p.evaluate(()=>{const q=window.ShiranuiQA,fx=q.engine.shiranuiStates.get(q.actor).fx;fx.clock.time=3.83;fx.render(3.83);});
    await p.screenshot({path:path.join(out,label+'-'+mode+'-rupture.png'),fullPage:true});
    const widths=label==='mobile'?[320,390]:[1440];
    for(const width of widths){
     await p.setViewportSize({width,height:viewport.height});await p.waitForTimeout(120);
     const fit=await p.evaluate(()=>{
      const q=window.ShiranuiQA,d=q.engine.shiranuiStates.get(q.actor).fx.dialogue,rail=document.querySelector('.jinmu-dialogue-rail'),rect=rail.getBoundingClientRect(),heights=[];
      for(let i=0;i<d.profile.lines.length;i++){d.begin();d.rail.layout();heights.push({rail:rail.getBoundingClientRect().height,host:q.engine.host.getBoundingClientRect().top});}
      const copy=rail.querySelector('.jinmu-dialogue-copy').getBoundingClientRect(),frame=rail.querySelector('.jinmu-dialogue-frame').getBoundingClientRect();
      return {heights,overflow:document.documentElement.scrollWidth>innerWidth+1,inside:copy.left>=rect.left&&copy.right<=rect.right,text:{left:copy.left,top:copy.top,bottom:copy.bottom,right:copy.right},frame:{top:frame.top,bottom:frame.bottom},transform:getComputedStyle(rail.querySelector('.jinmu-dialogue-copy')).transform};
     });
     assert.equal(fit.overflow,false);assert(fit.inside);assert(fit.heights.every(h=>h.host===fit.heights[0].host&&h.rail===fit.heights[0].rail));
     assert.equal(fit.transform,'matrix(1, 0, 0, 1, 0, -5)');
     await p.screenshot({path:path.join(out,label+'-'+mode+'-'+width+'.png'),fullPage:true});
    }
    await p.setViewportSize(viewport);
    const mixed=await p.evaluate(()=>{
     const q=window.ShiranuiQA,d=q.engine.shiranuiStates.get(q.actor).fx.dialogue,rail=d.rail;
     const other=new d.constructor(q.engine,{...d.profile,code:'QA:JOKRO',theme:'jokro',name:'족로',skill:'청룡단천'});
     const positions=[];
     for(const speaker of [other,d,other,d]){speaker.begin();rail.layout();positions.push(q.engine.host.getBoundingClientRect().top);}
     other.destroy();return {positions,rails:document.querySelectorAll('.jinmu-dialogue-rail').length};
    });
    assert(mixed.positions.every(top=>top===mixed.positions[0]));assert.equal(mixed.rails,1);
    await p.evaluate(()=>{const t=window.ShiranuiQA.timeline;t.time(t.time()+.001,true).resume();});
    await p.waitForTimeout(2200);
    if(mode==='skill'){
     // Record an uninterrupted live replay at the actual 2.6x combat rate.
     await p.evaluate(()=>{
      const q=window.ShiranuiQA,e=q.engine,s=e.shiranuiStates.get(q.actor);e.timeline=q.originalTimeline;s.basicCount=2;
      q.replay=e.normalAttack(0,{attacker:q.actor,target:e.enemies[0],damage:0,targetHp:77});
     });await p.waitForTimeout(2100);
    }
    assert.equal(await p.evaluate(()=>window.ShiranuiQA.hpCalls.length),mode==='skill'?2:1);
   }
   if(mode==='area'){await p.evaluate(()=>{const t=window.ShiranuiQA.timeline;t.time(t.time()+.001,true).resume();});await p.waitForFunction(()=>window.ShiranuiQA.engine.lastMercenaryPlayback?.mode==='ultimate');assert.equal(await p.evaluate(()=>window.ShiranuiQA.hpCalls.length),12);}
   const cancelled=await p.evaluate(()=>{const q=window.ShiranuiQA;q.engine.cancelTimelines();const s=q.engine.shiranuiStates.get(q.actor);return {stopped:s.stopped,ambient:!!s.ambient,pool:s.fx.pool.some(p=>p.visible),hpCalls:q.hpCalls.length};});
   assert.deepEqual(cancelled,{stopped:true,ambient:false,pool:false,hpCalls:mode==='area'?12:mode==='skill'?2:1});checks.push({label,mode,...result,cancelled});
   const resumed=await p.evaluate(async()=>{const q=window.ShiranuiQA,e=q.engine;await e.setVisible(true);const s=e.shiranuiStates.get(q.actor);const result={ambient:!!s.ambient,halo:s.fx.haloBack.visible,banner:s.fx.bodyAuraBack.visible};e.clearMercenaryActors();return {...result,cleared:e.shiranuiStates.size===0,effects:e.effectLayer.children.filter(c=>c.label==='BallisticArtilleryFX').length,rails:document.querySelectorAll('.jinmu-dialogue-rail').length};});assert.deepEqual(resumed,{ambient:true,halo:true,banner:true,cleared:true,effects:0,rails:0});const video=p.video();await p.close();if(video)await video.saveAs(path.join(out,label+'-'+mode+'.webm'));
  }
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'PASS',scenarios:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

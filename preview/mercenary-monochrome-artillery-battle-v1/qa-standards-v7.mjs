import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),root='http://127.0.0.1:8877/preview/mercenary-monochrome-artillery-battle-v1/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report={version:7,errors:[],screens:[]};
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1080}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport}),rejectedRequests=[];p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});p.on('request',r=>{if(/(?:white-tiger|ballistic-aura-v4).*\.png/.test(r.url()))rejectedRequests.push(r.url());});
  await p.goto(root+'?revision=shiranui-spectral-standards-v7');await p.waitForFunction(()=>window.BallisticPreview?.diagnostics().ready,null,{timeout:60000});
  const stability=await p.evaluate(()=>{
   const {fx,merc,engine}=BallisticPreview,positions=[],roots=[],frames=[],basePoints=new Set(),topPoints=new Set();let maxPoleError=0;
   fx.pause();
   for(let i=0;i<120;i++){
    fx.ambientOffset=i<60?0:6;fx.seek((i%60)*.1);positions.push(JSON.stringify(fx.bodyAuraPosition));roots.push(JSON.stringify({x:merc.root.x,y:merc.root.y}));frames.push(fx.bodyAuraFrame);
    for(const a of fx.bodyAuraPoleChecks){maxPoleError=Math.max(maxPoleError,a.error);basePoints.add(a.side+':'+a.base.x.toFixed(6)+','+a.base.y.toFixed(6));topPoints.add(a.side+':'+a.top.x.toFixed(6)+','+a.top.y.toFixed(6));}
   }
   fx.ambientOffset=0;fx.seek(2.35);const before=fx.bodyAuraFrame;document.querySelector('[data-mode="skill"]').click();fx.pause();fx.seek(0);
   const b=fx.bodyAuraBounds;
   return{positions:new Set(positions).size,roots:new Set(roots).size,frames:new Set(frames).size,basePoints:basePoints.size,topPoints:topPoints.size,maxPoleError,continuityError:Math.abs(before-fx.bodyAuraFrame),rearOnly:fx.bodyAuraBack.zIndex<merc.fullBodySprite.zIndex&&!fx.bodyAuraFront.visible,bounds:b,unclipped:b.left>=0&&b.top>=0&&b.right<=engine.scene.width&&b.bottom<=engine.scene.height};
  });
  assert.equal(stability.positions,1);assert.equal(stability.roots,1);assert.equal(stability.basePoints,2);assert.equal(stability.topPoints,2);assert.ok(stability.maxPoleError<1e-6);assert.ok(stability.frames>100);assert.ok(stability.continuityError<1e-6);assert.equal(stability.rearOnly,true);assert.equal(stability.unclipped,true);
  for(const [mode,t]of [['aura',0],['aura',3],['aura',5.9],['skill',1.45],['ultimate',2.3]]){
   await p.locator('[data-mode="'+mode+'"]').click();await p.evaluate(t=>{BallisticPreview.fx.ambientOffset=0;BallisticPreview.fx.seek(t);},t);
   assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible&&!BallisticPreview.fx.bodyAuraFront.visible&&BallisticPreview.fx.haloBack.visible),true);
   await p.locator('.battle-viewport').screenshot({path:file('qa/standards-v7/'+name+'-'+mode+'-'+t+'.png')});
  }
  await p.locator('[data-mode="aura"]').click();await p.evaluate(()=>{BallisticPreview.fx.ambientOffset=0;BallisticPreview.fx.seek(3);});
  const frameBox=await p.locator('iframe').boundingBox(),clip=await p.evaluate(()=>{
   const {merc,engine,fx}=BallisticPreview,rect=engine.app.canvas.getBoundingClientRect(),screen=engine.app.screen,lo=merc.view.toGlobal({x:-fx.bodyHeight,y:-1.6*fx.bodyHeight}),hi=merc.view.toGlobal({x:fx.bodyHeight,y:.15*fx.bodyHeight});
   return{x:rect.x+lo.x*rect.width/screen.width,y:rect.y+lo.y*rect.height/screen.height,width:(hi.x-lo.x)*rect.width/screen.width,height:(hi.y-lo.y)*rect.height/screen.height};
  });
  clip.x+=frameBox.x;clip.y+=frameBox.y;await p.screenshot({path:file('qa/standards-v7/'+name+'-character-detail.png'),clip});
  await p.screenshot({path:file('qa/standards-v7/'+name+'-page.png'),fullPage:true});
  for(const speed of ['.25','.5','1','2']){await p.selectOption('#speed',speed);assert.equal(await p.evaluate(()=>BallisticPreview.fx.speed),Number(speed));}
  await p.selectOption('#speed','1');await p.locator('summary').click();await p.locator('#motion-only').check();assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),false);await p.locator('#motion-only').uncheck();
  await p.locator('#aura').uncheck();assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible||BallisticPreview.fx.haloBack.visible),false);await p.locator('#aura').check();
  await p.locator('#reduced').check();await p.evaluate(()=>BallisticPreview.fx.seek(2));assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraFrame),0);await p.locator('#reduced').uncheck();
  for(const scenario of ['interrupt','lost']){await p.selectOption('#scenario',scenario);await p.evaluate(()=>BallisticPreview.fx.seek(3));assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),false);}
  await p.selectOption('#scenario','normal');
  await p.exposeFunction('saveReview',async data=>fs.writeFile(file('qa/standards-v7/'+name+'-showcase.webm'),Buffer.from(data,'base64')));
  await p.evaluate(()=>{
   const stream=BallisticPreview.engine.app.canvas.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3600000});
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   window.stopReview=()=>new Promise(resolve=>{rec.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));await window.saveReview(btoa(binary));stream.getTracks().forEach(t=>t.stop());resolve();};rec.stop();});
   BallisticPreview.fx.ambientOffset=0;rec.start();
  });
  await p.locator('#showcase').click();await p.waitForFunction(()=>BallisticPreview.queue.completed,null,{timeout:30000});await p.evaluate(()=>window.stopReview());
  const cleanup=await p.evaluate(()=>{const {fx}=BallisticPreview;fx.cancel();const hidden=!fx.bodyAuraBack.visible&&!fx.bodyAuraFront.visible&&!fx.haloBack.visible;BallisticPreview.dispose();return{hidden,destroyed:fx.bodyAuraBack.destroyed&&fx.bodyAuraFront.destroyed};});
  assert.deepEqual(cleanup,{hidden:true,destroyed:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(rejectedRequests,[]);
  report.screens.push({name,viewport,stability,cleanup,rejectedRequests});await p.close();console.log(name+' spectral standards V7 PASS');
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';report.bundleLfSha256=createHash('sha256').update((await fs.readFile(file('preview.bundle.js'),'utf8')).replaceAll('\r\n','\n')).digest('hex');
}finally{await fs.writeFile(file('qa/standards-v7/runtime-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}

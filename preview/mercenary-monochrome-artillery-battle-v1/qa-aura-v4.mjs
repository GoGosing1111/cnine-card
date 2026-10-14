import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),root='http://127.0.0.1:8877/preview/mercenary-monochrome-artillery-battle-v1/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report={version:4,errors:[],screens:[]};
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1080}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport});p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  await p.goto(root);await p.waitForFunction(()=>window.BallisticPreview?.diagnostics().ready,null,{timeout:60000});
  const stability=await p.evaluate(()=>{
   const {fx,merc}=BallisticPreview,positions=[],sizes=[],roots=[],frames=[];
   fx.pause();fx.ambientOffset=0;
   for(let i=0;i<120;i++){fx.seek(i*.05);positions.push(JSON.stringify(fx.bodyAuraPosition));sizes.push(fx.bodyAuraSprites[0].width);roots.push(JSON.stringify({x:merc.root.x,y:merc.root.y}));frames.push(fx.bodyAuraFrame);}
   const before=fx.bodyAuraFrame;document.querySelector('[data-mode="skill"]').click();fx.pause();
   const continuityError=Math.abs(before-fx.bodyAuraFrame);
   return{positions:new Set(positions).size,sizes:new Set(sizes).size,roots:new Set(roots).size,frames:new Set(frames).size,continuityError,depth:fx.bodyAuraBack.zIndex<fx.haloBack.zIndex&&fx.haloBack.zIndex<merc.fullBodySprite.zIndex};
  });
  assert.equal(stability.positions,1);assert.equal(stability.sizes,1);assert.equal(stability.roots,1);assert.ok(stability.frames>100);assert.ok(stability.continuityError<.001);assert.equal(stability.depth,true);
  for(const [mode,t]of [['aura',0],['aura',3],['aura',5.9],['skill',1.45],['ultimate',2.3]]){
   await p.locator('[data-mode="'+mode+'"]').click();await p.evaluate(t=>{BallisticPreview.fx.ambientOffset=0;BallisticPreview.fx.seek(t);},t);
   assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),true);
   await p.locator('.battle-viewport').screenshot({path:file('qa/aura-v4/'+name+'-'+mode+'-'+t+'.png')});
  }
  await p.screenshot({path:file('qa/aura-v4/'+name+'-page.png'),fullPage:true});
  await p.locator('summary').click();await p.locator('#motion-only').check();assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),false);await p.locator('#motion-only').uncheck();
  await p.locator('#aura').uncheck();assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),false);await p.locator('#aura').check();
  await p.locator('#reduced').check();await p.evaluate(()=>BallisticPreview.fx.seek(2));assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraFrame),0);await p.locator('#reduced').uncheck();
  for(const scenario of ['interrupt','lost']){await p.selectOption('#scenario',scenario);await p.evaluate(()=>BallisticPreview.fx.seek(3));assert.equal(await p.evaluate(()=>BallisticPreview.fx.bodyAuraBack.visible),false);}
  await p.selectOption('#scenario','normal');await p.selectOption('#speed','1');
  await p.exposeFunction('saveReview',async data=>fs.writeFile(file('qa/aura-v4/'+name+'-showcase.webm'),Buffer.from(data,'base64')));
  await p.evaluate(()=>{
   const stream=BallisticPreview.engine.app.canvas.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3600000});
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   window.stopReview=()=>new Promise(resolve=>{rec.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));await window.saveReview(btoa(binary));stream.getTracks().forEach(t=>t.stop());resolve();};rec.stop();});
   BallisticPreview.fx.ambientOffset=0;rec.start();
  });
  await p.locator('#showcase').click();await p.waitForFunction(()=>BallisticPreview.queue.completed,null,{timeout:30000});await p.evaluate(()=>window.stopReview());
  const cleanup=await p.evaluate(()=>{const {fx}=BallisticPreview;fx.cancel();const hidden=!fx.bodyAuraBack.visible&&!fx.haloBack.visible;BallisticPreview.dispose();return{hidden,destroyed:fx.bodyAuraBack.destroyed};});
  assert.deepEqual(cleanup,{hidden:true,destroyed:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.screens.push({name,viewport,stability,cleanup});await p.close();console.log(name+' ballistic aura V4 PASS');
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';report.bundleLfSha256=createHash('sha256').update((await fs.readFile(file('preview.bundle.js'),'utf8')).replaceAll('\r\n','\n')).digest('hex');
}finally{await fs.writeFile(file('qa/aura-v4/runtime-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}

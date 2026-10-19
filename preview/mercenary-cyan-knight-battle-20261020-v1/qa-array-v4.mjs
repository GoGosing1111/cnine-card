import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {MODES,sample} from './motion.mjs';
import {impactEvents,phantomTracks,traceSegments,cornerEvents} from './array-motion-v4.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=new URL('./',import.meta.url),qa=new URL('qa/array-v4/',root),hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(qa,{recursive:true});
const scope=JSON.parse(await fs.readFile(new URL('array-v4-scope.json',root))),m=JSON.parse(await fs.readFile(new URL('manifest.json',root)));
for(const f of scope.files)assert.equal(hash(await fs.readFile(new URL(f.file,root))),f.sha256,'Preserved asset '+f.file);
const priorSource=execFileSync('git',['show',scope.commit+':preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs'],{cwd:fileURLToPath(root),encoding:'utf8'});
const prior=await import('data:text/javascript;base64,'+Buffer.from(priorSource).toString('base64'));
let preservedSamples=0;
for(const mode of ['horizon','flurry','meteor','zenith'])for(let t=0;t<=MODES[mode].duration;t+=.05){assert.deepEqual(sample(mode,t),prior.sample(mode,t),mode+' unchanged at '+t);preservedSamples++;}
let flightLegs=0,curvedLegs=0,diagonalLegs=0,orthogonalLegs=0;
for(const track of phantomTracks)for(let i=1;i<track.length;i++){
 const a=track[i-1],b=track[i];assert.ok(b.at>=a.at,'Monotonic track');
 const dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y);if(dx+dy<1e-8&&!b.curve)continue;
 if(b.curve){assert.ok(Object.values(b.curve).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));curvedLegs++;}else if(dx>1e-8&&dy>1e-8)diagonalLegs++;else orthogonalLegs++;flightLegs++;
}
assert.ok(curvedLegs>=20&&diagonalLegs>=10&&orthogonalLegs>0,'Mix curved, diagonal and selected sharp routes');
assert.equal(impactEvents.length,20);assert.equal(traceSegments(MODES.array.duration,.31).length,0);
const impactGaps=impactEvents.slice(1).map((e,i)=>e.at-impactEvents[i].at);
assert.ok(Math.min(...impactGaps)>=.119,'Every sword has a separate impact beat');
assert.ok(impactEvents.slice(1).every((e,i)=>e.index!==impactEvents[i].index),'Interleave attackers');
assert.ok(new Set(impactEvents.map(e=>e.x.toFixed(3)+','+e.y.toFixed(3))).size>=16,'Different points on the target');
const offbeat=JSON.parse(await fs.readFile(new URL('orthogonal-offbeat/checks.json',qa)));
impactEvents.forEach((e,i)=>{assert.equal(e.index,offbeat.impactOrder[i].index);assert.ok(Math.abs(e.at-offbeat.impactOrder[i].time)<1e-8,'Preserve accepted offbeat timing');});
const bounds=[];
for(const w of m.summonedWeapons.frames){
 const {data,info}=await sharp(fileURLToPath(new URL(m.summonedWeapons.url,root))).extract({left:w.rect.x,top:w.rect.y,width:w.rect.width,height:w.rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const b={x:info.width,y:info.height,right:0,bottom:0};
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>48){b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.right=Math.max(b.right,x);b.bottom=Math.max(b.bottom,y);}
 assert.ok(b.x>1&&b.y>1&&b.right<info.width-2&&b.bottom<info.height-2,'Solid sword silhouette has alpha margin');bounds.push(b);
}
for(const a of [m.summonedWeapons,m.effects['rail-v4'],m.effects['snap-v4']])assert.equal(hash(await fs.readFile(new URL(a.url,root))),a.sha256,'Registered new asset hash');
const report={status:'PASS',visualApproval:false,preservedFiles:scope.files.length,preservedOtherSkillSamples:preservedSamples,flightLegs,curvedLegs,diagonalLegs,orthogonalLegs,preservedOffbeatTiming:true,cornerBrakes:cornerEvents.length,impacts:impactEvents.length,impactGaps,impactOrder:impactEvents.map(e=>({time:e.at,index:e.index,x:e.x,y:e.y,route:e.phase})),solidSwordBounds:bounds,devices:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 for(const device of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.name==='mobile',hasTouch:device.name==='mobile'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/');await page.waitForFunction(()=>window.CyanKnightPreview);
  const checks=await page.evaluate(({hits,bounds})=>{
   const {fx:f,engine:e}=CyanKnightPreview;f.setMode('array');
   const camera=()=>[e.stage.x,e.stage.y,e.stage.pivot.x,e.stage.pivot.y,e.stage.scale.x,e.stage.scale.y];
   const out={contacts:[],clipped:[],cameraChanges:[],maxRails:0,maxSnaps:0,overflow:document.documentElement.scrollWidth>innerWidth,autoZoom:f.zoom};
   for(const hit of hits){f.seek(hit.at);const d=f.diagnostics(),c=d.phantomContacts.find(c=>c.index===hit.index);out.contacts.push({time:hit.at,index:hit.index,intersects:!!c?.intersects,distance:c?.distance,groundError:d.groundError});}
   f.seek(0);const base=JSON.stringify(camera());
   for(let t=.10;t<4.56;t+=.01){
    f.seek(t);if(JSON.stringify(camera())!==base)out.cameraChanges.push(t);
    out.maxRails=Math.max(out.maxRails,f.array.segments.length);out.maxSnaps=Math.max(out.maxSnaps,f.array.snapPool.filter(s=>s.visible).length);
    f.swordPool.forEach((s,i)=>{if(!s.visible)return;const b=bounds[i],points=[[b.x,b.y],[b.right,b.y],[b.x,b.bottom],[b.right,b.bottom]].map(([x,y])=>s.toGlobal({x:x-s.anchor.x*s.texture.width,y:y-s.anchor.y*s.texture.height}));
     if(points.some(p=>p.x<0||p.x>e.app.screen.width||p.y<0||p.y>e.app.screen.height))out.clipped.push({time:Number(t.toFixed(2)),index:i});
    });
   }
   f.seek(2.4);f.setEffects(false);out.effectsOff=f.diagnostics();f.setEffects(true);f.cancel();out.cancel=f.diagnostics();return out;
  },{hits:impactEvents,bounds});
  assert.equal(checks.overflow,false);assert.equal(checks.autoZoom,false);assert.deepEqual(checks.clipped,[],'Physical swords must fit fixed camera');assert.deepEqual(checks.cameraChanges,[]);
  assert.ok(checks.contacts.every(c=>c.intersects&&c.groundError<1e-8),'Each striking sword crosses the actual target');
  assert.ok(checks.maxRails<32&&checks.maxSnaps<40,'Pools fit simultaneous effects');
  assert.equal(checks.effectsOff.visibleEffects+checks.effectsOff.summonedArray.visibleEffects+checks.effectsOff.visibleGhosts,0);assert.equal(checks.effectsOff.visibleSwords,5);
  assert.equal(checks.cancel.registeredTimelines+checks.cancel.visibleEffects+checks.cancel.summonedArray.visibleEffects+checks.cancel.visibleSwords,0);
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setSpeed(2);f.play();});await page.waitForTimeout(350);
  const paused=await page.evaluate(()=>{CyanKnightPreview.fx.pause();return CyanKnightPreview.fx.time});await page.waitForTimeout(180);
  assert.ok(Math.abs(await page.evaluate(()=>CyanKnightPreview.fx.time)-paused)<.002,'Pause drift');
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setSpeed(.4);f.seek(.7);f.play();});await page.waitForTimeout(240);
  const slow=await page.evaluate(()=>CyanKnightPreview.fx.time);assert.ok(slow>.70&&slow<.91,'Slow clock');
  await page.evaluate(()=>{const f=CyanKnightPreview.fx;f.setSpeed(1);f.seek(0);f.play();});await page.waitForTimeout(4850);
  assert.equal(await page.evaluate(()=>CyanKnightPreview.fx.playing),false);
  for(const [label,time]of [['fan',.45],['drop',.83],['reverse',1.41],['curve',1.91],['diagonal',2.58],['stairs',2.24],['execution',3.09],['finish',3.76]]){
   await page.evaluate(t=>CyanKnightPreview.fx.seek(t),time);await page.waitForTimeout(60);
   await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(device.name+'-'+label+'.png',qa))});
  }
  const cleanup=await page.evaluate(()=>{const r=CyanKnightPreview,geometries=r.fx.array.railPool.map(s=>s.geometry);r.fx.play();r.engine.app.canvas.ownerDocument.defaultView.dispatchEvent(new Event('pagehide'));return{disposed:r.fx.disposed,frontDestroyed:r.fx.front.destroyed,swordsDestroyed:r.fx.swords.destroyed,backDestroyed:r.fx.back.destroyed,timelineRemoved:r.fx.timeline===null,ribbonBuffersDisposed:geometries.every(g=>g.buffers===null)};});
  assert.ok(Object.values(cleanup).every(Boolean));assert.deepEqual(errors,[]);
  report.devices.push({...device,...checks,pausePassed:true,slowPassed:true,normalSpeedCompleted:true,cleanup,errors});await page.close();
 }
 await fs.writeFile(new URL('checks.json',qa),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,preservedFiles:report.preservedFiles,preservedOtherSkillSamples:preservedSamples,flightLegs,impacts:report.impacts,devices:report.devices.map(d=>({name:d.name,contacts:d.contacts.length,clipped:d.clipped.length,cameraChanges:d.cameraChanges.length,maxRails:d.maxRails,maxSnaps:d.maxSnaps,errors:d.errors}))}));
}finally{await browser.close();}

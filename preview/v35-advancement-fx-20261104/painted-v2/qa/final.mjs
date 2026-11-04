import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={checks:{},video:[],physicalDevice:false};
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview.ready);
 const checks=await page.evaluate(async()=>{
  const a=advancementReview,checks={};
  for(const id of ['vampire','guardian']){const s=await a.play(id,{paused:true});a.seek(.49);const end=s.point(id==='vampire'?s.event.actor:s.event.target),p=s.audit().frames[0];checks[id+'_arrivesBeforeDecay']=Math.hypot(p.x-end.x,p.y-end.y)<.01;a.cancel();}
  for(const id of ['berserker','healer']){const result=await a.attackWithFx(id),hit=a.impacts.at(-1);checks[id+'_attackTargetsEnemy']=result.hits===1&&a.engine.enemies.some(e=>e.id===hit.target);a.cancel();}
  const a1=await a.play('guardian',{cancel:false,paused:true}),a2=await a.play('guardian',{cancel:false,paused:true});const texture=a2.sprites[0].sprite.texture;a1.timeline.kill();a1.destroy();a2.render(.2);checks.sharedTextureSurvivesOtherEffect=!texture.destroyed&&a2.sprites[0].sprite.visible;a.cancel();
  checks.noPageErrors=a.errors.length===0;return checks;
 });Object.assign(report.checks,checks);
 const ids=await page.evaluate(()=>advancementReview.catalog.map(s=>s.id));
 const tiles=[];
 for(let i=0;i<ids.length;i++){
  const shot=await page.evaluate(async id=>{const a=advancementReview;await a.play(id,{paused:true});a.seek(.20);return {id,name:a.catalog.find(s=>s.id===id).name};},ids[i]);
  const file=dir+'battle-'+shot.id+'.png';await page.screenshot({path:file});
  const image=await sharp(file).resize(480,317).png().toBuffer();
  const label=Buffer.from(`<svg width="480" height="35"><text x="10" y="24" font-family="Malgun Gothic" font-size="20" fill="white">${shot.name}</text></svg>`);
  const tile=await sharp({create:{width:480,height:352,channels:4,background:'#07101b'}}).composite([{input:image,left:0,top:35},{input:label,left:0,top:0}]).png().toBuffer();tiles.push({input:tile,left:i%4*480,top:Math.floor(i/4)*352});
 }
 await sharp({create:{width:1920,height:1408,channels:4,background:'#07101b'}}).composite(tiles).png().toFile(dir+'16-effects-battle-overview.png');
 const art=JSON.parse(await fs.readFile(dir+'../generation.json','utf8')).filter(r=>r.status!=='REJECTED'),artTiles=[];
 for(let i=0;i<ids.length;i++){
  const r=art.find(r=>r.id===ids[i]),b=await fs.readFile(dir+'../'+r.output),m=await sharp(b).metadata(),x=Math.round(m.width*3/4),w=m.width-x,h=Math.round(m.height/2);
  const label=Buffer.from(`<svg width="300" height="38"><text x="12" y="27" font-family="Malgun Gothic" font-size="21" fill="white">${String(i+1).padStart(2,'0')} ${await page.evaluate(id=>advancementReview.catalog.find(s=>s.id===id).name,ids[i])}</text></svg>`);
  const tile=await sharp({create:{width:300,height:300,channels:4,background:'#101722'}}).composite([{input:await sharp(b).extract({left:x,top:0,width:w,height:h}).resize(264,264,{fit:'contain'}).toBuffer(),left:18,top:35},{input:label,left:0,top:0}]).png().toBuffer();artTiles.push({input:tile,left:i%4*300,top:Math.floor(i/4)*300});
 }
 await sharp({create:{width:1200,height:1200,channels:4,background:'#101722'}}).composite(artTiles).png().toFile(dir+'16-painted-effects-overview.png');
 // Decode the actual recorded WebM, seek it, and capture actual video frames.
 for(const file of ['16-effects-normal.webm','16-effects-half-speed.webm']){
  await page.goto('http://127.0.0.1:18804/preview/v35-advancement-fx-20261104/painted-v2/qa/'+file);
  await page.waitForSelector('video');
  const info=await page.evaluate(async()=>{const v=document.querySelector('video');v.pause();if(v.readyState<2)await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}));v.currentTime=1;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,readyState:v.readyState};});
  const frames=[];
  for(const t of [1,3,6,9]){await page.evaluate(async t=>{const v=document.querySelector('video');v.currentTime=t;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));},t);const data=await page.evaluate(()=>{const v=document.querySelector('video'),c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];});const output=file.replace('.webm','')+'-at-'+t+'.png';await fs.writeFile(dir+output,Buffer.from(data,'base64'));frames.push({t,file:output});}
  report.video.push({file,...info,frames});report.checks[file+'_decodesAndSeeks']=info.width>1000&&info.height>500&&info.readyState>=2;
 }
 report.checks.allSixteenCaptured=tiles.length===16;
 await fs.writeFile(dir+'final.json',JSON.stringify(report,null,2));console.log(report.checks);if(Object.values(report.checks).some(v=>!v))process.exitCode=1;
}finally{await browser.close();}

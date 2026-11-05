import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {browser,open,dir,host,modes,elapsed} from './probe.mjs';
const base='/preview/v35-whitecoat-swordsman-20261102/', result={checks:[],clips:[]};
const check=(name,ok,detail)=>result.checks.push({name,pass:Boolean(ok),detail});
const {records}=JSON.parse(await fs.readFile(dir+'recording.json','utf8'));
const ffmpeg=execFileSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const b=await browser();
try{
  const stills=[];
  for(const [row,r] of records.entries()){
    for(const [col,c] of r.chapters.entries()){
      const m=modes[col], phase=elapsed(m,m.peak)/c.clock.durationSeconds;
      const at=c.start+phase*(c.end-c.start);
      const png=execFileSync(ffmpeg,['-loglevel','error','-ss',String(at),'-i',dir+r.file,'-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'],
        {encoding:'buffer',windowsHide:true,maxBuffer:8e6});
      const image=await sharp(png).resize(380,230,{fit:'contain',background:'#101923'}).png().toBuffer();
      stills.push({input:image,left:380*col,top:230*row});
      result.clips.push({file:r.file,skill:m.id,time:at,nonempty:png.length>5000});
    }
  }
  await sharp({create:{width:1520,height:690,channels:4,background:'#101923'}}).composite(stills).png().toFile(dir+'video-phases.png');
  check('decode four skill peaks from all three recordings',result.clips.length===12&&result.clips.every(v=>v.nonempty));
  for(const width of [1440,390]){
    const p=await b.newPage({viewport:{width,height:width===1440?940:844}}), errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(host+base+'review.html');
    for(const r of records){
      await p.locator('[data-film="'+r.file+'"]').click();
      await p.waitForFunction(file=>{const v=document.querySelector('#swordplay-film');return v.currentSrc.endsWith(file)&&v.readyState>=2&&!v.paused;},r.file);
      const info=await p.locator('#swordplay-film').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
      check(width+' video plays '+r.file,Number.isFinite(info.duration)&&info.duration>5&&info.width>500,info);
      for(const c of r.chapters){
        await p.locator('[data-cast="'+c.id+'"]').click();
        await p.waitForFunction(start=>{const v=document.querySelector('#swordplay-film');return !v.paused&&!v.seeking&&v.currentTime>=start-.08&&v.currentTime<start+.5;},c.start);
      }
      check(width+' chapter controls '+r.file,true);
    }
    check(width+' review width and runtime errors',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&!errors.length,errors);
    await p.close();
  }
  const p=await open(b,'whitecoat-squad',390);
  await p.selectOption('#speed','0.25');
  await p.locator('[data-sword="skill_rain"]').click();await p.waitForFunction(()=>v35Review.spine.busy);
  await p.locator('#pause').click();const first=await p.evaluate(()=>v35Review.spine.clock.time);
  await p.waitForTimeout(110);const last=await p.evaluate(()=>v35Review.spine.clock.time);
  await p.locator('#effects').uncheck();
  check('touch-size battlefield controls pause actor and disable FX',first===last&&await p.evaluate(()=>v35Review.effects.session.audit().active===0));
  await p.locator('#cancel').click();await p.locator('#pause').click();await p.locator('#effects').check();
  await p.selectOption('#speed','1');
  await p.locator('[data-sword="skill_wheel"]').click();
  await p.waitForFunction(()=>!v35Review.spine.busy&&v35Review.engine.lastMercenaryPlayback?.technique==='skill_wheel');
  check('resume and replay area skill through a visible button',await p.evaluate(()=>v35Review.engine.lastMercenaryPlayback.damageApplications===3 && !v35Review.errors.length));
  await p.close();
  for(const kind of ['mixed','cardgu']){
    const p=await open(b,kind);
    await p.evaluate(async()=>{await v35Review.attack(0);await v35Review.attack(1);});
    const s=await p.evaluate(()=>v35Review.audit());
    check('previous formation '+kind,s.canvasCount===1&&s.impacts.length===2&&!s.errors.length);
    await p.close();
  }
  const bytes=await fs.readFile(dir+records[0].file);
  const range=await fetch(host+base+'swordplay-v5/qa/'+records[0].file,{headers:{Range:'bytes=1024-2047'}});
  check('HTTP range for video seeking',range.status===206&&Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(1024,2048)));
}catch(error){check('execution',false,error.stack);}
finally{
  await b.close();
  result.passed=result.checks.every(c=>c.pass);
  await fs.writeFile(dir+'review.json',JSON.stringify(result,null,2));
  console.log({passed:result.passed,checks:result.checks.length,errors:result.checks.filter(c=>!c.pass)});
  if(!result.passed)process.exitCode=1;
}

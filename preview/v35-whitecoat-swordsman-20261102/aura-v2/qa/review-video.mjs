import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {browser} from '../../swordplay-v5/qa/probe.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const b=await browser();
try {
 for(const width of [1440,390]) {
  const p=await b.newPage({viewport:{width,height:940}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/review.html');
  await p.locator('#swordplay-film').evaluate(v=>new Promise(resolve=>v.readyState>=1?resolve():v.addEventListener('loadedmetadata',resolve,{once:true})));
  check(width+' review contains current aura and fits viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#swordplay-film').src.includes('/aura-v2/')));
  for(const file of ['four-skills.webm','four-skills-half.webm','four-skills-body.webm']) {
   await p.locator(`[data-film="${file}"]`).click();await p.waitForTimeout(400);
   const s=await p.locator('#swordplay-film').evaluate(v=>({time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,duration:v.duration,paused:v.paused,src:v.currentSrc,error:v.error?.message}));
   check(width+'/'+file+' decodes and advances',s.time>.1&&s.frames>2&&Number.isFinite(s.duration)&&!s.paused&&!s.error&&s.src.endsWith(file),s);
  }
  await p.locator('[data-film="four-skills.webm"]').click();
  await p.locator('[data-cast="skill_wheel"]').click();await p.waitForTimeout(100);
  const seek=await p.locator('#swordplay-film').evaluate(v=>({time:v.currentTime,paused:v.paused}));
  check(width+' skill chapter navigation',seek.time>4&&!seek.paused,seek);
  await p.locator('[data-cast="aura_idle"]').click();await p.waitForTimeout(160);
  check(width+' returns to aura introduction',await p.locator('#swordplay-film').evaluate(v=>v.currentTime<1&&!v.paused));
  check(width+' no page errors',!errors.length,errors);
  await p.close();
 }
 const response=await fetch('http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/four-skills.webm',{headers:{Range:'bytes=0-1023'}});
 check('Video supports seekable HTTP range',response.status===206&&response.headers.get('content-range')?.startsWith('bytes 0-1023/'));
 const ffmpeg=execFileSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
 const recording=JSON.parse(await fs.readFile(dir+'recording.json'));
 const normal=recording.records.find(r=>r.file==='four-skills.webm'),wheel=normal.chapters.find(c=>c.id==='skill_wheel');
 for(const [name,time] of [['aura-early',.4],['aura-mid',2.4],['aura-late',3.8],['wheel-video',wheel.start+.34]]) {
  const r=spawnSync(ffmpeg,['-loglevel','error','-y','-ss',String(time),'-i',dir+'four-skills.webm','-frames:v','1',dir+name+'.png'],{windowsHide:true});
  if(r.status!==0)throw Error(String(r.stderr));
 }
 check('New recordings contain every skill and valid impacts',recording.passed);
}catch(error){check('Execution',false,error.stack);}finally{
 await b.close();const failed=checks.filter(c=>!c.pass);await fs.writeFile(dir+'review-video.json',JSON.stringify({passed:!failed.length,checks},null,2));console.log({checks:checks.length,failed});if(failed.length)process.exitCode=1;
}

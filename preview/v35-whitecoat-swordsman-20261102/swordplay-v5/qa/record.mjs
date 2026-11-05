import fs from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {browser,open,modes,dir} from './probe.mjs';
const ffmpeg=execFileSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
  {encoding:'utf8',windowsHide:true}).trim();
const b=await browser(), records=[];
try {
  const page=await open(b);
  for(const m of modes)await page.evaluate(async id=>{const a=v35Review;await a.attack(a.engine.mercenaries.indexOf(a.spine.actor),id);},m.id);
  await page.waitForTimeout(900);
  for(const [file,rate,enabled] of [['four-skills',1,true],['four-skills-half',.5,true],['four-skills-body',1,false]]) {
    await page.selectOption('#speed',String(rate));
    await page.evaluate(enabled=>{
      const a=v35Review;a.effects.setEnabled(enabled);
      const stream=a.engine.app.canvas.captureStream(0), track=stream.getVideoTracks()[0], chunks=[];
      const media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:6500000});
      const capture={media,chunks,chapters:[],poses:new Set(),frameTimes:[],start:performance.now()};
      let last=-1000;
      capture.hook={postrender(){
        const now=performance.now();
        if(a.spine.busy)capture.poses.add(a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name);
        if(now-last<15)return;
        last=now;track.requestFrame();capture.frameTimes.push((now-capture.start)/1000);
      }};
      a.engine.app.renderer.runners.postrender.add(capture.hook);
      media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      a.capture=capture;media.start();
    },enabled);
    await page.waitForTimeout(220);
    for(const m of modes) {
      await page.evaluate(async id=>{
        const a=v35Review,c=a.capture, start=(performance.now()-c.start)/1000, before=a.impacts.length;
        c.poses.clear();
        await a.attack(a.engine.mercenaries.indexOf(a.spine.actor),id);
        c.chapters.push({id,start,end:(performance.now()-c.start)/1000,poses:[...c.poses],
          impacts:a.impacts.slice(before).map(v=>v.target),clock:a.normalPlayback.at(-1).last});
      },m.id);
      await page.waitForTimeout(360);
    }
    const {base64,...record}=await page.evaluate(async()=>{
      const a=v35Review,c=a.capture;
      a.engine.app.renderer.runners.postrender.remove(c.hook);
      await new Promise(resolve=>{c.media.onstop=resolve;c.media.stop();});
      c.media.stream.getTracks().forEach(t=>t.stop());
      const bytes=new Uint8Array(await new Blob(c.chunks).arrayBuffer());let str='';
      for(let offset=0;offset<bytes.length;offset+=8192)str+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
      return {base64:btoa(str),chapters:c.chapters,frames:c.frameTimes.length,errors:a.errors};
    });
    const dest=dir+file+'.webm';
    const result=spawnSync(ffmpeg,['-loglevel','error','-y','-i','pipe:0','-map','0:v:0','-c','copy',dest],{
      input:Buffer.from(base64,'base64'),windowsHide:true,maxBuffer:8e6});
    if(result.status!==0)throw Error(String(result.stderr));
    records.push({file:file+'.webm',rate,enabled,...record});
    console.log(file,record.frames,record.chapters.map(c=>[c.id,c.poses.length,c.impacts.length]));
  }
  const passed=records.every(r=>!r.errors.length && r.chapters.every((c,i)=>c.impacts.length===(i<2?1:3)&&c.poses.length>=4));
  if(!passed)throw Error('Capture lost poses or impacts');
  await fs.writeFile(dir+'recording.json',JSON.stringify({passed,records},null,2));
} finally {await b.close();}

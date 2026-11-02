import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:1440,height:950}});await p.goto('http://127.0.0.1:18766/?case=whitecoat');await p.waitForFunction(()=>v35Review.ready);
 const live=await p.evaluate(async()=>{const a=v35Review;a.effects.setEnabled(false);const canvas=document.querySelector('#pvPixiBattle canvas'),samples=[],times=[.28,.32,.4,.5,.66,.99,1.16,1.33];let last=-1;
  const hook={postrender(){const time=a.spine.clock.time;if(a.spine.busy&&samples.length<times.length&&time>=times[samples.length]&&last!==time){last=time;samples.push({time,pose:a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name,root:{x:a.spine.actor.root.x,y:a.spine.actor.root.y},png:canvas.toDataURL().split(',')[1]});}}};a.engine.app.renderer.runners.postrender.add(hook);await a.attack(1,'skill_tempest');a.engine.app.renderer.runners.postrender.remove(hook);return samples;});
 for(const [i,s]of live.entries())await fs.writeFile(dir+'live-off-'+i+'.png',Buffer.from(s.png,'base64'));
 await fs.writeFile(dir+'live-capture.json',JSON.stringify(live.map(({png,...s})=>s),null,2));
 await p.setContent('<video muted></video>');
 const decoded=await p.evaluate(async()=>{const v=document.querySelector('video');v.src=URL.createObjectURL(await(await fetch('/preview/v35-whitecoat-swordsman-20261102/action-v3/qa/normal-effects-off.webm')).blob());await new Promise(r=>v.onloadeddata=r);const frames=[];await new Promise(async resolve=>{const tick=(_now,m)=>{const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);if(m.mediaTime<1.5)frames.push({time:m.mediaTime,png:c.toDataURL().split(',')[1]});if(m.mediaTime>=1.5){v.pause();resolve();}else v.requestVideoFrameCallback(tick);};v.requestVideoFrameCallback(tick);await v.play();});return frames;});
 const parts=[];for(const [i,s]of decoded.entries()){const buf=await sharp(Buffer.from(s.png,'base64')).resize(360,238,{fit:'contain'}).png().toBuffer();parts.push({input:buf,left:i%4*360,top:Math.floor(i/4)*260});}
 const height=Math.ceil(decoded.length/4)*260,labels=decoded.map((s,i)=>`<text x="${i%4*360+4}" y="${Math.floor(i/4)*260+254}" font-size="14" fill="white">${s.time.toFixed(3)}s</text>`).join('');
 parts.push({input:Buffer.from(`<svg width="1440" height="${height}">${labels}</svg>`),left:0,top:0});await sharp({create:{width:1440,height,channels:4,background:'#162232'}}).composite(parts).png().toFile(dir+'decoded-off.png');
 console.log({live:live.map(({png,...s})=>s),decodedTimes:decoded.map(s=>s.time)});
}finally{await b.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

// Capture Chrome's composited viewport, including the battlefield, HUD and WebGL layer.
export async function startKnightRecording(page) {
  const cdp = await page.context().newCDPSession(page);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'knight-cast-'));
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame',event=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
    const time = event.metadata.timestamp*1000;
    if (frames.length && time-frames.at(-1).time<24) return;
    const file = 'frame-'+String(frames.length).padStart(6,'0')+'.jpg';
    frames.push({file,time});
    writes.push(fs.writeFile(path.join(dir,file),Buffer.from(event.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:91,everyNthFrame:1});
  return async ({boss,width,out,casts})=>{
    try {
      await cdp.send('Page.stopScreencast');
      await cdp.detach();
      await Promise.all(writes);
      const playlist = ['ffconcat version 1.0'];
      const covers=[],subtitles=[];
      let elapsed=0;
      const stamp=ms=>new Date(Math.round(ms)).toISOString().slice(11,23).replace('.',',');
      for (const [i,skill] of boss.skills.entries()) {
        const cast = casts[skill.code];
        const segment = frames.filter(f=>f.time>=cast.start-140 && f.time<=cast.end+180);
        assert(segment.length>=5,skill.code+' insufficient captured frames '+segment.length);
        const nearest = at => segment.reduce((a,b)=>Math.abs(b.time-at)<Math.abs(a.time-at)?b:a);
        const poster = path.join(dir,nearest(cast.contact).file);
        const tileWidth=width===390?390:560;
        const thumb=await sharp(poster).resize({width:tileWidth}).png().toBuffer();
        covers.push({input:thumb,left:i*tileWidth,top:0});
        if (i===0) await sharp(poster).png().toFile(path.join(out,boss.key+'-'+width+'.png'));
        const start=elapsed;
        for (let j=0;j<segment.length;j++) {
          playlist.push("file '"+segment[j].file+"'");
          playlist.push('option framerate 1000');
          const ms = Math.max(1,(segment[j+1]?.time ?? cast.end+185)-segment[j].time);
          elapsed+=ms;
          playlist.push('duration '+(ms/1000).toFixed(4));
        }
        if (i===boss.skills.length-1) playlist.push("file '"+segment.at(-1).file+"'");
        subtitles.push(String(i+1),stamp(start)+' --> '+stamp(elapsed),skill.name,'');
        cast.videoFrames = segment.length;
      }
      const tile=await sharp(covers[0].input).metadata();
      await sharp({create:{width:tile.width*3,height:tile.height,channels:3,background:'#11141b'}}).composite(covers)
        .webp({quality:88}).toFile(path.join(out,boss.key+'-'+width+'-skills.webp'));
      await fs.writeFile(path.join(dir,'skills.srt'),subtitles.join('\n')+'\n');
      await fs.writeFile(path.join(dir,'casts.ffconcat'),playlist.join('\n')+'\n');
      execFileSync(process.env.KNIGHT_QA_FFMPEG,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i','casts.ffconcat','-i','skills.srt',
        '-map','0:v','-map','1:s','-c:s','mov_text','-metadata:s:s:0','language=kor','-disposition:s:0','default','-vf','fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','18','-movflags','+faststart',
        path.resolve(out,boss.key+'-'+width+'.mp4')],{cwd:dir,windowsHide:true});
    } finally {
      if (path.dirname(path.resolve(dir))===path.resolve(os.tmpdir()) && path.basename(dir).startsWith('knight-cast-')) {
        await fs.rm(dir,{recursive:true,force:true});
      }
    }
  };
}

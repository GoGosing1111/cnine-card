import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const qa=process.argv[2]?path.resolve(process.argv[2])+path.sep:fileURLToPath(new URL('../',import.meta.url));
const out=process.argv[3]?path.resolve(process.argv[3])+path.sep:fileURLToPath(new URL('../../playback/',import.meta.url));
const ffmpeg=execFileSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(out,{recursive:true});
const recordings=JSON.parse(await fs.readFile(qa+'recording.json'));
const files=[];
for(const record of recordings.records){
 const source=qa+record.file,destination=out+record.file.replace(/\.webm$/,'.mp4');
 const before=await fs.readFile(source);
 // This is an opaque review recording, not a transparent game effect asset.
 // Keep the captured timing while removing VP8 alpha/compositor dependencies.
 const args=['-hide_banner','-loglevel','error','-y','-i',source,'-map','0:v:0','-an',
  '-vf','fps=60,format=yuv420p','-c:v','libx264','-profile:v','high','-level:v','4.2',
  '-preset','fast','-crf','18','-movflags','+faststart','-map_metadata','-1',destination];
 const result=spawnSync(ffmpeg,args,{windowsHide:true,maxBuffer:4e6});
 if(result.status!==0)throw Error(String(result.stderr));
 const bytes=await fs.readFile(destination);
 const sourceUnchanged=hash(before)===hash(await fs.readFile(source));
 if(!sourceUnchanged)throw Error('Source recording changed');
 files.push({source:'../qa/'+record.file,file:record.file.replace(/\.webm$/,'.mp4'),
  sourceSha256:hash(before),sha256:hash(bytes),bytes:bytes.length,sourceUnchanged,rate:record.rate,
  effects:record.enabled,chapters:record.chapters.map(({id,start,end})=>({id,start,end}))});
 console.log(record.file,bytes.length);
}
await fs.writeFile(out+'manifest.json',JSON.stringify({purpose:'Opaque H.264 browser review copies; original VP8 recordings preserved',
 video:'H.264 High 4.2, 60 fps, yuv420p, faststart, no audio',files},null,2)+'\n');

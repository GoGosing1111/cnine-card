import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {makePlan,sample,SHOWCASE} from '../skill.mjs';
const root=new URL('../',import.meta.url),read=f=>fs.readFile(new URL(f,root));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const m=JSON.parse(await read('manifest.json')),a=JSON.parse(await read('art-approval-20261017.json'));
assert.equal(hash(await read(a.sourceArt)),a.sha256,'approved source bytes');
assert.equal(hash(await read(m.masterSource)),m.masterSha256,'mirrored master bytes');
assert.equal(m.motion.idle.frameCount,1);assert.equal(m.runtimeEnabled,false);assert.deepEqual(m.counts,{motion:24,effects:108});
let frames=0;
for(const kind of ['motion','effects'])for(const [key,spec]of Object.entries(m[kind])){
 assert.equal(hash(await read(spec.source.file)),spec.source.sha256,key+' source');
 assert.equal(hash(await read(spec.atlas)),spec.sha256,key+' atlas');
 const hashes=new Set();
 for(const f of spec.frames){
  const b=await read(f.file);assert.equal(hash(b),f.sha256);hashes.add(f.sha256);
  const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,spec.cellWidth||spec.cellSize);assert.equal(info.height,spec.cellHeight||spec.cellSize);
  let occupied=0,border=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=24){occupied++;if(x<2||y<2||x>=info.width-2||y>=info.height-2)border++;}
  assert.ok(occupied>30,key+' not empty');assert.equal(border,0,key+' complete padded frame');
  if(kind==='motion')assert.ok(!spec.excludedSourceFrames.includes(f.sourceIndex));
  frames++;
 }
 assert.equal(hashes.size,spec.frames.length,key+' authored distinct frames');
}
for(const mode of SHOWCASE){const p=makePlan({mode});for(let i=0;i<=120;i++){const s=sample(p,p.duration*i/120);assert.ok(m.motion[s.pose.key].frames[s.pose.frame],mode+' valid frame');}}
const report={date:new Date().toISOString(),status:'PASS',frames,sourceArtBytesPreserved:true,mirroredMasterBytesPreserved:true,allPlaybackFramesPadded:true,rejectedSourcesExcluded:true,productionEnabled:false,visualApproval:false};
await fs.writeFile(new URL('qa/asset-report.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

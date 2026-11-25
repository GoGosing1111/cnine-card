import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {bladeTracks} from '../preview/project-v-v3/source/battle/lightning-saint/blade-tracks.mjs';
import {saintActionCharge} from '../preview/project-v-v3/source/battle/lightning-saint/aura.mjs';
import {skillList} from '../preview/project-v-v3/source/battle/lightning-saint/choreography.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

const root='assets/ui/project-v/mercenaries/lightning-saint-20261125/';
test('the caster charge crests on the basic and all 83 skill contacts and returns to the guard at both ends',()=>{
 const attacks=[{seconds:.58,contacts:[.232]},...skillList];
 assert.equal(skillList.reduce((total,s)=>total+s.contacts.length,0),83);
 for(const {seconds,contacts} of attacks){
  for(const at of contacts)assert.equal(saintActionCharge(at,contacts,seconds),1);
  for(let t=0;t<seconds;t+=.01){
   const value=saintActionCharge(t,contacts,seconds);assert(value>=0&&value<=1);
  }
  for(const t of [0,seconds])assert.equal(saintActionCharge(t,contacts,seconds,1.12),saintActionCharge(0,[],seconds,1.12));
 }
 assert(saintActionCharge(.19,[.232],.58,0)>saintActionCharge(.11,[.232],.58,0));
 assert(saintActionCharge(.46,[.232],.58,0)<saintActionCharge(.33,[.232],.58,0));
});
async function atlas(name){
 const bytes=await readFile(root+name),end=4+bytes.readUInt32LE();
 return JSON.parse(bytes.subarray(4,end)).actor;
}
test('HD and SD combat cels share the same blade, grip, and emissive-map coordinates',async()=>{
 const [hd,sd]=await Promise.all([atlas('battle-hd.bin'),atlas('battle-sd.bin')]);
 assert.deepEqual(hd.sprites,sd.sprites);assert.deepEqual(hd.frames,sd.frames);assert.deepEqual(hd.pivots,sd.pivots);
 assert.equal(bladeTracks.length,Object.keys(hd.sprites).length);
 for(const [key,track] of bladeTracks.entries()){
  if(!track)continue;
  const [x,y,tx,ty,r]=track,[,,w,h]=hd.sprites[key].rect;
  assert(track.every(Number.isFinite));assert(r>=1);
  assert(Math.hypot(tx-x,ty-y)<=Math.hypot(w,h)+2);
 }
 const guard=hd.frames[hd.banks.v2.start],pose=hd.sprites[guard];
 assert.deepEqual(pose.rect.slice(2),[193,442]);
 const [gx,gy,tx,ty]=bladeTracks[guard];
 assert(Math.hypot(gx-158,gy-190)<6&&Math.hypot(tx-188,ty-2)<4);
});
test('registered steel, embroidery and rear corona occupy distinct transparent atlas regions',async()=>{
 const file=root+'storm-material-v1.webp',{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1536);assert.equal(info.height,3072);assert(isProductionFile(file));
 const alpha=(x,y)=>data[4*(y*info.width+x)+3];
 const guard=(x,y,plane=0)=>alpha(Math.floor((1350+x)/4),Math.floor((1544+y)/4)+plane*1536);
 assert(guard(177,70)>45);assert(guard(129,365,1)>100);assert(guard(96,162)<25);
 assert(alpha(1084,1178)<12);assert(alpha(1084+304,1178+74)>90);
 assert(!isProductionFile('preview/project-v-v3/source/battle/lightning-saint/author/corona-source.webp'));
});

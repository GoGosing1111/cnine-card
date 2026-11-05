import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {t,ring,spark} from '../effects/primitives.mjs';

const dir=fileURLToPath(new URL('.',import.meta.url));
const native=path.join(dir,'native');
await fs.mkdir(native,{recursive:true});
await fs.mkdir(path.join(dir,'qa'),{recursive:true});
await fs.mkdir(path.join(dir,'runtime'),{recursive:true});
// Exact vector geometry is intentional: a legible two-lobed Taegeuk emblem,
// with a transparent perimeter. No character image is repainted or segmented.
const symbol=`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="-384 -384 768 768">
<defs>
 <radialGradient id="blue" cx="33%" cy="30%" r="80%"><stop stop-color="#dbfaff" stop-opacity=".86"/><stop offset=".37" stop-color="#65caff" stop-opacity=".70"/><stop offset="1" stop-color="#194bba" stop-opacity=".30"/></radialGradient>
 <radialGradient id="silver" cx="65%" cy="70%" r="82%"><stop stop-color="#ffffff" stop-opacity=".95"/><stop offset=".42" stop-color="#dcf4ff" stop-opacity=".76"/><stop offset="1" stop-color="#8daec7" stop-opacity=".20"/></radialGradient>
 <filter id="bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<g fill="none" stroke="#bcefff"><circle r="300" stroke-width="9" opacity=".32" filter="url(#bloom)"/><circle r="300" stroke-width="2" opacity=".7"/><circle r="313" stroke-width="1.4" opacity=".35"/></g>
<path d="M0,-277 A277,277 0 0 1 0,277 A138.5,138.5 0 0 1 0,0 A138.5,138.5 0 0 0 0,-277" fill="url(#silver)"/>
<path d="M0,-277 A277,277 0 0 0 0,277 A138.5,138.5 0 0 1 0,0 A138.5,138.5 0 0 0 0,-277" fill="url(#blue)"/>
<path d="M0,-277 A138.5,138.5 0 0 1 0,0 A138.5,138.5 0 0 0 0,277" fill="none" stroke="#ecfcff" stroke-width="3.5" opacity=".90"/>
<circle cx="0" cy="-138.5" r="27" fill="#edfaff" opacity=".82"/><circle cx="0" cy="138.5" r="27" fill="#246fbb" opacity=".88"/>
<g fill="none" stroke="#e5f8ff" stroke-width="2" opacity=".60"><path d="M-328,0h-18 M328,0h18 M0,-328v-18 M0,328v18"/></g>
</svg>`;
await fs.writeFile(path.join(dir,'taegeuk.svg'),symbol);
await sharp(Buffer.from(symbol)).png().toFile(path.join(dir,'runtime/taegeuk.png'));

// Continuous secondary energy is authored in native Effekseer. 60 equally
// spaced phases wrap into a four-second runtime loop; the emblem rotates
// separately at ten seconds per revolution on the same battle clock.
const continuous=node=>node.replace(/<FadeInType>.*?<\/FadeOut>/,'');
const nodes=[];
for(let i=0;i<2;i++) {
 const a=i*180;
 nodes.push(continuous(ring({name:'Cobalt current '+i,r:4.65,inner:4.22,from:8,to:151,rotation:[0,0,a],spin:[0,0,6],color:[80,178,255,190],life:62})));
 nodes.push(continuous(ring({name:'Silver leading edge '+i,r:4.48,inner:4.37,from:20,to:147,rotation:[0,0,a],spin:[0,0,6],color:[220,247,255,255],life:62})));
 nodes.push(continuous(ring({name:'Outer counter current '+i,r:5.1,inner:4.99,from:30,to:96,rotation:[0,0,a+45],spin:[0,0,-6],color:[170,224,255,185],life:62})));
}
// Small symmetric glints rotate around the same origin, without random bursts
// or a particle reset at the loop boundary.
for(let i=0;i<4;i++) {
 const angle=i*90+12, rad=angle*Math.PI/180;
 let n=spark({name:'Orbit star '+i,color:[220,245,255,225],life:62,rotation:[0,0,angle],spin:[0,0,6]},.19,.045);
 // Offset the sprite's geometry rather than its emitter so its rotation orbits.
 n=n.replace(/<Position_Fixed_(LL|LR|UL|UR)><X>(.*?)<\/X><Y>(.*?)<\/Y>/g,(_,k,x,y)=>`<Position_Fixed_${k}><X>${Number(x)+4.85}</X><Y>${y}</Y>`);
 nodes.push(continuous(n));
}
const project=t('Root',t('Name','Hakuya Shin back aura')+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',60)+t('IsLoop','True');
const id='taegeuk-orbit';
await fs.writeFile(path.join(native,id+'.efkproj'),'<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',project));
const binary='C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
function convert(input,output,compiled){const r=spawnSync(binary,['-cui','-in',path.join(native,input),'-o',path.join(native,output),'-e',path.join(native,compiled)],{cwd:path.dirname(binary),windowsHide:true,encoding:'utf8',timeout:90000});if(r.status!==0||r.error)throw Error(r.error?.message||r.stderr);}
convert(id+'.efkproj',id+'.efkefc',id+'-initial.efk');
convert(id+'.efkefc',id+'-reopened.efkefc',id+'.efk');
convert(id+'-reopened.efkefc',id+'-verified.efkefc',id+'-verified.efk');
const bytes=await fs.readFile(path.join(native,id+'.efk'));
if(!bytes.equals(await fs.readFile(path.join(native,id+'-verified.efk'))))throw Error('Native roundtrip mismatch');
await fs.writeFile(path.join(dir,'effects.json'),JSON.stringify({effects:[{id,frames:62,blend:'add',units:12,width:512,height:512,pivot:[256,256],source:'native/'+id+'.efkefc'}]},null,2));
await fs.writeFile(path.join(dir,'qa/native.json'),JSON.stringify({tool:'Effekseer 1.70e',nodes:nodes.length,roundtripEqual:true,sha256:createHash('sha256').update(bytes).digest('hex'),loop:{firstFrame:1,frames:60,nativeDegreesPerFrame:6,runtimeSeconds:4},symbol:{source:'taegeuk.svg',method:'Exact SVG geometry rasterized with sharp; not AI-generated artwork',size:[768,768]}},null,2));
console.log('Taegeuk SVG and native Effekseer orbit exported; roundtrip equal.');

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('./',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const file=p=>path.join(root,p);
await fs.mkdir(file('assets/runtime'),{recursive:true});
const blade=await fs.readFile(file('assets/source/blade.png'));
const meta=await sharp(blade).metadata();
if(!meta.hasAlpha)throw Error('Summoned sword must have real transparent alpha');
const manifest={version:'SX_ULTIMATE_GROUNDSTRIKE_V3_20261007',name:'창천멸진',status:'USER_REVIEW_PENDING',runtimeEnabled:false,
 scope:'ULTIMATE_ONLY',previousUltimate:'REJECTED',approvedModes:'../approval-aura-dash-skill-20261007.json',
 blade:{url:'assets/source/blade.png',sha256:hash(blade),width:meta.width,height:meta.height,tip:{x:512,y:1508},pommel:{x:512,y:15},rigid:true},
 effects:{},audio:{enabled:false},damageAuthority:'NONE_PREVIEW_VISUAL_ONLY'};
const origins={
 eruption:[[204,284],[566,307],[955,307],[1348,315],[193,661],[568,664],[955,664],[1346,666],[204,969],[577,971],[960,974],[1347,975]],
 ring:[[196,227],[578,227],[963,224],[1347,224],[194,527],[577,527],[963,527],[1347,527],[194,897],[577,897],[963,897],[1347,897]]
};
for(const key of ['eruption','ring']){
 const sourceUrl='assets/source/'+key+'.png',bytes=await fs.readFile(file(sourceUrl)),m=await sharp(bytes).metadata(),frames=[],parts=[];
 if(!m.hasAlpha)throw Error(key+' missing alpha');
 for(let i=0;i<12;i++){
  const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/3),width=Math.round((i%4+1)*m.width/4)-x,height=Math.round((Math.floor(i/4)+1)*m.height/3)-y;
  const scale=Math.min(480/width,480/height),w=Math.round(width*scale),h=Math.round(height*scale),left=Math.floor((512-w)/2),top=Math.floor((512-h)/2);
  const cell=await sharp(bytes).extract({left:x,top:y,width,height}).resize(w,h).extend({left,right:512-w-left,top,bottom:512-h-top,background:'#00000000'}).png().toBuffer();
  parts.push({input:cell,left:i%4*512,top:Math.floor(i/4)*512});
  frames.push({index:i,rect:{x:i%4*512,y:Math.floor(i/4)*512,width:512,height:512},sourceRect:{x,y,width,height},origin:{x:left+(origins[key][i][0]-x)*scale,y:top+(origins[key][i][1]-y)*scale},sha256:hash(cell)});
 }
 const packed=await sharp({create:{width:2048,height:1536,channels:4,background:'#00000000'}}).composite(parts).png().toBuffer(),url='assets/runtime/'+key+'.png';
 await fs.writeFile(file(url),packed);
 manifest.effects[key]={url,sourceUrl,sourceSha256:hash(bytes),sha256:hash(packed),columns:4,rows:3,frames};
}
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packed one rigid sword and 24 area-effect frames; approved assets untouched.');

import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets=new URL('./assets/',import.meta.url);
const file=name=>new URL(`avatar-hanbok-diim-${name}`,assets);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png'));
if(sha(lobby)!=='2f8ca42c38ea3865be2628e2455455eee5b0ea828ef62eaae7f534eec0569be0')throw Error('Approved Hanbok Diim lobby art changed');
const equipment=await readFile(file('equipment-source-art-v1.png'));
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,opaque=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const alpha=data[(y*info.width+x)*4+3];
  if(alpha===0)clear++;if(alpha===255)opaque++;
  if(alpha>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
}
if(clear/(info.width*info.height)<.65||opaque/(info.width*info.height)<.12)throw Error('Equipment alpha is missing or foreground is damaged');
left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(1,608/crop.width,1512/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
// Uniform scaling and empty padding only: keep every hand, shoe and hair edge.
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'fill'}).png().toBuffer();
const padLeft=Math.floor((640-width)/2);
await sharp(body).extend({top:24,bottom:1664-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file(`lobby-v1-${width}.webp`)));
const files={};
for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
  const bytes=await readFile(file(name)),meta=await sharp(bytes).metadata();
  files[`avatar-hanbok-diim-${name}`]={sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const manifest={name:'한복디임',code:'HANBOK_DIIM',serial:'A-17',date:'2026-09-12',generator:'built-in image_gen',lobby:'사용자가 아바타 추가를 지시한 2D 한복 최종 V8 원본',equipment:'같은 한복 전신의 장비창 전용 투명 이미지',backgroundRemoval:{script:'remove-equipment-background.cjs',authorization:'이 대화에서 사용자 승인한 배경만 스크립트로 제거하는 방식 재사용',opaqueRgbChanged:0},alpha:{clearPixels:clear,opaquePixels:opaque,crop},runtime:{width:640,height:1664,uniformScale:scale,bodyWidth:width,bodyHeight:height,top:24,bottom:1664-24-height},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

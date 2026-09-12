import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const base=new URL('./assets/',import.meta.url);
const source=name=>new URL(`avatar-saengbyuwang-${name}-source-art-v1.png`,base);
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const expected={lobby:'728880e0701bc5bd052e798284a1bc384e0b68ce0bf0952ef5399bdae360206e',equipment:'e84b143c8eeefffd6f68e4706e073ba2e71026775fb5571f9e92aa245725c94e'};
for(const [kind,digest] of Object.entries(expected))if(await hash(source(kind))!==digest)throw Error(`${kind}: original hash mismatch`);
for(const width of [1024,640])await sharp(await readFile(source('lobby'))).resize({width}).webp({quality:90,effort:6}).toFile(new URL(`avatar-saengbyuwang-lobby-v1-${width}.webp`,base).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
// Only trim empty side pixels for the live equipment slot. The untouched
// 1024x1536 master remains available. Transparent bottom clearance places both
// shoes above the live slot readout; character pixels are never stretched.
await sharp(await readFile(source('equipment'))).extract({left:192,top:0,width:640,height:1536}).extend({top:0,bottom:128,left:0,right:0,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(new URL('avatar-saengbyuwang-equipment-v1-640.webp',base).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const files={};
for(const filename of ['avatar-saengbyuwang-lobby-source-art-v1.png','avatar-saengbyuwang-equipment-source-art-v1.png','avatar-saengbyuwang-lobby-v1-1024.webp','avatar-saengbyuwang-lobby-v1-640.webp','avatar-saengbyuwang-equipment-v1-640.webp']){
  const file=new URL(filename,base),bytes=await readFile(file),meta=await sharp(bytes).metadata();
  files[filename]={sha256:await hash(file),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const {data,info}=await sharp(await readFile(source('equipment'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let clear=0,solid=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
const manifest={name:'생뷰왕',code:'SAENGBYUWANG',serial:'A-16',generator:'built-in image_gen',date:'2026-09-12',lobby:'오피스 야경. 사용자 요청으로 얼굴을 새로 정리한 최종 원본.',equipment:'같은 얼굴의 오피스 전신. 아이보리 블라우스 상단 단추 두 개 열림, 블랙 미니스커트, 블랙 힐.',backgroundRemoval:{userAuthorization:'배경만 스크립트로 제거',sourceSha256:'db54b41d8eea604cec6bb1de114c28ba74b7825c454182babcee9195efd7a83b',script:'remove-equipment-background.cjs',opaqueRgbChanged:0},alpha:{clearPixels:clear,solidPixelsAtLeast240:solid,visibleBoundsAbove16:[minX,minY,maxX,maxY]},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

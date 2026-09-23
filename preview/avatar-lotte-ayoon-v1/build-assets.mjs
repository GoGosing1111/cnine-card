import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const file=name=>new URL(`./assets/avatar-lotte-ayoon-${name}`,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png'));
const equipment=await readFile(file('equipment-source-art-v1.png'));
if(sha(lobby)!=='0e6f04d91511f570a87d1f121326aa460c916056af725930c88d16e7eb2a2df9')throw Error('Approved Lotte Ayoon lobby art changed');
if(sha(equipment)!=='31f995a5f5b6652efadebd072c1c0e2c151516e2ba53f21dc56bdde52eefd5fd')throw Error('Generated Lotte Ayoon equipment master changed');
if(!(await sharp(equipment).metadata()).hasAlpha)throw Error('Equipment master needs genuine alpha');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const alpha=data[(y*info.width+x)*4+3];
  if(alpha===0)clear++;if(alpha>=240)solid++;
  if(alpha>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if((x===0||y===0||x===info.width-1||y===info.height-1)&&alpha>2)border++;
}
if(clear/(info.width*info.height)<.65||solid/(info.width*info.height)<.15||border)throw Error('Equipment alpha or complete silhouette check failed');
left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(1,608/crop.width,1512/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
// Preserve the generated alpha and proportions: uniform sizing and empty padding only.
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const padLeft=Math.floor((640-width)/2);
await sharp(body).extend({top:24,bottom:1664-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file(`lobby-v1-${width}.webp`)));
const files={};
for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
  const bytes=await readFile(file(name)),meta=await sharp(bytes).metadata();
  files[`avatar-lotte-ayoon-${name}`]={sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const manifest={name:'롯데 아윤',code:'LOTTE_AYOON',serial:'A-26',date:'2026-09-24',generator:'built-in image_gen',approval:'사용자: 롯데 아바타로 등록 롯데 아윤 / 장비창 리소스 만들어야함',identity:'사용자가 첨부한 롯데 아윤 크림·버건디 유니폼 로비 원본',equipment:'같은 얼굴·체형·의상의 별도 장비창 자세',backgroundRemoval:'none; native generated alpha retained',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1664,uniformScale:scale,bodyWidth:width,bodyHeight:height,top:24,bottom:1664-24-height},registration:{active:true,public:true,saleEnabled:false,acquisitionType:'EVENT',coinPrice:null,sourceOptions:'T1_JOEUN',grant:{clan:'롯데',expires:'current clan season ends_at',operation:'scripts/ops/avatar-lotte-ayoon-release-20260924.mjs'}},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

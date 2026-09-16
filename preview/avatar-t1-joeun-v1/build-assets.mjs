import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const file=name=>new URL(`./assets/avatar-t1-joeun-${name}`,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png'));
const equipment=await readFile(file('equipment-source-art-v1.png'));
if(sha(lobby)!=='83d1e267797a4377d00fa97ea5ae38f10572dfbbb00f07576bd6898241275ec7')throw Error('Approved T1 Joeun lobby art changed');
if(sha(equipment)!=='aa5c8f3154ee5705967b1c2129aa45ab275c2fae5429d0b82772510207907860')throw Error('Generated T1 Joeun equipment master changed');
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
  files[`avatar-t1-joeun-${name}`]={sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const manifest={name:'T1 조은',code:'T1_JOEUN',serial:'A-18',date:'2026-09-16',generator:'built-in image_gen',approval:'사용자: 좋아 장비창도 만들어서 추가해',identity:'승인된 경찰 조은 작화 느낌의 T1 유니폼 로비 원본',equipment:'같은 얼굴·체형·의상의 별도 장비창 자세',backgroundRemoval:'none; native generated alpha retained',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1664,uniformScale:scale,bodyWidth:width,bodyHeight:height,top:24,bottom:1664-24-height},registration:{active:false,public:false,saleEnabled:false,acquisitionType:'UNSET',coinPrice:null,effects:[],grant:false},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

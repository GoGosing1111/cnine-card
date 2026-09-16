import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const file=name=>new URL(`./assets/avatar-fm-orikkung-${name}`,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png'));
const equipment=await readFile(file('equipment-source-art-v1.png'));
if(sha(lobby)!=='62af91a108531f3ef8dfcecacb1f9f907c133759280b71e5923224b5cfab09b0')throw Error('Approved FM Orikkung lobby art changed');
if(sha(equipment)!=='ec03fb1c0e6868295cf208103ed66367047e7410a52b9ec60549803663095737')throw Error('Generated FM Orikkung equipment master changed');
if(!(await sharp(equipment).metadata()).hasAlpha)throw Error('Equipment master needs genuine alpha');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const alpha=data[(y*info.width+x)*4+3];
  if(alpha===0)clear++;if(alpha>=240)solid++;
  if(alpha>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if((x===0||y===0||x===info.width-1||y===info.height-1)&&alpha>2)border++;
}
if(clear/(info.width*info.height)<.45||solid/(info.width*info.height)<.15||border)throw Error('Equipment alpha or complete silhouette check failed');
left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(1,608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
// Preserve the generated alpha and proportions: uniform sizing and empty padding only.
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const padLeft=Math.floor((640-width)/2);
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file(`lobby-v1-${width}.webp`)));
const files={};
for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
  const bytes=await readFile(file(name)),meta=await sharp(bytes).metadata();
  files[`avatar-fm-orikkung-${name}`]={sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const manifest={name:'FM 오리꿍',code:'FM_ORIKKUNG',serial:'A-20',date:'2026-09-17',generator:'built-in image_gen',approval:'사용자: 장비창에 넣을 리소스 만들고 추가, T1 조은 옵션 동일, FM 클랜 11일 지급',identity:'승인된 덕코프 오리 형태의 FM 유니폼 로비 원본',equipment:'같은 오리 얼굴·체형·유니폼의 별도 장비창 자세',backgroundRemoval:'none; native generated alpha retained',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height,top:24,bottom:1088-24-height},registration:{active:true,public:true,saleEnabled:false,acquisitionType:'EVENT',coinPrice:null,effects:[{type:'COIN_GAIN_PERCENT',value:75},{type:'RAID_EXTRA_ENTRY',value:10}],grant:{clan:'FM',durationDays:11,sourceOptions:'T1_JOEUN',operation:'scripts/ops/avatar-fm-orikkung-release.mjs'}},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

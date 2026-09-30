import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const file=name=>new URL(`./assets/avatar-t1-orikkung-${name}`,import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png'));
const equipment=await readFile(file('equipment-source-art-v1.png'));
if(sha(lobby)!=='54a4f45ee00ae727a0cbcf9da869fd3fc567913aeae4e8f92a4c8629f328e7ab')throw Error('T1 Orikkung lobby master changed');
if(sha(equipment)!=='19e76d03de4b3325c075a5993c242f880360330e657948eb4b478b4c083d0a6f')throw Error('T1 Orikkung equipment master changed');
const meta=await sharp(equipment).metadata();
if(meta.width!==1024||meta.height!==1536||!meta.hasAlpha)throw Error('Equipment master must be genuine 1024×1536 RGBA');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const alpha=data[(y*info.width+x)*4+3];
 if(alpha===0)clear++;if(alpha>=240)solid++;
 if(alpha>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
 if((x===0||y===0||x===info.width-1||y===info.height-1)&&alpha>8)border++;
}
if(clear/(info.width*info.height)<.5||solid/(info.width*info.height)<.25||border)throw Error('Equipment transparency or silhouette clipping failed');
left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(info.width-1,right+4);bottom=Math.min(info.height-1,bottom+4);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const padLeft=Math.floor((640-width)/2);
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file(`lobby-v1-${width}.webp`)));
const files={};
for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
 const bytes=await readFile(file(name)),m=await sharp(bytes).metadata();
 files[`avatar-t1-orikkung-${name}`]={sha256:sha(bytes),bytes:bytes.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};
}
const manifest={name:'T1 오리꿍',code:'T1_ORIKKUNG_CHAINGUN',serial:'A-30',date:'2026-09-30',generator:'built-in image_gen',identityReference:'assets/ui/project-v/mercenaries/approved-20260926/mercenary-v050-sniper-orikkung-source-art-v1.png',clanMarkReference:'assets/ui/clan/marks/source/t1-clan-mark-source-v1.png',backgroundRemoval:'none; genuine generated alpha retained',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({alpha:manifest.alpha,runtime:manifest.runtime}));

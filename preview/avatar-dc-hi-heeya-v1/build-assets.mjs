import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const file=name=>new URL('./assets/avatar-dc-hi-heeya-'+name,import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const lobby=await readFile(file('lobby-source-art-v1.png')),equipment=await readFile(file('equipment-source-art-v1.png'));
if(sha(lobby)!=='a48d273bf7a5489d62f438ef72753cac9a050407539c9291c5efd7178befe0e5')throw Error('Approved lobby changed');
if(sha(equipment)!=='9316e7181826c76d89249595055317ecbe08dc3d1db7099552b1db454a9a3e58')throw Error('Approved equipment changed');
if(!(await sharp(equipment).metadata()).hasAlpha)throw Error('Native alpha required');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,borderMax=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
 if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(x===0||y===0||x===info.width-1||y===info.height-1)borderMax=Math.max(borderMax,a);
}
if(clear/(info.width*info.height)<.45||solid/(info.width*info.height)<.15||borderMax>8)throw Error('Alpha/silhouette validation failed');
left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(1,608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const padLeft=Math.floor((640-width)/2);
// Runtime derivatives retain the native alpha and body proportions; source PNGs are never modified.
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('lobby-v1-'+width+'.webp')));
const files={};
for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
 const b=await readFile(file(name)),m=await sharp(b).metadata();files['avatar-dc-hi-heeya-'+name]={sha256:sha(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};
}
const result={sourceProcessing:'Native alpha, uniform resizing and transparent padding only; approved PNGs unchanged',alpha:{clearPixels:clear,solidPixels:solid,borderMax,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
await writeFile(new URL('./runtime-manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex'),file=name=>new URL('./assets/diim-'+name,import.meta.url);
const equipment=await readFile(file('equipment-source-art-v3.png')),lobby=await readFile(file('lobby-source-art-v3.png'));
const m=await sharp(equipment).metadata(),lm=await sharp(lobby).metadata();
if(m.width!==1024||m.height!==1536||!m.hasAlpha||lm.width!==1024||lm.height!==1536)throw Error('Source format or dimensions mismatch');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
 if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
 if((x===0||y===0||x===info.width-1||y===info.height-1)&&a>8)border++;
}
if(clear/(info.width*info.height)<.5||solid/(info.width*info.height)<.15||border)throw Error('Generated alpha or clipping mismatch');
left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(info.width-1,right+4);bottom=Math.min(info.height-1,bottom+4);
const crop={left,top,width:right-left+1,height:bottom-top+1},scale=Math.min(608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale),padLeft=Math.floor((640-width)/2);
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v3-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('lobby-v3-'+width+'.webp')));
const files={};
for(const name of ['equipment-source-art-v3.png','lobby-source-art-v3.png','equipment-v3-640.webp','lobby-v3-1024.webp','lobby-v3-640.webp']){
 const b=await readFile(file(name)),meta=await sharp(b).metadata();files['diim-'+name]={sha256:sha(b),bytes:b.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
}
const result={generator:'built-in image_gen',date:'2026-10-03',currentRevision:3,identityReference:'assets/ui/project-v/mercenaries/approved-20260927/diim-nurse-source-art-v1.png',clanMarkReference:'assets/ui/clan/marks/hanwha-clan-mark-v1.webp',maleUniformReference:false,newPoseFromOriginalFace:true,userDirection:'여성 전용 유니폼; 짧고 밀착된 치마; 새 포즈; 키가 크고 날씬한 체형과 긴 다리',backgroundRemoval:'none; generated alpha preserved',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({alpha:result.alpha,runtime:result.runtime,files:result.files}));

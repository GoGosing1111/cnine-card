// Technical matte extraction for the project's exact-weapon compositor workflow.
// No painted pixels, generative weapon input, length adjustment or mesh deformation.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
const cfg=JSON.parse(await fs.readFile(file('sword-lock.json')));
const bytes=await fs.readFile(file(cfg.source));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(bytes)!==cfg.sha256)throw Error('Approved source changed');
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function inside(x,y,poly){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
const rect={left:405,top:610,width:715,height:575},out=Buffer.alloc(rect.width*rect.height*4);let copied=0;
for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
 const sx=x+rect.left,sy=y+rect.top;if(!cfg.polygons.some(p=>inside(sx+.5,sy+.5,p)))continue;
 const i=(sy*info.width+sx)*4,o=(y*rect.width+x)*4;data.copy(out,o,i,i+4);if(data[i+3])copied++;
}
await fs.mkdir(file('assets/locked'),{recursive:true});
const png=await sharp(out,{raw:{width:rect.width,height:rect.height,channels:4}}).png().toBuffer();
await fs.writeFile(file('assets/locked/approved-blade.png'),png);
await fs.writeFile(file('assets/locked/blade-provenance.json'),JSON.stringify({...cfg,sourceSha256:cfg.sha256,rect,width:rect.width,height:rect.height,grip:{x:cfg.sourceGrip.x-rect.left,y:cfg.sourceGrip.y-rect.top},tip:{x:cfg.sourceTip.x-rect.left,y:cfg.sourceTip.y-rect.top},sha256:hash(png),copiedPixels:copied,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',redrawnPixels:0,transformsAllowed:['uniformScale','rotation','translation']},null,2)+'\n');
console.log(JSON.stringify({copiedPixels:copied,redrawnPixels:0,sha256:hash(png)}));

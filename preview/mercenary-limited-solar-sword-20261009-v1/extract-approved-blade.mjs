// Exact approved-pixel selection, adapted from the approved X-BODY pipeline.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile(file('sword-lock.json'))),source=await fs.readFile(file(cfg.source));
if(hash(source)!==cfg.sha256)throw Error('Approved illustration changed');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),rect=cfg.rect,out=Buffer.alloc(rect.width*rect.height*4);
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
let copied=0;
for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
 const sx=x+rect.left,sy=y+rect.top;
 if(!cfg.polygons.some(p=>inside(sx+.5,sy+.5,p))||cfg.excludedHoles.some(p=>inside(sx+.5,sy+.5,p)))continue;
 const i=(sy*info.width+sx)*4,o=(y*rect.width+x)*4;data.copy(out,o,i,i+4);copied++;
}
await fs.mkdir(file('assets/locked'),{recursive:true});
const png=await sharp(out,{raw:{width:rect.width,height:rect.height,channels:4}}).png().toBuffer();
await fs.writeFile(file('assets/locked/approved-blade.png'),png);
await fs.writeFile(file('assets/locked/blade-provenance.json'),JSON.stringify({...cfg,width:rect.width,height:rect.height,grip:{x:cfg.sourceGrip.x-rect.left,y:cfg.sourceGrip.y-rect.top},tip:{x:cfg.sourceTip.x-rect.left,y:cfg.sourceTip.y-rect.top},sha256:hash(png),copiedPixels:copied,redrawnPixels:0,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',transformsAllowed:['uniformScale','translation','rotation']},null,2)+'\n');
console.log(JSON.stringify({copiedPixels:copied,redrawnPixels:0,sha256:hash(png)}));

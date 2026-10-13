import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {AURA_REGISTRATION as registration} from './aura-loop.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase(),manifest=JSON.parse(await fs.readFile(file('manifest.json'))),aura=manifest.effects.aura,cell=aura.cellSize,frames=[],registered=new Map(registration.sourceFrames.map(f=>[f.index,f]));
const envelope={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
const packed=await sharp(file(aura.atlas)).raw().toBuffer();
for(const f of aura.frames){const data=Buffer.alloc(cell*cell*4);for(let y=0;y<cell;y++){const offset=((Math.floor(f.index/4)*cell+y)*cell*4+f.index%4*cell)*4;packed.copy(data,y*cell*4,offset,offset+cell*4);}const r=registered.get(f.index);let minX=cell,minY=cell,maxX=0,maxY=0;
 if(r){for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(data[(y*cell+x)*4+3]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);}r.alphaBounds={left:minX,top:minY,right:maxX,bottom:maxY};envelope.left=Math.min(envelope.left,(minX-r.beak.x)/cell);envelope.right=Math.max(envelope.right,(maxX-r.beak.x)/cell);envelope.top=Math.min(envelope.top,(minY-r.beak.y)/cell*registration.verticalRatio);envelope.bottom=Math.max(envelope.bottom,(maxY-r.beak.y)/cell*registration.verticalRatio);}
 frames.push({data,splitY:r?r.beak.y+registration.frontTailOffsetPixels:Math.ceil(cell*.74),centerX:r?.beak.x??cell/2});
}
for(const part of ['rear','front']){const atlas=Buffer.alloc(cell*4*cell*3*4);for(const [n,{data,splitY,centerX}]of frames.entries())for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
 const i=(y*cell+x)*4,j=((Math.floor(n/4)*cell+y)*cell*4+n%4*cell+x)*4,curve=registration.depthCurvePixels*((x-centerX)/(cell*.5))**2,boundary=splitY-curve,q=Math.max(0,Math.min(1,(y-boundary)/registration.depthFeatherPixels+.5)),front=Math.round(data[i+3]*q*q*(3-2*q));
 data.copy(atlas,j,i,i+3);atlas[j+3]=part==='front'?front:data[i+3]-front;
 }
 const bytes=await sharp(atlas,{raw:{width:cell*4,height:cell*3,channels:4}}).png().toBuffer(),path=`assets/atlases/fx-aura-${part}-v2.png`;await fs.writeFile(file(path),bytes);manifest.effects['aura-'+part]={...manifest.effects['aura-'+part],atlas:path,sha256:hash(bytes),registrationVersion:2};
}
manifest.auraPlayback={...registration,sourceFrames:[...registered.values()],envelope,cellSize:cell,interpolation:'PREMULTIPLIED_LINEAR_IN_ISOLATED_LAYERS',bodyIdleFrame:0};manifest.revision='idle-stability-v2';
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Registered four continuous aura keyframes; original pixels preserved');

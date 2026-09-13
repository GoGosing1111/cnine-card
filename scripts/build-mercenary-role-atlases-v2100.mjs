import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ROLES} from '../shared/mercenary-position-config-v1.mjs';

const root='preview/mercenary-role-attacks-v2100/assets';
const inputs=JSON.parse(await fs.readFile(`${root}/generation-inputs.json`,'utf8'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const images=[];
if(inputs.length!==7||new Set(inputs.map(r=>r.role)).size!==7)throw Error('Expected all seven distinct mercenary roles');
for(const row of inputs){
 if(!ROLES[row.role])throw Error('Unknown mercenary role');
 const source=await fs.readFile(row.path),meta=await sharp(source).metadata();
 if(!meta.hasAlpha||meta.width!==meta.height||meta.width<1024)throw Error(`${row.role}: native square RGBA atlas required`);
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cell=Math.ceil(meta.width/4),frames=[],tiles=[],pixiFrames={},name=row.role.toLowerCase();
 await fs.mkdir(`${root}/${name}/frames`,{recursive:true});
 for(let i=0;i<16;i++){
  const col=i%4,line=Math.floor(i/4),left=Math.round(col*meta.width/4),top=Math.round(line*meta.height/4);
  const width=Math.round((col+1)*meta.width/4)-left,height=Math.round((line+1)*meta.height/4)-top;
  let edgeMax=0,nonempty=0,alphaTotal=0,minX=cell,minY=cell,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const alpha=data[((top+y)*info.width+left+x)*4+3];alphaTotal+=alpha;if(alpha>5)nonempty++;
   if(alpha>16){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY);}
   if(x<2||y<2||x>=width-2||y>=height-2)edgeMax=Math.max(edgeMax,alpha);
  }
  if(edgeMax>5||!nonempty&&i<15)throw Error(`${row.role}: frame ${i+1} invalid alpha or clipping (${edgeMax})`);
  const tile=await sharp(source).extract({left,top,width,height}).extend({left:0,top:0,right:cell-width,bottom:cell-height,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const raw=await sharp(tile).raw().toBuffer(),webp=await sharp(tile).webp({lossless:true,effort:6}).toBuffer(),file=`${name}/frames/${String(i+1).padStart(2,'0')}.webp`;
  await fs.writeFile(`${root}/${file}`,webp);tiles.push({input:tile,left:col*cell,top:line*cell});
  frames.push({index:i,file,edgeMax,nonempty,alphaTotal,bounds:maxX<0?null:[minX,minY,maxX+1,maxY+1],rawSha256:digest(raw),sha256:digest(webp)});
  pixiFrames[`${name}_${String(i).padStart(2,'0')}`]={frame:{x:col*cell,y:line*cell,w:cell,h:cell},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:cell,h:cell},sourceSize:{w:cell,h:cell}};
 }
 if(new Set(frames.map(f=>f.rawSha256)).size!==16)throw Error('Duplicated authored frame');
 const atlas=await sharp({create:{width:cell*4,height:cell*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles).webp({lossless:true,effort:6}).toBuffer();
 await fs.writeFile(`${root}/${name}/atlas.webp`,atlas);
 await fs.writeFile(`${root}/${name}/atlas.json`,JSON.stringify({frames:pixiFrames,meta:{image:'atlas.webp',format:'RGBA8888',size:{w:cell*4,h:cell*4},scale:'1'}}));
 images.push({role:row.role,label:ROLES[row.role].label,source:row.path,sourceSha256:digest(source),runtime:`/${root}/${name}/atlas.json`,runtimeSha256:digest(atlas),sourceSize:[meta.width,meta.height],cellSize:cell,frameCount:16,contactFrame:4,frames,prompt:row.prompt,generation:'BUILT_IN_IMAGEGEN',review:'USER_VISUAL_REVIEW_PENDING'});
 console.log(`${row.role}: 16 unique native frames, ${cell}px, clean transparent cell gutters`);
}
const approval=JSON.parse(await fs.readFile(`${root}/user-approval.json`,'utf8').catch(error=>{if(error.code==='ENOENT')return 'null';throw error;}));
const approved=Boolean(approval&&images.every(row=>approval.sources[row.role]===row.sourceSha256&&approval.runtimeAtlases[row.role]===row.runtimeSha256));
if(approved)for(const row of images)row.review='USER_APPROVED_LIVE_CONNECTION';
await fs.writeFile(`${root}/manifest.json`,JSON.stringify({version:2100,runtimeEnabled:approved,status:approved?'USER_APPROVED_LIVE_CONNECTION':'USER_VISUAL_REVIEW_PENDING',frameCount:112,images,renderer:{pixi:'8.20.0',gsap:'3.13.0',file:'preview/project-v-v3/source/battle/MercenaryRoleAttackFX.js',clock:'V3_REGISTERED_GSAP',autonomousTicker:false,contactFrame:4},processing:'Unchanged source bytes, exact grid extraction and lossless WebP only. No color key, repainted alpha, recoloring or fabricated frames.'},null,2)+'\n');

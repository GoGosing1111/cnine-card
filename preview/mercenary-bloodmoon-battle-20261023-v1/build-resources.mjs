import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {BLOODMOON_COMBAT,RELEASE} from './balance.mjs';
import {applyIdleFeetRepairs} from './idle-feet-repairs.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),prefix='preview/mercenary-bloodmoon-battle-20261023-v1/';
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const sources=[
 ['bongsoon','01-bongsoon-gatling-v4-photo-face-approved.png','F72CFF4055340C7859649F0A971B2557E16DDFC57F7AB8EBD7E1309B070E4A8E',308,'barrage'],
 ['joeun','02-joeun-whip-approved.png','2756F59F1703411C57D7257FB10F049DF046241CF395A646610B9EA19E567787',327,'melee'],
 ['diim','03-diim-scythe-approved.png','EC0AE02A8DCF159DDEA5BAC6215EB56CA271FADA9EA19E4A4DB2589513A5D537',292,'melee'],
 ['claws','04-original-claws-approved.png','4A3CE150F220EF56CBE8C457F1CD4329650C0DA8092848D90E54873D058E728F',305,'melee'],
 ['dagger','05-original-dagger-approved.png','B438EA1FCD38F7D04C960FEDD04EF350A99EFB0B21940C27444E4E90860F2EC8',350,'melee']
];
async function info(relative){const b=await fs.readFile(path.join(dir,relative)),m=await sharp(b).metadata();return {path:relative,width:m.width,height:m.height,sha256:sha(b),hasAlpha:Boolean(m.hasAlpha),bytes:b.length};}
// Atlas un-packing only: every nontransparent source pixel is copied once with
// identical RGBA bytes. No character is resized, redrawn, shortened or warped.
// Connected silhouettes avoid cutting bodies at an assumed mathematical grid.
async function unpack(slug,referenceBodyPixels){
 const relative=`assets/${slug}/${slug==='diim'?'motion-v2-complete.png':'motion.png'}`,source=await info(relative),{data,info:im}=await sharp(path.join(dir,relative)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),w=im.width,h=im.height,N=w*h;
 const seen=new Uint8Array(N),queue=new Int32Array(N),cores=[],coreAlpha=slug==='diim'?128:80;
 for(let p=0;p<N;p++){
  if(seen[p]||data[p*4+3]<coreAlpha)continue;let start=0,end=1,x0=w,y0=h,x1=0,y1=0;queue[0]=p;seen[p]=1;
  while(start<end){const i=queue[start++],x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=coreAlpha){seen[n]=1;queue[end++]=n;}
  }if(end>3000)cores.push({ids:Int32Array.from(queue.subarray(0,end)),x0,y0,x1,y1});
 }
 if(cores.length!==16)throw Error(`${slug}: expected 16 separate body silhouettes, got ${cores.length}`);
 cores.sort((a,b)=>a.y0-b.y0);const ordered=[];for(let i=0;i<16;i+=4)ordered.push(...cores.slice(i,i+4).sort((a,b)=>a.x0-b.x0));
 const owner=new Uint8Array(N);let start=0,end=0;
 for(let k=0;k<16;k++)for(const p of ordered[k].ids){owner[p]=k+1;queue[end++]=p;}
 while(start<end){const p=queue[start++],x=p%w,y=Math.floor(p/w);for(const n of [x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!owner[n]){owner[n]=owner[p];queue[end++]=n;}}
 const groups=Array.from({length:16},()=>({x0:w,y0:h,x1:0,y1:0,count:0}));let sourcePixels=0;
 for(let p=0;p<N;p++)if(data[p*4+3]){const r=groups[owner[p]-1],x=p%w,y=Math.floor(p/w);r.x0=Math.min(r.x0,x);r.y0=Math.min(r.y0,y);r.x1=Math.max(r.x1,x);r.y1=Math.max(r.y1,y);r.count++;sourcePixels++;}
 const frames=[];await fs.mkdir(path.join(dir,`assets/${slug}/frames`),{recursive:true});let copiedPixels=0;
 for(let k=0;k<16;k++){
  const r=groups[k],c=ordered[k],cw=r.x1-r.x0+1,ch=r.y1-r.y0+1,pad=8,size=Math.max(512,Math.ceil((Math.max(cw,ch)+pad*2)/64)*64),pixels=Buffer.alloc(size*size*4);
  let footX=0,footN=0;for(const p of c.ids){const y=Math.floor(p/w);if(y>=c.y1-3){footX+=p%w;footN++;}}
  let ex=c.x0,ey=0,en=0;for(const p of c.ids){const x=p%w,y=Math.floor(p/w);if(y>c.y0+(c.y1-c.y0)*.12&&y<c.y0+(c.y1-c.y0)*.72)ex=Math.max(ex,x);}
  for(const p of c.ids){const x=p%w,y=Math.floor(p/w);if(x>=ex-3&&y<c.y0+(c.y1-c.y0)*.72){ey+=y;en++;}}
  const from=[],to=[];
  for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const p=y*w+x;if(owner[p]!==k+1||!data[p*4+3])continue;const dst=((y-r.y0+pad)*size+x-r.x0+pad)*4;data.copy(pixels,dst,p*4,p*4+4);copiedPixels++;from.push(data.subarray(p*4,p*4+4));to.push(pixels.subarray(dst,dst+4));}
  const sourcePixelSha=sha(Buffer.concat(from)),copiedPixelSha=sha(Buffer.concat(to));if(sourcePixelSha!==copiedPixelSha)throw Error('Pixel-copy mismatch');
  const file=`assets/${slug}/frames/${String(k).padStart(2,'0')}.png`;await sharp(pixels,{raw:{width:size,height:size,channels:4}}).png().toFile(path.join(dir,file));
  const dx=pad-r.x0,dy=pad-r.y0,foot={x:(footN?footX/footN:(c.x0+c.x1)/2)+dx,y:c.y1+dy};
  frames.push({index:k,path:file,rect:{x:0,y:0,width:size,height:size},foot,emitter:{x:ex+dx,y:(en?ey/en:(c.y0+c.y1)/2)+dy},bounds:[c.x0+dx,c.y0+dy,c.x1+dx,c.y1+dy],visibleHeight:referenceBodyPixels,
   sourceBounds:[r.x0,r.y0,r.x1,r.y1],sourceOffset:{x:r.x0-pad,y:r.y0-pad},sourcePixels:r.count,sourcePixelSha,copiedPixelSha,sha256:sha(await fs.readFile(path.join(dir,file))),scaleApplied:1});
 }
 if(copiedPixels!==sourcePixels)throw Error('Lost or duplicate source pixels');
 return {source,frames,bodyPixels:referenceBodyPixels,pixelAudit:{sourcePixels,copiedPixels,scaleApplied:1,coreAlpha,allOriginalRgbaPreserved:true,method:'16_ALPHA_COMPONENTS_PLUS_NEAREST_FRINGE_PIXEL_COPY'}};
}
const characters=[];
for(const [slug,file,hash,bodyPixels,skillKind]of sources){
 const p=Object.values(BLOODMOON_COMBAT).find(p=>p.slug===slug),art=await info('assets/sources/'+file);if(art.sha256!==hash)throw Error(slug+': approved source hash mismatch');
 const m=await unpack(slug,bodyPixels),fx=await info(`assets/${slug}/skill-fx.png`);if(!fx.hasAlpha)throw Error(slug+': effects lack alpha');
 fx.columns=4;fx.rows=4;fx.frames=Array.from({length:16},(_,i)=>{const x=Math.round((i%4)*fx.width/4),y=Math.round(Math.floor(i/4)*fx.height/4);return {index:i,rect:{x,y,width:Math.round((i%4+1)*fx.width/4)-x,height:Math.round((Math.floor(i/4)+1)*fx.height/4)-y}};});
 const sprite=await info(m.frames[0].path);sprite.frames=[m.frames[0]];
 characters.push({id:'BLOODMOON-'+slug.toUpperCase(),slug,name:p.name,previewCode:p.code,previewCodeIsAssignment:false,rank:null,accent:'#eb4164',skillKind,skillName:p.skill.name,skillId:p.skill.id,combat:p,sourceArt:art,
  originalMotion:m.source,battleSprite:sprite,battleSpriteFootAnchor:{x:m.frames[0].foot.x/sprite.width,y:m.frames[0].foot.y/sprite.height},
  motion:{basic:{frames:m.frames.slice(0,8),bodyPixels},skillMotion:{frames:m.frames.slice(8).map((f,i)=>({...f,index:i})),bodyPixels}},effects:{skill:fx},pixelAudit:m.pixelAudit,
  bodyPixels,battleBodyHeight:345,sourceArtApproval:'USER_APPROVED',motionSelection:slug==='bongsoon'?'USER_SELECTED_ORIGINAL_DO_NOT_SHRINK':'USER_REVIEW_PENDING',generatedArtApproval:'USER_REVIEW_PENDING',missing:[],ready:true,runtimeEnabled:false});
}
for(const character of characters)await applyIdleFeetRepairs(character,dir);
// Remove exterior UI padding by alpha bounds; the raw generated master remains.
const buttonMaster=path.join(dir,'assets/ui/button-source.png'),buttonRaw=await sharp(buttonMaster).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let bx0=buttonRaw.info.width,by0=buttonRaw.info.height,bx1=0,by1=0;
for(let y=0;y<buttonRaw.info.height;y++)for(let x=0;x<buttonRaw.info.width;x++)if(buttonRaw.data[(y*buttonRaw.info.width+x)*4+3]>16){bx0=Math.min(bx0,x);by0=Math.min(by0,y);bx1=Math.max(bx1,x);by1=Math.max(by1,y);}
await sharp(buttonMaster).extract({left:bx0,top:by0,width:bx1-bx0+1,height:by1-by0+1}).png().toFile(path.join(dir,'assets/ui/button.png'));
const manifest={format:'PROJECT_V_BLOODMOON_BATTLE_REVIEW_V1',dateKST:'2026-10-23',title:'블러드문 리미티드 · 전투 리소스',prefix,status:'IMPLEMENTED_USER_VISUAL_REVIEW_PENDING',...RELEASE,totalCharacters:5,totalMotionFrames:80,totalEffectFrames:80,characters,
 promptRecord:'prompts-v3-current.json',userCorrections:[{asset:'bongsoon/motion.png',instruction:'이거 써 캐릭터 줄이지말고',sha256:'879FC5E4486698648E2285A0431275542432AA70C96231623A5AE437CF2457FF',resolved:'Original file preserved byte-for-byte; unpacking never resizes pixels.'},{asset:'dagger/motion.png',instruction:'왼쪽 상단2개 다리짤림',resolved:'ImageGen repaired both idle frames with complete calves and boots.'}],
 assetPolicy:{originalPixelsPreserved:true,characterResampling:false,frameIsolation:'COPY_EACH_NONTRANSPARENT_PIXEL_EXACTLY_ONCE',bodyScale:'FIXED_PER_CHARACTER_NOT_PER_POSE'},
 renderer:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',implementation:prefix+'source/BloodmoonFX.js',adapter:'js/project-v-mercenary-battle-art-adapter-v1.js',cardDock:'js/battle-v3-live.js',clock:'ONE_V3_REGISTERED_GSAP_TIMELINE',damageAuthority:'CANONICAL_SERVER_SIMULATION_ONLY',newSound:false},
 ui:{panel:await info('assets/ui/panel.png'),button:await info('assets/ui/button.png')},validation:{browserReview:'PENDING',visualApproval:'USER_REVIEW_PENDING'}};
manifest.additionalPromptRecords=['prompts-idle-feet-v2.json'];
manifest.userCorrections.push({instruction:'다리 짤렸는데? 나무늘봉순',resolved:'Both cropped idle boot bottoms repaired with ImageGen; selected source atlas and other fourteen poses preserved.'});
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({characters:5,motionFrames:80,effectFrames:80,pixelsUnchanged:characters.every(c=>c.pixelAudit.allOriginalRgbaPreserved)}));

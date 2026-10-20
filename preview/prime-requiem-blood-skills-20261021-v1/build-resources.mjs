import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SKILLS} from './source/SkillPlan.mjs';
import {MOTION_SOURCE,MOTION_SHA256,MOTION_FRAMES,BODY_PIXELS,READY_POSE} from './source/MotionAtlas.mjs';
import {attachIdleResources} from './build-idle-resources.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
async function inspect(file,grid=null,body=false,rectangles=null){
  const bytes=await fs.readFile(path.join(root,file)),meta=await sharp(bytes).metadata();
  const record={path:file,width:meta.width,height:meta.height,sha256:hash(bytes),bytes:bytes.length,hasAlpha:!!meta.hasAlpha};
  if(!grid)return record;
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [cols,rows]=grid;record.frames=[];
  for(let i=0;i<cols*rows;i++){
    const col=i%cols,row=Math.floor(i/cols),x=rectangles?.[i]?.x??Math.round(col*info.width/cols),y=rectangles?.[i]?.y??Math.round(row*info.height/rows);
    const width=rectangles?.[i]?.width??Math.round((col+1)*info.width/cols)-x,height=rectangles?.[i]?.height??Math.round((row+1)*info.height/rows)-y;
    let x0=width,y0=height,x1=-1,y1=-1,clear=0,border=0;const raw=[];
    for(let yy=0;yy<height;yy++){
      const start=((y+yy)*info.width+x)*4;raw.push(data.subarray(start,start+width*4));
      for(let xx=0;xx<width;xx++){
        const a=data[start+xx*4+3];if(a<=8)clear++;
        if(a>96){x0=Math.min(x0,xx);y0=Math.min(y0,yy);x1=Math.max(x1,xx);y1=Math.max(y1,yy);if(xx<2||yy<2||xx>=width-2||yy>=height-2)border++;}
      }
    }
    const frame={index:i,rect:{x,y,width,height},bounds:[x0,y0,x1,y1],clearRatio:clear/(width*height),borderPixels:border,pixelSha256:hash(Buffer.concat(raw))};
    if(body){
      let footSum=0,n=0,tip=-1,tipY=0,tipN=0;
      for(let yy=Math.max(0,y1-8);yy<=y1;yy++)for(let xx=Math.max(0,x0);xx<=x1;xx++)if(data[((y+yy)*info.width+x+xx)*4+3]>192){footSum+=xx;n++;}
      for(let yy=Math.max(0,y0);yy<Math.min(height,y0+(y1-y0)*.75);yy++)for(let xx=Math.max(0,x0);xx<=x1;xx++)if(data[((y+yy)*info.width+x+xx)*4+3]>192){
        if(xx>tip){tip=xx;tipY=yy;tipN=1;}else if(xx===tip){tipY+=yy;tipN++;}
      }
      Object.assign(frame,{foot:{x:n?footSum/n:(x0+x1)/2,y:y1},emitter:{x:Math.max(0,tip),y:tipN?tipY/tipN:y0+(y1-y0)*.4},visibleHeight:y1-y0+1});
    }
    record.frames.push(frame);
  }
  record.columns=cols;record.rows=rows;record.frameCount=cols*rows;
  record.uniqueFrameCount=new Set(record.frames.map(f=>f.pixelSha256)).size;
  if(body)record.bodyPixels=record.frames[15]?.visibleHeight||record.frames[0].visibleHeight;
  return record;
}
const labels={
  'fx-blood-dash':'혈섬 돌진','fx-blood-echo':'혈영 연참',
  'fx-blood-frenzy-v2':'혈검 난무 · 검격 4방향',
  'fx-blood-tiger-burst':'혈호 강림 · 머리 응축부터 폭발',
  'fx-blood-execution-v2':'혈영섬 · 참형',
  'fx-blood-mantle-v3':'전신 혈갑 · 굵은 혈류 나선',
  'fx-blood-titanblade-v3':'혈천개벽 · 거대 혈검 응축',
  'fx-blood-cataclysm-v3':'혈천개벽 · 혈류 기둥',
  'fx-blood-mooncleave-v3':'적월 무간참 · 혈월 참격'
};
const sheets={};
const motion=await inspect(MOTION_SOURCE,[4,2],true,MOTION_FRAMES.map(f=>({x:f.rect[0],y:f.rect[1],width:f.rect[2],height:f.rect[3]})));
if(motion.sha256!==MOTION_SHA256)throw Error('USER_MOTION_SOURCE_CHANGED');
motion.label='사용자 첨부 원본 · 8동작';motion.bodyPixels=BODY_PIXELS;motion.readyPose=READY_POSE;
motion.frameConsumption='ORIGINAL_TEXTURE_UV_POLYGON_CLIP_NO_PIXEL_EDIT';
motion.frames.forEach((f,i)=>{
  const manual=MOTION_FRAMES[i];
  for(const point of ['foot','emitter','grip','core','crown'])f[point]={x:manual[point][0]-f.rect.x,y:manual[point][1]-f.rect.y};
  f.clip=manual.clip.map((v,j)=>v-(j%2?manual.foot[1]:manual.foot[0]));
});
sheets['motion-user-eight-v2']=motion;
for(const [key,label]of Object.entries(labels)){
  sheets[key]={...await inspect('assets/'+key+'.png',key==='fx-blood-titanblade-v3'?[4,2]:[4,4]),label};
  if(key==='fx-blood-tiger-burst'){
    sheets[key].frames=sheets[key].frames.slice(4).map((f,i)=>({...f,sourceIndex:f.index,index:i}));
    sheets[key].frameCount=12;sheets[key].uniqueFrameCount=12;sheets[key].sourceStartFrame=4;
  }
}
const idle=motion.frames[READY_POSE];
await sharp(path.join(root,MOTION_SOURCE)).extract({left:idle.rect.x,top:idle.rect.y,width:idle.rect.width,height:idle.rect.height}).png().toFile(path.join(root,'assets/battle-ready-v2.png'));
const battleSprite=await inspect('assets/battle-ready-v2.png');battleSprite.footAnchor={x:idle.foot.x/idle.rect.width,y:idle.foot.y/idle.rect.height};battleSprite.derivation='LOSSLESS_RECTANGLE_EXTRACTION_RUNTIME_UV_CLIP';
for(const skill of SKILLS){
  const key=skill.effect,index=skill.iconFrame??(skill.kind==='tiger'?0:9);
  const f=sheets[key].frames[index];
  await sharp(path.join(root,sheets[key].path)).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).png().toFile(path.join(root,'assets/icon-'+skill.id+'.png'));
}
const sourceArt=await inspect('sources/prime-requiem-fantasy-reference.png'),approvedOriginal=await inspect('sources/approved-berserker-original.png');
if(approvedOriginal.sha256!=='8F4ACE03384289F09508368030DE3F7B4E7BF5C31BA63517674827921086604A')throw Error('APPROVED_SOURCE_CHANGED');
if(sourceArt.sha256!=='B2D1C5DF8553370EC9FF90D72E27562C404C24DCECF33935BB74F0EDC13D2FDC')throw Error('FANTASY_REFERENCE_CHANGED');
const lock=JSON.parse(await fs.readFile(path.join(root,'../../package-lock.json'),'utf8'));
const warnings=Object.entries(sheets).flatMap(([sheet,s])=>s.frames.filter(f=>f.borderPixels).map(f=>({sheet,frame:f.index,borderPixels:f.borderPixels,reason:'GENERATED_CELL_EDGE_VISUAL_REVIEW_REQUIRED'})));
const manifest={
  format:'PROJECT_V_PRIME_REQUIEM_BLOOD_SKILLS_PREVIEW_V3',createdKST:'2026-10-21',status:'PREVIEW_USER_VISUAL_REVIEW_PENDING',
  character:{slug:'prime-requiem',name:'프라임 레퀴엠',englishName:'PRIME REQUIEM',grade:'SSS',limited:true,nameAndGradeAuthority:'USER_EXPLICIT_2026-10-20',rosterCode:null},
  sourceArt,approvedOriginal,battleSprite,sheets,skills:SKILLS,
  generatedUI:await inspect('assets/ui-blood-forged-frame.png'),battlefield:await inspect('assets/blood-sanctum.png'),
  renderer:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',entry:'source/battle-preview.js',effects:'source/PrimeRequiemFX.js',cardDock:'js/battle-v3-live.js',adapter:'js/project-v-mercenary-battle-art-adapter-v1.js',pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,clock:'ONE_V3_REGISTERED_GSAP_TIMELINE',layers:['combatLayer','effectLayer'],proceduralFX:false,newSound:false},
  permissions:{liveEnabled:false,acquisitionEnabled:false,gameplaySkillsAssigned:false,visualApproval:false,price:null,dropProbability:null},
  assetPolicy:{originalPixelsPreserved:true,sourceArtIsNotBattleSprite:true,frameConsumption:'PIXI_TEXTURE_RECTANGLES_WITH_SOURCE_UV_CLIPS',normalCards:5,mercenarySlot:1,bodyScale:'ONE_FIXED_UNIFORM_SCALE_FOR_ALL_EIGHT_POSES',automaticApproval:false},
  revision:{defaultAttackSpeed:2,rejectedSkills:['blood-core','requiem'],replacementSkills:['blood-frenzy','blood-execution'],preservedSkills:SKILLS.filter(s=>!s.showcase).map(s=>s.id),addedShowcases:SKILLS.filter(s=>s.showcase).map(s=>s.id),oldBodySheetsLoaded:false,runningTigerLoaded:false,tigerFirstSourceFrame:4,readyPose:READY_POSE,readyPoseAuthority:'USER_20261021_UPRIGHT_BOTH_FEET_PLANTED',aura:'fx-blood-mantle-v3',auraOpacity:.85,neon:'SOURCE_ALPHA_CONTOUR_OVER_AURA_AND_RED_OUTER_GLOW',neonRimWidth:2.25,referenceVideo:{url:'https://youtu.be/vfBuylrhTFc',title:'[던파] 진(眞) 버서커',inspectedPlaybackRate:.4,applied:['sword-first close combat','alternating cuts','brief impact holds','delayed blood trails','blood gather then large ground eruption','fast rush into oversized crescent finisher']}},
  validation:{uniqueFrames:Object.values(sheets).every(s=>s.uniqueFrameCount===s.frameCount),trueAlpha:Object.values(sheets).every(s=>s.hasAlpha),generatedCellWarnings:warnings,visualApproval:'USER_REVIEW_PENDING',browser:'NOT_RUN'}
};
await attachIdleResources(root,manifest);
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'name-grade-confirmation.json'),JSON.stringify({name:'프라임 레퀴엠',grade:'SSS',limited:true,userInstruction:'SSS리미티드로 프라임 레퀴엠 이라고 명명하고',confirmed:true,scope:'NAME_AND_GRADE_ONLY',sourceArt:sourceArt.sha256,approvedBaseline:approvedOriginal.sha256,liveEnabled:false},null,2)+'\n');
console.log(JSON.stringify({sheets:Object.keys(sheets).length,motionFrames:8,effectFrames:Object.entries(sheets).filter(([k])=>k.startsWith('fx-')).reduce((n,[,s])=>n+s.frameCount,0),alpha:manifest.validation.trueAlpha,unique:manifest.validation.uniqueFrames,cellWarnings:warnings.length,approvedHash:approvedOriginal.sha256,userMotionHash:motion.sha256}));

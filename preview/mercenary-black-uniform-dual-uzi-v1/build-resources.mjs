import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {AURA_REGISTRATION} from './aura-registration.mjs';
import {SKILL,QUANTUM,missiles} from './skill.mjs';
import {BULLET} from './bullet-flight.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
async function info(file){const b=await fs.readFile(path.join(root,file)),m=await sharp(b).metadata();return {path:file,width:m.width,height:m.height,channels:m.channels,hasAlpha:m.hasAlpha,bytes:b.length,sha256:hash(b)};}
async function atlas(file,cols,rows,muzzles,rowCuts){
 const asset=await info(file);if(!asset.hasAlpha)throw Error('Missing alpha: '+file);
 const {data,info:m}=await sharp(path.join(root,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const frames=[];
 for(let i=0;i<cols*rows;i++){
  const x=Math.round(i%cols*m.width/cols),y=rowCuts?.[Math.floor(i/cols)]??Math.round(Math.floor(i/cols)*m.height/rows),w=Math.round((i%cols+1)*m.width/cols)-x,h=(rowCuts?.[Math.floor(i/cols)+1]??Math.round((Math.floor(i/cols)+1)*m.height/rows))-y;
  let minX=w,minY=h,maxX=-1,maxY=-1,border=0,clear=0;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const a=data[((y+yy)*m.width+x+xx)*4+3];if(a===0)clear++;if(a>32){minX=Math.min(minX,xx);minY=Math.min(minY,yy);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,yy);if(xx===0||yy===0||xx===w-1||yy===h-1)border++;}}
  if(maxX<0||clear<w*h*.12||border>0)throw Error('Frame alpha/bounds failed '+file+' #'+i+' border='+border);
  let sx=0,n=0;for(let yy=Math.max(minY,maxY-12);yy<=maxY;yy++)for(let xx=minX;xx<=maxX;xx++){if(data[((y+yy)*m.width+x+xx)*4+3]>160){sx+=xx;n++;}}
  frames.push({rect:{x,y,width:w,height:h},bounds:[minX,minY,maxX,maxY],clearRatio:clear/(w*h),borderPixelsAt32:border,foot:muzzles?{x:n?sx/n:(minX+maxX)/2,y:maxY}:undefined,bodyHeight:muzzles?maxY-minY:undefined,muzzles:muzzles?.[i]});
 }
 return {...asset,columns:cols,rows,frameCount:frames.length,frames};
}
const muzzlePoints=[[[313,147],[300,205]],[[320,159],[305,211]],[[315,135],[309,198]],[[329,148],[308,211]],[[314,102],[308,161]],[[330,113],[325,168]],[[325,90],[315,157]],[[329,109],[323,171]]];
const motion=await atlas('assets/standing-burst-motion-v2.png',4,2,muzzlePoints);
const aura=await atlas('assets/scope-ballistic-aura-12f-v2.png',4,3);
aura.frames.forEach((f,i)=>{f.registration=AURA_REGISTRATION[i];});
const muzzle=await atlas('assets/uzi-muzzle-8f-v1.png',4,2);
const impact=await atlas('assets/scope-elimination-16f-v2.png',4,4);
const convergence=await atlas('assets/quantum-bullet-convergence-12f-v1.png',4,3);
// The generator's row gutters are offset from the nominal grid. Read exact clear gutters;
// keep every native pixel and assert transparent boundaries rather than clipping the blast.
const collapse=await atlas('assets/quantum-ballistic-collapse-16f-v2.png',4,4,undefined,[0,324,639,950,1254]);
convergence.frames.forEach((f,i)=>{f.registration={x:[186,548,909,1270][i%4]-f.rect.x,y:[181,543,902][Math.floor(i/4)]-f.rect.y};});
collapse.frames.forEach((f,i)=>{f.registration={x:[168,477,781,1084][i%4]-f.rect.x,y:[196,515,821,1095][Math.floor(i/4)]-f.rect.y};});
const blastFrames=collapse.frames.slice(4);
collapse.extents={
 left:Math.max(...blastFrames.map(f=>(f.registration.x-f.bounds[0])/f.rect.width)),
 right:Math.max(...blastFrames.map(f=>(f.bounds[2]-f.registration.x)/f.rect.width)),
 up:Math.max(...blastFrames.map(f=>(f.registration.y-f.bounds[1])/f.rect.width)),
 down:Math.max(...blastFrames.map(f=>(f.bounds[3]-f.registration.y)/f.rect.width))};
const props={};
for(const [key,file,source] of [['missile','strike-missile-body-v1.webp','rocket.webp'],['missileExhaust','strike-missile-exhaust-v1.webp','exhaust.webp'],['missileSmoke','strike-missile-smoke-v1.webp','smoke.webp']]){
 const a=await info('assets/'+file),original=await info('../battle-suit-skill-chip-v1/assets/textures/'+source);
 if(a.sha256!==original.sha256)throw Error('Shared missile texture was modified');
 props[key]={...a,source:original.path,reusedWithoutPixelEdits:true,frameCount:1,frames:[{rect:{x:0,y:0,width:a.width,height:a.height}}]};
}
const sourceArt=await info('assets/black-uniform-dual-uzi-source-art-v4-face-angle-locked.png');
const battle=await info('assets/black-uniform-dual-uzi-battle-v3-longhair.png');
if(sourceArt.width!==1024||sourceArt.height!==1536||sourceArt.channels!==3||!battle.hasAlpha)throw Error('Native portrait/transparent sprite format mismatch');
const prompts=await Promise.all((await fs.readdir(path.join(root,'prompts'))).filter(x=>x.endsWith('.txt')).map(async f=>({path:'prompts/'+f,text:await fs.readFile(path.join(root,'prompts',f),'utf8')})));
const lock=JSON.parse(await fs.readFile(path.join(root,'../../package-lock.json'),'utf8'));
const approval=JSON.parse(await fs.readFile(path.join(root,'visual-approval-20261014.json'),'utf8'));
const manifest={schemaVersion:3,title:'카이론 · 흑탄의 집행관 / 일제난사 · 양자 탄도 폭쇄',updatedDate:'2026-10-14',timezone:'Asia/Seoul',status:'CRAFT_PREPARED_CMS_LOCKED',policyApprovalRecord:'kairon-approval-20261014.json',approvalRecord:'visual-approval-20261014.json',
 userCorrection:{faceAngle:'최신 첨부의 얼굴 각도 고정. 고개를 돌리지 않고 눈동자만 사격 방향으로.',hair:'어깨 아래로 이어지는 자연스러운 검은 장발',aura:'SSS 리미티드급 군인·스나이핑·탄환 광원',skill:'일제난사: 양손 우지 난사와 스코프 표적 집중 타격'},
 reference:await info('reference/user-face-angle-locked-20261014.png'),
 generator:{mode:'BUILT_IN_IMAGE_GEN',rawPngPreserved:true,manualPixelEdits:false,upscaled:false,atlasAccess:'원본 시트를 Pixi Texture 사각형으로 읽음. 재압축·배경 제거·워핑 없음.'},
 character:{assignedName:'카이론',assignedCode:'V-988',rank:'SSS',presentationQuality:'SSS_LIMITED_GRADE_REQUESTED',skillName:'일제난사',facing:'RIGHT',stance:'STANDING',naturalAdultProportions:true,namingProposal:{...approval.namingProposal,status:'USER_CONFIRMED'}},
 release:{userVisualApproval:true,runtimeConnected:true,catalogConnected:true,acquisitionEnabled:false,acquisition:'CRAFT_ONLY',packEligible:false,craftLockedUntilCms:true,balanceConfigured:true,balanceReference:'V-989',previewOnly:false},
 sourceArt,battleSprite:{...battle,foot:{x:530,y:1478},bodyHeight:1404},
 motion:{burst:motion},effects:{aura,muzzle,impact,convergence,collapse},props,
 latestRevision:{request:'일제난사와 광역기 사격 모두 휘는 탄도를 없애고 강렬한 직선 사격으로 수정',straightShots:{...BULLET,implementation:'bullet-flight.mjs',modes:['barrage','quantum'],trajectory:'총구와 명중점을 잇는 직선. 곡선 보간·낙차 없음.',lighting:'짧은 예광탄의 백색 중심 + 얇은 금빛 광원, 8프레임 총구 섬광, 명중 파열과 직선 파편',contact:'비행 0.055초 후 탄환 도착점과 같은 좌표에서 타격 시작'},auraRegistration:'12프레임 실제 원 중심을 고정 좌표에 정렬한 뒤 제자리 회전 / 원본 픽셀 보존',outline:'포즈별 알파를 보존한 흰색 실루엣 8방향 외곽 + 이중 블룸',areaSkill:'양자 탄도 폭쇄: 적 5명 포착 → 쌍우지 직선 사격·좌표 지정 → 상공 미사일 강하 → 적 몸통 높이 직격 대폭발 → 5명 연쇄 미사일 명중',impactAnchor:'적 몸통 좌표 범위의 중심. 상단 잘림 방지는 크기에만 적용하며 폭발 위치를 아래로 이동시키지 않음.',missileTipAnchor:'원본 미사일 전방 끝 (1,0.5), 아래 방향 90도 회전. 탄두와 폭발이 동일한 적 좌표 사용.'},
 skillPlans:{barrage:SKILL,quantum:{...QUANTUM,missiles}},
 timing:{duration:5.8,lock:[0,.9],firing:[.9,3.1],doubleVolleys:20,volleyInterval:.11,finish:[3.25,3.47,3.69],fadesUntil:5.5,previewDamage:null},
 renderer:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',implementation:'source/UziBarrageFX.js',entry:'source/battle-preview.js',pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,layers:['combatLayer','effectLayer'],clock:'ONE_GSAP_TIMELINE',pixiAutoPlay:false,soundAdded:false,sharedGameplayFilesChanged:true},
 validation:{alphaAndCellBounds:true,frameCount:72,characterFrames:8,effectFrames:64,muzzleAnchorMethod:'ASSISTANT_VISUAL_MARKUP_PIXELS',visualApproval:'USER_APPROVED',browserReview:'qa/review.json'},
 superseded:{sourceArt:'source-art-v1/v2와 측면으로 회전한 v3는 현재 기준이 아님. 사용자 재첨부 얼굴 각도에 맞춘 v4가 현재 시안.',battle:'기존 짧은 머리·측면 얼굴 이미지와 가장자리 여백 보정 전 시트는 이력으로만 보존.',collapse:'quantum-ballistic-collapse-16f-v1.png는 셀 경계 간섭으로 미채택. 여백을 보정한 v2 원본을 사용한다.'},prompts};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({frames:72,sourceArt:sourceArt.path,battle:battle.path,dimensions:{motion:[motion.width,motion.height],aura:[aura.width,aura.height],muzzle:[muzzle.width,muzzle.height],impact:[impact.width,impact.height],convergence:[convergence.width,convergence.height],collapse:[collapse.width,collapse.height]},cellBounds:'PASS'}));

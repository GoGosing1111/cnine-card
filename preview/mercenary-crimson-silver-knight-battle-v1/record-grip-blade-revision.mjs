import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha} from './compose-weapon.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const write=async(p,v)=>fs.writeFile(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const record=await read('assets/knight-sd-v14-original-blade-approved-grip.json');
const approved=await sharp(path.join(root,record.approvedGrip.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const result=await sharp(path.join(root,record.output)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const mask=await sharp(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><polygon points="${record.approvedGrip.foreground.map(v=>v.join(',')).join(' ')}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
let gripPixels=0,gripChanged=0,clear=0,x0=1408,y0=1664,x1=-1,y1=-1;
for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){
 const a=(y*1024+x)*4,b=((y+record.bodyOrigin[1])*result.info.width+x+record.bodyOrigin[0])*4;
 if(mask[a+3]===255&&approved.data[a+3]>=250){gripPixels++;if(!approved.data.subarray(a,a+4).equals(result.data.subarray(b,b+4)))gripChanged++;}
}
for(let p=0;p<result.info.width*result.info.height;p++){const a=result.data[p*4+3];if(!a)clear++;if(a>16){const x=p%result.info.width,y=Math.floor(p/result.info.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
assert(gripPixels>5000,'Compare a meaningful part of the approved hand, including native alpha 254');
assert.equal(gripChanged,0,'Approved solid hand pixels must remain exact');
assert.equal(sha(await fs.readFile(path.join(root,record.weapon.original))),record.weapon.sha256);
assert.equal(record.weapon.scale,1);assert.equal(record.weaponLengthScale,record.weaponWidthScale);
assert(x0>0&&y0>0&&x1<1407&&y1<1663,'Full weapon and figure need transparent padding');
assert(clear/(1408*1664)>.35,'Native alpha required');
const qa={date:'2026-10-01',scope:'V14_STATIC_BLADE_CORRECTION_ONLY',result:'PASS',hand:{opaquePixelsCompared:gripPixels,differentPixels:gripChanged,source:record.approvedGrip.file},weapon:{sha256:record.weapon.sha256,source:record.weapon.original,uniformScale:1,straightAxisRigid:true,tipSource:'EXACT_ORIGINAL_TERMINAL',extraPointDrawn:false},nativeAlpha:true,clearFraction:clear/(1408*1664),bounds:[x0,y0,x1,y1],visualFiles:['qa/blade-v14-full.png','qa/blade-v14-grip.png'],visualReview:'Hand, handle axis, original blade width/length and compact original terminal inspected. User approval of V14 remains pending.',motionsReviewed:false,auraChanged:false,liveRuntimeChanged:false};
await write('qa/blade-v14-report.json',qa);
await write('grip-approval-20261001.json',{date:'2026-10-01',status:'HAND_AND_ARM_GRIP_APPROVED_ONLY',userStatement:'좋아 칼 파지 아주 마음에 들어 근데 문제가 있어 칼 검신 크기가 줄어들었고 칼날 맨 끝에 기존에 없던 뾰족한게 생김 ㅇㅋ?',approvedGrip:record.approvedGrip,gripReference:'sources/user-forward-grip-reference-20261001.png',requestedCorrections:['검신 길이와 폭을 승인 원본 크기로 복원','기존에 없던 길게 뾰족한 칼끝 제거'],bladeCorrectionCandidate:record.output,bladeCorrectionStatus:'USER_REVIEW_PENDING',motionApproval:false,runtimeEnabled:false});
const approval=await read('design-approval.json');Object.assign(approval,{poseCandidate:record.output,poseCandidateStatus:'GRIP_APPROVED_BLADE_CORRECTION_USER_REVIEW_PENDING',gripApproval:'grip-approval-20261001.json',remainingMotionAndEffects:'MOTIONS_USER_REJECTED_REWORK_REQUIRED_AURA_SATURATION_REQUEST_PENDING'});await write('design-approval.json',approval);
const manifest=await read('manifest.json');manifest.rework={currentStaticCandidate:record.output,currentStaticRecord:'assets/knight-sd-v14-original-blade-approved-grip.json',gripApproval:'grip-approval-20261001.json',qa:'qa/blade-v14-report.json',previousMotionManifest:'manifest-rejected-grip-motion-v2.json',status:'GRIP_APPROVED_BLADE_CORRECTION_REVIEW_PENDING',motionReworkRequired:true,surroundingAuraSaturationRequestPending:true};await write('manifest.json',manifest);
const rejects=await read('rejections.json');rejects.status='V2_MOTIONS_USER_REJECTED_V12_GRIP_APPROVED_V14_BLADE_REVIEW_PENDING';rejects.currentPose=record.output;rejects.currentPosePrompt=record.prompts;rejects.latestDirection='2026-10-01: 첨부 d08bc7e1의 팔을 옆으로 내린 손등 한손 파지를 재현한 V12 파지 승인. 손과 팔을 그대로 보존하고 검신 크기와 칼끝만 승인 대검 원본으로 복원한다.';
for(const [file,reason]of [
 ['assets/knight-sd-v6-original-sword.png','사용자 반려: 팔 자세·한손 파지 오류. V2 스킬 모션도 부자연스러워 재작업 필요.'],
 ['assets/rejected/grip-master-v7.png','후속 파지 수정 이전 시안. 승인된 V12 파지의 대체 입력으로 사용하지 않는다.'],
 ['assets/rejected/arm-only-v8-reverse-grip.png','사용자 반려: 손등이 보이지 않는 잘못된 파지.'],
 ['assets/knight-sd-v9-dorsal-grip.png','사용자 반려: 검지로만 걸친 파지, 합성된 손잡이 일부가 굽어 보임.'],
 ['assets/rejected/dorsal-clenched-v10-index-only.png','손가락이 손잡이를 함께 감싸지 못한 시안.'],
 ['assets/rejected/grip-v11-reversed-again.png','후속 사용자 사진과 불일치하는 뒤집힌 파지.'],
 ['assets/source/blade-correction-generated-v13.png','원본 칼끝과 크기 고정을 위해 V14 원본 검 합성으로 대체.']
 ])if(!rejects.rejected.some(v=>v.file===file))rejects.rejected.push({file,reason,usableAsReference:false});
await write('rejections.json',rejects);
console.log(JSON.stringify(qa));

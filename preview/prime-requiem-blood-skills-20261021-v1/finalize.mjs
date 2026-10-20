import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await fs.readFile(root+'manifest.json','utf8'));
const report=JSON.parse(await fs.readFile(root+'qa/browser-report.json','utf8'));
if(report.status!=='PASS_SCOPED_RUNTIME_CHECKS')throw Error('Runtime checks did not pass');
const video=await fs.readFile(root+'prime-requiem-showcase-v3.webm');
manifest.video={path:'prime-requiem-showcase-v3.webm',sha256:createHash('sha256').update(video).digest('hex').toUpperCase(),bytes:video.length,source:'ACTUAL_V3_BROWSER_PLAYBACK',playbackSpeed:2,skills:manifest.revision.addedShowcases,includesUprightAuraLeadIn:true,audio:false};
const archived=await fs.readFile(root+'prime-requiem-five-skills.webm');
manifest.archivedVideo={path:'prime-requiem-five-skills.webm',revision:'SWORD_AURA_V2_BEFORE_UPRIGHT_MANTLE_CORRECTION',sha256:createHash('sha256').update(archived).digest('hex').toUpperCase(),bytes:archived.length};
manifest.validation.browser=report.status;manifest.validation.browserReport='qa/browser-report.json';
manifest.validation.operatorVisualReview={
  surfaces:['desktop','mobile'],sourcePoseReview:'qa/v2-eight-poses-review.png',
  body:'USER_EIGHT_POSES_FIXED_UNIFORM_SCALE_UV_GUTTERS_REVIEWED',
  aura:'V3_THICK_FULL_BODY_BLOOD_MANTLE_FRONT_REAR_AND_TWO_RED_NEON_SILHOUETTES_SHARP_BODY',
  standingPose:'ORIGINAL_POSE_0_BOTH_FEET_PLANTED_USER_REQUEST',
  showcaseScreens:['desktop','mobile'].flatMap(s=>['blood-cataclysm-charge','blood-cataclysm-eruption','blood-moonfall-combo','blood-moonfall-crescent'].map(n=>`qa/${s}-${n}-v3.png`)),
  tiger:'NO_RUNNING_ASSET_HEAD_FROM_SOURCE_FRAME_4',
  swordContacts:report.results.flatMap(r=>r.skills.filter(s=>s.id!=='blood-tiger').flatMap(s=>s.states.filter(v=>manifest.skills.find(p=>p.id===s.id).hits.some(h=>h.time===v.time&&h.contactMode!=='effect')).map(v=>({surface:r.surface,skill:s.id,time:v.time,distance:v.contactDistance})))),
  reference:{url:'https://youtu.be/vfBuylrhTFc',rate:.4,observedComboTimes:[10.517788,11.284559,12.029405,12.772752,13.515689],observedShowcaseTimes:[15.868783,17.880249,19.387065,20.282383,20.901127,22.480493,24.982514,25.543128,26.684021,28.480305,30.982933,32.686583]},
  originalEffectCellWarningsRetained:true,userApproval:false
};
report.reviewedAssets=Object.fromEntries(Object.entries(manifest.sheets).map(([key,s])=>[key,s.sha256]));
report.reviewedBundleSha256=createHash('sha256').update(await fs.readFile(root+'battle-preview.bundle.js')).digest('hex').toUpperCase();
await fs.writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(root+'qa/browser-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({name:manifest.character.name,grade:manifest.character.grade,skills:manifest.skills.length,videoBytes:video.length,browser:manifest.validation.browser,liveEnabled:manifest.permissions.liveEnabled}));

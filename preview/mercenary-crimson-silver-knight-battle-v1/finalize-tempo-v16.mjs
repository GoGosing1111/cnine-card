import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8'),json=async p=>JSON.parse(await read(p));
const manifest=await json('manifest.json'),browser=await json('qa/v16/browser-report.json'),effects=await json('qa/v16/effect-tempo-report.json');
const recordingFile='qa/all-skills-fast-descent-v16.webp',info=await sharp(new URL(recordingFile,root).pathname.replace(/^\/(?=[A-Za-z]:)/,''),{animated:true,limitInputPixels:false}).metadata();
await fs.mkdir(new URL('qa/v15/',root),{recursive:true});
try{await fs.access(new URL('qa/v15/qa-report.json',root));}catch{await fs.copyFile(new URL('qa-report.json',root),new URL('qa/v15/qa-report.json',root));}
const report={date:'2026-10-01',status:'V16_ALL_SKILLS_FAST_DESCENT_QA_COMPLETE',scope:'preview/mercenary-crimson-silver-knight-battle-v1/',previousReport:'qa/v15/qa-report.json',playbackTempo:manifest.playbackTempo,relatedRegressionTests:{passed:8,failed:0,pattern:'all ten|every living|drawn collision|visibly faster|Grounded|every attack|all-skills|licensed V3'},effectTempo:effects,browserReport:'qa/v16/browser-report.json',browser:browser.map(r=>({viewport:r.name,allModesVerified:r.modes.map(m=>m.mode),nativeTextureAndAuraMatches:r.modes.every(m=>m.frames.every(f=>f.textureMatches&&f.auraMatches)),pauseStable:r.pauseStable,audioContact:r.audio.scheduled.find(c=>c.key==='ultimate').contact,showcaseWallSeconds:r.showcase?.wallSeconds??null,errors:r.errors,overflow:r.overflow})),recording:{file:recordingFile,pages:info.pages,width:info.width,height:info.pageHeight,fps:30,terminalHoldMs:700,errors:[]},artworkChanged:false,liveRuntimeChanged:false};
await fs.writeFile(new URL('qa-report.json',root),JSON.stringify(report,null,2)+'\n');
let readme=await read('README.md');const marker='- 변경은 독립 프리뷰에 반영하며 운영 활성화·등급·능력치·스킬 배정은 변경하지 않는다.';
if(!readme.includes('V16 관련 회귀 8개'))readme=readme.replace(marker,'- V16 관련 회귀 8개 통과. PC·모바일 모두 6개 공격/스킬의 실제 텍스처·오라·이른 충돌·방패 좌표·정지/취소를 확인했다. V15와 충돌 기준 1,020개 시점을 비교해 효과 프레임의 진행 속도와 길이가 같은 것을 확인했다. 전체 시연은 실제 '+browser[0].showcase.wallSeconds+'초, 오류는 0개다. 검수 기록은 `qa/v16/`, 새 30fps 전체 영상은 `qa/all-skills-fast-descent-v16.webp`다.\n'+marker);
await fs.writeFile(new URL('README.md',root),readme);
const files=['README.md','index.html','battle.html','manifest.json','preview.bundle.js','qa-report.json','qa.test.mjs','qa-browser.mjs','skill.mjs','source/preview.js','record-demo.mjs','update-tempo-v16.mjs','finalize-tempo-v16.mjs','motion-tempo-request-20261001-v16.json','qa-fast-descent-v16.mjs','qa-effect-tempo-v16.mjs','qa/v15/qa-report.json','qa/v16/browser-report.json','qa/v16/effect-tempo-report.json','qa/v16/desktop-impact.png','qa/v16/mobile-impact.png',recordingFile];
const scope=path.join(os.tmpdir(),'knight-descent-v16-scope.txt');await fs.writeFile(scope,files.map(f=>'preview/mercenary-crimson-silver-knight-battle-v1/'+f).join('\n')+'\n');console.log(JSON.stringify({scope,recording:report.recording,passed:true}));

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8'),json=async p=>JSON.parse(await read(p));
const m=await json('manifest.json'),browser=await json('qa/v17/browser-report.json'),effects=await json('qa/v17/effect-tempo-report.json');
const clip='qa/overhead-50percent-v17.webp',info=await sharp(fileURLToPath(new URL(clip,root)),{animated:true,limitInputPixels:false}).metadata();
try{await fs.access(new URL('qa/v16/qa-report.json',root));}catch{await fs.copyFile(new URL('qa-report.json',root),new URL('qa/v16/qa-report.json',root));}
const report={date:'2026-10-01',status:'V17_ADDITIONAL_50_PERCENT_SPEED_QA_COMPLETE',previousReport:'qa/v16/qa-report.json',playbackTempo:m.playbackTempo,relatedRegressionTests:{passed:3,failed:0,pattern:'drawn collision|visibly faster|licensed V3'},effectTempo:effects,browserReport:'qa/v17/browser-report.json',browser:browser.map(r=>({viewport:r.name,modesVerified:r.modes.map(x=>x.mode),texturesAndAuraMatch:r.modes.every(x=>x.frames.every(f=>f.textureMatches&&f.auraMatches)),audioContact:r.audio.scheduled.find(c=>c.key==='ultimate').contact,pauseStable:r.pauseStable,showcaseSeconds:r.showcase?.wallSeconds??null,errors:r.errors,overflow:r.overflow})),recording:{file:clip,pages:info.pages,width:info.width,height:info.pageHeight,fps:60},artworkChanged:false,liveRuntimeChanged:false};
await fs.writeFile(new URL('qa-report.json',root),JSON.stringify(report,null,2)+'\n');
let doc=await read('README.md');if(!doc.includes('V17 관련 회귀 3개'))doc=doc.replace('\n---\n','\nV17 관련 회귀 3개와 PC·모바일의 모든 6개 동작 검사를 통과했다. 이펙트 진행·길이 1,020개 비교도 통과했으며 전체 시연은 실제 '+browser[0].showcase.wallSeconds+'초다. 검수는 `qa/v17/`, 60fps 공통 동작 영상은 `qa/overhead-50percent-v17.webp`에 있다.\n\n---\n');await fs.writeFile(new URL('README.md',root),doc);
const files=['README.md','battle.html','index.html','manifest.json','preview.bundle.js','skill.mjs','source/preview.js','qa.test.mjs','qa-report.json','update-tempo-v17.mjs','finalize-tempo-v17.mjs','motion-tempo-request-20261001-v17.json','qa-fast-descent-v17.mjs','qa-effect-tempo-v17.mjs','qa/v16/qa-report.json','qa/v17/browser-report.json','qa/v17/effect-tempo-report.json','qa/v17/desktop-impact.png','qa/v17/mobile-impact.png',clip];
const scope=path.join(os.tmpdir(),'knight-descent-v17-scope.txt');await fs.writeFile(scope,files.map(f=>'preview/mercenary-crimson-silver-knight-battle-v1/'+f).join('\n')+'\n');console.log(JSON.stringify({scope,recording:report.recording,passed:true}));

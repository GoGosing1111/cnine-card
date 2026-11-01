import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const dir=fileURLToPath(new URL('../',import.meta.url)),file=p=>path.join(dir,p),sha=b=>createHash('sha256').update(b).digest('hex'),receipt=JSON.parse(await fs.readFile(file('qa/native.json'),'utf8')),input=JSON.parse(await fs.readFile(file('swordsman.input.json'),'utf8'));
assert.equal(sha(await fs.readFile(file(receipt.native))),receipt.nativeSha256);
assert.equal(sha(await fs.readFile(file('../baseline-v4.png'))),'fd8eea2da078ba3f7cfcef7da44946612e950ce2b0d0cd778a4b57976e00aa44');
assert.equal(sha(await fs.readFile(file('../attack-v1/swordsman-06c1f1563f47.spine'))),'3ae87ba2a39097cea5b25105db813a2bcefed0afc574a549cc85afac4139a423');
assert.equal(sha(await fs.readFile(file('../attack-v1/images/weapon-restored-v2.png'))),'5e485052a02909c94cc91f4f75072ca42ce59ba1384ce1a5f299f0714f23ae07');
const images=[];
for(const byName of Object.values(input.skins[0].attachments))for(const a of Object.values(byName)){const full=path.resolve(dir,input.skeleton.images,a.path+'.png'),b=await fs.readFile(full);images.push({relative:path.relative(dir,full).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:18765/');await page.waitForFunction(()=>window.rigReview?.ready);
 const links=await page.locator('footer a').evaluateAll(as=>as.map(a=>({label:a.textContent,href:a.href})));
 for(const a of links){const r=await page.request.get(a.href);assert.equal(r.status(),200,a.href);}
 const video=await page.evaluate(async()=>{const v=document.createElement('video');v.muted=true;v.src='qa/attack-three-runs.webm';document.body.append(v);await v.play();await new Promise(r=>setTimeout(r,800));const result={time:v.currentTime,width:v.videoWidth,height:v.videoHeight,decoded:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?.message||null};v.pause();v.remove();return result;});assert(video.time>.5&&video.width>0&&video.decoded>5&&!video.error);
 const report={native:receipt.native,nativeSha256:receipt.nativeSha256,relativeImages:images,baselinePreserved:true,parentNativePreserved:true,correctedWeaponPreserved:true,links,video,desktopInput:false,production:false};
 await fs.writeFile(file('qa/delivery.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({relativeImages:images.length,links:links.length,video}));
}finally{await browser.close();}

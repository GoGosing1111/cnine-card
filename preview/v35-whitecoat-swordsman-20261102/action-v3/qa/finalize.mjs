import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),hero=fileURLToPath(new URL('../../',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const old=await read(hero+'whitecoat.input.json'),current=await read(hero+'whitecoat-action-v3.input.json'),native=await read(dir+'native.json');
for(const [key,animation]of Object.entries(old.animations))assert.deepEqual(current.animations[key],animation,'Old animation changed: '+key);
for(const [key,attachment]of Object.entries(old.skins[0].attachments.body))assert.deepEqual(current.skins[0].attachments.body[key],attachment,'Old attachment changed: '+key);
assert.equal(Object.keys(current.skins[0].attachments.body).length,18);assert.equal(Object.keys(current.animations).length,8);
assert.equal(hash(await fs.readFile(hero+native.native)),native.nativeSha256);assert.equal(hash(await fs.readFile(hero+'whitecoat-action-v3.input.json')),native.inputSha256);
const verification=await read(dir+'verification.json'),events=await read(dir+'event-integration.json'),video=await read(dir+'review-video.json'),recording=await read(dir+'recording.json');
assert.ok(verification.passed&&video.passed&&recording.passed&&Object.values(events.checks).every(Boolean));
const html=await fs.readFile(hero+'review.html','utf8'),links=[...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(x=>!x.startsWith('data:')))];
const base='http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/review.html',responses=[];
for(const href of links){const r=await fetch(new URL(href,base));responses.push({href,status:r.status});assert.ok(r.ok,href+' unavailable');await r.arrayBuffer();}
const report={oldAnimationsPreserved:Object.keys(old.animations),oldAttachmentsPreserved:Object.keys(old.skins[0].attachments.body),newNativeSha256:native.nativeSha256,totalAttachments:18,totalAnimations:8,checks:Object.keys(verification.checks).length,eventChecks:Object.keys(events.checks).length,normalCombos:6,capture:recording.records.map(({on,capture,maxRenderGapMs,impacts})=>({on,capture,maxRenderGapMs,impacts})),links:responses,passed:true};
await fs.writeFile(dir+'final-page.json',JSON.stringify(report,null,2)+'\n');console.log({passed:report.passed,oldAnimations:report.oldAnimationsPreserved.length,oldAttachments:report.oldAttachmentsPreserved.length,checks:report.checks,eventChecks:report.eventChecks,links:responses.length});

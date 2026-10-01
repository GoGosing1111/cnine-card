import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {KNIGHT,OVERHEAD,OVERHEAD_MODES,ACTIVE_MOTION_KEYS,makePlan,sample,MODES} from '../skill.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url));
const scope='preview/mercenary-crimson-silver-knight-battle-v1/';
const json=async p=>JSON.parse(await fs.readFile(path.join(project,p),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const m=await json(scope+'manifest.json');
const approval=await json('assets/ui/project-v/mercenaries/mercenary-valter-approval-20261001.json');
const lock=await json(scope+'release/files.json');
const review=await json(scope+'release/review-report.json');
assert.equal(m.name,'발테르');assert.equal(KNIGHT.name,'발테르');assert.equal(approval.name,'발테르');
assert.equal(m.version,17);assert.equal(m.runtimeEnabled,false);assert.equal(approval.runtimeEnabled,false);
assert.equal(m.rank,'SSS');assert.equal(KNIGHT.rank,m.rank);assert.equal(approval.rank,m.rank);assert.equal(m.edition,'LIMITED');assert.equal(KNIGHT.edition,m.edition);assert.equal(approval.edition,m.edition);assert.equal(approval.runtimeCode,null);assert.equal(approval.deploymentPerformed,false);
assert.equal(m.nameStatus,'USER_APPROVED');assert.equal(approval.nameStatus,'USER_APPROVED');
const limited=await json('preview/mercenary-limited-frame-slim-v3-20261001/manifest.json');
const registration=await json(m.rankEditionApproval);
const collectionEntry=limited.entries.find(e=>e.name===m.name);
assert.equal(collectionEntry.rank,m.rank);assert.equal(collectionEntry.edition,m.edition);assert.equal(collectionEntry.source.sha256,m.sourceArtSha256);
assert.equal(digest(await fs.readFile(path.join(project,m.previewFrame))),m.previewFrameSha256);assert.equal(m.previewFrameSha256,'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA');assert.equal(limited.currentSha256,m.previewFrameSha256);
assert.equal(registration.rank,m.rank);assert.equal(registration.edition,m.edition);assert.equal(registration.runtimeEnabled,false);assert.equal(limited.liveRegistration,false);
assert.equal((await json('preview/mercenary-limited-frame-slim-v3-20261001/qa-valter-20261002.json')).passed,true);
assert.equal(m.playbackTempo.rate,1.2);assert.equal(m.playbackTempo.strikeRate,3.6);
assert.equal(m.playbackTempo.swingSeconds,0.125/1.5);
const art=await fs.readFile(path.join(project,m.sourceArt));
assert.equal(digest(art),approval.sourceArtSha256);assert.equal(digest(art),m.sourceArtSha256);
assert.equal(art.subarray(1,4).toString(),'PNG');assert.equal(art.readUInt32BE(16),1024);assert.equal(art.readUInt32BE(20),1536);assert.equal(art[25],2);
assert.notEqual(m.sourceArt,m.battleSprite);assert.equal(digest(await fs.readFile(path.join(project,m.battleSprite))),approval.battleSpriteSha256);
assert.deepEqual(m.activeMotionKeys,ACTIVE_MOTION_KEYS);
let motionFrames=0,effectFrames=0;
for(const [kind,specs] of [['motion',ACTIVE_MOTION_KEYS.map(k=>m.motion[k])],['effect',Object.values(m.effects)]]){
 for(const spec of specs){
  for(const [file,expected] of [[spec.atlas,spec.atlasSha256],[spec.pngAtlas,spec.pngAtlasSha256],...spec.frames.map(f=>[f.file,f.sha256])])assert.equal(digest(await fs.readFile(path.join(project,scope,file))),expected,file);
  if(kind==='motion')motionFrames+=spec.frameCount;else effectFrames+=spec.frameCount;
 }
}
assert.equal(motionFrames,27);assert.equal(effectFrames,96);
assert.equal(digest(await fs.readFile(path.join(project,scope,m.weapon.file))),m.weapon.sha256);
for(const mode of OVERHEAD_MODES){const p=makePlan({mode});assert.deepEqual(p.contacts,[OVERHEAD.contact]);assert.deepEqual(sample(p,OVERHEAD.idle).pose,{key:'idle',frame:0});for(let t=0;t<MODES[mode].duration;t+=.031){const pose=sample(p,t).pose;assert.ok(ACTIVE_MOTION_KEYS.includes(pose.key));assert.ok(pose.frame>=0&&pose.frame<m.motion[pose.key].frameCount);}}
for(const row of [...lock.payloadFiles,...lock.sharedDependencies]){
 assert.ok(!path.isAbsolute(row.path)&&!row.path.split('/').includes('..'));
 const raw=await fs.readFile(path.join(project,row.path));const data=row.hashMode==='LF_NORMALIZED_UTF8'?Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n')):raw;assert.equal(data.length,row.bytes,row.path+' bytes');assert.equal(digest(data),row.sha256,row.path+' sha256');
 if(lock.payloadFiles.includes(row))assert.ok(row.bytes<=25*1024*1024,row.path+' Pages size limit');
}
assert.equal(review.passed,true);assert.equal(review.viewports.length,2);assert.deepEqual(review.errors,[]);
for(const view of review.viewports){assert.equal(view.observations.length,10);assert.equal(view.returnedToExactIdle,true);assert.equal(view.overflow,false);assert.deepEqual(view.errors,[]);}
console.log(JSON.stringify({passed:true,name:m.name,rank:m.rank,edition:m.edition,sourceArt:'V8 original RGB 1024x1536',motionVersion:m.version,motionFrames,effectFrames,payloadFiles:lock.payloadFiles.length,sharedDependencies:lock.sharedDependencies.length,viewports:review.viewports.map(v=>v.name),deploymentPerformed:false}));

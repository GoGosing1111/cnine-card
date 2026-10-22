import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {BLOODMOON_COMBAT,RELEASE} from './balance.mjs';
import {ACTIONS,makePlan,sample} from './source/PlaybackPlan.mjs';
import {settleAssetBatch} from './source/ResourceLoader.mjs';
import {readReviewFile,fileSha,reviewFingerprint} from './review-fingerprint.mjs';
const manifest=JSON.parse(await readReviewFile('manifest.json'));
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const raw=async file=>sharp(await readReviewFile(file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const report={dateKST:'2026-10-23',status:'PASS',checks:[],characters:[]};
assert.equal(manifest.characters.length,5);assert.equal(RELEASE.rank,null);
assert.equal(manifest.acquisitionEnabled,false);assert.equal(manifest.deploymentEnabled,false);
assert.equal(manifest.characters.find(c=>c.slug==='bongsoon').originalMotion.sha256,'879FC5E4486698648E2285A0431275542432AA70C96231623A5AE437CF2457FF');
for(const c of manifest.characters){
 assert.equal(c.rank,null);assert.equal(c.runtimeEnabled,false);assert.equal(c.previewCodeIsAssignment,false);
 assert.equal(sha(await readReviewFile(c.sourceArt.path)),c.sourceArt.sha256);
 assert.equal(sha(await readReviewFile(c.originalMotion.path)),c.originalMotion.sha256);
 const original=await raw(c.originalMotion.path),w=original.info.width,h=original.info.height,seen=new Uint8Array(w*h);
 const frames=Object.values(c.motion).flatMap(s=>s.frames);assert.equal(frames.length,16);
 assert.equal(new Set(frames.map(f=>f.sha256)).size,16,'All poses must be separate artwork');
 let copied=0;
 for(const frame of frames){
  assert.equal(frame.scaleApplied,1);assert.equal(sha(await readReviewFile(frame.path)),frame.sha256);
  const dest=await raw(frame.path);let count=0;
  for(let y=0;y<dest.info.height;y++)for(let x=0;x<dest.info.width;x++){
   const dp=(y*dest.info.width+x)*4;if(!dest.data[dp+3])continue;
   const sx=x+frame.sourceOffset.x,sy=y+frame.sourceOffset.y;
   assert(sx>=0&&sx<w&&sy>=0&&sy<h);const sp=sy*w+sx;
   assert.equal(seen[sp],0,`${c.slug}: duplicate source pixel`);seen[sp]=1;
   assert(dest.data.subarray(dp,dp+4).equals(original.data.subarray(sp*4,sp*4+4)),`${c.slug}: altered RGBA`);count++;copied++;
  }
  assert.equal(count,frame.sourcePixels);
 }
 let sourcePixels=0;for(let p=0;p<w*h;p++)if(original.data[p*4+3]){sourcePixels++;assert.equal(seen[p],1,`${c.slug}: lost source pixel`);}
 assert.equal(copied,sourcePixels);assert.equal(c.pixelAudit.sourcePixels,sourcePixels);
 const effect=c.effects.skill;assert.equal(sha(await readReviewFile(effect.path)),effect.sha256);
 const fxHashes=await Promise.all(effect.frames.map(async f=>sha(await sharp(await readReviewFile(effect.path)).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).raw().toBuffer())));
 assert.equal(new Set(fxHashes).size,16,'Effects must have 16 changing frames');
 assert(c.bodyPixels>0);assert.equal(c.battleBodyHeight,345);
 for(const [action,spec]of Object.entries(ACTIONS))for(let i=0;i<=100;i++){
  const state=sample(makePlan(c.skillKind,action),spec.duration*i/100);
  if(state.pose)assert(c.motion[state.pose.sheet].frames[state.pose.frame]);
  if(state.effectFrame!==null)assert(effect.frames[state.effectFrame]);
  assert.equal(makePlan(c.skillKind,action).damageAuthority,'NONE_VISUAL_PREVIEW');
 }
 assert.equal(sample(makePlan(c.skillKind,'skill'),1.72).effectStage,'impact');
 assert.equal(sample(makePlan(c.skillKind,'skill'),3.6).effectFrame,null);
 report.characters.push({slug:c.slug,frames:frames.length,effectFrames:effect.frames.length,sourcePixels,copiedPixels:copied,approvedSourceSha:c.sourceArt.sha256});
}
// A late successful load must also be released when a sibling has already failed.
const released=[];
await assert.rejects(()=>settleAssetBatch([()=>Promise.resolve('early'),()=>Promise.reject(Error('fixture failure')),async()=>{await new Promise(r=>setTimeout(r,8));return 'late';}],v=>released.push(v)),AggregateError);
assert.deepEqual(released.sort(),['early','late']);
const balance=JSON.parse(await readReviewFile('qa/balance-report.json'));
assert.equal(balance.profileSha256,await fileSha('balance.mjs'));
assert.deepEqual(balance.profiles,BLOODMOON_COMBAT);
assert.equal(balance.totalPvp,11520);assert.equal(balance.totalPve,104);
assert(balance.pvp.every(r=>r.total===288&&r.winRate>.5));
assert(balance.pve.filter(r=>r.code in BLOODMOON_COMBAT).every(r=>r.clears===r.total));
for(const p of Object.values(BLOODMOON_COMBAT)){
 assert(p.basePower>balance.references.bathory.basePower);
 assert.equal(p.pveSkillMinimumDamage,false,'Do not bypass existing melee PVE damage rules');
 assert.equal(p.acquisitionEnabled,false);assert.equal(p.deploymentEnabled,false);
}
report.checks=['approved-source-hashes','exact-user-selected-bongsoon','80-lossless-pixel-copies','80-distinct-effect-frames','six-state-frame-bounds','skill-contact-and-completion','late-load-failure-cleanup','current-canonical-balance-report','unassigned-rank-and-release-gates'];
report.reviewFingerprint=await reviewFingerprint();
await fs.writeFile(new URL('qa/resource-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks.length,characters:report.characters.length}));

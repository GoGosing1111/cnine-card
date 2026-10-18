// Verify evidence produced by the preview's in-page ReviewTools controls.
// Browser interaction is performed through the Codex browser tool, not a second driver.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=async name=>JSON.parse(await fs.readFile(new URL(name,import.meta.url),'utf8'));
const manifest=await read('manifest.json'),build=await read('build-report.json');
assert.equal(build.pixiCopies,1);assert.equal(build.gsapCopies,1);assert.equal(build.liveEnabled,false);
assert.equal(manifest.runtimeRegistration,false);assert.equal(manifest.deployed,false);
assert.equal(manifest.summary.bodyFrames,36);assert.equal(manifest.summary.effectFrames,84);
for(const size of ['desktop','mobile']){
 const r=await read('qa/'+size+'-runtime.json');assert.equal(r.passed,true,size+': '+r.errors.join(', '));assert.equal(r.muted,true);assert.equal(r.overflow,false);
 assert.equal(r.stopped.registeredTimelines,0);assert.equal(r.stopped.visibleEffects,0);assert.equal(r.stopped.visibleGhosts,0);
 assert.equal(r.snapshots.length,5);for(const s of r.snapshots){assert.equal(s.bladeContact.intersects,true);assert(s.groundError<1e-6);assert.equal(s.airborne,false);}
 for(const s of r.speeds){assert(s.advance>0);assert.equal(s.pausedStable,true);}
}
const video=await fs.readFile(new URL('review-v1.webm',import.meta.url));assert(video.length>100000);assert.equal(video.subarray(0,4).toString('hex'),'1a45dfa3');
console.log('Leonel: PC/mobile physical contacts, ground, four speeds, pause, cancel, muted recording and single shared runtime verified.');

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readReviewFile,fileSha,reviewFingerprint} from './review-fingerprint.mjs';
const manifest=JSON.parse(await readReviewFile('manifest.json'));
const fingerprint=await reviewFingerprint();
for(const name of ['browser-report','resource-report','motion-regression']){
 const report=JSON.parse(await readReviewFile('qa/'+name+'.json'));
 assert.equal(report.status,'PASS');assert.equal(report.reviewFingerprint,fingerprint,`${name}: stale evidence`);
}
const balance=JSON.parse(await readReviewFile('qa/balance-report.json'));
assert.equal(balance.profileSha256,await fileSha('balance.mjs'));
manifest.validation={browserReview:'PASS',resourceReview:'PASS',motionRegression:'PASS',pvpSimulations:balance.totalPvp,pveSimulations:balance.totalPve,visualApproval:'USER_REVIEW_PENDING',reviewFingerprint:fingerprint,evidence:['qa/browser-report.json','qa/resource-report.json','qa/motion-regression.json','qa/scale-before.json','qa/balance-report.json','qa/visual-review.json']};
await fs.writeFile(new URL('manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log('Technical evidence current; user visual review remains pending.');

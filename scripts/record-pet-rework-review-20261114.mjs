import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),dir='docs/qa/pet-rework-20261114';
const performance=JSON.parse(await fs.readFile(dir+'/performance.json','utf8'));
const browser=JSON.parse(await fs.readFile(dir+'/browser-checks.json','utf8'));
const assetDir='assets/ui/pets/rework-20261114',manifest=JSON.parse(await fs.readFile(assetDir+'/manifest.json','utf8'));
for(const row of manifest.entries){row.sourceImageGenBytes??=row.sourceBytes;row.sourceBytes=(await fs.stat(path.join(assetDir,row.source))).size;}
await fs.writeFile(assetDir+'/manifest.json',JSON.stringify(manifest,null,2));
const poster='C:/Users/User/Downloads/upload/cnine-card/output/announcements/pet-rework-20261114/pet-rework-announcement-final.png';
const report={
 date:'2026-11-14',
 status:'LOCAL_IMPLEMENTATION_REVIEWED_NOT_DEPLOYED',
 sourceRoot:root,
 baseHead:'3fbbe62adab38a6d13cacafea630f117ecc7894d',
 productionWrites:0,
 deployment:false,
 name:{required:'흑구',codepoints:['D751','AD6C'],exampleLabel:'펫 예시 · 흑구',hypothesis:'SSS 등급인 경우',exactFont:'Malgun Gothic bold',visuallyVerified:true},
 poster:{file:poster,sha256:createHash('sha256').update(await fs.readFile(poster)).digest('hex'),note:'Use only this final export. Earlier generated artwork is retained as production history.'},
 tests:{command:'node --test tests/pet-loadout-modes.test.mjs tests/pet-support-effects-20261012.test.mjs tests/pet-growth-v2-20261114.test.mjs',passed:27,failed:0},
 browser:{report:'browser-checks.json',widths:browser.viewports.map(x=>x.width),errors:browser.errors,asyncCancellation:browser.asyncCancellation,foreignPendingBlocked:browser.foreignPendingBlocked,traits:browser.effects.map(x=>x.id)},
 designReview:{skill:'Impeccable',detectorFindings:0,reviewer:'/root/impeccable_finish_reviewer',disposition:'ship — local prepared UI only',resolved:['pending result belongs to another species','hunter preview targets a boss','late asynchronous preview is disposed','320px tab labels do not wrap']},
 provenance:{tool:'Built-in ImageGen',scan:'10 rasters, 0 missing prompts',new:'two dice icons and two 12-frame effect atlases',reused:'approved codex UI and four existing buff effects'},
 performance:{...performance.conditions,summary:performance.summary,frames:performance.frames,afterExit:performance.afterExit,interpretation:'New dice icon transfer was a network bottleneck: first growth-view image readiness median fell from 1639 ms to 486 ms. These are local emulation measurements, not production or physical-device results. The existing codex PNG portraits still dominate full navigation resource waits; the new feature results must not be represented as entire-game loading times.'},
 remaining:['production database transaction adapter and routes','actual species caps and existing-pet migration','production probabilities, costs and acquisition rules','stat conversion, battle calculation and reward settlement integration','trait sounds and production/platform validation'],
 guide:'preview/pet-rework-20261114/PROJECT.md'
};
await fs.writeFile(dir+'/completion.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,posterSha256:report.poster.sha256,tests:report.tests.passed,browserErrors:report.browser.errors.length}));

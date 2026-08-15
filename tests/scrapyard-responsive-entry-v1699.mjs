import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const workshop=readFileSync(new URL('js/workshop-v1676.js',root),'utf8');
const css=readFileSync(new URL('css/workshop-v1676.css',root),'utf8');
const index=readFileSync(new URL('index.html',root),'utf8');
const worker=readFileSync(new URL('service-worker.js',root),'utf8');

assert.match(workshop,/activeScrapRun=''/);
assert.match(workshop,/전투 연결 중/);
assert.match(workshop,/function applyScrapyardResult\(result\)/);
assert.match(workshop,/applyScrapyardResult\(result\);busy=false;activeScrapRun='';render\(\)/,'entry buttons must unlock before battle playback and background refresh');
assert.match(workshop,/Promise\.all\(\[api\('scrapyard\/status'\),api\('workshop'\)\]\)/,'post-run refresh must be parallel');
assert.match(workshop,/if\(version!==scrapSyncVersion\)return/,'an older background refresh must not overwrite a newer run');
assert.doesNotMatch(workshop,/scrap=await api\('scrapyard\/status'\);state=await api\('workshop'\)/,'sequential post-run refresh must not return');
assert.match(css,/button\.is-starting:disabled/);
assert.match(index,/workshop-v1676\.js\?v=1703-fast-entry/);
assert.match(worker,/soop-card-static-v1720/);

console.log('Scrapyard v1699: immediate start feedback, optimistic unlock and parallel background refresh verified');

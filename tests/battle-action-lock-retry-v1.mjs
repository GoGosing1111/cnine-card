import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

for(const path of ['battle/fight','tower/fight','pvp/match','pvp/fight']){
  assert.ok(app.includes(`'${path}'`),`missing battle lock retry path: ${path}`);
}
assert.match(app,/USER_ACTION_IN_PROGRESS[\s\S]{0,500}retryCount<12/);
assert.match(app,/return apiRequest\(path,options,\{\.\.\.config,userActionRetryCount:retryCount\+1\}\)/);
assert.match(api,/fastBattleAction=\['battle\/fight','tower\/fight','pvp\/match','pvp\/fight'\]\.includes\(actionPath\)/);
assert.match(api,/fastBattleAction\?8000:60000/);
assert.match(index,/js\/app\.js\?v=1766-v3-first-frame/);
assert.match(worker,/soop-card-shell-v1766-v3-first-frame/);
console.log('battle action lock retry contract: OK');

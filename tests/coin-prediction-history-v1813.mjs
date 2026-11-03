import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

import { onRequest } from '../functions/api/[[path]].js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const server = read('functions/_coin_prediction.js');
const userUi = read('js/coin-prediction-v2033.js');
const model = read('js/coin-prediction-model-v2033.js');
const adminUi = read('admin/coin-prediction-admin-v1.js');
const userCss = read('css/coin-prediction-v2033.css');
const adminCss = read('admin/coin-prediction-admin-v1.css');
const app = read('js/app.js');
const index = read('index.html');
const adminIndex = read('admin/index.html');
const serviceWorker = read('service-worker.js');

assert.match(server, /const USER_MAX_BET_PER_EVENT=300000000000;/);
assert.match(server, /maxBetPerEvent:USER_MAX_BET_PER_EVENT,termsVersion:DEFAULTS\.termsVersion/);
assert.match(server, /UPDATE coin_prediction_events SET max_bet=\?,updated_at=CURRENT_TIMESTAMP WHERE status IN \('DRAFT','OPEN'\)/);
assert.match(server, /이벤트당 누적 최대 300,000,000,000코인/);
assert.match(server, /const HISTORY_RETENTION_HOURS=24;/);
assert.match(server, /const predictionListView=/);
assert.match(server, /status IN \('SETTLED','VOID'\).*datetime\('now','-1 day'\)/s);
assert.match(server, /e\.status='CLOSED'.*historyWhere/s);
assert.match(server, /pageSize=admin\?30:12/);
assert.match(server, /navigation:\{view,page,pageSize,total,totalPages,counts:/);
assert.match(server, /admin\/coin-prediction\/state.*eventData\(env,user\.id,true,ownerUnlimited,listView,listPage,filters\)/s);
assert.match(server, /coin-prediction\/state.*eventData\(env,user\.id,false,ownerUnlimited,listView,listPage,filters\)/s);
assert.doesNotMatch(server, /settledRetention=admin\?'-1 day':'-1 hour'/);

assert.match(userUi, /data-cp-view="active"/);
assert.match(userUi, /data-cp-view="history"/);
assert.match(userUi, /종료된 경기/);
assert.match(userUi, /종료 후 24시간 동안 결과와 내 베팅·정산 내역/);
assert.match(userUi, /coin-prediction\/state\?view=\$\{requestedView\}&page=\$\{requestedPage\}/);
assert.match(userUi, /MY TICKET/);
assert.match(userUi, /const USER_MAX_BET_PER_EVENT = 300000000000;/);
assert.match(userUi, /경기당 최대 3,000억/);
assert.match(userUi, /이벤트 누적 최대는 3,000억 코인/);
assert.match(userUi, /실제 환불액/);
assert.match(model, /mine\.status === 'SETTLED' \|\| mine\.status === 'REFUNDED'/);
assert.match(userCss, /\.cp3-views/);
assert.match(userCss, /@media\(max-width:560px\).*\.cp3-views/s);
assert.match(userCss, /\.cp3-options/);
assert.match(userCss, /--cp3-blue:#174fde/);

assert.match(adminUi, /data-cp-admin-view="active"/);
assert.match(adminUi, /data-cp-admin-view="history"/);
assert.match(adminUi, /정산 대기 우선 · 완료 기록 24시간/);
assert.match(adminUi, /admin\/coin-prediction\/state\?view=\$\{requestedView\}&page=\$\{requestedPage\}/);
assert.match(adminUi, /data-cp-admin-action="SETTLE"/);
assert.match(adminUi, /이벤트당 최대<\/span><b>300,000,000,000/);
assert.match(adminCss, /\.cp-admin-tabs/);
assert.match(adminCss, /@media\(max-width:560px\).*\.cp-admin-tabs/s);

// Preserved historical renderer/model tests above; public loaders remain retired.
assert.doesNotMatch(app,/coin-prediction-v2033\.(?:js|css)\?v=/);
assert.doesNotMatch(adminIndex,/coin-prediction-admin-v1\.(?:js|css)\?v=/);
assert.match(serviceWorker, /soop-card-shell-v[A-Za-z0-9][A-Za-z0-9-]+/);

console.log('coin prediction active/history tabs + 24-hour retention PASS');

const forbidden=new Proxy({},{get(){throw Error('Retired prediction accessed auth/database');}});
for(const route of ['coin-prediction/state?view=active','coin-prediction/state?view=history','admin/coin-prediction/state?view=history']){
 const response=await onRequest({request:new Request('https://qa.test/api/'+route),env:forbidden,params:{path:route.split('?')[0].split('/')}});
 assert.equal(response.status,410);
}
console.log('retired prediction routes return 410 without auth/database access');

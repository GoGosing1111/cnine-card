import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

import { onRequest } from '../functions/api/[[path]].js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const server = read('functions/_coin_prediction.js');
const userUi = read('js/coin-prediction-v1.js');
const adminUi = read('admin/coin-prediction-admin-v1.js');
const userCss = read('css/coin-prediction-v1.css');
const userV2Css = read('css/coin-prediction-v2.css');
const adminCss = read('admin/coin-prediction-admin-v1.css');
const app = read('js/app.js');
const index = read('index.html');
const adminIndex = read('admin/index.html');
const serviceWorker = read('service-worker.js');

assert.match(server, /const HISTORY_RETENTION_HOURS=24;/);
assert.match(server, /const predictionListView=/);
assert.match(server, /status IN \('SETTLED','VOID'\).*datetime\('now','-1 day'\)/s);
assert.match(server, /e\.status='CLOSED'.*historyWhere/s);
assert.match(server, /pageSize=admin\?30:12/);
assert.match(server, /navigation:\{view,page,pageSize,total,totalPages,counts:/);
assert.match(server, /admin\/coin-prediction\/state.*eventData\(env,user\.id,true,ownerUnlimited,listView,listPage\)/s);
assert.match(server, /coin-prediction\/state.*eventData\(env,user\.id,false,ownerUnlimited,listView,listPage\)/s);
assert.doesNotMatch(server, /settledRetention=admin\?'-1 day':'-1 hour'/);

assert.match(userUi, /data-cp-view="active"/);
assert.match(userUi, /data-cp-view="history"/);
assert.match(userUi, /종료된 경기/);
assert.match(userUi, /종료 후 24시간 동안 결과와 내 베팅·정산 내역/);
assert.match(userUi, /coin-prediction\/state\?view=\$\{requestedView\}&page=\$\{requestedPage\}/);
assert.match(userUi, /MY PREDICTION/);
assert.match(userUi, /\$\{fmt\(payout\)\} COIN 환불/);
assert.match(userUi, /payout > 0 \? `\+\$\{fmt\(payout\)\} COIN` : '미적중'/);
assert.match(userCss, /\.cp-history-tabs/);
assert.match(userCss, /@media\(max-width:720px\).*\.cp-history-tabs/s);
assert.match(userV2Css, /\.cp2-option-grid/);
assert.match(userV2Css, /--cp2-cyan:\s*#caff5c/);
assert.match(userV2Css, /@media \(max-width: 720px\)/);

assert.match(adminUi, /data-cp-admin-view="active"/);
assert.match(adminUi, /data-cp-admin-view="history"/);
assert.match(adminUi, /정산 대기 우선 · 완료 기록 24시간/);
assert.match(adminUi, /admin\/coin-prediction\/state\?view=\$\{requestedView\}&page=\$\{requestedPage\}/);
assert.match(adminUi, /data-cp-admin-action="SETTLE"/);
assert.match(adminCss, /\.cp-admin-tabs/);
assert.match(adminCss, /@media\(max-width:560px\).*\.cp-admin-tabs/s);

assert.match(app, /coin-prediction-v1\.css\?v=1813-history-tabs/);
assert.match(app, /coin-prediction-v2\.css\?v=1861-broadcast-ledger/);
assert.match(app, /coin-prediction-v1\.js\?v=1861-broadcast-ledger/);
assert.match(index, /js\/app\.js\?v=1921-inventory-reroll-route/);
assert.match(adminIndex, /coin-prediction-admin-v1\.css\?v=1883-prediction-only-admin/);
assert.match(adminIndex, /coin-prediction-admin-v1\.js\?v=1883-prediction-only-admin/);
assert.match(serviceWorker, /soop-card-shell-v\d+/);

console.log('coin prediction active/history tabs + 24-hour retention PASS');

const connectionString = process.env.CNINE_NEON_DATABASE_URL;
if (connectionString) {
  const client = new Client({ connectionString, application_name: 'coin-prediction-history-v1813' });
  await client.connect();
  const token = `prediction-history-${randomUUID()}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try {
    const owner = (await client.query(
      "SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1",
    )).rows[0];
    assert.ok(owner?.id, 'OWNER account is required for PostgreSQL route checks');
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at,client_id) VALUES($1,$2,'2099-12-31 23:59:59',$3)",
      [tokenHash, owner.id, 'coin-prediction-history-v1813'],
    );
    for (const [route, expectedView] of [
      ['coin-prediction/state?view=active&page=1', 'active'],
      ['coin-prediction/state?view=history&page=1', 'history'],
      ['admin/coin-prediction/state?view=active&page=1', 'active'],
      ['admin/coin-prediction/state?view=history&page=1', 'history'],
    ]) {
      const background = [];
      const response = await onRequest({
        request: new Request(`https://cnine-card.test/api/${route}`, {
          headers: { authorization: `Bearer ${token}`, 'x-cnine-client-id': 'coin-prediction-history-v1813' },
        }),
        env: { DB_BACKEND: 'postgres', HYPERDRIVE: { connectionString } },
        waitUntil(promise) { background.push(Promise.resolve(promise)); },
      });
      await Promise.allSettled(background);
      const body = await response.json().catch(() => ({}));
      assert.equal(response.status, 200, `${route}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
      assert.equal(body.navigation?.view, expectedView, `${route}: wrong navigation view`);
      assert.equal(body.navigation?.historyRetentionHours, 24, `${route}: wrong retention`);
      assert.ok(Number.isInteger(body.navigation?.counts?.active), `${route}: active count missing`);
      assert.ok(Number.isInteger(body.navigation?.counts?.history), `${route}: history count missing`);
    }
    console.log('coin prediction PostgreSQL active/history routes PASS');
  } finally {
    await client.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]).catch(() => {});
    await client.end();
  }
}

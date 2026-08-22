import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { onRequest } from '../functions/api/[[path]].js';

const connectionString = process.env.CNINE_NEON_DATABASE_URL;
if (!connectionString) throw new Error('CNINE_NEON_DATABASE_URL is required');

const client = new Client({ connectionString, application_name: 'cnine-route-smoke' });
await client.connect();

const token = `migration-smoke-${randomUUID()}`;
const tokenHash = createHash('sha256').update(token).digest('hex');
const routes = [
  'me',
  'me/summary',
  'me/collection',
  'shell/summary',
  'cards',
  'packs',
  'inventory',
  'messages',
  'battle/config',
  'pvp/config',
  'pvp/ranking',
  'raid/status',
  'tower/status',
  'rift/status',
  'equipment/supply-box/config',
  'vehicle-draw/config',
  'secondary-verification/status',
  'ranking',
  'hall-of-fame',
];

try {
  const owner = (await client.query(
    "SELECT id,nickname,role FROM users WHERE UPPER(role) IN ('OWNER','ADMIN') ORDER BY CASE WHEN UPPER(role)='OWNER' THEN 0 ELSE 1 END,id LIMIT 1",
  )).rows[0];
  assert.ok(owner?.id, 'OWNER/ADMIN smoke user is required');

  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at,client_id) VALUES($1,$2,'2099-12-31 23:59:59',$3)",
    [tokenHash, owner.id, 'postgres-route-smoke'],
  );

  for (const route of routes) {
    const background = [];
    const response = await onRequest({
      request: new Request(`https://cnine-card.test/api/${route}`, {
        headers: { authorization: `Bearer ${token}`, 'x-cnine-client-id': 'postgres-route-smoke' },
      }),
      env: {
        DB_BACKEND: 'postgres',
        HYPERDRIVE: { connectionString },
      },
      waitUntil(promise) { background.push(Promise.resolve(promise)); },
    });
    await Promise.allSettled(background);
    const body = await response.text();
    assert.equal(response.status, 200, `${route}: HTTP ${response.status} ${body.slice(0, 300)}`);
    console.log(`${route}: 200`);
  }
} finally {
  await client.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]).catch(() => {});
  await client.end();
}

console.log(`PostgreSQL authenticated route smoke PASS (${routes.length} routes)`);

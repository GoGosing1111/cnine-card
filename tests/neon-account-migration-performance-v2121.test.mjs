import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const clan=readFileSync(new URL('../functions/_clan.js',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');

test('global runtime migrations use one durable fast gate after full verification',()=>{
  assert.match(api,/RUNTIME_UPGRADE_FAST_MARKER='safe_runtime_upgrade_v2121_runtime_foundation_fast_gate'/);
  const read=api.indexOf("bind(RUNTIME_UPGRADE_FAST_MARKER).first()");
  const legacy=api.indexOf('await ensureD1HotpathIndexes(env)',read);
  const write=api.indexOf("bind(RUNTIME_UPGRADE_FAST_MARKER).run()",legacy);
  assert.ok(read>=0&&legacy>read&&write>legacy,'fast marker must be read before and written after the full runtime audit');
});

test('clan reads skip the historical foundation chain only after its durable marker',()=>{
  assert.match(clan,/CLAN_FOUNDATION_FAST_MARKER='safe_runtime_upgrade_v2121_clan_foundation_fast_gate'/);
  const read=clan.indexOf("bind(CLAN_FOUNDATION_FAST_MARKER).first()");
  const participation=clan.indexOf('await ensureClanParticipationSchema(env)',read);
  const write=clan.indexOf("bind(CLAN_FOUNDATION_FAST_MARKER).run()",participation);
  assert.ok(read>=0&&participation>read&&write>participation,'clan fast marker must cover every subordinate foundation');
});

test('Cloudflare execution stays pinned beside the existing Singapore Neon database',()=>{
  assert.match(wrangler,/DB_BACKEND\s*=\s*"postgres"/);
  assert.match(wrangler,/region\s*=\s*"aws:ap-southeast-1"/);
  assert.match(wrangler,/id\s*=\s*"12ed48b0fb374f82a610cc1daba92e95"/);
});

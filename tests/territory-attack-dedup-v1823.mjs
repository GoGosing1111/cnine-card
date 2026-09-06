import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');

assert.match(server,/status='APPLIED' OR \(status='PENDING' AND datetime\(updated_at\)>=datetime\('now','-3 minutes'\)\)/);
assert.match(server,/duplicateSuppressed:true/);
assert.match(server,/DELETE FROM territory_war_v3_actions WHERE request_id=\? AND user_id=\? AND status='PENDING'/);
assert.match(server,/진행 중인 교전이 없는데 락만 남아 있으면 고아 락/);
assert.match(client,/pendingAttackId=String\(data\.requestId\|\|pendingAttackId\)/);
assert.match(api,/if\(String\(path\)==='territory-war\/attack'\)return false/);
assert.match(index,/territory-war-v1811\.js\?v=2053-player-calling-card/);

console.log('territory attack dedup v1823: ok');

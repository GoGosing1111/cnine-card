import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/territory-war-admin-v1362.js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const serviceWorker=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');

assert.match(server,/CREATE TABLE IF NOT EXISTS territory_war_v3_round_equipment_rewards/);
assert.match(server,/PRIMARY KEY\(round_id,equipment_id,result_scope\)/);
assert.match(server,/roundEquipmentBonuses\(env,v3\.round_id,v3\.result\)/);
assert.match(server,/reward\.version==='V3'&&reward\.result==='WIN'/);
assert.match(server,/source_type,source_id,request_id\)[\s\S]*'TERRITORY_WAR'/);
assert.match(server,/claimed_at IS NULL AND result='WIN'/);
assert.match(server,/`TW3-\$\{reward\.round_id\}-\$\{user\.id\}-\$\{equipmentId\}-\$\{index\+1\}`/);
assert.ok(server.indexOf("INSERT INTO user_equipment_instances")<server.indexOf("SET claimed_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND claimed_at IS NULL"),'equipment grants must be in the same batch before the claim marker');

assert.match(client,/function rewardEquipmentHtml/);
assert.match(client,/이번 회차 승리 추가 장비/);
assert.match(client,/data\.bonusEquipment/);
assert.match(admin,/승리 추가 장비 준비 완료/);
assert.match(index,/territory-war-v1811\.js\?v=1916-territory-100-attack-reward/);
assert.match(index,/territory-war-v1811\.css\?v=1914-territory-dispatch-persist/);
assert.match(serviceWorker,/soop-card-shell-v1938-unique-advancement-cost/);

console.log('territory round equipment reward v1737: ok');

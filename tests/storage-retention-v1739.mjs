import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const storage=await readFile(new URL('../functions/_storage_cleanup.js',import.meta.url),'utf8');
const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const captain=await readFile(new URL('../functions/_captain.js',import.meta.url),'utf8');

assert.match(storage,/const AUTO_STORAGE_MAINTENANCE_BATCH=5000/);
assert.match(storage,/const AUTO_HIGH_VOLUME_SCAN_BATCH=50000/);
assert.match(storage,/key:'battle_history'[^\n]*retentionDays:1/);
assert.match(storage,/key:'pvp_history'[^\n]*retentionDays:1/);
assert.match(storage,/key:'raid_damage_history'[\s\S]*status='ENDED'/);
assert.match(storage,/key:'monster_siege_actions'[\s\S]*e\.status IN \('CLEARED','FAILED'\)/);

for(const task of [
  'inventory_receipts','magic_draw_receipts','magic_enhance_receipts',
  'breakthrough_auto_receipts','black_miracle_open_receipts',
  'limited_grant_receipts','vehicle_receipts','vehicle_purchase_receipts',
  'equipment_drop_receipts','cube_drop_receipts','seal_action_receipts',
  'pve_auto_receipts','unified_drop_receipts','scrapyard_run_receipts',
  'workshop_craft_receipts','equipment_synthesis_receipts'
])assert.match(storage,new RegExp(`key:'${task}'[\\s\\S]{0,450}datetime\\('now','-1 day'\\)`));

assert.match(storage,/async function runInventoryReceiptMaintenance/);
assert.match(storage,/idx_inventory_receipts_cleanup_v1739/);
assert.match(storage,/async function runMagicRewardReceiptMaintenance[\s\S]*LIMIT 10000/);
assert.doesNotMatch(storage,/status IN \('FAILED','RETRYABLE','PENDING'\)/);
assert.match(api,/CREATE INDEX IF NOT EXISTS idx_inventory_receipts_cleanup_v1739 ON inventory_use_receipts\(status,updated_at,request_id\)/);
assert.match(captain,/captain_match_receipts_v3[\s\S]*updated_at<datetime\('now','-1 day'\)/);
assert.match(captain,/captain_match_history_v3[\s\S]*created_at<datetime\('now','-1 day'\)/);

console.log('storage retention v1739: ok');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin=readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');

assert.match(admin,/<option value="SCRAPYARD_ENTRY_TICKET">폐차장 출입 허가증 · 입장권<\/option>/);
assert.match(admin,/폐차장 입장권 <b>\$\{Number\(u\.scrapyard_tickets\|\|0\)\.toLocaleString\(\)\}<\/b>장/);
assert.match(admin,/id="inventoryItemAmount" type="number" min="1" max="9999"/);
assert.match(admin,/inventoryGrantBtn'\)\.onclick=async\(\)=>\{[^}]*button\.disabled=true/);
assert.match(headers,/\/admin\/\*[\s\S]{0,100}Cache-Control: no-store/,'CMS JavaScript must bypass stale browser/CDN caches');
assert.match(api,/inv\.item_code='SCRAPYARD_ENTRY_TICKET'\) AS scrapyard_tickets/);
assert.match(api,/action==='INVENTORY'[\s\S]{0,800}SELECT code,name FROM inventory_items WHERE code=\? AND is_active=1/);
assert.match(api,/INSERT INTO inventory_logs[\s\S]{0,300}'ADMIN_GRANT'/);

console.log('CMS user management: scrapyard ticket quantity, grant option, active-item validation and ledger verified');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(api,/const PREMIUM_CUBE_OPEN_COUNTS=new Set\(\[1,10,100\]\)/);
assert.match(api,/async function openPremiumCubeBulk\([\s\S]*quantity=quantity-\?[\s\S]*quantity>=\?/);
assert.match(api,/for\(let index=0;index<count;index\+\+\)/);
assert.match(api,/quantity=user_cards\.quantity\+excluded\.quantity/);
assert.match(api,/CUBE_BULK_OPEN/);
assert.match(api,/INVENTORY_CUBE_BULK_DUPLICATE/);
assert.match(api,/limitedAuditFinishStatement\(env,event\.eventKey/);
assert.match(api,/profileScope:'INVENTORY_PARTIAL'/);
assert.match(api,/status='COMPLETED',response_json=\?/);
assert.match(api,/status='FAILED',error_message=\?/);
assert.match(api,/itemCode==='PREMIUM_CUBE'&&openCount>1/);

assert.match(app,/\[1,10,100\]\.map\(count=>/);
assert.match(app,/body:JSON\.stringify\(\{itemCode,requestId,count:selectedCount\}\)/);
assert.match(app,/Array\.isArray\(d\.results\)/);
assert.match(app,/inventory-bulk-summary/);
assert.match(app,/남은 프리미엄 큐브/);
assert.match(css,/\.inventory-cube-count/);
assert.match(css,/\.inventory-bulk-grid/);
assert.match(css,/@media\(max-width:700px\)[\s\S]*\.inventory-bulk-grid/);
assert.match(index,/style\.css\?v=1870-avatar-pve-energy/);
assert.match(index,/app\.js\?v=1874-burning-header-dock/);

console.log('premium cube bulk v1822: ok');

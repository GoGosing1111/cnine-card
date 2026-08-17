import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(api,/path==='draw\/ack'/);
assert.match(api,/status='ARCHIVED',response_json=NULL,error_message=NULL/);
assert.match(api,/status='COMPLETED'/);
assert.match(api,/status,updated_at,request_id/);
assert.match(api,/status='ARCHIVED' AND updated_at<datetime\('now','-5 minutes'\)/);
assert.match(api,/status IN \('COMPLETED','FAILED'\) AND updated_at<datetime\('now','-15 minutes'\)/);
assert.match(api,/status='RETRYABLE' AND updated_at<datetime\('now','-1 hour'\)/);
assert.doesNotMatch(api,/DELETE FROM draw_request_receipts_v2[^`]*status='PENDING'/s);
assert.match(app,/await renderDrawResults[\s\S]*void acknowledgeDrawReceipt\(requestId\)/);
assert.match(index,/js\/app\.js\?v=1728-feature-lazy-load/);

console.log('draw receipt retention v1723 checks passed');

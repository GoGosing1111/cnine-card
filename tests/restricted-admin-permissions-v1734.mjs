import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const prediction=await readFile(new URL('../functions/_coin_prediction.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');

assert.match(api,/async function adminPermissionProfile/);
assert.match(api,/permission_key,is_allowed FROM admin_permissions/);
assert.match(api,/COUPON_ISSUE/);
assert.match(api,/if\(!manager\)return json\(\{error:'쿠폰 수정 권한이 없습니다\.'/);
assert.match(api,/if\(!manager\)return json\(\{error:'쿠폰 삭제 권한이 없습니다\.'/);
assert.match(api,/deps:\{authenticate,readBody,json,isAdminRole,requirePermission,writeAdminLog\}/);
assert.equal((prediction.match(/COIN_PREDICTION_MANAGE/g)||[]).length,4);
assert.match(admin,/allowed=new Set\(\['coupons','coinprediction'\]\)/);
assert.match(admin,/restricted\?!allowed\.has\(button\.dataset\.view\)/);
assert.match(admin,/restricted\?'<span><\/span>'/);
assert.match(index,/admin-v1276\.js\?v=1734-restricted-admin/);

console.log('restricted admin permissions v1734: ok');

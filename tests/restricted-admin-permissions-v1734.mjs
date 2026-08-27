import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const prediction=await readFile(new URL('../functions/_coin_prediction.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
const predictionUi=await readFile(new URL('../admin/coin-prediction-admin-v1.js',import.meta.url),'utf8');
const predictionCss=await readFile(new URL('../admin/coin-prediction-admin-v1.css',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');
const tower=await readFile(new URL('../js/tower-v1038.js',import.meta.url),'utf8');
const magicAdmin=await readFile(new URL('../admin/admin-v1094-magic.js',import.meta.url),'utf8');
const ownerOnlyModules=(await Promise.all([
  '_black_miracle_pack.js','_drop_pool.js','_equipment.js','_magic.js','_scrapyard.js','_vehicle_draw.js','_workshop.js'
].map(file=>readFile(new URL(`../functions/${file}`,import.meta.url),'utf8')))).join('\n');
const sealBattle=await readFile(new URL('../functions/_seal_battle.js',import.meta.url),'utf8');

assert.match(api,/async function adminPermissionProfile/);
assert.match(api,/function isAdminRole\(user\)\{return Boolean\(user&&String\(user\.role\|\|''\)\.toUpperCase\(\)==='OWNER'\)\}/);
assert.match(api,/function isDedicatedPredictionAdmin\(user\)\{return String\(user\?\.role\|\|''\)\.toUpperCase\(\)==='ADMIN'\}/);
assert.match(api,/function canUseTestAccess\(user,maintenance\)\{return Boolean\(user&&!isDedicatedPredictionAdmin\(user\)&&maintenance\?\.testUsers\?\.includes\(user\.nickname\)\)\}/);
assert.equal((api.match(/canUseTestAccess\(user,maintenance\)/g)||[]).length,4);
assert.doesNotMatch(api,/testUnlimited&&maintenance\.testUsers\.includes\(user\.nickname\)/);
assert.match(api,/return role==='ADMIN'\|\|\(role==='OWNER'&&settings\.adminTestAllowed===false\);/);
assert.match(api,/return \{restricted:true,permissions:\['COIN_PREDICTION_MANAGE'\]\};/);
assert.doesNotMatch(api,/permission_key,is_allowed FROM admin_permissions/);
assert.doesNotMatch(api,/access\.permissions\.includes\('COUPON_(?:ISSUE|MANAGE)'\)/);
assert.match(api,/path==='admin\/dashboard'/);
assert.match(api,/startsWith\('admin\/coin-prediction\/'\)/);
assert.match(api,/ADMIN 계정은 승부예측 관리만 사용할 수 있습니다/);
assert.match(api,/deps:\{authenticate,readBody,json,isAdminRole,requirePermission,writeAdminLog\}/);
assert.equal((prediction.match(/COIN_PREDICTION_MANAGE/g)||[]).length,1);
assert.match(prediction,/adminPath\?Boolean\(await deps\.requirePermission\(request,env,'COIN_PREDICTION_MANAGE'\)\):deps\.isAdminRole\(user\)/);
assert.match(admin,/allowed=new Set\(\['coinprediction'\]\)/);
assert.match(admin,/restricted\?!allowed\.has\(button\.dataset\.view\)/);
assert.match(admin,/admin-prediction-only/);
assert.match(admin,/if\(restricted&&view!=='coinprediction'\)/);
assert.match(predictionUi,/admin-prediction-only/);
assert.match(predictionUi,/queueMicrotask\(\(\)=>button\.click\(\)\)/);
assert.match(predictionCss,/body\.admin-prediction-only #nav button\[data-view\]:not\(\[data-view="coinprediction"\]\)/);
assert.match(predictionCss,/#cms>\.view:not\(#view-coinprediction\)/);
assert.match(index,/<strong>ADMIN<\/strong> 승부예측 관리 전담/);
assert.match(index,/admin-v1276\.js\?v=1883-prediction-only-admin/);
assert.match(index,/coin-prediction-admin-v1\.css\?v=1883-prediction-only-admin/);
assert.match(index,/coin-prediction-admin-v1\.js\?v=1883-prediction-only-admin/);
assert.doesNotMatch(ownerOnlyModules,/\['OWNER',\s*'ADMIN'\]/);
assert.match(sealBattle,/settings\.mode === 'TEST'.*toUpperCase\(\) !== 'OWNER'/s);
assert.match(tower,/function privileged\(\)\{const user=loadUser\?\.\(\);return String\(user\?\.role\|\|''\)\.toUpperCase\(\)==='OWNER'\}/);
assert.doesNotMatch(tower,/\['OWNER','ADMIN'\]/);
assert.doesNotMatch(magicAdmin,/\['OWNER','ADMIN'\]/);

console.log('prediction-only ADMIN permissions: ok');

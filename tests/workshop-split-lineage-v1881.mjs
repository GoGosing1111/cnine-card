import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const client = readFileSync(new URL('js/workshop-v1881.js', root), 'utf8');
const css = readFileSync(new URL('css/workshop-v1881.css', root), 'utf8');
const server = readFileSync(new URL('functions/_workshop.js', root), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

// The workshop and scrapyard are separate screens and must not share their
// initial status request. Mutations remain on their dedicated endpoints.
const bindWorkshop = between(client, 'async function bindWorkshopView()', 'async function bindScrapyardView()');
const bindScrapyard = between(client, 'async function bindScrapyardView()', 'async function craftVehicle()');
assert.match(bindWorkshop, /nextState\s*=\s*await api\('workshop'\)[\s\S]*?workshopState\s*=\s*nextState/);
assert.doesNotMatch(bindWorkshop, /scrapyard\/status|Promise\.all/);
assert.match(bindScrapyard, /nextState\s*=\s*await api\('scrapyard\/status'\)[\s\S]*?scrapyardState\s*=\s*nextState/);
assert.doesNotMatch(bindScrapyard, /api\('workshop'\)|Promise\.all/);
assert.match(bindWorkshop, /loadVersion\s*!==\s*workshopLoadVersion[\s\S]*?epoch\s*!==\s*routeEpoch/);
assert.match(bindScrapyard, /loadVersion\s*!==\s*scrapyardLoadVersion[\s\S]*?syncVersion\s*!==\s*scrapyardSyncVersion/);

const workshopNav = between(client, 'function workshopNav()', 'function vehiclePartsBank()');
assert.match(workshopNav, /data-ws-section="VEHICLE"/);
assert.match(workshopNav, /data-ws-section="SYNTHESIS"/);
assert.match(workshopNav, /data-ws-section="MATERIAL_CRAFT"/);
assert.doesNotMatch(workshopNav, /SCRAPYARD|폐차장/);
assert.deepEqual([...workshopNav.matchAll(/data-ws-section="([^"]+)"/g)].map(match => match[1]), ['VEHICLE', 'SYNTHESIS', 'MATERIAL_CRAFT']);

// Tire/frame/engine balances are a vehicle-panel concern only.
const vehiclePanel = between(client, 'function vehiclePanel()', 'const synthRequired');
const synthesisPanel = between(client, 'function synthesisPanel()', 'function scrapyardPanel()');
assert.equal((vehiclePanel.match(/vehiclePartsBank\(\)/g) || []).length, 2, 'vehicle panel must render the parts bank for both empty and populated recipe states');
assert.doesNotMatch(synthesisPanel, /vehiclePartsBank|ws81-parts-bank|VEHICLE_PART_(?:TIRE|FRAME|ENGINE)/);
assert.equal((client.match(/vehiclePartsBank\(\)/g) || []).length, 3, 'only the declaration and the two vehiclePanel render paths may reference the parts bank');

// READY is calculated from the recipe contract rather than a hard-coded UI
// count; ALL keeps every public recipe supplied by /workshop.
assert.match(client, /let synthesisMode\s*=\s*'READY'/);
assert.match(client, /const synthRequired\s*=\s*recipe\s*=>\s*Math\.max\(1,\s*Number\(recipe\?\.input_quantity\s*\|\|\s*3\)\)/);
assert.match(client, /const canSynthesize\s*=\s*recipe\s*=>\s*Number\(recipe\?\.quantity\s*\|\|\s*0\)\s*>=\s*synthRequired\(recipe\)/);
assert.match(client, /synthesisMode\s*===\s*'READY'\s*\?\s*all\.filter\(row\s*=>\s*canSynthesize\(row\)\s*\|\|\s*Number\(row\.recipe_id\)\s*===\s*pendingId\)\s*:\s*all/);
assert.match(synthesisPanel, /data-synth-mode="READY"[\s\S]*?<span>활성화<\/span>/);
assert.match(synthesisPanel, /data-synth-mode="ALL"[\s\S]*?<span>전체보기<\/span>/);
assert.match(synthesisPanel, /visible\.map\(lineageItem\)/);
assert.match(synthesisPanel, /현재 바로 합성 가능한 장비가 없습니다/);
assert.match(synthesisPanel, /data-synth-show-all>전체 계보 보기/);
assert.match(client, /data-synth-show-all[\s\S]{0,220}synthesisMode\s*=\s*'ALL'/);

// A mode switch cannot leave a hidden recipe selected.
assert.match(client, /visibleIds\s*=\s*new Set\(synthesisRows\(\)\.map/);
assert.match(client, /if\s*\(!visibleIds\.has\(Number\(selectedSynthesisRecipe\)\)\)\s*selectedSynthesisRecipe\s*=\s*0/);

// The client refreshes the server state immediately before synthesis, and the
// server independently excludes equipped instances and guards the same
// recipe-defined quantity before consuming it.
const synthesize = between(client, 'async function synthesizeEquipment()', 'async function showSynthesisReveal');
const refreshAt = synthesize.indexOf("nextState = await api('workshop')");
const postAt = synthesize.indexOf("api('workshop/synthesis'");
assert.ok(refreshAt >= 0 && postAt > refreshAt, 'server state must be refreshed before synthesis POST');
assert.match(synthesize, /const required\s*=\s*synthRequired\(recipe\)/);
assert.match(synthesize, /if\s*\(!canSynthesize\(recipe\)\s*&&\s*!recovering\)/);
assert.match(synthesize, /const ownsAction\s*=\s*\(\)\s*=>\s*actionVersion\s*===\s*workshopActionVersion/);
assert.match(synthesize, /const canPresent\s*=\s*\(\)\s*=>\s*ownsAction\(\)[\s\S]*?routeEpoch[\s\S]*?workshopMounted\(\)/);
const routeInvalidation = between(client, "window.addEventListener('cnine:route-will-change'", 'function workshopView()');
assert.match(routeInvalidation, /workshopLoadVersion\s*\+=\s*1[\s\S]*?scrapyardLoadVersion\s*\+=\s*1/);
assert.doesNotMatch(routeInvalidation, /workshopActionVersion\s*\+=|scrapyardActionVersion\s*\+=|workshopBusy\s*=\s*false|scrapyardBusy\s*=\s*false/, 'route changes must hide presentation without unlocking in-flight mutations');
assert.match(synthesize, /finally\s*\{[\s\S]*?if\s*\(ownsAction\(\)\)[\s\S]*?workshopBusy\s*=\s*false/);

// Mutation request ids survive transport timeouts and are reused for the
// same action until the server gives a definitive completed/failed response.
assert.match(client, /let pendingVehicleRequest\s*=\s*null/);
assert.match(client, /let pendingSynthesisRequest\s*=\s*null/);
assert.match(client, /let pendingScrapyardRequest\s*=\s*null/);
assert.match(client, /sessionStorage\.setItem\(PENDING_REQUESTS_KEY/);
assert.match(client, /current && current\.target !== normalizedTarget/);
assert.match(client, /if \(current\) return \{ \.\.\.current, reused: true \}/);
assert.match(client, /const mutationTransportUncertain\s*=\s*error\s*=>\s*!Number\(error\?\.status\)\s*\|\|\s*mutationStillProcessing\(error\)/);
const craftVehicle = between(client, 'async function craftVehicle()', 'function showVehicleResult');
const runScrapyard = between(client, 'async function runScrapyard(', 'function showScrapResult');
assert.match(craftVehicle, /prepareMutationRequest\('vehicle'[\s\S]*?requestId:\s*ticket\.requestId/);
assert.match(synthesize, /prepareMutationRequest\('synthesis'[\s\S]*?requestId:\s*ticket\.requestId/);
assert.match(runScrapyard, /prepareMutationRequest\('scrapyard'[\s\S]*?requestId:\s*ticket\.requestId/);
assert.doesNotMatch(craftVehicle, /requestId:\s*rid\(/);
assert.doesNotMatch(synthesize, /requestId:\s*rid\(/);
assert.doesNotMatch(runScrapyard, /requestId:\s*rid\(/);
assert.match(vehiclePanel, /const recovering\s*=\s*pending\?\.target[\s\S]*?const ready\s*=\s*recovering\s*\|\|/);
assert.match(vehiclePanel, /recovering \? '이전 차량 제작 결과 확인'/);
assert.match(client, /canSynthesize\(row\) \|\| Number\(row\.recipe_id\) === pendingId/);
assert.match(client, /recovering \? '이전 장비 합성 결과 확인'/);
assert.match(synthesize, /if \(!canSynthesize\(recipe\) && !recovering\)/);
assert.match(client, /recovering \? '이전 원정 결과 확인'/);

const serverSynthesis = between(server, 'async function synthesizeEquipment', 'async function adminSnapshot');
assert.match(serverSynthesis, /await synthesisRecipeRows\(env,user\)/);
assert.match(serverSynthesis, /LEFT JOIN user_equipment_loadout l ON l\.instance_id=x\.id/);
assert.match(serverSynthesis, /l\.instance_id IS NULL/);
assert.match(serverSynthesis, /required=int\(recipe\.input_quantity,1,20,3\)/);
assert.match(serverSynthesis, /equipmentSynthesisBatchPlan\(\{available:recipe\.quantity,required,attempts:body\.attempts\?\?1\}\)/);
assert.match(serverSynthesis, /ORDER BY x\.id LIMIT \?`\)\.bind\(user\.id,equipmentId,plan\.totalRequired\)/);
assert.match(serverSynthesis, /if\(\(inputs\.results\|\|\[\]\)\.length!==plan\.totalRequired\)/);
assert.match(serverSynthesis, /selectedIdRows=.*jsonb_array_elements_text[\s\S]*json_each\(\?\)/);
assert.match(serverSynthesis, /x\.id IN \(\$\{selectedIdRows\}\)\)=\? THEN 1 ELSE 0 END`\)\.bind\(guardId,user\.id,user\.id,equipmentId,instanceIdsJson,plan\.totalRequired\)/);
assert.match(serverSynthesis, /SELECT COUNT\(\*\)[\s\S]*l\.instance_id IS NULL[\s\S]*verified=1/);
assert.ok((server.match(/l\.instance_id IS NULL/g) || []).length >= 3, 'state, execution, and guard queries must all exclude equipped gear');
assert.match(server, /path==='workshop'&&request\.method==='GET'/);
assert.match(server, /path==='workshop\/synthesis'&&request\.method==='POST'/);

// 320–430px viewports inherit a clipped, zero-min-width shell and collapse
// navigation/lineage/fusion grids instead of creating page-level overflow.
assert.match(css, /\.ws81-workshop,\s*\n?\.ws81-scrapyard\{[^}]*overflow-x:clip/);
assert.match(css, /\.ws81-root\{min-width:0\}/);
assert.match(css, /@media\(max-width:430px\)\{/);
const narrow = css.slice(css.indexOf('@media(max-width:430px)'));
assert.match(narrow, /\.ws81-root\{width:calc\(100% - 10px\)\}/);
assert.match(narrow, /\.ws81-nav\{grid-template-columns:1fr\}/);
assert.match(css, /@media\(max-width:680px\)[\s\S]*?\.ws81-lineage-item\{grid-template-columns:minmax\(0,1fr\)/);
assert.match(css, /@media\(max-width:680px\)[\s\S]*?\.ws81-fusion-board\{grid-template-columns:1fr!important/);
assert.match(css, /\.ws81-lineage-list\{min-width:0/);
assert.match(css, /\.ws81-lineage-item\{min-width:0/);

console.log('workshop split, lineage modes, server revalidation and 320-430px responsive contracts verified');

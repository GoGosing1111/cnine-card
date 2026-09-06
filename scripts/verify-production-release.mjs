import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fail = message => {
  console.error(`[PRODUCTION RELEASE BLOCKED] ${message}`);
  process.exitCode = 1;
};

const index = read('index.html');
const app = read('js/app.js');
const api = read('functions/api/[[path]].js');
const pve = read('js/pve-command-v2-live.js');
const worker = read('service-worker.js');
const blackMiracle = read('functions/_black_miracle_pack.js');
const core = read('functions/_raid_core_protocol.js');
const coreUi = read('js/core-protocol-raid-v1924.js');
const coreTicketAsset = new URL('../assets/items/core-raid-entry-ticket-v1.png', import.meta.url);

if (!existsSync(coreTicketAsset)) fail('the dedicated Core raid entry-ticket image is missing');

for (const resource of [
  'css/core-protocol-raid-v1924.css?v=2026-core-balance',
  'js/project-v-raid-qte-v1924.js?v=2021-sequence-swipe',
  'js/core-protocol-raid-v1924.js?v=2048-yhwach',
]) {
  if (!index.includes(resource)) fail(`index.html is missing the reviewed Core test resource: ${resource}`);
}

const raidBranch = app.match(/if\(mode==='raid'\)\{[\s\S]{0,900}?return;\}/)?.[0] || '';
if (!raidBranch || !raidBranch.includes('loadRaidView();') || !raidBranch.includes('CoreProtocolRaidV1924?.openActive?.()')) {
  fail('the production raid entry is missing the legacy-first Core TEST probe');
} else if (raidBranch.indexOf('loadRaidView();') > raidBranch.indexOf('CoreProtocolRaidV1924?.openActive?.()')) {
  fail('Core raid is invoked before the legacy loadRaidView() safety path');
} else if (!/Promise\.resolve\([\s\S]*CoreProtocolRaidV1924[\s\S]*\)\.catch\(/.test(raidBranch)) {
  fail('Core raid entry failures are not isolated from the legacy world raid');
}
if (!/id=["']pveRaidView["']/.test(app) || !/id=["']pveRaidView["']/.test(pve)) {
  fail('the legacy raid container is missing from app.js or the PVE live adapter');
}
if (!/id=["']pveRaidHubView["']/.test(pve)
  || !/data-raid-content=["']core["'][^>]+aria-hidden=["']true["'][^>]+hidden/.test(pve)
  || !/id=["']pveCoreRaidView["'][^>]+hidden/.test(pve)) {
  fail('Core raid must ship as an initially hidden tab beside the untouched legacy raid view');
}
if (!/handleRaidCoreProtocol/.test(api) || !/_raid_core_protocol/.test(api)) {
  fail('the Core raid API delegation is missing');
}
if (!/mode\s*:\s*'TEST'/.test(core) || !/rewardLocked\s*:\s*true/.test(core)
  || !/coreRaidFeatureAccess/.test(core) || !/raid\/core\/feature/.test(core)) {
  fail('Core raid must default to TEST access with rewards locked');
}
if (!/deps\.raidDeckPower\(env,\s*user\.id,\s*body\.cardIds,\s*'RAID'\)/.test(core)
  || !/\{\s*raidDeckPower,\s*createPveBattleV2\s*\}/.test(core)
  || /pveDeckSnapshot/.test(core)) {
  fail('Core raid is not using the authoritative live RAID deck and Battle V2 pipeline');
}
if (!/loadFeature\(\)/.test(coreUi) || !/feature\?\.visible\s*===\s*true/.test(coreUi)
  || !/preserveServerTimeline\s*:\s*true/.test(coreUi)) {
  fail('Core raid UI is missing its server feature gate or live V3 timeline contract');
}
for (const contract of [
  'raid_core_rooms_v2024',
  'raid_core_members_v2024',
  'raid_core_attempts_v2024',
  'CORE_RAID_ENTRY_TICKET',
  'CORE_RAID_ENTRY_TICKET_IMAGE',
  'coreRaidBalanceState',
  'CORE_OVERLOAD',
  'raid/core/open',
  'raid/core/start',
  'raid/core/battle',
]) {
  if (!core.includes(contract)) fail(`Core room-expedition contract is missing: ${contract}`);
}
if (!/core-raid-entry-ticket-v1\.png/.test(coreUi) || !/OVERLOAD RISK/.test(coreUi)) {
  fail('Core UI is missing the reviewed entry-ticket art or triple-core overload warning');
}
if (/dailyEntries|cycleIdentity/.test(core)) {
  fail('the retired global-cycle/one-attempt Core model is still present');
}

const appTag = index.match(/js\/app\.js\?v=([^"']+)/)?.[1] || '';
const shellTag = worker.match(/soop-card-shell-v([^']+)/)?.[1] || '';
if (!appTag || appTag !== shellTag) {
  fail(`app/service-worker release tags differ: app=${appTag || 'missing'}, shell=${shellTag || 'missing'}`);
}

if (!/const BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED\s*=\s*true\s*;/.test(blackMiracle)) {
  fail('Black Miracle inventory use must be released for this deployment');
}
if (!/blackMiracleUseEnabled=\(await blackMiracleSettings\(env\)\)\.enabled===true/.test(api)
  || !/WHEN i\.code='BLACK_MIRACLE_PACK' THEN \? ELSE 1 END AS usable/.test(api)) {
  fail('Black Miracle inventory usability must follow the cleaned OWNER CMS setting');
}

let dirty = '';
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
} catch (error) {
  fail(`git status failed: ${error.message}`);
}
if (dirty) {
  const emergency = process.env.ALLOW_DIRTY_PRODUCTION_DEPLOY === '1';
  const reason = String(process.env.PRODUCTION_DEPLOY_REASON || '').trim();
  if (!emergency || reason.length < 20) {
    fail('working tree is dirty. Commit a reviewed release, or set ALLOW_DIRTY_PRODUCTION_DEPLOY=1 with a 20+ character PRODUCTION_DEPLOY_REASON for an audited emergency hotfix');
  } else {
    console.warn(`[PRODUCTION RELEASE WARNING] emergency dirty deploy: ${reason}`);
  }
}

let ignored = '';
try {
  ignored = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard'], { encoding: 'utf8' }).trim();
} catch (error) {
  fail(`ignored-file audit failed: ${error.message}`);
}
if (ignored) {
  fail(`ignored files are present in the deploy directory and may be uploaded by Wrangler:\n${ignored}`);
}

try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  if (!head || head !== originMain) fail(`deploy source differs from origin/main: HEAD=${head || 'missing'} origin/main=${originMain || 'missing'}`);
} catch (error) {
  fail(`origin/main verification failed: ${error.message}`);
}

if (!process.exitCode) {
  console.log(`[PRODUCTION RELEASE OK] ${appTag} · legacy raid preserved · Core TEST-gated · rewards locked`);
}

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

const forbidden = [
  ['index.html', index, /core-protocol-raid|project-v-raid-qte/i],
  ['js/app.js', app, /data-raid-content=["']core|pveCoreRaidView|CoreProtocolRaidV1924|CNineCoreRaidBridge/],
  ['functions/api/[[path]].js', api, /_raid_core_protocol|handleRaidCoreProtocol|raid\/core\//],
  ['js/pve-command-v2-live.js', pve, /pveRaidHubView|pveCoreRaidView|data-raid-content=["']core/]
];
for (const [path, source, pattern] of forbidden) {
  if (pattern.test(source)) fail(`${path} contains preview-only Core raid integration: ${pattern}`);
}

if (!/if\(mode==='raid'\)\{[^}]*stopBattleEnergyTimer\(\);[^}]*loadRaidView\(\);return;[^}]*\}/.test(app)) {
  fail('the production raid entry no longer calls the legacy loadRaidView() directly');
}
if (!/id=["']pveRaidView["']/.test(app) || !/id=["']pveRaidView["']/.test(pve)) {
  fail('the legacy raid container is missing from app.js or the PVE live adapter');
}

const appTag = index.match(/js\/app\.js\?v=([^"']+)/)?.[1] || '';
const shellTag = worker.match(/soop-card-shell-v([^']+)/)?.[1] || '';
if (!appTag || appTag !== shellTag) {
  fail(`app/service-worker release tags differ: app=${appTag || 'missing'}, shell=${shellTag || 'missing'}`);
}

if (!/const BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED\s*=\s*false\s*;/.test(blackMiracle)) {
  fail('Black Miracle inventory use must remain OFF for this release');
}
if (!/WHEN i\.code='BLACK_MIRACLE_PACK' THEN 0 ELSE 1 END AS usable/.test(api)) {
  fail('Black Miracle inventory fallback must remain unusable until explicitly enabled');
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
  console.log(`[PRODUCTION RELEASE OK] ${appTag} · legacy raid isolated · Core preview disconnected`);
}

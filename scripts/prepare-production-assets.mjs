import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,link,copyFile,symlink,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildClientManifest} from './build-windows-client-manifest.mjs';
// Preserve originals, preview pages and fixture imports. Executable test runners
// and QA audit reports stay in Git/release checks without consuming Pages assets.
// Game/preview code has no docs/qa imports; approved assets and previews stay intact.
// Jokro reads packed atlases in both preview and live play. The 132 individual
// extraction frames remain in Git for QA; approved source sheets and atlases ship.
// Martial-law authoring originals/prompts and isolated QA stay in Git. Only
// its WebP images, manifest and runtime code consume the bounded Pages budget.
const martialAuthoringOnly=new Set(['assets/ui/martial-law-20261018/illustration-source.png','assets/ui/martial-law-20261018/ui-source.png','assets/ui/martial-law-20261018/prompts.json','tests/helpers/martial-law-fixture.mjs','docs/martial-law-20261018.md']);
// These isolated DB fixtures have no runtime or preview consumers. Keep their
// sources for regression tests without spending the last Pages asset slots.
export const isolatedQaFixtures=new Set(['admin-forge-ticket-fixture','auction-fixture-20260926','funding-gift-fixture','worm-contest-gift-fixture','supporter-pass-fixture','supporter-application-fixture','server-support-fixture','seal-star-fixture','recruitment-gift-fixture','pingdu-thanks-gift-fixture'].map(name=>'tests/helpers/'+name+'.mjs'));
// scripts/qa-* are Node/Playwright runners, not browser imports. Keep them in Git
// alongside the other unshipped runners so new game art fits the Pages file cap.
// One-off scripts/ops tools and receipts also run only from the repository;
// no game or preview imports them, and they are not desktop resources.
// Leonel V1 is rejected history. V2 uses packed atlases in combat and its forty
// composed frames in the preview gallery. Uncomposed body frames and QA remain
// in Git without consuming Pages assets.
const leonelAuthoringOnly=file=>file.startsWith('preview/mercenary-leonel-sss-limited-20261018-v1/')||['qa/','assets/body-frames/'].some(part=>file.startsWith('preview/mercenary-leonel-sss-limited-20261018-v2/'+part));
// The combined equipment-set preview replaces the local Emperor-only review.
// Keep that review and exact PNG authoring originals in Git; ship the six WebPs
// and combined browser preview within Pages' existing 20,000-file budget.
const equipmentSetAuthoringOnly=file=>file.startsWith('preview/emperor-set-v3-20261019/')||/^assets\/effects\/equipment-sets-20261019\/(?:emperor|arden)\/source\//.test(file)||['preview/equipment-sets-v3-20261019/build-fixture.mjs','preview/equipment-sets-v3-20261019/serve.mjs','scripts/build-equipment-set-fx-20261019.mjs'].includes(file);
// Ranked design/verification notes and exact art originals stay in Git; the
// runtime uses the WebPs and manifest. No game imports these authoring files.
// Duo originals, DB benchmark reports and Node-only QA entry points stay in
// Git. The live UI consumes the two WebPs; no browser imports these sources.
const duoAuthoringOnly=file=>/^assets\/ui\/ranked-duo\/random-20261020\/(?:.*-source\.png|prompts\.json|manifest\.json)$/.test(file)||/^docs\/benchmarks\/ranked-duo-[^/]+\.json$/.test(file)||/^docs\/ranked-duo-(?:start|background)-recovery-[^/]+\.json$/.test(file)||/^scripts\/(?:bench-ranked-duo(?:-weekly|-seasons)?|serve-ranked-duo-qa)\.mjs$/.test(file);
const rankedAuthoringOnly=file=>duoAuthoringOnly(file)||/^docs\/ranked-[^/]+\.md$/.test(file)||/^assets\/ui\/ranked\/series-20261019\/(?:console|frame)-source\.png$/.test(file);
// Bathory's body drawings, source prompts and packing/QA scripts stay in Git.
// Combat loads packed atlases; the codex and review use only the idle frame.
const bathoryAuthoringOnly=file=>file.startsWith('preview/mercenary-bathory-halloween-20261019-v1/')&&(
 /\/(?:qa|assets\/body|assets\/thumbs)\//.test(file)||/\/assets\/frames\/(?!idle-01\.png$)/.test(file)||
 /\/(?:build|pack-assets|components|extract-approved-blade|inspect-assets|inspect-reference|measure-balance|read-live-preflight|qa-[^/]+)\.mjs$/.test(file)||
 /\/(?:cut|rupture)-v1\.png$/.test(file)||/\.prompt\.json$/.test(file));
// Node-only build and simulation commands have no browser imports. Keep all
// their outputs and source history; do not spend the Pages file budget on CLIs.
const nodeBuildCommand=file=>/^scripts\/(?:build|measure)-[^/]+\.mjs$/.test(file);
// Zero uses the packed atlases directly in both live combat and its frame gallery.
// Authoring originals, prompts, rejected variants and QA remain preserved in Git.
const zeroRoot='preview/mercenary-cyan-knight-battle-20261020-v1/';
const zeroManifest=JSON.parse(readFileSync(new URL('../'+zeroRoot+'manifest.json',import.meta.url),'utf8'));
const zeroRuntimeFiles=new Set(['index.html','battle.html','preview.css','preview.bundle.js','manifest.json','motion.mjs','array-motion-v4.mjs','live-approval-20261020.json','appearance-approval-20261020.json','prompt-zero-blade-wings-v1.json','zero-blade-wings-review-v1.json','assets/thumbs/idle-01.png',zeroManifest.sourceArt,zeroManifest.weapon.url,zeroManifest.appearance.url,zeroManifest.summonedWeapons.url,...Object.values(zeroManifest.motion).map(s=>s.url),...Object.values(zeroManifest.effects).map(s=>s.url),...Object.values(zeroManifest.backdropVariants).flatMap(s=>[s.url,s.effect?.url].filter(Boolean))].map(p=>zeroRoot+p));
const zeroAuthoringOnly=file=>file.startsWith(zeroRoot)&&!file.startsWith(zeroRoot+'source/')&&!zeroRuntimeFiles.has(file);
// Rank potions load only three WebPs. Keep exact PNG originals, prompts and
// provenance/implementation notes in Git without spending Pages asset slots.
const rankPotionAuthoringOnly=file=>['docs/rank-exp-potions-20261020.md','docs/rank-exp-potion-distribution-20261020.md'].includes(file)||/^assets\/items\/rank-exp-potions-20261020\/(?:.*-source\.png|prompts\.json|manifest\.json)$/.test(file);
// Concurrent releases added these audit receipts after their runtime deploys.
// They have no browser/preview imports; preserve them in Git with the QA records.
// Land's scheduler ships in its Worker bundle, not as a Pages browser asset.
const operationAuditOnly=new Set(['docs/equipment-power-20261020.md','docs/support-package-prediction-20261020.md','docs/support-package-20261020.md','docs/cooperative-energy-entry-20261020-release.json','docs/support-package-20261020-catalog.json','docs/support-package-20261020-release.json','docs/pingdu-owner-energy-pass-20261020.md','docs/pingdu-owner-energy-pass-20261020-release.json','workers/clan-draft/src/land-daily.js']);
// Helpers are Node-only database/simulation fixtures. Browser previews consume
// their generated JSON payloads, never the test helper modules themselves.
// Dragon Slayer uses the 512px WebP. Keep the exact PNG and prompt/hash record in Git.
const dragonSlayerAuthoringOnly=file=>/^assets\/ui\/player-card\/dragon-slayer-20261020\/(?:dragon-slayer-v1\.png|prompts\.json|manifest\.json)$/.test(file);
export const isProductionFile=file=>!dragonSlayerAuthoringOnly(file)&&!file.startsWith('tests/helpers/')&&!zeroAuthoringOnly(file)&&!rankPotionAuthoringOnly(file)&&!operationAuditOnly.has(file)&&!nodeBuildCommand(file)&&!bathoryAuthoringOnly(file)&&!rankedAuthoringOnly(file)&&!equipmentSetAuthoringOnly(file)&&!leonelAuthoringOnly(file)&&! /^(?:tests|preview)\/.*(?:\.test\.[cm]?js|\.browser\.mjs)$/.test(file)&&! /^scripts\/qa-[^/]+\.[cm]?js$/.test(file)&&!file.startsWith('scripts/ops/')&&!file.startsWith('packaging/windows-client/')&&!file.startsWith('docs/qa/')&&!file.startsWith('preview/mercenary-jokro-iaido-20261017-v1/assets/frames/')&&!martialAuthoringOnly.has(file)&&!isolatedQaFixtures.has(file);
export async function prepareProductionAssets({root=process.cwd(),files,tempRoot=tmpdir(),dependencies}={}){
 files||=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const selected=files.filter(isProductionFile),assetCount=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 if(assetCount>20000)throw Error('Pages asset count exceeds the verified 20,000-file limit: '+assetCount);
 const directory=await mkdtemp(path.join(tempRoot,'cnine-release-')),prefix=path.resolve(root)+path.sep;
 for(const file of selected){const source=path.resolve(root,file),target=path.resolve(directory,file);if(!source.startsWith(prefix)||!target.startsWith(directory+path.sep))throw Error('Invalid release path');await mkdir(path.dirname(target),{recursive:true});try{await link(source,target);}catch{await copyFile(source,target);}}
 await buildClientManifest({root:directory,files:selected,writeTo:path.join(directory,'client/windows/manifest.json')});
 dependencies||=path.dirname(path.dirname(createRequire(import.meta.url).resolve('pg/package.json')));
 await symlink(dependencies,path.join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
 return {directory,assetCount,excluded:files.length-selected.length,async dispose(){
  const actual=await realpath(directory),parent=await realpath(tempRoot);
  if(path.dirname(actual)!==parent||!path.basename(actual).startsWith('cnine-release-'))throw Error('Refusing cleanup outside the release staging directory');
  await rm(actual,{recursive:true,force:true});
 }};
}

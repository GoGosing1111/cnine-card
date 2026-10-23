import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,link,copyFile,symlink,realpath,rm,readFile,lstat,open} from 'node:fs/promises';
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
const zeroManifest=readReleaseJson(zeroRoot+'manifest.json');
const zeroRuntimeFiles=new Set(['index.html','battle.html','preview.css','preview.bundle.js','manifest.json','motion.mjs','array-motion-v4.mjs','live-approval-20261020.json','appearance-approval-20261020.json','prompt-zero-blade-wings-v1.json','zero-blade-wings-review-v1.json','assets/thumbs/idle-01.png',zeroManifest.sourceArt,zeroManifest.weapon.url,zeroManifest.appearance.url,zeroManifest.summonedWeapons.url,...Object.values(zeroManifest.motion).map(s=>s.url),...Object.values(zeroManifest.effects).map(s=>s.url),...Object.values(zeroManifest.backdropVariants).flatMap(s=>[s.url,s.effect?.url].filter(Boolean))].map(p=>zeroRoot+p));
const zeroAuthoringOnly=file=>file.startsWith(zeroRoot)&&!file.startsWith(zeroRoot+'source/')&&!zeroRuntimeFiles.has(file);
// Rank potions load only three WebPs. Keep exact PNG originals, prompts and
// provenance/implementation notes in Git without spending Pages asset slots.
const rankPotionAuthoringOnly=file=>['docs/rank-exp-potions-20261020.md','docs/rank-exp-potion-distribution-20261020.md'].includes(file)||/^assets\/items\/rank-exp-potions-20261020\/(?:.*-source\.png|prompts\.json|manifest\.json)$/.test(file);
// Concurrent releases added these audit receipts after their runtime deploys.
// They have no browser/preview imports; preserve them in Git with the QA records.
// Land's scheduler ships in its Worker bundle, not as a Pages browser asset.
const operationAuditOnly=new Set(['docs/equipment-power-20261020.md','docs/equipment-power-double-20261020.md','docs/equipment-power-double-notice-20261020.txt','docs/support-package-prediction-20261020.md','docs/support-package-20261020.md','docs/cooperative-energy-entry-20261020-release.json','docs/support-package-20261020-catalog.json','docs/support-package-20261020-release.json','docs/pingdu-owner-energy-pass-20261020.md','docs/pingdu-owner-energy-pass-20261020-release.json','workers/clan-draft/src/land-daily.js']);
// Energy implementation notes and deployment receipts have no browser imports.
// Preserve them in Git; ship the shared policy modules within the Pages limit.
for(const file of ['docs/content-energy-20261020.md','docs/content-energy-20261020-release.json','docs/content-energy-clock-fix-20261020.md','docs/content-energy-clock-fix-20261020-release.json','docs/legion-hunt-daily-energy-20261021.md'])operationAuditOnly.add(file);
// Faction implementation/QA notes are repository records, not game resources.
for(const file of ['docs/organization-faction-20261015.md','docs/organization-faction-ui-20261019.md'])operationAuditOnly.add(file);
// Helpers are Node-only database/simulation fixtures. Browser previews consume
// their generated JSON payloads, never the test helper modules themselves.
// Dragon Slayer uses the 512px WebP. Keep the exact PNG and prompt/hash record in Git.
const dragonSlayerAuthoringOnly=file=>/^assets\/ui\/player-card\/dragon-slayer-20261020\/(?:dragon-slayer-v1\.png|prompts\.json|manifest\.json)$/.test(file);
// Diim's incident notes and anonymous regression input have no browser imports.
// Preserve them in Git; the live client uses the shared combat modules.
const diimGrowthQaOnly=new Set(['docs/mercenary-halloween-diim-level11-review-20261020.md','docs/mercenary-diim-growth-duo-20261020.md','tests/fixtures/mercenary-diim-growth-20261020.json']);
const primeRoot='preview/prime-requiem-blood-skills-20261021-v1/';
const primeManifest=readReleaseJson(primeRoot+'manifest.json');
const primeRuntimeFiles=new Set(['index.html','preview.css','battle-skin.css','battle-preview.bundle.js','manifest.json','live-approval-20261021.json','prompts-idle-v7.json','prompts-showcase-v3.json','prime-requiem-idle-v7.webm','prime-requiem-showcase-v3.webm','prime-requiem-five-skills.webm',primeManifest.sourceArt.path,primeManifest.approvedOriginal.path,primeManifest.battleSprite.path,...Object.values(primeManifest.sheets).map(s=>s.path)].map(p=>primeRoot+p));
const primeAuthoringOnly=file=>file.startsWith(primeRoot)&&!file.startsWith(primeRoot+'source/')&&!primeRuntimeFiles.has(file)&&!/^assets\/(?:icon-[^/]+\.png|ui-blood-forged-frame\.png|blood-sanctum\.png)$/.test(file.slice(primeRoot.length));
// Manual grant receipts have no browser imports. Keep their source history in
// Git and reserve the limited Pages asset slots for live artwork and runtimes.
const grantAuditOnly=file=>/^docs\/[^/]+-grant-\d{8}\.(?:md|json)$/.test(file);
// Organization UI authoring originals and operations notes stay in Git; only the WebP is runtime.
const organizationAuthoringOnly=file=>/^assets\/ui\/organization\/hunts-20261023\/(?:.*-source\.png|prompts\.json|manifest\.json)$/.test(file)||/^assets\/ui\/organization\/command-20261021\/(?:seoul-source\.png|prompt\.json|manifest\.json)$/.test(file)||/^docs\/organization-[^/]+\.md$/.test(file);
// Seal Battle consumes six WebPs and the two browser previews plus their fixture.
// Exact PNGs, prompts, hashes and QA stay in Git; no browser imports those files.
const sealPreviewRoot='preview/seal-battle-rework-20261021/';
// Six Node-only art/renderer regression runners have no browser imports.
// Preserve them in Git and use their Pages slots for the three new orb sprites
// and their matching PNG fallbacks; never remove the legacy artwork itself.
export const sealOrbQaOnly=new Set(['project-v-v3-target-reselection-v1','project-v-v3-session-reset-v1','project-v-v3-public-preview-v1','project-v-v3-production-routing-v1','project-v-superstar-sd-assets-v1','project-v-prestige-sd-assets-v1'].map(name=>'tests/'+name+'.mjs'));
// The Tower preview loads app.bundle.js. Keep its unbundled authoring source and
// implementation notes in Git; the linked limit-push design document still ships.
const towerAuthoringOnly=new Set(['docs/cow-tower-live-on-2092-20260913.md','docs/infinite-tower-v3-economy-draft-20260911.md','docs/pve-combat-only-2094-20260913.md','preview/infinite-tower-v3-v1/README.md','preview/infinite-tower-v3-v1/source/app.mjs']);
// The four legacy Node regression runners and bundled dragon source remain in
// Git/builds. Browsers load the bundles and four dragon assets, never these files.
const sealAuthoringOnly=file=>['docs/seal-battle-rework-20261021.md','assets/ui/seal-battle/ritual-20261021/manifest.json','preview/project-v-v3/source/battle/SealDragonPlayback.js','tests/seal-v3-crystal-orb-v1778.mjs','tests/project-v-v3-live-payload-v1.mjs','tests/project-v-tier-battle-art-adapter-v1.mjs','tests/project-v-zenith-sd-assets-v1.mjs'].includes(file)||(file.startsWith(sealPreviewRoot)&&!['index.html','admin.html','fixture.js'].includes(file.slice(sealPreviewRoot.length)));
// These eight Node-only regression runners have no browser consumers. Preserve
// them in Git/npm checks; the disguise feature uses their Pages asset slots.
export const cityDisguiseQaOnly=new Set(['admin-scrapyard-ticket-grant-v1697','avatar-v1863','burning-command-v1871','coin-prediction-history-v1813','draw-receipt-retention-v1723','equipment-vehicle-100-draw-v1724','faker-flat-power-v1720','live-operations-v1868'].map(name=>'tests/'+name+'.mjs'));
// Tower replacement art uses sixteen slots. These Node-only regression runners
// have no game/preview imports; retain them in Git and keep every legacy sprite.
export const towerMonsterQaOnly=new Set(["project-v-approved-mercenary-cards-v1","project-v-v3-effect-layer-v1","project-v-v3-combat-fx-v1","project-v-v3-battlefields-v1","project-v-monster-krieg-escanor-v1","project-v-mercenary-system-v1","project-v-v3-entry-return-v1","battle-v2-speed-time-limit","battle-action-lock-retry-v1","deck-rules-api-contract-v1","followup-haste-retaliation-guard-v1724","feature-lazy-load-v1728","fast-entry-v1703","high-grade-static-frame-v1885","scrapyard-pve-unique-monsters-v1698","auction-hunt-responsive-v1592"].map(name=>'tests/'+name+'.mjs'));
// Prime's archived entry investigation stays in Git; its Pages slot holds the new live FX.
// Sig Hunter ships three WebPs and its UI/policy modules. Exact generated PNGs,
// prompts and hash records stay in Git. Six Node-only tests have no browser imports.
export const sigHunterQaOnly=new Set(['black-miracle-probability-notice-v1','clan-v3-v1820','clan-war-review-v1','idle-dungeon-daily-cap-v1732','mobile-pve-ranked-energy-v1870','navigation-contract-v1'].map(name=>'tests/'+name+'.mjs'));
// Pumpkin pets ship their exact approved PNGs. Keep their approval metadata and
// these two Node-only loopback QA runners in Git without using Pages asset slots.
const pumpkinPetAuthoringOnly=new Set(['tests/qa-core-reward-v2-live.mjs','tests/serve-core-rewards-qa.mjs','assets/ui/pets/pumpkin-duo-20261022/approval-20261022.json']);
// Bloodmoon codex ships exact approved originals, corrected idle sprites and
// display derivatives. Keep its local review/authoring files and these Node-only
// test runners in Git, outside the bounded Pages artifact.
export const bloodmoonNodeQaOnly=new Set(["tests/navigation-deck-ui-v1880.mjs","tests/owner-user-grant-admin-log-visibility-v1806.mjs","tests/playdk-daily-quest-v1804.mjs","tests/playdk-secondary-verification-v1780.mjs","tests/postgres-route-smoke.mjs","tests/pve-nightmare-progression-v1696.mjs","tests/pve-nightmare-v1692.mjs","tests/pve-support-power-boss-ultimate-v1726.mjs","tests/pvp-survivor-equipment-v1777.mjs","tests/pwa-performance-v1727.mjs","tests/qa-master-star-mine.mjs","tests/qa-seal-master-star-20260925.mjs","tests/qa-supporter-blue-beast-titles-20261003.mjs","tests/ranked-deck-renewal-v1905.mjs","tests/restricted-admin-permissions-v1734.mjs","tests/scrapyard-daily-counter-v1882.mjs","tests/scrapyard-independent-drops-v1722.mjs","tests/scrapyard-public-v1720.mjs","tests/scrapyard-responsive-entry-v1699.mjs","tests/serve-chicken-event-v1.mjs","tests/serve-core-raid-abandon-qa.mjs","tests/serve-golden-axe-v1.mjs","tests/serve-icon-fusion-qa.mjs","tests/serve-mercenary-fusion-qa.mjs","tests/storage-retention-v1739.mjs","tests/superstar-grade-v1851.mjs","tests/territory-100-attack-inventory-reward-v1916.mjs","tests/territory-attack-dedup-v1823.mjs","tests/territory-coin-sync-v1995.mjs","tests/territory-command-table-repair-v1823.mjs"]);
// Browser scenes load built bundles and art. These audited Node-only build/QA
// commands stay in Git and local previews; excluding them preserves the asset cap.
export const previewNodeAuthoringOnly=new Set(JSON.parse(readFileSync(new URL('./preview-node-authoring-only-20261023.json',import.meta.url),'utf8')));
// Pumpkin choice UI loads three WebPs. Exact sources, prompts and hashes stay in Git.
const pumpkinChoiceAuthoringOnly=file=>file==='docs/pumpkin-pet-choice-20261023.md'||(file.startsWith('assets/items/pumpkin-pet-choice-20261023/')&&!['ticket.webp','panel.webp','button.webp'].includes(file.split('/').at(-1)));
// Trophy UI loads three WebPs. Exact PNG originals, prompts and hash records
// remain in Git; only this new authoring directory is excluded from Pages.
const trophyAuthoringOnly=file=>/^assets\/ui\/player-card\/milestones-20261023\/(?:[^/]+\.png|prompts\.json|manifest\.json)$/.test(file);
// Three historical Node filesystem validators have no browser consumers.
// Retain the exact scripts in Git; their slots hold the three trophy WebPs.
export const trophyNodeQaOnly=new Set(['scripts/validate-v1676.mjs','scripts/validate-v1677.mjs','scripts/validate-v1680.mjs']);
export const isProductionFile=file=>!trophyNodeQaOnly.has(file)&&!trophyAuthoringOnly(file)&&!pumpkinChoiceAuthoringOnly(file)&&file!=='scripts/preview-node-authoring-only-20261023.json'&&!previewNodeAuthoringOnly.has(file)&&!file.startsWith('preview/mercenary-bloodmoon-battle-20261023-v1/')&&!bloodmoonNodeQaOnly.has(file)&&!pumpkinPetAuthoringOnly.has(file)&&!file.startsWith('preview/sig-hunter-box-20261022/')&&!sigHunterQaOnly.has(file)&&file!=='docs/prime-requiem-pve-entry-20261021.md'&&!towerMonsterQaOnly.has(file)&&!cityDisguiseQaOnly.has(file)&&!sealOrbQaOnly.has(file)&&!towerAuthoringOnly.has(file)&&!sealAuthoringOnly(file)&&!organizationAuthoringOnly(file)&&!grantAuditOnly(file)&&!primeAuthoringOnly(file)&&!diimGrowthQaOnly.has(file)&&!dragonSlayerAuthoringOnly(file)&&!file.startsWith('tests/helpers/')&&!zeroAuthoringOnly(file)&&!rankPotionAuthoringOnly(file)&&!operationAuditOnly.has(file)&&!nodeBuildCommand(file)&&!bathoryAuthoringOnly(file)&&!rankedAuthoringOnly(file)&&!equipmentSetAuthoringOnly(file)&&!leonelAuthoringOnly(file)&&! /^(?:tests|preview)\/.*(?:\.test\.[cm]?js|\.browser\.mjs)$/.test(file)&&! /^scripts\/qa-[^/]+\.[cm]?js$/.test(file)&&!file.startsWith('scripts/ops/')&&!file.startsWith('packaging/windows-client/')&&!file.startsWith('docs/qa/')&&!file.startsWith('preview/mercenary-jokro-iaido-20261017-v1/assets/frames/')&&!martialAuthoringOnly.has(file)&&!isolatedQaFixtures.has(file);
// A sparse checkout deliberately omits tracked files. Only unchanged, regular
// skip-worktree entries may fall back to HEAD; ordinary missing files and staged
// changes must still fail instead of silently deploying an older version.
function sparseReleaseIndex(root){
 const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:40e6}).toString();
 const index=new Map(git(['ls-files','-v','-s','-z']).split('\0').filter(Boolean).map(row=>{
  const match=row.match(/^([A-Za-z?]) (\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/);
  if(!match)throw Error('Invalid Git index entry');
  return [match[5],{tag:match[1],mode:match[2],oid:match[3],stage:match[4]}];
 }));
 const head=new Map(git(['ls-tree','-r','-z','HEAD']).split('\0').filter(Boolean).map(row=>{
  const match=row.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/);
  return [match[4],{mode:match[1],type:match[2],oid:match[3]}];
 }));
 const common=git(['rev-parse','--path-format=absolute','--git-common-dir']).trim();
 const primary=path.basename(common)==='.git'?path.dirname(common):null;
 const algorithm=git(['rev-parse','--show-object-format']).trim();
 return {primary,algorithm,entry(file){
  const entry=index.get(file),committed=head.get(file);
  if(!entry||entry.tag.toUpperCase()!=='S'||entry.stage!=='0'||!/^100(?:644|755)$/.test(entry.mode)||committed?.type!=='blob'||entry.oid!==committed.oid||entry.mode!==committed.mode)
   throw Error('Refusing to restore missing release file unless its skip-worktree entry matches HEAD: '+file);
  return entry;
 }};
}
function readReleaseJson(file){
 const root=fileURLToPath(new URL('../',import.meta.url));
 try{return JSON.parse(readFileSync(path.join(root,file),'utf8'));}catch(error){
  if(error.code!=='ENOENT')throw error;
  const entry=sparseReleaseIndex(root).entry(file);
  return JSON.parse(execFileSync('git',['cat-file','blob',entry.oid],{cwd:root,maxBuffer:40e6}).toString());
 }
}
// Keep one Git process for all absent assets rather than launching one process
// per image. Stream bounded chunks directly into staging, never into the sparse
// worktree or .codex storage.
function gitBlobWriter(root){
 const child=spawn('git',['cat-file','--batch'],{cwd:root,stdio:['pipe','pipe','pipe']});
 let errors='',pending=Buffer.alloc(0),closed=false;
 child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4000);});
 const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('git cat-file failed: '+errors)));});
 finished.catch(()=>{});
 const chunks=child.stdout[Symbol.asyncIterator]();
 async function more(){const next=await chunks.next();if(next.done)throw Error('Unexpected end of Git blob stream: '+errors);pending=Buffer.concat([pending,next.value]);}
 async function take(size){while(pending.length<size)await more();const value=pending.subarray(0,size);pending=pending.subarray(size);return value;}
 return {async write(oid,target,mode){
  child.stdin.write(oid+'\n');
  while(!pending.includes(10))await more();
  const end=pending.indexOf(10),header=pending.subarray(0,end).toString();pending=pending.subarray(end+1);
  const match=header.match(/^([0-9a-f]+) blob (\d+)$/);
  if(!match||match[1]!==oid)throw Error('Git did not return the requested release blob: '+header);
  let remaining=Number(match[2]);
  const output=await open(target,'wx',mode==='100755'?0o755:0o644);
  try{while(remaining){const chunk=await take(Math.min(remaining,65536));await output.writeFile(chunk);remaining-=chunk.length;}}finally{await output.close();}
  if((await take(1))[0]!==10)throw Error('Invalid Git blob separator');
 },async close(){if(!closed){closed=true;child.stdin.end();}await finished;},async abort(){if(!closed){closed=true;child.kill();}await finished.catch(()=>{});}};
}
export async function prepareProductionAssets({root=process.cwd(),files,tempRoot=tmpdir(),dependencies}={}){
 files||=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const selected=files.filter(isProductionFile),assetCount=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 if(assetCount>20000)throw Error('Pages asset count exceeds the verified 20,000-file limit: '+assetCount);
 const directory=await mkdtemp(path.join(tempRoot,'cnine-release-')),prefix=path.resolve(root)+path.sep;
 let sparse,blobs;
 const restored={hardlinked:0,gitBlobs:0};
 async function dispose(){
  const actual=await realpath(directory),parent=await realpath(tempRoot);
  if(path.dirname(actual)!==parent||!path.basename(actual).startsWith('cnine-release-'))throw Error('Refusing cleanup outside the release staging directory');
  await rm(actual,{recursive:true,force:true});
 }
 try{
  for(const file of selected){
   const source=path.resolve(root,file),target=path.resolve(directory,file);
   if(!source.startsWith(prefix)||!target.startsWith(directory+path.sep))throw Error('Invalid release path');
   await mkdir(path.dirname(target),{recursive:true});
   let missing=false;
   try{await lstat(source);}catch(error){if(error.code!=='ENOENT')throw error;missing=true;}
   if(!missing){try{await link(source,target);}catch{await copyFile(source,target);}continue;}
   sparse||=sparseReleaseIndex(root);
   const entry=sparse.entry(file),candidate=sparse.primary&&path.resolve(sparse.primary,file);
   let reused=false;
   // A primary checkout can be ahead, behind or dirty. Compare raw Git blob
   // bytes before reuse; a mismatch always reads the exact committed object.
   if(candidate&&candidate!==source){
    try{
     if((await lstat(candidate)).isFile()){
      const bytes=await readFile(candidate),hash=createHash(sparse.algorithm).update('blob '+bytes.length+'\0').update(bytes).digest('hex');
      if(hash===entry.oid){
       try{await link(candidate,target);}catch{await copyFile(candidate,target);}
       // Recheck the staged inode in case the other checkout changed while
       // it was being read/linked. Never ship an unverified sibling asset.
       const staged=await readFile(target);
       if(createHash(sparse.algorithm).update('blob '+staged.length+'\0').update(staged).digest('hex')!==entry.oid)throw Error('Reused release asset changed during staging: '+file);
       reused=true;restored.hardlinked++;
      }
     }
    }catch(error){if(error.code!=='ENOENT')throw error;}
   }
   if(!reused){blobs||=gitBlobWriter(root);await blobs.write(entry.oid,target,entry.mode);restored.gitBlobs++;}
  }
  await blobs?.close();
  await buildClientManifest({root:directory,files:selected,writeTo:path.join(directory,'client/windows/manifest.json')});
  dependencies||=path.dirname(path.dirname(createRequire(import.meta.url).resolve('pg/package.json')));
  await symlink(dependencies,path.join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
  return {directory,assetCount,excluded:files.length-selected.length,restored,dispose};
 }catch(error){await blobs?.abort();await dispose();throw error;}
}

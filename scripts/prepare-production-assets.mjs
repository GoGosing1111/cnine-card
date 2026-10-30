import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,link,copyFile,symlink,realpath,rm,readFile,lstat,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// Node-only build/balance commands have no browser consumers. Preserve them in
// Git while the three new ICON live modules fit the existing Pages file cap.
const iconFourNodeOnly=new Set(['raid/lich-king/build-inline.mjs','tests/dual-cooperative-balance-20261028.mjs','tools/balance-harness-v1903/battle-suit-growth-audit-20261005.mjs','tools/balance-harness-v1903/speed-reform-20260930.mjs']);
import {buildClientManifest} from './build-windows-client-manifest.mjs';
// Local grip-edit originals and prompts stay in Git. Three audited, Node-only
// Solar authoring commands free the slots for the new ready/fire textures.
const generalJokGripNodeOnly=new Set(['extract-approved-blade.mjs','inspect-assets.mjs','pack-assets.mjs'].map(name=>'preview/mercenary-limited-solar-sword-20261009-v1/'+name));
const generalJokGripAuthoringOnly=file=>generalJokGripNodeOnly.has(file)||(file.startsWith('assets/ui/project-v/mercenaries/general-jok-grip-20261025/')&&file!=='assets/ui/project-v/mercenaries/general-jok-grip-20261025/ready.png');
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
// Prime authoring notes and the Superstar contention audit have no browser
// consumers. Preserve both in Git; reserve delivery slots for the new material.
for(const file of ['docs/prime-requiem-blood-skills-20261021.md','docs/superstar-pack-contention-20261006.json'])operationAuditOnly.add(file);
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
// Audited Node-only commands and tests stay in Git and release checks. None is
// imported by the game; excluding them provides slots for codex display images.
export const codexLoadingNodeOnly=new Set(JSON.parse(readFileSync(new URL('./node-command-authoring-only-20261024.json',import.meta.url),'utf8')));
// Exact Node-only authoring commands remain in Git. The approved NamSuDaeng
// textures use their Pages slots; all original images and browser previews stay.
export const namsudaengNodeOnly=new Set(JSON.parse(readFileSync(new URL('./namsudaeng-node-authoring-only-20261024.json',import.meta.url),'utf8')));
// Growth guide uses the WebP and /ui/growth-guide runtime. Preserve its exact
// source/provenance and the replaced tutorial's unused scripts/styles in Git.
// The legacy index and redirect bridge still ship for existing bookmarks.
const growthGuideAuthoringOnly=new Set(['assets/ui/growth-guide-20261024/guide-plate-source.png','assets/ui/growth-guide-20261024/manifest.json','preview/lobby-clarity-v1/tutorial/app.js','preview/lobby-clarity-v1/tutorial/style.css']);
// ICON enhancement source PNGs and prompts stay in Git; WebPs ship to the game.
// Daengsoryong ships the exact approved PNG. Prompts, approval provenance and
// authoring records stay in Git and do not occupy Pages asset slots.
const daengsoryongAuthoringOnly=file=>file.startsWith('preview/pet-daengsoryong-20261024-v1/')||file==='assets/ui/pets/daengsoryong-20261024/approval-20261024.json';
// Pet equipment implementation notes have no browser imports. Preserve the
// document in Git and use its Pages delivery slot for Heukgu's approved PNG.
operationAuditOnly.add('docs/pet-equipment-gugugaga-20261002.md');
// The user's transparent correction replaces delivery of the white-background
// original; retain that exact original in Git as provenance.
operationAuditOnly.add('assets/ui/pets/heukgu-20261025/pet-heukgu-approved.png');
// Keep the previous transparent portrait available to battles already in progress.
// An implementation note remains in Git instead of taking the new portrait's Pages slot.
operationAuditOnly.add('docs/pet-live-magnet-20261006.md');
// Title art provenance stays in Git. The game reads the finished WebPs only;
// these two authoring records leave room for the new chat-squad plaque on Pages.
operationAuditOnly.add('assets/ui/titles/administration-command-prompt-v2.json');
operationAuditOnly.add('assets/ui/titles/administration-command-v2.json');
// CLI-only PostgreSQL loading/verification commands stay in Git. Browsers never
// import these Python files; their two Pages slots hold the faction standings UI.
const postgresCommandOnly=new Set(['scripts/postgres-load.py','scripts/postgres-verify.py']);
// Raid implementation/audit Markdown and exact Blackwing authoring PNGs stay in Git.
// The live game uses the four packed atlases, idle WebP and dedicated UI WebPs.
export const raidAuditOnly=new Set(["docs/core-raid-abandon-defeat-20260922.md", "docs/core-raid-choice-rewards-20260925.md", "docs/core-raid-coin-cap-20260923.md", "docs/core-raid-entry-balance-20260924.md", "docs/core-raid-mechanics-mobile-v2085.md", "docs/core-raid-mobile-entry-recovery-20261015.md", "docs/core-raid-random-two-v2086.md", "docs/core-raid-reward-v2-release-20260925.md", "docs/core-raid-weekly-return-v2112-20260914.md", "docs/lich-raid-beginner-guide-20261001.md", "docs/lich-raid-cooperative-20261002.md", "docs/lich-raid-feedback-20261003.md", "docs/lich-raid-inline-entry-20260929.md", "docs/lich-raid-live-test-20260928.md", "docs/lich-raid-loadout-timing-20261001.md", "docs/lich-raid-lobby-redesign-20261001.md", "docs/madara-raid-fullscreen-20261013.md", "docs/madara-raid-live-20261011.md", "docs/madara-raid-lobby-presentation-20261011.md", "docs/madara-raid-preparation-20261011.md", "docs/madara-raid-role-decisions-20261011.md", "docs/raid-mystic-clear-bonus-v2067.md", "docs/raid-population-balance-20260922.md", "docs/raid-reward-client-state-20261011.md", "docs/raid-weekly-reset-tickets-20261017.md", "docs/verified-lich-tickets-raid-weekly-reset-20261008.md", "docs/weekly-raid-boss-overhaul-v2140.md", "docs/world-raid-combat-renewal-20261008.md", "docs/world-raid-original-ip-display-20261017.md"]);
// Internal integration/effect/release standards remain in Git and local QA.
// Their four delivery slots now carry the battlefield module and three props.
const blackwingFieldAuthoringOnly=new Set(["docs/core-protocol-raid-v3-integration-standard.md","docs/project-v-skill-effects-standard.md","docs/scoped-release-policy-20260923.md","docs/project-v-motion-effects-production-standard-20260927.md"]);
const blackwingAuthoringOnly=file=>blackwingFieldAuthoringOnly.has(file)||file.startsWith('assets/raids/blackwing-20261024/originals/')||file==='assets/raids/blackwing-20261024/prompts.json';
// Exact local Node authoring commands remain in Git; their delivery slots hold Razak's approved assets.
export const razakNodeOnly=new Set(JSON.parse(readFileSync(new URL('./razak-node-authoring-only-20261024.json',import.meta.url),'utf8')));
// Keep exact authoring sources in Git; the released Omega uses packed atlases.
export const awakenedOmegaNodeOnly=new Set(JSON.parse(readFileSync(new URL('./awakened-omega-node-authoring-only-20261024.json',import.meta.url),'utf8')));
const awakenedOmegaAuthoringOnly=file=>awakenedOmegaNodeOnly.has(file)||file==='scripts/awakened-omega-node-authoring-only-20261024.json'||file.startsWith('assets/ui/project-v/mercenaries/awakened-omega-20261024/originals/')||['assets/ui/project-v/mercenaries/awakened-omega-20261024/approval-20261024.json','assets/ui/project-v/mercenaries/awakened-omega-20261024/manifest.json','preview/project-v-v3/source/battle/AwakenedOmegaCombatPlayback.js'].includes(file)||file.startsWith('preview/project-v-v3/source/battle/awakened-omega/');
// The mercenary reveal consumes four WebPs; retain source PNGs and prompts in Git.
const mercenaryAtelierAuthoringOnly=file=>file.startsWith('assets/ui/workshop/mercenary-atelier-20261025/')&&!/^assets\/ui\/workshop\/mercenary-atelier-20261025\/(?:chamber|relic|action|action-track-v6)\.webp$/.test(file);
// Packed Bloodmoon frames replace delivery slots used by local Node authoring commands.
// Keep originals, commands and provenance in Git; browser consumers use the built bundles.
const bloodmoonDeploymentNodeOnly=new Set(JSON.parse(readFileSync(new URL('./bloodmoon-deployment-node-only-20261025.json',import.meta.url),'utf8')));
// Experience transfer loads the WebP. Keep its exact PNG/provenance and five
// Python-only recording/packaging commands in Git, outside the Pages artifact.
export const experienceTransferAuthoringOnly=new Set(['assets/items/mercenary-experience-transfer-20261025/original.png','assets/items/mercenary-experience-transfer-20261025/manifest.json','scripts/record-mercenary-attachment-points.py','scripts/record-mercenary-skill-audio.py','scripts/render-territory-war-round11-poster.py','scripts/build-jokgak-supply-art-20261018.py','scripts/extract-scrapyard-sd-v1.py']);
// Three offline Python asset generators stay in Git; their generated images/audio
// remain public. This reserves the three slots used by the CNINE board runtime.
const cnineRosterAuthoringOnly=new Set(['scripts/generate-responsive-card-images.py','scripts/generate-responsive-ui-images.py','scripts/generate-project-v-advancement-sfx-v1.py']);
// Scheduled jobs ship inside the Worker bundle; browser assets never import these sources.
// These private runtime sources are delivered in the Worker bundle. Retain Git
// originals without public Pages copies; reserve slots for the four chat UI assets.
const warChatWorkerOnly=new Set(['workers/api-runtime/src/war-chat.js','workers/api-runtime/src/cooperative.js','workers/api-runtime/src/account-sync.js','workers/api-runtime/src/monster-defense.js','workers/api-runtime/src/index.js']);
const stockScheduleWorkerOnly=new Set(['workers/clan-draft/src/mercenary-stock-schedule.js','workers/clan-draft/src/ranked-reopen.js','workers/clan-draft/src/city-rotation.js','workers/clan-draft/src/organization-schedule.js','workers/clan-draft/src/duo-schedule.js']);
// Standalone store packaging and its native test do not belong to the Pages game artifact.
const storePackagingOnly=file=>file.startsWith('packaging/android-direct/')||file.startsWith('packaging/onestore/')||file.startsWith('scripts/onestore/')||file==='tests/android-native/StoreDistributionTest.java';
const blackcrownAuthoringOnly=new Set(JSON.parse(readFileSync(new URL('./blackcrown-authoring-only-20261027.json',import.meta.url),'utf8')));
// Node-only image authoring commands remain in Git; reserve Pages slots for six codex sprites.
export const blackcrownCodexNodeOnly=new Set(JSON.parse(readFileSync(new URL('./blackcrown-codex-node-only-20261027.json',import.meta.url),'utf8')));
// The live Black Crown manifest and authoring modules are embedded in every V3
// bundle; exact Node-only tools stay in Git while their runtime outputs ship.
export const blackcrownLiveNodeOnly=new Set(JSON.parse(readFileSync(new URL('./blackcrown-live-node-only-20261027.json',import.meta.url),'utf8')));
const blackcrownLiveBundledOnly=new Set(['preview/project-v-v3/source/battle/BlackCrownCombatPlayback.js','preview/project-v-v3/source/battle/blackcrown/BlackCrownFX.js','preview/project-v-v3/source/battle/blackcrown/skills.mjs','assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/motion-manifest.json']);
// Revan runtime consumes its shipped PNGs/manifest and the existing V3 bundles.
// Preserve bundled source, local Node commands and historical audit notes in Git,
// without publishing these authoring-only files as individual Pages assets.
export const revanAuthoringOnly=new Set(["preview/project-v-v3/source/battle/RevanCombatPlayback.js","preview/project-v-v3/source/battle/revan/RevanFX.js","preview/project-v-v3/source/battle/revan/AtlasEdgeFilter.js","preview/project-v-v3/source/battle/revan/skill.mjs","assets/ui/project-v/mercenaries/revan-20261027/live-approval.json","tests/revan-live-20261027.qa-server.mjs","scripts/refresh-blackcrown-buttons-cache-20261027.mjs","preview/project-v-advancement-fx-v1/build-advancement-atlases.cjs","CODEX-COMMIT-v1934.md","CODEX-COMMIT-v1935.md","CODEX-COMMIT-v1936.md","CODEX-COMMIT-v2060.md","CODEX-COMMIT-v2062.md","CODEX-COMMIT-v2063.md","CODEX-HANDOFF-FX-AND-AWAKEN.md","CODEX-HANDOFF-v1990.md","CODEX-VERIFY-v1936-DEPLOY.md","CODEX-WORKSPLIT.md"]);
// Cardgu ships thirteen approved textures. Historical test receipts remain in Git;
// embedded Cardgu modules ship inside all eleven runtime bundles.
export const cardguAuditOnly=new Set(JSON.parse(readFileSync(new URL('./cardgu-audit-only-20261027.json',import.meta.url),'utf8')));
const cardguBundledOnly=file=>file==='preview/project-v-v3/source/battle/CardguCombatPlayback.js'||file.startsWith('preview/project-v-v3/source/battle/cardgu/');
// The SSS review stays available locally. Runtime code is embedded in all ten
// bundles; the three build receipts are consumed only by Node QA. Preserve every
// source and report in Git while shipping the five new frame images under 20k.
const sssCutinBundledOnly=new Set(['shared/mercenary-area-cutins-v1.mjs','preview/project-v-v3/source/battle/MercenaryAreaCutinPlayback.js','preview/project-v-v3/source/battle/MercenaryAreaDialogueStyle.js','preview/project-v-v3/grid-build-report.json','preview/battle-suit-skill-chip-v1/build-report.json','preview/sustained-hunt-v2/engine-build.json']);
const sssCutinAuthoringOnly=file=>file.startsWith('preview/sss-area-cutscenes-20261028/')||sssCutinBundledOnly.has(file);
// Preserve Kamishiro runtime sources and historical QA reports in Git; ship their compiled code and approved PNGs.
export const kamishiroAuditOnly=new Set(JSON.parse(readFileSync(new URL('./kamishiro-audit-only-20261028.json',import.meta.url),'utf8')));
const kamishiroBundledOnly=file=>file==='preview/project-v-v3/source/battle/KamishiroCombatPlayback.js'||file.startsWith('preview/project-v-v3/source/battle/kamishiro/');
// One-off operational tools and receipts stay in Git; no browser imports them.
// This lobby is bundled into the existing runtime; retain its authoring preview in Git.
const lobbyObservatoryAuthoringOnly=file=>file.startsWith('preview/lobby-observatory-20261029/')||file==='ui/adventure-lobby/observatory.html'||file==='ui/adventure-lobby/observatory.css';
// Historical equipment/legion implementation notes stay in Git and local QA.
// They have no runtime consumers; these delivery slots carry the 50 new pieces.
const legionEquipmentAuditOnly=new Set(JSON.parse(readFileSync(new URL('./legion-equipment-authoring-only-20261029.json',import.meta.url),'utf8')));
export const heukmuAuditOnly=new Set(JSON.parse(readFileSync(new URL('./heukmu-audit-only-20261029.json',import.meta.url),'utf8')));
const heukmuBundledOnly=file=>file==='tests/heukmu-live-20261029.qa-server.mjs'||file==='preview/project-v-v3/source/battle/HeukmuCombatPlayback.js'||file.startsWith('preview/project-v-v3/source/battle/heukmu/');
// Exact icon images and authoring sources remain in Git; the game receives their byte-identical embedded bundle.
const tacticalUiAuthoringOnly=file=>file.startsWith('output/imagegen/tactical-ui-20261030/')||(file.startsWith('assets/ui/tactical-20261030/')&&file!=='assets/ui/tactical-20261030/panel-flat.webp')||['js/tactical-icons-20261030.js','ui/adventure-lobby/tactical.css','ui/adventure-lobby/component.js','ui/adventure-lobby/operations.js','ui/adventure-lobby/operations.css','scripts/prepare-tactical-ui-20261030.mjs'].includes(file);
export const isProductionFile=file=>!tacticalUiAuthoringOnly(file)&&!heukmuAuditOnly.has(file)&&file!=='scripts/heukmu-audit-only-20261029.json'&&!heukmuBundledOnly(file)&&!legionEquipmentAuditOnly.has(file)&&file!=='scripts/legion-equipment-authoring-only-20261029.json'&&!lobbyObservatoryAuthoringOnly(file)&&!iconFourNodeOnly.has(file)&&!file.startsWith('operations/')&&!kamishiroAuditOnly.has(file)&&file!=='scripts/kamishiro-audit-only-20261028.json'&&!kamishiroBundledOnly(file)&&!sssCutinAuthoringOnly(file)&&!cardguAuditOnly.has(file)&&file!=='scripts/cardgu-audit-only-20261027.json'&&!cardguBundledOnly(file)&&!revanAuthoringOnly.has(file)&&!blackcrownLiveNodeOnly.has(file)&&file!=='scripts/blackcrown-live-node-only-20261027.json'&&!blackcrownLiveBundledOnly.has(file)&&!blackcrownCodexNodeOnly.has(file)&&file!=='scripts/blackcrown-codex-node-only-20261027.json'&&!blackcrownAuthoringOnly.has(file)&&file!=='scripts/blackcrown-authoring-only-20261027.json'&&!storePackagingOnly(file)&&!warChatWorkerOnly.has(file)&&!stockScheduleWorkerOnly.has(file)&&!cnineRosterAuthoringOnly.has(file)&&!generalJokGripAuthoringOnly(file)&&!experienceTransferAuthoringOnly.has(file)&&!bloodmoonDeploymentNodeOnly.has(file)&&file!=='scripts/bloodmoon-deployment-node-only-20261025.json'&&file!=='preview/project-v-v3/source/battle/BloodmoonCombatPlayback.js'&&file!=='assets/ui/project-v/mercenaries/bloodmoon-live-20261025/manifest.json'&&!mercenaryAtelierAuthoringOnly(file)&&!awakenedOmegaAuthoringOnly(file)&&!razakNodeOnly.has(file)&&file!=='scripts/razak-node-authoring-only-20261024.json'&&!raidAuditOnly.has(file)&&!blackwingAuthoringOnly(file)&&!postgresCommandOnly.has(file)&&!daengsoryongAuthoringOnly(file)&&!namsudaengNodeOnly.has(file)&&file!=='scripts/namsudaeng-node-authoring-only-20261024.json'&&!growthGuideAuthoringOnly.has(file)&&!file.startsWith('preview/icon-enhancement-20261024/')&&!codexLoadingNodeOnly.has(file)&&file!=='scripts/node-command-authoring-only-20261024.json'&&!trophyNodeQaOnly.has(file)&&!trophyAuthoringOnly(file)&&!pumpkinChoiceAuthoringOnly(file)&&file!=='scripts/preview-node-authoring-only-20261023.json'&&!previewNodeAuthoringOnly.has(file)&&!file.startsWith('preview/mercenary-bloodmoon-battle-20261023-v1/')&&!bloodmoonNodeQaOnly.has(file)&&!pumpkinPetAuthoringOnly.has(file)&&!file.startsWith('preview/sig-hunter-box-20261022/')&&!sigHunterQaOnly.has(file)&&file!=='docs/prime-requiem-pve-entry-20261021.md'&&!towerMonsterQaOnly.has(file)&&!cityDisguiseQaOnly.has(file)&&!sealOrbQaOnly.has(file)&&!towerAuthoringOnly.has(file)&&!sealAuthoringOnly(file)&&!organizationAuthoringOnly(file)&&!grantAuditOnly(file)&&!primeAuthoringOnly(file)&&!diimGrowthQaOnly.has(file)&&!dragonSlayerAuthoringOnly(file)&&!file.startsWith('tests/helpers/')&&!zeroAuthoringOnly(file)&&!rankPotionAuthoringOnly(file)&&!operationAuditOnly.has(file)&&!nodeBuildCommand(file)&&!bathoryAuthoringOnly(file)&&!rankedAuthoringOnly(file)&&!equipmentSetAuthoringOnly(file)&&!leonelAuthoringOnly(file)&&! /^(?:tests|preview)\/.*(?:\.test\.[cm]?js|\.browser\.mjs)$/.test(file)&&! /^scripts\/qa-[^/]+\.[cm]?js$/.test(file)&&!file.startsWith('scripts/ops/')&&!file.startsWith('packaging/windows-client/')&&!file.startsWith('docs/qa/')&&!file.startsWith('preview/mercenary-jokro-iaido-20261017-v1/assets/frames/')&&!martialAuthoringOnly.has(file)&&!isolatedQaFixtures.has(file);
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

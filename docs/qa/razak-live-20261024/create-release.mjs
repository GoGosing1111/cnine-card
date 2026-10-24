import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),control='C:/Users/User/.codex/visualizations/2026/10/24/01a16ca0-fb45-78d0-81fa-cf587ec07244/razak-release-control';fs.mkdirSync(control,{recursive:true});
const git=(args,options={})=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40e6,...options}).trim();
const files=[
 'functions/_mercenary_account.js','functions/_mercenary_codex.js','functions/_mercenary_combat.js','functions/_mercenary_level.js','functions/_mercenary_razak.js',
 'index.html','js/app.js','js/battle-v3-live.js','mercenary-codex/app.mjs','mercenary-codex/model.mjs','mercenary-codex/shell.mjs','mercenary-codex/index.html',
 'preview/battle-suit-skill-chip-v1/build-report.json','preview/battle-suit-skill-chip-v1/skill-chip-lab.bundle.js','preview/boss-resources-v2048/lab.bundle.js','preview/cow-room-v3-v1/battle.bundle.js','preview/infinite-tower-v3-v1/battle.bundle.js','preview/project-v-mercenary-system-v1/skills.bundle.js',
 'preview/project-v-v3/grid-build-report.json','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/project-v-v3/source/battle/MercenaryCombatPlayback.js','preview/project-v-v3/source/project-v-pixi-battle.src.js','preview/project-v-v3/source/battle/RazakCombatPlayback.js',
 'preview/scrapyard-v3-v1/battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','preview/sustained-hunt-v2/engine-build.json','preview/v3-wide-grid-v1/app.bundle.js','preview/v3-wide-grid-v1/battle.bundle.js','pve-v3/battle.bundle.js',
 'scripts/build-v3-grid-consumers.mjs','scripts/prepare-production-assets.mjs','scripts/razak-node-authoring-only-20261024.json','shared/mercenary-acquisition-release-v1.mjs','shared/mercenary-limited-deployment-v1.mjs','shared/mercenary-razak-v1.mjs','tests/razak-live-20261024.test.mjs','tests/razak-live-20261024.browser.mjs'
];
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);
for(const dir of ['assets/ui/project-v/mercenaries/razak-20261024','preview/project-v-v3/source/battle/razak','docs/qa/razak-live-20261024'])files.push(...walk(dir));
const base=git(['rev-parse','HEAD']),env={...process.env,GIT_INDEX_FILE:path.join(control,'index')};
git(['read-tree',base],{env});git(['add','--',...files],{env});
const tree=git(['write-tree'],{env}),commit=git(['commit-tree',tree,'-p',base],{input:'feat: publish Razak SSS at 800000 with locked acquisition\n\nPreserve approved art, dual-blade assassination motion at 2x, and the existing battle/codex UI.\n'});
git(['update-ref','refs/heads/codex/razak-sss-20261024',commit,'0'.repeat(40)]);
// Start the managed worktree with only instructions, then select required files
// through sparse checkout before switching to the real release. This avoids an
// eleven-GiB full checkout and never duplicates node_modules.
const agents=git(['rev-parse',commit+':AGENTS.md']);
const smallTree=git(['mktree'],{input:`100644 blob ${agents}\tAGENTS.md\n`});
const bootstrap=git(['commit-tree',smallTree,'-p',commit],{input:'chore: initialize storage-bounded Razak managed checkout\n'});
fs.writeFileSync(control+'/release.json',JSON.stringify({base,commit,bootstrap,files,sourceRoot:root,control},null,2)+'\n');
console.log(JSON.stringify({base,commit,bootstrap,fileCount:files.length,control}));

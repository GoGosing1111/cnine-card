import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('operational receipts stay in Git while live combat files fit the Pages boundary',()=>{
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const operations=files.filter(f=>f.startsWith('operations/'));
 assert(operations.length>=14);
 for(const file of operations)assert.equal(isProductionFile(file),false,file);
 for(const file of ['operations/future-audit/grant.mjs','operations/future-audit/receipt.json'])assert.equal(isProductionFile(file),false,file);
 for(const file of ['docs/project-v35-battle-production-standard.md','docs/v35-jin-jokro-pilot-20261101.md','.agents/skills/cnine-v35-battle-production/SKILL.md','.agents/skills/cnine-v35-battle-production/agents/openai.yaml']){
  assert(files.includes(file),'authoring record remains tracked: '+file);assert.equal(isProductionFile(file),false,file);
 }
 for(const file of ['raid/blackwing/inline.mjs','raid/blackwing/commands.mjs','raid/blackwing/battlefield.mjs','assets/raids/blackwing-20261024/body.webp','assets/raids/blackwing-20261024/field-altar.webp'])assert(isProductionFile(file),file);
 for(const file of ['index.html','js/battle-v3-live.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/coop-defense-v1/defense.bundle.js','pve-v3/battle.bundle.js'])assert(isProductionFile(file),file);
 for(const prefix of ['preview/v35-effects-production-20261102/','preview/v35-v3-upgrade-20261101/','preview/v35-whitecoat-swordsman-20261102/']){
  const sources=files.filter(file=>file.startsWith(prefix));assert(sources.length>0,'Unreleased authoring originals remain tracked: '+prefix);
  for(const file of sources)assert.equal(isProductionFile(file),false,file);
 }
 assert.equal(isProductionFile('tests/fixtures/tower-expansion-20261102.json'),false);
 assert.equal(isProductionFile('js/battle-v3-hud.mjs'),true);
 for(const file of ['preview/project-v-v3/source/battle/TacticalHudLayout.js','scripts/internal/account-rank-growth-v1.mjs']){assert(files.includes(file));assert.equal(isProductionFile(file),false,file);}
 for(const file of ['js/tower-abyss-ui.js','js/tower-v1038.js','shared/companion-loadout-v2.mjs'])assert(isProductionFile(file),file);
 assert.equal(isProductionFile('docs/superstar-pack-contention-20261006.md'),false);assert.equal(isProductionFile('shared/coin-integer-v1.mjs'),true);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,'Pages asset count '+count);
});

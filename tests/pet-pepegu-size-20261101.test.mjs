import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {petBattleDisplaySize,petSupportPosition} from '../preview/project-v-v3/source/battle/PetSupportLayout.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
test('Pepegu matches Heukgu after desktop/mobile and suit-adjacent fitting, with all other pets unchanged',()=>{
 for(const side of ['A','B'])for(const scale of [.3,.55,1])for(const pvp of [false,true]){
  const p=petSupportPosition({points:[{x:140,y:857},{x:356,y:857}],side,pvp,suit:{x:356,y:857,halfWidth:95},width:1080,height:1240,scale,size:Math.max(126,56/scale)});
  const a=petBattleDisplaySize(p.size,'PET-HEUKGU'),b=petBattleDisplaySize(p.size,'PET-PEPEGU');assert.equal(a,b);assert(Math.abs(b/p.size-.92)<1e-12);
  for(const pet of PET_ART_CATALOG.filter(p=>!['PET-HEUKGU','PET-PEPEGU'].includes(p.code)))assert.equal(petBattleDisplaySize(p.size,pet.code),p.size*.8);
 }
});
test('all common battle consumers include Pepegu and the main/ONE store loader contracts match',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const wrapper=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];assert(wrapper.endsWith('-pet-pepegu-20261101-v1'));
 for(const file of ['js/app.js','onestore/js/app.js'])assert.equal(read(file).match(/runtimeVersion:'([^']+)'/)[1],wrapper);
 const paths=['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/scrapyard-v3-v1/battle.bundle.js','preview/cow-room-v3-v1/battle.bundle.js','preview/infinite-tower-v3-v1/battle.bundle.js','pve-v3/battle.bundle.js','preview/v3-wide-grid-v1/battle.bundle.js','preview/boss-resources-v2048/lab.bundle.js','preview/battle-suit-skill-chip-v1/skill-chip-lab.bundle.js','preview/project-v-mercenary-system-v1/skills.bundle.js','preview/coop-defense-v1/defense.bundle.js','preview/sustained-hunt-v2/battle.bundle.js'];
 for(const file of paths)assert(read(file).includes('PET-PEPEGU'),file);
 const engine=read(paths[0]).match(/runtimeVersion:\s*["']([^"']+)["']/)[1];assert.equal(engine,wrapper);
});
test('uploaded image ships and the historical UI note stays preserved in Git within the Pages limit',()=>{
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean),art='assets/ui/pets/pepegu-20261101/pet-pepegu-approved.png',note='docs/pet-equipment-ui-meta-20261002.md';
 assert(files.includes(art));assert(isProductionFile(art));assert(files.includes(note));assert(!isProductionFile(note));
 assert(files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1<=20000);
});

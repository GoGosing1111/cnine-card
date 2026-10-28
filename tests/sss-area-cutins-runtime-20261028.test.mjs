import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {AREA_CUTIN_PROFILES} from '../shared/mercenary-area-cutins-v1.mjs';
import {fileURLToPath} from 'node:url';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
test('every recorded V3 consumer contains the new runtime and matches its source/build receipt',()=>{
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json')),wrapper=read('js/battle-v3-live.js'),version=wrapper.match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 assert(version.endsWith('-sss-area-cutin-once-20261028-v1'));
 for(const s of report.sources.filter(s=>/MercenaryArea|mercenary-area-cutins|JinmuDialogue|BattleSuitSkillChipPlayback/.test(s.file)))assert.equal(hash(read(s.file)),s.sha256,s.file);
 for(const output of report.outputs){const bundle=read(output.file);assert.equal(hash(bundle),output.sha256,output.file);assert(bundle.includes(version));assert(bundle.includes('SSS_AREA_EYE_CUTIN'));assert(bundle.includes('sss-area-dialogue-20261028'));}
 for(const file of ['js/app.js','onestore/js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(read(file).includes(version),file);
 for(const file of ['index.html','onestore/index.html','service-worker.js'])assert(read(file).includes('sss-area-cutin-once-20261028-v1'),file);
});
test('all five newly generated frames have distinct hashes, real alpha and their own runtime theme',async()=>{
 const manifest=JSON.parse(read('docs/qa/sss-area-cutins-20261028/dialogue-generation.json')),css=read('preview/project-v-v3/source/battle/MercenaryAreaDialogueStyle.js');
 assert.equal(manifest.assets.length,5);assert.equal(new Set(manifest.assets.map(a=>a.sha256)).size,5);
 for(const asset of manifest.assets){const file=new URL('../'+asset.destination,import.meta.url),meta=await sharp(fileURLToPath(file)).metadata();assert(meta.hasAlpha);assert.equal(hash(fs.readFileSync(file)),asset.sha256);assert.equal(meta.width,2172);assert.equal(asset.alphaMin,0);assert.equal(asset.alphaMax,255);assert(css.includes(asset.destination));assert.equal(AREA_CUTIN_PROFILES.find(p=>p.code===asset.code).dialogue.theme,'sss-'+asset.slug);}
 assert(!/data-theme='(?:valter|helios|jinmu)'/.test(css));
});

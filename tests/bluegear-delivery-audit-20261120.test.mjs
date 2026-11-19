import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readCommittedAssetSync as bytes} from './helpers/committed-asset-read.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
const text=f=>bytes(f).toString('utf8').replaceAll('\r\n','\n'),hash=b=>createHash('sha256').update(b).digest('hex');
test('all Blue Gear approved portraits and battle sprites exist; current Zero approval remains byte exact',()=>{
 for(const card of BLUE_GEAR_DRAW_POLICY.pool.map(c=>limitedDeploymentSnapshot(c.code)))for(const field of ['sourceArt','battleSprite'])assert(bytes(card[field].replace(/^\//,'')).length>0,card.code+' '+field);
 const approval=JSON.parse(text('docs/qa/zero-awakening-release-20261115/approval.json'));
 for(const a of approval.assets){const data=bytes(a.file);assert.equal(data.length,a.bytes);assert.equal(hash(data),a.sha256,a.file);}
});
test('all current V3 consumers agree with loader versions and built source hashes',()=>{
 const report=JSON.parse(text('preview/project-v-v3/grid-build-report.json')),version=text('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 assert(version.endsWith('astra-lifecycle-20261120-v1'));assert.equal(report.outputs.length,11);
 for(const s of report.sources)assert.equal(hash(text(s.file)),s.sha256,s.file);
 for(const row of report.outputs){const bundle=text(row.file);assert.equal(hash(bundle),row.sha256,row.file);assert(bundle.includes('MS-1096'),row.file);if(!row.standaloneEngine)assert(bundle.includes(version),row.file);}
 assert(text('preview/project-v-v3/source/project-v-pixi-battle.src.js').includes(version));for(const file of ['js/app.js','onestore/js/app.js'])assert(text(file).includes('astra-lifecycle-20261120-v1'),file);
 assert(text('raid/nox/battle.bundle.js').includes('MERCENARY_ASTRA_MECHANICAL_STRIKE'));
});

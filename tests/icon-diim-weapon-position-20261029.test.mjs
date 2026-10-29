import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));
test('the build records the exact owner-relative weapon layout source',()=>{
 const file='preview/project-v-v3/source/battle/IconTechniquePlayback.js';
 const sources=report.sources.filter(row=>row.file===file);
 assert.equal(sources.length,1);assert.equal(sources[0].sha256,hash(read(file)));
});
test('all ten common consumers serve the rebuilt weapon layout bundles',()=>{
 assert.equal(report.outputs.length,10);assert.equal(new Set(report.outputs.map(row=>row.file)).size,10);
 for(const row of report.outputs){assert.equal(row.commonGrid,true,row.file);assert.equal(row.sha256,hash(read(row.file)),row.file);}
 assert.ok(read('preview/project-v-v3/project-v-pixi-battle.bundle.js').includes('icon-diim-front-20261029-v1'));
});

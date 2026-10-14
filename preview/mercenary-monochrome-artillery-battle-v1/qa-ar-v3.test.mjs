import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makePlan,sample,SHOT_INTERVAL,RIFLE_FLIGHT} from './skill.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),m=JSON.parse(await fs.readFile(file('manifest.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(m.version,3);
assert.equal(hash(await fs.readFile(file('assets/locked/approved-rifle.png'))),'57331f625b12d0c1ea258814d19ae425cb160ff158ddfc7f499680f25fcaf0ff');
const crops=[{left:470,top:560,width:140,height:100},{left:200,top:950,width:800,height:400}],digests=[];
for(const f of m.motion.ar.frames){
 assert.equal(f.weapon.uniformScale,.68);
 digests.push(await Promise.all(crops.map(async rect=>hash(await sharp(file(f.file)).extract(rect).raw().toBuffer()))));
 assert.deepEqual(f.head,m.motion.ar.frames[0].head);
 assert.deepEqual(f.footAnchor,m.motion.ar.frames[0].footAnchor);
}
for(const d of digests)assert.deepEqual(d,digests[0],'head and lower body pixels must remain fixed');
assert.equal(new Set(m.motion.ar.frames.map(f=>f.sha256)).size,4,'authored arms are distinct');
assert.ok(Math.max(...m.motion.ar.frames.map(f=>f.muzzle.x))-Math.min(...m.motion.ar.frames.map(f=>f.muzzle.x))<=5);
for(const [mode,count]of [['attack',9],['skill',30],['ultimate',25]]){
 const p=makePlan({mode});assert.equal(p.rifleLaunches.length,count);
 for(let i=1;i<count;i++)assert.ok(Math.abs(p.rifleLaunches[i]-p.rifleLaunches[i-1]-SHOT_INTERVAL)<1e-9);
 for(const at of p.rifleLaunches)assert.equal(sample(p,at+.01).pose.frame,1);
 if(mode!=='ultimate')for(const [i,hit]of p.contacts.entries())assert.ok(Math.abs(hit-p.rifleLaunches[i]-RIFLE_FLIGHT)<1e-9);
 assert.deepEqual(sample(p,p.duration).pose,{key:'ar',frame:0});
 assert.equal(sample(makePlan({mode,cancelAt:.3}),.4).cancelled,true);
}
assert.equal(makePlan({mode:'ultimate'}).contacts.length,5);
assert.equal(m.effects['artillery-v3'].distinctSourceFrames,8);
const edge=JSON.parse(await fs.readFile(file('qa/ar-v3/fx-source-validation.json')));
for(const frames of Object.values(edge.sources))for(const f of frames)assert.equal(f.opaqueEdge,0);
for(const group of ['motion','effects'])for(const spec of Object.values(m[group]).filter(v=>v.previewEnabled!==false)){
 const bytes=await fs.readFile(file(spec.atlas)),meta=await sharp(bytes).metadata();
 assert.equal(hash(bytes),spec.sha256);assert.equal(meta.width,spec.cellSize*spec.columns);assert.equal(meta.height,spec.cellSize*spec.rows);
}
console.log('PASS: AR 9/30 continuous shots, fixed head/feet, rigid rifle, 5 central salvos, active atlas hashes and clean edges');

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ROLES} from '../shared/mercenary-position-config-v1.mjs';
import {projectileTrailGeometry} from '../preview/project-v-v3/source/battle/ProjectileTrail.mjs';
const root=new URL('../preview/mercenary-role-attacks-v2100/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('assets/manifest.json',root),'utf8'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');

test('bullets and arrows stay readable under mobile scaling and reach the same target from both sides',()=>{
 for(const scale of [.18,.35,.8,1,1.5])for(const direction of [-1,1])for(const arrow of [false,true]){
  const from={x:direction>0?120:1100,y:240},to={x:direction>0?1100:120,y:360};
  const flight=projectileTrailGeometry(from,to,.5,{scale,arrow,arcHeight:arrow?50:0});
  assert.ok(flight.width*scale>=3,'readable core on a narrow viewport');
  assert.ok(flight.head.x>=120&&flight.head.x<=1100,'flight remains between actor and target');
  const contact=projectileTrailGeometry(from,to,1,{scale,arrow,arcHeight:arrow?50:0});
  assert.ok(Math.hypot(contact.head.x-to.x,contact.head.y-to.y)<.00001,'same authoritative contact for left/right attacks');
 }
 assert.equal(projectileTrailGeometry({x:0,y:0},{x:0,y:0},.5),null);
 assert.equal(projectileTrailGeometry({x:0,y:0},{x:NaN,y:1},.5),null);
});
test('seven mercenary roles own 112 genuine native frames with preserved original hashes and clean alpha',async()=>{
 assert.deepEqual(manifest.images.map(i=>i.role).sort(),Object.keys(ROLES).sort());assert.equal(manifest.frameCount,112);
 const allHashes=[];
 for(const row of manifest.images){
  const source=await fs.readFile(new URL(row.source,new URL('../',import.meta.url)));assert.equal(digest(source),row.sourceSha256);
  const sourceMeta=await sharp(source).metadata();assert.equal(sourceMeta.hasAlpha,true);assert.ok(sourceMeta.width>=1024);
  const runtime=new URL(`assets/${row.role.toLowerCase()}/atlas.webp`,root),atlas=await fs.readFile(runtime);assert.equal(digest(atlas),row.runtimeSha256);
  const {data,info}=await sharp(atlas).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(row.frames.length,16);assert.equal(row.contactFrame,4);
  for(const f of row.frames){
   const tile=await fs.readFile(new URL('assets/'+f.file,root));assert.equal(digest(tile),f.sha256);allHashes.push(f.rawSha256);
   const left=f.index%4*row.cellSize,top=Math.floor(f.index/4)*row.cellSize;
   for(let y=0;y<row.cellSize;y++)for(let x=0;x<row.cellSize;x++)if(x<2||y<2||x>=row.cellSize-2||y>=row.cellSize-2)assert.ok(data[((top+y)*info.width+left+x)*4+3]<=5,`${row.role} ${f.index} gutter`);
  }
  assert.ok(row.frames.at(-1).alphaTotal<row.frames[4].alphaTotal*.25,`${row.role} actually dissipates`);
 }
 assert.equal(new Set(allHashes).size,112,'no recolored/repeated source frame reused across roles');
});

test('user-approved seven-role assets use the shared live V3 renderer and hash-bound approval',async()=>{
 assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.status,'USER_APPROVED_LIVE_CONNECTION');
 const approval=JSON.parse(await fs.readFile(new URL('assets/user-approval.json',root),'utf8'));
 for(const row of manifest.images){assert.equal(approval.sources[row.role],row.sourceSha256);assert.equal(approval.runtimeAtlases[row.role],row.runtimeSha256);}
 const build=JSON.parse(await fs.readFile(new URL('build-report.json',root),'utf8'));
 assert.equal(build.pixiCopies,1);assert.ok(build.inputs.includes('preview/project-v-v3/source/battle/BattleEngine.js'));
 const live=await fs.readFile(new URL('../preview/project-v-v3/source/battle/MercenaryCombatPlayback.js',import.meta.url),'utf8');
 assert.match(live,/normalAttack\(index,options\)[\s\S]*?playMercenaryRoleAttack\(this,options\)/);
 assert.match(live,/preloadMercenaryRole\(card.role\)/);
 const app=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8'),index=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(app,/project-v-pixi-battle.bundle.js\?[^'\n]+mercenary=2100/);assert.match(index,/js\/app.js\?[^"\n]+mercenary=2100/);
});

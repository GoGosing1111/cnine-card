import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import sharp from 'sharp';
const dir=fileURLToPath(new URL('./',import.meta.url)),repo=path.resolve(dir,'../..'),m=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex').toUpperCase();
test('original approved artwork and the requested Valter SD remain byte-identical',async()=>{
 for(const c of m.characters){assert.equal(await hash(path.join(repo,c.source)),c.sourceHash,c.id);}
 const b=m.characters.find(c=>c.code==='V-996');assert.ok(b?.preserveExisting);assert.equal(b.name,'발테르');assert.equal(b.auraTint,'#ff2437');
 assert.equal(await hash(path.join(repo,b.sprite)),'D2CAB7DDE716CF9A0554AF44A03A448A7BCCD9E402928D87620C72C73879A6CC');
 assert.ok(!m.characters.some(c=>c.code==='V-055'),'Unrelated Berkan must not be substituted for Valter');
 const preserved=JSON.parse(await fs.readFile(path.join(dir,'preservation-report.json'),'utf8'));
 for(const entry of preserved.entries)assert.equal(await hash(path.join(repo,entry.path)),entry.sha256,entry.path);
});
test('all delivered sprites and individual skill frames exist with genuine alpha and recorded hashes',async()=>{
 let count=0;for(const c of m.characters){
  const p=path.join(c.sprite.startsWith('/')?repo:dir,c.sprite),sm=await sharp(p).metadata();assert.equal(sm.hasAlpha,true);assert.equal(await hash(p),c.spriteSha256);
  const{data,info}=await sharp(p).raw().toBuffer({resolveWithObject:true});let clear=0;for(let i=3;i<data.length;i+=info.channels)if(data[i]===0)clear++;assert.ok(clear>sm.width*sm.height*.15,c.id+' alpha');
  if(c.effects){const hashes=new Set();for(const f of c.effects.frames){assert.equal(await hash(path.join(dir,f.url)),f.sha256);hashes.add(f.sha256);count++;}assert.equal(hashes.size,12);}
 }assert.equal(count,60);assert.equal(m.aura.frames.length,8);
});
test('new visual candidates do not assign live limited skills or unlock acquisition and deployment',async()=>{
 assert.equal(m.status,'USER_REVIEW_PENDING');assert.equal(m.liveEnabled,false);assert.equal(m.skillAssignments,'UNASSIGNED_VISUAL_DRAFTS');
 const module=await import('../../shared/mercenary-limited-catalog-v1.mjs');const arrays=Object.values(module).filter(Array.isArray);const cards=arrays.flat().filter(c=>c&&['V-990','V-991','V-992','V-993','V-994'].includes(c.code));
 assert.equal(new Set(cards.map(c=>c.code)).size,5);for(const c of cards){assert.equal(c.battleSprite,null);assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.deepEqual(c.skills,[]);}
});

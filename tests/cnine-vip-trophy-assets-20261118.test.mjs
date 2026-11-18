import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const dir='assets/ui/player-card/cnine-vip-20261118/',read=p=>fs.readFileSync(new URL('../'+p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
test('cohesive C9 revision preserves exact generated original; only small transparent runtime art ships',async()=>{
 const m=JSON.parse(read(dir+'manifest.json')),p=JSON.parse(read(dir+'prompts.json'));assert.equal(m.revision,2);assert.equal(m.logoReference,'preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png');assert.equal(hash(read(m.logoReference)),m.logoSha256);
 assert.equal(hash(read(dir+m.original)),m.originalSha256);assert.equal(hash(read(dir+m.runtime)),m.runtimeSha256);const meta=await sharp(read(dir+m.runtime)).metadata();assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[512,512,true]);assert.equal((await sharp(read(dir+m.runtime)).stats()).isOpaque,false);assert(m.runtimeBytes<100000);
 assert(isProductionFile(dir+m.runtime));for(const f of [m.original,'prompts.json','manifest.json'])assert.equal(isProductionFile(dir+f),false);assert.equal(p.variants[0].status,'REJECTED_BY_USER');assert.match(p.variants[1].prompt,/NO yellow gold/);
});

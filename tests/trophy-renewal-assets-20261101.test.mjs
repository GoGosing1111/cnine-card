import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import sharp from 'sharp';
import {isProductionFile,trophyHistoricalNotesOnly} from '../scripts/prepare-production-assets.mjs';
const dir='assets/ui/player-card/renewal-20261101/',read=p=>readFileSync(new URL('../'+p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
test('four transparent new trophies ship with exact PNG originals preserved; old art stays byte-identical',async()=>{
 const m=JSON.parse(read(dir+'manifest.json'));assert.equal(m.assets.length,4);
 for(const a of m.assets){assert.equal(hash(read(dir+a.original)),a.originalSha256);assert.equal(hash(read(dir+a.runtime)),a.runtimeSha256);assert.equal(isProductionFile(dir+a.original),false);assert.equal(isProductionFile(dir+a.runtime),true);const meta=await sharp(read(dir+a.runtime)).metadata();assert(meta.hasAlpha);assert.equal(meta.width,512);assert.equal(meta.height,512);}
 for(const f of ['challenger-streak-v2052.webp','champions-league-v2109.webp','clan-champion-v2052.webp']){const p='assets/ui/player-card/'+f;assert.equal(hash(read(p)),hash(execFileSync('git',['show','de421e6c4:'+p],{windowsHide:true,maxBuffer:20e6})));assert.equal(isProductionFile(p),true);}
 assert.equal(isProductionFile(dir+'prompts.json'),false);assert.equal(isProductionFile(dir+'manifest.json'),false);
 for(const f of trophyHistoricalNotesOnly)assert.equal(isProductionFile(f),false);
});

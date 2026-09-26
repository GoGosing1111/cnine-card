import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {cards,effectAt,preparation} from './catalog.mjs';
import {sample} from './model.mjs';
const card=slug=>cards.find(c=>c.slug===slug);
test('approved sources are preserved and usable as eight separate 2:3 cards',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('./art-manifest.json',import.meta.url)));
 assert.equal(manifest.entries.length,8);assert.equal(new Set(manifest.entries.map(x=>x.sha256)).size,8);
 for(const entry of manifest.entries){const bytes=fs.readFileSync(new URL('../../'+entry.file,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.readUInt32BE(16)*3,bytes.readUInt32BE(20)*2);}
 assert.equal(preparation.runtimeEnabled,false);assert.equal(preparation.drawEnabled,false);assert.equal(preparation.pricing,null);
});
test('all ten proposed levels grow monotonically without changing frequency budgets',()=>{
 for(const c of cards){let previous=effectAt(c,0);for(let level=1;level<=9;level++){const current=effectAt(c,level);for(const key of Object.keys(current))assert.ok(current[key]>=previous[key]);previous=current;}for(const s of c.stats)assert.equal(effectAt(c,9)[s.key],Math.round(s.base*1.3*10)/10);}
 assert.throws(()=>effectAt(cards[0],10),RangeError);
});
test('intercept conserves damage, and does not consume survival on a nonlethal hit',()=>{
 const result=sample(card('fate-intercept'),9,150000,{targetHp:60000});
 assert.equal(result.kept+result.transferred+result.reduced,150000);assert.equal(result.rows[0][1],1);
 const ordinary=sample(card('fate-intercept'),0,20000,{targetHp:60000});assert.equal(ordinary.active,false);assert.equal(ordinary.transferred,0);assert.equal(ordinary.rows[0][1],40000);
});
test('overheal conversion respects actual overheal and remaining shield budget',()=>{
 const c=card('overheal-forge');assert.equal(sample(c,0,40000).shield,0);
 const capped=sample(c,9,1000000,{existingShield:110000});assert.equal(capped.shield,7000);
 const full=sample(c,9,1000000,{existingShield:117000});assert.equal(full.shield,0);assert.equal(full.consumesUse,false);
});
test('piercing partitions damage; ledger cannot store unbounded boss-shield damage',()=>{
 const pierce=sample(card('causal-sever'),9,100001);assert.equal(pierce.rows[0][1]+pierce.rows[1][1],100001);
 const ledger=sample(card('shield-ledger'),9,1000000000,{attack:100000});assert.equal(ledger.record,200000);assert.equal(ledger.explosion,120000);
});
test('mirror refuses resurrection, season two effects and recursion',()=>{
 const c=card('arcane-mirror');for(const effect of ['PHOENIX_REVIVE','S2_FATE_INTERCEPT','S2_ARCANE_MIRROR','OPENING_ATTACK'])assert.equal(sample(c,9,45000,{effect}).eligible,false);
 assert.equal(sample(c,9,45000,{copied:true}).eligible,false);assert.equal(sample(c,9,45000,{effect:'CHAIN_ECHO'}).rows[0][1],40950);
});

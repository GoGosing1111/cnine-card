import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {readLimitedPackState,saveLimitedPack,createLimitedPackService} from '../functions/_mercenary_limited_pack.js';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
const request=(state,count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:state.packRevision,expectedPolicyRevision:state.revision});
const saveBody=(state,mode)=>({requestId:crypto.randomUUID(),expectedRevision:state.revision,expectedPackRevision:state.packRevision,packSettings:{...structuredClone(state.packSettings),mode},policy:structuredClone(state.policy),reason:'사용자 승인 리미티드팩 운영 검수'});

test('CMS OFF -> ON -> OFF controls real opening, while completed receipts remain replayable',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});let state=await readLimitedPackState(f.env);const service=createLimitedPackService({randomInt:()=>0});
 assert.equal(state.releaseEnabled,true);assert.equal(state.userOpeningEnabled,false);
 await assert.rejects(service.open(f.env,f.user,request(state)),e=>e.code==='MERCENARY_LIMITED_DISABLED');assert.equal(await f.coin(),1000000);
 const before=structuredClone(state),on=saveBody(state,'ON');state=await saveLimitedPack(f.env,f.user,on);assert.equal(state.userOpeningEnabled,true);
 assert.deepEqual(state.policy,before.policy);assert.deepEqual(state.packSettings,{...before.packSettings,mode:'ON'});assert.equal((await saveLimitedPack(f.env,f.user,on)).replayed,true);
 const draw=request(state),receipt=await service.open(f.env,f.user,draw);assert.equal(receipt.status,'COMPLETED');assert.equal(await f.coin(),999900);
 state=await saveLimitedPack(f.env,f.user,saveBody(state,'OFF'));assert.equal(state.userOpeningEnabled,false);
 await assert.rejects(service.open(f.env,f.user,request(state)),e=>e.code==='MERCENARY_LIMITED_DISABLED');assert.equal(await f.coin(),999900);
 assert.equal((await service.receipt(f.env,f.user,draw.requestId)).status,'COMPLETED');assert.equal((await service.open(f.env,f.user,draw)).replayed,true);assert.equal(await f.coin(),999900);
});

test('ON rejects incomplete economics before writes; OFF can preserve an incomplete draft',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});const before=await readLimitedPackState(f.env),body=saveBody(before,'ON');body.packSettings.prices.single=null;
 await assert.rejects(saveLimitedPack(f.env,f.user,body),e=>e.code==='MERCENARY_LIMITED_NOT_READY');assert.equal((await readLimitedPackState(f.env)).packRevision,before.packRevision);assert.equal((await f.p('SELECT COUNT(*) AS n FROM admin_logs').first()).n,0);
 const off=await saveLimitedPack(f.env,f.user,{...body,packSettings:{...body.packSettings,mode:'OFF'}});assert.equal(off.userOpeningEnabled,false);assert.equal(off.packSettings.prices.single,null);
});

for(const [rank,excluded,included]of [['SS','V-990','V-991'],['SSS','V-999','V-996']])test(rank+' zero issue limit never enters weighted draws even with maximum weight',async t=>{
 const f=await limitedFixture(t);f.policy.rankRatesPpm={SS:0,SSS:0,[rank]:1000000};for(const code in f.policy.cardWeights)f.policy.cardWeights[code]=0;f.policy.cardWeights[excluded]=1000000;f.policy.cardWeights[included]=1;f.packSettings.stockLimits[excluded]=0;await f.configure({limit:excluded==='V-990'?0:100});
 const state=await readLimitedPackState(f.env);assert.equal(state.readiness.ready,true);assert.equal(state.stock.find(s=>s.code===excluded).issued,0);
 const receipt=await createLimitedPackService({randomInt:max=>max-1}).open(f.env,f.user,request(state,10));assert(receipt.draws.every(d=>d.mercenaryCode===included));
 assert.equal((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',excluded).first()).issued,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1 WHERE code=?',excluded).first()).n,0);
});

test('Helios limited-pack thumbnail exists, decodes and matches the approved source manifest',async()=>{
 const card=LIMITED_MERCENARIES.find(c=>c.code==='V-999'),file='assets/ui/packs/limited-v1/v-999-640.webp',hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
 assert.equal(hash(card.sourceArt),card.sourceArtSha256);const manifest=JSON.parse(fs.readFileSync('assets/ui/packs/limited-v1/manifest.json')),entry=manifest.files.find(r=>r.path===file);assert.equal(entry.sourceSha256,card.sourceArtSha256);assert.equal(hash(file),entry.sha256);
 const metadata=await sharp(file).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,640);assert.equal(metadata.height,960);
 for(const c of LIMITED_MERCENARIES)assert(fs.statSync('assets/ui/packs/limited-v1/'+c.code.toLowerCase()+'-640.webp').size>0);
});

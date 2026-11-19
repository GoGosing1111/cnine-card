import {readCommittedAssetSync} from './helpers/committed-asset-read.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {eunseolLevelFixture} from './helpers/eunseol-level-fixture-20261026.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {MERCENARY_CRAFTS} from '../shared/mercenary-craft-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {RYUJIN_CODE,RYUJIN_ART} from '../shared/mercenary-ryujin-v1.mjs';
test('all acquisition pools remain closed and catalog lists six ready skills',()=>{
 const rules={cardWeights:{[RYUJIN_CODE]:1000000}},cards=[{code:RYUJIN_CODE,name:'류진',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(RYUJIN_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(RYUJIN_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1e6,[RYUJIN_CODE],rules)[0].percent,0);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,BLOODMOON_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards,MERCENARY_CRAFTS])assert(!pool.some(c=>(c.code||c.mercenaryCode)===RYUJIN_CODE));
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===RYUJIN_CODE);assert.equal(card.name,'류진');assert.equal(card.edition,'LIMITED');assert.equal(card.basePower,4000000);assert.deepEqual(card.skills.map(s=>s.name),['횡베기','이단 연격','혼령 찌르기','검붉은 검압','쌍월 검무','종결']);assert(card.skills.every(s=>s.ready));
});
test('only fixture ownership enables PVE and PVP through the regular loadout path',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===RYUJIN_CODE));
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:[RYUJIN_CODE],revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,RYUJIN_CODE,'2026-10-27','2026-10-27').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[RYUJIN_CODE],revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,4000000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===RYUJIN_CODE).canDeploy);
});
test('Ryujin is present in the regular five-times limited growth catalog',async t=>{
 const f=await eunseolLevelFixture(t);await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',RYUJIN_CODE,'2026-10-27','2026-10-27').run();
 const result=await f.call('state');assert.equal(result.status,200);assert(JSON.stringify(result.body).includes(RYUJIN_CODE));
});
test('approved illustration, body and all shipped resources match the release manifest',()=>{
 const root='assets/ui/project-v/mercenaries/ryujin-20261119/';
 const hash=p=>createHash('sha256').update(readCommittedAssetSync(p)).digest('hex');
 assert.equal(hash(RYUJIN_ART.sourceArt),'8bced96b9b6d38289062d567cf67b0aaee1d167399faef9bcdfbd359327d1dc9');

 const m=JSON.parse(readCommittedAssetSync(root+'manifest.json'));for(const f of m.files)assert.equal(f.canonicalTextSha256?createHash('sha256').update(readCommittedAssetSync(root+f.path).toString('utf8').replaceAll('\r\n','\n')).digest('hex'):hash(root+f.path),f.canonicalTextSha256||f.sha256,f.path);
 assert.equal(m.illustrationApproved,true);assert.equal(m.runtimeVersion,'4.3.13');
});


test('all Ryujin runtime assets ship while bundled source stays outside the Pages file cap',async()=>{
 const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');
 const prefix='assets/ui/project-v/mercenaries/ryujin-20261119/',manifest=JSON.parse(readCommittedAssetSync(prefix+'manifest.json'));
 for(const row of manifest.files)assert.equal(isProductionFile(prefix+row.path),true,row.path);
 for(const path of ['shared/mercenary-ryujin-v1.mjs',...JSON.parse(readCommittedAssetSync('preview/project-v-v3/grid-build-report.json')).outputs.map(row=>row.file)])assert.equal(isProductionFile(path),true,path);
 assert.equal(isProductionFile('preview/project-v-v3/source/battle/RyujinCombatPlayback.js'),false);
 assert.equal(isProductionFile('preview/project-v-v3/source/battle/ryujin/frames.json'),false);
 assert.equal(isProductionFile(prefix+'manifest.json'),false);
});

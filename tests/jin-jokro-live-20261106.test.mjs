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
import {JIN_JOKRO_CODE,JIN_JOKRO_ART} from '../shared/mercenary-jin-jokro-v1.mjs';
test('all acquisition pools remain closed and catalog lists six ready skills',()=>{
 const rules={cardWeights:{[JIN_JOKRO_CODE]:1000000}},cards=[{code:JIN_JOKRO_CODE,name:'진 족로',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(JIN_JOKRO_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(JIN_JOKRO_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1e6,[JIN_JOKRO_CODE],rules)[0].percent,0);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,BLOODMOON_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards,MERCENARY_CRAFTS])assert(!pool.some(c=>(c.code||c.mercenaryCode)===JIN_JOKRO_CODE));
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===JIN_JOKRO_CODE);assert.equal(card.name,'진 족로');assert.equal(card.edition,'LIMITED');assert.equal(card.basePower,3500000);assert.deepEqual(card.skills.map(s=>s.name),['흑뢰발도','적섬연참','섬광관통','흑천일섬','비검오의 · 흑천단절','삼도오의 · 무간참옥']);assert(card.skills.every(s=>s.ready));
});
test('only fixture ownership enables PVE and PVP through the regular loadout path',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===JIN_JOKRO_CODE));
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:[JIN_JOKRO_CODE],revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,JIN_JOKRO_CODE,'2026-10-27','2026-10-27').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[JIN_JOKRO_CODE],revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,3500000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===JIN_JOKRO_CODE).canDeploy);
});
test('Jin Jokro is present in the regular five-times limited growth catalog',async t=>{
 const f=await eunseolLevelFixture(t);await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',JIN_JOKRO_CODE,'2026-10-27','2026-10-27').run();
 const result=await f.call('state');assert.equal(result.status,200);assert(JSON.stringify(result.body).includes(JIN_JOKRO_CODE));
});
test('approved illustration, body and all shipped resources match the release manifest',()=>{
 const root='assets/ui/project-v/mercenaries/jin-jokro-20261106/';
 const hash=p=>createHash('sha256').update(readCommittedAssetSync(p)).digest('hex');
 assert.equal(hash(JIN_JOKRO_ART.sourceArt),JIN_JOKRO_ART.sourceArtSha256);
 assert.equal(hash(JIN_JOKRO_ART.battleSprite),JIN_JOKRO_ART.battleSpriteSha256);
 const m=JSON.parse(readCommittedAssetSync(root+'manifest.json'));for(const f of m.files)assert.equal(f.canonicalTextSha256?createHash('sha256').update(readCommittedAssetSync(root+f.path).toString('utf8').replaceAll('\r\n','\n')).digest('hex'):hash(root+f.path),f.canonicalTextSha256||f.sha256,f.path);
 assert.equal(m.illustrationApproved,true);assert.equal(m.runtimeVersion,'4.3.13');
});

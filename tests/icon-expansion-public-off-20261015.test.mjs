import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ICON_EXPANSION_CARDS,ICON_EXPANSION_RECIPE,ICON_EXPANSION_RELEASE_ENABLED,prepareStrongerIconFighter} from '../shared/icon-expansion-v1.mjs';
import {ICON_FUSION_POLICY,ICON_FUSION_CARDS,ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';
import {defaultIconTechniques,validateIconTechniques,applyPreparedIconTechniqueDefaults} from '../shared/icon-techniques-v1.mjs';
import {iconFusionOverview,runIconFusion} from '../functions/_icon_fusion.js';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';

test('new two recipes keep existing chance, stars and materials while only their price is one trillion',()=>{
 assert.equal(ICON_EXPANSION_RECIPE.coinCost,1000000000000);
 assert.deepEqual({...ICON_EXPANSION_RECIPE,coinCost:ICON_FUSION_POLICY.coinCost},ICON_FUSION_POLICY);
 assert.equal(ICON_FUSION_POLICY.coinCost,500000000000);
 assert.equal(ICON_EXPANSION_RECIPE.successRate,10);assert.equal(ICON_EXPANSION_RECIPE.masterStarCost,5000000);
 assert.equal(ICON_EXPANSION_RELEASE_ENABLED,false);assert.equal(ICON_SUPREMACY.deckLimit,2);
 assert.equal(ICON_LIVE_CARDS.length,9);assert.equal(ICON_FUSION_CARDS.length,8);
 for(const card of ICON_EXPANSION_CARDS){
  assert.equal(card.releaseEnabled,false);assert.equal(card.acquisitionEnabled,false);assert.equal(card.battleEnabled,false);assert.equal(card.cardId,null);
  assert.ok(!ICON_FUSION_CARDS.some(c=>c.code===card.code));
  for(const file of [card.sourceArt,card.sd,card.preview.slice(1)+'index.html'])assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)),file);
 }
});
test('forged upcoming target is rejected before DB access, randomness, receipt or any currency change',async()=>{
 for(const card of ICON_EXPANSION_CARDS)await assert.rejects(runIconFusion({get DB(){throw Error('DB accessed');}},{id:7},{targetCode:card.code,policyVersion:ICON_FUSION_POLICY.version,requestId:crypto.randomUUID()},{randomInt(){throw Error('Randomness consumed');}}),e=>e.status===423&&e.code==='ICON_FUSION_PREPARATION_CLOSED');
});
test('published preparations never close the existing eight-card fusion or mutate wallets',async t=>{
 const f=await iconFusionFixture(t);const before=await f.snapshot(),view=await iconFusionOverview(f.env,f.user);
 assert.equal(view.enabled,true);assert.equal(view.catalog.length,8);assert.equal(view.upcomingCatalog.length,2);
 assert.deepEqual(view.policy,ICON_FUSION_POLICY);assert.deepEqual(await f.snapshot(),before);
 for(const c of view.upcomingCatalog)await assert.rejects(runIconFusion(f.env,f.user,{...f.body(),targetCode:c.code}),e=>e.status===423);
 assert.deepEqual(await f.snapshot(),before);
});
test('two stronger draft presets stay OFF; six unknown cards stay null; saved operator tuning survives',()=>{
 const draft=defaultIconTechniques();assert.deepEqual(validateIconTechniques(draft),draft);
 assert.equal(draft.techniques.filter(t=>t.tuning!==null).length,2);
 assert.ok(draft.techniques.every(t=>t.enabled===false&&t.cardId===null));
 const legacy=structuredClone(draft);legacy.techniques.forEach(t=>t.tuning=null);legacy.techniques[0].notes='preserve';
 const migrated=applyPreparedIconTechniqueDefaults(legacy);assert.equal(legacy.techniques[0].tuning,null);assert.equal(migrated.techniques[0].notes,'preserve');
 migrated.techniques[0].tuning.firstAction=7;assert.equal(applyPreparedIconTechniqueDefaults(migrated).techniques[0].tuning.firstAction,7);
 const partial={...migrated.techniques[0].tuning,cooldownActions:null};migrated.techniques[0].tuning=partial;assert.deepEqual(applyPreparedIconTechniqueDefaults(migrated).techniques[0].tuning,partial);
 const invalid=structuredClone(draft);invalid.enabled=true;assert.throws(()=>validateIconTechniques(invalid));
});
test('stronger prepared stats preserve the reference and HP ratio without inheriting old ICON skills',()=>{
 const source={maxHp:12000,hp:6000,attack:900,defense:120,speed:100,iconRole:{role:'ATTACK'}};
 for(const card of ICON_EXPANSION_CARDS){const fighter=prepareStrongerIconFighter(source,card.code);assert.deepEqual([fighter.maxHp,fighter.hp,fighter.attack,fighter.defense,fighter.speed],[15000,7500,1125,150,125]);assert.equal(fighter.iconRole,null);}
 assert.equal(source.maxHp,12000);assert.equal(source.iconRole.role,'ATTACK');
});

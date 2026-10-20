import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {JOKRO_CODE,JOKRO_ART,JOKRO_COMBAT,JOKRO_AREA_SKILL} from '../shared/mercenary-jokro-v1.mjs';

const catalog=()=>mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61,updated_at:'2026-10-21T00:00:00Z'});

test('the complete public catalog including pack-released Jokro passes the actual browser validator',()=>{
 const data=catalog();
 assert.equal(validateCatalog(data),data);
 assert.equal(data.cards.filter(c=>c.code===JOKRO_CODE).length,1);
 const card=data.cards.find(c=>c.code===JOKRO_CODE);
 assert.equal(card.releaseStatus,'OWNER_PACK_CONTROLLED');
 assert.equal(card.basePower,JOKRO_COMBAT.basePower);
 assert.equal(card.artOnly,false);
 assert.equal(card.deploymentEnabled,true);
 assert.equal(card.packAcquisitionEnabled,true);
 assert.equal(card.acquisitionEnabled,false);
 assert.equal(card.exclusiveGrant,false);
 assert.equal(card.excludedFromLimitedCount,false);
 assert.equal(card.serverLimit,3);
 assert.equal(card.sourceArt,JOKRO_ART.sourceArt);
 assert.equal(card.thumbnailArt,JOKRO_ART.sourceArt);
 assert.equal(card.battleSprite,JOKRO_ART.battleSprite);
 assert.equal(card.skills[0].ready,true);
 assert.deepEqual(card.skills[0].balance,JOKRO_AREA_SKILL.balance);
 for(const field of ['target','effect','trigger','counterplay','bossRule','procRule'])assert.equal(typeof card.skills[0][field],'string',field);
});

test('the codex still rejects incomplete or unauthorized limited release metadata',()=>{
 for(const change of [{acquisitionEnabled:true},{releaseStatus:'EXCLUSIVE_RELEASED'},{deploymentEnabled:false},{packAcquisitionEnabled:false},{serverLimit:4},{basePower:null},{skills:[{...JOKRO_AREA_SKILL}]}]){
  const data=catalog(),card=data.cards.find(c=>c.code===JOKRO_CODE);
  Object.assign(card,change);
  assert.throws(()=>validateCatalog(data),undefined,JSON.stringify(change));
 }
});

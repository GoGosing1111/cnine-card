import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {PET_GROWTH_CAPS,initialPetGrowth,PET_GROWTH_POLICY} from '../shared/pet-growth-live-v2.mjs';
import {additions,hash} from '../scripts/ops/pet-ddung-joeun-live-20261116.mjs';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {COMPANION_REVIEW_CARDS} from '../functions/_companion_preparation.js';
import {readCollectionBonuses,collectionRewardCoin,collectionDropPercent} from '../functions/_collection_bonuses.js';
import {rewardAmountWithBonus} from '../shared/collection-bonuses-v1.mjs';

test('approved natural-face panda Ddung Joeun retains exact source and Bazzi SSS growth with small runtime images',()=>{
 const approval=JSON.parse(fs.readFileSync('docs/qa/pet-ddung-joeun-live-20261116/approval-20261116.json'));
 const art=PET_ART_CATALOG.find(p=>p.code==='PET-DDUNG-JOEUN'),a=approval.assets[0],bytes=fs.readFileSync(art.sourceArt);
 assert.equal(approval.userApproval,"승인하고 배찌 나무늘봉순하고 동급수치로 라이브반영");assert.equal(approval.selectedDraft,'v5-natural-face');
 assert.equal(hash(bytes),a.sha256);assert.equal(art.sha256,a.sha256);assert.equal(bytes[25],6);
 const portraits=JSON.parse(fs.readFileSync('assets/ui/pets/rework-20261114/codex-v3/pets.json'))['PET-DDUNG-JOEUN'];
 assert.equal(portraits.sourceSha256,a.sha256);assert.equal(additions[0].battleSprite,portraits.portrait.slice(1));
 assert(fs.statSync(portraits.portrait.slice(1)).size<80000);assert(fs.statSync(portraits.thumb.slice(1)).size<12000);
 assert.equal(PET_GROWTH_CAPS['PET-DDUNG-JOEUN'],PET_GROWTH_CAPS['PET-BAZZI-BONGSOON']);assert.equal(initialPetGrowth('PET-DDUNG-JOEUN').cap,'SSS');
 assert.deepEqual(PET_GROWTH_POLICY.traitPools['PET-DDUNG-JOEUN'],PET_GROWTH_POLICY.traitPools['PET-BAZZI-BONGSOON']);
});

test('owned Ddung Joeun applies Bazzi speed and rewards in PvE/PvP and rejects unowned loadout',async t=>{
 const f=await petLiveFixture(t),pet=structuredClone(additions[0]),revision=51;
 await f.write('pet_cms_preparation_v1',{revision,audit:[],document:{version:1,visibility:'LIVE',battleEnabled:true,acquisitionEnabled:false,pets:[pet]}});
 const codex=await f.call('pets/v1/codex'),row=codex.body.cards.find(p=>p.code===pet.code);
 assert.equal(codex.status,200);assert(row.configured);assert.equal(row.owned,false);assert.equal(row.growthCap,'SSS');
 const equip=()=>f.call('pets/v1/loadout',{body:{petCode:pet.code,expectedRevision:0,petCmsRevision:revision,requestId:crypto.randomUUID()}});
 assert.equal((await equip()).status,403);
 await f.write('pet_collection_v1:2',{revision:2,pets:{[pet.code]:1}});const equipped=await equip();assert.equal(equipped.status,200,JSON.stringify(equipped.body));
 const snapshot=await loadPetBattleSnapshot(f.env,2);assert.equal(snapshot.definition.battleSprite,pet.battleSprite);
 const cards=COMPANION_REVIEW_CARDS,pve=createPveBattleV2({cards,pet:snapshot,monster:{id:1,battle_power:300000},seed:3}),pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:snapshot,defenderPet:snapshot,seed:3});
 for(const [battle,n] of [[pve,1],[pvp,2]]){
  const events=battle.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');assert.equal(events.length,n);
  for(const e of events){assert.equal(e.hits.length,5);for(const hit of e.hits)assert.equal(hit.after.speed,Math.round(hit.before.speed*1.55));}
 }
 assert.deepEqual((await readCollectionBonuses(f.env,2)).petBonuses,{dropPercent:25,accountXpPercent:55,coinPercent:55});
 assert.equal(await collectionRewardCoin(f.env,2,100,'PVE'),155);assert.equal(await collectionDropPercent(f.env,2,'PVP_DROP'),25);
 assert.equal(rewardAmountWithBonus(100,(await readCollectionBonuses(f.env,2)).totals.accountXpPercent),155);
 await f.write('pet_collection_v1:2',{revision:3,pets:{}});assert.equal(await loadPetBattleSnapshot(f.env,2),null);
 assert.deepEqual((await readCollectionBonuses(f.env,2)).petBonuses,{dropPercent:0,accountXpPercent:0,coinPercent:0});
});

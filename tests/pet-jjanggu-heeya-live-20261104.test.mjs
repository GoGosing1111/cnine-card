import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {additions,hash} from '../scripts/ops/pet-jjanggu-heeya-live-20261104.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {COMPANION_REVIEW_CARDS} from '../functions/_companion_preparation.js';
import {readCollectionBonuses,collectionRewardCoin,collectionDropPercent} from '../functions/_collection_bonuses.js';
import {rewardAmountWithBonus} from '../shared/collection-bonuses-v1.mjs';

test('approved compact V2 ships byte-identically, retains standard pet dimensions and fits Pages',()=>{
 const approval=JSON.parse(fs.readFileSync('docs/qa/pet-jjanggu-heeya-live-20261104/approval-20261104.json'));
 const art=PET_ART_CATALOG.find(p=>p.code==='PET-JJANGGU-HEEYA'),a=approval.assets[0],b=fs.readFileSync(art.sourceArt);
 assert.equal(approval.userApproval,'반영해 흑구랑 동일 옵션으로해');assert.equal(approval.status,'SOURCE_ART_APPROVED');
 assert.equal(art.sourceArt,a.approvedAsset);assert.equal(hash(b),a.sha256);assert.equal(art.sha256,a.sha256);assert.equal(b.length,897122);
 assert.equal(b.readUInt32BE(16),1254);assert.equal(b.readUInt32BE(20),1254);assert.equal(b[25],6);
 assert.equal(a.visibleBoundsAlpha32.height,1170);assert.equal(approval.display.battleFactor,.8);
 assert(isProductionFile(art.sourceArt));assert(!isProductionFile('docs/pet-codex-grants-20261009.md'));
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6,windowsHide:true}).toString().split('\0').filter(Boolean);
 assert(tracked.includes(art.sourceArt),'Stage art before release checks');
 assert(tracked.includes('docs/pet-codex-grants-20261009.md'),'Keep historical documentation');
 const count=tracked.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,'Pages files '+count);
});

test('owned Jjanggu Heeya uses Heukgu attack and reward options in actual PVE/PVP; unowned users get no effects',async t=>{
 const f=await petLiveFixture(t),pet=structuredClone(additions[0]);
 const doc={version:1,visibility:'LIVE',battleEnabled:true,acquisitionEnabled:false,pets:[pet]};
 await f.write('pet_cms_preparation_v1',{revision:45,audit:[],document:doc});
 const codex=await f.call('pets/v1/codex');assert.equal(codex.status,200);
 const row=codex.body.cards.find(p=>p.code===pet.code);assert(row.configured);assert.equal(row.owned,false);
 assert.equal((await f.call('pets/v1/loadout',{body:{petCode:pet.code,expectedRevision:0,petCmsRevision:45,requestId:crypto.randomUUID()}})).status,403);
 await f.write('pet_collection_v1:2',{revision:2,pets:{[pet.code]:1}});
 const equipped=await f.call('pets/v1/loadout',{body:{petCode:pet.code,expectedRevision:0,petCmsRevision:45,requestId:crypto.randomUUID()}});
 assert.equal(equipped.status,200,JSON.stringify(equipped.body));
 const snapshot=await loadPetBattleSnapshot(f.env,2);assert.equal(snapshot.definition.battleSprite,pet.sourceArt);
 const cards=COMPANION_REVIEW_CARDS;
 const pve=createPveBattleV2({cards,pet:snapshot,monster:{id:1,battle_power:300000},seed:3});
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:snapshot,defenderPet:snapshot,seed:3});
 for(const [battle,n]of [[pve,1],[pvp,2]]){
  const events=battle.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');assert.equal(events.length,n);
  for(const event of events){assert.equal(event.hits.length,5);for(const hit of event.hits)assert.equal(hit.after.attack,Math.round(hit.before.attack*1.5));}
  assert.equal(battle.teams.A.cards.length,5);assert(!battle.result.final.A.some(c=>c.id.includes('PET:')));
 }
 assert.deepEqual((await readCollectionBonuses(f.env,2)).petBonuses,{dropPercent:20,accountXpPercent:50,coinPercent:50});
 assert.equal(await collectionRewardCoin(f.env,2,100,'PVE'),150);assert.equal(await collectionDropPercent(f.env,2,'PVP_DROP'),20);
 assert.equal(rewardAmountWithBonus(100,(await readCollectionBonuses(f.env,2)).totals.accountXpPercent),150);
 await f.write('pet_collection_v1:2',{revision:3,pets:{}});
 assert.equal(await loadPetBattleSnapshot(f.env,2),null);assert.deepEqual((await readCollectionBonuses(f.env,2)).petBonuses,{dropPercent:0,accountXpPercent:0,coinPercent:0});
});

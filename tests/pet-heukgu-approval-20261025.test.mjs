import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {emptyPetCmsDocument,emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {petEquipmentFixture} from './helpers/pet-equipment-fixture.mjs';
import {ensurePetPotentialItem} from '../functions/_pet_potential.js';
import {additions} from '../scripts/ops/pet-heukgu-registration-20261025.mjs';

test('Heukgu catalog uses the exact approved image and retains approval boundaries',async()=>{
 const approval=JSON.parse(await readFile(new URL('../docs/qa/pet-heukgu-live-20261025/approval-20261025.json',import.meta.url),'utf8'));
 assert.equal(approval.userApproval,'흑구로해서 펫 라이브 반영해');
 assert.equal(approval.status,'SOURCE_ART_APPROVED');
 assert.equal(approval.assets.length,1);
 const record=approval.assets[0],matches=PET_ART_CATALOG.filter(p=>p.code==='PET-HEUKGU');
 assert.equal(matches.length,1);
 const art=matches[0];
 assert.equal(art.name,'흑구');assert.equal(art.sourceArt,record.approvedAsset);
 assert.equal(art.artStatus,'SOURCE_ART_APPROVED');assert.equal(art.sha256,record.sha256);
 assert.equal(record.sha256,'940303a2e2c454ceb8aa5de3a9483b4811ddc316ce5b24c662f4779a20394f2e');
 const bytes=await readFile(new URL('../'+art.sourceArt,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 assert.equal(bytes.length,record.bytes);assert.equal(bytes.readUInt32BE(16),1206);assert.equal(bytes.readUInt32BE(20),1305);assert.equal(bytes[25],2);
 for(const key of ['animationApproved','acquisitionApproved','battleBuffPolicyApproved','accountGrantsPerformed'])assert.equal(approval.scope[key],false);
});

test('registered Heukgu appears in codex and OWNER management without grants or economic changes',async t=>{
 const f=await petEquipmentFixture();t.after(()=>f.close());
 const old=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON');
 const existing={...emptyPetDraft(old.code),name:old.name,sourceArt:old.sourceArt,battleSprite:old.sourceArt,enabled:true,liveEnabled:true,buffs:[{type:'SPEED_PERCENT',percent:17}]};
 const state={revision:42,audit:[],document:{...emptyPetCmsDocument(),pets:[existing,...structuredClone(additions)]}};
 const records={pet_cms_preparation_v1:state,'pet_collection_v1:2':{revision:4,pets:{[old.code]:2}},'pet_loadout_v1:2':{revision:3,petCode:old.code,audit:[]},pet_opening_settings_v1:{revision:8,enabled:true,essencePerOpen:3,maxBatch:5,blankWeight:2,pool:[{code:old.code,weight:7}]},pet_potential_settings_v1:{version:1,revision:6,enabled:false,successPpm:null}};
 for(const [key,value] of Object.entries(records))await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 await ensurePetPotentialItem(f.env);
 const snapshot=async()=>({meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,inventory:(await f.pg.query('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code')).rows});
 const before=await snapshot(),codex=await f.call(null,{path:'pets/v1/codex',owner:2});
 assert.equal(codex.status,200);
 const row=codex.body.cards.find(p=>p.code==='PET-HEUKGU');
 assert.equal(row.name,'흑구');assert.equal(row.configured,true);assert.equal(row.owned,false);assert.equal(row.quantity,0);assert.deepEqual(row.ready,[]);
 const cms=await f.cmsCall();assert.equal(cms.status,200);
 assert.deepEqual(cms.body.document,state.document);
 assert.deepEqual(cms.body.document.pets.find(p=>p.code==='PET-HEUKGU'),additions[0]);
 const denied=await f.call({petCode:'PET-HEUKGU',expectedRevision:3,petCmsRevision:42,requestId:crypto.randomUUID()},{path:'pets/v1/loadout',owner:2});
 assert.equal(denied.status,403);assert.equal(denied.body.code,'PET_NOT_OWNED');
 assert.deepEqual(await snapshot(),before);
});

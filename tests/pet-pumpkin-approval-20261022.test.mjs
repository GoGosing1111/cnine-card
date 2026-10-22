import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {PET_CMS_KEY,emptyPetCmsDocument,emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {ensurePetPotentialItem} from '../functions/_pet_potential.js';
import {petEquipmentFixture} from './helpers/pet-equipment-fixture.mjs';

const expected=[
  {code:'PET-PUMPKIN-BONGSOON',name:'호박봉순',sha256:'e2a44d08be09b436676acd22173a1ed8b246f54352659c97aaf1f5dfac556fee'},
  {code:'PET-PUMPKIN-JOEUN',name:'호박조은',sha256:'e5eb156285075caf10847c85264cf2a965bd6c7f31cef809446491468adb450f'},
];

test('pumpkin names resolve to the exact user-reattached approved PNGs without granting other approval',async()=>{
  const approval=JSON.parse(await readFile(new URL('../assets/ui/pets/pumpkin-duo-20261022/approval-20261022.json',import.meta.url),'utf8'));
  assert.equal(approval.userApproval,'호박봉순 호박조은 펫 승인 반영해');
  assert.equal(approval.status,'SOURCE_ART_APPROVED');
  assert.equal(approval.assets.length,expected.length);
  for(const wanted of expected){
    const matches=PET_ART_CATALOG.filter(p=>p.code===wanted.code);
    assert.equal(matches.length,1,'one unique catalog code per approved pet');
    const art=matches[0],record=approval.assets.find(p=>p.code===wanted.code);
    assert.equal(art.name,wanted.name);assert.equal(record.name,wanted.name);
    assert.equal(art.artStatus,'SOURCE_ART_APPROVED');
    assert.equal(art.sourceArt,record.approvedAsset);
    assert.equal(art.sha256,wanted.sha256);assert.equal(record.sha256,wanted.sha256);
    const bytes=await readFile(new URL('../'+art.sourceArt,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),wanted.sha256);
    assert.equal(bytes.length,record.bytes);
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);
    assert.equal(bytes[25],6,'approved PNG retains RGBA');
  }
  for(const key of ['animationApproved','acquisitionApproved','battleBuffPolicyApproved','accountGrantsPerformed'])assert.equal(approval.scope[key],false);
  assert.equal(approval.runtime.cmsConfigured,false);
  assert.equal(approval.runtime.acquisitionPoolChanged,false);
  assert.deepEqual(approval.runtime.buffs,[]);
});

test('approved pumpkin art is visible in codex and CMS candidates while reads and unowned equip preserve existing state',async t=>{
  const f=await petEquipmentFixture();t.after(()=>f.close());
  const old=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON');
  const oldDefinition={...emptyPetDraft(old.code),name:old.name,sourceArt:old.sourceArt,battleSprite:old.sourceArt,enabled:true,liveEnabled:true,buffs:[{type:'SPEED_PERCENT',percent:17}],rewardBonuses:{dropPercent:3,accountXpPercent:5,coinPercent:7}};
  const cms={revision:12,updatedAt:'2026-10-21T00:00:00Z',updatedBy:1,audit:[],document:{...emptyPetCmsDocument(),pets:[oldDefinition]}};
  const records={
    [PET_CMS_KEY]:cms,
    'pet_collection_v1:2':{revision:4,pets:{[old.code]:2}},
    'pet_loadout_v1:2':{revision:3,petCode:old.code,audit:[]},
    'pet_opening_settings_v1':{revision:8,enabled:true,essencePerOpen:3,maxBatch:5,blankWeight:2,pool:[{code:old.code,weight:7}]},
    'pet_potential_settings_v1':{version:1,revision:6,enabled:false,successPpm:null},
  };
  for(const [key,value]of Object.entries(records))await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
  await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,$1,31,4)',['PET_SEAL_ORB']);
  // Existing runtime lazily ensures the potion definition, not user ownership.
  // Prepare that unrelated catalog item before checking read-only state.
  await ensurePetPotentialItem(f.env);
  const snapshot=async()=>({meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,inventory:(await f.pg.query('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code')).rows,items:(await f.pg.query('SELECT * FROM inventory_items ORDER BY code')).rows});
  const before=await snapshot();
  const codex=await f.call(null,{path:'pets/v1/codex',owner:2});
  assert.equal(codex.status,200);assert.match(codex.headers.get('cache-control'),/private, no-store/);
  assert.equal(codex.body.cards.length,PET_ART_CATALOG.length);
  assert.deepEqual(codex.body.loadout,{petCode:old.code,revision:3});
  for(const wanted of expected){
    const row=codex.body.cards.find(p=>p.code===wanted.code);
    assert.equal(row.name,wanted.name);assert.equal(row.artStatus,'SOURCE_ART_APPROVED');
    assert.equal(row.configured,false);assert.equal(row.owned,false);assert.equal(row.quantity,0);
    assert.deepEqual(row.buffs,[]);assert.deepEqual(row.ready,[]);assert.deepEqual(row.modes,[]);assert.equal(row.target,null);
  }
  const owner=await f.cmsCall();assert.equal(owner.status,200);
  assert.deepEqual(owner.body.document,cms.document);
  for(const wanted of expected){
    assert(owner.body.artCatalog.some(p=>p.code===wanted.code&&p.name===wanted.name));
    assert(!owner.body.document.pets.some(p=>p.code===wanted.code));
  }
  const owned=await f.call(null,{path:'pets/v1/state',owner:2});
  assert.deepEqual(owned.body.cards.map(p=>p.code),[old.code]);
  assert.deepEqual(owned.body.cards[0].buffs,oldDefinition.buffs);
  assert.deepEqual(owned.body.cards[0].rewardBonuses,oldDefinition.rewardBonuses);
  for(const wanted of expected){
    const denied=await f.call({petCode:wanted.code,expectedRevision:3,petCmsRevision:12,requestId:crypto.randomUUID()},{path:'pets/v1/loadout',owner:2});
    assert.equal(denied.status,403);assert.equal(denied.body.code,'PET_NOT_OWNED');
  }
  assert.deepEqual(await snapshot(),before,'CMS, opening pool, owned pets, loadout, inventory and potential settings stay unchanged');
});

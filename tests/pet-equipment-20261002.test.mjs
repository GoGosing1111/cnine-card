import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {PET_EQUIPMENT_RULES,petReviewKey,validatePetEquipmentSave,validateOwnedPetSelection} from '../shared/pet-equipment-v1.mjs';
import {emptyPetCmsDocument,emptyPetDraft,validatePetCmsDocument,PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {petEquipmentFixture} from './helpers/pet-equipment-fixture.mjs';
const save=(petCode='PET-BONGSOON',expectedRevision=0,requestId='pet-equip-request-001',petCmsRevision=0)=>({petCode,expectedRevision,requestId,petCmsRevision});
const cmsSave=(pets,expectedRevision=0)=>({document:{...emptyPetCmsDocument(),pets},expectedRevision,requestId:`pet-art-cms-save-${expectedRevision+1}`});

test('four recovered originals are unchanged; source and serving copies share their hashes',async()=>{
  const originals=PET_ART_CATALOG.filter(row=>row.artStatus==='USER_REVIEW_PENDING');
  assert.deepEqual(originals.map(row=>row.name),['봉순','조은','희야','디임']);
  const manifest=JSON.parse(await readFile(new URL('../preview/pets-gugugaga-four-v1/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.runtimeConnected,false);
  for(const row of originals){
    const filename=row.sourceArt.split('/').at(-1);
    for(const resource of [row.sourceArt,`preview/pets-gugugaga-four-v1/assets/${filename}`]){const bytes=await readFile(new URL('../'+resource,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);assert.equal(bytes[25],6);}
    assert.equal(row.artStatus,'USER_REVIEW_PENDING');
  }
});
test('Tokki Gusudaeng catalog uses the exact user-approved art and keeps runtime preparation locked',async()=>{
  const art=PET_ART_CATALOG.find(row=>row.code==='PET-GUSUDAENG');
  const approval=JSON.parse(await readFile(new URL('../assets/ui/pets/gusudaeng/pet-tokki-gusudaeng-approval-20261002.json',import.meta.url),'utf8'));
  assert.equal(art.name,'토끼 구수댕');assert.equal(art.artStatus,'SOURCE_ART_APPROVED');assert.equal(art.sourceArt,approval.approvedAsset);
  const bytes=await readFile(new URL('../'+art.sourceArt,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),approval.sha256.toLowerCase());assert.equal(art.sha256,approval.sha256.toLowerCase());
  assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);assert.equal(bytes[25],6);
  const fx=await petEquipmentFixture();try{
    const draft={...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt};
    const result=await fx.cmsCall(cmsSave([draft]));assert.equal(result.status,200);
    const saved=(await fx.cmsCall()).body;assert.deepEqual(saved.document.pets,[draft]);
    assert.equal(saved.document.battleEnabled,false);assert.equal(saved.document.acquisitionEnabled,false);assert.equal(draft.enabled,false);assert.equal(draft.battleSprite,'');assert.equal(draft.buffs[0].percent,null);
    const state=(await fx.call()).body;assert.equal(state.cards.find(row=>row.code===art.code).configured,true);
    assert.equal((await fx.call(null,{path:'pets/v1/state'})).body.available,false);
  }finally{await fx.close();}
});
test('one separate support slot rejects unknown/unowned codes and client-forged fields',()=>{
  assert.deepEqual(PET_EQUIPMENT_RULES,{slots:1,regularCardSlot:false,mercenarySlot:false,combatActor:false,phase:'BATTLE_START',frequency:'ONCE_PER_BATTLE'});
  validateOwnedPetSelection(null);validateOwnedPetSelection('PET-BONGSOON',{catalog:PET_ART_CATALOG,ownedCodes:['PET-BONGSOON']});
  assert.throws(()=>validateOwnedPetSelection('PET-DIIM',{catalog:PET_ART_CATALOG,ownedCodes:['PET-BONGSOON']}));assert.throws(()=>validateOwnedPetSelection('PET-UNKNOWN',{catalog:PET_ART_CATALOG,ownedCodes:['PET-UNKNOWN']}));
  for(const change of [{petCode:['PET-BONGSOON','PET-DIIM']},{petCode:'V-021'},{expectedRevision:-1},{requestId:'short'},{owned:true},{buffs:[]}])assert.throws(()=>validatePetEquipmentSave({...save(),...change}));
  assert.throws(()=>petReviewKey('../1'));
});
test('CMS adds separate source art without altering legacy documents or replay hashes',async()=>{
  const legacy=emptyPetDraft('PET-LEGACY');delete legacy.sourceArt;
  const normalized=validatePetCmsDocument({...emptyPetCmsDocument(),pets:[legacy]});assert.equal(Object.hasOwn(normalized.pets[0],'sourceArt'),false);
  const pet={...emptyPetDraft('PET-BONGSOON'),name:'봉순',sourceArt:PET_ART_CATALOG[0].sourceArt};
  assert.equal(validatePetCmsDocument({...emptyPetCmsDocument(),pets:[pet]}).pets[0].sourceArt,pet.sourceArt);
  for(const sourceArt of ['https://x.test/x.png','assets/../x.png','assets/pet.svg'])assert.throws(()=>validatePetCmsDocument({...emptyPetCmsDocument(),pets:[{...pet,sourceArt}]}));
  const fx=await petEquipmentFixture();try{const body=cmsSave([legacy]);assert.equal((await fx.cmsCall(body)).status,200);assert.equal((await fx.cmsCall(body)).body.replayed,true);assert.equal((await fx.cmsCall()).body.artCatalog.length,PET_ART_CATALOG.length);}finally{await fx.close();}
});
test('OWNER access and GET do not seed inventory or config; live paths remain closed',async()=>{
  const fx=await petEquipmentFixture();try{
    for(const role of ['ADMIN','USER'])assert.equal((await fx.call(null,{role})).status,403);
    assert.equal((await fx.call(null,{denied:true})).status,401);assert.equal(fx.count(),0);
    const before=await fx.call();assert.equal(before.body.loadout.petCode,null);assert.equal(before.body.loadout.revision,0);assert.equal(before.body.cards.length,PET_ART_CATALOG.length);assert.equal(before.body.reviewOnly,true);assert.ok(before.body.cards.every(row=>row.reviewOwned&&!row.configured&&row.buffs.length===0));assert.match(before.headers.get('cache-control'),/no-store/);
    assert.equal((await fx.pg.query('SELECT * FROM app_meta')).rows.length,0);
    const count=fx.count();const live=await fx.call(null,{path:'pets/v1/state'});assert.equal(live.body.available,false);assert.deepEqual(live.body.cards,[]);assert.equal((await fx.call(save(),{path:'pets/v1/loadout'})).status,423);assert.equal(fx.count(),count);
    assert.equal((await fx.call(null,{path:'pets/v1/state',denied:true})).status,401);assert.equal((await fx.call(null,{method:'PATCH'})).status,405);
  }finally{await fx.close();}
});
test('equipping, swapping and clearing persist separately per OWNER; exact retries commit once',async()=>{
  const fx=await petEquipmentFixture();try{
    const first=save();assert.equal((await fx.call(first)).body.loadout.petCode,'PET-BONGSOON');const replay=await fx.call(first);assert.equal(replay.body.replayed,true);assert.equal(replay.body.loadout.revision,1);
    assert.equal((await fx.call({...first,petCode:'PET-DIIM'})).body.code,'PET_REQUEST_ID_CONFLICT');assert.equal((await fx.call(save('PET-DIIM'))).status,409);
    assert.equal((await fx.call(save('PET-DIIM',1,'pet-equip-request-002'))).body.loadout.petCode,'PET-DIIM');assert.equal((await fx.call(save(null,2,'pet-equip-request-003'))).body.loadout.petCode,null);
    assert.equal((await fx.call(null,{owner:2})).body.loadout.revision,0);assert.equal((await fx.call(first,{owner:2})).body.loadout.revision,1);
    const rows=(await fx.pg.query('SELECT key,value FROM app_meta ORDER BY key')).rows;assert.deepEqual(rows.map(row=>row.key),[petReviewKey(1),petReviewKey(2)]);assert.equal(JSON.parse(rows[0].value).audit.length,3);
  }finally{await fx.close();}
});
test('concurrent equip requests use CAS; failed and ambiguous retries retain one receipt',async()=>{
  const fx=await petEquipmentFixture();try{
    const attempts=await Promise.all([fx.call(save()),fx.call(save('PET-DIIM',0,'pet-equip-request-002'))]);assert.deepEqual(attempts.map(row=>row.status).sort(),[200,409]);
    fx.fail(true);const next=save(null,1,'pet-equip-request-003');assert.equal((await fx.call(next)).status,503);fx.fail(false);assert.equal((await fx.call(next)).status,200);assert.equal((await fx.call(next)).body.replayed,true);
    const record=JSON.parse((await fx.pg.query('SELECT value FROM app_meta WHERE key=$1',[petReviewKey(1)])).rows[0].value);assert.equal(record.revision,2);assert.equal(record.audit.length,2);
  }finally{await fx.close();}
});
test('equipment reads CMS buffs and prevents stale config saves; removing custom pet leaves empty UI',async()=>{
  const fx=await petEquipmentFixture();try{
    const pet={...emptyPetDraft('PET-CUSTOM'),name:'추가 펫',sourceArt:PET_ART_CATALOG[0].sourceArt,buffs:[{type:'DEFENSE_PERCENT',percent:7}],target:'MERCENARIES',modes:['PVE']};
    assert.equal((await fx.cmsCall(cmsSave([pet]))).status,200);const state=(await fx.call()).body;assert.equal(state.cards.length,PET_ART_CATALOG.length+1);assert.deepEqual(state.cards.at(-1).buffs,pet.buffs);assert.equal(state.petCmsRevision,1);
    assert.equal((await fx.call(save('PET-CUSTOM'))).status,409);assert.equal((await fx.call(save('PET-UNKNOWN',0,'pet-equip-request-002',1))).status,403);
    assert.equal((await fx.call(save('PET-CUSTOM',0,'pet-equip-request-003',1))).status,200);await fx.cmsCall(cmsSave([],1));const current=(await fx.call()).body;assert.equal(current.orphaned,true);assert.equal(current.loadout.petCode,null);
    assert.equal((await fx.call(save(null,1,'pet-equip-request-004',2))).status,200);assert.equal((await fx.pg.query('SELECT key FROM app_meta')).rows.length,2);
  }finally{await fx.close();}
});
test('mutations reject cross-origin, oversized and non-JSON input; corrupt records fail closed',async()=>{
  const fx=await petEquipmentFixture();try{
    assert.equal((await fx.call(save(),{headers:{origin:'https://other.test'}})).status,403);assert.equal((await fx.call(save(),{headers:{'content-type':'text/plain'}})).status,415);
    assert.equal((await fx.call('{')).status,400);assert.equal((await fx.call(' '.repeat(9000))).status,413);assert.equal((await fx.pg.query('SELECT * FROM app_meta')).rows.length,0);
    await fx.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[petReviewKey(1),'{']);assert.equal((await fx.call()).status,503);
    await fx.pg.query('DELETE FROM app_meta');const record={revision:1,audit:[],document:{...emptyPetCmsDocument(),battleEnabled:true}};await fx.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[PET_CMS_KEY,JSON.stringify(record)]);assert.equal((await fx.call()).status,503);
  }finally{await fx.close();}
});

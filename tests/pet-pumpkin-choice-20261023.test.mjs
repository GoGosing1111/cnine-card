import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pumpkinChoiceFixture} from './helpers/pet-pumpkin-choice-fixture.mjs';
import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES as PETS} from '../shared/pet-pumpkin-choice-v1.mjs';
import {petPumpkinChoiceOptions,usePetPumpkinChoice,petPumpkinChoiceReceipt} from '../functions/_pet_pumpkin_choice.js';
import {emptyPetCmsDocument,emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {registerPetPumpkinChoiceItem,OPERATION_KEY} from '../scripts/ops/pet-pumpkin-choice-20261023.mjs';
import {petCatalogFrom} from '../functions/_pet_equipment.js';

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(`${dialect}: pumpkin ticket gives exactly one chosen pet and preserves all other settings`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),before=await f.snapshot();
    const options=await petPumpkinChoiceOptions(f.env,f.user);
    assert.deepEqual(options.choices.map(pet=>pet.code),PETS.map(pet=>pet.code));assert.equal(options.quantity,3);assert.equal(options.enabled,true);
    // Buffs, battle sprite and live usage are deliberately not configured.
    const first=await usePetPumpkinChoice(f.env,f.user,f.body(0));
    assert.equal(first.reward.code,PETS[0].code);assert.equal(first.reward.quantity,1);assert.equal(first.reward.ownedAfter,1);assert.equal(first.consumed,1);
    const second=await usePetPumpkinChoice(f.env,f.user,f.body(1));
    assert.equal(second.reward.code,PETS[1].code);assert.equal(second.reward.ownedAfter,1);
    const third=await usePetPumpkinChoice(f.env,f.user,f.body(0));assert.equal(third.reward.ownedAfter,2);
    const after=await f.snapshot();assert.deepEqual(after.pets,{revision:4,pets:{'PET-BONGSOON':2,[PETS[0].code]:2,[PETS[1].code]:1}});
    const cms=await f.record('pet_cms_preparation_v1'),ownedCatalog=petCatalogFrom(cms.document,{review:false,collection:after.pets.pets});
    for(const pet of PETS){const row=ownedCatalog.find(owned=>owned.code===pet.code);assert.equal(row.owned,true);assert.equal(row.quantity,after.pets.pets[pet.code]);assert.deepEqual(row.ready,[]);assert.equal(row.sourceArt,pet.sourceArt);}
    assert.equal(await f.tickets(),0);assert.equal(after.inventory.find(item=>item.item_code===ITEM.code).unseen_quantity,0);
    assert.deepEqual(after.inventory.find(item=>item.item_code==='PET_ESSENCE'),before.inventory.find(item=>item.item_code==='PET_ESSENCE'));
    assert.equal(after.coin,before.coin);assert.deepEqual(after.preserved,before.preserved);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=?',ITEM.code).first()).n),3);
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,f.body()),{code:'PET_CHOICE_BALANCE'});
  });
  test(`${dialect}: fixed target, strict request, registered pet and safe counts are required`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),before=await f.snapshot();
    for(const targetCode of ['PET-BONGSOON','PET-JOEUN','PET-PUMPKIN-UNKNOWN',''])await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,{...f.body(),targetCode}),{code:'PET_CHOICE_TARGET'});
    for(const extra of [{quantity:2},{count:2},{userId:3},{petCode:PETS[1].code}])await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,{...f.body(),...extra}),{code:'PET_CHOICE_INPUT'});
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,{...f.body(),version:0}),{code:'PET_CHOICE_VERSION'});
    assert.deepEqual(await f.snapshot(),before);
    const cms=await f.record('pet_cms_preparation_v1');cms.document.pets=cms.document.pets.filter(pet=>pet.code!==PETS[0].code);await f.write('pet_cms_preparation_v1',cms);
    assert.equal((await petPumpkinChoiceOptions(f.env,f.user)).choices.length,1);
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,f.body()),{code:'PET_CHOICE_UNAVAILABLE'});
    await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ITEM.code).run();
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,f.body(1)),{code:'PET_CHOICE_CLOSED'});
    await f.p('UPDATE inventory_items SET is_active=1 WHERE code=?',ITEM.code).run();
    await f.write('pet_collection_v1:2',{revision:1,pets:{[PETS[1].code]:Number.MAX_SAFE_INTEGER}});
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,f.body(1)),{code:'PET_CHOICE_LIMIT'});
    assert.equal(await f.tickets(),3);
  });
  test(`${dialect}: same request replays once, different targets and other users cannot reuse it`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),body=f.body(),first=await usePetPumpkinChoice(f.env,f.user,body);
    const cms=await f.record('pet_cms_preparation_v1');cms.revision++;cms.document.pets=[];await f.write('pet_cms_preparation_v1',cms);
    await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ITEM.code).run();
    const replay=await usePetPumpkinChoice(f.env,f.user,body);assert.equal(replay.replayed,true);assert.deepEqual(replay.reward,first.reward);
    assert.equal((await petPumpkinChoiceReceipt(f.env,f.user,body.requestId)).replayed,true);assert.equal(await f.tickets(),2);
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,{...body,targetCode:PETS[1].code}),{code:'JOINT_REQUEST_CONFLICT'});
    await assert.rejects(()=>usePetPumpkinChoice(f.env,{id:3},body),{code:'JOINT_REQUEST_CONFLICT'});
    await assert.rejects(()=>petPumpkinChoiceReceipt(f.env,{id:3},body.requestId),{code:'JOINT_NOT_FOUND'});
  });
  test(`${dialect}: a first pet creates only that account's collection`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),before=await f.snapshot();
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(3,?,1,1)',ITEM.code).run();
    assert.equal(await f.record('pet_collection_v1:3'),null);
    const result=await usePetPumpkinChoice(f.env,{id:3},f.body(1));assert.equal(result.reward.ownedAfter,1);
    assert.deepEqual(await f.record('pet_collection_v1:3'),{revision:1,pets:{[PETS[1].code]:1}});
    assert.deepEqual(await f.snapshot(),before);assert.equal(await f.record('pet_loadout_v1:3'),null);
  });
  test(`${dialect}: failed grant rolls back inventory and collection; pending request resumes safely`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),body=f.body(),before=await f.snapshot();
    f.fail('INSERT INTO app_meta');await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,body));f.fail('');
    assert.deepEqual(await f.snapshot(),before);assert.equal((await petPumpkinChoiceReceipt(f.env,f.user,body.requestId)).status,'PENDING');
    assert.equal((await petPumpkinChoiceOptions(f.env,f.user)).pendingRequestId,body.requestId);
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,f.body(1)),{code:'PET_CHOICE_PENDING'});
    await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ITEM.code).run();
    await assert.rejects(()=>usePetPumpkinChoice(f.env,f.user,body));assert.equal(await f.tickets(),3);
    await f.p('UPDATE inventory_items SET is_active=1 WHERE code=?',ITEM.code).run();
    assert.equal((await usePetPumpkinChoice(f.env,f.user,body)).reward.quantity,1);assert.equal(await f.tickets(),2);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n),1);
  });
  test(`${dialect}: authenticated routes serialize competing uses and recover a lost commit response`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres,tickets:2}),body=f.body();
    assert.equal((await f.call('options',{userId:null})).status,401);
    assert.equal((await f.call('use',{body,origin:'https://evil.test'})).status,403);
    assert.equal((await f.call('use',{body:{...body,quantity:2}})).status,400);
    assert.equal((await f.call('use',{method:'GET'})).status,405);
    assert.equal((await f.call('options',{method:'POST',body:{}})).status,405);
    const same=await Promise.all([f.call('use',{body}),f.call('use',{body})]);assert(same.every(result=>result.status===200));assert.equal(same.filter(result=>result.body.replayed).length,1);assert.equal(await f.tickets(),1);
    const batch=f.DB.batch.bind(f.DB);let lost=true;
    // Throw immediately after the next successful commit to simulate its lost acknowledgement.
    f.DB.batch=async statements=>{const result=await batch(statements);if(lost){lost=false;throw Error('LOST_ACK');}return result;};
    const next=f.body(1),completed=await f.call('use',{body:next});assert.equal(completed.status,200,JSON.stringify(completed.body));f.DB.batch=batch;
    assert.equal((await f.call('receipt',{requestId:next.requestId})).body.reward.code,PETS[1].code);
    assert.equal((await f.call('use',{body:next})).body.replayed,true);assert.equal(await f.tickets(),0);
    const other=await Promise.all([f.call('use'),f.call('use')]);assert(other.every(result=>result.status===409));
    assert.equal((await f.call('options')).headers['cache-control'],'private, no-store');
  });
  for(const changed of ['collection','cms'])test(`${dialect}: ${changed} changed at commit prevents consumption and cancels stale request`,async t=>{
    const f=await pumpkinChoiceFixture(t,{postgres}),body=f.body(),batch=f.DB.batch.bind(f.DB);let once=true;
    f.DB.batch=async statements=>{
      if(once){once=false;const key=changed==='collection'?'pet_collection_v1:2':'pet_cms_preparation_v1',record=await f.record(key);record.revision++;if(changed==='collection')record.pets['PET-BONGSOON']++;await f.write(key,record);}
      return batch(statements);
    };
    assert.equal((await f.call('use',{body})).status,503);f.DB.batch=batch;assert.equal(await f.tickets(),3);
    const retry=await f.call('use',{body});assert.equal(retry.status,409);assert.equal(retry.body.code,'PET_CHOICE_CHANGED');
    assert.equal((await f.call('receipt',{requestId:body.requestId})).body.code,'JOINT_OPERATION_SUPERSEDED');
    assert.equal((await f.call('use',{body:f.body(1)})).status,200);assert.equal(await f.tickets(),2);
    assert.equal((await f.record('pet_collection_v1:2')).pets[PETS[0].code],undefined);
  });
}

test('one-time catalog registration defaults to rollback, preserves policy, grants nothing and replays',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER);
    CREATE TABLE admin_logs(id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity INTEGER);
  `);
  const cms={revision:2,audit:[],document:{...emptyPetCmsDocument(),pets:PETS.map(pet=>({...emptyPetDraft(pet.code),...pet,liveEnabled:false}))}};
  for(const [key,value] of [['pet_cms_preparation_v1',cms],['pet_opening_settings_v1',{revision:9,enabled:false,pool:[]}],['pet_potential_settings_v1',{version:1,revision:5,enabled:false,successPpm:null}],['supporter_season_pass_v1',{revision:3,enabled:true}]])await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
  const protectedBefore=(await pg.query('SELECT * FROM app_meta ORDER BY key')).rows;
  const dry=await registerPetPumpkinChoiceItem(pg);assert.equal(dry.committed,false);assert.equal(dry.granted,0);
  assert.deepEqual((await pg.query('SELECT * FROM app_meta ORDER BY key')).rows,protectedBefore);
  assert.equal((await pg.query('SELECT * FROM inventory_items')).rows.length,0);assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,0);
  const applied=await registerPetPumpkinChoiceItem(pg,{commit:true});assert.equal(applied.committed,true);assert.equal(applied.choices.length,2);assert.equal(applied.granted,0);
  assert.equal(Object.keys(applied.preservedHashes).length,4);assert(applied.preservedHashes.pet_potential_settings_v1);
  const registered=(await pg.query('SELECT * FROM inventory_items WHERE code=$1',[ITEM.code])).rows[0];assert.equal(registered.name,ITEM.name);assert.equal(registered.is_active,1);assert.equal(registered.image_url,ITEM.image);
  assert.equal((await pg.query('SELECT * FROM cnine_user_inventory')).rows.length,0);
  assert.deepEqual((await pg.query('SELECT * FROM app_meta WHERE key<>$1 ORDER BY key',[OPERATION_KEY])).rows,protectedBefore);
  await pg.query("UPDATE inventory_items SET description='후속 운영 편집',is_active=0 WHERE code=$1",[ITEM.code]);
  const replay=await registerPetPumpkinChoiceItem(pg,{commit:true});assert.equal(replay.replayed,true);assert.equal(replay.auditId,applied.auditId);
  assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await pg.query('SELECT description FROM inventory_items')).rows[0].description,'후속 운영 편집');
});

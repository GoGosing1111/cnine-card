import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {additions,planPetRegistration,registerApprovedPets} from '../scripts/ops/pets-nine-live-20261014.mjs';
import approval from '../assets/ui/pets/approved-nine-20261014/approval-20261014.json' with {type:'json'};
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';

test('nine approved originals retain exact bytes and resolve in owned PVE/PVP loadouts',async t=>{
 const f=await petLiveFixture(t),state=await f.record('pet_cms_preparation_v1');
 // Normalize the fixture legacy policy exactly as the CMS read does.
 state.document.visibility='LIVE';state.document.battleEnabled=true;
 const plan=planPetRegistration(state);await f.write('pet_cms_preparation_v1',{...state,document:plan.document});
 assert.deepEqual(plan.document.pets.slice(0,-9),state.document.pets);
 const cards=REVIEW_DECK.map(c=>({...c,rarity:c.grade,basePower:c.power,power:c.power*10}));
 for(const [i,a] of approval.assets.entries()){
  const bytes=await readFile(new URL('../'+a.sourceArt,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
  assert.deepEqual(bytes,await readFile(new URL('../'+a.source,import.meta.url)));
  const save={petCode:a.code,expectedRevision:i,petCmsRevision:state.revision,requestId:crypto.randomUUID()};
  assert.equal((await f.call('pets/v1/loadout',{body:save})).status,403);
  await f.write('pet_collection_v1:2',{revision:i+1,pets:{[a.code]:1}});
  assert.equal((await f.call('pets/v1/loadout',{body:{...save,requestId:crypto.randomUUID()}})).status,200);
  for(const mode of ['PVE','PVP']){
   const pet=await loadPetBattleSnapshot(f.env,2,mode);assert.equal(pet.definition.code,a.code);
   const battle=mode==='PVE'?createPveBattleV2({cards,pet,monster:{id:1,battle_power:1800000},seed:37}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:pet,defenderPet:pet,seed:37});
   const events=battle.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');
   assert.equal(events.length,mode==='PVE'?1:2);assert(events.every(e=>e.name===a.name&&e.battleSprite===a.sourceArt));
  }
 }
});

test('registration preserves old definitions, rejects stale revision and replays without adding duplicates',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INT,role TEXT,status TEXT);INSERT INTO users VALUES(1,\'OWNER\',\'ACTIVE\');CREATE TABLE admin_logs(admin_id INT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);');
 const old={...additions[0],code:'PET-OLD',buffs:[{type:'DEFENSE_PERCENT',percent:25}]};
 const state={revision:10,audit:[],document:{version:1,visibility:'LIVE',battleEnabled:true,acquisitionEnabled:false,pets:[old]}};
 await pg.query('INSERT INTO app_meta VALUES($1,$2,NULL)',['pet_cms_preparation_v1',JSON.stringify(state)]);
 await assert.rejects(registerApprovedPets(pg,{expectedRevision:9}),/CMS changed/);
 const saved=await registerApprovedPets(pg,{expectedRevision:10});assert.equal(saved.revision,11);
 const replay=await registerApprovedPets(pg,{expectedRevision:10});assert.equal(replay.replayed,true);
 const after=JSON.parse((await pg.query('SELECT value FROM app_meta WHERE key=$1',['pet_cms_preparation_v1'])).rows[0].value);
 assert.deepEqual(after.document.pets,[old,...additions]);assert.equal(after.audit.length,1);
 assert.equal((await pg.query('SELECT COUNT(*)::int n FROM admin_logs')).rows[0].n,1);
});

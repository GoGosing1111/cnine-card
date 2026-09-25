import test from 'node:test';
import assert from 'node:assert/strict';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {duoMagicLoadouts,magicBattleLoadout} from '../functions/_magic.js';
import {loadUniqueAdvancementsForDecks} from '../functions/_unique_advancement.js';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {duoStation,DUO_BOARDS,latticeStation} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {pairDuoParticipants} from '../shared/ranked-duo-v1.mjs';

for(const postgres of [false,true])test(`${postgres?'Postgres':'SQLite'} batched magic preserves ownership, enhancement and each preset in four queries`,async t=>{
 const f=await magicFixture(postgres);t.after(()=>f.close());
 await f.saveDeck({presetNo:2,cardIds:f.cardIds,magicCardIds:[2,0,1,0,0]});
 await f.p('INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level) VALUES(2,1,1,9)').run();
 await f.p("INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id) VALUES(2,'PVP',5,1)").run();
 const entries=[{userId:1,presetNo:1},{userId:1,presetNo:2},{userId:2,presetNo:1},{userId:2,presetNo:3}];
 const expected=await Promise.all(entries.map(async e=>(await magicBattleLoadout(f.env,{id:e.userId,role:'USER'},'PVP',{presetNo:e.presetNo})).cards));
 const count=f.queries.length,actual=await duoMagicLoadouts(f.env,entries);
 assert.deepEqual(actual.map(e=>e.cards),expected);assert.equal(f.queries.length-count,4);
 assert.equal(actual[2].cards[0].slotNo,5);assert.equal(actual[2].cards[0].enhancementLevel,9);
 await f.p('UPDATE user_magic_cards SET quantity=0 WHERE user_id=1 AND magic_card_id=2').run();
 assert.deepEqual((await duoMagicLoadouts(f.env,entries))[1].cards.map(c=>c.id),[1]);
});

test('advancement reads all owners once, keeps ownership and uses current unique stats',async t=>{
 const f=await duoFixture(t);
 await f.p('CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,is_active INTEGER,attack_percent INTEGER,defense_percent INTEGER,speed_percent INTEGER,hp_percent INTEGER)').run();
 await f.p('CREATE TABLE card_unique_advancements_v1937(user_id INTEGER,card_id TEXT,class_code TEXT,dominant_type TEXT,config_version INTEGER,modifiers_json TEXT,activated_at TEXT,PRIMARY KEY(user_id,card_id))').run();
 await f.p("INSERT INTO card_unique_effects VALUES('C-0',1,80,0,0,0)").run();
 await f.p("INSERT INTO card_unique_advancements_v1937 VALUES(2,'C-0','RIPOSTE','DEFENSE',1,'{}','2026-09-25')").run();
 await f.p("INSERT INTO card_unique_advancements_v1937 VALUES(3,'C-1','RIPOSTE','DEFENSE',1,'{}','2026-09-25')").run();
 f.resetQueries();
 const maps=await loadUniqueAdvancementsForDecks(f.env,[{user:{id:2},cards:[{id:'C-0'}]},{user:{id:3},cards:[{id:'C-0'},{id:'C-1'}]},{user:{id:2},cards:[]}]);
 assert.equal(f.queries().length,1);assert.equal(maps[0].get('C-0').classCode,'SHATTER');assert.equal(maps[1].has('C-0'),false);assert.equal(maps[1].get('C-1').classCode,'RIPOSTE');assert.equal(maps[2].size,0);
});

test('missing selected attack preset cannot silently substitute the defense deck',async t=>{
 const f=await duoFixture(t);await f.ready();await f.p('UPDATE pvp_active_presets SET preset_no=3 WHERE user_id=2').run();
 const [profile]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.equal(profile.attackReady,false);assert.equal(profile.defenseReady,true);
 assert.equal((await f.call('ranked-duo/match',{user:2,method:'POST'})).status,409);
});

test('24 duo stations are distinct, mirrored and bounded without altering normal stations',()=>{
 const normal=latticeStation('cards',4,'ALLY');
 for(const compact of [false,true]){
  const b=DUO_BOARDS[compact?'compact':'desktop'],points=[];
  for(const kind of ['cards','mercenaries'])for(let i=0;i<(kind==='cards'?10:2);i++){
   const a=duoStation(kind,i,'ALLY',compact),d=duoStation(kind,i,'ENEMY',compact);points.push(a,d);assert.equal(a.x+d.x,b.width);assert.equal(a.y,d.y);
  }
  assert.equal(new Set(points.map(p=>p.x+':'+p.y)).size,24);
  assert.ok(points.every(p=>p.x>0&&p.x<b.width&&p.y>0&&p.y<b.height));
 }
 assert.deepEqual(latticeStation('cards',4,'ALLY'),normal);
});

test('potential counts owned unequipped mercenary and best gear per slot; actual combat counts equipped gear once',async t=>{
 const f=await duoFixture(t);await f.ready();
 const [before]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 const doc=JSON.parse((await f.p("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first()).payload_json);doc.mercenaries.find(m=>m.code==='V-004').rank='SS';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(doc)).run();
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(2,'V-004',1)").run();
 await f.p("INSERT INTO character_equipment_items VALUES(1,'WEAPON',100000,25000,1),(2,'WEAPON',200000,50000,1),(3,'BATTLE_SUIT',999999999,99999999,1)").run();
 await f.p('INSERT INTO user_equipment_instances VALUES(101,2,1),(102,2,2),(103,2,3)').run();
 await f.p("INSERT INTO user_equipment_loadout VALUES(2,'WEAPON',101),(2,'BATTLE_SUIT',103)").run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(101,2,1,1)').run();
 const [rated]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.ok(rated.power>before.power);assert.ok(rated.breakdown.mercenaryPower>0);assert.equal(rated.attack.mercenary,null);
 assert.equal(rated.breakdown.equipmentPower,Math.max(50000,forgePower(100000,1).pvp));
 assert.equal(rated.attack.equipmentBonus,forgePower(100000,1).pvp);
 const potential=rated.power;await f.p("INSERT INTO user_mercenary_loadout_v1 VALUES(2,'V-004')").run();
 const [equipped]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});assert.equal(equipped.power,potential);assert.equal(equipped.attack.mercenary.code,'V-004');
 await f.p('DELETE FROM user_equipment_instances WHERE id=102').run();
 const [destroyed]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});assert.equal(destroyed.breakdown.equipmentPower,forgePower(100000,1).pvp);
});

test('odd roster waits the latest applicant regardless of strength',()=>{
 const result=pairDuoParticipants([{userId:1,power:100,joinedAt:'2026-09-25T03:00Z'},{userId:2,power:50,joinedAt:'2026-09-25T01:00Z'},{userId:3,power:1,joinedAt:'2026-09-25T02:00Z'}]);
 assert.equal(result.waiting[0].userId,1);assert.deepEqual(result.teams[0].members.map(m=>m.userId),[2,3]);
});

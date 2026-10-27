import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout,savePreparedMercenaryLoadout,releasedMercenaryFormations,mercenaryFormationPower} from '../functions/_mercenary_account.js';
import {readMercenaryModes} from '../functions/_mercenary_loadout_modes.js';
import {dualMercenaryLoadoutKey} from '../functions/_mercenary_dual_loadout.js';
import {COMPANION_RELEASE,COMPANION_PREPARATION_REVIEW as REVIEW} from '../shared/companion-loadout-v2.mjs';
import {replaceMercenarySlot} from '../shared/mercenary-dual-client-v1.mjs';
import {createPveBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles,duoMercenaryPotential,duoMercenaryRating} from '../functions/_ranked_duo_profiles.js';
import {hasRankedDuoMercenary,rankedDuoPoolMemberCountSql} from '../functions/_ranked_duo_pool.js';
import {snapshot,pair} from './helpers/dual-content-fixture.mjs';

const rid=()=>crypto.randomUUID();
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} prepared saved pairs preserve single slots, isolate modes, roll back and replay safely`,async t=>{
 const f=await mercenaryFixture(t,{postgres});
for(const [code,rank] of [['V-013','SS'],['V-021','SSS'],['V-046','SSS']])f.document.mercenaries.find(m=>m.code===code).rank=rank;
await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();

 for(const code of ['V-001','V-002','V-013','V-021','V-046','V-960','V-970'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',code,'2026-10-28','2026-10-28').run();
 await saveMercenaryLoadout(f.env,f.user,{mode:'PVE',mercenaryCode:'V-001',revision:0,requestId:rid()});
 const single=structuredClone((await readMercenaryModes(f.env,[7])).get(7).loadouts),wallet=await f.coin();
 const save=(mode,codes,revision,requestId=rid())=>savePreparedMercenaryLoadout(f.env,f.user,{mode,mercenaryCodes:codes,revision,requestId});
 const body={mode:'PVE',mercenaryCodes:['V-001','V-002'],revision:1,requestId:rid()};
 assert.equal(COMPANION_RELEASE.dualMercenaries,false);
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,body),{code:'MERCENARY_DUAL_PENDING'});
 f.fail('INSERT INTO app_meta');await assert.rejects(savePreparedMercenaryLoadout(f.env,f.user,body));f.fail('');
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',dualMercenaryLoadoutKey(7)).first(),null);
 await savePreparedMercenaryLoadout(f.env,f.user,body);assert.equal((await savePreparedMercenaryLoadout(f.env,f.user,body)).replayed,true);
 await save('PVP',['V-021','V-013'],0);
 assert.deepEqual((await readMercenaryModes(f.env,[7])).get(7).loadouts,single);
 const read=mode=>releasedMercenaryFormations(f.env,[7],mode,{dual:true}).then(m=>m.get(7));
 const pve=await read('PVE'),pvp=await read('PVP');assert.deepEqual(pve.mercenaries.map(m=>m.code),['V-001','V-002']);assert.deepEqual(pvp.mercenaries.map(m=>m.code),['V-021','V-013']);
 assert.equal(mercenaryFormationPower(pve),pve.mercenaries.reduce((sum,m)=>sum+m.basePower,0));
 const battle=createPveBattleV2({...snapshot(),...pve,[REVIEW]:true,monster:{power:1e8},seed:12});assert.equal(battle.teams.A.mercenaries.length,2);
 await assert.rejects(save('PVE',['V-002'],1),{code:'MERCENARY_LOADOUT_CONFLICT'});
 await assert.rejects(save('PVE',['V-021','V-970'],2),/SSS/);
 await assert.rejects(save('PVE',['V-013','V-960'],2),/SS/);
 await assert.rejects(save('PVE',['V-001','V-003'],2),{code:'MERCENARY_NOT_OWNED'});
 await save('PVE',[],2);assert.deepEqual((await read('PVE')).mercenaries,[]);assert.deepEqual((await read('PVP')).mercenaries.map(m=>m.code),['V-021','V-013']);
 assert.equal(await f.coin(),wallet);
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} ranked duo profiles retain both owned choices in order and segregate cached single rules`,async t=>{
 const f=await duoFixture(t,{postgres});
 if(f.pg){const sql=fs.readFileSync('scripts/postgres-runtime-compat.sql','utf8');await f.pg.exec(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION sqlite_json_valid'),sql.indexOf('CREATE OR REPLACE FUNCTION sqlite_json_each')));}
 for(const id of [2,3,4,5]){
  for(const code of ['V-970','V-960'])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1)',id,code).run();
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',dualMercenaryLoadoutKey(id),JSON.stringify({version:2,PVE:{mercenaryCodes:[],revision:1},PVP:{mercenaryCodes:['V-960','V-970'],revision:1}})).run();
 }
 await f.ready();
 const profiles=await loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock(),dual:true});
 for(const p of profiles){assert.equal(hasRankedDuoMercenary(p,true),true);for(const side of ['attack','defense'])assert.deepEqual(p[side].mercenaries.map(m=>m.code),['V-960','V-970']);}
 const b=createDuoBattleV2({attackerSquads:profiles.slice(0,2).map(p=>p.attack),defenderSquads:profiles.slice(2).map(p=>p.defense),seed:15,[REVIEW]:true});
 assert.equal(b.teams.A.mercenaries.length,4);assert.equal(b.teams.B.mercenaries.length,4);
 const query=rankedDuoPoolMemberCountSql(4,true),stamp=new Date(f.clock()).toISOString().replace('T',' ').slice(0,19);assert.equal(Number((await f.p(query,stamp,2,3,4,5).first()).n),4);
 await f.p("DELETE FROM user_mercenary_cards_v1 WHERE user_id=5 AND mercenary_code='V-960'").run();assert.equal(Number((await f.p(query,stamp,2,3,4,5).first()).n),3);
 const old=await loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock()});assert.ok(old.every(p=>p.attack.mercenaries===undefined));
});

test('client slots and duo potential enforce SS/SSS limits including LIMITED',()=>{
 const owned=[...pair,{...pair[0],code:'V-960'},{...pair[1],code:'V-970'}];
 assert.throws(()=>replaceMercenarySlot({mercenaryCodes:['V-013']},1,'V-960',owned),/SS/);
 assert.throws(()=>replaceMercenarySlot({mercenaryCodes:['V-021']},1,'V-970',owned),/SSS/);
 assert.deepEqual(replaceMercenarySlot({mercenaryCodes:['V-021','V-013']},0,null,owned),['V-013']);
 const cards=snapshot().cards,expected=Math.max(...owned.filter(m=>m.rank==='SS').map(m=>duoMercenaryRating(m,cards,0)))+Math.max(...owned.filter(m=>m.rank==='SSS').map(m=>duoMercenaryRating(m,cards,0)));
 assert.equal(duoMercenaryPotential(owned,cards,0,{},true),expected);
 assert.equal(hasRankedDuoMercenary({attack:{mercenaries:[pair[0]]},defense:{mercenaries:[pair[0]]}},true),false);
});

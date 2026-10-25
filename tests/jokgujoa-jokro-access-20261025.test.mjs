import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {readMercenaryModes} from '../functions/_mercenary_loadout_modes.js';
import {JOKRO_CODE,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';

test('Jokgujoa direct Jokro access is restricted to the exact account',()=>{
 for(const id of [1,2,303,525,1768,4817,5008,5147,5663])assert.equal(jokroAccountAllowed(id,JOKRO_CODE),true);
 for(const id of [524,526,7,4977])assert.equal(jokroAccountAllowed(id,JOKRO_CODE),false);
 assert.equal(jokroAccountAllowed(7,JOKRO_CODE,Date.now(),true),true);
});

test('owned Jokro replaces both Jokgujoa modes and enters battle without regrant or stock change',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={id:525,role:'USER'};
 await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 for(const [id,name]of [[525,'족구조아'],[526,'other-account']])await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',id,name).run();
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-979',3,3)").run();
 const stock=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-979'").first();
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const id of [525,526])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,JOKRO_CODE,'prior-grant','prior-grant').run();
 await f.p("INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(525,'V-057',12,'before')").run();
 await f.p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?)','mercenary_pvp_loadout_v1:525',JSON.stringify({mercenaryCode:'V-057',revision:14}),'before').run();
 const owned=(await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=525').all()).results;
 const card=(await mercenaryAccountState(f.env,user)).cards.find(c=>c.code===JOKRO_CODE);assert.equal(card.canDeploy,true);
 await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:JOKRO_CODE,revision:12});
 assert.deepEqual((await readMercenaryModes(f.env,[525])).get(525).loadouts.PVP,{mercenaryCode:'V-057',revision:14});
 await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVP',mercenaryCode:JOKRO_CODE,revision:14});
 assert.deepEqual((await readMercenaryModes(f.env,[525])).get(525).loadouts,{PVE:{mercenaryCode:JOKRO_CODE,revision:13},PVP:{mercenaryCode:JOKRO_CODE,revision:15}});
 for(const mode of ['PVE','PVP']){
  assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,JOKRO_CODE);
  assert.equal((await releasedMercenarySnapshots(f.env,[525],mode)).get(525).code,JOKRO_CODE);
  await assert.rejects(saveMercenaryLoadout(f.env,{id:526,role:'USER'},{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 }
 assert.deepEqual((await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=525').all()).results,owned);
 assert.deepEqual(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-979'").first(),stock);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),0);
});

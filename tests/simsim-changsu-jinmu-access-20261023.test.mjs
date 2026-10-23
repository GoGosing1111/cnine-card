import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {readMercenaryModes} from '../functions/_mercenary_loadout_modes.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';

test('Simsim and Changsu Jinmu access is restricted to the two authorized accounts',()=>{
 for(const id of [4908,4933,5147])assert.equal(jinmuAccountAllowed(id,JINMU_CODE),true);
 for(const id of [4907,4909,4932,4934,7,4977])assert.equal(jinmuAccountAllowed(id,JINMU_CODE),false);
 assert.equal(jinmuAccountAllowed(7,JINMU_CODE,true),true);
});

for(const [id,nickname]of [[4908,'굳건창수'],[4933,'심심이']])test(`${nickname} can equip owned Jinmu in both modes with no stock or holding changes`,async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={id,role:'USER'},neighbor=id+1;
 await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 for(const [userId,name]of [[id,nickname],[neighbor,'other-account']])await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',userId,name).run();
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-989',5,5)").run();
 const stock=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-989'").first();
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JINMU_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const userId of [id,neighbor])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',userId,JINMU_CODE,'prior-grant','prior-grant').run();
 await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,?,12,?)',id,'V-057','before').run();
 await f.p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?)','mercenary_pvp_loadout_v1:'+id,JSON.stringify({mercenaryCode:'V-057',revision:14}),'before').run();
 const holdings=(await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=?',id).all()).results;
 assert.equal((await mercenaryAccountState(f.env,user)).cards.find(c=>c.code===JINMU_CODE).canDeploy,true);
 await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:JINMU_CODE,revision:12});
 assert.deepEqual((await readMercenaryModes(f.env,[id])).get(id).loadouts.PVP,{mercenaryCode:'V-057',revision:14});
 await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVP',mercenaryCode:JINMU_CODE,revision:14});
 assert.deepEqual((await readMercenaryModes(f.env,[id])).get(id).loadouts,{PVE:{mercenaryCode:JINMU_CODE,revision:13},PVP:{mercenaryCode:JINMU_CODE,revision:15}});
 for(const mode of ['PVE','PVP']){
  assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,JINMU_CODE);
  assert.equal((await releasedMercenarySnapshots(f.env,[id],mode)).get(id).code,JINMU_CODE);
  await assert.rejects(saveMercenaryLoadout(f.env,{id:neighbor,role:'USER'},{requestId:crypto.randomUUID(),mode,mercenaryCode:JINMU_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 }
 assert.deepEqual((await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=?',id).all()).results,holdings);
 assert.deepEqual(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-989'").first(),stock);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),0);
});

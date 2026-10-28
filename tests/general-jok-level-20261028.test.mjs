import test from 'node:test';
import assert from 'node:assert/strict';
import {generalJokLevelFixture} from './helpers/general-jok-level-fixture-20261028.mjs';
import {initialMercenaryLevel,mercenaryLevelRequiredXp} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryLevelState,attachReleasedMercenaryLevels} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel} from '../functions/_mercenary_level.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

const code='V-974',body=(extra={})=>({requestId:crypto.randomUUID(),mercenaryCode:code,revision:0,materials:[{code:'V-049',quantity:15}],...extra});
const holdings=async f=>(await f.p('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results;

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: owned GeneralJok appears, trains once, breaks through and retains growth in battle`,async t=>{
 const f=await generalJokLevelFixture(t,postgres),listed=await f.call('state');assert.equal(listed.status,200);
 const card=listed.body.cards.find(c=>c.code===code);assert.ok(card,'Owned GeneralJok must appear in growth state');assert.equal(card.name,'제너럴 족');assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');assert.ok(card.sourceArt);assert.equal(mercenaryLevelRequiredXp(f.policy,1,card),1500);
 const request=body(),preview=await f.call('preview',request);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.after.level,2);assert.equal(preview.body.requiredXpMultiplier,5);
 const result=await f.call('train',request);assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body.result.after,preview.body.after);
 const after=await holdings(f),replay=await f.call('train',request);assert.equal(replay.body.replayed,true);assert.deepEqual(await holdings(f),after);
 assert.equal(Number(after.find(c=>c.mercenary_code==='V-049').total_copies),16);assert.equal(Number(after.find(c=>c.mercenary_code===code).total_copies),1);
 assert.equal((await f.call('train',body())).status,409);
 await f.setState(code,{level:5,experience:1500,breakthroughMask:0,revision:2});
 const breakthrough=await runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:code,revision:2},'BREAKTHROUGH',{randomInt:()=>0});assert.equal(breakthrough.result.after.level,6);assert.equal(breakthrough.result.after.breakthroughMask,1);
 const snapshots=await attachReleasedMercenaryLevels(f.env,new Map([[7,limitedDeploymentSnapshot(code)]]));assert.equal(snapshots.get(7).level,6);assert.equal(snapshots.get(7).mercenaryLevel.version,2);assert.equal(snapshots.get(7).mercenaryLevel.breakthroughMask,1);
 assert.equal(await f.coin(),10000000);
});

test('GeneralJok ownership, protected original and material grade remain enforced',async t=>{
 const f=await generalJokLevelFixture(t),before=await holdings(f);
 assert.equal((await f.call('state',undefined,8)).body.cards.some(c=>c.code===code),false);
 assert.equal((await f.call('train',body(),8)).status,403);
 const protectedOriginal=await f.call('train',body({materials:[{code,quantity:1}]}));assert.equal(protectedOriginal.body.code,'MERCENARY_LEVEL_DUPLICATES');
 const wrongRank=await f.call('preview',body({materials:[{code:'V-001',quantity:1}]}));assert.equal(wrongRank.status,400);
 assert.deepEqual(await holdings(f),before);assert.deepEqual(await readMercenaryLevelState(f.env,7,code),initialMercenaryLevel());
});

test('PostgreSQL: failed GeneralJok level save rolls materials back and retries exactly once',async t=>{
 const f=await generalJokLevelFixture(t,true),before=await holdings(f),request=body();
 f.fail('INSERT INTO user_mercenary_levels_v1');assert.equal((await f.call('train',request)).status,503);f.fail('');
 assert.deepEqual(await holdings(f),before);assert.deepEqual(await readMercenaryLevelState(f.env,7,code),initialMercenaryLevel());
 assert.equal((await f.call('train',request)).status,200);assert.equal((await f.call('train',request)).body.replayed,true);
});

test('GeneralJok uses the existing LIMITED transfer group as source and recipient',async t=>{
 const f=await generalJokLevelFixture(t);await f.givePotion(2);await f.setState('V-996',{level:3,experience:0,breakthroughMask:0,revision:1});
 const received=await f.transfer('V-996',code);assert.equal(received.result.xp,1500);assert.equal(received.result.after.level,2);assert.equal(received.result.source.after.level,1);
 const sent=await f.transfer(code,'V-999');assert.equal(sent.result.xp,750);assert.equal(sent.result.source.after.level,1);assert.equal(sent.result.after.experience,750);
 const third=await f.transferBody('V-999',code),response=await f.call('transfer-preview',third);assert.notEqual(response.status,200);
 assert.equal(Number((await holdings(f)).find(c=>c.mercenary_code===code).total_copies),1);
});

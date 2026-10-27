import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlackwingRoom,addBlackwingMember,readyBlackwingMember,startBlackwingRoom,actBlackwingRoom,tickBlackwingRoom,blackwingView} from '../functions/_raid_blackwing.js';
import {blackwingCommands,blackwingLogText} from '../raid/blackwing/commands.mjs';
import {blackwingLiveFixture} from './helpers/blackwing-live-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';

import {members,room,action,oaths,debt,hearts,sever,ward,damage,play} from './helpers/blackwing-feedback-scenario.mjs';

for(const part of ['WING','BLADE'])test('v2 '+part+' clears all five phases with cooperation and healing across 12 seeds',()=>{
 for(let seed=1;seed<=12;seed++){const r=play(seed,part);assert.equal(r.status,'CLEAR',JSON.stringify({seed,failure:r.failure,phase:r.phase,step:r.step}));assert.equal(r.strain,0);assert.ok(r.resources.heal<=2,'at least two timed heals needed');assert.equal(r.boss.hp,0);assert.ok(r.combatLog.some(e=>e.action==='HEAL'));assert.ok(r.combatLog.some(e=>e.branch===part));}
});
test('perfect mechanics without recovery cannot clear either sever branch',()=>{for(const part of ['WING','BLADE']){const r=play(42,part,false);assert.equal(r.status,'FAILED');assert.ok(['PARTY_DEAD','MEMBER_DEAD'].includes(r.failure.code));assert.equal(r.resources.heal,4);assert.equal(r.strain,0);}});
test('role board requires two people and a changing symbol, blocks blind one-button progress',()=>{
 const r=room(),o=r.challenge.oaths.BREAKER;assert.notEqual(o.runes[0],o.runes[1]);const first=o.order[0],second=o.order[1];
 assert.equal(action(r,first,'CHARGE').code,'BLACKWING_OATH_REQUIRED');assert.equal(action(r,second,'RUNE',o.runes[1]).code,'BLACKWING_OATH_TURN');
 action(r,first,'RUNE',o.runes[0]);assert.equal(o.progress,1);assert.equal(action(r,first,'RUNE',o.runes[1]).code,'BLACKWING_OATH_TURN');
 action(r,second,'RUNE',o.runes[0]);assert.equal(r.strain,1);assert.equal(o.progress,1);action(r,second,'RUNE',o.runes[1]);assert.equal(o.progress,2);
 assert.ok(r.combatLog.some(e=>e.ownerId===second&&e.outcome==='FAILED'));
});
test('rune replay and stale progress token never repeat strain or complete the next player',()=>{
 const r=room(),o=r.challenge.oaths.BREAKER,id=o.order[0],token=blackwingView(r,id).challenge.tokens.RUNE;
 const input={requestId:'repeat_rune_123',action:'RUNE',target:String((o.runes[0]+1)%3),token};
 actBlackwingRoom(r,id,input);const count=r.combatLog.length;actBlackwingRoom(r,id,input);assert.equal(r.strain,1);assert.equal(r.combatLog.length,count);
 action(r,id,'RUNE',o.runes[0]);assert.equal(action(r,id,'RUNE',o.runes[1],r.clock,{token}).ignored,true);assert.equal(o.progress,1);
});
test('clock damage has no false actor attribution and survives JSON restart exactly once',()=>{
 const r=room();const at=r.challenge.pressureAt;action(r,'3','HEAL',undefined,at);
 const pulse=r.combatLog.find(e=>e.type==='BOSS_ULTIMATE');assert.equal(pulse.ownerId,undefined);assert.match(pulse.label,/20%/);
 const restored=JSON.parse(JSON.stringify(r));tickBlackwingRoom(restored,at+1);assert.equal(restored.combatLog.filter(e=>e.type==='BOSS_ULTIMATE').length,1);assert.equal(restored.resources.heal,3);
 assert.equal(action(restored,'6','HEAL').code,'BLACKWING_HEAL_COOLDOWN');assert.equal(restored.resources.heal,3);
});
test('phase 4 shares a new puzzle each breath and explains guard window and carryover',()=>{
 const r=room();debt(r);damage(r);hearts(r);damage(r);sever(r,'BLADE');damage(r);
 const at=r.challenge.breathAt,cycle=r.challenge.oathCycle;
 assert.equal(action(r,'3','WARD',0,at-3500).code,'BLACKWING_OATH_REQUIRED');oaths(r);
 let model=blackwingCommands(blackwingView(r,'3'),at-3501);assert.ok(model.buttons.filter(b=>b.action==='WARD').every(b=>b.disabled));
 model=blackwingCommands(blackwingView(r,'3'),at-3500);assert.ok(model.buttons.some(b=>b.action==='WARD'&&!b.disabled));
 action(r,'3','WARD',0,at-3500);tickBlackwingRoom(r,at);assert.deepEqual(r.wards,[1,2,2]);assert.equal(r.challenge.oathCycle,cycle+1);assert.equal(r.challenge.oaths.BREAKER.progress,0);
 assert.ok(blackwingCommands(blackwingView(r,'3'),at).buttons.filter(b=>b.action==='WARD').every(b=>b.disabled));
 oaths(r);action(r,'6','WARD',0,r.challenge.breathAt-3500);assert.equal(r.strain,1);assert.match(r.combatLog.findLast(e=>e.cueKey==='MISTAKE').label,/연속 성역/);
});
test('WING final late parry explains failure independently of sanctuary 1 2 3 sequence',()=>{
 const r=room();debt(r);damage(r);hearts(r);damage(r);sever(r,'WING');damage(r);for(const w of [0,1,0])ward(r,w);damage(r);
 const result=action(r,'6','ANCHOR',undefined,r.challenge.debt.opensAt+2500);assert.equal(result.code,'BLACKWING_PARRY_WINDOW');
 assert.ok(r.combatLog.some(e=>e.ownerId==='6'&&e.action==='ANCHOR'&&e.outcome==='REJECTED'&&/반격/.test(e.reason)));
 assert.match(blackwingLogText(blackwingView(r,'3'),r.combatLog),/흑익 절단.*2.5초/);
});
test('bounded delta log restores all player names and cannot expose another party deck',()=>{
 const r=room(),o=r.challenge.oaths.BREAKER,id=o.order[0];
 for(let i=0;i<420;i++)action(r,id,'CHARGE');const v=blackwingView(r,'3');assert.equal(v.combatLog.length,400);assert.ok(v.logStartSeq>0);
 const seq=v.eventSeq;assert.equal(blackwingView(r,'3',{since:seq}).combatLog.length,0);action(r,id,'CHARGE');assert.equal(blackwingView(r,'3',{since:seq}).combatLog.length,1);
 assert.ok(v.combatLog.every(e=>!e.cards&&!e.loadouts&&!e.hits));
});
for(const postgres of [false,true])test('committed rejection/log is idempotent and survives SQL rollback '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const h=await blackwingLiveFixture({postgres});t.after(()=>h.close());const roomId=await h.party();for(const[id]of members)await h.command('ready',{roomId,ready:true},Number(id));
 const started=await h.command('start',{roomId}),token=started.body.state.challenge.tokens.CHARGE,body={requestId:h.uid(),roomId,action:'CHARGE',token};
 const before=await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId);h.inject('INSERT INTO raid_blackwing_receipts');assert.equal((await h.call('action',{body})).status,503);h.inject('');
 assert.deepEqual(await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId),before);
 const accepted=await h.call('action',{body});assert.equal(accepted.status,200);assert.equal(accepted.body.actionResult.code,'BLACKWING_OATH_REQUIRED');await h.call('action',{body});
 const r=JSON.parse((await h.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);assert.equal(r.combatLog.filter(e=>e.action==='CHARGE').length,1);
 const queries=h.count(),delta=await h.call('state?roomId='+roomId+'&since='+r.eventSeq,{user:3});assert.equal(delta.body.state.combatLog.length,0);assert.ok(h.count()-queries<12,'record polling reuses the existing room read without per-member SQL');
 assert.equal((await h.call('state?roomId='+roomId,{user:4})).status,403);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
});
test('old client cannot create a v2 room and current client does not migrate existing v1 combat',async t=>{
 const h=await blackwingLiveFixture();t.after(()=>h.close());await h.configure();assert.equal((await h.command('create',{clientRulesVersion:1})).body.code,'BLACKWING_CLIENT_UPDATE');
 const r=room();r.rulesVersion=1;delete r.challenge.oaths;delete r.challenge.pressureAt;assert.equal(action(r,'1','CHARGE').ok,true);assert.equal(r.challenge.debt.packets,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classicFixture} from './helpers/classic-colosseum-db.mjs';
import {CLASSIC_KEYS,classicRoomKey,classicResultKey,classicLoadout} from '../shared/classic-colosseum-v1.mjs';
const fixture=t=>{const f=classicFixture();t.after(()=>f.close());return f;};
test('default OFF, anonymous and non-OWNER cannot operate or invite',async t=>{
 const f=fixture(t);assert.equal((await f.call('classic-colosseum/status',{user:2})).settings.enabled,false);
 for(const user of [2,5])assert.equal((await f.call('admin/classic-colosseum/settings',{user,method:'POST',body:{enabled:true,revision:0}})).status,403);
 assert.equal((await f.call('classic-colosseum/status',{user:999})).status,401);
 assert.equal((await f.call('admin/classic-colosseum/invite',{method:'POST',body:{requestId:crypto.randomUUID(),userA:2,userB:3}})).code,'CLASSIC_OFF');
});
test('catalog only offers public allowed grades and PVP magic, with no equipment at +10',async t=>{
 const f=fixture(t),c=await f.call('classic-colosseum/catalog',{user:2});assert.equal(c.status,200);
 assert.deepEqual(c.cards.map(c=>c.id).sort(),['CARD-0','CARD-1','CARD-2','CARD-3','CARD-4','CARD-5']);
 assert(c.cards.every(c=>c.enhancementLevel===10&&c.breakthrough_level===10));assert.equal(c.equipment,undefined);assert.equal(c.rules.equipment,false);assert(!f.queries().some(q=>q.includes('character_equipment_items')));
 assert.equal(c.magic.length,5);assert(c.magic.every(m=>m.enhancementLevel===10&&m.triggerChance===50));
 assert.throws(()=>classicLoadout({...f.loadout,mercenaryCode:'V-971'},c));
 for(const ids of [['CARD-0','CARD-0','CARD-1','CARD-2','CARD-3'],['CARD-0','CARD-1','CARD-2','CARD-3','CARD-6'],['CARD-0','CARD-1','CARD-2','CARD-3','CARD-7'],['CARD-0','CARD-1','CARD-2','CARD-3','CARD-8']])assert.throws(()=>classicLoadout({...f.loadout,cardIds:ids},c));
 assert.throws(()=>classicLoadout({...f.loadout,equipmentIds:[1,7]},c));assert.throws(()=>classicLoadout({...f.loadout,magicCardIds:[1,1]},c));
});
test('one invitation per participant, stable request ID, individual accept popups and access control',async t=>{
 const f=fixture(t);await f.on();const room=await f.invite();
 const replay=await f.call('admin/classic-colosseum/invite',{method:'POST',body:{requestId:room.id,userA:2,userB:3}});assert.equal(replay.replayed,true);
 assert.equal((await f.call('admin/classic-colosseum/invite',{method:'POST',body:{requestId:crypto.randomUUID(),userA:2,userB:4}})).code,'CLASSIC_BUSY');
 assert.equal((await f.act(room.id,4,'accept')).status,403);assert.equal((await f.act(room.id,2,'ready')).code,'CLASSIC_LOADOUT');
 assert((await f.notices(2)).invitation);assert((await f.notices(3)).invitation);
 assert.equal((await f.act(room.id,2,'accept')).room.status,'INVITED');assert.equal((await f.notices(2)).invitation,null);assert((await f.notices(3)).invitation,'other entrant must retain invitation popup');
 assert.equal((await f.act(room.id,3,'accept')).room.status,'SETUP');assert.equal((await f.notices(3)).invitation,null);
});
test('declines and expiry close entry without grants or news',async t=>{
 const f=fixture(t);await f.on();let room=await f.invite();assert.equal((await f.act(room.id,2,'decline')).room.status,'DECLINED');assert.equal((await f.notices(3)).invitation,null);
 room=await f.invite();f.advance(30*60000+1);assert.equal((await f.act(room.id,2,'accept')).code,'CLASSIC_CLOSED');assert.equal((await f.notices(2)).invitation,null);assert.equal(f.get(CLASSIC_KEYS.news),null);
});
test('OFF revokes pending generation permanently, stale settings and uninvited requests fail',async t=>{
 const f=fixture(t),room=await f.setup(),cfg=f.get(CLASSIC_KEYS.settings);
 assert.equal((await f.call('admin/classic-colosseum/settings',{method:'POST',body:{enabled:false,revision:cfg.revision}})).status,200);
 await f.on();assert.equal((await f.call('classic-colosseum/status',{user:2})).room.status,'CANCELLED');assert.equal((await f.act(room.id,2,'ready')).code,'CLASSIC_CLOSED');
 assert.equal((await f.call('admin/classic-colosseum/settings',{method:'POST',body:{enabled:false,revision:cfg.revision}})).code,'CLASSIC_CONFLICT');
});
test('equal rentals are isolated from accounts; enemy loadout hidden until completed',async t=>{
 const f=fixture(t),room=await f.setup(),view=await f.call('classic-colosseum/status',{user:2});
 assert.deepEqual(view.room.players[0].loadout,f.loadout);assert.equal(view.room.players[1].loadout,undefined);assert.equal(view.room.seed,undefined);assert.equal(view.room.players[0].snapshot,undefined);
 for(const player of f.room(room.id).players){assert(player.snapshot.cards.every(c=>c.breakthrough_level===10&&!c.uniqueAdvancement));assert.equal(player.snapshot.equipment,undefined);}
 assert(f.db.prepare('SELECT coin FROM users').all().every(u=>u.coin===987654));
});
test('both ready produces one server battle, one article and separate loss/win notices; retries stable',async t=>{
 const f=fixture(t),room=await f.setup();await f.act(room.id,2,'ready');const result=await f.act(room.id,3,'ready');assert.equal(result.status,200);assert.equal(result.room.status,'COMPLETED');
 const replay=await f.call('classic-colosseum/replay?id='+room.id,{user:2});assert.equal(replay.status,200);assert.equal(replay.battleV2.teams.A.cards.length,5);assert.equal(replay.battleV2.teams.B.cards.length,5);assert.equal(replay.battleV2.teams.A.mercenaries,undefined);assert.equal(replay.battleV2.teams.B.pet,undefined);
 assert.equal(f.get(CLASSIC_KEYS.news).length,1);assert.notEqual(f.user(2).results[0].loss,f.user(3).results[0].loss);
 const saved=JSON.stringify(f.get(classicResultKey(room.id)));await f.act(room.id,3,'ready');await f.act(room.id,2,'recover');assert.equal(JSON.stringify(f.get(classicResultKey(room.id))),saved);assert.equal(f.get(CLASSIC_KEYS.news).length,1);
 assert.equal((await f.call('classic-colosseum/replay?id='+room.id,{user:4})).status,403);
 await f.call('classic-colosseum/ack',{user:2,method:'POST',body:{matchId:room.id}});assert.equal((await f.notices(2)).results.length,0);assert.equal((await f.notices(3)).results.length,1);
 assert(f.db.prepare('SELECT coin FROM users').all().every(u=>u.coin===987654));
});
test('failed settlement rolls back article and notices, lease recovery reuses frozen seed and inputs',async t=>{
 const f=fixture(t),room=await f.setup();await f.act(room.id,2,'ready');
 const originalBatch=f.env.DB.batch;let failSettlement=true;
 f.env.DB.batch=async rows=>{if(failSettlement&&rows.some(r=>r.args.includes(CLASSIC_KEYS.news))){failSettlement=false;throw Error('INJECTED_SETTLEMENT_OUTAGE');}return originalBatch(rows);};
 const r=await f.act(room.id,3,'ready');assert.equal(r.status,500);assert.equal(f.get(CLASSIC_KEYS.news),null);assert.equal(f.user(2).results.length,0);
 const stored=f.room(room.id);assert.equal(stored.status,'FIGHTING');assert(stored.input);f.advance(31000);
 const recovered=await f.act(room.id,2,'recover');assert.equal(recovered.room.status,'COMPLETED');assert.equal(f.room(room.id).seed,stored.seed);assert.equal(f.get(CLASSIC_KEYS.news).length,1);
});
test('conflicting simultaneous ready and save keep one revision; user search escaped and bounded',async t=>{
 const f=fixture(t),room=await f.setup(),revision=f.room(room.id).revision;
 const results=await Promise.all([f.call('classic-colosseum/ready',{user:2,method:'POST',body:{matchId:room.id,revision}}),f.call('classic-colosseum/loadout',{user:2,method:'POST',body:{matchId:room.id,revision,loadout:f.loadout}})]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.code==='CLASSIC_CONFLICT').length,1);
 assert.equal((await f.call('admin/classic-colosseum/users?q=%25')).users.length,0);assert.equal((await f.call('admin/classic-colosseum/users?q=2')).users[0].id,2);assert.equal((await f.call('admin/classic-colosseum/users?q=2',{user:2})).status,403);
});

test('rental catalog change reopens preparation and both sides share one intrinsic-policy read',async t=>{
 const f=fixture(t),room=await f.setup();await f.act(room.id,2,'ready');f.db.prepare("UPDATE cards_effective_v1210 SET is_active=0 WHERE id='CARD-0'").run();
 assert.equal((await f.act(room.id,3,'ready')).code,'CLASSIC_RENTAL_CHANGED');assert.equal(f.room(room.id).status,'SETUP');assert(f.room(room.id).players.every(p=>!p.ready));
 f.db.prepare("UPDATE cards_effective_v1210 SET is_active=1 WHERE id='CARD-0'").run();let batches=[];const original=f.deps.cardUniqueDeckStates;f.deps.cardUniqueDeckStates=async(...args)=>{batches.push(args[1].length);return original(...args);};
 await f.act(room.id,2,'ready');assert.equal((await f.act(room.id,3,'ready')).room.status,'COMPLETED');assert.deepEqual(batches,[2]);
});
test('notification polling is one indexed query, OFF/news reads never initialize schema',async t=>{
 const f=fixture(t);f.clearQueries();await f.notices(2);assert.equal(f.queries().length,1);assert.match(f.queries()[0],/WHERE key IN/);
 await f.call('classic-colosseum/news',{user:2});assert(!f.queries().some(q=>/CREATE|INSERT|UPDATE|DELETE/i.test(q)));
});
test('main game routes, canonical codex UI, live renderer and popup wiring are present',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),client=read('js/classic-colosseum-v1.mjs'),api=read('functions/api/[[path]].js');
 assert.match(read('js/app.js'),/mountClassicColosseum/);assert.match(read('js/app.js'),/showClassicNotifications/);assert.match(read('js/soopketmon-v21-runtime-router.js'),/classicColosseum: \{ shell: 'classicColosseum' \}/);assert.match(client,/ProjectVBattleV3Live.createRenderer/);assert.match(client,/cn-ui-button/);assert.match(api,/classicNotifications\(env,user.id\)/);assert.match(client,/esc\(article.title\)/);assert.match(client,/초대 수락/);
});

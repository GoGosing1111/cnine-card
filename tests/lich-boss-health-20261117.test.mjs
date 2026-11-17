import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,setLichLoadout,startLichRoom,tickLichRoom,actLichRoom,lichView} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {lichBossDamageEvent,bindLichBossHealth} from '../shared/lich-boss-health-v1.mjs';

function strongLichDeck(id=1){
 const deck=accountDeck((id-1)%3+1),combat=deck.mercenary.combat;
 delete deck.mercenary;
 deck.mercenaries=['V-978',['V-965','V-950'][id%2]].map(code=>({...limitedDeploymentSnapshot(code),combat,level:21}));
 return deck;
}
function finalWindow(size){
 const room=createLichRoom({id:'HP_REGRESSION',hostId:'1',mode:'PARTY',rulesVersion:2,cards:REVIEW_DECK,monster:REVIEW_BOSS,now:1000,seed:31});
 for(let id=1;id<=size;id++){
  addLichMember(room,{id:String(id),name:'검수 '+id,role:['ASSAULT','WARDEN','RESCUE'][(id-1)%3]});
  setLichLoadout(room,String(id),strongLichDeck(id),'검수 '+id);
 }
 startLichRoom(room,'1',room.clock);tickLichRoom(room,room.startedAt);
 room.round=6;room.step='EXPOSED';room.boss.maxHp=25714920;room.boss.hp=Math.round(room.boss.maxHp*.1);room.challenge.deadline=room.clock+12000;
 return room;
}
function attack(room,id,serial,action='STRIKE'){
 const control=lichView(room,String(id)).controls.find(c=>c.action===action);
 const input={requestId:'boss_health_'+serial,challengeId:room.challenge.id,action,stepToken:control.token};
 actLichRoom(room,String(id),input,room.clock);return input;
}
function assertHits(events,bossId){
 let previous=Infinity,nested=0;
 for(const event of events.filter(e=>e.targetId===bossId&&e.damage>0)){
  assert(event.targetHpAfter<=previous,'authoritative HP never rises');
  previous=event.targetHpAfter;
  for(const key of ['hits','targets']){
   const rows=(event[key]||[]).filter(h=>!h.targetId||h.targetId===bossId);
   if(!rows.length)continue;
   nested+=rows.length;
   assert.equal(rows.reduce((n,h)=>n+h.damage,0),event.damage,'nested damage uses the same capped budget');
   let hp=event.targetHpAfter+event.damage;
   for(const hit of rows){hp-=hit.damage;assert.equal(hit.targetHpAfter,hp,'no preview HP leaks into raid playback');assert.equal(hit.targetMaxHp,event.targetMaxHp);assert.equal(hit.absorbed,0);}
   assert.equal(hp,event.targetHpAfter);
  }
 }
 return nested;
}
test('strong mercenary nested hits use the capped raid HP; 3–6 players finish and retries cannot duplicate the kill',()=>{
 let nested=0;
 for(const size of [3,4,5,6]){
  const room=finalWindow(size),initial=room.boss.hp;let serial=0,last;
  for(let cycle=0;cycle<4&&room.status==='ACTIVE';cycle++){
   for(let id=1;id<=size&&room.status==='ACTIVE';id++)last={id,input:attack(room,id,++serial,cycle===0&&id===1?'BURST':'STRIKE')};
   if(room.status==='ACTIVE')tickLichRoom(room,room.clock+1400);
  }
  assert.equal(room.status,'CLEAR');assert.equal(room.boss.hp,0);assert.equal(room.statistics.damage,initial);
  nested+=assertHits(room.events,room.boss.id);
  const before=JSON.stringify(room);actLichRoom(room,String(last.id),last.input,room.clock);assert.equal(JSON.stringify(room),before);
  assert.equal(room.events.filter(e=>e.type==='RESULT').length,1);
 }
 assert(nested>0,'exercise real Leonel / Bloodmoon / Black Crown skills');
});

test('remaining one HP and reported 0.2–0.3 percent HP can be finished before the unchanged deadline',()=>{
 for(const size of [3,4,5,6])for(const hp of [1,57139,85716]){
  const room=finalWindow(size);room.boss.hp=hp;room.clock=room.challenge.deadline-1;
  attack(room,1,`${size}_${hp}`);
  assert.equal(room.status,'CLEAR');assert.equal(room.boss.hp,0);
 }
});

test('nested multi-hit budgets round once, preserve metadata and zero damage, and repair old persisted events without mutation',()=>{
 const event={type:'TURN',targetId:'boss',damage:7,targetHpAfter:3,targetMaxHp:100,speedCombo:true,hits:[{damage:0,targetHpAfter:0},{damage:80,targetHpAfter:900},{damage:20,targetHpAfter:700}],targets:[{targetId:'boss',damage:100,targetHpAfter:0},{targetId:'other',damage:1,targetHpAfter:90}]};
 const before=JSON.stringify(event),fixed=lichBossDamageEvent(event);
 assert.deepEqual(fixed.hits.map(h=>[h.damage,h.targetHpAfter]),[[0,10],[6,4],[1,3]]);
 assert.equal(fixed.targets[0].damage,7);assert.equal(fixed.targets[0].targetHpAfter,3);
 assert.deepEqual(fixed.targets[1],event.targets[1]);assert.equal(fixed.speedCombo,true);
 assert.equal(JSON.stringify(event),before);assert.deepEqual(lichBossDamageEvent(fixed),fixed);
});

test('late impacts cannot refill or falsely kill Isgen; ally healing and the shared engine after exit remain intact',()=>{
 const boss={id:'boss',hp:10},ally={id:'ally',hp:20},state={bossHp:20,bossMaxHp:1000};
 const engine={syncTargetHp(target,value){target.hp=value;return target;}},original=engine.syncTargetHp;
 const release=bindLichBossHealth(engine,'boss',()=>state);
 engine.syncTargetHp(boss,0);assert.equal(boss.hp,2);
 engine.syncTargetHp(boss,80);assert.equal(boss.hp,2);
 engine.syncTargetHp(ally,50);assert.equal(ally.hp,50);
 state.bossHp=0;engine.syncTargetHp(boss,0);assert.equal(boss.hp,0);
 release();release();assert.equal(engine.syncTargetHp,original);
 engine.syncTargetHp(boss,100);assert.equal(boss.hp,100);
});

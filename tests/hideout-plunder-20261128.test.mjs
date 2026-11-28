import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {handleHideoutPlunder} from '../functions/_hideout_plunder.js';
import {readHideout} from '../functions/_personal_hideout.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {emptyHideout, HIDEOUT_KEY, HIDEOUT_STOCK_LIMITS} from '../shared/personal-hideout-v1.mjs';
import {PLUNDER, plunderWindow, plunderTransfer, assignPlunderTeams} from '../shared/hideout-plunder-v1.mjs';

const start = Date.parse('2026-11-28T20:30:00+09:00');
const end = Date.parse('2026-11-28T22:00:00+09:00');
const day = '2026-11-28';

test('Korean date, exact opening and closing, stock conservation at capacity and balanced late joins', () => {
  assert.equal(plunderWindow(start-1).open,false);
  assert.equal(plunderWindow(start).open,true);
  assert.equal(plunderWindow(end-1).open,true);
  assert.equal(plunderWindow(end).open,false);
  assert.equal(plunderWindow(Date.parse('2026-11-28T15:00:00Z')).day,'2026-11-29');
  const a=emptyHideout(), d=emptyHideout();
  a.parts.STEEL=HIDEOUT_STOCK_LIMITS.STEEL-1; d.parts.STEEL=100;
  a.parts.WIRE=HIDEOUT_STOCK_LIMITS.WIRE; d.parts.WIRE=50; d.parts.DRIVE=1; d.parts.CORE=8;
  assert.deepEqual(plunderTransfer(a,d,HIDEOUT_STOCK_LIMITS),{STEEL:1,DRIVE:1});
  assert.equal(d.parts.STEEL,99); assert.equal(d.parts.WIRE,50); assert.equal(d.parts.CORE,8);
  const members=[];
  for(let i=0;i<25;i++){
    members.push({id:i,power:1000+i*10,team:null});assignPlunderTeams(members);
    assert.equal(members.filter(p=>p.team==='A').length,members.filter(p=>p.team==='B').length);
    assert.equal(members.filter(p=>!p.team).length,(i+1)%2);
  }
});

async function fixture(t, postgres) {
  const f=await jointFixture(t,{postgres});
  let now=start, winner='A', finishTime=0;
  f.env.PERSONAL_HIDEOUT_ENABLED='1';
  const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'검수 카드 '+i,name:'카드 '+i,
    rarity:i<2?'FUR':i<4?'ZENITH':'SUPERSTAR',power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],
    breakthrough_level:0,base_power:20000}));
  const deps={...f.deps,now:()=>now,pvpDeckSnapshot:async()=>cards,battleSettings:async()=>({}),
    cardBattlePower:c=>c.base_power,authenticate:async r=>{const id=Number(r.headers.get('X-Fixture-User'));return id?{id,nickname:'대원'+id,role:'USER'}:null;},
    loadPetBattleSnapshot:async()=>null,releasedMercenarySnapshot:async()=>null,
    createPvpBattleV2:options=>{
      if(finishTime)now=finishTime;
      if(winner==='ENGINE')return createPvpBattleV2(options);
      return {result:{winner},teams:{A:{summary:{power:100000}},B:{summary:{power:100000}}}};
    }};
  for(const uid of [7,8,9,10]){
    const home={...emptyHideout(),level:1,rooms:['main']};
    delete home.durability; // Pre-release persisted home.
    Object.assign(home.parts,{STEEL:40,WIRE:13,CIRCUIT:4,DRIVE:1,CORE:9});
    home.placements.push({id:'sofa-1',kind:'decor',code:'sofa',room:'main',x:500,y:500,flipped:true},
      {id:'stored',kind:'decor',code:'lamp',room:null,x:500,y:500,flipped:false});
    await f.setting(HIDEOUT_KEY(uid),home);
  }
  async function call(uid,action='',body){
    const path='hideout/raid'+(action?'/'+action:'');
    const request=new Request('https://game.test/api/'+path,{method:body?'POST':'GET',
      headers:{Origin:'https://game.test','Content-Type':'application/json','X-Fixture-User':String(uid)},
      ...(body?{body:JSON.stringify(body)}:{})});
    const response=await handleHideoutPlunder({path,request,env:f.env,deps});
    return {status:response.status,data:await response.json()};
  }
  const job=(fields={})=>({requestId:crypto.randomUUID(),day,...fields});
  const join=uid=>call(uid,'join',job());
  const home=async uid=>(await readHideout(f.env,uid)).state;
  return {f,call,job,join,home,deps,setTime:value=>now=value,setWinner:v=>winner=v,finishAt:v=>finishTime=v};
}

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+' actual participants, one atomic material transfer, hold, zero HP, repair and old receipts',async t=>{
    const h=await fixture(t,postgres);
    assert.equal((await h.call(0)).status,401);
    h.setTime(start-1);assert.equal((await h.join(7)).status,409);
    h.setTime(start);assert.equal((await h.join(7)).status,200);
    assert.equal((await h.call(7)).data.mine.team,null);
    assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,403);
    assert.equal((await h.join(8)).status,200);
    const enemy=(await h.call(7)).data.enemies[0];
    assert.equal(enemy.id,8);assert.equal(enemy.durability,100);
    assert.deepEqual((await h.call(9)).data.enemies,[]);
    assert.equal((await h.call(7,'attack',h.job({targetId:7}))).status,400);
    assert.equal((await h.call(7,'attack',h.job({targetId:9}))).status,409);
    assert.equal((await h.call(7,'attack',h.job({targetId:8,winner:'A'}))).status,400);
    const job=h.job({targetId:8});
    h.f.fail('INSERT INTO app_meta(key,value,updated_at) VALUES');
    assert.equal((await h.call(7,'attack',job)).status,503);h.f.fail('');
    assert.equal((await h.home(8)).durability,100);assert.equal((await h.home(7)).parts.STEEL,40);
    const hit=await h.call(7,'attack',job);
    assert.equal(hit.status,200,JSON.stringify(hit.data));assert.equal(hit.data.after,80);
    assert.deepEqual(hit.data.loot,{STEEL:4,WIRE:2,CIRCUIT:1,DRIVE:1});
    assert.equal(hit.data.hideoutFurniture.length,1);
    assert.deepEqual(hit.data.hideoutFurniture[0],{art:'furniture-sofa.webp',width:420/960,flipped:true,x:.25,y:563.2/640});
    assert.equal((await h.home(7)).parts.STEEL,44);assert.equal((await h.home(8)).parts.STEEL,36);
    assert.equal((await h.home(8)).parts.CORE,9);
    assert.equal((await h.call(7,'attack',job)).data.replayed,true);
    assert.equal((await h.call(7,'attack',{...job,targetId:10})).status,409);
    assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,429);
    assert.equal((await h.call(8,'repair',h.job())).status,409);
    for(let i=1;i<=4;i++){
      h.setTime(start+PLUNDER.cooldownMs*i);
      assert.equal((await h.call(7,'attack',h.job({targetId:8}))).data.after,80-i*20);
    }
    const home=await h.home(8);assert.equal(home.durability,0);assert.equal(home.level,1);
    h.setTime(start+PLUNDER.cooldownMs*5);
    assert.equal((await h.call(8,'attack',h.job({targetId:7}))).status,409);
    assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,409);
    h.setTime(end);
    assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,409);
    assert.equal((await h.call(7,'attack',job)).data.after,80);
    const repair=h.job();assert.equal((await h.call(8,'repair',repair)).data.durability,20);
    assert.equal((await h.call(8,'repair',repair)).data.replayed,true);
    assert.equal((await h.home(8)).parts.STEEL,home.parts.STEEL-2);
    const board=(await h.call(7)).data;assert.equal(board.score.A+board.score.B,5);
    h.setTime(start+86400000);assert.equal((await h.call(8)).data.mine,null);assert.equal((await h.home(8)).durability,20);
  });
  test(dialect+' enforces the operating window using the database clock',async t=>{
    const h=await fixture(t,postgres);
    delete h.deps.now;
    const window=plunderWindow(Date.now());
    if(!window.open){const home=await h.home(7);home.durability=60;await h.f.setting(HIDEOUT_KEY(7),home);}
    const r=await h.call(7,window.open?'join':'repair',h.job({day:window.day}));
    assert.equal(r.status,200,JSON.stringify(r.data));
    if(!window.open)assert.equal((await h.home(7)).durability,80);
  });
  test(dialect+' closing during battle, loss and actual PvP engine replay',async t=>{
    const h=await fixture(t,postgres);await h.join(7);await h.join(8);
    h.finishAt(end);assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,409);
    assert.equal((await h.home(8)).durability,100);
    h.finishAt(0);h.setTime(start+1000);h.setWinner('B');
    const loss=await h.call(7,'attack',h.job({targetId:8}));
    assert.equal(loss.data.before,loss.data.after);assert.deepEqual(loss.data.loot,{});
    h.setTime(start+PLUNDER.cooldownMs+1000);h.setWinner('ENGINE');
    const job=h.job({targetId:8}), battle=await h.call(7,'attack',job);
    assert.equal(battle.status,200,JSON.stringify(battle.data).slice(0,300));
    assert(battle.data.battleV2.result.timeline.length>1);
    const replay=await h.call(7,'attack',job);
    assert.equal(replay.data.replayed,true);
    assert.deepEqual(replay.data.battleV2.result,battle.data.battleV2.result);
  });
}

test('overlapping different attackers, same-team block and lost response recovery',async t=>{
  const h=await fixture(t,false);
  await Promise.all([7,8,9,10].map(h.join));
  const view=(await h.call(7)).data;
  assert.deepEqual(view.counts,{A:2,B:2,waiting:0});
  const ally=[8,9,10].find(id=>!view.enemies.some(p=>p.id===id)), target=view.enemies[0].id;
  assert.equal((await h.call(7,'attack',h.job({targetId:ally}))).status,409);
  const results=await Promise.all([7,ally].map(id=>h.call(id,'attack',h.job({targetId:target}))));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
  assert.equal((await h.home(target)).durability,80);
  const committed=h.job({targetId:target});h.setTime(start+PLUNDER.cooldownMs);
  h.f.DB.afterCommit=()=>{h.f.DB.afterCommit=null;throw Error('RESPONSE_LOST');};
  const recovered=await h.call(7,'attack',committed);assert.equal(recovered.data.replayed,true);
  assert.equal((await h.home(target)).durability,60);
});

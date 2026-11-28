import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRaidWallet,raidBalances} from './helpers/hideout-raid-rewards.mjs';
import {handleGarageTuning} from '../functions/_garage_tuning.js';
import {jointFixture} from './helpers/joint-db.mjs';
import {handleHideoutPlunder} from '../functions/_hideout_plunder.js';
import {mutateHideout,readHideout,handlePersonalHideout} from '../functions/_personal_hideout.js';
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
  await prepareRaidWallet(f);
  let now=start, winner='A', finishTime=0;
  f.env.PERSONAL_HIDEOUT_ENABLED='1';
  f.env.HIDEOUT_PLUNDER_ENABLED='1';
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
  async function call(uid,action='',body,targetId){
    const path='hideout/raid'+(action?'/'+action:'');
    const request=new Request('https://game.test/api/'+path+(targetId?'?target='+targetId:''),{method:body?'POST':'GET',
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
  test(dialect+' raid defaults OFF during event hours, protecting both homes and the ordinary hideout', async t=>{
    const h=await fixture(t,postgres);
    const homes=await Promise.all([h.home(7),h.home(8)]);
    for(const flag of [undefined,'0']){
      if(flag===undefined)delete h.f.env.HIDEOUT_PLUNDER_ENABLED;
      else h.f.env.HIDEOUT_PLUNDER_ENABLED=flag;
      const regular=await handlePersonalHideout({path:'hideout',env:h.f.env,deps:h.deps,
        request:new Request('https://game.test/api/hideout',{headers:{'X-Fixture-User':'7'}})});
      const enclosing=await regular.json();assert.equal(regular.status,200);assert.equal(enclosing.enabled,true);assert.equal(enclosing.raidEnabled,false);
      for(const [action,body] of [['',undefined],['join',h.job()],['attack',h.job({targetId:8})],['repair',h.job()]]){
        const r=await h.call(7,action,body);
        assert.equal(r.status,423);assert.equal(r.data.code,'HIDEOUT_RAID_OFF');
      }
    }
    assert.deepEqual(await Promise.all([h.home(7),h.home(8)]),homes);
    const rows=await h.f.p("SELECT COUNT(*) AS n FROM app_meta WHERE key LIKE 'hideout_plunder_%'").first();
    assert.equal(Number(rows.n),0);
  });
  test(dialect+' actual participants, one atomic material transfer, hold, zero HP, repair and old receipts',async t=>{
    const h=await fixture(t,postgres);
    assert.equal((await h.call(0)).status,401);
    h.setTime(start-1);assert.equal((await h.join(7)).status,409);
    h.setTime(start);assert.equal((await h.join(7)).status,200);
    const waiting=(await h.call(7,'',undefined,8)).data;
    assert.equal(waiting.mine.team,null);assert.equal(waiting.scout,null);
    assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,403);
    assert.equal((await h.join(8)).status,200);
    const enemy=(await h.call(7)).data.enemies[0];
    assert.equal(enemy.id,8);assert.equal(enemy.durability,100);
    const outsider=(await h.call(9,'',undefined,8)).data;
    assert.deepEqual(outsider.enemies,[]);assert.equal(outsider.scout,null);
    const ownTarget=(await h.call(7,'',undefined,7)).data.scout;
    assert.equal(ownTarget.targetId,8);
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
    assert.equal(hit.data.residenceLayout.pieces.length,1);
    assert.deepEqual(hit.data.residenceLayout.pieces[0],{id:'sofa-1',kind:'decor',code:'sofa',room:'main',x:500,y:500,flipped:true,
      skin:null,art:'furniture-sofa.webp',width:420,surface:'floor'});
    assert.equal(hit.data.victoryReward.userId,7);
    assert.deepEqual(await raidBalances(h.f,7),[1,1,1]);
    assert.deepEqual(await raidBalances(h.f,8),[0,0,0]);
    assert.equal((await h.home(7)).parts.STEEL,44);assert.equal((await h.home(8)).parts.STEEL,36);
    assert.equal((await h.home(8)).parts.CORE,9);
    assert.equal((await h.call(7,'attack',job)).data.replayed,true);
    assert.deepEqual(await raidBalances(h.f,7),[1,1,1]);
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
    const board=(await h.call(7,'',undefined,8)).data;assert.equal(board.score.A+board.score.B,5);assert.equal(board.scout,null);
    h.setTime(start+86400000);assert.equal((await h.call(8)).data.mine,null);assert.equal((await h.home(8)).durability,20);
  });
  test(dialect+' installs once, fights in the chosen room and keeps the recorded layout after editing',async t=>{
    const h=await fixture(t,postgres),env=h.f.env,home=await h.home(8);
    home.level=2;home.rooms.push('workshop');
    Object.assign(home.parts,{STEEL:260,WIRE:148,CIRCUIT:68,DRIVE:18,STRUCTURE:21,CORE:2});
    const otherHome=await h.home(7);
    home.unlockedSkins=['sofa-cognac-leather'];home.placements[0].skin='sofa-cognac-leather';
    await h.f.setting(HIDEOUT_KEY(8),home);
    const change=async(action,fields)=>mutateHideout(env,8,action,{requestId:crypto.randomUUID(),revision:(await h.home(8)).revision,...fields});
    delete env.HIDEOUT_PLUNDER_ENABLED;
    await assert.rejects(change('installDefense',{item:'turret',room:'main'}),{code:'HIDEOUT_RAID_OFF'});
    await assert.rejects(change('defenseRoom',{room:'workshop'}),{code:'HIDEOUT_RAID_OFF'});
    env.HIDEOUT_PLUNDER_ENABLED='1';
    h.setTime(start-3600000);
    assert.equal((await h.call(8)).data.window.open,false);
    await assert.rejects(change('decorate',{item:'turret',room:'main'}));
    const body={requestId:crypto.randomUUID(),revision:home.revision,item:'autocannon',room:'workshop'};
    const cannon=await mutateHideout(env,8,'installDefense',body);
    assert.equal((await mutateHideout(env,8,'installDefense',body)).replayed,true);
    const turretCost={STEEL:180,WIRE:100,CIRCUIT:48,DRIVE:18,STRUCTURE:14,CORE:2};
    assert.deepEqual(cannon.state.parts,{...home.parts,...turretCost});
    await assert.rejects(change('installDefense',{item:'autocannon',room:'main'}),{code:'HIDEOUT_OWNED'});
    for(const code of ['STRUCTURE','CORE']){
      const short=await h.home(8);short.parts={...cannon.state.parts,[code]:turretCost[code]-1};
      await h.f.setting(HIDEOUT_KEY(8),short);
      await assert.rejects(change('installDefense',{item:'turret',room:'workshop'}),{code:'HIDEOUT_PARTS'});
      assert.deepEqual(await h.home(8),short);
    }
    await h.f.setting(HIDEOUT_KEY(8),cannon.state);
    const built=await change('installDefense',{item:'turret',room:'workshop'});
    assert.deepEqual(built.state.parts,emptyHideout().parts);
    assert.equal(built.state.placements.filter(p=>p.code==='turret').length,1);
    await assert.rejects(change('installDefense',{item:'turret',room:'main'}),{code:'HIDEOUT_OWNED'});
    assert.deepEqual(await h.home(7),otherHome);
    await change('defenseRoom',{room:'workshop'});
    h.setTime(start);
    await h.join(7);await h.join(8);h.setWinner('ENGINE');
    const staged=await h.home(8),job=h.job({targetId:8});
    const scout=(await h.call(7,'',undefined,8)).data.scout;
    assert.equal(scout.targetId,8);assert.equal(scout.layout.revision,staged.revision);
    assert.deepEqual(scout.layout.rooms.map(r=>r.code),['workshop']);
    assert.deepEqual(scout.layout.pieces.map(p=>p.code).sort(),['autocannon','turret']);
    const fight=(await h.call(7,'attack',job)).data;
    assert.equal(fight.residenceLayout.defenseRoom,'workshop');
    assert.equal(fight.residenceLayout.revision,staged.revision);
    assert.deepEqual(fight.residenceLayout.rooms.map(r=>r.code),['main','workshop']);
    assert.equal(fight.residenceLayout.pieces.find(p=>p.code==='sofa').art,'skin-sofa-cognac-leather.webp');
    const shots=r=>r.battleV2.result.timeline.filter(e=>e.type==='HIDEOUT_DEFENSE_FIRE');
    assert.deepEqual(shots(fight).slice(0,2).map(e=>[e.facility,e.hits.length]),[['autocannon',1],['turret',3]]);
    assert(shots(fight).every(e=>e.hits.every(t=>t.targetId.startsWith('A:')&&t.damage+t.absorbed>0&&Number.isFinite(t.targetHpAfter))));
    const moved=(await h.home(8)).placements.map(p=>p.code==='turret'?{...p,room:null}:p.code==='autocannon'?{...p,room:'main',x:930,flipped:true}:p);
    await change('arrange',{placements:moved});
    const replay=(await h.call(7,'attack',job)).data;
    assert.deepEqual(replay.residenceLayout,fight.residenceLayout);
    assert.deepEqual(shots(replay),shots(fight));
    h.setTime(start+PLUNDER.cooldownMs);
    const later=(await h.call(7,'attack',h.job({targetId:8}))).data;
    assert.equal(shots(later).length,0);
    assert(!later.residenceLayout.pieces.some(p=>p.code==='turret'));
  });
  test(dialect+' draw has no award and the first win before shop setup grants equippable parts and wallet currency',async t=>{
    const h=await fixture(t,postgres),f=h.f;
    await f.p("DELETE FROM app_meta WHERE key='loot_shop_policy_v1'").run();
    for(const sql of ['DROP TABLE pig_coin_ledger_v1','DROP TABLE pig_coin_wallets_v1',
      'CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY,is_active INTEGER)',
      'CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,PRIMARY KEY(user_id,garage_id))',
      'CREATE TABLE user_garage_loadout(user_id INTEGER PRIMARY KEY,garage_id INTEGER)']){
      if(f.DB.execSchema)await f.DB.execSchema([sql]);else await f.p(sql).run();
    }
    for(const sql of ['INSERT INTO character_garage_items VALUES(37,1)','INSERT INTO user_garage_vehicles VALUES(8,37)','INSERT INTO user_garage_loadout VALUES(8,37)'])await f.p(sql).run();
    await h.join(7);await h.join(8);h.setWinner('DRAW');
    const tie=await h.call(7,'attack',h.job({targetId:8}));
    assert.equal(tie.status,200);assert.equal(tie.data.victoryReward,null);
    for(const uid of [7,8])assert.deepEqual(await raidBalances(f,uid),[0,0,0]);
    h.setTime(start+PLUNDER.cooldownMs);h.setWinner('B');
    const job=h.job({targetId:8}),result=await h.call(7,'attack',job);assert.equal(result.status,200,JSON.stringify(result.data));
    await h.call(7,'attack',job);assert.deepEqual(await raidBalances(f,8),[1,1,1]);
    for(const slot of ['engine','frame']){
      const path='character/garage/tuning',request=new Request('https://game.test/api/'+path,{method:'POST',
        headers:{'X-Fixture-User':'8'},body:JSON.stringify({vehicleId:37,action:'equip',slot,stage:1})});
      const res=await handleGarageTuning({env:f.env,path,request,deps:{...h.deps,readBody:r=>r.json()}});
      assert.equal(res.status,200);const {tuning}=await res.json();assert.equal(tuning.equipped[slot],1);
    }
    assert.deepEqual(await raidBalances(f,7),[0,0,0]);
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
  test(dialect+' enrolls a 24-player opening rush with one request per participant',async t=>{
    const h=await fixture(t,postgres);
    const ids=Array.from({length:24},(_,i)=>100+i), residence=await h.home(7);
    for(const id of ids)await h.f.setting(HIDEOUT_KEY(id),residence);
    const results=await Promise.all(ids.map(h.join));
    assert.deepEqual(results.map(r=>r.status),ids.map(()=>200));
    const board=(await h.call(ids[0])).data;
    assert.deepEqual(board.counts,{A:12,B:12,waiting:0});
    assert.equal(new Set(board.enemies.map(p=>p.id)).size,12);
  });
  test(dialect+' closing during battle, loss and actual PvP engine replay',async t=>{
    const h=await fixture(t,postgres);await h.join(7);await h.join(8);
    h.finishAt(end);assert.equal((await h.call(7,'attack',h.job({targetId:8}))).status,409);
    assert.equal((await h.home(8)).durability,100);
    h.finishAt(0);h.setTime(start+1000);h.setWinner('B');
    const loss=await h.call(7,'attack',h.job({targetId:8}));
    assert.equal(loss.data.victoryReward.userId,8);
    assert.deepEqual(await raidBalances(h.f,8),[1,1,1]);
    assert.deepEqual(await raidBalances(h.f,7),[0,0,0]);
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

test('a concurrent defender edit changes the simulated room before settlement, and a wallet failure rolls back the loot and both tuning parts',async t=>{
  const h=await fixture(t,false),f=h.f,home=await h.home(8);
  home.placements.push({id:'active-gun',kind:'decor',code:'autocannon',room:'main',x:840,y:190,flipped:true});
  await f.setting(HIDEOUT_KEY(8),home);
  await h.join(7);await h.join(8);
  const job=h.job({targetId:8}),batch=f.DB.batch.bind(f.DB);
  let moved=false;
  f.DB.batch=async statements=>{
    if(!moved&&statements.some(s=>s.values?.[0]==='hideout_plunder_receipt_v1:7:'+job.requestId)){
      moved=true;home.placements.at(-1).room=null;home.placements[0].x=874;home.revision++;
      await f.setting(HIDEOUT_KEY(8),home);
    }
    return batch(statements);
  };
  const original=h.deps.createPvpBattleV2,inputs=[];
  h.deps.createPvpBattleV2=opts=>{inputs.push(opts.hideoutDefenses||[]);return original(opts);};
  f.fail('INSERT INTO pig_coin_ledger_v1');
  assert.equal((await h.call(7,'attack',job)).status,503);
  assert.equal((await h.home(8)).durability,100);assert.deepEqual(await raidBalances(f,7),[0,0,0]);
  f.fail('');
  const recovered=await h.call(7,'attack',job);
  assert.equal(recovered.status,200);
  assert.equal(recovered.data.residenceLayout.revision,home.revision);
  assert.equal(recovered.data.residenceLayout.pieces[0].x,874);
  assert.deepEqual(inputs[0],['autocannon']);assert.deepEqual(inputs[1],[]);
  assert.equal(recovered.data.residenceLayout.pieces.length,1);
  assert.equal((await h.home(8)).durability,80);assert.deepEqual(await raidBalances(f,7),[1,1,1]);
});

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

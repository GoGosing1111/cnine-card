import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {__territoryClanTest as T,__territoryLoadoutTest as L,simulateTerritoryDuel} from '../functions/_territory_war.js';
import {pickDiverseTerritoryOpponent as pick} from '../shared/territory-matchmaking-20261013.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const cards=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,name:'현재 카드 '+i,rarity:'SSR',power:10000,base_power:10000,power_type:'ATTACK',breakthrough_level:0}));
const mercenary=limitedDeploymentSnapshot('V-996');
function providers(){
  const calls=[],selections=new Map();
  const deps={json:(data,status=200)=>({data,status}),battleSettings:async()=>({}),
    pvpDeckSnapshot:async(_env,id)=>selections.get(Number(id))??cards('new-'+id+'-'),
    pvpDeckSnapshotByIds:async()=>{throw Error('Old deck must never be loaded for a fresh duel');},
    cardBattlePower:c=>c.power,userEquipmentBonuses:async()=>({pvp:777}),
    loadPetBattleSnapshot:async(_env,user,mode)=>{assert.equal(mode,'PVP');return null;},
    releasedMercenarySnapshot:async(_env,user,mode)=>{assert.equal(mode,'PVP');return structuredClone(mercenary);},
    createPvpBattleV2:input=>{calls.push(structuredClone(input));return {teams:{A:{summary:{power:10000}},B:{summary:{power:10000}}},result:{winner:'A',timeline:[]}};}
  };
  return {deps,calls,selections};
}

test('comparable opponents diversify beyond the old 5% band and nearest twelve',()=>{
  const pool=Array.from({length:40},(_,i)=>({user_id:i+1,deck_power:100000+i*480,defenses:i*100}));
  const history=[];
  for(let n=0;n<25;n++){
    const picked=pick(pool,100000,history,n+17);assert.ok(picked);assert.ok(!history.slice(0,12).includes(picked.user_id));
    history.unshift(picked.user_id);assert.equal(picked.match_pool_size,40);
  }
  assert.ok(new Set(history).size>=13);assert.ok(history.some(id=>id>12));
  assert.deepEqual(pick(pool,100000,[],900),pick(pool,100000,[],900));
  assert.equal(pick([],100000),null);
  assert.equal(pick([{user_id:1,deck_power:400000}],100000,[1]).user_id,1);
});
test('small pools rotate oldest opponent; far outliers never displace comparable alternatives',()=>{
  const pool=[1,2,3].map(user_id=>({user_id,deck_power:100000}));
  assert.equal(pick(pool,100000,[1,2,3,1,2,3]).user_id,3);
  for(let seed=1;seed<100;seed++)assert.notEqual(pick([...pool,{user_id:99,deck_power:900000}],100000,[1,2],seed).user_id,99);
});
test('matching rechecks changed current powers and skips an invalid current deck',async()=>{
  const {deps}=providers();deps.releasedMercenarySnapshot=async()=>null;deps.userEquipmentBonuses=async()=>({pvp:0});
  const pool=[1,2,3].map(user_id=>({round_id:1,user_id,deck_power:50000}));
  const seed=18,first=pick(pool,50000,[],seed).user_id;
  deps.pvpDeckSnapshot=async(_env,id)=>id===first?cards('too-strong-').map(c=>({...c,power:900000})):cards('current-');
  const selected=await L.currentBattleOpponent({},deps,{candidates:pool,recent:[],seed},{deck_power:50000},{});
  assert.notEqual(selected.user_id,first);assert.equal(selected.deck_power,50000);
  deps.pvpDeckSnapshot=async(_env,id)=>id===first?[]:cards('current-');
  assert.notEqual((await L.currentBattleOpponent({},deps,{candidates:pool,recent:[],seed},{deck_power:50000},{})).user_id,first);
});

test('carried complete registrations refresh cards and mercenaries before team allocation',async t=>{
  const f=await territoryNetworkFixture(t,false,{participants:6}),{deps}=providers();
  await f.p('UPDATE territory_war_v3_users SET mandatory_clan=0').run();
  const result=await T.formRound(f.env,await f.round(),f.cfg,deps);assert.equal(result.status,'ACTIVE');
  const rows=(await f.p('SELECT * FROM territory_war_v3_users').all()).results;
  assert.equal(rows.length,6);assert.deepEqual(new Set(rows.map(r=>r.side)),new Set(['A','B']));
  for(const row of rows){assert.equal(JSON.parse(row.deck_snapshot)[0],'new-'+row.user_id+'-0');assert.equal(JSON.parse(row.loadout_bonus_json).mercenary.code,'V-996');assert.equal(Number(row.energy),15);}
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: current cards and mercenaries, replay isolation, invalid decks and atomic reward retry`,async t=>{
  const f=await territoryNetworkFixture(t,postgres,{participants:16});await f.form();
  const mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' ORDER BY user_id LIMIT 1").first();
  const user={id:Number(mine.user_id),nickname:'신고 계정',role:'USER'},p=providers();
  const body={requestId:'CURRENT:ATTACK:001',frontId:5,objective:'SIEGE'};
  const before=await f.p('SELECT energy,attacks,side FROM territory_war_v3_users WHERE user_id=?',user.id).first();
  const response=await T.handleAttack(f.env,p.deps,user,f.cfg,body);assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(p.calls[0].attackerCards[0].id,'new-'+user.id+'-0');
  assert.ok(p.calls[0].defenderCards[0].id.startsWith('new-'));
  assert.equal(p.calls[0].attackerMercenary.code,'V-996');assert.equal(p.calls[0].defenderMercenary.code,'V-996');
  const saved=await f.p('SELECT * FROM territory_war_v3_users WHERE user_id=?',user.id).first();
  assert.equal(saved.side,before.side);assert.equal(Number(saved.energy),Number(before.energy)-1);assert.equal(Number(saved.attacks),Number(before.attacks)+1);
  assert.deepEqual(JSON.parse(saved.deck_snapshot),p.calls[0].attackerCards.map(c=>c.id));
  const receipt=await f.p('SELECT * FROM territory_war_v3_actions WHERE request_id=?',body.requestId).first();
  assert.deepEqual(JSON.parse(receipt.battle_meta_json).replayInput,p.calls[0]);
  const pool=await L.selectBattleOpponent(f.env,1,{...saved,user_id:user.id},'CURRENT:MATCH:NEXT');assert.equal(pool.recent.length,1);
  assert.equal(Number(pool.recent[0].opponent_user_id),Number(receipt.opponent_user_id));
  p.selections.set(user.id,cards('changed-again-'));p.deps.releasedMercenarySnapshot=async()=>null;
  const replay=await T.handleAttack(f.env,p.deps,user,f.cfg,body);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.deepEqual(p.calls[1],p.calls[0],'retry uses the immutable battle input');
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),100);
  assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',user.id).first()).energy),Number(saved.energy));
  const current=await L.currentTerritoryFormation(f.env,p.deps,{...saved,nickname:user.nickname},{});
  await L.saveCurrentTerritoryFormation(f.env,current,await f.round());
  const afterRefresh=await f.p('SELECT * FROM territory_war_v3_users WHERE user_id=?',user.id).first();
  assert.equal(JSON.parse(afterRefresh.loadout_bonus_json).mercenary,null);assert.equal(JSON.parse(afterRefresh.deck_snapshot)[0],'changed-again-0');
  for(const key of ['side','energy','attacks','damage','defenses'])assert.equal(afterRefresh[key],saved[key]);
  p.selections.set(user.id,cards('invalid-').slice(0,4));
  const invalid=await T.handleAttack(f.env,p.deps,user,f.cfg,{...body,requestId:'CURRENT:INVALID:001'});assert.equal(invalid.status,409);assert.match(invalid.data.error,/현재 PVP 덱 5장/);
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),100);
  assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',user.id).first()).energy),Number(saved.energy));
  await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED' WHERE id=1").run();
  await L.saveCurrentTerritoryFormation(f.env,{...current,deck_snapshot:'["forbidden"]'});
  assert.equal(JSON.parse((await f.p('SELECT deck_snapshot FROM territory_war_v3_users WHERE user_id=?',user.id).first()).deck_snapshot)[0],'changed-again-0');
});

test('fresh real V3 combat includes the selected limited mercenary on both teams',async()=>{
  const {deps}=providers();deps.createPvpBattleV2=createPvpBattleV2;
  const a=await L.currentTerritoryFormation({},deps,{round_id:1,user_id:1,side:'A'},{}),b=await L.currentTerritoryFormation({},deps,{round_id:1,user_id:2,side:'B'},{});
  const result=await simulateTerritoryDuel({},deps,{id:1},a,b,'ACTUAL:V3');
  for(const side of ['A','B'])assert.ok(result.battleV2.teams[side].mercenaries.some(f=>f.isMercenary&&f.name===mercenary.name),side+' mercenary fighter');
});
test('legacy receipts never get resimulated with a different current deck',async()=>{
  const result={attackerWon:false,damage:900};assert.equal(await L.hydrateBattleReplay({}, {createPvpBattleV2:()=>{throw Error('Must not run');}}, {},{battle_meta_json:'{}'},result),result);
});
test('participant diagnostic compares registered/current selections without changing either',async t=>{
  const f=await territoryNetworkFixture(t,false,{participants:2}),{deps}=providers();
  deps.pvpDeckSnapshotByIds=async(_env,_id,ids)=>ids.map(id=>({id,name:'기존 '+id}));
  const before=await f.p('SELECT * FROM territory_war_v3_users WHERE user_id=1').first();
  const response=await L.inspectTerritoryParticipant(f.env,deps,'참가자 1');assert.equal(response.status,200);
  assert.equal(response.data.registered.cards[0].id,'a');assert.equal(response.data.registered.mercenary,null);
  assert.equal(response.data.current.cards[0].id,'new-1-0');assert.equal(response.data.current.mercenary.code,'V-996');
  assert.deepEqual(await f.p('SELECT * FROM territory_war_v3_users WHERE user_id=1').first(),before);
  assert.equal((await L.inspectTerritoryParticipant(f.env,deps,'없는 참가자')).status,404);
});

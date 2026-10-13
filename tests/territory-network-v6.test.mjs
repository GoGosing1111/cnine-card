import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {NETWORK_NODES,NETWORK_EDGES,networkControl,networkTimeWinner} from '../shared/territory-network-v6.mjs';
import {networkView,networkFront,networkActionGuards,networkActionCleanup,resolveNetworkNode,networkWinner,mutateNetworkRecruitment} from '../functions/_territory_network_v6.js';
import {__territoryClanTest as T,balancedSideAssignments} from '../functions/_territory_war.js';
import {recordTerritorySkillVote,territorySkillVoteKey} from '../functions/_territory_skill_votes.js';
import {territorySkillState} from '../functions/_territory_clan_warfare.js';

test('three routes are connected symmetrically; isolated territory cannot open another front',()=>{
  const initial=networkControl();assert.deepEqual(initial.counts,{A:4,B:4,neutral:1});
  assert.deepEqual(initial.nodes.filter(n=>n.a_access).map(n=>n.index),[1,2,4,6,7]);
  for(const [a,b] of NETWORK_EDGES){const mirror=i=>({0:8,1:2,2:1,3:5,4:4,5:3,6:7,7:6,8:0})[i];assert.ok(NETWORK_EDGES.some(([x,y])=>(x===mirror(a)&&y===mirror(b))||(y===mirror(a)&&x===mirror(b))));}
  const isolated=networkControl(NETWORK_NODES.map(n=>({...n,owner:[0,7].includes(n.index)?'A':'B'})));
  assert.equal(isolated.nodes[7].connected,false);assert.equal(isolated.nodes[8].a_access,0);
  assert.equal(networkTimeWinner(NETWORK_NODES,{a_total_damage:10,b_total_damage:9}),'A');
});

for(const postgres of [false,true]){const dialect=postgres?'PostgreSQL':'SQLite';
  test(`${dialect}: stopped unformed roster carries forward once without clan locks; completed rounds never auto-enrol`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);
    await f.p("UPDATE territory_war_v3_rounds SET status='DISABLED',warfare_version=4 WHERE id=1").run();
    const id=await T.createRound(f.env,f.cfg);assert.equal(id,2);
    const newRound=await f.p('SELECT * FROM territory_war_v3_rounds WHERE id=?',id).first();assert.equal(Number(newRound.warfare_version),6);
    const roster=(await f.p('SELECT * FROM territory_war_v3_users WHERE round_id=?',id).all()).results;
    assert.equal(roster.length,52);assert.ok(roster.every(r=>r.side==null&&Number(r.mandatory_clan)===0));
    assert.equal(await T.createRound(f.env,f.cfg),id);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users WHERE round_id=1 AND mandatory_clan=1').first()).n),52);
    await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED',settled_at=CURRENT_TIMESTAMP WHERE id=?",id).run();
    const third=await T.createRound(f.env,f.cfg);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users WHERE round_id=?',third).first()).n),0);
  });
  test(`${dialect}: all members of one clan split individually; formation creates nine independent fronts atomically`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);const formed=await f.form();assert.equal(formed.status,'ACTIVE');assert.equal(formed.aCount,26);assert.equal(formed.bCount,26);
    const users=(await f.p('SELECT * FROM territory_war_v3_users ORDER BY user_id').all()).results;
    assert.ok(users.every(u=>Number(u.mandatory_clan)===0&&u.clan_id==null));assert.ok(Math.abs(formed.aPower-formed.bPower)<=100);
    const map=await networkView(f.env,await f.round(),'A',2);assert.equal(map.nodes.length,9);assert.equal(map.canEnter,true);assert.equal(map.selectedIndex,2);assert.equal(new Set(map.nodes.map(n=>n.front_id)).size,9);
    assert.equal((await f.form()).status,'ACTIVE');assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_fronts').first()).n),9);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_clans').first()).n),0);
  });
  test(`${dialect}: node capture, defense, rerun and home victory preserve all unrelated fronts`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();
    async function capture(index,side){const round=await f.round(),front=await networkFront(f.env,round,{nodeIndex:index});await f.p("UPDATE territory_war_v3_fronts SET status='RESOLVED',winner_side=?,b_hp=0 WHERE id=?",side,front.id).run();front.status='RESOLVED';front.winner_side=side;front.b_hp=0;return {front,result:await resolveNetworkNode(f.env,round,front,f.cfg)};}
    const other=await networkFront(f.env,await f.round(),{nodeIndex:7}),first=await capture(2,'A');
    assert.equal(first.result.roundFinished,false);assert.notEqual(Number(first.result.nextFront.id),Number(first.front.id));assert.equal(first.result.nextFront.node_index,2);
    assert.deepEqual(await networkFront(f.env,await f.round(),{nodeIndex:7}),other);
    assert.equal((await networkView(f.env,await f.round(),'A',8)).canEnter,true);
    await resolveNetworkNode(f.env,await f.round(),first.front,f.cfg);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_front_results').first()).n),1);
    const defended=await capture(2,'A');assert.equal(defended.result.roundFinished,false);
    assert.deepEqual((await networkView(f.env,await f.round(),'A')).counts,{A:5,B:3,neutral:1});
    const final=await capture(8,'A');assert.equal(final.result.roundFinished,true);assert.equal(await networkWinner(f.env,await f.round()),'A');
    const mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' LIMIT 1").first();
    await assert.rejects(f.env.DB.batch(networkActionGuards(f.env,{round:await f.round(),front:other,mine,requestId:'AFTER_HOME'})));
  });
  test(`${dialect}: inaccessible, stale and foreign fronts roll back action cost and receipt`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();const round=await f.round(),mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' LIMIT 1").first();
    const target=await networkFront(f.env,round,{nodeIndex:8}),before=Number(mine.energy);
    async function act(front,id){return f.env.DB.batch([...networkActionGuards(f.env,{round,front,mine,requestId:id}),f.p('UPDATE territory_war_v3_users SET energy=energy-1 WHERE user_id=?',mine.user_id),...networkActionCleanup(f.env,round,id)]);}
    await assert.rejects(act(target,'INACCESSIBLE'));assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',mine.user_id).first()).energy),before);
    const accessible=await networkFront(f.env,round,{nodeIndex:2});await act(accessible,'VALID');
    await f.p("UPDATE territory_war_v3_fronts SET status='RESOLVED',winner_side='A',b_hp=0 WHERE id=?",accessible.id).run();
    await assert.rejects(act(accessible,'STALE'));await assert.rejects(act({...accessible,id:99999},'FOREIGN'));
    assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',mine.user_id).first()).energy),before-1);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_mutation_guards').first()).n),0);
  });
  test(`${dialect}: 25 votes affect the chosen northern node; another node keeps its HP and cannot bypass cooldown`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();const front=await networkFront(f.env,await f.round(),{nodeIndex:2}),central=await networkFront(f.env,await f.round(),{nodeIndex:4});
    const voters=(await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' ORDER BY user_id").all()).results,key=territorySkillVoteKey(1,front.id,'A','ASSAULT',0);
    for(const [i,mine] of voters.slice(0,25).entries())await recordTerritorySkillVote(f.env,{round:await f.round(),front,mine,operation:'ASSAULT',voteKey:key,requestId:'NETWORK_VOTE:'+i});
    const result=await T.activateVotedTerritorySkill(f.env,key,f.cfg);assert.equal(result.activated,true);assert.equal(Number(result.frontId),Number(front.id));
    assert.ok(Number((await networkFront(f.env,await f.round(),{nodeIndex:2})).b_hp)<Number(front.b_hp));
    assert.deepEqual(await networkFront(f.env,await f.round(),{nodeIndex:4}),central);
    assert.equal((await T.activateVotedTerritorySkill(f.env,key,f.cfg)).replayed,true);
    await assert.rejects(recordTerritorySkillVote(f.env,{round:await f.round(),front:central,mine:voters[0],operation:'ASSAULT',voteKey:territorySkillVoteKey(1,central.id,'A','ASSAULT',0),requestId:'OLD_COOLDOWN'}));
  });
  test(`${dialect}: failed formation leaves no split roster, map or active phase; registration cannot race completed formation`,async t=>{
    const f=await territoryNetworkFixture(t,postgres),batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
    f.env.DB.batch=async statements=>{if(!injected&&statements.some(s=>String(s.sql||s.source||s.query||'').includes('territory_network_rounds'))){injected=true;return batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('FAIL_FORMATION',0)")]);}return batch(statements);};
    // PostgreSQL prepared statements expose sql as well as SQLite's fixture.
    await assert.rejects(f.form());assert.equal(injected,true);assert.equal((await f.round()).status,'RECRUITING');
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_network_nodes').first()).n),0);
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM territory_war_v3_users WHERE status='ACTIVE'").first()).n),0);
    f.env.DB.batch=batch;await f.form();
    await assert.rejects(mutateNetworkRecruitment(f.env,await f.round(),f.p('DELETE FROM territory_war_v3_users WHERE user_id=1')));
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users').first()).n),52);
  });
  test(`${dialect}: real attack selects a northern node, charges once, and rejects an inaccessible home without spending`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();const front=await networkFront(f.env,await f.round(),{nodeIndex:2}),central=await networkFront(f.env,await f.round(),{nodeIndex:4});
    const mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' ORDER BY user_id LIMIT 1").first(),user={id:Number(mine.user_id),nickname:'개인 참가자'},cards=['a','b','c','d','e'].map(id=>({id,power:2000,breakthrough_level:0}));
    const deps={loadPetBattleSnapshot:async()=>null,releasedMercenarySnapshot:async()=>null,json:(data,status=200)=>({data,status}),battleSettings:async()=>({}),pvpDeckSnapshotByIds:async()=>cards,pvpDeckSnapshot:async()=>cards,cardBattlePower:card=>card.power,createPvpBattleV2:()=>({teams:{A:{summary:{power:10000}},B:{summary:{power:10000}}},result:{winner:'A'},timeline:[]})};
    const body={requestId:'NETWORK:ATTACK:001',frontId:front.id,objective:'SIEGE'},first=await T.handleAttack(f.env,deps,user,f.cfg,body);
    assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(Number(first.data.result.nodeIndex),2);assert.equal(first.data.state.network.selectedIndex,2);
    const after=await f.p('SELECT * FROM territory_war_v3_users WHERE user_id=?',user.id).first();assert.equal(Number(after.energy),Number(mine.energy)-1);assert.equal(Number(after.attacks),1);
    assert.ok(Number((await networkFront(f.env,await f.round(),{nodeIndex:2})).b_hp)<Number(front.b_hp));assert.deepEqual(await networkFront(f.env,await f.round(),{nodeIndex:4}),central);
    const replay=await T.handleAttack(f.env,deps,user,f.cfg,body);assert.equal(replay.data.replayed,true);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),100);
    const home=await networkFront(f.env,await f.round(),{nodeIndex:8}),blocked=await T.handleAttack(f.env,deps,user,f.cfg,{...body,frontId:home.id,requestId:'NETWORK:BLOCKED:001'});assert.equal(blocked.status,409);
    assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',user.id).first()).energy),Number(after.energy));assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),100);
    const batch=f.env.DB.batch.bind(f.env.DB);let injected=false;f.env.DB.batch=statements=>{if(!injected&&statements.some(stmt=>String(stmt.sql||stmt.source||'').includes('UPDATE users SET coin'))){injected=true;return batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('FAIL_ATTACK',0)")]);}return batch(statements);};
    const failed=await T.handleAttack(f.env,deps,user,f.cfg,{...body,requestId:'NETWORK:FAILED:001'});assert.equal(failed.status,409);assert.equal(injected,true);f.env.DB.batch=batch;
    assert.equal(Number((await f.p('SELECT energy FROM territory_war_v3_users WHERE user_id=?',user.id).first()).energy),Number(after.energy));assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),100);
    await f.p('UPDATE territory_war_v3_fronts SET b_hp=1 WHERE id=?',front.id).run();const capture=await T.handleAttack(f.env,deps,user,f.cfg,{...body,requestId:'NETWORK:CAPTURE:001'});assert.equal(capture.status,200,JSON.stringify(capture.data));
    assert.equal((await networkView(f.env,await f.round(),'A',2)).nodes[2].owner,'A');assert.notEqual(Number(capture.data.state.front.id),Number(front.id));assert.equal(Number(capture.data.state.front.node_index),2);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user.id).first()).coin),200);

  });
  test(`${dialect}: tied territory uses damage; frozen settlement survives reward failure and never awards clan season points`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();await f.p('UPDATE territory_war_v3_users SET attacks=60').run();
    await f.p('UPDATE territory_war_v3_rounds SET a_total_damage=100,b_total_damage=200').run();
    const batch=f.env.DB.batch.bind(f.env.DB),prepare=f.env.DB.prepare.bind(f.env.DB);let injected=false;
    if(postgres)f.env.DB.prepare=sql=>{const stmt=prepare(sql);if(!injected&&sql.startsWith('INSERT INTO territory_war_v3_rewards')){injected=true;stmt.bind=()=>({run:async()=>{throw new Error('reward connection interrupted');}});}return stmt;};
    else f.env.DB.batch=statements=>{if(!injected&&statements.some(s=>String(s.sql||'').startsWith('INSERT INTO territory_war_v3_rewards'))){injected=true;throw new Error('reward connection interrupted');}return batch(statements);};
    await assert.rejects(T.settleRound(f.env,await f.round(),f.cfg));assert.equal(injected,true);assert.equal((await f.round()).settled_at,null);assert.equal(await networkWinner(f.env,await f.round()),'B');
    const front=await networkFront(f.env,await f.round(),{nodeIndex:2}),mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' LIMIT 1").first();
    await assert.rejects(batch(networkActionGuards(f.env,{round:await f.round(),front,mine,requestId:'FROZEN'})));
    f.env.DB.batch=batch;f.env.DB.prepare=prepare;await T.settleRound(f.env,await f.round(),f.cfg);assert.equal((await f.round()).winner_side,'B');assert.equal((await f.round()).status,'FINISHED');
    const rewards=(await f.p('SELECT * FROM territory_war_v3_rewards').all()).results;assert.equal(rewards.length,52);assert.ok(rewards.every(r=>r.result===(r.side==='B'?'WIN':'LOSE')));
    await T.settleRound(f.env,await f.round(),f.cfg);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_rewards').first()).n),52);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_clans').first()).n),0);
  });
  test(`${dialect}: a true tie settles as DRAW`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();await T.settleRound(f.env,await f.round(),f.cfg);assert.equal((await f.round()).winner_side,'DRAW');
  });

  test(`${dialect}: CMS assault applies to the selected node and refuses inaccessible or replaced fronts`,async t=>{
    const f=await territoryNetworkFixture(t,postgres);await f.form();const front=await networkFront(f.env,await f.round(),{nodeIndex:2}),center=await networkFront(f.env,await f.round(),{nodeIndex:4}),deps={json:(data,status=200)=>({data,status})},user={id:1,role:'OWNER'};
    const home=await networkFront(f.env,await f.round(),{nodeIndex:8}),blocked=await T.executeMassAssault(f.env,deps,user,f.cfg,'CMS:BLOCKED:001','A',8,home.id);assert.equal(blocked.status,409);
    const stale=await T.executeMassAssault(f.env,deps,user,f.cfg,'CMS:STALE:001','A',2,9999);assert.equal(stale.status,409);
    const applied=await T.executeMassAssault(f.env,deps,user,f.cfg,'CMS:ASSAULT:001','A',2,front.id);assert.equal(applied.status,200,JSON.stringify(applied.data));assert.equal(Number(applied.data.massAssault.frontId),Number(front.id));assert.equal(applied.data.state.network.selectedIndex,2);
    assert.ok(Number((await networkFront(f.env,await f.round(),{nodeIndex:2})).b_hp)<Number(front.b_hp));assert.deepEqual(await networkFront(f.env,await f.round(),{nodeIndex:4}),center);
    const duplicate=await T.executeMassAssault(f.env,deps,user,f.cfg,'CMS:ASSAULT:002','A',4,center.id);assert.equal(duplicate.status,409);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_mass_assault_uses').first()).n),1);
  });

}

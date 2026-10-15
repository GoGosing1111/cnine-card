import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {networkFront} from '../functions/_territory_network_v6.js';

const rawGuard='new row for relation "territory_war_mutation_guards" violates check constraint "territory_war_mutation_guards_ok_check"';
const sqlOf=statement=>String(statement.sql||statement.source||'');
const statusRequest=id=>new Request('https://example.test/api/territory-war/action-status?requestId='+encodeURIComponent(id));
async function fixture(t,postgres){
  const f=await territoryNetworkFixture(t,postgres,{participants:4});await f.form();
  const mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' ORDER BY user_id LIMIT 1").first();
  const user={id:Number(mine.user_id),nickname:'경합 검사'},front=await networkFront(f.env,await f.round(),{nodeIndex:2});
  const cards=['a','b','c','d','e'].map(id=>({id,power:2000,breakthrough_level:0}));
  let simulations=0;
  const deps={loadPetBattleSnapshot:async()=>null,releasedMercenarySnapshot:async()=>null,json:(data,status=200)=>({data,status}),battleSettings:async()=>({}),pvpDeckSnapshotByIds:async()=>cards,pvpDeckSnapshot:async()=>cards,cardBattlePower:card=>card.power,createPvpBattleV2:()=>{simulations++;return {teams:{A:{summary:{power:10000}},B:{summary:{power:10000}}},result:{winner:'A'},timeline:[]};}};
  const snapshot=async()=>{
    const m=await f.p('SELECT energy,attacks,damage FROM territory_war_v3_users WHERE user_id=?',user.id).first(),u=await f.p('SELECT coin FROM users WHERE id=?',user.id).first();
    const counts=await Promise.all(['coin_logs','territory_battlefield_contributions','territory_war_mutation_guards'].map(table=>f.p('SELECT COUNT(*) n FROM '+table).first()));
    return {...Object.fromEntries(Object.entries(m).map(([k,v])=>[k,Number(v)])),coin:Number(u.coin),counts:counts.map(r=>Number(r.n))};
  };
  return {...f,mine,user,front,deps,snapshot,simulations:()=>simulations,attack:(requestId,extra={})=>T.handleAttack(f.env,deps,user,f.cfg,{requestId,frontId:front.id,objective:'SIEGE',...extra}),status:id=>T.handleActionStatus(f.env,deps,user,f.cfg,statusRequest(id))};
}
function conflict(response){
  assert.equal(response.status,409,JSON.stringify(response));
  assert.equal(response.data.code,'TERRITORY_STATE_CHANGED');assert.equal(response.data.refreshState,true);
  assert.equal(response.data.retryable,false);assert.equal(response.data.failed,true);
  assert.match(response.data.error,/전황.*행동력.*반영되지/);assert.doesNotMatch(response.data.error,/constraint|territory_war_mutation_guards|SQLITE/i);
}
for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(`${dialect}: inaccessible network fronts fail before deck loading or combat and failed keys stay terminal`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),home=await networkFront(f.env,await f.round(),{nodeIndex:8});
    f.deps.battleSettings=async()=>{throw Error('Inaccessible attacks must not load a deck');};
    conflict(await f.attack('CONFLICT:PRECHECK:001',{frontId:home.id}));assert.equal(f.simulations(),0);assert.deepEqual(await f.snapshot(),before);
    await f.p('UPDATE territory_network_nodes SET a_access=1 WHERE front_id=?',home.id).run();
    conflict(await f.attack('CONFLICT:PRECHECK:001',{frontId:home.id}));assert.equal(f.simulations(),0);assert.deepEqual(await f.snapshot(),before);
    conflict(await f.status('CONFLICT:PRECHECK:001'));
  });
  for(const mutation of ['capture','access','round-end','supply-capture'])test(`${dialect}: ${mutation} during combat retains the transaction guard and never spends`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
    f.env.DB.batch=async statements=>{
      if(!injected&&statements.some(s=>sqlOf(s).includes('UPDATE users SET coin'))){
        injected=true;assert.equal(f.simulations(),1,'race follows battle calculation');
        if(mutation==='capture'){
          await f.p("UPDATE territory_war_v3_fronts SET status='RESOLVED',winner_side='A',b_hp=0 WHERE id=?",f.front.id).run();
          await T.resolveFront(f.env,await f.round(),f.front,f.cfg);
        }else if(mutation==='access')await f.p('UPDATE territory_network_nodes SET a_access=0 WHERE front_id=?',f.front.id).run();
        else if(mutation==='round-end')await f.p("UPDATE territory_war_v3_rounds SET ends_at='2000-01-01 00:00:00' WHERE id=1").run();
        else await f.p("UPDATE territory_battlefield_trains SET winner_side='B' WHERE front_id=?",f.front.id).run();
      }
      return batch(statements);
    };
    const id='CONFLICT:RACE:'+mutation,extra=mutation==='supply-capture'?{objective:'SUPPLY',supplyCycle:1}:{};
    conflict(await f.attack(id,extra));assert.equal(injected,true);assert.deepEqual(await f.snapshot(),before);
    conflict(await f.status(id));conflict(await f.attack(id,extra));assert.equal(f.simulations(),1);assert.deepEqual(await f.snapshot(),before);
    const action=await f.p('SELECT status,error_message FROM territory_war_v3_actions WHERE request_id=?',id).first();assert.equal(action.status,'FAILED');assert.doesNotMatch(action.error_message,/constraint|SQLITE/);
  });
  test(`${dialect}: a failure after personal mutations rolls back energy, reward and contributions`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
    f.env.DB.batch=statements=>{if(!injected&&statements.some(s=>sqlOf(s).includes('UPDATE users SET coin'))){injected=true;return batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('ATOMIC_FAILURE',0)")]);}return batch(statements);};
    conflict(await f.attack('CONFLICT:ROLLBACK:001'));assert.equal(injected,true);assert.deepEqual(await f.snapshot(),before);
    f.env.DB.batch=batch;conflict(await f.attack('CONFLICT:ROLLBACK:001'));assert.deepEqual(await f.snapshot(),before);assert.equal(f.simulations(),1);
  });
  test(`${dialect}: historical guard errors and supply expiry are safe refresh responses; ordinary errors are preserved`,async t=>{
    const f=await fixture(t,postgres);
    const messages=[rawGuard,'CHECK constraint failed: ok=1','D1_ERROR: CHECK constraint failed: ok = 1: SQLITE_CONSTRAINT','이미 보급열차 호위가 완료되었습니다.','이 보급열차의 호위 시간이 종료되었습니다.','현재 전투 가능한 영토전 회차가 아닙니다.','이미 종료된 교전입니다.'];
    for(const [i,message] of messages.entries()){
      const id='CONFLICT:HISTORY:'+i;await f.p("INSERT INTO territory_war_v3_actions(request_id,user_id,status,error_message) VALUES(?,?,'FAILED',?)",id,f.user.id,message).run();
      conflict(await f.status(id));conflict(await f.attack(id));
    }
    await f.p("INSERT INTO territory_war_v3_actions(request_id,user_id,status,error_message) VALUES('CONFLICT:ORDINARY:001',?,'FAILED','행동력이 부족합니다.')",f.user.id).run();
    const ordinary=await f.status('CONFLICT:ORDINARY:001');assert.equal(ordinary.data.error,'행동력이 부족합니다.');assert.equal(ordinary.data.code,undefined);
    assert.equal(f.simulations(),0);
    conflict(await f.attack('CONFLICT:EXPIRED:001',{objective:'SUPPLY',supplyCycle:999}));
    assert.equal(Number((await f.p('SELECT attacks FROM territory_war_v3_users WHERE user_id=?',f.user.id).first()).attacks),0);
  });
  test(`${dialect}: APPLIED capture returns its successful receipt even while resolution is blocked, then recovers exactly once`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),batch=f.env.DB.batch.bind(f.env.DB);
    await f.p('UPDATE territory_war_v3_fronts SET b_hp=1 WHERE id=?',f.front.id).run();
    let resolutionFailures=0;
    f.env.DB.batch=statements=>{
      if(statements.some(s=>sqlOf(s).includes('m.revision=?'))){resolutionFailures++;return batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('RESOLUTION_FAILURE',0)")]);}
      return batch(statements);
    };
    const id='CONFLICT:APPLIED:001',first=await f.attack(id);
    assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.ok,true);assert.equal(first.data.result.damage,1);assert.ok(resolutionFailures>0);
    assert.equal(first.data.reconciliationPending,true);assert.equal(first.data.refreshState,true);assert.equal(first.data.error,undefined);
    assert.equal((await f.p('SELECT status FROM territory_war_v3_actions WHERE request_id=?',id).first()).status,'APPLIED');
    const after=await f.snapshot();assert.equal(after.energy,before.energy-1);assert.equal(after.attacks,before.attacks+1);assert.equal(after.coin,before.coin+100);assert.deepEqual(after.counts,[1,1,0]);
    const replay=await f.attack(id);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.result.damage,1);assert.deepEqual(await f.snapshot(),after);
    f.env.DB.batch=batch;
    const recovered=await f.status(id);assert.equal(recovered.status,200);assert.equal(recovered.data.result.damage,1);
    assert.equal((await f.p('SELECT status FROM territory_war_v3_actions WHERE request_id=?',id).first()).status,'COMPLETED');
    assert.notEqual(Number((await networkFront(f.env,await f.round(),{nodeIndex:2})).id),Number(f.front.id));assert.deepEqual(await f.snapshot(),after);
    const completed=await f.attack(id);assert.equal(completed.status,200);assert.equal(completed.data.replayed,true);assert.deepEqual(await f.snapshot(),after);
  });
  test(`${dialect}: COMPLETED receipt stays successful when the following state read fails`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),prepare=f.env.DB.prepare.bind(f.env.DB),id='CONFLICT:COMPLETED:001';let readFailures=0;
    f.env.DB.prepare=sql=>{
      const statement=prepare(sql);
      if(sql==='SELECT * FROM territory_war_v3_rounds ORDER BY id DESC LIMIT 1'){
        const first=statement.first.bind(statement);
        statement.first=async()=>{
          const action=await prepare('SELECT status FROM territory_war_v3_actions WHERE request_id=?').bind(id).first();
          if(action?.status==='COMPLETED'){readFailures++;throw Object.assign(new Error(rawGuard),{constraint:'territory_war_mutation_guards_ok_check'});}
          return first();
        };
      }
      return statement;
    };
    const first=await f.attack(id);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.ok,true);
    assert.equal(first.data.reconciliationPending,true);assert.equal(first.data.refreshState,true);assert.equal(first.data.state,undefined);assert.equal(first.data.coinAfter,100);assert.equal(first.data.error,undefined);assert.ok(readFailures>=2);
    const after=await f.snapshot();assert.equal(after.energy,before.energy-1);assert.equal(after.attacks,before.attacks+1);assert.equal(after.coin,before.coin+100);assert.deepEqual(after.counts,[1,1,0]);
    assert.equal((await f.p('SELECT status FROM territory_war_v3_actions WHERE request_id=?',id).first()).status,'COMPLETED');
    for(const response of [await f.attack(id),await f.status(id)]){assert.equal(response.status,200);assert.equal(response.data.replayed,true);assert.equal(response.data.result.damage,first.data.result.damage);assert.equal(response.data.error,undefined);}
    assert.deepEqual(await f.snapshot(),after);
    f.env.DB.prepare=prepare;const refreshed=await f.status(id);assert.equal(refreshed.status,200);assert.ok(refreshed.data.state);assert.deepEqual(await f.snapshot(),after);
  });

}

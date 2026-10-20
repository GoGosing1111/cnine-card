import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {contentEnergyView,CONTENT_ENERGY_RECHARGE_MS as H} from '../shared/content-energy-v1.mjs';
import {legionHuntEnergyView,legionHuntEnergyText} from '../shared/legion-hunt-energy-v1.mjs';
import {legionHuntEnergy,legionHuntEntries} from '../functions/_legion_hunt.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {emptySupport,supportKey} from '../shared/server-support-v1.mjs';

const midnight=Date.parse('2026-10-22T00:00:00+09:00');
const player={id:2,role:'USER'},owner={id:1,role:'OWNER'};
const support={active:true,startsAt:midnight-86400000,endsAt:midnight+86400000};
const balance=(current,updatedAt,maximum=10)=>({version:1,current,updatedAt,maximum});

test('Korean midnight fills legion energy to 10 or supporter 13, independently of three-hour recharge',()=>{
  const run={energy:balance(0,midnight-60000)};
  assert.equal(legionHuntEnergy(run,midnight-1).current,0);
  assert.equal(legionHuntEnergy(run,midnight).current,10);
  assert.equal(legionHuntEnergy(run,midnight,support).current,13);
  assert.equal(legionHuntEnergy(run,midnight,{...support,endsAt:midnight}).current,10);
  assert.equal(legionHuntEntries(run,midnight,owner,support).unlimited,true);
  assert.equal(legionHuntEntries(run,midnight,owner,support).current,13,'OWNER coin energy also refills');
  assert.equal(contentEnergyView(run.energy,{at:midnight,maximum:3}).current,0,'cooperative energy keeps its existing continuous policy');
});

test('same-day spending recharges after three hours; a full daily refill cannot bank old elapsed time',()=>{
  const full=legionHuntEnergy({energy:balance(0,midnight-2*86400000)},midnight+5*H,support);
  assert.equal(full.current,13);
  const spent={energy:{...full,current:12}};
  assert.equal(legionHuntEnergy(spent,full.updatedAt+H-1,support).current,12);
  assert.equal(legionHuntEnergy(spent,full.updatedAt+H,support).current,13);
  assert.equal(legionHuntEnergy(spent,midnight+10*86400000).current,10,'offline days refill once up to the current capacity');
  const exhausted={energy:balance(0,midnight+1000)};
  assert.equal(legionHuntEnergy(exhausted,midnight+1000+H-1).current,0);
  assert.equal(legionHuntEnergy(exhausted,midnight+1000+H).current,1);
  assert.equal(legionHuntEnergy(exhausted,midnight+1000+7*H).current,7);
  assert.equal(legionHuntEnergy({energy:balance(0,midnight+1000)},midnight-1).current,0,'a backward clock never grants another refill');
});

test('daily reset still rejects corrupt balances and preserves same-day legacy usage',()=>{
  assert.throws(()=>legionHuntEnergy({energy:balance(-1,midnight-1)},midnight));
  const run={daily:{day:'2026-10-22',used:4}};
  assert.equal(legionHuntEnergy(run,midnight).current,6);
  assert.equal(legionHuntEnergy(run,midnight,support).current,9);
});

test('an open lobby enables entry at Korean midnight without refresh and respects fractional clock boundaries',async()=>{
  const old=balance(0,midnight-60000,13);
  assert.equal(legionHuntEnergyView(old,{at:midnight-0.1,maximum:13}).current,0);
  assert.equal(legionHuntEnergyView(old,{at:midnight+0.1,maximum:13}).current,13);
  assert.match(legionHuntEnergyText(old,midnight),/행동력 13 \/ 13.*3시간마다 1회.*매일 0시 최대 회복/);
  const source=fs.readFileSync('js/legion-hunt-entry-v1.mjs','utf8');
  let now=midnight-1000;const entered=[];
  const options={request:async()=>({difficulties:[{id:'normal'}],loadout:{},entries:{...old,remaining:0,limit:13,serverNow:now}}),render(){},enter:id=>entered.push(id),dispose(){}};
  const controller=vm.runInNewContext(source.slice(source.indexOf('export function createHuntEntry'),source.indexOf('let active=null;')).replace('export function','function')+';createHuntEntry(options)',{options,Date:{now:()=>now},legionHuntEnergyView});
  await controller.refresh();controller.enter();assert.equal(entered.length,0);
  now=midnight;assert.equal(controller.energy().current,13);
  controller.enter();controller.enter();assert.deepEqual(entered,['normal']);
});

const key='legion_hunt_owner_session_v1:2';
const put=(f,run)=>f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(run)).run();
const read=async f=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value);
async function fixture(postgres){
  const f=await legionFixture({postgres});
  const cfg=(await f.call('admin/legion-hunt')).body.policy;cfg.mode='ON';
  assert.equal((await f.call('admin/legion-hunt',{policy:cfg},{method:'PATCH'})).status,200);
  f.deps.createSession=options=>Object.assign(restoreHuntSession({
    id:crypto.randomUUID(),policy:{id:'normal',...options.dropPolicy},timeLimit:1000,eventTimes:[100],
    timeline:[{seq:1,combatAtMs:100,type:'RESULT',winner:'B'}],outcome:{winner:'B'}
  },{now:options.now}),{payload:{}});
  f.setUser(f.player);
  await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(supportKey(2),JSON.stringify({...emptySupport(),revision:1,startsAt:support.startsAt,endsAt:support.endsAt})).run();
  return f;
}

for(const postgres of [false,true]){
  const engine=postgres?'PostgreSQL':'SQLite';
  test(`${engine}: depleted account starts with 13 at midnight, charges once, persists after a lost reply, and refills in three hours`,async t=>{
    const f=await fixture(postgres);t.after(()=>f.close());
    await put(f,{energy:balance(0,midnight-60000,13)});
    f.clock.now=midnight-1;
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).body.code,'HUNT_ENERGY_EMPTY');
    f.clock.now=midnight;
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,13);
    const start=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(start.status,200,JSON.stringify(start.body));
    const id=start.body.id;
    f.fail('UPDATE app_meta');
    assert.equal((await f.call('legion-hunt/begin',{id})).status,503);
    assert.equal((await read(f)).energy.current,13,'failed debit cannot persist');
    f.fail('');f.loseReply();
    assert.equal((await f.call('legion-hunt/begin',{id})).status,503);
    assert.equal((await read(f)).energy.current,12,'successful debit survives a lost response');
    assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.current,12);
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,12,'reopening does not refill again');
    f.clock.now+=101;
    assert.equal((await f.call('legion-hunt/finish',{id,seq:1})).status,200);
    f.clock.now=midnight+H-1;
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,12);
    f.clock.now=midnight+H;
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,13);
  });
  test(`${engine}: pre-midnight interrupted entry cannot refund above the new day capacity or refund twice`,async t=>{
    const f=await fixture(postgres);t.after(()=>f.close());f.clock.now=midnight-1000;
    await put(f,{energy:balance(1,midnight-60000,13)});
    const start=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(start.status,200);
    const id=start.body.id;
    assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.current,0);
    f.clock.now=midnight;
    const recovered=await f.call('legion-hunt/recover',{});
    assert.equal(recovered.body.entries.current,13);assert.equal(recovered.body.recovery.refunded,true);
    assert.equal((await f.call('legion-hunt/recover',{})).body.entries.current,13);
    assert.equal((await f.call('legion-hunt/cancel',{id})).body.entries.current,13);
    const next=await f.call('legion-hunt/start',{difficulty:'normal'});
    assert.equal((await f.call('legion-hunt/begin',{id:next.body.id})).body.entries.current,12);
    assert.equal((await f.call('legion-hunt/cancel',{id:next.body.id})).body.entries.current,13);
  });
}

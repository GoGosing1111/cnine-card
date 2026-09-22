import test from 'node:test';
import assert from 'node:assert/strict';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {mutateFaction,factionOverview,handleClanFaction} from '../functions/_clan_faction.js';
import {factionStrikeDamage,splitFactionTax,newFactionState,accrueFactionTax,upgradeFactionCooldowns,finishFactionBattle,advanceFactionState} from '../functions/_clan_faction_model.js';
import {FACTION_RULES as R,FACTION_TAX_CHANGE,FACTION_TAX_CHANGES} from '../shared/clan-faction-rules-v1.mjs';
const call=(f,kind,body={},user=f.user)=>mutateFaction(f.env,f.season,user,kind,{requestId:crypto.randomUUID(),...body},f.deps);
const formation={attack1:[1,2,3],attack2:[4,5],defense1:[6,7,8],defense2:[9,10]};

test('20260922 cooldown cutover is once-only, preserves pause extensions and leaves other state intact',()=>{
  const at=Date.parse('2026-09-22T10:00:00+09:00'),minute=60000,s=newFactionState(at);
  delete s.cooldownVersion;
  Object.assign(s.districts[0],{owner:1,protectedUntil:at+120*minute+45*minute,defense:'defense1'});
  s.districts[1].protectedUntil=at-120*minute;
  s.targetReady={'1:11110':at+30*minute+45*minute,'2:11110':at-minute,'3:11110':0};
  s.squadReady={'1:attack1':at+10*minute};s.strikeReady={1:at+minute};
  s.formations={1:formation};s.pools={1:123};s.captains={1:{attack1:2}};
  s.battles=[{id:'historic',status:'COMPLETED',endedAt:at-minute}];
  const before=structuredClone(s);
  upgradeFactionCooldowns(s);
  assert.equal(s.cooldownVersion,2);
  assert.equal(s.districts[0].protectedUntil,at+20*minute+45*minute);
  assert.equal(s.targetReady['1:11110'],at+15*minute+45*minute);
  assert.ok(s.districts[1].protectedUntil<at&&s.targetReady['2:11110']<at,'expired timers never revive');
  assert.equal(s.districts[2].protectedUntil,0);assert.equal(s.targetReady['3:11110'],0);
  for(const key of ['squadReady','strikeReady','formations','pools','captains','battles'])assert.deepEqual(s[key],before[key],key);
  assert.equal(s.districts[0].owner,1);assert.equal(s.districts[0].defense,'defense1');
  const upgraded=structuredClone(s);
  for(let i=0;i<5;i++)upgradeFactionCooldowns(s);
  assert.deepEqual(s,upgraded);
  const fresh=newFactionState(at);fresh.districts[0].protectedUntil=at+20*minute;fresh.targetReady={'1:11110':at+15*minute};
  const unchanged=structuredClone(fresh);upgradeFactionCooldowns(fresh);assert.deepEqual(fresh,unchanged);
});

test('capture, defeat and timeout assign 20/15 minute rules without changing 10 minute redeployment',()=>{
  const at=Date.now(),minute=60000;
  for(const outcome of ['CAPTURE','UNDEFENDED','DEFENDED','TIMEOUT']){
    const s=newFactionState(at);delete s.cooldownVersion;
    const district=s.districts[0];district.owner=2;
    const battle={id:outcome,districtId:district.id,attacker:1,defender:2,squad:'attack1',status:'ACTIVE',endsAt:at};s.battles=[battle];
    const captured=outcome==='CAPTURE'||outcome==='UNDEFENDED';
    if(outcome==='TIMEOUT')advanceFactionState(s,at,at+86400000);
    else finishFactionBattle(s,battle,captured?1:2,outcome,at);
    assert.equal(s.squadReady['1:attack1'],at+10*minute);
    assert.equal(s.targetReady[`1:${district.id}`],at+15*minute);
    assert.equal(district.protectedUntil,captured?at+20*minute:0);
    const snapshot=structuredClone(s);finishFactionBattle(s,battle,1,outcome,at+minute);assert.deepEqual(s,snapshot);
  }
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} faction attack boundaries are exactly 20 minutes protection and 15 minutes same-target cooldown`,async t=>{
  const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
  const minute=60000,capturedAt=f.clock.now;
  const neutral=(await factionOverview(f.env,f.season,f.user,f.deps)).districts.find(d=>!d.owner).id;
  assert.equal((await call(f,'launch',{districtId:neutral,squad:'attack2'})).captured,true);
  const t1=await f.p('SELECT * FROM users WHERE id=101').first();
  f.clock.now=capturedAt+20*minute-1;
  await assert.rejects(call(f,'launch',{districtId:neutral,squad:'attack2'},t1),/점령 보호/);
  f.clock.now++;
  assert.equal((await call(f,'launch',{districtId:neutral,squad:'attack2'},t1)).captured,true);
  const attack=await call(f,'launch',{districtId:'11680',squad:'attack1'});
  f.clock.now+=R.battleDurationMs;
  const ended=await factionOverview(f.env,f.season,f.user,f.deps);
  assert.equal(ended.battles.find(b=>b.id===attack.battleId).reason,'TIMEOUT');
  assert.equal(ended.rules.protectionMs,20*minute);assert.equal(ended.rules.targetCooldownMs,15*minute);
  assert.equal(ended.rules.squadCooldownMs,10*minute);assert.equal(ended.rules.battleDurationMs,30*minute);
  f.clock.now+=15*minute-1;
  await assert.rejects(call(f,'launch',{districtId:'11680',squad:'attack1'}),/같은 지역/);
  f.clock.now++;
  assert.ok((await call(f,'launch',{districtId:'11680',squad:'attack1'})).battleId);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} old persisted deadlines shorten on overview and mutation and are not shortened again on retry`,async t=>{
  const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
  const minute=60000,at=f.clock.now;
  const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),s=JSON.parse(row.state_json);
  delete s.cooldownVersion;
  Object.assign(s.districts.find(d=>d.id==='11680'),{protectedUntil:at+100*minute}); // captured 20 minutes ago
  s.targetReady['1:11680']=at+15*minute; // last attack ended 15 minutes ago
  await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(s)).run();
  const view=await factionOverview(f.env,f.season,f.user,f.deps);
  assert.equal(view.districts.find(d=>d.id==='11680').protectedUntil,at);
  assert.equal(view.targetReady['11680'],at);
  const request={requestId:'cooldown-cutover-launch',districtId:'11680',squad:'attack1'};
  const battle=await call(f,'launch',request);assert.ok(battle.battleId);
  const persisted=(await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json;
  assert.equal(JSON.parse(persisted).cooldownVersion,2);
  assert.equal((await call(f,'launch',request)).replayed,true);
  assert.equal((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json,persisted);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} ACTIVE faction season opens before the first regular match`,async t=>{
  const f=await factionFixture({postgres});t.after(()=>f.close());
  f.season.starts_at=new Date(f.clock.now+7200000).toISOString();
  await f.p('UPDATE clan_seasons SET starts_at=? WHERE id=?',f.season.starts_at,f.season.id).run();
  assert.equal((await factionOverview(f.env,f.season,f.user,f.deps)).season.active,true);
  await call(f,'formation',{formation});
  assert.equal((await call(f,'launch',{districtId:'11680',squad:'attack1'})).captured,true);
  f.season.phase='DRAFT';await f.p("UPDATE clan_seasons SET phase='DRAFT' WHERE id=?",f.season.id).run();
  assert.equal((await factionOverview(f.env,f.season,f.user,f.deps)).season.active,false);
  await assert.rejects(call(f,'launch',{districtId:'11710',squad:'attack2'}),/시즌/);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} faction state, authority, HP, tax and retry invariants`,async t=>{
  const f=await factionFixture({postgres});t.after(()=>f.close());
  const before=await f.p('SELECT * FROM clan_season_teams ORDER BY clan_id').all();
  const other=await f.p('SELECT * FROM users WHERE id=2').first();
  await assert.rejects(call(f,'formation',{formation},other),/클랜장/);
  await assert.rejects(call(f,'formation',{formation:{...formation,defense2:[1]}}),/하나의 부대/);
  await assert.rejects(call(f,'formation',{formation:{...formation,attack1:[101]}}),/현재 클랜원/);
  await call(f,'formation',{formation});
  const launch={requestId:'neutral-capture-unique',districtId:'11680',squad:'attack1'};
  const captured=await call(f,'launch',launch);assert.equal(captured.captured,true);
  assert.equal((await call(f,'launch',launch)).replayed,true);
  await assert.rejects(call(f,'launch',{...launch,districtId:'11710'}),/다른 작업/);
  await assert.rejects(call(f,'launch',{districtId:'11710',squad:'attack1'}),/재출정/);
  await call(f,'garrison',{districtId:'11680',squad:'defense1'});
  const t1=await f.p('SELECT * FROM users WHERE id=101').first();
  await call(f,'formation',{formation:{attack1:[101,102,103],attack2:[104],defense1:[106,107],defense2:[108]}},t1);
  await assert.rejects(call(f,'launch',{districtId:'11680',squad:'attack1'},t1),/점령 보호/);
  f.clock.now+=R.protectionMs+1;
  const invasion=await call(f,'launch',{districtId:'11680',squad:'attack1'},t1);
  const defender=await f.p('SELECT * FROM users WHERE id=6').first();
  const alerts=await factionOverview(f.env,f.season,defender,f.deps,{alertsOnly:true});assert.equal(alerts.alerts[0].attackerClan,'T1');assert.equal(alerts.alerts[0].attackerName,'T1 지휘관');
  assert.equal((await factionOverview(f.env,f.season,f.user,f.deps,{alertsOnly:true})).alerts.length,0);
  await assert.rejects(call(f,'formation',{formation}),/교전/);
  await assert.rejects(call(f,'strike',{battleId:invasion.battleId},other),/편성된/);
  const strike={requestId:'faction-strike-same-key',battleId:invasion.battleId,damage:999999999};
  await assert.rejects(call(f,'strike',strike,t1),/먼저 입장/);assert.equal(f.buildCalls(),0);
  await call(f,'enter',{battleId:invasion.battleId},t1);
  const hit=await call(f,'strike',strike,t1);assert.equal(hit.damage,150000);assert.equal(hit.defenderHp,850000);assert.equal(f.buildCalls(),1);
  assert.equal((await call(f,'strike',strike,t1)).replayed,true);assert.equal(f.buildCalls(),1);
  await assert.rejects(call(f,'strike',{battleId:invasion.battleId},t1),/다음 교전/);
  for(let i=0;i<6;i++){f.clock.now+=R.strikeCooldownMs;await call(f,'strike',{battleId:invasion.battleId},t1);}
  const won=await factionOverview(f.env,f.season,t1,f.deps);assert.equal(won.districts.find(d=>d.id==='11680').owner,2);assert.equal(won.battles[0].winner,2);
  await assert.rejects(call(f,'strike',{battleId:invasion.battleId},defender),/종료/);
  const claim={requestId:'tax-claim-once-ever'};
  f.setFailure('INSERT INTO clan_faction_wallets');await assert.rejects(call(f,'collect',claim),/INJECTED/);f.setFailure('');
  assert.equal((await f.p('SELECT * FROM clan_faction_receipts WHERE request_key=?','1:'+claim.requestId).all()).results.length,0);
  const paid=await call(f,'collect',claim);assert.ok(paid.total>=2000000);assert.equal(paid.members,12);
  assert.equal((await call(f,'collect',claim)).replayed,true);
  const wallets=(await f.p('SELECT * FROM clan_faction_wallets').all()).results;assert.equal(wallets.reduce((n,w)=>n+Number(w.balance),0),paid.total);
  assert.deepEqual((await f.p('SELECT * FROM clan_season_teams ORDER BY clan_id').all()).results,before.results);
  assert.equal(Number((await f.p('SELECT SUM(coin) amount FROM users').first()).amount),9600);
  await f.p("UPDATE clan_seasons SET phase='COMPLETE' WHERE id=7").run();f.season.phase='COMPLETE';
  await assert.rejects(call(f,'launch',{districtId:'11110',squad:'attack2'}),/시즌/);
});
test('simultaneous launch and finishing hits use compare-and-swap',async t=>{
  const f=await factionFixture({seeded:true});t.after(()=>f.close());
  const a=await Promise.allSettled([call(f,'launch',{districtId:'11680',squad:'attack1'}),call(f,'launch',{districtId:'11680',squad:'attack2'})]);
  assert.equal(a.filter(r=>r.status==='fulfilled').length,1);
  const battle=a.find(r=>r.status==='fulfilled').value;
  const row=await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first(),s=JSON.parse(row.state_json);s.battles[0].defenderHp=100000;
  await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(s)).run();
  const ids=s.battles[0].attackers.slice(0,2),users=await Promise.all(ids.map(id=>f.p('SELECT * FROM users WHERE id=?',id).first()));
  await Promise.all(users.map(u=>call(f,'enter',{battleId:battle.battleId},u)));
  const hits=await Promise.allSettled(users.map(u=>call(f,'strike',{battleId:battle.battleId},u)));
  assert.equal(hits.filter(r=>r.status==='fulfilled').length,1);
  const view=await factionOverview(f.env,f.season,f.user,f.deps);assert.equal(view.events.filter(e=>e.kind==='CAPTURE'&&e.districtId==='11680').length,1);
});
test('claim retry, season cutoff and real V3 normalized HP including mercenaries',async t=>{
  const f=await factionFixture({seeded:true,realBattle:true});t.after(()=>f.close());
  const b=await call(f,'launch',{districtId:'11680',squad:'attack1'});await call(f,'enter',{battleId:b.battleId});const hit=await call(f,'strike',{battleId:b.battleId});
  assert.equal(hit.battleV2.engine,'BATTLE_ENGINE_V2_PVP');assert.equal(hit.battleV2.teams.A.cards.length,5);assert.ok(hit.damage>=0&&hit.damage<=150000);
  const healthy={teams:{B:{cards:[{maxHp:100}],mercenaries:[{maxHp:100}]}},result:{final:{B:[{hp:100}],mercenaries:{B:[{hp:100}]}}}};
  assert.equal(factionStrikeDamage(healthy),0);healthy.result.final.B[0].hp=0;assert.equal(factionStrikeDamage(healthy),75000);
  f.clock.now=Date.parse(f.season.ends_at)+100000;const ended=await factionOverview(f.env,f.season,f.user,f.deps);assert.equal(ended.battles[0].status,'COMPLETED');
  f.clock.now+=86400000;assert.equal((await factionOverview(f.env,f.season,f.user,f.deps)).tax.pool,ended.tax.pool);
  assert.deepEqual(splitFactionTax(10,[3,1,2]),[{userId:1,amount:4},{userId:2,amount:3},{userId:3,amount:3}]);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} ordinary attackers and defenders enter and fight independently`,async t=>{
  const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
  // Commander is deliberately not in the dispatched squad.
  await call(f,'formation',{formation:{...formation,attack1:[2,3]}});
  const b=await call(f,'launch',{districtId:'11680',squad:'attack1'});
  const attacker=await f.p('SELECT * FROM users WHERE id=2').first(),defender=await f.p('SELECT * FROM users WHERE id=106').first();
  for(const [user,side] of [[attacker,'ATTACK'],[defender,'DEFENSE']]){
    const a=await factionOverview(f.env,f.season,user,f.deps,{alertsOnly:true});assert.equal(a.alerts[0].side,side);
    assert.equal((await factionOverview(f.env,f.season,user,f.deps)).alerts[0].side,side);
    await assert.rejects(call(f,'strike',{battleId:b.battleId},user),/먼저 입장/);
  }
  assert.equal((await factionOverview(f.env,f.season,f.user,f.deps,{alertsOnly:true})).alerts.length,0);
  await assert.rejects(call(f,'enter',{battleId:b.battleId},f.user),/편성된/);
  const entry={battleId:b.battleId,requestId:'entry-retry-once'};
  f.setFailure('INSERT INTO clan_faction_receipts');await assert.rejects(call(f,'enter',entry,attacker),/INJECTED/);f.setFailure('');
  assert.deepEqual((await factionOverview(f.env,f.season,attacker,f.deps)).battles[0].entries,{});
  const entered=await call(f,'enter',entry,attacker);assert.equal(entered.side,'ATTACK');
  assert.equal((await call(f,'enter',entry,attacker)).replayed,true);
  f.clock.now+=1000;assert.equal((await call(f,'enter',{battleId:b.battleId},attacker)).enteredAt,entered.enteredAt);
  let view=await factionOverview(f.env,f.season,attacker,f.deps);assert.equal(view.strikeReady,0);assert.equal(view.battles[0].defenderHp,R.sharedHp);
  assert.equal(view.battles[0].entries[3],undefined);assert.equal(f.buildCalls(),0);
  await call(f,'enter',{battleId:b.battleId},defender);
  const hits=await Promise.all([call(f,'strike',{battleId:b.battleId},attacker),call(f,'strike',{battleId:b.battleId},defender)]);
  assert.deepEqual(hits.map(h=>h.side),['ATTACK','DEFENSE']);
  view=await factionOverview(f.env,f.season,attacker,f.deps);
  assert.equal(view.battles[0].attackerHp,850000);assert.equal(view.battles[0].defenderHp,850000);
  assert.equal(view.battles[0].entries[2].hits,1);assert.equal(view.battles[0].entries[106].damage,150000);assert.equal(view.battles[0].entries[3],undefined);
  await f.p('UPDATE clan_members SET clan_id=3 WHERE user_id=2 AND season_id=7').run();
  await assert.rejects(call(f,'enter',{battleId:b.battleId},attacker),/편성된/);
  await assert.rejects(call(f,'strike',{battleId:b.battleId},attacker),/편성된/);
  assert.equal((await factionOverview(f.env,f.season,attacker,f.deps,{alertsOnly:true})).alerts.length,0);
  f.clock.now+=R.battleDurationMs;await assert.rejects(call(f,'enter',{battleId:b.battleId},defender),/종료/);
});

test('one billion hourly district tax preserves both previous rates and exact millisecond remainders',()=>{
  const cut=FACTION_TAX_CHANGE.at,hour=3600000,s=newFactionState(cut-hour);
  s.districts[0].owner=1;s.pools[1]=17;
  accrueFactionTax(s,cut+hour);assert.equal(s.pools[1],51000017);assert.equal(s.districts[0].taxRemainder,0);
  const whole=newFactionState(cut),parts=newFactionState(cut);whole.districts[0].owner=parts.districts[0].owner=1;
  const end=cut+14*86400000+12345;accrueFactionTax(whole,end);
  for(const n of [1,123,100001,86400001,14*86400000,14*86400000+12345])accrueFactionTax(parts,cut+n);
  assert.equal(whole.pools[1],parts.pools[1]);assert.equal(whole.districts[0].taxRemainder,parts.districts[0].taxRemainder);
  const latest=FACTION_TAX_CHANGES.at(-1).at;
  const numerator=BigInt(latest-cut)*50000000n+BigInt(end-latest)*1000000000n;assert.equal(whole.pools[1],Number(numerator/3600000n));assert.equal(whole.districts[0].taxRemainder,Number(numerator%3600000n));
  const old=newFactionState(cut-3*hour);old.districts[0].owner=1;accrueFactionTax(old,cut-hour);assert.equal(old.pools[1],2000000);
  const crossing=newFactionState(latest-hour);crossing.districts[0].owner=1;crossing.pools[1]=17;
  accrueFactionTax(crossing,latest+hour);assert.equal(crossing.pools[1],1050000017);
  const fresh=newFactionState(latest);fresh.districts[0].owner=1;fresh.districts[1].owner=1;fresh.districts[2].owner=2;
  accrueFactionTax(fresh,latest+hour);assert.equal(fresh.pools[1],2000000000);assert.equal(fresh.pools[2],1000000000);
  accrueFactionTax(fresh,latest+hour);assert.equal(fresh.pools[1],2000000000);
});
test('simultaneous identical claim pays once and archived season remains collectable',async t=>{
  const f=await factionFixture({seeded:true});t.after(()=>f.close());
  const body={requestId:'concurrent-tax-same-key'};
  const replies=await Promise.all([call(f,'collect',body),call(f,'collect',body)]);
  assert.equal(replies.filter(r=>r.replayed).length,1);
  assert.equal(Number((await f.p('SELECT SUM(balance) n FROM clan_faction_wallets').first()).n),replies[0].total);
  f.clock.now+=3600000;
  const end=new Date(f.clock.now).toISOString();await f.p("UPDATE clan_seasons SET phase='COMPLETE',ends_at=? WHERE id=7",end).run();
  const current={id:8,season_no:3,phase:'ACTIVE',starts_at:end,ends_at:new Date(f.clock.now+86400000).toISOString()};
  await f.p('INSERT INTO clan_seasons VALUES(?,?,?,?,?)',8,3,'ACTIVE',current.starts_at,current.ends_at).run();
  const fresh=await factionOverview(f.env,current,f.user,f.deps);assert.ok(fresh.tax.pendingSeasons[0].pool>0);
  const response=await handleClanFaction({path:'clan/faction/collect',request:new Request('http://local/api/clan/faction/collect',{method:'POST',body:JSON.stringify({requestId:'archived-tax-claim',seasonId:7})}),env:f.env,user:f.user,season:current,mode:'ON',deps:{...f.deps,readBody:r=>r.json(),json:(d,status=200)=>new Response(JSON.stringify(d),{status})}});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.seasonId,7);
  assert.equal((await factionOverview(f.env,current,f.user,f.deps)).tax.pendingSeasons.length,0);
});

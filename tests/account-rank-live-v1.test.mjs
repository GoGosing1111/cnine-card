import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {accountRankAward,accountRankBenefits,accountRankIdleSettlement,ensureAccountRank,readAccountRank,publicAccountRank,levelFromTicks,MAX_RANK_TICKS,rankCards,rankCoin,settleRankedHunt,handleAccountRank} from '../functions/_account_rank.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {RANKS} from '../shared/account-ranks-v1.mjs';
import {onRequest as docsPrivacy} from '../functions/docs/_middleware.js';
import {onRequest as scriptsPrivacy} from '../functions/scripts/_middleware.js';
import {onRequest as testsPrivacy} from '../functions/tests/_middleware.js';
import {onRequest as previewPrivacy} from '../functions/preview/account-rank-v1/_middleware.js';

test('growth documents and settlement code are private; rank art remains public',async()=>{
  for(const [handler,paths] of [[docsPrivacy,['docs/account-level-rank-proposal-20260916.md','docs/account-rank-live-20260916.md']],[scriptsPrivacy,['scripts/internal/account-rank-growth-v1.mjs']],[testsPrivacy,['tests/account-rank-live-v1.test.mjs']],[previewPrivacy,['preview/account-rank-v1/README.md','preview/account-rank-v1/assets/prompts.json']]]){
    for(const path of paths)assert.equal((await handler({request:new Request('https://local/'+path),next:()=>new Response('asset')})).status,404);
  }
  for(const path of ['','index.html','model.mjs','assets/trainee-v1.png'])assert.equal((await previewPrivacy({request:new Request('https://local/preview/account-rank-v1/'+path),next:()=>new Response('asset')})).status,200);
});

test('all 250 levels have one rank; boundaries, max and defaults are exact',()=>{
  for(let l=1;l<=250;l++){
    const n=l-1,ticks=(2*n*n+62*n)*600;
    assert.equal(levelFromTicks(ticks),l);
    if(l>1)assert.equal(levelFromTicks(ticks-1),l-1);
    assert.equal(RANKS.filter(r=>r.min<=l&&r.max>=l).length,1);
  }
  assert.equal(publicAccountRank().level,1);assert.equal(publicAccountRank(Infinity).level,250);
  assert.equal(publicAccountRank(MAX_RANK_TICKS*2).code,'MARSHAL');
  assert.equal(publicAccountRank(MAX_RANK_TICKS).presetSlots,5);
  for(const k of ['xp','totalXp','nextXp','ticks','sources','growth'])assert.equal(k in publicAccountRank(100000),false);
});

test('combat applies attack/HP separately, preserves defense/speed and completely excludes PVP',()=>{
  const card={id:'1',power:100000,power_type:'ATTACK'};
  const [buffed]=rankCards([card],{attackBp:1000,hpBp:1500});
  const base=buildFighter(card,0,'A',null,'PVE'),rank=buildFighter(buffed,0,'A',null,'PVE');
  assert.equal(rank.attack,Math.round(base.attack*1.1));assert.equal(rank.maxHp,Math.round(base.maxHp*1.15));
  assert.equal(rank.defense,base.defense);assert.equal(rank.speed,base.speed);
  assert.deepEqual(buildFighter(buffed,0,'A',null,'PVP'),buildFighter(card,0,'A',null,'PVP'));
  assert.deepEqual(buildFighter(buffed,0,'B',null,'PVE'),buildFighter(card,0,'B',null,'PVE'));
});

for(const postgres of [false,true]){
  const label=postgres?'PostgreSQL':'SQLite';
  test(`${label}: Lv.1 baseline, every source payout, replay, failed transaction and cap`,async t=>{
    const f=await jointFixture(t,{postgres});await ensureAccountRank(f.env);
    assert.equal((await readAccountRank(f.env,7)).level,1);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM account_rank_progress_v1').first()).n),0,'reads do not create account progress');
    const sources={HUNT:8,APOCALYPSE:24,RAID:20,ESCORT:30,SIEGE:120,SEAL:160,TOWER:10,SCRAPYARD:20,COW_ROOM:30,RIFT:30};
    let expected=0;
    for(const [source,xp] of Object.entries(sources)){
      await f.env.DB.batch(await accountRankAward(f.env,7,source,'one'));expected+=xp*600;
      await f.env.DB.batch(await accountRankAward(f.env,7,source,'one'));
      assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),expected);
    }
    const writes=await accountRankAward(f.env,7,'SEAL','rollback');f.fail('UPDATE account_rank_progress_v1');
    await assert.rejects(()=>f.env.DB.batch(writes));f.fail('');
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM account_rank_receipts_v1 WHERE event_id='rollback'").first()).n),0);
    await f.env.DB.batch(await accountRankAward(f.env,7,'HUNT','invalid-settlement',{guard:'1=0'}));
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM account_rank_receipts_v1 WHERE event_id='invalid-settlement'").first()).n),0);
    await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=7',MAX_RANK_TICKS-1).run();
    await f.env.DB.batch(await accountRankAward(f.env,7,'SEAL','max'));
    assert.equal((await readAccountRank(f.env,7)).level,250);
    for(const scope of ['PVP','RAID','SEAL','SIEGE','TOWER','CLAN','TERRITORY','unknown'])assert.deepEqual(await accountRankBenefits(f.env,7,scope),{attackBp:0,hpBp:0,coinBp:0});
    assert.equal(rankCoin(10000,await accountRankBenefits(f.env,7,'HUNT')),10500);
    assert.equal((await readAccountRank(f.env,8)).level,1,'another account is isolated');
    await assert.rejects(()=>accountRankAward(f.env,7,'PVP','bad'));
  });
  test(`${label}: hunt coin and XP are atomic and replay-safe`,async t=>{
    const f=await jointFixture(t,{postgres}),before=await f.coin();
    await settleRankedHunt(f.env,7,'HUNT','hunt-one',100,'QA');
    await settleRankedHunt(f.env,7,'HUNT','hunt-one',100,'QA');
    assert.equal(await f.coin(),before+100);
    f.fail('INSERT INTO coin_logs');await assert.rejects(()=>settleRankedHunt(f.env,7,'HUNT','hunt-fail',100,'QA'));f.fail('');
    assert.equal(await f.coin(),before+100);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM account_rank_receipts_v1').first()).n),1);
  });
  test(`${label}: idle ignores historical time, awards settled seconds once and preserves partial XP`,async t=>{
    const f=await jointFixture(t,{postgres}),now=Date.parse('2026-09-16T00:00:00Z');
    await f.p('INSERT INTO idle_dungeon_progress(user_id,run_started_at,last_settled_at) VALUES(?,?,?)',7,new Date(now-3600000).toISOString(),new Date(now).toISOString()).run();
    const row={version:0,run_started_at:new Date(now-3600000).toISOString()};
    assert.equal((await accountRankIdleSettlement(f.env,7,row,{consumedSeconds:3600,last_settled_at:new Date(now).toISOString()},now)).length,0);
    const next={consumedSeconds:301,last_settled_at:new Date(now+301000).toISOString()};
    const first=await accountRankIdleSettlement(f.env,7,row,next,now+301000);
    const duplicate=await accountRankIdleSettlement(f.env,7,row,next,now+301000);
    await f.env.DB.batch(first);await f.env.DB.batch(duplicate);
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),301);
    const later={consumedSeconds:299,last_settled_at:new Date(now+600000).toISOString()};
    await f.env.DB.batch(await accountRankIdleSettlement(f.env,7,row,later,now+600000));
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),600);
  });
  test(`${label}: status authenticates, contains no growth details, locked presets cannot write`,async t=>{
    const f=await jointFixture(t,{postgres}),deps={authenticate:async()=>f.user,json:(body,status=200)=>Response.json(body,{status}),readBody:r=>r.json()};
    const request=new Request('https://local/api/account-rank/status');
    assert.equal((await handleAccountRank({path:'account-rank/status',request,env:f.env,deps:{...deps,authenticate:async()=>null}})).status,401);
    const body=await (await handleAccountRank({path:'account-rank/status',request,env:f.env,deps})).json();
    assert.equal(body.accountRank.level,1);assert.equal(body.ranks.length,21);assert.doesNotMatch(JSON.stringify(body),/total_ticks|139440|referenceDailyXp|XP_SOURCES/);
    const locked=await handleAccountRank({path:'account-rank/presets',request:new Request(request.url,{method:'POST',body:JSON.stringify({slot:2})}),env:f.env,deps});assert.equal(locked.status,403);
  });
  test(`${label}: presets use saved owned cards, revalidate ownership/rules and isolate accounts`,async t=>{
    const f=await jointFixture(t,{postgres});
    const ddl=['CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER)','CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT)'];
    if(postgres)await f.env.DB.execSchema(ddl);else for(const sql of ddl)await f.p(sql).run();
    const ids=['a','b','c','d','e'];let validates=0,rejectRules=false;
    for(const id of ids)await f.p('INSERT INTO user_cards VALUES(7,?,1)',id).run();
    const deps={authenticate:async()=>f.user,json:(b,status=200)=>Response.json(b,{status}),readBody:r=>r.json(),pveDeckCards:async()=>ids,validateDeckGradeLimits:async(_env,cards)=>{assert.deepEqual(cards,ids);validates++;if(rejectRules)throw Error('GRADE_LIMIT');}};
    const call=(path,body,uid=7)=>handleAccountRank({path:'account-rank/'+path,request:new Request('https://local/api/account-rank/'+path,{method:'POST',body:JSON.stringify(body)}),env:f.env,deps:{...deps,authenticate:async()=>({id:uid})}});
    assert.equal((await call('presets',{slot:1,cardIds:['forged']})).status,200);
    assert.equal((await call('presets/apply',{slot:1},8)).status,404);
    assert.equal((await call('presets/apply',{slot:1})).status,200);assert.equal(validates,1);
    assert.deepEqual(JSON.parse((await f.p('SELECT card_ids FROM pve_decks WHERE user_id=7').first()).card_ids),ids);
    await f.p("UPDATE user_cards SET quantity=0 WHERE card_id='a'").run();assert.equal((await call('presets/apply',{slot:1})).status,409);
    await f.p("UPDATE user_cards SET quantity=1 WHERE card_id='a'").run();rejectRules=true;await assert.rejects(()=>call('presets/apply',{slot:1}),/GRADE_LIMIT/);
    await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(7,?)',MAX_RANK_TICKS).run();assert.equal((await call('presets',{slot:5})).status,200);
  });
  test(`${label}: idle preserves sub-second carry and excludes off-time/offline excess`,async t=>{
    const f=await jointFixture(t,{postgres}),now=Date.parse('2026-09-16T00:00:00Z'),iso=n=>new Date(now+n).toISOString();
    await f.p('INSERT INTO idle_dungeon_progress(user_id,run_started_at,last_settled_at) VALUES(?,?,?)',7,iso(0),iso(0)).run();
    const row={version:0,run_started_at:iso(0)};
    await accountRankIdleSettlement(f.env,7,row,{last_settled_at:iso(0)},now);
    for(const ms of [1700,3100,4800,6000])await f.env.DB.batch(await accountRankIdleSettlement(f.env,7,row,{last_settled_at:iso(ms)},now+ms));
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),6);
    assert.equal((await accountRankIdleSettlement(f.env,7,{...row,run_started_at:null},{last_settled_at:iso(10000)},now+10000)).length,0);
    await f.env.DB.batch(await accountRankIdleSettlement(f.env,7,{...row,run_started_at:iso(15000)},{last_settled_at:iso(20000)},now+20000));
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),11);
    await f.env.DB.batch(await accountRankIdleSettlement(f.env,7,row,{last_settled_at:iso(50000),rankSettlementCutoff:now+40000},now+50000));
    assert.equal(Number((await f.p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=7').first()).total_ticks),21);
  });
}

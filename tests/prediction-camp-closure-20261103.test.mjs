import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {onRequest} from '../functions/api/[[path]].js';
import {retiredContentResponse} from '../functions/_retired_content.js';
import {handleCoinPrediction} from '../functions/_coin_prediction.js';
import {handlePrisonCampAdmin} from '../functions/_prison_camp_admin.js';
import {handleClanPrisonCamp,clanCampSettlementStatements,ensureClanCampSchema,clanCampStatusForUser,clanCampActiveProbeSql,clanCampProbeTime} from '../functions/_clan_prison_camp.js';
import {settleCoupRound} from '../functions/_coup.js';
import {coupRebelDefeatPolicy} from '../shared/coup-palace-v2115.mjs';
import {FAVORITE_MENU_ROUTES} from '../functions/_menu_favorites.js';
import {fixture} from './helpers/camp-closure-coup-fixture.mjs';
import {clanFixture,season,settings} from './helpers/camp-closure-clan-fixture.mjs';
import {__clanTest} from '../functions/_clan.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const forbidden=new Proxy({},{get(){throw Error('Retired request reached database/auth/runtime')}});
const json=(body,status=200)=>Response.json(body,{status});
test('prediction/camp APIs including owner/admin writes permanently return 410 before runtime, auth or DB',async()=>{
 const paths=['coin-prediction','coin-prediction/state','coin-prediction/bet','admin/coin-prediction/state','admin/coin-prediction/settings','admin/coin-prediction/event','admin/coin-prediction/action','admin/coin-prediction/category','admin/coin-prediction/subsidy','prison-camp','prison-camp/status','prison-camp/chat','prison-camp/release','admin/prison-camp/status','admin/prison-camp/action'];
 for(const path of paths)for(const method of ['GET','POST','PATCH','DELETE','OPTIONS']){const r=await onRequest({request:new Request('https://cnine-card.pages.dev/api/'+path,{method}),env:forbidden});assert.equal(r.status,410,path);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).retired,true)}
 for(const [handler,path]of [[handleCoinPrediction,'coin-prediction/bet'],[handleCoinPrediction,'admin/coin-prediction/event'],[handleClanPrisonCamp,'prison-camp/chat'],[handlePrisonCampAdmin,'admin/prison-camp/action']])assert.equal((await handler({path,env:forbidden,request:new Request('https://local/'+path,{method:'POST'}),deps:{json}})).status,410);
});
test('administrative prison, death-game, clan combat and auction remain available',()=>{
 for(const path of ['prison/status','prison/chat','admin/prison/action','prison-death-game/state','clan/state','coup/state','auction/state','coin-prediction-other'])assert.equal(retiredContentResponse(path,json),null,path);
});
test('even stale internal clan-settlement callers cannot issue a sentence',async()=>{
 assert.deepEqual(await clanCampSettlementStatements(forbidden,{phase:'SETTLEMENT'},{mode:'ON'},[{id:1},{id:2}]),[]);
 assert.deepEqual(coupRebelDefeatPolicy(),{type:'NONE',hours:0,trialRun:false,campRetired:true});
});
for(const pg of [false,true]){
 const label=pg?'PostgreSQL':'SQLite';
 test(label+': real clan season settlement completes and pays its existing rewards without any camp sentence',async t=>{
  const f=await clanFixture(t,pg);await __clanTest.settleSeason(f.env,season,settings);
  assert.equal((await f.p('SELECT * FROM clan_season_settlements WHERE season_id=7').first()).status,'COMPLETED');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM clan_prison_camps').first()).n),0);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM clan_prison_captives').first()).n),0);
  assert.equal((await clanCampStatusForUser(f.env,201)).incarcerated,false);
 });
 for(const winner of ['CHIEF','REBEL'])test(label+': '+winner+' victory settles once, preserves coins and chief succession, and never imprisons either team',async t=>{
  const f=await fixture(t,pg),id=await f.prepare(winner);await ensureClanCampSchema(f.env);
  const before=await f.p('SELECT id,coin FROM users ORDER BY id').all();
  if(winner==='REBEL'){f.fail('INSERT INTO app_meta(key,value)');await assert.rejects(settleCoupRound(f.env,id,f.now),/INJECTED_FAILURE/);f.fail('');assert.equal((await f.p('SELECT status FROM coup_rounds_v2115 WHERE id=?',id).first()).status,'SETTLING');}
  await settleCoupRound(f.env,id,f.now);await settleCoupRound(f.env,id,f.now+60000);
  assert.equal((await f.p('SELECT status FROM coup_rounds_v2115 WHERE id=?',id).first()).status,'FINISHED');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM event_prison_camps').first()).n),0);
  assert.deepEqual((await f.p('SELECT id,coin FROM users ORDER BY id').all()).results,before.results);
  const chief=JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='chief_appointment_v1'").first()).value);assert.equal(Number(chief.userId),winner==='REBEL'?2:1);
 });
 test(label+': historical CLAN/COUP/ADMIN sentences no longer lock users; separate death-game restriction remains',async t=>{
  const f=await fixture(t,pg);await ensureClanCampSchema(f.env);const at=new Date(f.now).toISOString().slice(0,19).replace('T',' '),until=new Date(f.now+3600000).toISOString().slice(0,19).replace('T',' ');
  for(const [i,type]of ['COUP','ADMIN','DEATH_GAME'].entries()){await f.p('INSERT INTO event_prison_camps(event_id,source_type,title,reason,jailed_at,jailed_until) VALUES(?,?,?,?,?,?)','qa-'+i,type,type,type,at,until).run();await f.p("INSERT INTO event_prison_captives(event_id,user_id,member_role) VALUES(?,?,'MEMBER')",'qa-'+i,i+1).run();}
  for(const id of [1,2]){assert.equal((await clanCampStatusForUser(f.env,id,f.now)).incarcerated,false);assert.equal(Number((await f.p('SELECT '+clanCampActiveProbeSql()+' AS active',clanCampProbeTime(f.now),id).first()).active),0)}
  assert.equal((await clanCampStatusForUser(f.env,3,f.now)).facility,'DEATH_GAME');
 });
}
test('desktop/mobile navigation, favorites, lazy resources and CMS remove closed content while keeping auction/prison',()=>{
 const context={console,document:{currentScript:null,readyState:'loading',documentElement:{dataset:{}},body:null,addEventListener(){},querySelector(){return null},querySelectorAll(){return []}},location:{search:''},URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval};context.window=context;context.globalThis=context;vm.runInNewContext(read('js/soopketmon-v21-exact-shell-adapter.js'),context);
 const nav=context.SoopketmonV21NavigationContract;for(const route of ['prediction','prisoncamp']){assert.equal(nav.routes[route],undefined);assert(!Object.values(nav.groups).some(g=>g.routes.includes(route)));assert(!FAVORITE_MENU_ROUTES.includes(route))}
 for(const route of ['auction','prison','clan','coup'])assert(nav.routes[route]);
 assert.doesNotMatch(read('index.html'),/clan-prison-camp-v2083\.(?:js|css)/);assert.doesNotMatch(read('admin/index.html'),/coin-prediction-admin-v1|prison-camp-admin-20260924/);
 assert.doesNotMatch(read('js/app.js'),/data-(?:mobile-)?tab="(?:prediction|prisoncamp)"|scripts:\['js\/coin-prediction/);
 assert.doesNotMatch(read('functions/_clan.js'),/clanCampSettlementStatements/);assert.doesNotMatch(read('functions/_coup.js'),/INSERT INTO event_prison/);
});

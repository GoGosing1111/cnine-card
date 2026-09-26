import test from 'node:test';
import assert from 'node:assert/strict';
import {sniperOrikkungSelectionWeights} from '../shared/mercenary-sniper-orikkung-v1.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCardChances,mercenaryGradePools,suggestedMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {openMercenaryCards} from '../functions/_mercenary_account.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {planSniperOrikkungRelease} from '../scripts/ops/sniper-orikkung-release-20260926.mjs';
import report from '../preview/mercenary-sniper-orikkung-v1/balance-report.json' with {type:'json'};
test('rare SS has exactly 1% within rank and leaves every other grade/relative weight intact',()=>{
 const codes=['V-004','V-043','V-044','V-050'],before={'V-004':5,'V-043':2,'V-021':8991,'V-049':10},saved=structuredClone(before),weights=sniperOrikkungSelectionWeights(codes,before);
 assert.deepEqual(weights,{'V-004':495,'V-043':198,'V-044':99,'V-050':8,'V-021':8991,'V-049':10});assert.deepEqual(before,saved);
 const odds=mercenaryCardChances(500,codes,{cardWeights:weights});assert.equal(odds.at(-1).withinRankPercent,1);assert.equal(odds.at(-1).percent,.0005);
 assert.equal(sniperOrikkungSelectionWeights(codes,weights),weights);
 assert.equal(sniperOrikkungSelectionWeights(['V-004'],before),before);
 assert.throws(()=>sniperOrikkungSelectionWeights(codes,{'V-004':4294967295}),/REQUIRE_CMS/);
 const policy=suggestedMercenaryDraw();policy.outcomes.forEach(o=>o.chancePpm=o.id==='CARD_SS'?1000000:0);policy.cardRules.cardWeights=weights;
 const counts=Object.fromEntries(codes.map(c=>[c,0]));
 for(let ticket=0;ticket<800;ticket++)counts[pickMercenaryDraw({policy,mercenaries:seed.catalog.cards.map(c=>({code:c.code,rank:codes.includes(c.code)?'SS':'C'})),randomInt:n=>n===1000000?0:ticket}).mercenaryCode]++;
 assert.deepEqual(Object.values(counts),[495,198,99,8]);
});
test('audited release plan preserves prior operators settings and only allocates new SS tickets',()=>{
 const old=structuredClone(seed.document);for(const key of ['mercenaries','assignments'])old[key]=old[key].filter(c=>c.code!=='V-050');old.skills=old.skills.filter(s=>s.id!=='MS-050');
 old.mercenaries[0].name='운영 지정 이름';old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),draw=suggestedMercenaryDraw(),result=planSniperOrikkungRelease(old,draw);
 assert.deepEqual(old,before);assert.deepEqual(result.policy.outcomes,draw.outcomes);
 assert.equal(result.document.mercenaries.length,54);assert.equal(result.document.mercenaries[0].name,'운영 지정 이름');assert.deepEqual(result.document.assignments[0].skillIds,['MS-004']);
 assert.equal(result.odds.withinRankPercent,1);
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' rare SS grant failure rolls back payment and retry uses the stored result after policy changes',async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const ss=mercenaryGradePools(f.document.mercenaries,seed.catalog.cards.map(c=>c.code)).SS,choices=mercenaryCardChances(1000000,ss,f.draw.cardRules),ticket=choices.slice(0,ss.indexOf('V-050')).reduce((n,r)=>n+r.weight,0);
 const request={requestId:crypto.randomUUID(),count:1},before=await f.coin();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(()=>openMercenaryCards(f.env,f.user,request,{randomInt:n=>n===1000000?0:ticket}));
 assert.equal(await f.coin(),before);assert.equal((await f.p('SELECT * FROM user_mercenary_cards_v1').all()).results.length,0);
 f.draw.cardRules.cardWeights={'V-050':99999};await f.setDraw(f.draw);f.fail('');
 const recovered=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Must not reroll')}});assert.equal(recovered.draws[0].mercenaryCode,'V-050');assert.equal(await f.coin(),before-1000);
 const replay=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Must not reroll')}});assert.deepEqual(replay.draws,recovered.draws);assert.equal(await f.coin(),before-1000);
});
test('recorded canonical comparison covers all released ranged opponents, both sides and three power tiers',()=>{
 assert.equal(report.results.length,13);assert.equal(report.total,9984);assert.equal(report.topRanged,true);
 for(const rival of report.results){assert.ok(rival.rate>.5);assert.equal(rival.cells.length,12);}
 for(const pve of report.pve)assert.equal(pve.rows[0].code,'V-050');
});
test('PostgreSQL release persists CMS and rare odds atomically, audits once, rejects stale revisions and replays safely',async t=>{
 const {applySniperOrikkungRelease,OPERATION_KEY}=await import('../scripts/ops/sniper-orikkung-release-20260926.mjs');
 const f=await mercenaryFixture(t,{postgres:true});
 await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE')");
 const old=structuredClone(f.document);for(const key of ['mercenaries','assignments'])old[key]=old[key].filter(c=>c.code!=='V-050');old.skills=old.skills.filter(s=>s.id!=='MS-050');
 await f.pg.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=57 WHERE doc_key='config'",[JSON.stringify(old)]);
 await f.pg.query('UPDATE mercenary_draw_config_v1 SET revision=17 WHERE id=1');
 const configBefore=(await f.pg.query("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'")).rows[0],drawBefore=(await f.pg.query('SELECT * FROM mercenary_draw_config_v1 WHERE id=1')).rows[0];
 let fail='';
 const q=async(sql,args=[])=>{if(fail&&sql.includes(fail))throw Error('RELEASE_AUDIT_FAILURE');return (await f.pg.query(sql,args)).rows;};
 const run=async expected=>{await f.pg.exec('BEGIN');try{const result=await applySniperOrikkungRelease(q,expected);await f.pg.exec('COMMIT');return result;}catch(e){await f.pg.exec('ROLLBACK');throw e;}};
 await assert.rejects(()=>run({expectedCmsRevision:56,expectedDrawRevision:17}),/revision changed/);
 fail='INSERT INTO mercenary_draw_audit_v1';await assert.rejects(()=>run({expectedCmsRevision:57,expectedDrawRevision:17}),/RELEASE_AUDIT_FAILURE/);
 assert.deepEqual((await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'"))[0],configBefore);
 assert.deepEqual((await q('SELECT * FROM mercenary_draw_config_v1 WHERE id=1'))[0],drawBefore);
 assert.equal((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length,0);
 fail='';const done=await run({expectedCmsRevision:57,expectedDrawRevision:17});assert.equal(done.cmsRevision,58);assert.equal(done.drawRevision,18);assert.equal(done.withinSsPercent,1);
 const again=await run({expectedCmsRevision:57,expectedDrawRevision:17});assert.equal(again.replayed,true);assert.equal(again.adminAuditId,done.adminAuditId);
 assert.equal(Number((await q("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_RELEASE'"))[0].n),1);
 assert.equal(await f.coin(),10000000);
});

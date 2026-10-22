import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack} from '../shared/mercenary-halloween-pack-v1.mjs';
import {JOKRO_PACK_SERVER_LIMIT,JOKRO_ART} from '../shared/mercenary-jokro-v1.mjs';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {ensureSssCubeCatalog,readSssCubeCatalog,saveSssCubePolicy,openSssCube} from '../functions/_sss_miracle_cube.js';
import {SSS_CUBE_TOTAL,emptySssCubePolicy} from '../shared/sss-miracle-cube-v1.mjs';
import {documentHash,prepareJokroLimit,reduceJokroLimit,verify} from '../scripts/ops/jokro-halloween-limit-20261022.mjs';
const snapshot=async f=>{const r={};for(const table of ['app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','admin_logs','users'])r[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return r;};
async function beforeReduction(t,{issued=1}={}){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT; UPDATE mercenary_limited_stock_v1 SET stock_limit=3 WHERE code='V-979'");
 f.settings.stockLimits['V-979']=3;f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-979'?1000000:0]));await f.configure(21);
 for(let n=0;n<issued;n++)await f.service.open(f.env,{id:2},{...f.body(),expectedRevision:21});
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,raw,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw)}};
}
test('two-copy policy reads the old live document without changing it and keeps actual owners usable',async t=>{
 const f=await beforeReduction(t),before=await snapshot(f);
 assert.equal(JOKRO_PACK_SERVER_LIMIT,2);assert.match(JOKRO_ART.combatLinkDescription,/서버 2장/);assert.equal(halloweenPackDraft().stockLimits['V-979'],2);
 assert.equal(readHalloweenPackSettings(f.document.settings).stockLimits['V-979'],3);assert.throws(()=>validateHalloweenPack(f.document.settings));
 assert((await f.state()).userOpeningEnabled);assert.deepEqual([...await readJokroPackOwners(f.env,[2,3])],[2]);assert.deepEqual(await snapshot(f),before);
 const next=prepareJokroLimit(f.document.settings);next.stockLimits['V-979']=3;assert.deepEqual(next,f.document.settings);
 for(const limit of [0,1,4])assert.throws(()=>readHalloweenPackSettings({...next,stockLimits:{...next.stockLimits,'V-979':limit}}));
});
test('retiring one unused slot is atomic, preserves real issues and other state, and replays without writes',async t=>{
 const f=await beforeReduction(t),before=await snapshot(f);
 await assert.rejects(reduceJokroLimit(f.pg,{expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(f),before);
 await reduceJokroLimit(f.pg,f.options);assert.deepEqual(await snapshot(f),before);
 for(const prefix of ['UPDATE mercenary_limited_stock','UPDATE app_meta','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
  await assert.rejects(reduceJokroLimit(failing,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 }
 const result=await reduceJokroLimit(f.pg,{...f.options,dryRun:false});assert.equal(result.currentRevision,22);assert.equal(result.remaining,1);assert.equal(result.issued,1);
 const after=await snapshot(f);
 for(const table of ['user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','users'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.filter(s=>s.code!=='V-979'),before.mercenary_limited_stock_v1.filter(s=>s.code!=='V-979'));
 const readOnly={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
 assert.equal((await reduceJokroLimit(readOnly,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
});
test('last remaining slot issues serial two once, preserves first owner and stops invalid receipt access',async t=>{
 const f=await beforeReduction(t);await reduceJokroLimit(f.pg,{...f.options,dryRun:false});
 const body=()=>({...f.body(),expectedRevision:22}),failed=body();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(f.service.open(f.env,{id:3},failed),/INJECTED/);f.fail('');assert.equal((await f.state()).stock.find(s=>s.code==='V-979').remaining,1);assert.equal(await f.coin(3),1000000);
 const results=await Promise.all([3,4].map(async id=>({id,result:await f.service.open(f.env,{id},body())})));
 const winner=results.find(r=>r.result.draws[0].mercenaryCode==='V-979');assert(winner);assert.equal(winner.result.draws[0].serial,2);
 assert.equal(results.filter(r=>r.result.draws[0].outcomeId==='CARD_SSS').length,1);
 assert.equal((await f.service.open(f.env,{id:winner.id},{requestId:winner.result.requestId,count:1,expectedRevision:22})).replayed,true);
 assert.deepEqual([...await readJokroPackOwners(f.env,[2,3,4])].sort(),[2,winner.id]);assert.equal((await verify(f.pg)).remaining,0);
 await f.p("UPDATE mercenary_limited_issues_v1 SET serial=3 WHERE code='V-979' AND serial=2").run();assert.equal((await readJokroPackOwners(f.env,[winner.id])).size,0);
 await f.p("UPDATE mercenary_limited_issues_v1 SET serial=2 WHERE code='V-979' AND serial=3").run();await f.p("UPDATE joint_operations_v1 SET status='CANCELLED' WHERE request_id=?",winner.result.requestId).run();
 assert.equal((await readJokroPackOwners(f.env,[winner.id])).size,0);assert.deepEqual([...await readJokroPackOwners(f.env,[2])],[2]);
});
test('already issued third copy cannot be retired',async t=>{
 const f=await beforeReduction(t,{issued:3}),before=await snapshot(f);
 await assert.rejects(reduceJokroLimit(f.pg,{...f.options,dryRun:false}),/already issued/);assert.deepEqual(await snapshot(f),before);
});
test('cube and Halloween openings share the reduced final slot and both retain valid ownership',async t=>{
 const f=await beforeReduction(t);
 await f.pg.exec('ALTER TABLE inventory_items ADD COLUMN name TEXT, ADD COLUMN subtitle TEXT, ADD COLUMN description TEXT, ADD COLUMN category TEXT, ADD COLUMN rarity TEXT, ADD COLUMN image_url TEXT, ADD COLUMN sort_order BIGINT');
 await ensureSssCubeCatalog(f.env);
 assert.equal((await readSssCubeCatalog(f.env)).catalog.find(c=>c.code==='V-979').available,true);
 await reduceJokroLimit(f.pg,{...f.options,dryRun:false});
 const card=(await readSssCubeCatalog(f.env)).catalog.find(c=>c.code==='V-979');assert.equal(card.stockLimit,2);assert.equal(card.remaining,1);assert(card.available);
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(3,'SSS_MIRACLE_CUBE',2,2)").run();
 await saveSssCubePolicy(f.env,{id:1,role:'OWNER'},{requestId:crypto.randomUUID(),revision:0,policy:{...emptySssCubePolicy(),mode:'ON',cards:{'V-979':SSS_CUBE_TOTAL}}});
 const cubeBody={requestId:crypto.randomUUID(),count:1,expectedRevision:1},cube=await openSssCube(f.env,{id:3},cubeBody,{randomInt:()=>0});
 assert.equal(cube.draws[0].serial,2);assert.equal((await openSssCube(f.env,{id:3},cubeBody)).replayed,true);
 const pack=await f.service.open(f.env,{id:4},{...f.body(),expectedRevision:22});assert.equal(pack.draws[0].outcomeId,'CARD_SSS');
 await assert.rejects(openSssCube(f.env,{id:3},{...cubeBody,requestId:crypto.randomUUID()}));
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=3 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity),1);
 assert.deepEqual([...await readJokroPackOwners(f.env,[2,3,4])].sort(),[2,3]);assert.equal((await verify(f.pg)).remaining,0);
});

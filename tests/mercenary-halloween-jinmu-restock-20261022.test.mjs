import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack} from '../shared/mercenary-halloween-pack-v1.mjs';
import {JINMU_PACK_SERVER_LIMIT,JINMU_COMBAT_DESCRIPTION} from '../shared/mercenary-jinmu-v1.mjs';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {prepareBathoryRestock} from '../scripts/ops/halloween-bathory-restock-20261021.mjs';
import {documentHash,prepareJinmuRestock,restockJinmu,verifyJinmuRestock} from '../scripts/ops/halloween-jinmu-restock-20261022.mjs';
const snapshot=async f=>{const result={};for(const table of ['app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','admin_logs'])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;};
async function oneIssued(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT; UPDATE mercenary_limited_stock_v1 SET stock_limit=3 WHERE code='V-989'");
 f.settings.stockLimits['V-989']=3;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-989'?1000000:0]));
 await f.configure(20);
 await f.service.open(f.env,{id:2},{...f.body(),expectedRevision:20});
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw),approvalReference:'ISOLATED_TEST'}};
}
test('Jinmu alone gains one slot; previous three-copy settings and historic restock receipts remain readable',async t=>{
 const f=await oneIssued(t),state=await f.state();assert(state.userOpeningEnabled);assert.equal(state.stock.find(s=>s.code==='V-989').remaining,2);
 assert.deepEqual([...await readJinmuPackOwners(f.env,[2])],[2]);
 assert.equal(JINMU_PACK_SERVER_LIMIT,4);assert.match(JINMU_COMBAT_DESCRIPTION,/서버 4장/);
 assert.equal(halloweenPackDraft().stockLimits['V-989'],4);assert.equal(halloweenPackDraft().stockLimits['V-979'],3);
 assert.equal(readHalloweenPackSettings(f.document.settings).stockLimits['V-989'],3);assert.throws(()=>validateHalloweenPack(f.document.settings));
 const next=prepareJinmuRestock(f.document.settings);next.stockLimits['V-989']=3;assert.deepEqual(next,f.document.settings);
 for(const limit of [0,2,5])assert.throws(()=>readHalloweenPackSettings({...next,stockLimits:{...next.stockLimits,'V-989':limit}}));
 const prior=JSON.parse(fs.readFileSync('docs/qa/halloween-bathory-restock-20261021/apply.json','utf8')).receipt;
 assert.deepEqual(prepareBathoryRestock(prior.before.settings),prior.after.settings);
});
test('restock preserves issued cards and odds; stale input, rollback and repeat never add extra stock',async t=>{
 const f=await oneIssued(t),before=await snapshot(f);
 await assert.rejects(restockJinmu(f.pg,{...f.options,expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(f),before);
 await restockJinmu(f.pg,f.options);assert.deepEqual(await snapshot(f),before);
 for(const prefix of ['UPDATE mercenary_limited_stock','UPDATE app_meta','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
  await assert.rejects(restockJinmu(failing,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 }
 const result=await restockJinmu(f.pg,{...f.options,dryRun:false});assert.equal(result.currentRevision,21);assert.equal(result.receipt.stockAdded,1);assert.equal(result.receipt.grants,0);
 const after=await snapshot(f);
 for(const table of ['user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.filter(s=>s.code!=='V-989'),before.mercenary_limited_stock_v1.filter(s=>s.code!=='V-989'));
 const stock=(await f.state()).stock.find(s=>s.code==='V-989');assert.equal(stock.issued,1);assert.equal(stock.remaining,3);
 const readOnly={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
 assert.equal((await restockJinmu(readOnly,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
});
test('serial four is usable; last-slot concurrency, failed grants, replay and invalid receipts cannot overissue or bypass access',async t=>{
 const f=await oneIssued(t);await restockJinmu(f.pg,{...f.options,dryRun:false});const body=()=>({...f.body(),expectedRevision:21}),first=body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,{id:3},first),/INJECTED/);f.fail('');
 assert.equal((await f.state()).stock.find(s=>s.code==='V-989').issued,1);assert.equal(await f.coin(3),1000000);
 assert.equal((await f.service.open(f.env,{id:3},first)).draws[0].serial,2);assert.equal((await f.service.open(f.env,{id:3},first)).replayed,true);
 assert.equal((await f.service.open(f.env,{id:3},body())).draws[0].serial,3);
 const last=await Promise.all([4,5].map(async id=>({id,result:await f.service.open(f.env,{id},body())})));
 const winner=last.find(r=>r.result.draws[0].mercenaryCode==='V-989');
 assert.equal(winner.result.draws[0].serial,4);assert.equal(last.filter(r=>r.result.draws[0].outcomeId==='CARD_SSS').length,1);
 assert.deepEqual([...await readJinmuPackOwners(f.env,[2,3,4,5])].sort(),[2,3,winner.id]);
 assert.equal((await f.state()).stock.find(s=>s.code==='V-989').remaining,0);await verifyJinmuRestock(f.pg);
 await f.p("UPDATE mercenary_limited_issues_v1 SET serial=5 WHERE code='V-989' AND serial=4").run();
 assert.equal((await readJinmuPackOwners(f.env,[winner.id])).size,0);
 await f.p("UPDATE mercenary_limited_issues_v1 SET serial=4 WHERE code='V-989' AND serial=5").run();
 await f.p("UPDATE joint_operations_v1 SET status='CANCELLED' WHERE request_id=?",winner.result.requestId).run();
 assert.equal((await readJinmuPackOwners(f.env,[winner.id])).size,0);assert.deepEqual([...await readJinmuPackOwners(f.env,[2])],[2]);
});

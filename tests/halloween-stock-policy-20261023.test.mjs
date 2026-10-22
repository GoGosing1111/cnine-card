import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS,isHalloweenStockLimit} from '../shared/mercenary-halloween-pool-v3.mjs';
import {saveHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {ensureSssCubeCatalog,readSssCubeCatalog,saveSssCubePolicy,openSssCube} from '../functions/_sss_miracle_cube.js';
import {SSS_CUBE_TOTAL,emptySssCubePolicy} from '../shared/sss-miracle-cube-v1.mjs';

const ssCodes=['V-980','V-981','V-982','V-983','V-984','V-985','V-986'];
const caps=(ss,bathory,jinmu,jokro)=>Object.fromEntries([
 ...ssCodes.map(code=>[code,ss]),['V-977',bathory],['V-989',jinmu],['V-979',jokro],['V-999',null],['V-996',null]
]);
const previousCaps=caps(11,15,4,2),currentCaps=caps(13,20,5,3);
const snapshot=async f=>{
 const result={};
 for(const table of ['app_meta','mercenary_limited_stock_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','user_mercenary_cards_v1','cnine_user_inventory','users','admin_logs'])
  result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;
 return result;
};
async function setCaps(f,limits,revision){
 // Fixture setup only. The production operation's atomicity is tested separately.
 await f.pg.exec('BEGIN');
 try{
  for(const [code,limit] of Object.entries(limits))if(limit!==null)
   await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1 WHERE code=$2',[limit,code]);
  f.settings.stockLimits=structuredClone(limits);await f.configure(revision);
  await f.pg.exec('COMMIT');
 }catch(error){await f.pg.exec('ROLLBACK');throw error;}
}
async function selectCard(f,code,revision){
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(candidate=>[candidate,candidate===code?1000000:0]));
 await f.configure(revision);
}
const open=(f,id,revision)=>f.service.open(f.env,{id},{...f.body(),expectedRevision:revision});

test('current draft fixes SS seven at 13, Bathory at 20, Jinmu at 5 and Jokro at 3; shared SSS counters stay external',()=>{
 const current=halloweenPackDraft();assert.deepEqual(current.stockLimits,currentCaps);
 assert.deepEqual(validateHalloweenPack(current),current);
 for(const card of HALLOWEEN_PACK_CARDS){
  assert.equal(isHalloweenStockLimit(card.code,currentCaps[card.code],{allowLegacy:false}),true,card.code);
  assert.equal(card.serverLimit,currentCaps[card.code],card.code);
 }
 assert.equal(isHalloweenStockLimit('V-UNKNOWN',13),false);
});

test('reads accept every approved historical cap combination without upgrading it; saving accepts only current caps',()=>{
 for(const ss of [5,10,11])for(const bathory of [10,15])for(const jinmu of [3,4])for(const jokro of [2,3]){
  const old={...halloweenPackDraft(),stockLimits:caps(ss,bathory,jinmu,jokro)},before=structuredClone(old);
  assert.deepEqual(readHalloweenPackSettings(old),before);assert.deepEqual(old,before);
  assert.throws(()=>validateHalloweenPack(old));
  for(const [code,limit] of Object.entries(old.stockLimits)){
   assert.equal(isHalloweenStockLimit(code,limit),true,code+':'+limit);
   assert.equal(isHalloweenStockLimit(code,limit,{allowLegacy:false}),limit===currentCaps[code],code+':'+limit);
  }
 }
 const withoutLaterMembers={...halloweenPackDraft(),stockLimits:structuredClone(previousCaps)};
 for(const code of ['V-977','V-979']){delete withoutLaterMembers.stockLimits[code];delete withoutLaterMembers.cardRatesPpm[code];}
 const read=readHalloweenPackSettings(withoutLaterMembers);
 assert.equal(read.stockLimits['V-977'],20);assert.equal(read.stockLimits['V-979'],3);
 assert.equal(read.cardRatesPpm['V-977'],0);assert.equal(read.cardRatesPpm['V-979'],0);
 assert.equal(read.stockLimits['V-980'],11);assert.equal(read.stockLimits['V-989'],4);
});

test('unapproved caps, numeric strings, malformed shared caps and mixed SS generations remain rejected',()=>{
 for(const [code,limits] of Object.entries({
  'V-980':[0,6,12,14,null,'13',13.5,NaN,Infinity],
  'V-977':[0,5,11,16,19,21,null,'20'],
  'V-989':[0,1,2,6,null,'5'],
  'V-979':[0,1,4,null,'3'],
  'V-999':[0,7,'null'],
  'V-996':[0,15,'null']
 }))for(const limit of limits){
  assert.equal(isHalloweenStockLimit(code,limit),false,code+':'+String(limit));
  const bad=halloweenPackDraft();bad.stockLimits[code]=limit;
  assert.throws(()=>readHalloweenPackSettings(bad),code+':'+String(limit));
  assert.throws(()=>validateHalloweenPack(bad),code+':'+String(limit));
 }
 const mixed=halloweenPackDraft();mixed.stockLimits['V-980']=11;
 assert.throws(()=>readHalloweenPackSettings(mixed));
 const missing=halloweenPackDraft();delete missing.stockLimits['V-980'];assert.throws(()=>readHalloweenPackSettings(missing));
});

test('runtime reads leave previous live stock unchanged; the save endpoint rejects old caps and accepts the transitioned document',async t=>{
 const f=await halloweenFixture(t);await setCaps(f,previousCaps,22);
 const before=await snapshot(f),state=await f.state();
 assert.equal(state.userOpeningEnabled,true);assert.deepEqual(state.settings.stockLimits,previousCaps);
 assert.deepEqual(await snapshot(f),before);
 const body={requestId:crypto.randomUUID(),expectedRevision:22,reason:'ISOLATED_STOCK_POLICY_TEST',settings:structuredClone(f.settings)};
 await assert.rejects(saveHalloweenPack(f.env,f.user,body),error=>error.code==='MERCENARY_HALLOWEEN_CONFIG');
 assert.deepEqual(await snapshot(f),before);
 await setCaps(f,currentCaps,23);const transitioned=await snapshot(f);
 const result=await saveHalloweenPack(f.env,f.user,{...body,requestId:crypto.randomUUID(),expectedRevision:23,settings:structuredClone(f.settings)});
 assert.equal(result.revision,24);assert.deepEqual(result.settings.stockLimits,currentCaps);
 const after=await snapshot(f);
 for(const table of Object.keys(transitioned).filter(table=>!['app_meta','admin_logs'].includes(table)))assert.deepEqual(after[table],transitioned[table],table);
 assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value).revision,24);
});

test('Jinmu and Jokro pack owners retain completed issuance rights before and after the cap transition',async t=>{
 const f=await halloweenFixture(t);await setCaps(f,previousCaps,22);
 await selectCard(f,'V-989',22);const oldJinmu=await open(f,2,22);
 await selectCard(f,'V-979',22);const oldJokro=await open(f,3,22);
 const owners=async()=>({jinmu:[...await readJinmuPackOwners(f.env,[2,3,4])],jokro:[...await readJokroPackOwners(f.env,[2,3,4])]});
 const before=await snapshot(f);assert.deepEqual(await owners(),{jinmu:[2],jokro:[3]});assert.deepEqual(await snapshot(f),before);
 await setCaps(f,currentCaps,23);
 const after=await snapshot(f);assert.deepEqual(await owners(),{jinmu:[2],jokro:[3]});assert.deepEqual(await snapshot(f),after);
 for(const table of ['mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','user_mercenary_cards_v1','cnine_user_inventory','users'])assert.deepEqual(after[table],before[table],table);
 assert.equal((await f.service.open(f.env,{id:2},{requestId:oldJinmu.requestId,count:1,expectedRevision:22})).replayed,true);
 assert.equal((await f.service.open(f.env,{id:3},{requestId:oldJokro.requestId,count:1,expectedRevision:22})).replayed,true);
 for(const [code,readOwners] of [['V-989',readJinmuPackOwners],['V-979',readJokroPackOwners]]){
  await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=99 WHERE code=$1',[code]);
  assert.equal((await readOwners(f.env,[2,3])).size,0);
  await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1 WHERE code=$2',[currentCaps[code],code]);
 }
 assert.deepEqual(await owners(),{jinmu:[2],jokro:[3]});
});

for(const [code,readOwners] of [['V-989',readJinmuPackOwners],['V-979',readJokroPackOwners]])
test(code+' cube and Halloween openings share the increased remaining stock and enforce the final serial',async t=>{
 const f=await halloweenFixture(t);await setCaps(f,previousCaps,22);await selectCard(f,code,22);
 for(let i=0;i<previousCaps[code]-1;i++)await open(f,2,22);
 await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT; ALTER TABLE inventory_items ADD COLUMN name TEXT, ADD COLUMN subtitle TEXT, ADD COLUMN description TEXT, ADD COLUMN category TEXT, ADD COLUMN rarity TEXT, ADD COLUMN image_url TEXT, ADD COLUMN sort_order BIGINT');
 await ensureSssCubeCatalog(f.env);
 const cubeCard=async()=>(await readSssCubeCatalog(f.env)).catalog.find(card=>card.code===code);
 const prior=await cubeCard();assert.equal(prior.available,true);assert.equal(prior.stockLimit,previousCaps[code]);assert.equal(prior.remaining,1);
 await setCaps(f,currentCaps,23);
 const next=await cubeCard();assert.equal(next.available,true);assert.equal(next.stockLimit,currentCaps[code]);assert.equal(next.remaining,2);
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(3,'SSS_MIRACLE_CUBE',2,2)").run();
 await saveSssCubePolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision:0,policy:{...emptySssCubePolicy(),mode:'ON',cards:{[code]:SSS_CUBE_TOTAL}}});
 const body={requestId:crypto.randomUUID(),count:1,expectedRevision:1};
 const cube=await openSssCube(f.env,{id:3},body,{randomInt:()=>0});assert.equal(cube.draws[0].serial,currentCaps[code]-1);
 assert.equal((await openSssCube(f.env,{id:3},body)).replayed,true);
 assert.equal((await f.state()).stock.find(row=>row.code===code).remaining,1);
 const pack=await open(f,4,23);assert.equal(pack.draws[0].serial,currentCaps[code]);
 const exhausted=await cubeCard();assert.equal(exhausted.available,false);assert.equal(exhausted.remaining,0);
 assert.equal((await open(f,5,23)).draws[0].outcomeId,'CARD_SSS');
 await assert.rejects(openSssCube(f.env,{id:3},{...body,requestId:crypto.randomUUID()}));
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=3 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity),1);
 assert.deepEqual([...await readOwners(f.env,[2,3,4,5])].sort(),[2,3,4]);
 await f.p('UPDATE joint_operations_v1 SET status=? WHERE request_id=?','CANCELLED',pack.requestId).run();
 assert.deepEqual([...await readOwners(f.env,[2,3,4,5])].sort(),[2,3]);
});

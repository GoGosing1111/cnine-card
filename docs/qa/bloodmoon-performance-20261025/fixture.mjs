import {JOINT_TRANSACTION_SCHEMA} from '../../../functions/_joint_transactions.js';
import {JOINT_ATOMIC_SCHEMA} from '../../../functions/_joint_atomic.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../../../functions/_mercenary_draw_accounting.js';
import {LIMITED_PACK_SCHEMA} from '../../../functions/_mercenary_limited_pack.js';
import {MERCENARY_CMS_SEED} from '../../../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw} from '../../../shared/mercenary-draw-policy-v1.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft} from '../../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_PACK_CARDS} from '../../../shared/mercenary-bloodmoon-pool-v3.mjs';
import {BLOODMOON_BULK_REFERENCE_PRICES,validateBloodmoonBulkReceipt} from '../../../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {readBloodmoonPackState} from '../../../functions/_mercenary_bloodmoon_pack.js';
import {createBloodmoonPackService} from '../../../functions/_mercenary_bloodmoon_opening.js';

export const baseSchema=[
 'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT NOT NULL)',
 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)',
 'CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER)',
 'CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT,revision INTEGER)',
 'CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
 ...JOINT_ATOMIC_SCHEMA,...JOINT_TRANSACTION_SCHEMA,...MERCENARY_ACCOUNTING_SCHEMA,...LIMITED_PACK_SCHEMA
];
export const tableNames=baseSchema.filter(s=>/^CREATE TABLE/.test(s)).map(s=>s.match(/^CREATE TABLE (?:IF NOT EXISTS )?(\w+)/)[1]);
export const scenarios=['mixed_all_grades','mostly_misses','all_sss_sold_out','limited_serial_cap'];
export function config(normalCards,scenario){
 if(!scenarios.includes(scenario))throw Error('Unknown scenario');
 const byCode=new Map(normalCards.map(c=>[c.code,c])),document=structuredClone(MERCENARY_CMS_SEED.document),draw=suggestedMercenaryDraw();
 for(const c of document.mercenaries)if(byCode.has(c.code))c.rank=byCode.get(c.code).rank;
 draw.cardRules.cardWeights=Object.fromEntries(MERCENARY_CMS_SEED.catalog.cards.map(c=>[c.code,byCode.get(c.code)?.weight||0]));
 const settings=bloodmoonPackDraft();settings.mode='ON';settings.prices={...BLOODMOON_BULK_REFERENCE_PRICES};
 settings.normalRankRatesPpm={C:300000,B:200000,A:200000,S:150000,SS:100000,SSS:50000};settings.missRatePpm=0;
 settings.cardRatesPpm=Object.fromEntries(BLOODMOON_PACK_CARDS.map(c=>[c.code,100000]));settings.normalSssRatePpm=100000;
 if(scenario==='mostly_misses'){settings.normalRankRatesPpm={C:40000,B:20000,A:10000,S:10000,SS:10000,SSS:10000};settings.missRatePpm=900000;}
 if(scenario==='all_sss_sold_out')settings.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:0,SSS:1000000};
 const stock=BLOODMOON_PACK_CARDS.map((c,i)=>({code:c.code,limit:c.rank==='SS'?10:scenario==='limited_serial_cap'?[66,65,65][i-6]:3}));
 // Every price, chance and SSS stock below belongs only to this disposable fixture.
 return {document,draw,settings,stock};
}
export async function seed(DB,normalCards,scenario){
 const c=config(normalCards,scenario),p=(sql,...v)=>DB.prepare(sql).bind(...v);
 await p('INSERT INTO users(id,coin) VALUES(1,200000000000000)').run();
 await p('INSERT INTO app_meta(key,value) VALUES(?,?)',BLOODMOON_PACK_KEY,JSON.stringify({revision:1,settings:c.settings})).run();
 await p('INSERT INTO mercenary_cms_documents_v1(doc_key,payload_json,revision) VALUES(?,?,1)','config',JSON.stringify(c.document)).run();
 await p('INSERT INTO mercenary_draw_config_v1(id,payload_json,revision) VALUES(1,?,1)',JSON.stringify(c.draw)).run();
 for(const s of c.stock)await p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',s.code,s.limit,scenario==='all_sss_sold_out'?s.limit:0).run();
 return c;
}
export async function runSamples(DB,normalCards,scenario,{iterations=5,clock=()=>performance.now(),returnReceipt=false}={}){
 const env={DB},cfg=await seed(DB,normalCards,scenario),state=await readBloodmoonPackState(env,{releaseEnabled:true});
 if(!state.readiness.ready)throw Error(state.readiness.blockers.join(' '));
 if(state.normalCards.length!==normalCards.length)throw Error('Ordinary pool differs from public snapshot');
 // No injected randomInt: execute the exact production cryptographic bulk sampler.
 const service=createBloodmoonPackService({readState:readBloodmoonPackState,releaseEnabled:true}),samples=[];let lastReceipt;
 const p=(sql,...v)=>DB.prepare(sql).bind(...v);
 for(let i=0;i<iterations;i++){
  for(const table of ['joint_operations_v1','joint_atomic_guards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_cards_v1','coin_logs'])await p('DELETE FROM '+table).run();
  await p('UPDATE users SET coin=200000000000000 WHERE id=1').run();
  await p('UPDATE mercenary_limited_stock_v1 SET issued='+ (scenario==='all_sss_sold_out'?'stock_limit':'0')+',revision=0,last_token=NULL').run();
  const body={requestId:crypto.randomUUID(),count:100000,expectedRevision:1,budget:'100000000000000'};
  DB.benchStats={wireCalls:0,batchStatements:0};const start=clock(),receipt=await service.open(env,{id:1,role:'TEST'},body),ms=clock()-start,stats={...DB.benchStats};
  validateBloodmoonBulkReceipt(receipt);
  if(receipt.coin!=='100000000000000'||receipt.coinCost!==100000000000000)throw Error('Incorrect fixture debit');
  const owned=Number((await p('SELECT COALESCE(SUM(total_copies),0) AS n FROM user_mercenary_cards_v1 WHERE user_id=1').first()).n);
  if(owned+receipt.missCount!==100000)throw Error('Incorrect fixture inventory quantity');
  const serials=(await p('SELECT code,serial FROM mercenary_limited_issues_v1').all()).results;
  if(new Set(serials.map(r=>r.code+':'+r.serial)).size!==serials.length||serials.length!==receipt.draws.length)throw Error('Incorrect limited serials');
  const replayStart=clock(),replay=await service.open(env,{id:1,role:'TEST'},body),replayMs=clock()-replayStart;
  if(JSON.stringify({...receipt,replayed:true})!==JSON.stringify(replay))throw Error('Receipt replay differs');
  if(Number((await p('SELECT COUNT(*) AS n FROM coin_logs').first()).n)!==1)throw Error('Duplicate fixture charge');
  samples.push({ms,replayMs,...stats,draws:100000,awarded:owned,misses:receipt.missCount,limitedSerials:serials.length,ordinaryTypes:receipt.normalDraws.length,receiptBytes:new TextEncoder().encode(JSON.stringify(receipt)).byteLength,oneDebit:true,replayIdentical:true});lastReceipt=receipt;
 }
 return {scenario,iterations,random:'production crypto.getRandomValues',normalPoolByRank:Object.fromEntries(['C','B','A','S','SS','SSS'].map(r=>[r,normalCards.filter(c=>c.rank===r).length])),fixtureOnly:true,fixtureLimitedCapacity:cfg.stock.reduce((n,s)=>n+s.limit,0),samples,...(returnReceipt?{lastReceipt}:{})};
}

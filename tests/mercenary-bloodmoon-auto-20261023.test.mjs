import test from 'node:test';
import assert from 'node:assert/strict';
import {BloodmoonAutoOpening,bloodmoonAutoQuote} from '../shared/mercenary-bloodmoon-auto-v1.mjs';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {BLOODMOON_PACK,bloodmoonReceiptResults} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {bloodmoonBatchCinematics} from '../js/mercenary-bloodmoon-pack-live.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
const config=()=>({revision:7,userOpeningEnabled:true,settings:{prices:{single:100,ten:900}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
function setup({present=async()=>{},readConfig,api,lock}={}){
 let account=1,coin=10000;const calls=[],storage=memory(),receipts=new Map();
 const session=new BloodmoonOpeningSession({accountId:1,getAccountId:()=>account,storage,present,lock,api:api||(async(path,options)=>{
  if(path!==BLOODMOON_PACK.openPath)return receipts.get(new URL('https://qa/'+path).searchParams.get('requestId'));
  const body=options.body;calls.push(body);const coinCost=body.count===10?900:100;coin-=coinCost;
  const r={status:'COMPLETED',requestId:body.requestId,packId:BLOODMOON_PACK.id,accountId:1,count:body.count,coinCost,coin:String(coin),draws:Array.from({length:body.count},()=>({outcomeId:'NONE',quantity:0}))};receipts.set(r.requestId,r);return r;
 })});
 const auto=new BloodmoonAutoOpening({session,readConfig:readConfig||(async()=>config()),delay:async()=>{}});
 return {session,auto,calls,storage,setAccount:n=>account=n};
}

test('bounded automatic quote includes exact maximum cost and rejects malformed counts',()=>{
 const c=config();c.settings.prices.ten=100000000000000;
 assert.equal(bloodmoonAutoQuote(c,10,100).maxCost,'10000000000000000');
 for(const [count,repeats] of [[0,10],[11,10],[10,0],[10,101],[1,1.5],[10,NaN]])assert.throws(()=>bloodmoonAutoQuote(c,count,repeats));
});

test('a mixed confirmed batch shows SS then SSS once per grade, never previews or gate ranks',()=>{
 const receipt={status:'COMPLETED',packId:BLOODMOON_PACK.id,count:10,requestId:'test-cinematics',draws:Array.from({length:10},(_,i)=>({mercenaryCode:i===0?'V-989':'V-960',rank:i===0?'SSS':'SS',gateRank:'SSS'}))};
 const results=bloodmoonReceiptResults(receipt);assert.deepEqual(bloodmoonBatchCinematics(results).map(r=>r.rank),['SS','SSS']);
 assert.deepEqual(bloodmoonBatchCinematics(results.map(r=>({...r,preview:true}))),[]);
 assert.deepEqual(bloodmoonBatchCinematics([{...results[1],rank:'S',gateRank:'SSS'}]),[]);
});

test('automatic batches wait for presentation and hold the account lock across the entire sequence',async()=>{
 const video=deferred(),entered=deferred();let locked=false,locks=0,presentations=0;
 const f=setup({lock:async(_k,work)=>{locks++;locked=true;try{return await work();}finally{locked=false;}},present:async()=>{assert.equal(locked,true);if(++presentations===1){entered.resolve();await video.promise;}}});
 const pending=f.auto.start(config(),10,3);await entered.promise;
 assert.equal(f.calls.length,1);assert.equal(f.auto.state.totalDraws,10);assert.equal(f.auto.state.spent,'900');await assert.rejects(f.session.start(config(),1),e=>e.code==='BLOODMOON_BUSY');
 video.resolve();const state=await pending;
 assert.equal(state.phase,'completed');assert.equal(state.totalDraws,30);assert.equal(state.spent,'2700');assert.equal(locks,1);assert.equal(locked,false);
 assert.equal(new Set(f.calls.map(c=>c.requestId)).size,3);assert.ok(f.calls.every(c=>c.expectedRevision===7));
});

test('stop during a paid request finishes that receipt and never starts another request',async()=>{
 const video=deferred(),entered=deferred();const f=setup({present:async()=>{entered.resolve();await video.promise;}});
 const pending=f.auto.start(config(),1,100);await entered.promise;f.auto.stop();video.resolve();const state=await pending;
 assert.equal(state.totalDraws,1);assert.equal(f.calls.length,1);assert.equal(state.phase,'stopped');assert.equal(f.session.read(f.session.pendingKey),null);
 await f.session.recover();assert.equal(f.calls.length,1);assert.equal(f.auto.state.running,false);
});

test('OFF, changed revision, unavailable stock and network errors halt before another charge',async()=>{
 for(const next of [{...config(),userOpeningEnabled:false},{...config(),revision:8},{...config(),userOpeningEnabled:false,readiness:{blockers:['한정 수량 소진']}},Error('offline')]){
  let reads=0;const f=setup({readConfig:async()=>{if(++reads===1)return config();if(next instanceof Error)throw next;return next;}});
  const state=await f.auto.start(config(),10,5);assert.equal(f.calls.length,1);assert.equal(state.phase,'stopped');assert.equal(state.error,true);
 }
});

test('lost response never becomes a fresh lottery; explicit recovery stays outside automation',async()=>{
 let posts=0,offline=true,receipt;
 const f=setup({api:async(path,options)=>{if(path===BLOODMOON_PACK.openPath){posts++;const b=options.body;receipt={status:'COMPLETED',packId:BLOODMOON_PACK.id,requestId:b.requestId,accountId:1,count:1,coinCost:100,coin:'9900',draws:[{outcomeId:'NONE'}]};throw Error('lost response');}if(offline)throw Error('offline');return receipt;}});
 const state=await f.auto.start(config(),1,10);assert.equal(state.phase,'stopped');assert.equal(posts,1);assert.ok(f.session.read(f.session.pendingKey));
 offline=false;await f.session.recover();assert.equal(posts,1);assert.equal(f.auto.state.running,false);assert.equal(f.session.read(f.session.pendingKey),null);
});

test('account changes and background transitions halt before the next request',async()=>{
 const f=setup({present:async()=>f.setAccount(2)});await f.auto.start(config(),1,5);assert.equal(f.calls.length,1);assert.equal(f.auto.state.phase,'stopped');
 const g=setup();g.auto.isHidden=()=>true;await g.auto.start(config(),1,5);assert.equal(g.calls.length,0);
 const h=setup({readConfig:async()=>{h.auto.isHidden=()=>true;return config();}});await h.auto.start(config(),1,5);assert.equal(h.calls.length,0);
});

test('insufficient next-batch funds and terminal server failures do not retry automatically',async()=>{
 const f=setup();await f.auto.start(config(),10,100);assert.equal(f.calls.length,11);assert.equal(f.auto.state.spent,'9900');assert.match(f.auto.state.reason,/코인/);
 let posts=0;const g=setup({api:async()=>{posts++;throw Object.assign(Error('재고 소진'),{code:'MERCENARY_BLOODMOON_SOLD_OUT'});}});await g.auto.start(config(),10,3);assert.equal(posts,1);assert.equal(g.session.read(g.session.pendingKey),null);
});

test('two tabs cannot own an automatic sequence simultaneously',async()=>{
 let held=false;const lock=async(_key,work)=>{if(held)throw Error('다른 창에서 처리 중');held=true;try{return await work();}finally{held=false;}},video=deferred(),entered=deferred();
 const first=setup({lock,present:async()=>{entered.resolve();await video.promise;}}),second=setup({lock});
 const running=first.auto.start(config(),1,2);await entered.promise;await second.auto.start(config(),1,2);assert.equal(second.calls.length,0);assert.equal(second.auto.state.phase,'stopped');first.auto.stop();video.resolve();await running;assert.equal(held,false);
});

test('three automatic ten-batches use the production service, separate receipts and exact coin debits',async t=>{
 const f=await bloodmoonFixture(t,{randomInt:()=>9900000000});f.settings.normalRankRatesPpm.SSS=100000;f.settings.missRatePpm=900000;await f.configure(7);
 const storage=memory();let posts=0;
 const session=new BloodmoonOpeningSession({accountId:f.user.id,getAccountId:()=>f.user.id,storage,present:async()=>{},api:async(_path,options)=>{posts++;return f.service.open(f.env,f.user,options.body);}});
 const auto=new BloodmoonAutoOpening({session,readConfig:()=>f.state(),delay:async()=>{}}),state=await auto.start(await f.state(),10,3);
 assert.equal(state.phase,'completed');assert.equal(posts,3);assert.equal(state.totalDraws,30);assert.equal(state.spent,'2700');assert.equal(await f.coin(),997300);
 assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
});

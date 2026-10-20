import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenEffectivePercent,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {OPERATION_KEY,RATES,documentHash,prepareHalloweenSssOdds,applyHalloweenSssOdds} from '../scripts/ops/halloween-sss-odds-20261020.mjs';

async function configured(t){
  const f=await halloweenFixture(t);
  await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT;");
  f.settings.prices={single:1000000000,ten:10000000000};
  f.settings.normalRankRatesPpm={C:104500,B:30000,A:30000,S:30000,SS:5000,SSS:500};f.settings.missRatePpm=800000;
  f.settings.cardRatesPpm=Object.fromEntries(HALLOWEEN_PACK_CARDS.map(c=>[c.code,RATES[c.code]?.before??(c.code==='V-977'?5000:10000)]));
  f.settings.normalSssRatePpm=924750;await f.configure(15);return f;
}
const snapshot=async f=>{
  const result={};for(const table of ['app_meta','admin_logs','users','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory'])
    result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;
  return result;
};

test('three SSS odds double to the requested expected costs; all other pack settings and draw boundaries stay valid',async t=>{
  const f=await configured(t),before=structuredClone(f.settings),next=prepareHalloweenSssOdds(before);
  assert.equal(next.normalSssRatePpm,924500);
  for(const [code,{after}] of Object.entries(RATES)){
    assert.equal(next.cardRatesPpm[code],after);
    assert.equal(halloweenEffectivePercent(500,after),code==='V-989'?'0.000005':'0.00001');
    const meanCoins=BigInt(next.prices.single)*1000000n*1000000n/(500n*BigInt(after));
    assert.equal(meanCoins,code==='V-989'?20000000000000000n:10000000000000000n);
  }
  const compared=structuredClone(next);for(const code of Object.keys(RATES))compared.cardRatesPpm[code]=before.cardRatesPpm[code];
  compared.normalSssRatePpm=before.normalSssRatePpm;assert.deepEqual(compared,before);assert.deepEqual(f.settings,before);
  const off=structuredClone(before);off.mode='OFF';assert.equal(prepareHalloweenSssOdds(off).mode,'OFF');
  for(const mutate of [s=>s.prices.single++,s=>s.normalRankRatesPpm.SSS++,s=>s.cardRatesPpm['V-989']++,s=>s.normalSssRatePpm=0]){
    const changed=structuredClone(before);mutate(changed);assert.throws(()=>prepareHalloweenSssOdds(changed));
  }
  Object.assign(f.settings,next);await f.configure(16);const state=await f.state();
  const firstStart=Object.entries(next.normalRankRatesPpm).filter(([rank])=>rank!=='SSS').reduce((sum,[,rate])=>sum+limitedRateUnits(rate),0);
  for(const code of Object.keys(RATES)){
    const index=HALLOWEEN_PACK_CARDS.findIndex(c=>c.code===code),start=HALLOWEEN_PACK_CARDS.slice(0,index).reduce((n,c)=>n+limitedRateUnits(next.cardRatesPpm[c.code]),0);
    for(const ticket of [start,start+limitedRateUnits(next.cardRatesPpm[code])-1]){
      const samples=[firstStart,ticket];assert.equal(pickHalloweenBatch(state,1,()=>samples.shift())[0].mercenaryCode,code);
    }
  }
});

test('settings update is atomic, rejects stale reads, preserves stock and accounts, and cannot double again on retry',async t=>{
  const f=await configured(t),before=await snapshot(f),raw=before.app_meta.find(s=>s.key===HALLOWEEN_PACK_KEY).value,opts={expectedDocumentHash:documentHash(raw)};
  await applyHalloweenSssOdds(f.pg,opts);assert.deepEqual(await snapshot(f),before);
  for(let at=1;at<=3;at++){
    let writes=0;const failing={query:(sql,args)=>{if(/^(INSERT|UPDATE)/.test(sql)&&++writes===at)throw Error('INJECTED_FAILURE');return f.pg.query(sql,args);}};
    await assert.rejects(applyHalloweenSssOdds(failing,{...opts,dryRun:false}),/INJECTED_FAILURE/);assert.deepEqual(await snapshot(f),before);
  }
  await assert.rejects(applyHalloweenSssOdds(f.pg,{expectedDocumentHash:'stale',dryRun:false}),/Reviewed settings changed/);
  assert.deepEqual(await snapshot(f),before);
  const applied=await applyHalloweenSssOdds(f.pg,{...opts,dryRun:false});assert.equal(applied.currentRevision,16);
  const after=await snapshot(f);
  for(const table of Object.keys(before).filter(t=>!['app_meta','admin_logs'].includes(t)))assert.deepEqual(after[table],before[table]);
  const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
  assert.equal((await applyHalloweenSssOdds(noWrites,{...opts,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
  assert.equal(after.app_meta.filter(s=>s.key===OPERATION_KEY).length,1);assert.equal(after.admin_logs.length,before.admin_logs.length+1);
});

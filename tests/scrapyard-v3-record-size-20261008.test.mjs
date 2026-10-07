import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {jointFixture} from './helpers/joint-db.mjs';
import {encodeScrapyardRecord,decodeScrapyardRecord,SCRAPYARD_RECORD_RAW_LIMIT} from '../functions/_scrapyard_v3_record.js';
import {runScrapyardV3,scrapyardV3Result,scrapyardV3RecoveryStatus} from '../functions/_scrapyard_v3_runs.js';
import {loadScrapyardV3Snapshot,buildScrapyardV3Battle} from '../functions/_scrapyard_v3.js';
import {SCRAPYARD_REFORM_DIFFICULTIES} from '../shared/pve-reform-20261008.mjs';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';

test('plain legacy JSON and large Korean records round-trip exactly; corrupt or oversized records fail closed',async()=>{
  const small={engineVersion:'PVE_CONTINUOUS_V1',difficulty:{id:'FURNACE'},success:false};
  assert.deepEqual(await decodeScrapyardRecord(JSON.stringify(small)),small);
  assert.equal(await encodeScrapyardRecord(small),JSON.stringify(small));
  const large={...small,timeline:Array.from({length:6000},(_,seq)=>({seq,type:'SKILL_CHIP_HIT',title:'용광로 심부 · 상위',damage:123456789,targets:['가','나','다']}))};
  assert.ok(Buffer.byteLength(JSON.stringify(large))>700000);
  const stored=await encodeScrapyardRecord(large);assert.ok(Buffer.byteLength(stored)<100000);
  assert.ok(stored.includes('"engineVersion":"PVE_CONTINUOUS_V1"'));
  assert.deepEqual(await decodeScrapyardRecord(stored),large);
  for(const patch of [{decodedBytes:1},{decodedBytes:SCRAPYARD_RECORD_RAW_LIMIT+1},{data:'broken'},{difficulty:{id:'OUTER'}},{recordEncoding:'unknown'}])
    await assert.rejects(()=>decodeScrapyardRecord(JSON.stringify({...JSON.parse(stored),...patch})),{code:'SCRAPYARD_V3_RECORD'});
  await assert.rejects(()=>encodeScrapyardRecord({...small,data:'x'.repeat(SCRAPYARD_RECORD_RAW_LIMIT)}),{code:'SCRAPYARD_V3_PAYLOAD'});
  await assert.rejects(()=>encodeScrapyardRecord({...small,data:randomBytes(800000).toString('base64')}),{code:'SCRAPYARD_V3_PAYLOAD'});
});

async function longExpedition(t,postgres){
  const f=await jointFixture(t,{postgres});
  const cards=['HP','DEFENSE','DEFENSE','HP','DEFENSE'].map((power_type,i)=>({id:String(i+1),title:'검수 카드 '+i,power_type,rarity:'FUR',power:1000000,base_power:1000000,uniqueAbility:{hpPercent:1000,defensePercent:1000}}));
  const suit={code:'BATTLE_SUIT_03',skillChips:SKILL_CHIP_CATALOG.map(c=>c.code)},config={normalCount:40,simultaneous:3,maxActions:600,maxDuration:4,forcedMonsterEvery:6};
  const settings={mode:'ON',dailyRuns:30,difficulties:structuredClone(SCRAPYARD_REFORM_DIFFICULTIES),v3:{FURNACE_ELITE:config}};
  f.deps.raidDeckPower=async()=>({ids:cards.map(c=>c.id),cards,pet:null,characterBonus:{pve:3500000,battleSuitPve:3500000,equippedBattleSuit:suit},battleSettings:{engine:{}}});
  f.deps.readSettings=async()=>settings;
  const difficulty=settings.difficulties[3],snapshot=await loadScrapyardV3Snapshot(f.env,f.user,f.deps);
  const expected=JSON.parse(JSON.stringify(buildScrapyardV3Battle({snapshot,difficulty,config,seed:17})));
  assert.ok(Buffer.byteLength(JSON.stringify(expected))>850000,'real long encounter reproduces the former storage guard');
  assert.equal(expected.success,true);
  t.mock.method(crypto,'getRandomValues',array=>array.fill(17));
  const body={requestId:'large-frozen-expedition',difficulty:difficulty.id};
  return {...f,settings,expected,body,run:()=>runScrapyardV3(f.env,f.user,body,f.deps),ticket:async()=>Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SCRAPYARD_ENTRY_TICKET'").first()).quantity)};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: a >850KB encounter keeps every event, rolls rewards back and resumes exactly once`,async t=>{
  const f=await longExpedition(t,postgres),coin=await f.coin();
  f.fail('INSERT INTO scrapyard_runs_v1676');assert.equal((await f.run()).code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
  assert.equal(await f.ticket(),4);assert.equal(await f.coin(),coin);
  const op=await f.p('SELECT * FROM scrapyard_v3_operations_v1').first(),saved=await decodeScrapyardRecord(op.battle_json);
  assert.equal(JSON.parse(op.battle_json).recordEncoding,'SCRAPYARD_GZIP_V1');
  assert.ok(Buffer.byteLength(op.snapshot_json+op.battle_json+op.drop_plan_json)<700000);
  assert.deepEqual(saved.battleV2,f.expected.battleV2);
  assert.equal((await scrapyardV3RecoveryStatus(f.env,f.user)).difficulty,'FURNACE_ELITE');
  await f.p("UPDATE scrapyard_ticket_reservations_v1680 SET updated_at='2000-01-01 00:00:00'").run();
  const source=readFileSync(new URL('../functions/_scrapyard.js',import.meta.url),'utf8');
  const refundQuery=source.match(/prepare\(`(SELECT r\.request_id[^`]+LIMIT 3)`\)/)[1]
    .replaceAll('${TICKET_RESERVATION_TABLE}','scrapyard_ticket_reservations_v1680').replaceAll('${RECEIPT_TABLE}','scrapyard_run_receipts_v1676').replaceAll('${DROP_RECEIPT_TABLE}','unified_drop_receipts_v1667')
    .replace("datetime('now','-5 minutes')","'2001-01-01 00:00:00'"); // Fixed stale cutoff also works in the minimal PostgreSQL fixture.
  assert.deepEqual((await f.p(refundQuery,f.user.id).all()).results,[],'legacy stale recovery must not refund a compressed V3 reservation');
  f.fail('');f.settings.mode='OFF';f.deps.raidDeckPower=async()=>{throw Error('must resume the frozen battle');};
  const result=await f.run();assert.equal(result.status,'COMPLETED');assert.equal(result.success,true);assert.deepEqual(result.battleV2,f.expected.battleV2);
  assert.equal(await f.ticket(),4);assert.equal(await f.coin(),coin+300000000);
  const replay=await f.run(),lookup=await scrapyardV3Result(f.env,f.user,f.body.requestId);
  assert.deepEqual(replay,{...result,replayed:true});assert.deepEqual(lookup,replay);
  assert.equal(await f.ticket(),4);assert.equal(await f.coin(),coin+300000000);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM scrapyard_runs_v1676').first()).n),1);
  assert.equal((await scrapyardV3RecoveryStatus(f.env,f.user)).status,'IDLE');
});

test('oversized input is rejected before any ticket, receipt or currency mutation',async t=>{
  const f=await jointFixture(t),deck=f.deps.raidDeckPower;f.deps.readSettings=async()=>({mode:'ON',dailyRuns:30,difficulties:SCRAPYARD_REFORM_DIFFICULTIES});
  f.deps.raidDeckPower=async(...args)=>{const d=await deck(...args);d.cards[0].oversizedMetadata='가'.repeat(300000);return d;};
  const coin=await f.coin();await assert.rejects(()=>runScrapyardV3(f.env,f.user,{requestId:'oversize-no-charge',difficulty:'OUTER'},f.deps),{code:'SCRAPYARD_V3_PAYLOAD'});
  assert.equal(await f.coin(),coin);assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='SCRAPYARD_ENTRY_TICKET' AND user_id=7").first()).quantity),5);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM scrapyard_v3_operations_v1').first()).n),0);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM scrapyard_run_receipts_v1676').first()).n),0);
});

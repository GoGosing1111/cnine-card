import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {jointFixture} from './helpers/joint-db.mjs';
import {encodeExpeditionRecord,decodeExpeditionRecord,EXPEDITION_RECORD_RAW_LIMIT} from '../functions/_expedition_v3_record.js';
import {runExpeditionV3,expeditionV3Result,expeditionV3Status} from '../functions/_expedition_v3_runs.js';
import {readExpeditionPolicy} from '../functions/_expedition_v3_settings.js';
import {loadScrapyardV3Snapshot} from '../functions/_scrapyard_v3.js';
import {buildCowRoomBattle,COW_ROOM_DRAFT} from '../functions/_cow_room_v3.js';
import {cowPortalStatus} from '../functions/_cow_room_portal.js';
import {battleConfig} from '../functions/_mercenary_account.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';
import {COW_REFORM_TIERS,COW_REFORM_REWARDS} from '../shared/pve-reform-20261008.mjs';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';

test('plain legacy and large Korean records round-trip without dropping events; invalid streams stay bounded',async()=>{
  const small={requestId:'legacy-cow',difficulty:{id:'PASTURE'},status:'COMPLETED'};
  assert.equal(await encodeExpeditionRecord(small),JSON.stringify(small));
  assert.deepEqual(await decodeExpeditionRecord(JSON.stringify(small)),small);
  const large={...small,timeline:Array.from({length:8000},(_,seq)=>({seq,type:'BATTLE_SUIT_SHOT',title:'심연의 목초지 · 전투 기록',damage:123456789,target:'카우 킹'}))};
  assert.ok(Buffer.byteLength(JSON.stringify(large))>750000);
  const stored=await encodeExpeditionRecord(large);assert.ok(Buffer.byteLength(stored)<100000);
  assert.deepEqual(await decodeExpeditionRecord(stored),large);
  for(const patch of [{decodedBytes:1},{decodedBytes:EXPEDITION_RECORD_RAW_LIMIT+1},{data:'broken'},{recordEncoding:'unknown'}])
    await assert.rejects(()=>decodeExpeditionRecord(JSON.stringify({...JSON.parse(stored),...patch})),{code:'PVE_V3_RECORD'});
  await assert.rejects(()=>decodeExpeditionRecord('{broken'),{code:'PVE_V3_RECORD'});
  await assert.rejects(()=>encodeExpeditionRecord({...small,data:'x'.repeat(EXPEDITION_RECORD_RAW_LIMIT)}),{code:'PVE_V3_PAYLOAD'});
  await assert.rejects(()=>encodeExpeditionRecord({...small,data:randomBytes(750000).toString('base64')}),{code:'PVE_V3_PAYLOAD'});
});

async function longCow(t,postgres){
  const f=await jointFixture(t,{postgres});
  const policy={...await readExpeditionPolicy(f.env,'COW_ROOM'),clearCoin:[...COW_REFORM_REWARDS],dailyCoinCap:18000000000};
  await f.setting('expedition_v3_cow_room',policy);
  const cards=['HP','DEFENSE','DEFENSE','HP','DEFENSE'].map((power_type,i)=>({id:String(i+1),title:'검수 카드 '+i,power_type,rarity:'FUR',power:1000000,base_power:1000000,uniqueAbility:{hpPercent:1000,defensePercent:1000}}));
  const suit={code:'BATTLE_SUIT_OVERLORD',skillChips:SKILL_CHIP_CATALOG.map(c=>c.code)};
  f.deps.raidDeckPower=async()=>({ids:cards.map(c=>c.id),cards,pet:null,characterBonus:{pve:30000000,battleSuitPve:30000000,equippedBattleSuit:suit},battleSettings:{engine:{}}});
  f.deps.loadMercenaryBattleSnapshot=async()=>({...battleConfig(MERCENARY_CMS_SEED.document,'V-044',1),combat:MERCENARY_COMBAT_DRAFT});
  const snapshot=await loadScrapyardV3Snapshot(f.env,f.user,f.deps),tier=COW_REFORM_TIERS[2];
  const expected=JSON.parse(JSON.stringify(buildCowRoomBattle({snapshot,seed:17,config:{...COW_ROOM_DRAFT,normalPower:tier.normalPower,elitePower:tier.elitePower,bossPower:tier.bossPower}})));
  assert.ok(Buffer.byteLength(JSON.stringify(expected))>750000,'the actual cow engine reproduces the former guard');
  assert.equal(expected.battleV2.result.winner,'A');t.mock.method(crypto,'getRandomValues',array=>array.fill(17));
  const body={requestId:'large-cow-recovery',difficulty:tier.id};
  return{...f,policy,expected,body,run:()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps)};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: >750KB cow battle settles and replays every event exactly once after a failed reward transaction`,async t=>{
  const f=await longCow(t,postgres),coin=await f.coin();
  f.fail('INSERT INTO expedition_v3_progress_v1');
  await assert.rejects(()=>f.run(),{code:'PVE_V3_RESULT_PENDING'});
  assert.equal(await f.coin(),coin-250000);
  assert.equal((await cowPortalStatus(f.env,f.user)).available,5);
  const saved=await f.p('SELECT * FROM expedition_v3_runs_v1 WHERE user_id=7').first();
  assert.equal(saved.state,'PREPARED');assert.equal(JSON.parse(saved.checkpoint_json).recordEncoding,'EXPEDITION_GZIP_V1');
  assert.ok(Buffer.byteLength(saved.checkpoint_json)<750000);
  assert.deepEqual((await decodeExpeditionRecord(saved.checkpoint_json)).battle.battleV2,f.expected.battleV2);
  await f.setting('expedition_v3_cow_room',{...f.policy,mode:'OFF',clearCoin:[0,0,0]});
  f.setClock(Date.parse('2026-09-14T03:00:00Z'));f.deps.raidDeckPower=async()=>{throw Error('must reuse the frozen cow battle');};f.fail('');
  const result=await f.run();assert.equal(result.status,'COMPLETED');assert.equal(result.success,true);
  assert.deepEqual(result.battleV2,f.expected.battleV2);assert.equal(result.budget.day,'2026-09-13');
  assert.equal(await f.coin(),coin-250000+3000000000);assert.equal((await cowPortalStatus(f.env,f.user)).available,5);
  const stored=(await f.p('SELECT response_json FROM expedition_v3_runs_v1 WHERE user_id=7').first()).response_json;
  assert.equal(JSON.parse(stored).recordEncoding,'EXPEDITION_GZIP_V1');assert.ok(Buffer.byteLength(stored)<750000);
  assert.deepEqual(await f.run(),{...result,replayed:true});
  assert.deepEqual(await expeditionV3Result(f.env,f.user,'COW_ROOM',f.body.requestId),{...result,replayed:true});
  assert.equal((await expeditionV3Result(f.env,{id:8},'COW_ROOM',f.body.requestId)).status,'NOT_FOUND');
  assert.equal(await f.coin(),coin-250000+3000000000);assert.equal((await cowPortalStatus(f.env,f.user)).available,5);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_runs_v1').first()).n),1);
  assert.equal(Number((await f.p("SELECT attempts FROM expedition_v3_daily_v1 WHERE user_id=7 AND day_key='2026-09-13'").first()).attempts),1);
  assert.equal((await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps)).status,'IDLE');
});

test('oversized checkpoint is rejected before portal, coin, daily budget or receipt mutation',async t=>{
  const f=await jointFixture(t),snapshot=await loadScrapyardV3Snapshot(f.env,f.user,f.deps),coin=await f.coin();
  f.deps.loadSnapshot=async()=>({...snapshot,oversizedMetadata:'x'.repeat(EXPEDITION_RECORD_RAW_LIMIT)});
  await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',{requestId:'too-large-no-charge',difficulty:'PASTURE'},f.deps),{code:'PVE_V3_PAYLOAD'});
  assert.equal(await f.coin(),coin);assert.equal((await cowPortalStatus(f.env,f.user)).available,6);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_runs_v1').first()).n),0);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_daily_v1').first()).n),0);
});

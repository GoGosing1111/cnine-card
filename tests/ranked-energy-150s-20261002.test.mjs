import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {normalizeRankedRechargeMinutes,rankedEnergyFromRow} from '../shared/ranked-reform-v1.mjs';
import {inspect,setRankedRecharge,OPERATION_KEY} from '../scripts/ops/ranked-energy-150s-20261002.mjs';
const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const clean=Function('normalizeRankedRechargeMinutes',source.split(/\r?\n/).filter(line=>/^function (defaultPvpSettings|cleanPvpRewardCoin|cleanPvpSettings)\(/.test(line)).join('\n')+'\nreturn cleanPvpSettings;')(normalizeRankedRechargeMinutes);
const start=Date.parse('2026-10-02T00:00:00Z'),cfg={maxEnergy:10,costPerBattle:1,rechargeMinutes:2.5};
const energy=(elapsed,value=0)=>rankedEnergyFromRow({energy:value,last_recharged_at:'2026-10-02 00:00:00'},cfg,start+elapsed);

test('CMS settings preserve 2.5 minutes through save/read without changing integer fields',()=>{
 const settings=clean({energy:{...cfg,maxEnergy:10.8,costPerBattle:1.8}});
 assert.equal(settings.energy.rechargeMinutes,2.5);
 assert.equal(clean(JSON.parse(JSON.stringify(settings))).energy.rechargeMinutes,2.5);
 assert.equal(settings.energy.maxEnergy,10);assert.equal(settings.energy.costPerBattle,1);
 assert.equal(clean({}).energy.rechargeMinutes,2.5);
 assert.equal(clean({energy:{rechargeMinutes:'2.5'}}).energy.rechargeMinutes,2.5);
 assert.equal(clean({energy:{rechargeMinutes:'invalid'}}).energy.rechargeMinutes,2.5);
 assert.equal(clean({energy:{rechargeMinutes:-10}}).energy.rechargeMinutes,1);
 assert.equal(clean({energy:{rechargeMinutes:2000}}).energy.rechargeMinutes,1440);
});

test('ranked recharge occurs at exactly 150 seconds, preserves remainder, and stops at cap',()=>{
 assert.equal(energy(149999).energy,0);
 assert.equal(energy(149999).nextRechargeAt,'2026-10-02T00:02:30.000Z');
 assert.equal(energy(150000).energy,1);
 assert.equal(energy(299999).energy,1);
 assert.equal(energy(300000).energy,2);
 const remainder=energy(321000);assert.equal(remainder.energy,2);
 assert.equal(remainder.lastRechargedAt,'2026-10-02 00:05:00');
 assert.equal(remainder.nextRechargeAt,'2026-10-02T00:07:30.000Z');
 assert.equal(energy(150000,9).energy,10);assert.equal(energy(150000,9).nextRechargeAt,null);
 assert.equal(energy(86400000).energy,10);
});

test('public recharge text expresses 2.5 minutes as 2분 30초 and retains countdown',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const format=Function(app.split(/\r?\n/).find(line=>line.startsWith('function pvpRechargeIntervalText('))+'\nreturn pvpRechargeIntervalText;')();
 assert.equal(format(2.5),'2분 30초');assert.equal(format(5),'5분');assert.equal(format(undefined),'2분 30초');
 const timer=Function(app.split(/\r?\n/).find(line=>line.startsWith('function pvpEnergyText('))+'\nreturn pvpEnergyText;')();
 assert.equal(timer(150000),'02:30');assert.equal(timer(149000),'02:29');
});

test('operational change is atomic, reversible in dry-run, scoped to interval, and idempotent',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS $$ SELECT '2026-10-02 00:00:00' $$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE user_pvp_energy(user_id INTEGER,energy INTEGER,last_recharged_at TEXT); INSERT INTO user_pvp_energy VALUES(1,3,'2026-10-01 23:59:00');");
 const pvp={enabled:true,seasonName:'시즌 19',startsAt:'2026-10-01 16:00:00',endsAt:'2026-10-06 16:00:00',energy:{enabled:true,...cfg,rechargeMinutes:5}};
 for(const [key,value]of Object.entries({pvp_settings_v1:pvp,tier_settings_v1:{pvp,unrelated:{keep:true}}}))await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 const before=await inspect(db),players=(await db.query('SELECT * FROM user_pvp_energy')).rows;
 assert.equal((await setRankedRecharge(db)).dryRun,true);assert.deepEqual(await inspect(db),before);
 const failClient={query(sql,args){if(sql.startsWith('INSERT INTO app_meta'))throw Error('Receipt failure');return db.query(sql,args);}};
 await assert.rejects(setRankedRecharge(failClient,{commit:true}),/Receipt failure/);assert.deepEqual(await inspect(db),before);
 const result=await setRankedRecharge(db,{commit:true});assert.equal(result.committed,true);
 const expected=structuredClone(before);expected.pvp_settings_v1.energy.rechargeMinutes=2.5;expected.tier_settings_v1.pvp.energy.rechargeMinutes=2.5;
 const after=await inspect(db);delete after[OPERATION_KEY];assert.deepEqual(after,expected);
 assert.deepEqual((await db.query('SELECT * FROM user_pvp_energy')).rows,players);
 assert.equal((await setRankedRecharge(db,{commit:true})).replayed,true);
 assert.equal((await db.query('SELECT COUNT(*)::int count FROM app_meta')).rows[0].count,3);
});

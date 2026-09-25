import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {DUO_ACCOUNT_SOURCES,DUO_POLICY_SOURCES} from '../functions/_ranked_duo_schema.js';
import {prepareDuoAutomation,reconcileDuoSeason} from '../functions/_ranked_duo_seasons.js';
import {installRankedDuoSchema} from '../scripts/ops/ranked-duo-schema-20260925.mjs';

test('split production owners install their own triggers; restricted runtime and both inventory writers remain valid',async t=>{
 const f=await duoFixture(t,{postgres:true});
 const roles=['cnine_migrator','neondb_owner'];
 await f.pg.exec('CREATE ROLE cnine_migrator;CREATE ROLE neondb_owner;GRANT USAGE,CREATE ON SCHEMA public TO cnine_migrator,neondb_owner;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cnine_migrator,neondb_owner');
 const runtimeSources=new Set(['pvp_magic_presets','equipment_forge_states_v1','mercenary_cms_documents_v1','user_mercenary_cards_v1','user_mercenary_loadout_v1']);
 const sourceNames=[...DUO_ACCOUNT_SOURCES,...DUO_POLICY_SOURCES,'app_meta'];
 const existing=(await f.pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r=>r.table_name);
 for(const name of sourceNames.filter(n=>existing.includes(n)))await f.pg.exec(`ALTER TABLE ${name} OWNER TO ${runtimeSources.has(name)?roles[0]:roles[1]}`);
 let transactionRole=null;
 const as=role=>({async query(input,values){
  const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?values:input.values;
  if(transactionRole&&transactionRole!==role)throw Error('Overlapping test role transactions');
  if(!transactionRole)await f.pg.exec('SET ROLE '+role);
  try{
   if(sql==='BEGIN')transactionRole=role;
   if(args?.length){const r=await f.pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}
   const rows=(await f.pg.exec(sql)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return rows.length===1?rows[0]:rows;
  }finally{if(['COMMIT','ROLLBACK'].includes(sql))transactionRole=null;if(!transactionRole)await f.pg.exec('RESET ROLE');}
 }});
 const runtime=as(roles[0]),owner=as(roles[1]);
 const DB=new __postgresCompatTest.PostgresD1Database(runtime),env={DB};
 await assert.rejects(prepareDuoAutomation(env),/permission denied|must be owner/i);
 const database=(await f.pg.query('SELECT current_database() AS database')).rows[0].database;
 const installed=await installRankedDuoSchema({runtime,owner,expectedDatabase:database});
 assert.equal(installed.status,'READY');assert.ok(installed.triggers>=25);
 assert.deepEqual(await installRankedDuoSchema({runtime,owner,expectedDatabase:database}),{status:'ALREADY_READY',version:'20260925-24h'});
 await prepareDuoAutomation(env);
 assert.equal((await runtime.query("SELECT has_table_privilege(current_user,'user_cards','TRIGGER') AS allowed")).rows[0].allowed,false);
 await runtime.query('INSERT INTO ranked_duo_accounts_v1(user_id) VALUES(2)');
 await owner.query("UPDATE user_cards SET quantity=quantity+1 WHERE user_id=2 AND card_id='C-0'");
 await runtime.query("UPDATE user_cards SET quantity=quantity+1 WHERE user_id=2 AND card_id='C-0'");
 assert.equal(Number((await runtime.query('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=2')).rows[0].source_version),3);
 const before=Number((await runtime.query('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1')).rows[0].revision);
 await owner.query("UPDATE cards SET base_power=base_power+1 WHERE id='C-0'");
 await owner.query("UPDATE cards SET base_power=base_power+1 WHERE id='missing-card'");
 assert.equal(Number((await runtime.query('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1')).rows[0].revision),before+1);
 const result=await reconcileDuoSeason(env,{now:f.clock(),deps:f.deps,settings:{enabled:true,seasonName:'시즌 99',startsAt:new Date(f.clock()).toISOString(),endsAt:new Date(f.clock()+5*86400000).toISOString(),energy:{maxEnergy:5,rechargeMinutes:30,costPerBattle:1}}});
 assert.equal(result.phase,'RECRUITING');
 await assert.rejects(installRankedDuoSchema({runtime:owner,owner,expectedDatabase:database}),/Unexpected duo migration/);
});

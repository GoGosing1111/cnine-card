import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {out,OP,code,urls,snapshot,save,git,connect,safe} from './state.mjs';
import {replace} from './transaction.mjs';
const before=JSON.parse(fs.readFileSync(path.join(out,'baseline.json'))),assets=JSON.parse(fs.readFileSync(path.join(out,'assets.json'))),served=urls.map(url=>({...assets.find(x=>x.file===url.split('?')[0]),url}));
const input={before,urls,served,release:{head:git('rev-parse','HEAD')},production:before.production};let c;
try{
 c=connect();c.connectionParameters.application_name='dealer-namsudaeng-rollback-rehearsal';await c.connect();
 const original=(await c.query('SELECT * FROM avatar_catalog_v1 WHERE code=$1',[code])).rows[0];assert.deepEqual(JSON.parse(JSON.stringify(original)),before.catalog.find(x=>x.code===code));
 const audits=async()=>(await c.query("SELECT COUNT(*)::int n FROM admin_logs WHERE action_type='AVATAR_RENAME_ART_REPLACE' AND target_id=$1",[code])).rows[0].n;
 const oldAudits=await audits();
 for(const failAt of ['catalog','audit']){await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await assert.rejects(replace(c,{...input,failAt}),new RegExp('EXPECTED_FAILURE_'+failAt));await c.query('ROLLBACK');assert.deepEqual((await c.query('SELECT * FROM avatar_catalog_v1 WHERE code=$1',[code])).rows[0],original);}
 await c.query('BEGIN');const first=await replace(c,input);assert.equal(first.writes,3);const replay=await replace(c,input);assert.equal(replay.writes,0);assert.deepEqual(first.receipt,replay.receipt);await c.query('ROLLBACK');
 assert.deepEqual((await c.query('SELECT * FROM avatar_catalog_v1 WHERE code=$1',[code])).rows[0],original);assert.equal((await c.query('SELECT COUNT(*)::int n FROM app_meta WHERE key=$1',[OP])).rows[0].n,0);assert.equal(await audits(),oldAudits);
 await c.query('BEGIN READ ONLY');assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(c))),{catalog:before.catalog,effects:before.effects,ownership:before.ownership,loadouts:before.loadouts,settings:before.settings});await c.query('ROLLBACK');
 const report={at:new Date().toISOString(),failureAfterCatalogRolledBack:true,failureAfterAuditRolledBack:true,fullRehearsalRolledBack:true,inTransactionReplayWrites:0,catalogVersionUnchanged:original.version,persistentWrites:0,ownershipEffectsAndSettingsUnchanged:true};save('db-rehearsal',report);console.log(JSON.stringify(report));
}catch(e){await c?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await c?.end().catch(()=>{});}

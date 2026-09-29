import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRequestSettingsCache} from '../functions/_request_settings_cache.js';

const source=readFileSync(new URL('../functions/_escort_operation.js',import.meta.url),'utf8');
function foundation(){
  const start=source.indexOf('const schemaReadyCache='),end=source.indexOf('async function settings(env)',start);
  return Function('createRequestSettingsCache',`const RUN_TABLE='pve_escort_runs_v1830',WEEKLY_TABLE='pve_escort_weekly_v1830',RECEIPT_TABLE='pve_escort_action_receipts_v1830';${source.slice(start,end)};return {ensure,schemaStatements};`)(createRequestSettingsCache);
}
test('existing PostgreSQL escort storage is read-only even in a new isolate; missing schema still repairs',async()=>{
  const pg=new PGlite();let ddl=0,reads=0;
  const env={DB:{dialect:'postgres',prepare:sql=>({first:async()=>{reads++;return (await pg.query(sql)).rows[0];}}),async execSchema(statements){ddl++;await pg.exec(['BEGIN',...statements,'COMMIT'].join(';'));}}};
  try{
    // Empty database retains the original safe initialization path.
    await foundation().ensure(env);assert.equal(ddl,1);
    const warm=foundation();await warm.ensure(env);assert.equal(ddl,1);
    const count=reads;await warm.ensure(env);assert.equal(reads,count);
    // Fresh isolates probe relations and indexes without taking ALTER locks.
    await foundation().ensure(env);assert.equal(ddl,1);
    await pg.exec('DROP INDEX idx_pve_escort_runs_user_v1830');
    await foundation().ensure(env);assert.equal(ddl,2);
    await pg.exec('ALTER TABLE pve_escort_runs_v1830 DROP COLUMN reward_tickets');
    await foundation().ensure(env);assert.equal(ddl,3);
    assert.equal((await pg.query("SELECT COUNT(*)::int n FROM pg_attribute WHERE attrelid='pve_escort_runs_v1830'::regclass AND attname='reward_tickets' AND NOT attisdropped")).rows[0].n,1);
  }finally{await pg.close();}
});

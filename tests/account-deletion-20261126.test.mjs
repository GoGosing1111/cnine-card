import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {handleAccountDeletionRequest,handleAccountDeletionStatus} from '../functions/_account_deletion_request.js';
import {runAccountDeletionQueue} from '../functions/_account_deletion_queue.js';
import {fulfillAccountDeletion} from '../scripts/ops/fulfill-account-deletion.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

test('consent, ownership, guarded retirement, cache cleanup and private receipt expiry', async()=>{
 const pg=new PGlite();
 const client={async query(query,args){
   const r=typeof query==='string'?await pg.query(query,args):await pg.query(query.text,query.values||[]);
   return {...r,rowCount:r.affectedRows??r.rows.length};
 }};
 const translated=new __postgresCompatTest.PostgresD1Database(client);
 await pg.exec("CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text); INSERT INTO users VALUES(3,'alpha','USER','ACTIVE'),(8,'beta','USER','ACTIVE');CREATE TABLE app_meta(key text);CREATE TABLE peer_history(user_id bigint,opponent_id bigint);INSERT INTO peer_history VALUES(8,3);");
 for(const t of ['sessions','user_cards','pve_decks','revoked_player_sessions_v1533','account_sync_versions_v1'])await pg.exec('CREATE TABLE '+t+'(user_id bigint); INSERT INTO '+t+' VALUES(3),(8)');
 await pg.exec(await readFile(new URL('../database/migrations/account-deletion-requests-v1.sql',import.meta.url),'utf8'));
 const origin='https://cnine-card.pages.dev',env={DB:translated};
 const request=(route,body)=>new Request(origin+'/api/account/'+route,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const apply=(body,account=3)=>handleAccountDeletionRequest(request('deletion-request',body),env,async()=>account?{id:account,nickname:account===3?'alpha':'beta'}:null);
 const status=(receipt)=>handleAccountDeletionStatus(request('deletion-status',{receipt}),env);
 try {
  assert.equal((await apply(null,0)).status,401);
  assert.equal((await apply({confirm:false,expectedAccount:'3'})).status,400);
  assert.equal((await apply({confirm:true,expectedAccount:'8'})).status,409);
  const submit=()=>apply({confirm:true,expectedAccount:'3'}).then(r=>r.json());
  const first=await submit(), receipt=first.request.receipt;
  assert.equal((await submit()).request.receipt,receipt);
  assert.equal((await (await apply(null,8)).json()).request,null);
  assert.equal((await (await status(receipt)).json()).status,'pending');
  assert.equal((await status(crypto.randomUUID())).status,404);
  const work=(action,reviewed=false)=>fulfillAccountDeletion(client,{id:3,receipt,action,reviewed});
  assert.deepEqual((await work('preview')).blockers,['peer_history']);
  await work('freeze');
  assert.equal((await pg.query('SELECT count(*)::int n FROM sessions WHERE user_id=3')).rows[0].n,0);
  assert.deepEqual((await work('retire',true)).blockers,['peer_history']);
  assert.equal((await pg.query('SELECT count(*)::int n FROM peer_history')).rows[0].n,1);
  // Simulate staff reconciliation of a shared fixture prior to retrying.
  await pg.exec("UPDATE peer_history SET opponent_id=NULL WHERE opponent_id=3");
  await assert.rejects(work('retire',true),/drain/);
  await pg.exec("UPDATE account_deletion_requests_v1 SET locked_at=now()-INTERVAL '2 minutes'");
  await assert.rejects(work('retire'),/Review/);
  assert.equal((await work('retire',true)).retired,true);
  await pg.exec("UPDATE account_deletion_requests_v1 SET retired_at=now()-INTERVAL '2 minutes'");
  let fails=true;
  const sync={getByName:id=>({eraseAccount:async actual=>{assert.equal(String(actual),id);if(fails)throw Error('retry');return true;}})};
  const run=()=>runAccountDeletionQueue({HYPERDRIVE:{connectionString:'test'},ACCOUNT_SYNC:sync,COOP_PLAYERS:{getByName:()=>({getRoom:async()=>null})}},Date.UTC(2026,0,1),async()=>({db:translated,close:async()=>{}}));
  await run();assert.equal((await (await status(receipt)).json()).status,'pending');
  fails=false;await run();assert.equal((await (await status(receipt)).json()).status,'completed');
  const row=(await pg.query('SELECT * FROM account_deletion_requests_v1')).rows[0];
  assert.equal(row.user_id,null);assert.equal(row.receipt,null);assert.equal(row.locked_at,null);
  assert.deepEqual((await pg.query('SELECT id::int FROM users')).rows,[{id:8}]);
  await pg.exec("UPDATE account_deletion_requests_v1 SET completed_at=now()-INTERVAL '91 days'");
  assert.equal((await status(receipt)).status,404);await run();
  assert.equal((await pg.query('SELECT count(*)::int n FROM account_deletion_requests_v1')).rows[0].n,0);
 } finally {await pg.close();}
});

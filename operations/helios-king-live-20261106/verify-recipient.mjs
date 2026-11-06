import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const db=connect();
try{
 await db.connect();
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query("SET LOCAL statement_timeout='20s'");
 const owners=(await db.query('SELECT c.user_id::text,u.nickname,c.mercenary_code,c.total_copies,c.duplicate_count FROM user_mercenary_cards_v1 c JOIN users u ON u.id=c.user_id WHERE c.mercenary_code=$1 ORDER BY c.user_id',['V-966'])).rows;
 assert.equal(owners.length,1);
 assert.equal(owners[0].user_id,'1');
 assert.equal(owners[0].nickname,'핑크빛유두');
 assert.equal(Number(owners[0].total_copies),1);
 const acquisition=(await db.query('SELECT acquisition_id,user_id::text,mercenary_code FROM mercenary_card_acquisitions_v1 WHERE mercenary_code=$1 ORDER BY acquisition_id',['V-966'])).rows;
 assert.equal(acquisition.length,1);
 assert.equal(acquisition[0].acquisition_id,'ops:pingdu-helios-king-grant:20261106:v1:1:V-966:1');
 const liveLeases=(await db.query("SELECT user_id::text FROM user_mutation_locks_v1520 WHERE action_path=$1 AND lease_until_ms>$2",['ops:pingdu-helios-king-grant:20261106:v1',Date.now()])).rows;
 assert.deepEqual(liveLeases,[]);
 const result={at:new Date().toISOString(),readOnly:true,owners,acquisitions:acquisition,liveLeases:0,otherRecipients:0};
 await db.query('ROLLBACK');
 fs.writeFileSync(new URL('recipient-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(safe(error));process.exitCode=1;}finally{await db.end();}

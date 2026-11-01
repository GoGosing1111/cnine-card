import fs from 'node:fs';import assert from 'node:assert/strict';import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const db=connect(),keys=['raid_blackwing_settings_v1','reward_reveal_policy_v1:BLACKWING','raid_madara_settings_v1','reward_reveal_policy_v1:MADARA','ops:blackwing-reward20t-scroll30:20261101:v1'];
try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows,settings=Object.fromEntries(keys.map(k=>[k,rows.find(r=>r.key===k)?.value??null]));
 const items=(await db.query('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[['WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL']])).rows;
 const clock=(await db.query("SELECT CURRENT_TIMESTAMP now,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') kst")).rows[0];
 const rooms=(await db.query("SELECT status,COUNT(*)::int count FROM raid_blackwing_rooms_v1 WHERE status IN ('LOBBY','ACTIVE') GROUP BY status ORDER BY status")).rows;
 assert.deepEqual((await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0')).rows,[]);await db.query('ROLLBACK');
 const report={clock,settings,items,rooms,readOnly:true,writes:0};fs.writeFileSync(new URL('preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({clock,settings:JSON.parse(settings[keys[0]]),items,rooms,priorOperation:settings[keys[4]]}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}

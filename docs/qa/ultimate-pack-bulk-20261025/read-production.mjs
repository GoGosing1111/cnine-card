import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {connect,safeError} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/territory-finish-rewards-20261022/connect.mjs';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {ultimateBulkDependencies} from '../../../functions/api/[[path]].js';
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});let db;
try{
 db=await connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='500ms'");
 const pack=(await db.query("SELECT * FROM card_packs WHERE id='ultimate'")).rows[0];
 const rates=(await db.query("SELECT rarity,rate FROM card_pack_rates WHERE pack_id='ultimate' ORDER BY rarity")).rows;
 const settings=(await db.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_bloodmoon_ss_pack_v1','mercenary_halloween_ss_pack_v1','critical_enabled','critical_chance','critical_bonus','critical_effects') ORDER BY key")).rows.map(r=>({key:r.key,sha256:createHash('sha256').update(r.value).digest('hex')}));
 const columns=(await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','cards','user_cards','cnine_user_inventory','draw_request_receipts_v2','limited_acquisition_audit','joint_atomic_guards_v1') ORDER BY table_name,ordinal_position")).rows;
 const inventory=(await db.query("SELECT rarity,COUNT(*)::integer AS types FROM cards_effective_v1210 WHERE is_active=1 AND card_status='PUBLIC' GROUP BY rarity ORDER BY rarity")).rows;
 const deps=ultimateBulkDependencies(),env={DB:new __postgresCompatTest.PostgresD1Database(db)};
 const context=await deps.queryContext(env,pack),critical=await deps.criticalSettings(env);
 await db.query('ROLLBACK');const result={at:new Date().toISOString(),mode:'READ ONLY',productionWrites:0,pack,rates,settings,columns,inventory,critical,context:{...context,poolsByGrade:[...context.poolsByGrade]}};fs.writeFileSync(path.join(out,'production-before.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({price:pack.price,rates,normalTypes:[...context.poolsByGrade.values()].reduce((n,a)=>n+a.length,0),limitedTypes:context.limitedCards.length,critical,columnCount:columns.length,productionWrites:0}));
}catch(e){console.error(safeError(e));process.exitCode=1;}finally{if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}}

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {connect,safeError} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/territory-finish-rewards-20261022/connect.mjs';
import {cleanSuperstarPackSettings} from '../../../functions/_superstar_pack.js';
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});let db;
try{
 db=await connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='500ms'");
 const settingsRows=(await db.query("SELECT key,value FROM app_meta WHERE key IN ('superstar_pack_settings_v1','superstar_pack_public_release_v2047','mercenary_bloodmoon_ss_pack_v1','mercenary_halloween_ss_pack_v1','critical_enabled','critical_chance','critical_bonus','critical_effects') ORDER BY key")).rows;
 const settings=cleanSuperstarPackSettings(JSON.parse(settingsRows.find(r=>r.key==='superstar_pack_settings_v1')?.value||'{}'));
 const cards=(await db.query("SELECT c.id,c.title,m.name,c.image_url AS image,c.focus_x AS \"focusX\",c.focus_y AS \"focusY\",c.power_type AS \"powerType\",c.base_power AS \"basePower\" FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity)='SUPERSTAR' AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 ORDER BY c.id")).rows;
 const columns=(await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('superstar_pack_receipts_v1','superstar_pack_debits_v1','user_cards','draw_logs') ORDER BY table_name,ordinal_position")).rows;
 const hashes=settingsRows.map(r=>({key:r.key,sha256:createHash('sha256').update(r.value).digest('hex')}));await db.query('ROLLBACK');
 const result={at:new Date().toISOString(),mode:'READ ONLY',productionWrites:0,settings,cards,columns,hashes};fs.writeFileSync(path.join(out,'production.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({settings,types:cards.length,moneyColumns:columns.filter(c=>c.column_name==='cost'),productionWrites:0}));
}catch(e){console.error(safeError(e));process.exitCode=1;}finally{if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}}

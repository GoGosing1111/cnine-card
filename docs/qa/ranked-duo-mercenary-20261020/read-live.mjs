import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import pg from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {rankedDuoPoolCount,rankedDuoPoolCandidates,rankedDuoPoolContains} from '../../../functions/_ranked_duo_pool.js';
import {readMercenaryModes} from '../../../functions/_mercenary_loadout_modes.js';

const phase=process.argv[2];
assert(['before','after'].includes(phase));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const client=new pg.Client({connectionString,application_name:'ranked-duo-mercenary-read-only',connectionTimeoutMillis:15000});
try{
 await client.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query("SET LOCAL statement_timeout='15s'");
 const identity=(await client.query('SELECT current_user AS role,current_database() AS db')).rows[0];
 assert.equal(identity.role,'cnine_migrator');assert.equal(identity.db,'cnine');
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)},now=Date.now();
 const oldPool=Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM pvp_decks d JOIN users u ON u.id=d.user_id
  LEFT JOIN pvp_active_presets a ON a.user_id=d.user_id
  LEFT JOIN pvp_deck_presets pr ON pr.user_id=a.user_id AND pr.preset_no=a.preset_no
  WHERE u.status='ACTIVE' AND u.role<>'OWNER'
   AND (u.banned_until IS NULL OR SUBSTR(REPLACE(u.banned_until,'T',' '),1,19)<=?)
   AND CASE WHEN json_valid(d.card_ids) THEN json_array_length(d.card_ids) ELSE 0 END=5
   AND CASE WHEN json_valid(CASE WHEN COALESCE(a.preset_no,1)=1 THEN COALESCE(pr.card_ids,d.card_ids) ELSE pr.card_ids END)
    THEN json_array_length(CASE WHEN COALESCE(a.preset_no,1)=1 THEN COALESCE(pr.card_ids,d.card_ids) ELSE pr.card_ids END) ELSE 0 END=5
 `).bind(new Date(now).toISOString().replace('T',' ').slice(0,19)).first()).n);
 const poolCount=await rankedDuoPoolCount(env,now),ids=await rankedDuoPoolCandidates(env,0,now),slots=await readMercenaryModes(env,ids);
 assert(poolCount>=4&&poolCount<=oldPool);assert.equal(new Set(ids).size,ids.length);assert(ids.length<=23);
 assert(ids.every(id=>Boolean(slots.get(id)?.loadouts.PVP.mercenaryCode)));
 assert(await rankedDuoPoolContains(env,ids,now));
 const season=(await client.query("SELECT s.id,s.status,s.config_json FROM ranked_duo_seasons_v1 s JOIN app_meta m ON m.key='ranked_duo_current_v1' AND m.value=s.id")).rows[0],config=JSON.parse(season.config_json);
 assert.equal(season.status,'ACTIVE');assert.equal(config.entryMode,'RANKED_POOL');
 await client.query('ROLLBACK');
 const result={phase,checkedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),readOnly:true,oldPoolCount:oldPool,poolCount,excludedWithoutOwnedPvpMercenary:oldPool-poolCount,sampled:ids.length,allSampledHaveOwnedPvpMercenary:true,seasonId:season.id,status:season.status,entryMode:config.entryMode,gameplayActions:0};
 writeFileSync(new URL(`${phase}.json`,import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 await client.query('ROLLBACK').catch(()=>{});
 console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;
}finally{await client.end();}

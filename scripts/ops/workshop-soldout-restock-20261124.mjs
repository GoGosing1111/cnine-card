import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {LIMITED_SHARD_CRAFTS,LIMITED_CRAFT_STOCK_MAX} from '../../shared/mercenary-limited-shard-craft-v1.mjs';
import {validateMercenaryCraft} from '../../shared/mercenary-craft-v1.mjs';

const operation='ops:workshop-soldout-restock:20261124:v1';
const mode=process.argv[2];
assert(['dry-run','apply','verify'].includes(mode));
const cli=process.env.LOCALAPPDATA+'/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js';
let db;
try {
 const raw=execFileSync(process.execPath,[cli,'connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:20000,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const connectionString=raw.trim().replace(/^['"]|['"]$/g,'');
 const url=new URL(connectionString);
 assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
 db=new pg.Client({connectionString,connectionTimeoutMillis:8000,application_name:'workshop-soldout-restock-20261124'});
 await db.connect();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await q(mode==='verify'?'BEGIN READ ONLY':'BEGIN');
 await q("SET LOCAL lock_timeout='5s'");
 await q("SET LOCAL statement_timeout='20s'");
 if(mode!=='verify')await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operation]);
 const prior=(await q('SELECT value FROM app_meta WHERE key=$1',[operation]))[0];
 const definitions=new Map(LIMITED_SHARD_CRAFTS.map(d=>[d.key,d]));
 if(mode!=='verify')await q('SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[...definitions.keys()]]);
 const settings=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[...definitions.keys()]]);
 const counts=await q("SELECT r.code, SUM(l.output_quantity) AS crafted FROM workshop_recipes_v1668 r JOIN workshop_craft_logs_v1668 l ON l.recipe_id=r.id AND l.output_ref=r.output_ref WHERE r.code=ANY($1::text[]) AND l.output_type='MERCENARY' AND l.success=1 GROUP BY r.code",[LIMITED_SHARD_CRAFTS.map(d=>d.recipeCode)]);
 const craftedByRecipe=new Map(counts.map(row=>[row.code,Number(row.crafted)]));
 if(prior){
  const saved=JSON.parse(prior.value);
  const current=saved.rows.map(row=>{
   const s=settings.find(s=>s.key===row.key),d=definitions.get(row.key);
   const policy=validateMercenaryCraft(JSON.parse(s.value),d);
   assert(policy.revision>=row.revision&&policy.stockLimit>=row.after);
   return {...row,limit:policy.stockLimit,remaining:Math.max(0,policy.stockLimit-(craftedByRecipe.get(d.recipeCode)||0))};
  });
  const audit=(await q('SELECT action_type FROM admin_logs WHERE id=$1',[saved.auditId]))[0];
  assert.equal(audit?.action_type,'OPS_MERCENARY_WORKSHOP_SOLDOUT_RESTOCK');
  await q('ROLLBACK');
  console.log(JSON.stringify({...saved,rows:current,verified:true},null,2));
 }else{
  assert.notEqual(mode,'verify','Operation receipt is missing');
  assert.equal((await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).length,1);
  const rows=[];
  for(const setting of settings){
   const d=definitions.get(setting.key),raw=JSON.parse(setting.value),policy=validateMercenaryCraft(raw,d);
   const crafted=craftedByRecipe.get(d.recipeCode)||0;
   if(crafted<policy.stockLimit)continue;
   const added=d.code==='V-979'||d.code==='V-988'?5:10;
   const next={...raw,revision:policy.revision+1,stockLimit:policy.stockLimit+added};
   assert(next.stockLimit<=LIMITED_CRAFT_STOCK_MAX&&next.stockLimit>crafted);
   validateMercenaryCraft(next,d);
   const updated=await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(next),d.key,setting.value]);
   assert.equal(updated.length,1);
   rows.push({key:d.key,code:d.code,name:d.art.name,recipe:d.recipeCode,before:policy.stockLimit,after:next.stockLimit,crafted,added,remaining:next.stockLimit-crafted,revision:next.revision,enabled:policy.isActive,public:policy.isPublic});
  }
  assert(rows.length>0);
  const receipt={operation,rows,totalAdded:rows.reduce((sum,row)=>sum+row.added,0)};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id::text',['OPS_MERCENARY_WORKSHOP_SOLDOUT_RESTOCK','MERCENARY_CRAFT',operation,JSON.stringify(rows.map(({key,before,crafted})=>({key,before,crafted}))),JSON.stringify(receipt)]);
  receipt.auditId=audit.id;
  await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[operation,JSON.stringify(receipt)]);
  await q(mode==='apply'?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({...receipt,committed:mode==='apply'},null,2));
 }
}catch(error){
 if(db)await db.query('ROLLBACK').catch(()=>{});
 console.error('Restock failed:',error.code||error.name);
 process.exitCode=1;
}finally{if(db)await db.end();}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
const out=path.resolve(process.argv[2]);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const c=new pg.Client({connectionString,application_name:'mercenary-levels-preflight',connectionTimeoutMillis:15000});
const q=async(sql,args=[])=>{const start=Date.now();try{const rows=(await c.query(sql,args)).rows;console.log(JSON.stringify({query:sql.slice(0,110),elapsedMs:Date.now()-start,rows:rows.length}));return rows;}catch(e){throw Error(sql.slice(0,110)+': '+e.message);}};
const targets=[{id:'4111',nickname:'족게이다',code:'V-979',name:'족로',level:16,identityHash:'3359892e211e4b81aebd2928068ef48b8e543ccafbe022d69fe176e18f29737b'},{id:'81',nickname:'비쥬얼깡패',code:'V-996',name:'발테르',level:20,identityHash:'6050169c2537716e2a3995c7ea229bfe50a0437e9f01c9f58a1f1544e0b587a4'}];
try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
 const records=[];
 for(const t of targets){
  const users=await q('SELECT id::text,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[t.id,t.nickname]);assert.equal(users.length,1);for(const k of ['id','nickname'])assert.equal(users[0][k],t[k]);assert.equal(users[0].status,'ACTIVE');assert.equal(users[0].role,'USER');
  const links=await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=$1',[t.id]);assert.equal(links.length,1);const identityHash=createHash('sha256').update(JSON.stringify({provider:links[0].provider,providerUserId:links[0].provider_user_id})).digest('hex');assert.equal(identityHash,t.identityHash);
  const cards=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[t.id,t.code]);assert.equal(cards.length,1);assert(Number(cards[0].total_copies)>0);
  const levels=await q('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2',[t.id,t.code]);assert.equal(levels.length,1);
  const stock=await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[t.code]);
  const op='ops:'+(t.id==='4111'?'jokgeida-jokro-level16':'visualgang-valter-level20')+':20261027:v1';
  const receipt=await q('SELECT value FROM app_meta WHERE key=$1',[op]);
  records.push({target:t,user:users[0],identityHash,cards,levels,stock,operationKey:op,operationExists:receipt.length>0});
 }
 const policy=(await q("SELECT value FROM app_meta WHERE key='mercenary_level_policy_v1'"))[0];assert(policy);
 const data={checkedAt:new Date().toISOString(),records,policy:JSON.parse(policy.value)};
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'preflight.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({...data,policy:{revision:data.policy.revision,mode:data.policy.mode,levels:data.policy.levels.filter(x=>[16,20].includes(x.level))}},null,2));
 await c.query('ROLLBACK');
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}
finally{await c.end();}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {HALLOWEEN_PACK_KEY} from '../../shared/mercenary-halloween-pack-v1.mjs';
import {OPERATION_KEY,documentHash,applyHalloweenJokroJinmuOdds,verifyHalloweenJokroJinmuOdds} from './halloween-jokro-jinmu-odds-20261021.mjs';

const [mode,expectedDocumentHash]=process.argv.slice(2);
assert(['read','dry-run','apply','verify'].includes(mode),'Expected read|dry-run|apply|verify [reviewed document SHA256]');
if(['dry-run','apply'].includes(mode))assert(/^[a-f0-9]{64}$/.test(expectedDocumentHash||''),'Freshly reviewed document hash required');
const directory=path.resolve(process.env.HALLOWEEN_JOKRO_JINMU_ODDS_RECORD_DIR||'docs/qa/halloween-jokro-jinmu-odds-20261021');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine','Unexpected database destination');
const db=new pg.Client({connectionString,application_name:'halloween-jokro-jinmu-odds-20261021',connectionTimeoutMillis:15000});
const snapshot=async()=>({
  setting:(await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value,
  stock:(await db.query("SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code IN ('V-979','V-989') ORDER BY code")).rows,
  operation:(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows
});
const save=async data=>{await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,mode+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});};
try{
  await db.connect();
  if(mode==='read'){
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const before=await snapshot(),document=JSON.parse(before.setting),hash=documentHash(before.setting);
    await db.query('ROLLBACK');
    await save({checkedAt:new Date().toISOString(),documentHash:hash,document,stock:before.stock,operationExists:before.operation.length>0});
    console.log(JSON.stringify({mode,revision:document.revision,documentHash:hash,settings:document.settings,stock:before.stock,operationExists:before.operation.length>0}));
  }else if(mode==='verify'){
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await verifyHalloweenJokroJinmuOdds(db);await db.query('ROLLBACK');
    await save({...result,independentConnection:true,verifiedAt:new Date().toISOString()});
    console.log(JSON.stringify({mode,status:result.status,revision:result.currentRevision,adminLogId:result.receipt.adminLogId,effectivePercents:result.receipt.effectivePercents}));
  }else{
    const before=mode==='dry-run'?await snapshot():null;
    const result=await applyHalloweenJokroJinmuOdds(db,{dryRun:mode==='dry-run',expectedDocumentHash});
    if(before)assert.deepEqual(await snapshot(),before,'Dry-run must roll back setting, receipt and stock');
    if(mode==='apply'){
      const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql),'Replay must not write');return db.query(sql,args);}};
      const replay=await applyHalloweenJokroJinmuOdds(noWrites,{dryRun:false,expectedDocumentHash});
      assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
    }
    await save({...result,...(before?{rollbackVerified:true}:{noWriteReplayVerified:true})});
    console.log(JSON.stringify({mode,status:result.status,replayed:result.replayed,revision:result.currentRevision,adminLogId:result.receipt.adminLogId,effectivePercents:result.receipt.effectivePercents,stockChanged:false}));
  }
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}
finally{await db.end();}

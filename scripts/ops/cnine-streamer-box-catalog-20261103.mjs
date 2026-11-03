// Registers one item catalog entry. Never grants items or edits player balances.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {CNINE_STREAMER_BOX as gift} from '../../shared/cnine-streamer-box-v1.mjs';
import {CNINE_STREAMER_BOX_CATALOG_KEY as catalogKey} from '../../functions/_cnine_streamer_box.js';
import {REVERSECALL_STREAMER_GIFT as original} from '../../shared/reversecall-streamer-gift-v1.mjs';
const mode=process.argv[2];
assert.ok(['inspect','rehearse','register','verify'].includes(mode),'Use inspect, rehearse, register or verify');
const key='ops:cnine-streamer-box-catalog:20261103:v1';
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);
assert.ok(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine','Unexpected database destination');
const connect=()=>new pg.Client({connectionString,application_name:'cnine-streamer-box-catalog-'+mode,connectionTimeoutMillis:10000,statement_timeout:15000});
const client=connect();
const expected={code:gift.code,name:gift.name,subtitle:'CNINE STREAMER BOX',description:gift.description,category:'GIFT_BOX',rarity:'SPECIAL',image_url:gift.image,sort_order:45,is_active:1};
const read=async db=>({
 item:(await db.query('SELECT code,name,subtitle,description,category,rarity,image_url,sort_order,is_active FROM inventory_items WHERE code=$1',[gift.code])).rows[0]||null,
 original:(await db.query('SELECT code,name,description,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1',[original.code])).rows[0],
 contents:(await db.query("SELECT code,name,is_active FROM inventory_items WHERE code IN ('MASTER_STAR','SUIT_CORE_6','PINGDU_REPAIR_COUPON') ORDER BY code")).rows,
 holdings:(await db.query('SELECT COUNT(*)::int accounts,COALESCE(SUM(quantity),0)::text quantity FROM cnine_user_inventory WHERE item_code=$1',[gift.code])).rows[0],
 receipt:(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0]?.value||null
});
function verify(state,registered=false){
 assert.equal(state.original?.name,original.name);assert.equal(state.original?.description,original.description);assert.equal(state.original?.image_url,original.image);assert.equal(Number(state.original?.is_active),1);
 assert.equal(state.contents.length,3);assert.ok(state.contents.every(x=>Number(x.is_active)===1));
 if(registered)assert.ok(state.item,'New catalog entry must exist');
 if(state.item)for(const [k,v]of Object.entries(expected))assert.equal(typeof v==='number'?Number(state.item[k]):state.item[k],v,'Existing catalog mismatch: '+k);
}
async function insert(db,{failAfterItem=false}={}){
 await db.query('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(code) DO NOTHING',Object.values(expected));
 if(failAfterItem)throw Error('QA catalog failure after insert');
 await db.query("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[catalogKey]);
 await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify({operation:key,itemCode:gift.code,coin:gift.coin,masterStar:gift.masterStar,repairCoupon:gift.repairCoupon,suitCore6:gift.suitCore6,accountGrants:0,completedAt:new Date().toISOString()})]);
}
try{
 await client.connect();await client.query('BEGIN READ ONLY');const before=await read(client);verify(before,mode==='verify');await client.query('COMMIT');
 let writes=0;const rehearsals=[];
 if(mode==='rehearse'){
  for(const failAfterItem of [true,false]){
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
   try{await insert(client,{failAfterItem});verify(await read(client),true);assert.equal(failAfterItem,false);}catch(e){if(!failAfterItem||e.message!=='QA catalog failure after insert')throw e;}
   finally{await client.query('ROLLBACK');}
   await client.query('BEGIN READ ONLY');assert.deepEqual(await read(client),before);await client.query('COMMIT');rehearsals.push({failureInjected:failAfterItem,rolledBack:true});
  }
 }
 if(mode==='register'&&!before.receipt){
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  try{const locked=await read(client);verify(locked);if(!locked.receipt){await insert(client);writes=1;}verify(await read(client),true);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}
 }
 await client.query('BEGIN READ ONLY');const after=await read(client);verify(after,mode==='register'||mode==='verify');await client.query('COMMIT');
 assert.deepEqual(after.original,before.original);assert.deepEqual(after.contents,before.contents);assert.deepEqual(after.holdings,before.holdings);
 const report={mode,operation:key,checkedAt:new Date().toISOString(),before,after,rehearsals,registrationTransactions:writes,accountGrantsExecuted:0,playerBalanceWrites:0,messagesSent:0};
 if(process.env.CNINE_STREAMER_CATALOG_REPORT)await fs.writeFile(process.env.CNINE_STREAMER_CATALOG_REPORT,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await client.end();}

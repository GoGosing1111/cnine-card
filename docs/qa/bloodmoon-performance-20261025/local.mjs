import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {Client} from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {pickBloodmoonBulk} from '../../../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {createBloodmoonBulkRandom} from '../../../functions/_mercenary_bloodmoon_bulk.js';
import {readBloodmoonPackState} from '../../../functions/_mercenary_bloodmoon_pack.js';
import {baseSchema,scenarios,runSamples} from './fixture.mjs';
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const publicResponse=await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature'),snapshot=await publicResponse.json();
if(!publicResponse.ok||snapshot.releaseEnabled!==false||snapshot.userOpeningEnabled!==false)throw Error('Production pack must remain locked');
fs.writeFileSync(path.join(out,'public-pool-before.json'),JSON.stringify({at:new Date().toISOString(),releaseEnabled:snapshot.releaseEnabled,userOpeningEnabled:snapshot.userOpeningEnabled,settings:snapshot.settings,stock:snapshot.stock,normalCards:snapshot.normalCards},null,2));
const reports=[];
for(const scenario of scenarios){
 const pg=new PGlite();let DB;
 try{
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+baseSchema.join(';'));
  const wrapped={escapeLiteral:v=>Client.prototype.escapeLiteral.call(null,v),async query(input){
   if(DB?.benchStats)DB.benchStats.wireCalls++;
   if(typeof input==='string'){const r=(await pg.exec(input)).map(x=>({...x,rowCount:x.affectedRows??x.rows.length}));return r.length===1?r[0]:r;}
   const r=await pg.query(input.text,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
  }};
  __postgresCompatTest.clearPostgresCatalogCache();DB=new __postgresCompatTest.PostgresD1Database(wrapped);const batch=DB.batch.bind(DB);DB.batch=list=>{if(DB.benchStats)DB.benchStats.batchStatements+=list.length;return batch(list);};
  const r=await runSamples(DB,snapshot.normalCards,scenario,{iterations:10,returnReceipt:true});
  const state=await readBloodmoonPackState({DB},{releaseEnabled:true}),sampling=[];
  for(let i=0;i<20;i++){const start=performance.now();pickBloodmoonBulk(state,100000,createBloodmoonBulkRandom());sampling.push(performance.now()-start);}
  fs.writeFileSync(path.join(out,scenario+'-receipt.json'),JSON.stringify(r.lastReceipt));delete r.lastReceipt;r.samplingOnlyMs=sampling;reports.push(r);console.log(JSON.stringify({scenario,samples:r.samples.map(x=>({ms:Math.round(x.ms),types:x.ordinaryTypes,serials:x.limitedSerials,sql:x.batchStatements,wire:x.wireCalls})),samplerMs:sampling.map(Math.round)}));
 }finally{await pg.close();}
}
fs.writeFileSync(path.join(out,'local.json'),JSON.stringify({at:new Date().toISOString(),platform:process.version+' / PGlite / Windows / production crypto and SQL pipeline',productionWrites:0,reports},null,2));

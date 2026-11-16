// Isolated service latency comparison. No production credentials or requests.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {collectionFixture} from '../tests/helpers/collection-bonuses-fixture.mjs';
import * as collection from '../functions/_collection_bonuses.js';
import * as supporter from '../functions/_supporter_benefits.js';
import {emptyHideout,changeHideout,HIDEOUT_KEY} from '../shared/personal-hideout-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),baseline='a6fc4b936';
async function previous(file){
 const source=execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:2e6}).toString().replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_,quote,dep)=>'from '+quote+new URL(dep,pathToFileURL(path.join(root,file))).href+quote);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const beforeCollection=await previous('functions/_collection_bonuses.js'),beforeSupport=await previous('functions/_supporter_benefits.js');
const f=await collectionFixture();f.env.PERSONAL_HIDEOUT_ENABLED='1';
let state=emptyHideout();for(const c of Object.keys(state.parts))state.parts[c]=10000;state=changeHideout(state,'upgrade',{revision:0,target:'room'});state=changeHideout(state,'upgrade',{revision:state.revision,target:'sofa'});await f.write(HIDEOUT_KEY(7),state);
const original=f.DB.prepare.bind(f.DB),counts=[],latencyMs=10;let calls=0;
f.DB.prepare=sql=>{const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return (...values)=>wrap(target.bind(...values));if(['first','all','run'].includes(key))return async(...args)=>{calls++;await new Promise(resolve=>setTimeout(resolve,latencyMs));return target[key](...args);};return Reflect.get(target,key);}});return wrap(original(sql));};
const rows=[];
try{
 for(let repeat=0;repeat<5;repeat++)for(const [name,mod,fn]of [['collection-before',beforeCollection,'readCollectionBonuses'],['collection-after',collection,'readCollectionBonuses'],['support-before',beforeSupport,'readSupportBenefits'],['support-after',supporter,'readSupportBenefits']]){
  calls=0;const started=performance.now(),result=await mod[fn](f.env,7),ms=performance.now()-started;
  if(name==='collection-after')assert.equal(result.totals.coinPercent,52);if(name==='collection-before')assert.equal(result.totals.coinPercent,50);
  rows.push({name,repeat,ms,queries:calls});
 }
 const summary=Object.fromEntries([...new Set(rows.map(r=>r.name))].map(name=>{const values=rows.filter(r=>r.name===name);return [name,{firstMs:values[0].ms,reentryMedianMs:values.slice(1).map(r=>r.ms).sort((a,b)=>a-b)[2],queries:values[0].queries}];}));
 writeFileSync(path.join(root,'docs/qa/personal-hideout-20261116/service-performance.json'),JSON.stringify({baseline,condition:'Windows Node 24 + isolated SQLite; 10ms artificial delay per SQL call; five sequential requests per variant; not live network latency',summary,rows},null,2));console.log(JSON.stringify(summary));
}finally{await f.close();}

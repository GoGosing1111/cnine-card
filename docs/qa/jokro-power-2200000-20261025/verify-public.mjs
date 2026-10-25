// Read-only deployed resource and public catalog verification.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const source=process.argv[2];
assert.match(source,/^[a-f0-9]{40}$/);
const out=process.argv[3]||path.join(root,'docs/qa/jokro-power-2200000-20261025');
fs.mkdirSync(out,{recursive:true});
const base='https://cnine-card.pages.dev';
const stamp='jokro-power-2200000-'+Date.now();
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40e6});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const normalized=buffer=>Buffer.from(buffer.toString('utf8').replace(/\r\n/g,'\n'));
const names=git('diff','--name-only','9134468eef10def18b31ce7e9919f4497da240b9',source).toString().trim().split('\n').filter(p=>
 ['index.html','service-worker.js','js/app.js','js/battle-v3-live.js','mercenary-codex/app.mjs','mercenary-codex/index.html','mercenary-codex/model.mjs'].includes(p)||
 /^shared\/mercenary-(?:jokro|eunseol)-v1\.mjs$/.test(p)||
 /^(?:preview|pve-v3)\/.*\.bundle\.js$/.test(p));
assert(names.length>=19);
const checks=[];
let next=0;
await Promise.all(Array.from({length:3},async()=>{
 while(next<names.length){
  const file=names[next++];
  const response=await fetch(base+'/'+file+'?qa='+stamp,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(45000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  const expected=git('show',source+':'+file);
  const row={file,status:response.status,bytes:bytes.length,sha256:hash(bytes),gitNormalizedSha256:hash(normalized(expected)),publicNormalizedSha256:hash(normalized(bytes))};
  row.match=row.status===200&&row.gitNormalizedSha256===row.publicNormalizedSha256;
  checks.push(row);
  console.log((row.match?'PASS ':'FAIL ')+file+' ['+response.status+']');
 }
}));
const response=await fetch(base+'/api/mercenary-codex?qa='+stamp,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(45000)});
const catalog=await response.json();
assert.equal(response.status,200);
const {validateCatalog}=await import(pathToFileURL(path.join(root,'mercenary-codex/model.mjs')));
validateCatalog(catalog);
const cards=['V-979','V-973','V-058'].map(code=>{
 const card=catalog.cards.find(c=>c.code===code);assert(card);
 return {code,name:card.name,basePower:card.basePower,rank:card.rank,edition:card.edition,deploymentEnabled:card.deploymentEnabled,skills:card.skills.map(s=>({id:s.id,name:s.name}))};
});
assert.equal(cards[0].basePower,2200000);
assert.equal(cards[1].basePower,1940890);
assert.equal(cards[2].basePower,1000000);
const result={status:checks.every(c=>c.match)?'PASS':'FAIL',checkedAt:new Date().toISOString(),source,base,readOnly:true,publicFileCount:checks.length,files:checks.sort((a,b)=>a.file.localeCompare(b.file)),catalog:{status:response.status,valid:true,total:catalog.cards.length,cards}};
fs.writeFileSync(path.join(out,'public-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,publicFileCount:checks.length,cards}));
assert.equal(result.status,'PASS');

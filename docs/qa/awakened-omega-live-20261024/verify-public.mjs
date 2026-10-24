import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const localBytes=file=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file)):execFileSync('git',['show','HEAD:'+file],{maxBuffer:25e6});
const source=git('rev-parse','HEAD'),base='https://cnine-card.pages.dev';
const {isProductionFile}=await import(pathToFileURL(path.join(root,'scripts/prepare-production-assets.mjs')));
const changed=git('diff','--name-only','a4631dec2d3d6c642ca110658e1a2b15dd0cffbd','HEAD').split('\n');
const files=changed.filter(p=>isProductionFile(p)&&(/^assets\/ui\/project-v\/mercenaries\/awakened-omega-20261024\//.test(p)||p==='index.html'||/^js\/(app|battle-v3-live)\.js$/.test(p)||p.startsWith('mercenary-codex/')||p.startsWith('shared/')||/\.bundle\.js$/.test(p)||p==='preview/project-v-v3/grid-build-report.json'));
const checkpoint=path.join(out,'omega-public-hash-progress.json');
const previous=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
// Preserve successful checks when a follow-up changes only the delivery footer.
const results=(previous?.files||[]).filter(r=>files.includes(r.file)&&sha(localBytes(r.file))===r.sha256).map(r=>({...r,verifiedSource:r.verifiedSource||previous.source}));
async function get(file){
 for(let attempt=0;attempt<2;attempt++)try{
  const response=await fetch(base+'/'+file+'?omega_release='+source.slice(0,9),{signal:AbortSignal.timeout(90000),cache:'no-store'});assert.equal(response.status,200,file);return Buffer.from(await response.arrayBuffer());
 }catch(error){if(attempt)throw new Error(file+': '+error.message,{cause:error});console.log('Retry public download: '+file);}
}
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const file=files[cursor++];if(results.some(r=>r.file===file))continue;const bytes=await get(file),local=localBytes(file);assert.equal(sha(bytes),sha(local),'PUBLIC_HASH_MISMATCH '+file);results.push({file,bytes:bytes.length,sha256:sha(bytes),verifiedSource:source});fs.writeFileSync(checkpoint,JSON.stringify({source,files:results},null,2)+'\n');if(results.length%10===0)console.log('Public hashes verified '+results.length+'/'+files.length);}}));
const document=JSON.parse(await get('api/mercenary-codex'));
const card=document.cards.find(c=>c.code==='V-972');
assert(card,'V-972 is visible in the public codex');
assert.equal(card.name,'각성 오메가');assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');assert.equal(card.basePower,1750000);assert.equal(card.acquisition,'CRAFT_ONLY');assert.equal(card.acquisitionEnabled,false);assert.equal(card.craftAcquisitionEnabled,false);assert.equal(card.packAcquisitionEnabled,false);assert.equal(card.skills.length,4);assert(document.cards.some(c=>c.code==='V-021'),'Legacy Omega-X preserved');
const report={status:'PASS',checkedAt:new Date().toISOString(),source,base,files:results.sort((a,b)=>a.file.localeCompare(b.file)),card,accountWrites:0,grants:0};
fs.writeFileSync(path.join(out,'omega-public-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,source,publicFiles:results.length,name:card.name,power:card.basePower,edition:card.edition,acquisition:card.acquisition,acquisitionEnabled:card.acquisitionEnabled,skills:card.skills.length}));

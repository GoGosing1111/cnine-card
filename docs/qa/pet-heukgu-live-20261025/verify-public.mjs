import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site';
const out='C:/Users/User/.codex/visualizations/2026/10/25/01a172a0-71a0-7d40-a5ca-76b49d420a0e';
const origin='https://cnine-card.pages.dev';
const files=['assets/ui/pets/heukgu-20261025/pet-heukgu-transparent-v2.png','shared/pet-art-catalog-v1.mjs','css/pet-equipment-v1.css','pet-codex/index.html','pet-codex/app.mjs','js/pet-equipment-window-v1.mjs','admin/companion-admin-v2.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const rows=await Promise.all(files.map(async file=>{
 const url=origin+'/'+file+'?verify=heukgu-20261025';
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});assert.equal(response.status,200,file);
 const bytes=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(root,file));
 assert.equal(hash(bytes),hash(local),'Public source mismatch: '+file);
 return {file,status:response.status,bytes:bytes.length,sha256:hash(bytes)};
}));
const response=await fetch(origin+'/client/windows/manifest.json?verify=heukgu-20261025',{signal:AbortSignal.timeout(45000)});
assert.equal(response.status,200);
const manifest=await response.json();
const desktopRows=rows.filter(row=>!row.file.startsWith('admin/'));
for(const row of desktopRows){const item=manifest.files.find(f=>f.path==='/'+row.file);assert(item,row.file);assert.equal(item.sha256,row.sha256);assert.equal(item.bytes,row.bytes);}
assert(!manifest.files.some(row=>row.path.startsWith('/admin/')),'OWNER administration must remain outside desktop downloads');
assert(!manifest.files.some(row=>row.path.includes('pet-heukgu-live-20261025')),'Private reference/provenance must not enter desktop assets');
const result={status:'PASSED',origin,files:rows,desktopManifest:{releaseId:manifest.releaseId,verifiedFiles:desktopRows.length,ownerAdminExcluded:true,referenceAndProvenanceExcluded:true},checkedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'public-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,files:rows.length,desktopRelease:manifest.releaseId}));

import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {isProductionFile,noxHistoricalAuditOnly} from '../scripts/prepare-production-assets.mjs';
import {readFileSync} from 'node:fs';
import {NOX_TRACKS} from '../shared/nox-raid-chart-v1.mjs';
const git=(...args)=>execFileSync('git',args,{maxBuffer:40e6}).toString();
test('Nox runtime ships within the real Pages limit; unreferenced receipts remain identical in Git',()=>{
  const files=git('ls-files','-z').split('\0').filter(Boolean);
  const runtime=files.filter(f=>f!=='raid/nox/assets.mjs'&&/^(raid\/nox\/|assets\/ui\/raid-nox-v[12]\/|assets\/fonts\/nox\/)/.test(f));assert(runtime.length>=25);for(const f of runtime)assert(isProductionFile(f),f);
  assert(files.includes('raid/nox/assets.mjs'));assert(!isProductionFile('raid/nox/assets.mjs'));
  assert(JSON.parse(readFileSync('raid/nox/build-report.json','utf8')).inputs.includes('raid/nox/assets.mjs'),'art lifetime helper is included in the shipped renderer');
  assert(isProductionFile('js/nox-raid-entry-v1.js'));assert(isProductionFile('admin/nox-raid-admin-v1.mjs'));
  for(const track of NOX_TRACKS){const file=decodeURIComponent(track.source.slice(1));assert(files.includes(file),file);assert(isProductionFile(file),file);}
  assert(!isProductionFile('scripts/build-nox-charts.mjs'));
  assert(files.includes('scripts/lib/nox-chart-authoring.mjs'));assert(!isProductionFile('scripts/lib/nox-chart-authoring.mjs'));
  assert.match(readFileSync('onestore/index.html','utf8'),/src="js\/nox-raid-entry-v1\.js\?v=20261119-test1"/,'generated H5 entry must expose the same gated Nox menu');
  for(const file of noxHistoricalAuditOnly){assert(files.includes(file));assert(!isProductionFile(file));assert.equal(git('rev-parse','48238db09:'+file),git('rev-parse','HEAD:'+file),'preserve historical source '+file);}
  assert.equal(noxHistoricalAuditOnly.size,50);
  const packedNotes=JSON.parse(readFileSync('functions/_data/blue-gear-release-note-paths.json','utf8'));
  const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1+(files.some(f=>packedNotes.includes(f))?1:0);assert(count<=20000,'Pages asset count including generated archive '+count);
  let references='';try{references=git('grep','-I','-l','-F',...[...noxHistoricalAuditOnly].flatMap(f=>['-e',f]),'HEAD','--','functions','shared','js','css','raid','admin','index.html','onestore','pve','pve-v3','mercenary-codex','pet-codex');}catch(error){if(error.status!==1)throw error;}assert.equal(references,'');
});

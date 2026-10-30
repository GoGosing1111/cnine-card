import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('escort boss ships within the actual Pages cap while original art and internal instructions remain in Git',async()=>{
 const files=execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','ls-files','-z'],{encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean),selected=files.filter(isProductionFile);
 const publicAssets=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f));
 assert(publicAssets.length+1<=20000,'Pages count includes the generated Windows client manifest');
 for(const file of ['assets/ui/escort/bosses/velkar-siege-commander-v1.webp','assets/responsive/project-v/monsters/tower-028-violet-magus-boss-sd-v1-768.webp'])assert(selected.includes(file),file);
 for(const file of ['AGENTS.md','docs/qa/escort-own-ip-20261030/velkar-source.png','docs/qa/escort-own-ip-20261030/velkar-source-facing-right.png']){assert(files.includes(file));assert(!selected.includes(file));await access(new URL('../'+file,import.meta.url));}
});

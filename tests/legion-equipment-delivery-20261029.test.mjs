import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync,spawnSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
test('all new equipment art and code ship; delivery excludes only retained historical notes and stays in the Pages limit',()=>{
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:4e7}).toString().split('\0').filter(Boolean);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;assert.ok(count<=20000,count);
 for(const item of ASCENDANT_EQUIPMENT){assert(isProductionFile(item.image.slice(1)));assert(fs.existsSync('.'+item.image));}
 assert(isProductionFile('shared/mercenary-ascendant-equipment-v1.mjs'));
 const notes=JSON.parse(fs.readFileSync('scripts/legion-equipment-authoring-only-20261029.json','utf8'));assert.equal(notes.length,51);
 for(const file of notes){assert.match(file,/^docs\/[^/]+\.(?:md|json)$/);assert(files.includes(file));assert(!isProductionFile(file));}
 const result=spawnSync('git',['grep','-I','-l','-F',...notes.flatMap(p=>['-e',p]),'--','functions','shared','js','admin','mercenary-codex'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,1,result.stdout+result.stderr);assert.equal(result.stdout,'');
});

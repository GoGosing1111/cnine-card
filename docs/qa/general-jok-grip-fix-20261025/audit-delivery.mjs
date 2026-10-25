import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../../../scripts/prepare-production-assets.mjs';
const files=execFileSync('git',['ls-files'],{encoding:'utf8',maxBuffer:32e6}).trim().split(/\r?\n/);
const rows=[];
for(const file of files){
 if(rows.length>=12)break;
 if(!isProductionFile(file)||!file.endsWith('.mjs')||!file.startsWith('preview/'))continue;
 const s=fs.readFileSync(file,'utf8');
 if(/from\s*['"]node:|import\s*['"]node:/.test(s))rows.push({file,imports:s.match(/.{0,50}node:.{0,70}/g)?.slice(0,3)});
}
console.log(JSON.stringify(rows,null,2));

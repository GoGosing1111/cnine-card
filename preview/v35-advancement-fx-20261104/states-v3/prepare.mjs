import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const rows=JSON.parse(await fs.readFile(dir+'generation.json','utf8'));
for(const fix of JSON.parse(await fs.readFile(dir+'corrections.json','utf8'))){
 for(const old of rows.filter(r=>r.id===fix.id)){old.status='REJECTED';old.reason='Expanded soft glow leaves inadequate cell isolation; preserve original, use corrected v2.';}
 if(!rows.some(r=>r.output===fix.output))rows.push(fix);
}
await fs.writeFile(dir+'generation.json',JSON.stringify(rows,null,2));
let author=await fs.readFile(dir+'../painted-v2/author.mjs','utf8');
author=author.replaceAll('rnd(4)','rnd(6)').replaceAll('rnd(i*4)','rnd(i*6)').replaceAll("t('EndFrame',36)","t('EndFrame',52)").replace('frames:19,nativeFrames:36','frames:27,nativeFrames:52').replace('mercenary-advancement-painted-v2','mercenary-advancement-states-v3');
await fs.writeFile(dir+'author.mjs',author);

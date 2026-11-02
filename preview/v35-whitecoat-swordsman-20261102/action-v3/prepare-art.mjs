import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const dir=fileURLToPath(new URL('.',import.meta.url));
// Rectangle extraction only. Preserve the generated alpha and character pixels.
const audit=JSON.parse(await fs.readFile(dir+'qa/crop-audit.json','utf8'));
for(const row of audit){
 const png=await sharp(dir+'art/'+row.sheet).extract(row.crop).png().toBuffer();
 const existing=await fs.readFile(dir+'cropped/'+row.name+'.png');
 const a=await sharp(png).ensureAlpha().raw().toBuffer(),b=await sharp(existing).ensureAlpha().raw().toBuffer();
 assert.ok(a.equals(b),'Preserved crop differs: '+row.name);
}
console.log('All eight preserved crops match exact rectangular extraction; no pixel edits.');

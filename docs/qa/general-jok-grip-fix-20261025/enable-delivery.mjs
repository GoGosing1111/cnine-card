import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const file='scripts/prepare-production-assets.mjs',s=await fs.readFile(file,'utf8');
assert(s.includes('export const isProductionFile=file=>!experienceTransferAuthoringOnly'));
await fs.writeFile(file,s.replace('export const isProductionFile=file=>!experienceTransferAuthoringOnly','export const isProductionFile=file=>!generalJokGripAuthoringOnly(file)&&!experienceTransferAuthoringOnly'));

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const records = [
  {
    "key": "top",
    "name": "엠퍼러 슈트",
    "file": "emperor-suit-v1.png",
    "slot": "TOP",
    "subtype": "TOP",
    "baselineId": 34,
    "source": "C:/Users/User/.codex/generated_images/01a05b22-7d12-73b0-a926-30e64b4bf05b/exec-a3ce7adc-0645-4b36-8406-d23a9cf453b7.png",
    "path": "C:/Users/User/Downloads/upload/cnine-card/output/imagegen/emperor-equipment-v1/emperor-suit-v1.png"
  },
  {
    "key": "bottom",
    "name": "엠퍼러 레깅스",
    "file": "emperor-leggings-v1.png",
    "slot": "BOTTOM",
    "subtype": "BOTTOM",
    "baselineId": 32,
    "source": "C:/Users/User/.codex/generated_images/01a05b22-7d12-73b0-a926-30e64b4bf05b/exec-ac03a144-4db2-46ac-a58f-da5e74816222.png",
    "path": "C:/Users/User/Downloads/upload/cnine-card/output/imagegen/emperor-equipment-v1/emperor-leggings-v1.png"
  },
  {
    "key": "shoes",
    "name": "엠퍼러 슈즈",
    "file": "emperor-shoes-v1.png",
    "slot": "SHOES",
    "subtype": "SHOES",
    "baselineId": 33,
    "source": "C:/Users/User/.codex/generated_images/01a05b22-7d12-73b0-a926-30e64b4bf05b/exec-94e85a62-bc40-49ca-b119-88bb0d33325d.png",
    "path": "C:/Users/User/Downloads/upload/cnine-card/output/imagegen/emperor-equipment-v1/emperor-shoes-v1.png"
  },
  {
    "key": "weapon",
    "name": "엠퍼러 듀얼디스크",
    "file": "emperor-dual-disk-v1.png",
    "slot": "ACCESSORY",
    "subtype": "DUAL_DISK",
    "baselineId": 35,
    "source": "C:/Users/User/.codex/generated_images/01a05b22-7d12-73b0-a926-30e64b4bf05b/exec-e35ef409-37ab-46c8-bfab-f3866c0e21ce.png",
    "path": "C:/Users/User/Downloads/upload/cnine-card/output/imagegen/emperor-equipment-v1/emperor-dual-disk-v1.png"
  }
];
const digest = data => createHash('sha256').update(data).digest('hex');
const results=[];
let baselineSourcesVerified=0;
for(const name of ['prompts-v1.json','inventory-finish-prompts-v1.json']) {
  const record=JSON.parse(await readFile(new URL('./'+name,import.meta.url),'utf8'));
  if(!Array.isArray(record.prompts)||record.prompts.length!==4||record.prompts.some(p=>!p.prompt))throw new Error('Complete four-item prompt provenance required: '+name);
}
for (const record of records) {
  const target = new URL('./' + record.file, import.meta.url);
  const [output, metadata, stats] = await Promise.all([readFile(target), sharp(fileURLToPath(target)).metadata(), sharp(fileURLToPath(target)).stats()]);
  if (metadata.width !== metadata.height || metadata.width < 1024 || metadata.format !== 'png' || !stats.isOpaque) throw new Error('Asset format QA failed: ' + record.file);
  let sourceVerified=false;
  try {
    const source=await readFile(record.source);
    if(digest(source)!==digest(output))throw new Error('Generated source copy differs: '+record.file);
    sourceVerified=true;
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  results.push({key:record.key,name:record.name,file:record.file,slot:record.slot,subtype:record.subtype,baselineId:record.baselineId,width:metadata.width,height:metadata.height,channels:metadata.channels,format:metadata.format,opaque:stats.isOpaque,bytes:output.length,sha256:digest(output),sourceVerified});
}
try {
  const manifest=JSON.parse(await readFile(new URL('./manifest-v1.json',import.meta.url),'utf8'));
  for(const result of results) {
    const expected=manifest.assets.find(a=>a.file===result.file);
    if(!expected||expected.sha256!==result.sha256)throw new Error('Manifest hash mismatch: '+result.file);
  }
  for(const [relative,expected] of Object.entries(manifest.baseline.sourceHashes)) {
    try {
      const source=await readFile(new URL('../../../'+relative,import.meta.url));
      if(digest(source).toUpperCase()!==expected)throw new Error('Original Mystic asset changed: '+relative);
      baselineSourcesVerified++;
    } catch(error) {if(error.code!=='ENOENT')throw error;}
  }
} catch(error) {if(error.code!=='ENOENT')throw error;}
console.log(JSON.stringify({status:'PASS',assetCount:results.length,baselineSourcesVerified,assets:results},null,2));

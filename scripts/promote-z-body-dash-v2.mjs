import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const source='preview/z-body-dash-v2',destination='assets/ui/project-v/account-battle-suits/z-dash-v2';
const manifest=JSON.parse(await readFile(path.join(source,'assets.json'),'utf8'));
await mkdir(destination,{recursive:true});
for(const [key,atlas] of Object.entries(manifest.atlases)){
  const name=key+'-atlas.png',data=await readFile(path.join(source,'assets',name));
  if(createHash('sha256').update(data).digest('hex')!==atlas.sha256)throw Error('Approved atlas hash mismatch: '+key);
  await copyFile(path.join(source,'assets',name),path.join(destination,name));
  atlas.url='/'+destination+'/'+name;
  atlas.source.file=source+'/'+atlas.source.file;
}
Object.assign(manifest,{version:'Z_DASH_LIVE_20260918',status:'USER_APPROVED_LIVE',
  approval:{date:'2026-09-18',userMessage:'승인',previewCommit:'03c80c2e',scope:'Z-BODY dash VFX, 245 ms contact, 640 ms motion; existing body size and AOE preserved'},
  sourcePreview:source,prompts:source+'/prompts.json',runtime:'preview/project-v-v3/source/battle/ZBodySwordAnimation.js'});
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Promoted the two approved Z dash atlases without altering their bytes.');

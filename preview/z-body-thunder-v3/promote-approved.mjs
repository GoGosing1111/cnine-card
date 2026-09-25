import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const approval=JSON.parse(await readFile(path.join(here,'approval.json')));
if(approval.finalApproval!=='ㅇㅋ 전체 승인')throw Error('Full user approval is required.');
for(const [sourceManifest,folder,runtime] of [['assets.json','z-thunder-v3','ZBodyThunderFX.js'],['normal-assets.json','z-normal-lightning-v3','ZBodyNormalFX.js']]){
  const data=JSON.parse(await readFile(path.join(here,sourceManifest)));
  const directory='assets/ui/project-v/account-battle-suits/'+folder;
  await mkdir(path.join(root,directory),{recursive:true});
  for(const spec of Object.values(data.atlases)){
    const source=path.join(root,spec.url.slice(1)),bytes=await readFile(source);
    if(createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('Unreviewed atlas bytes');
    const name=path.basename(spec.url);await copyFile(source,path.join(root,directory,name));
    spec.url='/'+directory+'/'+name;
    spec.source.file='preview/z-body-thunder-v3/'+spec.source.file;
  }
  Object.assign(data,{status:'USER_APPROVED_LIVE',liveEnabled:true,approval:{date:'2026-09-26',userMessage:approval.finalApproval},runtime:'preview/project-v-v3/source/battle/'+runtime});
  await writeFile(path.join(root,directory,'manifest.json'),JSON.stringify(data,null,2)+'\n');
}
console.log('Promoted six approved atlases without changing their pixels.');

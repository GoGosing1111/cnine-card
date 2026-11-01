import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {TROPHY_CATALOG} from '../../tmp/cardgu-live-20261027/js/player-card-model-v2052.js';
const root='C:/Users/User/Downloads/upload/cnine-card/tmp/cardgu-live-20261027';let count=0;
for(const f of [...TROPHY_CATALOG.flatMap(t=>[t.art.slice(1),t.art.slice(1).replace('.webp','.png')]),'preview/avatar-hi-heeya-v1/assets/avatar-hi-heeya-lobby-v1-1024.webp','preview/avatar-cheon-v1/assets/avatar-cheon-lobby-v1-1024.webp']){
 const p=path.join(root,f);if(fs.existsSync(p))continue;fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,execFileSync('git',['-c','gc.auto=0','show','HEAD:'+f],{cwd:root,windowsHide:true,maxBuffer:30e6}));count++;
}
console.log(JSON.stringify({hydratedRequiredQaAssets:count}));

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const baseRoot='preview/battle-suit-x-v1',dragonRoot='preview/battle-suit-x-dragon-v1';
const destination='assets/ui/project-v/account-battle-suits/x-sword-v1';
for(const root of[baseRoot,dragonRoot]){
 const approval=JSON.parse(await fs.readFile(root+'/approval-20260927.json','utf8'));
 for(const a of approval.artifacts){
  let b=await fs.readFile(a.path);
  if(a.hashMode==='UTF8_LF')b=Buffer.from(b.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
  if(sha(b)!==a.sha256)throw Error('Approved resource changed: '+a.path);
 }
}
const assets=[];
async function promote(source,name){
 const file=destination+'/'+name,b=await fs.readFile(source);
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);
 assets.push({url:'/'+file,sha256:sha(b),bytes:b.length,approvedSource:source});
 return '/'+file;
}
const base=JSON.parse(await fs.readFile(baseRoot+'/manifest.json','utf8'));
const dragon=JSON.parse(await fs.readFile(dragonRoot+'/manifest.json','utf8'));
base.sourceArt=await promote(baseRoot+'/'+base.sourceArt,'x-body.png');
const blade=await promote(baseRoot+'/assets/locked/approved-blade.png','approved-blade.png');
for(const [key,m]of[['base',base],['dragon',dragon]]){
 const source=key==='base'?baseRoot:dragonRoot;
 m.sourceArt=base.sourceArt;m.weapon.url=blade;m.weapon.source=base.sourceArt;
 for(const [name,spec]of Object.entries(m.motion))spec.url=await promote(source+'/'+spec.url,key+'/'+name+'-atlas.png');
 for(const [name,spec]of Object.entries(m.effects))spec.url=await promote(source+'/'+spec.url,key+'/'+name+'-fx.png');
}
const manifest={version:'X_BODY_LIVE_20260927',suitCode:'BATTLE_SUIT_X_BODY',status:'USER_APPROVED_LIVE',
 approval:{base:'2026-09-27 X-BODY V2 승인 및 라이브 배포해',dragon:'2026-09-27 천룡 강림: 이 연출로 승인'},
 image:base.sourceArt,base,dragon,assets};
await fs.writeFile(destination+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:manifest.version,assets:assets.length,bytes:assets.reduce((s,a)=>s+a.bytes,0),weapon:base.weapon.sha256}));

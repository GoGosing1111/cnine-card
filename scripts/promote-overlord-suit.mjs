import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const source='preview/battle-suit-crimson-gold-knight-20261005-v1',destination='assets/ui/project-v/account-battle-suits/overlord-v1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await fs.readFile(source+'/manifest.json','utf8')),assets=[];
async function promote(from,name,expected){
 const b=await fs.readFile(from),hash=sha(b);
 if(expected&&hash!==expected)throw Error('Approved resource changed: '+from);
 const file=destination+'/'+name;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);
 assets.push({url:'/'+file,approvedSource:from,sha256:hash,bytes:b.length});return '/'+file;
}
m.sourceArt=await promote(source+'/'+m.sourceArt,'overlord.png','02ccd3d717c94cd001c538bb8a08cb9272fa1e7cae512e01f12a31b32f68d236');
for(const [key,s]of Object.entries(m.motion))s.url=await promote(source+'/'+s.url,'motion/'+key+'.png',s.sha256);
for(const [key,s]of Object.entries(m.effects))s.url=await promote(source+'/'+s.url,'effects/'+key+path.extname(s.url),s.sha256);
m.titleOrnament=await promote(source+'/assets/title/overlord-title-ornament-v1.png','title-ornament.png','56a357918fb9c9777dab5a53cff6bd32fc812be186623aee5083ac17b09dcea1');
m.auraFlash=await promote('preview/battle-suit-skill-chip-v1/assets/textures/flash.webp','aura-flash.webp');
m.weapon.url=await promote(source+'/assets/locked/source-blade.png','source-blade.png',m.weapon.sha256);
m.version='OVERLORD_LIVE_20261005_V6';m.suitCode='BATTLE_SUIT_OVERLORD';m.status='USER_APPROVED_LIVE';m.runtimeEnabled=true;
m.title={text:'종말 위에 군림하는 자',cosmeticOnly:true};
delete m.retiredAuraV2;
m.approval={date:'2026-10-05',instruction:'오버로드 슈트 라이브 적용해',balanceInstruction:'X-BODY보다 높게 추천해서 적용',sourceVersion:'OVERLORD_20261005_AURA_TITLE_V6'};
m.assets=assets;
await fs.writeFile(destination+'/manifest.json',JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({version:m.version,assets:assets.length,bytes:assets.reduce((n,a)=>n+a.bytes,0)}));


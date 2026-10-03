import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';

const preview='preview/mercenary-limited-sd-skills-20261003-v1';
const destination='assets/ui/project-v/mercenaries/limited-battle-20261004';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex').toUpperCase();
const manifest=await read(preview+'/manifest.json');
const valter=await read('preview/mercenary-crimson-silver-knight-battle-v1/manifest.json');
await fs.mkdir(destination,{recursive:true});
const files=[];
async function preserveCopy(source,name,sha){
 const target=destination+'/'+name;
 if(await hash(source)!==sha)throw Error('APPROVED_SOURCE_CHANGED: '+source);
 await fs.copyFile(source,target);
 if(await hash(target)!==sha)throw Error('COPY_HASH_MISMATCH: '+target);
 files.push({source,path:target,sha256:sha});return '/'+target;
}
const aura={...manifest.aura,url:await preserveCopy(preview+'/'+manifest.aura.url,'rear-aura.png',manifest.aura.sha256)};
const characters=[];
for(const c of manifest.characters){
 const sprite=c.preserveExisting?c.sprite:await preserveCopy(preview+'/'+c.sprite,c.id+'-sd.png',c.spriteSha256);
 const effects=c.effects?{...c.effects,url:await preserveCopy(preview+'/'+c.effects.url,c.id+'-skill.png',c.effects.sha256),frames:c.effects.frames.map(({index,role,rect,origin})=>({index,role,rect,origin}))}:null;
 characters.push({...c,sprite,effects,originalSprite:{...c.originalSprite,url:c.preserveExisting?c.originalSprite.url:'/'+preview+'/'+c.originalSprite.url}});
}
const reference={code:'V-996',manifest:'/preview/mercenary-crimson-silver-knight-battle-v1/manifest.json',textureHeight:valter.displaySizing.fullBodyHeight,bodyHeight:valter.displaySizing.fullBodyHeight*valter.bodyPixels/valter.battleSpriteInfo.height};
const visuals={version:'20261004-approved',status:'USER_APPROVED',runtimeEnabled:true,damageAuthority:'SERVER_ONLY',reference,aura,characters};
await write(destination+'/manifest.json',visuals);
await fs.writeFile('shared/mercenary-limited-visual-catalog-v1.mjs','// Approved presentation resources; this does not change acquisition, stats or skill assignments.\nexport const LIMITED_BATTLE_VISUALS = '+JSON.stringify(visuals,null,2)+';\n');
const cards=LIMITED_MERCENARIES.map(c=>{
 const v=characters.find(v=>v.code===c.code);
 return {...c,battleSprite:v.sprite.replace(/^\//,''),battleSpriteSha256:v.spriteSha256,resourceStatus:c.code==='V-996'?'ART_SD_MOTION_READY':'ART_SD_SKILL_VISUAL_READY',visualApproval:'USER_APPROVED_20261004',battleVisualManifest:destination+'/manifest.json'};
});
await fs.writeFile('shared/mercenary-limited-catalog-v1.mjs','// Approved limited collection; acquisition policy remains separate.\nexport const LIMITED_MERCENARIES=Object.freeze('+JSON.stringify(cards,null,2)+'.map(card=>Object.freeze(card)));\nexport const isLimitedMercenary=code=>LIMITED_MERCENARIES.some(card=>card.code===code);\n');
await write('assets/ui/project-v/mercenaries/limited-20261002/catalog.json',{version:'limited-mercenary-visual-approved-20261004',acquisitionEnabled:false,cards});
manifest.status='USER_APPROVED';manifest.liveEnabled=true;manifest.liveScope='APPROVED_VISUAL_RUNTIME';manifest.skillAssignments='VISUALS_APPROVED_BALANCE_UNASSIGNED';
await write(preview+'/manifest.json',manifest);
const registration=await read(preview+'/pose-registration.json');registration.status='USER_APPROVED';await write(preview+'/pose-registration.json',registration);
await write(preview+'/final-approval-20261004.json',{date:'2026-10-04',timezone:'Asia/Seoul',status:'USER_APPROVED',userApproval:'최종승인',userDeploymentInstruction:'라이브에 반영해',reference,scope:'Six limited SD presentations, five skill image sequences, rear aura, original approved Valter V17 motions and surrounding effects; visual runtime deployment authorized.',acquisitionEnabled:false,deploymentEnabled:false,skillBalanceChanged:false,sourceArtChanged:false,files,visualManifest:{path:destination+'/manifest.json',sha256:await hash(destination+'/manifest.json')},approvedValterSdSha256:characters.find(c=>c.code==='V-996').spriteSha256,reviewedCommit:'73f34285339d2596da9636c06e60735f084c3102'});
console.log(JSON.stringify({characters:characters.length,copiedFiles:files.length,reference}));

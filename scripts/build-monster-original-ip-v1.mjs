import {readFile,writeFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const source=await read('preview/monster-original-ip-sd-20261013-v1/manifest.json');
const entries=source.entries.map(e=>({key:e.key,name:e.workingName,monsterIds:e.monsterIds,raidId:e.raidId,raidCode:e.raidCode,previousNames:e.previousNames,
  sourceArt:'/'+e.sourceArt.path,sourceSha256:e.sourceArt.sha256,battleSprite:'/'+e.battleSprite.path,spriteSha256:e.battleSprite.sha256,
  footAnchor:{x:.5,y:e.render.sourceAlphaBottom||.94}}));
await writeFile('shared/monster-original-ip-data-v1.mjs','// Generated from the approved source/SD manifest. Stable IDs are gameplay identities.\nexport const ORIGINAL_IP_MONSTERS = Object.freeze('+JSON.stringify(entries,null,2)+');\n');
const manifestPath='assets/ui/project-v/monsters/hunt-tower/manifest-v1.json';
const manifest=await read(manifestPath);
for(const entry of entries)for(const id of entry.monsterIds){
  if(!manifest.sprites.some(row=>row.monsterId===id||row.aliases?.includes(id)))manifest.sprites.push({monsterId:id,mode:'HUNT',modes:['HUNT','APOCALYPSE'],isBoss:true});
}
for(const row of manifest.sprites){
  const entry=entries.find(e=>e.monsterIds.includes(Number(row.monsterId)));
  if(!entry)continue;
  Object.assign(row,{name:entry.name,sourceArt:entry.sourceArt.slice(1),battleSprite:entry.battleSprite.slice(1),sha256:entry.spriteSha256,originalIpKey:entry.key,footAnchor:entry.footAnchor,qa:{...row.qa,technicalPass:true,visualApproval:true}});
  delete row.battleSpriteWebp;delete row.battleSpriteWebpSha256;
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`Connected ${entries.length} approved illustrations and SD sprites; NORMAL and Big Seal untouched.`);

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const preview='preview/mercenary-bloodmoon-battle-20261023-v1';
const root='assets/ui/project-v/mercenaries/bloodmoon-approved-20261023';
const review=JSON.parse(await fs.readFile(preview+'/manifest.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
await fs.mkdir(root,{recursive:true});
const cards=[],assets=[];
for(const [i,c] of review.characters.entries()){
 const code='V-'+(960+i),stem=code.toLowerCase();
 const source=await fs.readFile(path.join(preview,c.sourceArt.path));
 const sprite=await fs.readFile(path.join(preview,c.battleSprite.path));
 if(sha(source)!==c.sourceArt.sha256||sha(sprite)!==c.battleSprite.sha256)throw Error('Source hash mismatch: '+code);
 const sourceArt=root+'/'+stem+'-source.png',battleSprite=root+'/'+stem+'-idle.png';
 await fs.writeFile(sourceArt,source);await fs.writeFile(battleSprite,sprite);
 for(const size of [320,640])await sharp(source).resize({width:size,withoutEnlargement:true}).webp({quality:91}).toFile(root+'/'+stem+'-'+size+'.webp');
 const skill={...c.combat.skill,id:'MS-'+(960+i),ready:false,bossRule:'공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다.'};
 cards.push({code,name:c.name,nameStatus:i<3?'CONFIRMED':'WORKING_LABEL',title:'블러드문 SS 리미티드',rank:'SS',rankStatus:'USER_DESIGNATED_20261023',edition:'LIMITED',season:'BLOODMOON',role:'LIMITED',position:null,artOnly:true,releaseStatus:'CODEX_RELEASED_ACQUISITION_LOCKED',sourceArt,sourceArtSha256:sha(source),battleSprite,battleSpriteSha256:sha(sprite),thumbnailArt:root+'/'+stem+'-320.webp',displayArt:root+'/'+stem+'-640.webp',accent:c.accent,basePower:c.combat.basePower,skills:[skill],acquisition:'LOCKED',acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:false,packOpeningEnabled:false,acquisitionPackId:'mercenary-bloodmoon-ss-limited',acquisitionPackName:'블러드문 SS 리미티드 팩',serverLimit:10,frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',frameSha256:'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA',artWindow:{left:5.957,top:5.794,width:88.086,height:88.086},resourceStatus:'ART_AND_BATTLE_RESOURCES_CODEX_RELEASED',visualApproval:'SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING',combatLinkDescription:'기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 현재 팩 개봉 및 전투 편성은 불가합니다.'});
 const [x0,y0,x1,y1]=c.battleSprite.frames[0].bounds,pad=12;
 cards.at(-1).battleSpriteViewport={x:Math.max(0,x0-pad),y:Math.max(0,y0-pad),width:x1-x0+1+pad*2,height:y1-y0+1+pad*2,imageWidth:c.battleSprite.width,imageHeight:c.battleSprite.height};
 assets.push({code,slug:c.slug,sourceArt:{path:sourceArt,sha256:sha(source),original:preview+'/'+c.sourceArt.path},battleSprite:{path:battleSprite,sha256:sha(sprite),original:preview+'/'+c.battleSprite.path},previewCodeNowAssigned:true});
}
await fs.writeFile('shared/mercenary-bloodmoon-catalog-v1.mjs',`// User: SS limited, 10 server-wide copies each, opening unavailable (2026-10-23).\nexport const BLOODMOON_SERVER_LIMIT=10;\nexport const BLOODMOON_BASE_POWER=356400;\nexport const BLOODMOON_MERCENARIES=Object.freeze(${JSON.stringify(cards,null,2)}.map(card=>Object.freeze(card)));\nexport const BLOODMOON_CODES=Object.freeze(BLOODMOON_MERCENARIES.map(c=>c.code));\n`);
await fs.writeFile(root+'/manifest.json',JSON.stringify({date:'2026-10-23',userRequest:'리미티드 도감에 반영해 한도 10장씩 현재는 개봉불가',rankConfirmation:'SS 리미티드',rank:'SS',serverLimitPerCharacter:10,mode:'OFF',acquisitionEnabled:false,deploymentEnabled:false,originalsModified:false,assets},null,2)+'\n');
console.log(JSON.stringify({cards:cards.length,rank:'SS',serverLimit:10,mode:'OFF',originalsModified:false}));

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
const cards=structuredClone(HALLOWEEN_MERCENARIES),directory='assets/ui/project-v/mercenaries/halloween-approved-20261014/media';
fs.mkdirSync(directory,{recursive:true});
for(const card of cards){
 const source=fs.readFileSync(card.sourceArt);
 if(createHash('sha256').update(source).digest('hex').toUpperCase()!==card.sourceArtSha256)throw Error('Approved source changed: '+card.code);
 for(const [field,width]of [['thumbnailArt',320],['displayArt',640]]){
  card[field]=directory+'/'+card.code.toLowerCase()+'-'+width+'.webp';
  await sharp(source).resize({width,withoutEnlargement:true,fit:'inside'}).webp({quality:90,effort:6}).toFile(card[field]);
 }
}
fs.writeFileSync('shared/mercenary-halloween-catalog-v1.mjs','// Approved PNG originals are preserved; WebP derivatives are for display only.\nexport const HALLOWEEN_MERCENARIES=Object.freeze('+JSON.stringify(cards,null,2)+'.map(card=>Object.freeze(card)));\nexport const isHalloweenMercenary=code=>HALLOWEEN_MERCENARIES.some(card=>card.code===code);\n');
console.log(JSON.stringify({originalsPreserved:cards.length,displayDerivatives:cards.length*2}));

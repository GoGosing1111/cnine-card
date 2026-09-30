import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),check=process.argv.includes('--check');
const source=JSON.parse(fs.readFileSync(path.join(root,'preview/icon-battle-assets-v1/manifest.json'),'utf8'));
const manifest={format:'PROJECT_V_TIER_BATTLE_SPRITE_MANIFEST_V1',scope:'BATTLE_ENGINE_ONLY',rarity:'ICON',release:'20260930-user-request',characters:ICON_LIVE_CARDS.map(card=>{
 const sd=source.characters.find(c=>c.code===card.code);if(!sd)throw Error('Missing ICON SD '+card.code);
 const file='preview/icon-battle-assets-v1/'+sd.runtime,hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').toUpperCase();
 if(hash!==sd.runtimeSha256)throw Error('ICON SD hash mismatch '+card.code);
 return {cardId:card.cardId,title:card.name,member:card.name,sourceArt:card.sourceArt,battleSprite:file,sha256:hash,footAnchor:sd.footAnchor};
})};
const result=await build({absWorkingDir:root,entryPoints:['js/icon-fusion-v1.mjs'],outfile:'js/icon-fusion-v1.bundle.js',bundle:true,minify:true,format:'iife',target:'es2022',write:false});
const files=[['js/icon-fusion-v1.bundle.js',result.outputFiles[0].text],['assets/ui/project-v/characters/icon/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n']];
for(const [relative,content] of files){const file=path.join(root,relative);if(check){if(fs.readFileSync(file,'utf8')!==content)throw Error('Outdated '+relative);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}}
console.log(`ICON bundle and 7 SD mappings ${check?'verified':'built'}`);

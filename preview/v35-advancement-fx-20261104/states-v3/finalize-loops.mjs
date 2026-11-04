import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const path=dir+'runtime/fx-manifest.json',manifest=JSON.parse(await fs.readFile(path,'utf8'));
for(const clip of Object.values(manifest.effects)){
 // The native bake holds each hand-painted phase for six 60Hz frames.
 // Collapse those holds into eight key drawings, avoiding a duplicated seam.
 const seen=new Set();clip.frames=clip.frames.filter(f=>{const key=JSON.stringify(f);if(seen.has(key))return false;seen.add(key);return true;});
 if(clip.frames.length!==8)throw Error('Expected eight unique loop phases');
 clip.fps=10;clip.duration=.8;clip.loop=true;clip.loopSource='Eight sequential native-baked drawings; no synthesized in-betweens';
}
await fs.writeFile(path,JSON.stringify(manifest,null,2));
console.log('3 sustained loops, 8 unique painted phases each, 0.8 seconds');

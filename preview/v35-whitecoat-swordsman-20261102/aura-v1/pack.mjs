import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url));
const size=192,cols=10,rows=6;
const cells=[];
for(let i=0;i<60;i++) {
 const input=await sharp(dir+`frames/taegeuk-orbit/frame-${String(i+1).padStart(4,'0')}.png`).resize(size,size).png().toBuffer();
 cells.push({input,left:(i%cols)*size,top:Math.floor(i/cols)*size});
}
const output=dir+'runtime/orbit.png';
await sharp({create:{width:cols*size,height:rows*size,channels:4,background:'#00000000'}}).composite(cells).png().toFile(output);
const bytes=await fs.readFile(output);
await fs.writeFile(dir+'runtime/manifest.json',JSON.stringify({version:1,emblem:'taegeuk.png',emblemSize:768,orbit:'orbit.png',cell:size,columns:cols,frames:60,seconds:4,emblemSeconds:10,blend:'add',decodedBytes:768*768*4+cols*rows*size*size*4,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
console.log({atlas:[cols*size,rows*size],bytes:bytes.length});

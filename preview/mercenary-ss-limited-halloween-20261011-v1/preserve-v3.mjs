import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const generated='C:/Users/User/.codex/generated_images/01a11cc1-7cc4-7c03-bfb4-adcdd3f402dd';
const versions=[
  {code:'V-991',source:'exec-18468c7f-7244-4a37-b6cf-4a58e8d4a05e.png',output:'assets/joeun-halloween-new-pose-v3.png'},
  {code:'V-994',source:'exec-bd4e30b6-64a3-4b5e-8968-f534c3884268.png',output:'assets/diim-halloween-new-pose-v3.png'},
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
for(const entry of versions){
  const source=path.join(generated,entry.source),destination=path.join(root,entry.output),buffer=await fs.readFile(source);
  if(!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||buffer.readUInt32BE(16)!==1024||buffer.readUInt32BE(20)!==1536||buffer[24]!==8||buffer[25]!==2)throw new Error(`Unexpected PNG: ${entry.code}`);
  const idat=[];for(let offset=8;offset+12<=buffer.length;){const size=buffer.readUInt32BE(offset);if(buffer.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(buffer.subarray(offset+8,offset+8+size));offset+=size+12;}
  if(inflateSync(Buffer.concat(idat)).length!==1536*(1024*3+1))throw new Error('Invalid pixel stream');
  const sha256=hash(buffer);
  try{await fs.copyFile(source,destination,1)}catch(error){if(error.code!=='EEXIST')throw error;}
  if(hash(await fs.readFile(destination))!==sha256)throw new Error('Preserved original hash mismatch');
  const character=manifest.characters.find(c=>c.code===entry.code);
  character.status='USER_REVIEW_PENDING';character.sourceArt=entry.output;character.sourceArtVersion=3;character.sourceArtSha256=sha256;
  character.preserved=[{version:3,path:entry.output,originalGeneratedPath:source.replaceAll('\\','/'),width:1024,height:1536,format:'PNG',mode:'RGB',bitDepth:8,bytes:buffer.length,sha256,status:'USER_REVIEW_PENDING',copyMethod:'byte-identical fs.copyFile'}];
  console.log(JSON.stringify({code:entry.code,path:entry.output,sha256,status:character.status}));
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');

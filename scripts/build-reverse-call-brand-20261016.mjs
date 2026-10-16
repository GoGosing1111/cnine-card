import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir='assets/ui/brand/reverse-call-20261016';
await mkdir(dir,{recursive:true});
const input=process.argv[2];
if(input)await copyFile(input,dir+'/source.png');
const source=await readFile(dir+'/source.png');
const original=await sharp(source).metadata();
if(original.width!==1254||original.height!==1254)throw Error('Unexpected approved source dimensions');
const files=[];
async function save(name,bytes,extra={}){
 await writeFile(dir+'/'+name,bytes);const metadata=await sharp(bytes).metadata();
 files.push({file:dir+'/'+name,width:metadata.width,height:metadata.height,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...extra});
}
files.push({file:dir+'/source.png',width:original.width,height:original.height,bytes:source.length,sha256:createHash('sha256').update(source).digest('hex'),originalBytesPreserved:true});
for(const [name,size] of [['icon-192',192],['icon-512',512],['apple-touch-icon-180',180],['favicon-16',16],['favicon-32',32],['favicon-48',48],['icon-128',128]])await save(name+'.png',await sharp(source).resize(size,size,{fit:'contain'}).png().toBuffer());
await save('maskable-512.png',await sharp(source).resize(344,344).extend({top:84,bottom:84,left:84,right:84,background:'#060616'}).png().toBuffer(),{purpose:'maskable',padding:84});
for(const width of [240,480]){
 await save('logo-'+width+'.webp',await sharp(source).resize(width,width).webp({quality:94}).toBuffer());
 await save('logo-'+width+'.avif',await sharp(source).resize(width,width).avif({quality:85}).toBuffer());
}
const sizes=[16,24,32,48,64,128,256];const parts=[];
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
for(const [i,size] of sizes.entries()){
 const png=await sharp(source).resize(size,size).png().toBuffer(),entry=6+16*i;
 header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;parts.push(png);
}
const ico=Buffer.concat([header,...parts]);await writeFile(dir+'/favicon.ico',ico);
files.push({file:dir+'/favicon.ico',sizes,bytes:ico.length,sha256:createHash('sha256').update(ico).digest('hex')});
await copyFile(dir+'/icon-512.png','packaging/windows-client/renderer/assets/icon.png');
await copyFile(dir+'/icon-512.png','packaging/windows-client/renderer/assets/reverse-call-logo.png');
await copyFile(dir+'/favicon.ico','favicon.ico');
for(const extension of ['chrome-extension','server/chrome-extension']){
 await mkdir(extension+'/icons',{recursive:true});
 for(const size of [16,32,48,128])await copyFile(dir+'/'+(size===128?'icon':'favicon')+'-'+size+'.png',extension+'/icons/icon-'+size+'.png');
}
await writeFile(dir+'/manifest.json',JSON.stringify({date:'2026-10-16',brand:'리버스콜',land:'리버스랜드',source:'User attachment codex-clipboard-066c2ee7-c814-423d-8449-4de5d9fc3374.png',processing:'Original preserved; proportional size exports only; maskable icon has safe-area padding.',files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,sourceSha256:files[0].sha256}));

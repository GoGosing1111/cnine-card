import sharp from 'sharp';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),root=fileURLToPath(new URL('..',import.meta.url));
const label=(text,w=512)=>Buffer.from(`<svg width="${w}" height="30"><rect width="100%" height="100%" fill="#0b1420"/><text x="14" y="21" font-family="Segoe UI" font-size="14" fill="#ebf3ff">${text}</text></svg>`);
const layers=[];let rows=0;
for(const [id,frames]of [['cleave',[3,7,12,18]],['contact',[3,7,15,25]],['ground-wave',[5,12,22,35]],['debris',[3,10,17,23]]]){for(let col=0;col<4;col++){const f=frames[col],img=await sharp(`${root}/frames/${id}/frame-${String(f).padStart(4,'0')}.png`).resize(256,256).png().toBuffer();layers.push({input:img,left:col*256,top:rows*286+30},{input:label(`${id} / source frame ${f}`,256),left:col*256,top:rows*286});}rows++;}
await sharp({create:{width:1024,height:rows*286,channels:4,background:'#142232'}}).composite(layers).png().toFile(dir+'tool-frames.png');
const compare=[];
for(const [i,mode]of ['off','on'].entries()){const img=await sharp(dir+`mixed-40-${mode}.png`).extract({left:720,top:420,width:300,height:220}).resize(480,352).png().toBuffer();compare.push({input:img,left:i*480,top:30},{input:label(mode==='on'?'Effekseer + Blender / same V3 attack':'FX OFF / same V3 attack',480),left:i*480,top:0});}
await sharp({create:{width:960,height:382,channels:4,background:'#0b1420'}}).composite(compare).png().toFile(dir+'comparison.png');
const alphaLayers=[];for(const [r,id]of ['cleave','contact','ground-wave','debris'].entries()){
 const file=`${root}/frames/${id}/frame-${id==='debris'?'0010':'0007'}.png`,{data,info}=await sharp(file).resize(256,256).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const [c,bg]of [[0,[15,25,38]],[1,[216,223,230]]]){const out=Buffer.alloc(256*256*4);for(let p=0;p<data.length;p+=4){const a=data[p+3]/255;for(let k=0;k<3;k++)out[p+k]=Math.min(255,Math.round(bg[k]+data[p+k]*a-(id==='debris'?bg[k]*a:0)));out[p+3]=255;}alphaLayers.push({input:await sharp(out,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(),left:c*256,top:r*286+30},{input:label(id+' / '+(c?'light':'dark'),256),left:c*256,top:r*286});}
}
await sharp({create:{width:512,height:1144,channels:4,background:'#0b1420'}}).composite(alphaLayers).png().toFile(dir+'alpha-backgrounds.png');
console.log('Created final frame, V3 ON/OFF, and alpha review sheets.');

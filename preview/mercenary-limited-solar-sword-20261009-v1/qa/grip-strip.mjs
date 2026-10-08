import fs from'node:fs/promises';import sharp from'sharp';import{fileURLToPath}from'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),defs={...JSON.parse(await fs.readFile(file('../pose-registration.json'))),...JSON.parse(await fs.readFile(file('../pose-registration-sx-revision.json')))},parts=[];
let n=0;for(const [key,d]of Object.entries(defs)){const source=file('../assets/sources/body-'+key+'.png'),meta=await sharp(source).metadata();for(const i of d.select??[0,1,2,3]){
const [x,y]=d.grips[i],crop=await sharp(source).extract({left:Math.min(meta.width-96,Math.max(0,x-48)),top:Math.min(meta.height-96,Math.max(0,y-48)),width:96,height:96}).resize(192,192).flatten({background:'#172030'}).png().toBuffer();
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="220"><text x="5" y="212" fill="white" font-size="14">${key} ${i} / ${d.angles[i]}°</text><circle cx="96" cy="96" r="3" fill="red"/><path d="M96 96l${Math.cos(d.angles[i]*Math.PI/180)*70} ${Math.sin(d.angles[i]*Math.PI/180)*70}" stroke="cyan" stroke-width="1"/></svg>`;
parts.push({input:await sharp({create:{width:192,height:220,channels:4,background:'#172030'}}).composite([{input:crop,left:0,top:0},{input:Buffer.from(svg),left:0,top:0}]).png().toBuffer(),left:n%6*192,top:Math.floor(n/6)*220});n++;
}}
await sharp({create:{width:1152,height:Math.ceil(n/6)*220,channels:4,background:'#172030'}}).composite(parts).png().toFile(file('grip-registration-strip.png'));

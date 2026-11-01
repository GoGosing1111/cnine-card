import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
// Rectangle crops only. No polygon masks, background removal or painted edits.
export const selections=[
 ['ready','ready-v1.png',null],
 ['windup','windup-fixed-v1.png',null],
 ['contact','basic-sheet-v1.png',{left:615,top:0,width:639,height:605}],
 ['follow','follow-v1.png',null],
 ['iai_ready','skill-sheet-v1.png',{left:0,top:0,width:620,height:585}],
 ['iai_cut','skill-sheet-v1.png',{left:635,top:0,width:619,height:585}],
 ['rise','skill-sheet-v1.png',{left:0,top:590,width:640,height:664}],
 ['recover','skill-sheet-v1.png',{left:645,top:620,width:609,height:634}],
 ['step','utility-sheet-v1.png',{left:0,top:0,width:670,height:605}],
 ['hit','utility-sheet-v1.png',{left:0,top:605,width:620,height:649}],
 ['defeat','utility-sheet-v1.png',{left:630,top:680,width:624,height:574}],
];
await fs.mkdir(dir+'cropped',{recursive:true});
const reports=[];
for(const [id,source,crop] of selections){
 let p=sharp(dir+'art/'+source);if(crop)p=p.extract(crop);await p.png().toFile(dir+'cropped/'+id+'.png');
 const {data,info}=await sharp(dir+'cropped/'+id+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let minX=info.width,minY=info.height,maxX=-1,maxY=-1,boundary=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(!x||!y||x===info.width-1||y===info.height-1)boundary++;}
 reports.push({id,source,crop,width:info.width,height:info.height,alphaBounds:[minX,minY,maxX,maxY],boundary});
 const w=info.width,h=info.height;let lines='';for(let x=0;x<w;x+=100)lines+=`<path d="M${x},0V${h}" stroke="white" opacity=".22"/><text x="${x+3}" y="18" fill="white" font-size="17">${x}</text>`;for(let y=100;y<h;y+=100)lines+=`<path d="M0,${y}H${w}" stroke="white" opacity=".22"/><text x="3" y="${y-3}" fill="white" font-size="17">${y}</text>`;
 const grid=await sharp(dir+'cropped/'+id+'.png').flatten({background:'#697581'}).composite([{input:Buffer.from(`<svg width="${w}" height="${h}">${lines}</svg>`)}]).png().toBuffer();await sharp(grid).resize({width:800,height:900,fit:'inside'}).png().toFile(dir+'qa/'+id+'-grid.png');
}
await fs.writeFile(dir+'qa/crop-audit.json',JSON.stringify(reports,null,2));console.log(reports);

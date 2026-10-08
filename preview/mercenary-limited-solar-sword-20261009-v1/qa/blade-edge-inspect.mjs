import sharp from 'sharp';import{fileURLToPath}from'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),source=file('../../../assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png');
const strips=[{x:240,y:670},{x:320,y:800},{x:420,y:930},{x:510,y:1060},{x:600,y:1190},{x:700,y:1320},{x:770,y:1400}],parts=[];
for(const [i,{x,y}]of strips.entries()){
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">';
for(let k=0;k<240;k+=20)svg+=`<path d="M${k} 0v120" stroke="cyan" stroke-opacity=".45"/><text x="${k+1}" y="12" fill="cyan" font-size="10">${x+k}</text>`;
for(let k=0;k<120;k+=20)svg+=`<path d="M0 ${k}h240" stroke="cyan" stroke-opacity=".45"/><text x="1" y="${k+12}" fill="cyan" font-size="10">${y+k}</text>`;svg+='</svg>';
const bytes=await sharp(source).extract({left:x,top:y,width:240,height:120}).composite([{input:Buffer.from(svg),left:0,top:0}]).png().toBuffer();
parts.push({input:await sharp(bytes).resize(720,360).png().toBuffer(),left:0,top:i*360});
}
await sharp({create:{width:720,height:parts.length*360,channels:4,background:'#08121c'}}).composite(parts).png().toFile(file('blade-edges.png'));

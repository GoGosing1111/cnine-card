import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
let g='<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">';
for(let x=0;x<1024;x+=100)g+=`<path d="M${x} 0V1536" stroke="#00ffff" stroke-opacity=".55"/><text x="${x+3}" y="25" fill="#00ffff" font-size="20">${x}</text>`;
for(let y=0;y<1536;y+=100)g+=`<path d="M0 ${y}H1024" stroke="#00ffff" stroke-opacity=".55"/><text x="2" y="${y+23}" fill="#00ffff" font-size="20">${y}</text>`;
g+='</svg>';
await sharp(file('../../assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png')).composite([{input:Buffer.from(g)}]).png().toFile(file('qa/sword-coordinate-map.png'));

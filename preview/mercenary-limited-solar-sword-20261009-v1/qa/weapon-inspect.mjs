import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const orig=file('../../../assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png');
let grid='<svg xmlns="http://www.w3.org/2000/svg" width="380" height="430">';
for(let x=0;x<380;x+=20)grid+=`<path d="M${x} 0V430" stroke="cyan" stroke-opacity=".25"/><text x="${x+1}" y="13" fill="cyan" font-size="10">${x+20}</text>`;
for(let y=0;y<430;y+=20)grid+=`<path d="M0 ${y}H380" stroke="cyan" stroke-opacity=".25"/><text x="2" y="${y+11}" fill="cyan" font-size="10">${y+380}</text>`;
grid+='</svg>';
const upper=await sharp(orig).extract({left:20,top:380,width:380,height:430}).composite([{input:Buffer.from(grid),left:0,top:0}]).png().toBuffer();
await sharp(upper).resize(1140,1290).png().toFile(file('weapon-upper-grid.png'));
for(const name of ['idle','cut','command']){
const img=file('../assets/sources/body-'+name+'.png'),m=await sharp(img).metadata();
await sharp(img).extract({left:0,top:0,width:Math.round(m.width/2),height:Math.round(m.height/2)}).resize(900,900).flatten({background:'#171d2b'}).png().toFile(file('grip-'+name+'.png'));
}

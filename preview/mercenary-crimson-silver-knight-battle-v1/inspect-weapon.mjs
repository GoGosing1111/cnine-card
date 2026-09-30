import sharp from 'sharp';
let svg='<svg width="440" height="1536" xmlns="http://www.w3.org/2000/svg">';
for(let x=100;x<440;x+=25)svg+=`<path d="M${x} 160V1500" stroke="cyan" opacity=".4"/><text x="${x}" y="180" fill="cyan" font-size="12">${x}</text>`;
for(let y=200;y<1500;y+=50)svg+=`<path d="M100 ${y}H440" stroke="cyan" opacity=".4"/><text x="105" y="${y}" fill="cyan" font-size="12">${y}</text>`;
svg+='</svg>';
const input=await sharp(new URL('assets/user-approved/knight-base-approved.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')).flatten({background:'#101016'}).composite([{input:Buffer.from(svg),left:0,top:0}]).png().toBuffer();
await sharp(input).extract({left:100,top:160,width:340,height:1320}).png().toFile(new URL('assets/weapon-grid-inspection.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));

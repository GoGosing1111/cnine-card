import fs from'node:fs/promises';import sharp from'sharp';import{fileURLToPath}from'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),cfg=JSON.parse(await fs.readFile(file('../assets/locked/v2/weapon-provenance.json')));
await sharp(file('../'+cfg.source)).extract(cfg.rect).png().toFile(file('weapon-original-crop.png'));
await sharp(file('../assets/frames/idle-00.png')).trim({threshold:0}).extend({top:30,bottom:30,left:30,right:30,background:'#00000000'}).png().toFile(file('held-sword-v2.png'));
const m=JSON.parse(await fs.readFile(file('../manifest.json'))),p=m.motion.idle.frames[0].grip;
await sharp(file('../assets/frames/idle-00.png')).extract({left:Math.round(p.x)-42,top:Math.round(p.y)-42,width:118,height:118}).resize(472,472).png().toFile(file('held-grip-v2.png'));

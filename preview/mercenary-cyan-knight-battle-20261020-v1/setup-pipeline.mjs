import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
let s=await fs.readFile(path.join(dir,'../battle-suit-x-v1/pack-assets.mjs'),'utf8');
s=s.replace("BATTLE_SUIT_X_REVIEW_20260927_V2","CYAN_KNIGHT_BATTLE_REVIEW_20261020_V1").replace("assets/sources/x-body-sword-approved-v1.png","assets/sources/source-art-v3.png");
s=s.replace("const rows={dash:[],attack:[],skill:[],combo:[]};","const rows=Object.fromEntries(['idle','dash','hit','defeat','horizon','flurry','meteor','array','zenith'].map(k=>[k,[]]));");
s=s.replace("height:1536,channels:4","height:Math.ceil(frames.length/4)*768,channels:4").replace("rows:2,frameWidth:768","rows:Math.ceil(frames.length/4),frameWidth:768");
s=s.replace("{dash:[4,3],'cut-v2':[4,3],'cross-v2':[4,3],'cleave-v2':[4,3],'ground-v2':[4,3]}","{dash:[4,3],horizon:[4,3],flurry:[4,3],meteor:[4,3],array:[4,3],rift:[4,3],ground:[4,3],orbit:[4,3]}");
const hand=[
'// Restore the original drawn fingers in front of the locked blade base. No hand repaint.',
'  const hand=Buffer.alloc(crop.length),a=def.angles[i]*Math.PI/180;',
'  const hx=def.grips[i][0]-b.left-Math.cos(a)*10,hy=def.grips[i][1]-b.top-Math.sin(a)*10,rad=def.upright*.024;',
'  for(let yy=0;yy<b.height;yy++)for(let xx=0;xx<b.width;xx++)if(Math.hypot(xx-hx,yy-hy)<rad){const o=(yy*b.width+xx)*4;crop.copy(hand,o,o,o+4);}',
'  const foreground=await sharp(hand,{raw:{width:b.width,height:b.height,channels:4}}).resize(bw,bh).png().toBuffer();',
'  const whole=await sharp'].join('\n');
s=s.replace("const whole=await sharp",hand);
s=s.replace("{input:rotated,left:weaponLeft,top:weaponTop}]", "{input:rotated,left:weaponLeft,top:weaponTop},{input:foreground,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)}]");
s=s.replace("console.log(JSON.stringify({summary:manifest.summary,frames:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.map(f=>({id:f.entry.id,pivot:f.entry.pivot,tip:f.entry.tip}))]))},null,2));","console.log(JSON.stringify(manifest.summary));");
await fs.writeFile(path.join(dir,'pack-assets.mjs'),s);
for(const name of ['build.mjs','serve.mjs','battle.html']){
 let b=await fs.readFile(path.join(dir,'../battle-suit-x-v1',name),'utf8');
 b=b.replaceAll('battle-suit-x-v1','mercenary-cyan-knight-battle-20261020-v1').replaceAll('X-BODY','CYAN KNIGHT').replaceAll('X_BODY_PREVIEW_PORT','CYAN_KNIGHT_PREVIEW_PORT').replaceAll('8973','8991');
 await fs.writeFile(path.join(dir,name),b);
}
await fs.mkdir(path.join(dir,'source'),{recursive:true});
await fs.copyFile(path.join(dir,'../battle-suit-x-v1/preview.css'),path.join(dir,'preview.css'));

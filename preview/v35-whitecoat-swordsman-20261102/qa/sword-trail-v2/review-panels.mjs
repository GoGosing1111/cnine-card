import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),panels=[];
const files=['attack_basic-320.png','attack_basic-400.png','skill_iai-300.png','skill_iai-510.png','skill_iai-550.png','skill_iai-620.png'];
for(const [i,file] of files.entries()){
 const b=await sharp(dir+file).extract({left:695,top:420,width:380,height:245}).resize(760,490).png().toBuffer();
 panels.push({input:b,left:(i%2)*760,top:Math.floor(i/2)*530});
}
const labels=['Forward cut / 0.32s','Follow-through / 0.40s','Quick draw / 0.30s','Rising cut / 0.51s','Release begins / 0.55s','Ascending burst / 0.62s'];
const words=labels.map((label,i)=>`<text x="${(i%2)*760+15}" y="${Math.floor(i/2)*530+518}">${label}</text>`).join('');
panels.push({input:Buffer.from(`<svg width="1520" height="1590"><g fill="#edf4fa" font-family="Arial" font-size="24">${words}</g></svg>`),left:0,top:0});
await sharp({create:{width:1520,height:1590,channels:4,background:'#111c29'}}).composite(panels).png().toFile(dir+'flourish-review.png');
console.log('Six selected phases composed from actual V3 screenshots.');

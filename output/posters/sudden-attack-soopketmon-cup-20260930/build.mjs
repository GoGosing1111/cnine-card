import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
let sharp;
try{sharp=require('sharp')}catch{sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp')}
const dir=fileURLToPath(new URL('.',import.meta.url));
const source=dir+'source-poster.png',background=dir+'edited-background.png',logo=dir+'sudden-attack-official-logo.png';
const output=dir+'sudden-attack-soopketmon-cup-poster-v1.png';
const width=1024,height=1536,fadeStart=530,fadeEnd=590;
const [sourceInfo,backgroundInfo,logoInfo]=await Promise.all([sharp(source).metadata(),sharp(background).metadata(),sharp(logo).metadata()]);
assert.equal(sourceInfo.width,width);assert.equal(sourceInfo.height,height);
assert.equal(backgroundInfo.width,width);assert.equal(backgroundInfo.height,height);
assert.equal(logoInfo.hasAlpha,true);

// ImageGen supplies only the reworked header; the original information panels
// below y=590 remain unchanged. The intervening stadium art fades smoothly.
const upper=await sharp(background).extract({left:0,top:0,width,height:fadeEnd}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(upper.info.channels,4);
for(let y=fadeStart;y<fadeEnd;y++){
 const alpha=Math.round(255*(fadeEnd-1-y)/(fadeEnd-1-fadeStart));
 for(let x=0;x<width;x++)upper.data[(y*width+x)*4+3]=alpha;
}
const upperPng=await sharp(upper.data,{raw:{width,height:fadeEnd,channels:4}}).png().toBuffer();
const base=await sharp(source).composite([{input:upperPng,left:0,top:0}]).png().toBuffer();

// All changed Korean words are deliberately typeset, never AI-drawn.
const title='숲켓몬배 대회',kicker='서든어택';
assert.equal(title.normalize('NFC'),'숲켓몬배 대회');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
 <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbd4"/><stop offset="0.42" stop-color="#ffe475"/><stop offset="1" stop-color="#efaa2a"/></linearGradient>
 <filter id="glow" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g text-anchor="middle" font-family="Noto Sans KR,Malgun Gothic,sans-serif">
 <text x="514" y="292" font-size="23" font-weight="800" letter-spacing="2" fill="#050815" stroke="#050815" stroke-width="5" paint-order="stroke fill">${kicker}</text>
 <text x="512" y="290" font-size="23" font-weight="800" letter-spacing="2" fill="#f8f4dc">${kicker}</text>
 <path d="M350 284h57 M617 284h57" stroke="#e7c964" stroke-width="2" stroke-linecap="round" opacity=".85"/>
 <text x="518" y="363" font-size="54" font-weight="900" letter-spacing="-2" fill="#030413" stroke="#030413" stroke-width="16" paint-order="stroke fill" opacity=".95">${title}</text>
 <text x="512" y="357" font-size="54" font-weight="900" letter-spacing="-2" fill="#6a3c95" filter="url(#glow)" opacity=".68">${title}</text>
 <text x="512" y="357" font-size="54" font-weight="900" letter-spacing="-2" fill="url(#gold)" stroke="#170b2d" stroke-width="8" paint-order="stroke fill">${title}</text>
</g></svg>`;
await writeFile(dir+'title-overlay.svg',svg);
const officialLogo=await sharp(logo).resize({width:274}).png().toBuffer();
const final=await sharp(base).composite([
 {input:officialLogo,left:375,top:171},
 {input:Buffer.from(svg),left:0,top:0}
]).png().toFile(output);
assert.equal(final.width,width);assert.equal(final.height,height);
const lower={left:0,top:fadeEnd,width,height:height-fadeEnd};
const [oldPixels,newPixels]=await Promise.all([sharp(source).extract(lower).removeAlpha().raw().toBuffer(),sharp(output).extract(lower).removeAlpha().raw().toBuffer()]);
assert.ok(oldPixels.equals(newPixels),'Information panels below the title changed');
await writeFile(dir+'qa.json',JSON.stringify({width,height,titleText:`${kicker} ${title}`,brandExact:true,officialLogo:true,lowerPanelPixelsUnchanged:true,fadeRows:[fadeStart,fadeEnd],output:'sudden-attack-soopketmon-cup-poster-v1.png'},null,2)+'\n');
console.log(JSON.stringify({output,width,height,brandExact:true,lowerPanelPixelsUnchanged:true}));

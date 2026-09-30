import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const root=path.dirname(fileURLToPath(import.meta.url));
const input=path.join(root,'assets/user-approved/knight-base-approved.png');
const source=await fs.readFile(input);
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
if(sha(source)!=='967113CDD1619DB498C7BE466E5F4608D2DE4B3120DE7534B3BA5C22B32CBADE')throw Error('Approved master changed');
// This is a selection boundary, not a drawn replacement weapon. Every retained
// RGB pixel comes directly from the immutable user-approved PNG.
const outline=`M276 171 L295 196 L304 211 L304 220 L294 226 L285 235
 L285 281 L260 281 L259 236 L248 229 L242 215 L249 194 Z
 M261 367 L283 367 L287 408 L299 432
 Q325 453 349 458 Q369 460 389 438 L424 411
 Q407 445 409 469 Q422 502 396 533 L383 546
 Q397 516 377 519 Q365 525 374 539
 L357 556 L370 559 L344 579 L338 596 L361 590
 L354 610 L340 628 L351 631 L341 655 L330 675 L329 700
 L349 800 L355 1150 Q357 1235 369 1293
 Q367 1322 364 1343 Q375 1372 400 1346 L409 1330 L434 1319
 Q414 1353 402 1378 Q390 1410 369 1416 L344 1422 L362 1428
 Q330 1432 287 1455 L255 1428 L221 1422
 Q187 1424 159 1374 Q146 1338 131 1309
 Q170 1312 175 1329 Q179 1349 193 1360
 Q209 1356 213 1344 Q218 1313 211 1299 Q204 1303 208 1280
 L219 1150 L212 750 L209 700 L207 675 L194 631 L183 614 L194 620
 L187 599 L174 579 L183 577 L206 591 L198 573 L178 559 L172 550
 L197 557 L189 541 Q192 515 174 535 L171 540
 Q150 530 141 501 Q132 474 143 448 Q154 431 137 412
 Q171 417 179 437 Q198 466 228 452 L248 429 L261 406 Z`;
const mask=await sharp(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><path d="${outline}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
const original=await sharp(source).ensureAlpha().raw().toBuffer();
let pixels=0;for(let p=0;p<1024*1536;p++){
 const x=p%1024,y=Math.floor(p/1024),r=original[p*4],g=original[p*4+1],b=original[p*4+2];
 let a=Math.round(original[p*4+3]*mask[p*4+3]/255);
 if(y>400&&(x<240||x>310)&&r>g*2.4&&r>b*2.4)a=0; // cape pixels outside the ruby spine
 original[p*4+3]=a;if(a)pixels++;else original.fill(0,p*4,p*4+4);
}
const full=await sharp(original,{raw:{width:1024,height:1536,channels:4}}).png().toBuffer();
const crop={left:120,top:165,width:322,height:1300};
const weapon=await sharp(full).extract(crop).png().toBuffer();
await fs.mkdir(path.join(root,'assets/weapon'),{recursive:true});
await fs.writeFile(path.join(root,'assets/weapon/sword-original.png'),weapon);
await fs.writeFile(path.join(root,'assets/weapon/selection.svg'),`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><path d="${outline}" fill="white"/></svg>\n`);
const record={source:'assets/user-approved/knight-base-approved.png',sourceSha256:sha(source),file:'assets/weapon/sword-original.png',sha256:sha(weapon),crop,grip:[276-crop.left,329-crop.top],pommel:[276-crop.left,173-crop.top],tip:[287-crop.left,1448-crop.top],sourceBodyHeight:1452,occludedGrip:[281-crop.top,367-crop.top],rgbPolicy:'ORIGINAL_RGB_COPY_NO_REPAINT',transformPolicy:'UNIFORM_SCALE_ROTATION_TRANSLATION_ONLY',selectedPixels:pixels};
await fs.writeFile(path.join(root,'assets/weapon/sword-original.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));

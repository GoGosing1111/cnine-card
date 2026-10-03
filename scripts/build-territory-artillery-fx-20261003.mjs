import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../assets/ui/territory-war/artillery-fx-v1/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const sheets={muzzle:{columns:4,rows:4,anchor:[.18,.53]},projectile:{columns:4,rows:2,anchor:[.93,.50]},impact:{columns:4,rows:4,anchor:[.5,.9]}};
const assets={};
for(const [name,layout] of Object.entries(sheets)){
 const input=await readFile(new URL(name+'-source.png',root)),meta=await sharp(input).metadata(),cell=320,frames=[];
 if(!meta.hasAlpha)throw Error(name+' must have generated alpha');
 const packed=[];
 for(let y=0;y<layout.rows;y++)for(let x=0;x<layout.columns;x++){
  const left=Math.round(x*meta.width/layout.columns),top=Math.round(y*meta.height/layout.rows);
  const width=Math.round((x+1)*meta.width/layout.columns)-left,height=Math.round((y+1)*meta.height/layout.rows)-top;
  const buffer=await sharp(input).extract({left,top,width,height}).resize(cell,cell,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  packed.push({input:buffer,left:x*cell,top:y*cell});
  frames.push({source:{x:left,y:top,w:width,h:height},x:x*cell,y:y*cell,w:cell,h:cell,sha256:hash(buffer)});
 }
 const output=await sharp({create:{width:cell*layout.columns,height:cell*layout.rows,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(packed).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
 await writeFile(new URL(name+'-atlas.webp',root),output);
 assets[name]={source:name+'-source.png',sourceSha256:hash(input),sourceWidth:meta.width,sourceHeight:meta.height,url:'/assets/ui/territory-war/artillery-fx-v1/'+name+'-atlas.webp',sha256:hash(output),bytes:output.length,columns:layout.columns,rows:layout.rows,cell,anchor:layout.anchor,frames};
}
const input=await readFile(new URL('turret-source.png',root)),meta=await sharp(input).metadata();
if(!meta.hasAlpha)throw Error('Turret requires generated transparency');
const output=await sharp(input).resize({width:768}).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
await writeFile(new URL('turret.webp',root),output);
assets.turret={source:'turret-source.png',sourceSha256:hash(input),url:'/assets/ui/territory-war/artillery-fx-v1/turret.webp',sha256:hash(output),bytes:output.length,width:768,height:512,muzzle:[.953,.159],ground:[.42,.925],axisRadians:-.324};
const manifest={version:'20261003-authored-artillery-v1',generator:'image_gen.imagegen',visualApproval:'USER_REVIEW_PENDING',runtime:'Shared Project V V3 BattleEngine effectScene, PixiJS 8.20.0 and registered GSAP 3.13.0 timelines',processing:'Original PNGs preserved. Technical cell extraction, uniform packing and WebP encoding only. Generated alpha preserved; no keying, redrawing or recoloring.',assets,
 timing:{cannon:{fireAt:.14,impactAt:1.05,endAt:3.25},shot:{fireAt:.06,impactAt:.62,endAt:1.72}},
 constraints:['Straight single rigid barrel and rail axis; whole-gun rigid recoil only','One shared V3 renderer; no extra canvas, CDN or library copy','Authored evolving frames, never scaled static main effects','Visual events consume server state only; no gameplay damage or rewards']};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({frames:Object.fromEntries(Object.entries(sheets).map(([name,s])=>[name,s.columns*s.rows])),bytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)}));

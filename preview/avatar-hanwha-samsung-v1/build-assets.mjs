import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const masters={
 kangguyeol:{equipment:'a44be2d34f0c01ccbe625504f7fd34b5c254a05279f007df67941f7b4187cbd9',lobby:'91d0cd5a5a82fbd3023036b3d3f433c1a9879484f22d13b87ec5b54e9dc30c10'},
 juseong:{equipment:'cf2de46f9d3eb120067a4ef756e9424ed2775f8796fa731befd669c22a0e1c76',lobby:'0178a227637ac62d3cfacff9b6d1543525cf2610b05d10624199716338e22b34'}
};
const result={generator:'built-in image_gen',date:'2026-10-01',backgroundRemoval:'none; generated alpha preserved',avatars:{}};
for(const [key,hashes] of Object.entries(masters)){
 const file=name=>new URL('./assets/'+key+'-'+name,import.meta.url);
 const equipment=await readFile(file('equipment-source-art-v1.png')),lobby=await readFile(file('lobby-source-art-v1.png'));
 if(sha(equipment)!==hashes.equipment||sha(lobby)!==hashes.lobby)throw Error(key+' source changed');
 const m=await sharp(equipment).metadata(),lm=await sharp(lobby).metadata();
 if(m.width!==1024||m.height!==1536||!m.hasAlpha||lm.width!==1024||lm.height!==1536)throw Error(key+' source dimensions');
 const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
  if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
  if((x===0||y===0||x===info.width-1||y===info.height-1)&&a>8)border++;
 }
 if(clear/(info.width*info.height)<.5||solid/(info.width*info.height)<.25||border)throw Error(key+' alpha or clipping');
 left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(info.width-1,right+4);bottom=Math.min(info.height-1,bottom+4);
 const crop={left,top,width:right-left+1,height:bottom-top+1},scale=Math.min(608/crop.width,1040/crop.height);
 const width=Math.round(crop.width*scale),height=Math.round(crop.height*scale),padLeft=Math.floor((640-width)/2);
 const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
 for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('lobby-v1-'+width+'.webp')));
 const files={};
 for(const name of ['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
  const b=await readFile(file(name)),meta=await sharp(b).metadata();files[key+'-'+name]={sha256:sha(b),bytes:b.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
 }
 result.avatars[key]={identityReference:'assets/cards/'+(key==='kangguyeol'?'강구열':'주성')+'/01.webp',clanMarkReference:'assets/ui/clan/marks/source/'+(key==='kangguyeol'?'hanwha':'samsung')+'-clan-mark-source-v1.png',alpha:{clearPixels:clear,solidPixels:solid,borderNontransparentPixels:border,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
}
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.avatars).map(([k,v])=>[k,{alpha:v.alpha,runtime:v.runtime}]))));

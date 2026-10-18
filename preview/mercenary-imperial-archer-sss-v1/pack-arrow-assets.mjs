import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const read=p=>fs.readFile(path.join(root,p));
const write=(p,b)=>fs.writeFile(path.join(root,p),b);
const keys=['charge','bolt','impact','volley','rain','breaker'];
const anchors={
 charge:Array.from({length:12},(_,i)=>[i<4?.52:.34,.50]),
 bolt:Array.from({length:12},()=>[.88,.51]),
 impact:Array.from({length:12},(_,i)=>[i===0?.50:i<4?.34:.28,.53]),
 volley:Array.from({length:12},()=>[.88,.50]),
 rain:Array.from({length:12},(_,i)=>[.55,i<3?.72:.79]),
 breaker:Array.from({length:12},(_,i)=>[.50,i<3?.76:.82])
};
export async function packArrowAssets(manifest){
 const base='assets/arrow-v2';
 for(const p of ['frames','atlases'])await fs.mkdir(path.join(root,base,p),{recursive:true});
 const effects={};
 for(const key of keys){
  const source=base+'/sources/'+key+'.png',bytes=await read(source),meta=await sharp(bytes).metadata();
  if(!meta.hasAlpha||meta.width%4||meta.height%3||meta.width/4!==meta.height/3)throw Error(key+' grid/alpha');
  const cw=meta.width/4,pad=32,cell=cw+pad*2,frames=[],buffers=[];
  for(let i=0;i<12;i++){
   const rect={left:i%4*cw,top:Math.floor(i/4)*cw,width:cw,height:cw};
   // Uniform cell extraction and transparent padding preserve all generated RGBA pixels.
   const frame=await sharp(bytes).extract(rect).extend({top:pad,bottom:pad,left:pad,right:pad,background:'#00000000'}).png().toBuffer();
   const file=base+'/frames/'+key+'-'+i+'.png';
   await write(file,frame);buffers.push(frame);
   const anchor={x:(pad+cw*anchors[key][i][0])/cell,y:(pad+cw*anchors[key][i][1])/cell};
   frames.push({index:i,file,sha256:hash(frame),source,sourceSha256:hash(bytes),sourceRect:rect,anchor});
  }
  const atlas=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%4*cell,top:Math.floor(i/4)*cell}))).png().toBuffer();
  const file=base+'/atlases/'+key+'.png';await write(file,atlas);
  effects[key]={atlas:file,sha256:hash(atlas),columns:4,rows:3,cellSize:cell,frameCount:12,sources:[{path:source,sha256:hash(bytes),width:meta.width,height:meta.height}],frames};
 }
 delete manifest.auraPlayback;delete manifest.auraConcept;delete manifest.exclusions;
 Object.assign(manifest,{version:2,date:'2026-10-18',revision:'arrow-v2',concept:'HEAVY_ARROW_PIERCING_VOLLEY_RAIN',status:'BATTLE_VISUAL_REVIEW_PENDING',runtimeEnabled:false,effects,counts:{motion:24,effects:72},retirement:{date:'2026-10-18',instruction:'주작 관련 리소스 다 폐기하고 화살 위주의 강력한 캐릭터로 다시 만들어',scope:'Previous bird aura and every previous VFX source/atlas/frame removed; approved art, rigid bow and body motions retained',record:'retired-phoenix-20261018.json'},authoring:{tool:'built-in image_gen',prompts:['prompts-arrow-v2.json','prompts-arrow-v2-extra.json'],generation:'generation-arrow-v2.json'}});
 await write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const manifest=await packArrowAssets(JSON.parse(await read('manifest.json')));
 console.log('Arrow V2 packed',manifest.counts);
}


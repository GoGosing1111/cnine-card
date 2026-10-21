import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),sources=path.join(root,'docs/qa/seal-dragon-20261022/sources'),out=path.join(root,'assets/ui/seal-battle/dragon-20261022');
await fs.mkdir(out,{recursive:true});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const originals=[];
for(const name of ['dragon-base','idle','breath','hurt-death','breath-fx','hero']){
 const bytes=await fs.readFile(path.join(sources,name+'.png')),meta=await sharp(bytes).metadata();
 originals.push({name,file:`docs/qa/seal-dragon-20261022/sources/${name}.png`,sha256:hash(bytes),width:meta.width,height:meta.height});
}
await sharp(path.join(sources,'dragon-base.png')).resize({width:768}).webp({quality:90,alphaQuality:100}).toFile(path.join(out,'portrait.webp'));
await sharp(path.join(sources,'hero.png')).resize({width:1600,withoutEnlargement:true}).webp({quality:88}).toFile(path.join(out,'hero.webp'));
const w=512,h=352,layers=[],frames={},alpha=[];
const groups=['idle','breath','hurt-death','breath-fx'];
for(let group=0;group<groups.length;group++){
 const source=sharp(path.join(sources,groups[group]+'.png')),meta=await source.metadata();
 const cw=Math.floor(meta.width/2),ch=Math.floor(meta.height/2);
 for(let i=0;i<4;i++){
  // ImageGen's lower poses do not all start at the mathematical row midpoint.
  // Use measured non-overlapping sprite regions, then pad each body into the
  // same 800x560 source plane. This keeps neighbouring claws out of death frames.
  const regions={idle:[[0,0,768,512],[768,0,768,512],[0,512,792,512],[792,512,744,512]],breath:[[0,0,768,520],[768,0,768,520],[0,520,798,504],[798,520,738,504]],'hurt-death':[[0,0,778,560],[778,0,758,560],[0,560,774,464],[774,560,762,464]]};
  const [left,top,width,height]=regions[groups[group]]?.[i]||[(i%2)*cw,Math.floor(i/2)*ch,cw,ch];
  let cell=source.clone().extract({left,top,width,height});
  if(group<3)cell=cell.extend({left:Math.floor((800-width)/2),right:Math.ceil((800-width)/2),top:560-height,bottom:0,background:{r:0,g:0,b:0,alpha:0}});
  const bytes=await cell
   .resize(w-24,h-16,{fit:'contain',position:'bottom',background:{r:0,g:0,b:0,alpha:0}})
   .extend({left:12,right:12,top:8,bottom:8,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const st=await sharp(bytes).stats();if(!st.channels[3]||st.channels[3].min!==0)throw Error('Missing true alpha: '+groups[group]);
  const x=i*w,y=group*h,name=`${groups[group]}-${i}`;
  layers.push({input:bytes,left:x,top:y});frames[name]={frame:{x,y,w,h},anchor:{x:.5,y:.98}};
  alpha.push({name,min:st.channels[3].min,max:st.channels[3].max});
 }
}
await sharp({create:{width:w*4,height:h*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).webp({quality:90,alphaQuality:100}).toFile(path.join(out,'motion.webp'));
await fs.writeFile(path.join(out,'motion.json'),JSON.stringify({version:1,image:'motion.webp',size:{w:w*4,h:h*4},frames,
 sequences:{idle:['idle-0','idle-1','idle-2','idle-3'],breath:['breath-0','breath-1','breath-2','breath-3'],hit:['hurt-death-0','hurt-death-1'],death:['hurt-death-2','hurt-death-3'],fx:['breath-fx-0','breath-fx-1','breath-fx-2','breath-fx-3']},mouth:{x:.12,y:.39},fxOrigin:{x:.94,y:.5}},null,2)+'\n');
const outputs=[];for(const name of ['portrait.webp','hero.webp','motion.webp','motion.json']){const b=await fs.readFile(path.join(out,name));outputs.push({file:`assets/ui/seal-battle/dragon-20261022/${name}`,sha256:hash(b),bytes:b.length});}
await fs.writeFile(path.join(root,'docs/qa/seal-dragon-20261022/manifest.json'),JSON.stringify({name:'봉인룡 네르가온',approval:'USER_REVIEW_PENDING',originals,outputs,alpha,technical:'generated RGBA alpha preserved; fixed-cell crop/resize/atlas only; no repainting or alpha reconstruction'},null,2)+'\n');
console.log(JSON.stringify(outputs));

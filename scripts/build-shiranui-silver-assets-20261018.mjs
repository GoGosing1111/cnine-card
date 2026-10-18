import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd(),dir=path.join(root,'assets/ui/project-v/mercenaries/shiranui-fx-20261018');fs.mkdirSync(dir,{recursive:true});
const generated='C:/Users/User/.codex/generated_images/01a149e5-cd8a-77d3-809d-c143949e3ec4/';
const inputs={ballistics:'exec-23cdf440-fa7c-4699-a02b-747e4ab7bd4a.png',rupture:'exec-ad084a7c-cf26-4038-92ef-87e0be0b3af7.png',dialogue:'exec-9981b0cc-2d71-45e6-9afa-394b12bf1eda.png'};
const hash=b=>createHash('sha256').update(b).digest('hex'),assets={},effects={};
for(const [name,input]of Object.entries(inputs)){
 const source=name+'-source.png',runtime=name+'.webp';if(!fs.existsSync(path.join(dir,source)))fs.copyFileSync(path.join(generated,input),path.join(dir,source));
 const meta=await sharp(path.join(dir,source)).metadata();
 assets[name]={source:{path:source,sha256:hash(fs.readFileSync(path.join(dir,source))),width:meta.width,height:meta.height},runtime:{path:runtime,alpha:meta.hasAlpha}};
 if(name==='dialogue'){await sharp(path.join(dir,source)).webp({lossless:true}).toFile(path.join(dir,runtime));}
 else{
  const cell=meta.width/4,pad=24,size=cell+pad*2,frames=[],composite=[];
  for(let i=0;i<12;i++){
   const sourceRect={left:i%4*cell,top:Math.floor(i/4)*cell,width:cell,height:cell};
   const input=await sharp(path.join(dir,source)).extract(sourceRect).png().toBuffer();
   composite.push({input,left:i%4*size+pad,top:Math.floor(i/4)*size+pad});
   const anchor=name==='rupture'?{x:.5,y:.5}:i<4?{x:([122,132,158,188][i]+pad)/size,y:(210+pad)/size}:i<8?{x:([346,344,340,338][i-4]+pad)/size,y:(186+pad)/size}:{x:.5,y:(190+pad)/size};
   frames.push({index:i,sourceRect,sha256:hash(input),anchor});
  }
  await sharp({create:{width:size*4,height:size*3,channels:4,background:'#00000000'}}).composite(composite).webp({lossless:true}).toFile(path.join(dir,runtime));
  effects[name==='ballistics'?'ar-ballistics':'silver-rupture']={atlas:'../../assets/ui/project-v/mercenaries/shiranui-fx-20261018/'+runtime,columns:4,cellSize:size,frameCount:12,frames};
 }
 assets[name].runtime.sha256=hash(fs.readFileSync(path.join(dir,runtime)));
}
const manifest={version:'SHIRANUI_SILVER_FX_20261018_V1',generator:'built-in image_gen',visualStatus:'IMPLEMENTED_TECHNICAL_QA_PENDING_USER_VISUAL_REVIEW',promptSet:'prompts.json',reference:{path:'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png',sha256:hash(fs.readFileSync(path.join(root,'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png')))},processing:'Source PNG bytes preserved. Atlas cells extracted unchanged and repacked with 24 transparent pixels to prevent sampling bleed. Lossless WebP. No repainting, palette replacement or silhouette edits.',assets,effects};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({assets,effects:Object.keys(effects)},null,2));


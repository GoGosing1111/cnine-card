import sharp from 'sharp';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),prompts=JSON.parse(await readFile(path.join(here,'prompts.json')));
const hash=data=>createHash('sha256').update(data).digest('hex');
await mkdir(path.join(here,'assets'),{recursive:true});
const manifest={version:'Z_DASH_V2',status:'USER_REVIEW_PENDING',generator:'built-in image_gen',packaging:'Sharp '+sharp.versions.sharp+': cell extraction, uniform resizing, transparent padding only. No repainting or alpha keying.',atlases:{}};
for(const [key,rows] of [['wake',3],['cut',2]]){
  const source=prompts.assets['z_dash_'+key+'_v2'].source;
  const master=key+'-source.png',masterPath=path.join(here,'assets',master);
  let original;
  try{original=await readFile(masterPath);}
  catch(error){if(error.code!=='ENOENT')throw error;await copyFile(source,masterPath);original=await readFile(masterPath);}
  const meta=await sharp(original).metadata(),frames=[],layers=[];
  if(!meta.hasAlpha)throw Error('Missing generated alpha: '+key);
  for(let i=0;i<rows*4;i++){
    const x0=Math.round(i%4*meta.width/4),y0=Math.round(Math.floor(i/4)*meta.height/rows);
    const x1=Math.round((i%4+1)*meta.width/4),y1=Math.round((Math.floor(i/4)+1)*meta.height/rows);
    const raw=await sharp(original).extract({left:x0,top:y0,width:x1-x0,height:y1-y0}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let pivot={x:raw.info.width/2,y:raw.info.height/2};
    if(key==='wake'){
      // Register the white propulsion nose, not the drifting outer wisps.
      let best=-1;
      for(let y=60;y<raw.info.height-60;y++)for(let x=Math.floor(raw.info.width*.72);x<raw.info.width-8;x++){
        const n=(y*raw.info.width+x)*4,a=raw.data[n+3]/255;
        const score=Math.min(raw.data[n],raw.data[n+1],raw.data[n+2])*a + x*.07;
        if(score>best){best=score;pivot={x,y};}
      }
    }
    const scale=key==='wake'?1.02:Math.min(426/raw.info.width,426/raw.info.height);
    const width=Math.round(raw.info.width*scale),height=Math.round(raw.info.height*scale);
    const anchor=key==='wake'?{x:420,y:256}:{x:256,y:256};
    const left=Math.round(anchor.x-pivot.x*scale),top=Math.round(anchor.y-pivot.y*scale);
    if(left<0||top<0||left+width>512||top+height>512)throw Error('Cell would clip: '+key+' '+i+' '+JSON.stringify({pivot,left,top,width,height}));
    const packed=await sharp(raw.data,{raw:raw.info}).resize(width,height,{fit:'fill'}).png().toBuffer();
    layers.push({input:packed,left:i%4*512+left,top:Math.floor(i/4)*512+top});
    frames.push({id:i,sourceRect:{x:x0,y:y0,width:x1-x0,height:y1-y0},sourcePivot:pivot,packedOffset:{x:left,y:top},uniformScale:scale,sha256:hash(packed)});
  }
  const file=key+'-atlas.png';
  const output=await sharp({create:{width:2048,height:rows*512,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer();
  await writeFile(path.join(here,'assets',file),output);
  manifest.atlases[key]={url:'/preview/z-body-dash-v2/assets/'+file,columns:4,rows,frameWidth:512,frameHeight:512,pivot:key==='wake'?{x:420,y:256}:{x:256,y:256},frames,sha256:hash(output),source:{file:'assets/'+master,sha256:hash(original),width:meta.width,height:meta.height}};
}
await writeFile(path.join(here,'assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packed 12 dash wake frames and 8 contact frames; generated masters preserved.');

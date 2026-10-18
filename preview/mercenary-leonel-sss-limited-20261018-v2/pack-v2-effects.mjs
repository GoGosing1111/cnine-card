import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');
const root=new URL('.',import.meta.url),source='assets/sources/fx-fracture-fixed-v2.png',target='assets/atlases/fx-fracture-v2.png';
const bytes=await fs.readFile(new URL(source,root));
const rowBounds=[0,355,669,887],cuts=[[0,433,885,1327,1774],[0,451,893,1331,1774],[0,441,888,1328,1774]],baselines=[304,627,862];
const width=480,height=440,baseline=365,parts=[],records=[];
for(let i=0;i<12;i++){
 const row=Math.floor(i/4),col=i%4,region={left:cuts[row][col],top:rowBounds[row],width:cuts[row][col+1]-cuts[row][col],height:rowBounds[row+1]-rowBounds[row]};
 const raw=await sharp(bytes).extract(region).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=raw.info.width,t=raw.info.height,r=-1,b=-1;
 for(let y=0;y<raw.info.height;y++)for(let x=0;x<raw.info.width;x++)if(raw.data[(y*raw.info.width+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 const trim={left:l,top:t,width:r-l+1,height:b-t+1};
 const input=await sharp(raw.data,{raw:raw.info}).extract(trim).png().toBuffer();
 const left=Math.floor((width-region.width)/2)+l,top=baseline-(baselines[row]-region.top)+t;
 if(top<0||top+trim.height>height||left<0||left+trim.width>width)throw Error('fracture '+i+' clips');
 parts.push({input,left:col*width+left,top:row*height+top});
 records.push({index:i,sourceRegion:region,trim,targetCell:{width,height},offset:{left,top},scale:1,baseline});
}
await sharp({create:{width:width*4,height:height*3,channels:4,background:'#00000000'}}).composite(parts).png().toFile(new URL(target,root).pathname.replace(/^\/([A-Z]:)/,'$1'));
await fs.writeFile(new URL('qa/fracture-packing.json',root),JSON.stringify({source,sourceSha256:createHash('sha256').update(bytes).digest('hex'),target,operation:'SOURCE_PIXEL_CROP_AND_TRANSLATION_ONLY_NO_REDRAW_NO_RESCALE',records},null,2)+'\n');
console.log('Fracture original pixels packed onto equal cells, all ground baselines aligned.');

import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),records=JSON.parse(await fs.readFile(dir+'generation.json','utf8'));await fs.mkdir(dir+'art',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});const audit=[];
for(const r of records){
 const b=await fs.readFile(r.source),m=await sharp(b).metadata();await fs.writeFile(dir+r.output,b);Object.assign(r,{sha256:createHash('sha256').update(b).digest('hex'),width:m.width,height:m.height,hasAlpha:m.hasAlpha});
 const frames=[];for(let i=0;i<8;i++){
  const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/2),w=Math.round((i%4+1)*m.width/4)-x,h=Math.round((Math.floor(i/4)+1)*m.height/2)-y;
  const {data,info}=await sharp(b).extract({left:x,top:y,width:w,height:h}).ensureAlpha().raw().toBuffer({resolveWithObject:true});let edges=0,solid=0,minX=w,minY=h,maxX=-1,maxY=-1;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const a=data[(yy*w+xx)*4+3];if(a>32){solid++;minX=Math.min(minX,xx);minY=Math.min(minY,yy);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,yy);if(xx===0||yy===0||xx===w-1||yy===h-1)edges++;}}
  frames.push({i,rect:[x,y,w,h],edges,solid,bounds:[minX,minY,maxX,maxY]});
 }
 audit.push({id:r.id,frames});console.log(r.id+' '+m.width+'x'+m.height+' alpha='+m.hasAlpha+' edges='+frames.map(f=>f.edges).join(','));
}
await fs.writeFile(dir+'generation.json',JSON.stringify(records,null,2));await fs.writeFile(dir+'qa/source-audit.json',JSON.stringify(audit,null,2));

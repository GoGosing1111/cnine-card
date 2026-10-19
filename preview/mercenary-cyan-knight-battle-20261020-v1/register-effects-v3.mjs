import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await read('manifest.json')),report=[];
for(const key of ['dragon-v3','cleave-v3','burst-v3','flight-v3']){
 const url='assets/sources/fx-'+key+'-padded.png',bytes=await read(url),meta=await sharp(bytes).metadata(),frames=[];
 for(let i=0;i<12;i++){
  const row=Math.floor(i/4),x=Math.round(i%4*meta.width/4)+2,y=Math.round(row*meta.height/3)+2;
  const rect={x,y,width:Math.round((i%4+1)*meta.width/4)-x-2,height:Math.round((row+1)*meta.height/3)-y-2};
  const {data,info}=await sharp(bytes).extract({left:x,top:y,width:rect.width,height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let pivot={x:.5,y:key==='cleave-v3'?[.61,.52,.43][row]:[.55,.52,.48][row]},nontransparent=0,opaque=0,ground=0,tipX=0,tipY=0,tipCount=0;
  for(let yy=0;yy<info.height;yy++){
   let count=0;
   for(let xx=0;xx<info.width;xx++){
    const k=(yy*info.width+xx)*4,a=data[k+3];if(a>5)nontransparent++;if(a>128){opaque++;count++;}
    if(key==='flight-v3'&&xx>info.width*.65&&a>160&&data[k]>180&&data[k+1]>225&&data[k+2]>225){
     if(xx>tipX+2){tipX=xx;tipY=yy;tipCount=1;}else if(xx>=tipX-2){tipY+=yy;tipCount++;tipX=Math.max(tipX,xx);}
    }
   }
   if(count>=12)ground=yy;
  }
  if(key==='dragon-v3')pivot={x:.5,y:ground/info.height};
  if(key==='flight-v3')pivot={x:tipX/info.width,y:tipY/Math.max(1,tipCount)/info.height};
  frames.push({index:i,rect,pivot,nontransparent,solidFraction:opaque/(info.width*info.height)});
 }
 m.effects[key]={url,displayScale:({'dragon-v3':1.34,'cleave-v3':1.20,'burst-v3':1.23,'flight-v3':1.32})[key],columns:4,rows:3,width:meta.width,height:meta.height,sha256:hash(bytes),frames,tool:'built-in image_gen',promptFile:'fx-v3-prompts.json'};
 report.push({key,frames:12,sha256:hash(bytes),pivots:frames.map(f=>f.pivot)});
}
m.appearance=JSON.parse(await read('white-aura-appearance.json'));m.version='CYAN_KNIGHT_VFX_REVIEW_20261020_V3';
m.summary.effectFrames=Object.values(m.effects).reduce((n,e)=>n+e.frames.length,0);m.summary.newV3EffectFrames=48;
m.appearanceApproval='appearance-approval-20261020.json';
m.rejectedVersions??=[];if(!m.rejectedVersions.some(x=>x.version==='ARRAY_V2'))m.rejectedVersions.push({version:'ARRAY_V2',reason:'2026-10-20 user approved appearance but rejected weak skill VFX, slow sword projectiles and aerial ground slam.'});
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(m,null,2)+'\n');
await fs.mkdir(new URL('qa/effects-v3/',root),{recursive:true});
await fs.writeFile(new URL('qa/effects-v3/registration.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({effectFrames:m.summary.effectFrames,newEffectFrames:48,appearanceApproved:m.appearance.visualApproval}));

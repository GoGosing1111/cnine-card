import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {inspect} from './inspect-assets.mjs';
const root=new URL('./',import.meta.url),prefix='preview/mercenary-black-moon-swordsman-ss-v1/';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){
 const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],hi=[];
 for(const v of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=0)lo.pop();lo.push(v);}
 for(const v of p.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=0)hi.pop();hi.push(v);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
async function info(file){
 const bytes=await fs.readFile(new URL(file,root)),m=await sharp(bytes).metadata();
 return {sha256:hash(bytes),width:m.width,height:m.height,hasAlpha:m.hasAlpha,bytes:bytes.length};
}
const definitions={
 descending:{foot:[[330,615],[952,617],[330,1175],[929,1176]],headY:[151,173,748,792],bodyPixels:450,contact:{frame:2,point:[565,1070],fraction:.25}},
 rising:{foot:[[309,591],[982,605],[330,1199],[981,1209]],headY:[205,188,728,749],bodyPixels:450,contact:{frame:2,point:[429,858],fraction:.72}},
 finisher:{foot:[[345,628],[978,628],[323,1185],[956,1194]],headY:[157,164,722,722],bodyPixels:465,contact:{frame:2,point:[650,915],fraction:.60}}
};
const motion={};
for(const [key,def]of Object.entries(definitions)){
 const file='assets/'+key+'-motion-v2.png',sourceInfo=await info(file),report=await inspect(key+'-motion-v2.png');
 const {data,info:raw}=await sharp(new URL(file,root).pathname.replace(/^\/([A-Za-z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=raw,n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n),components=[];
 // Read alpha-connected character contours; only metadata is produced, never edited pixels.
 for(let p=0;p<n;p++){
  if(seen[p]||data[p*4+3]<=24)continue;
  let head=0,tail=1,count=0,x0=w,y0=h,x1=0,y1=0;const rows=new Map();queue[0]=p;seen[p]=1;
  while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   const edge=rows.get(y);if(edge){edge[0]=Math.min(edge[0],x);edge[1]=Math.max(edge[1],x);}else rows.set(y,[x,x]);
   for(const q of [x>0?at-1:-1,x<w-1?at+1:-1,y>0?at-w:-1,y<h-1?at+w:-1])if(q>=0&&!seen[q]&&data[q*4+3]>24){seen[q]=1;queue[tail++]=q;}
  }
  if(count>30000){
   const edges=[...rows.entries()].flatMap(([y,[a,b]])=>[[a-2,y-2],[a-2,y+2],[b+2,y-2],[b+2,y+2]]);
   components.push({count,box:[x0,y0,x1+1,y1+1],hull:hull(edges)});
  }
 }
 if(components.length!==4)throw Error(key+': expected four separated characters');
 components.sort((a,b)=>Math.floor((a.box[1]+a.box[3])/2/(h/2))-Math.floor((b.box[1]+b.box[3])/2/(h/2))||a.box[0]-b.box[0]);
 const frames=components.map((c,i)=>{
  const [x0,y0,x1,y1]=c.box,rect={x:Math.max(0,x0-6),y:Math.max(0,y0-6),width:Math.min(w,x1+6)-Math.max(0,x0-6),height:Math.min(h,y1+6)-Math.max(0,y0-6)};
  return {index:i,rect,foot:{x:def.foot[i][0]-rect.x,y:def.foot[i][1]-rect.y},headY:def.headY[i]-rect.y,mask:c.hull.flatMap(([x,y])=>[x-rect.x,y-rect.y]),alphaPixels:c.count};
 });
 motion[key]={source:file,sourceInfo,bodyPixels:def.bodyPixels,frameCount:4,frames,contact:{frame:2,point:{x:def.contact.point[0]-frames[2].rect.x,y:def.contact.point[1]-frames[2].rect.y},targetHeightFraction:def.contact.fraction},inspection:{border:report.border,clear:report.clear}};
}
const fxFile='assets/triple-sever-fx-v2.png',fxInfo=await info(fxFile);
const effects={triple:{source:fxFile,sourceInfo:fxInfo,frameCount:16,columns:4,rows:4,frames:Array.from({length:16},(_,i)=>{const col=i%4,row=Math.floor(i/4),x=Math.floor(col*fxInfo.width/4),y=Math.floor(row*fxInfo.height/4),width=Math.floor((col+1)*fxInfo.width/4)-x,height=Math.floor((row+1)*fxInfo.height/4)-y;return {index:i,rect:{x,y,width,height},anchor:{x:.5,y:.5}};})}};
const manifest={
 format:'PROJECT_V_MERCENARY_PREVIEW_RESOURCES_V1',version:1,date:'2026-09-22',code:'V-998',codeStatus:'PREVIEW_LOCAL_IDENTIFIER_NOT_ASSIGNED',name:'흑월 검객',nameStatus:'WORKING_LABEL',rank:'SS',rankStatus:'USER_ASSIGNED_RANK',
 sourceArt:prefix+'assets/source-art-v1.png',sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtInfo:await info('assets/source-art-v1.png'),
 battleSprite:prefix+'assets/battle-sprite-v2.png',battleSpriteSha256:(await info('assets/battle-sprite-v2.png')).sha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REVIEW_PENDING',battleSpriteInfo:{...await info('assets/battle-sprite-v2.png'),...await inspect('battle-sprite-v2.png')},
 battleSpriteFootAnchor:{x:665/1254,y:1170/1254},bodyPixels:1052,motion,effects,
 skill:{id:'PREVIEW_BLACK_MOON_TRIPLE_SEVER',name:'흑월 삼연참',nameStatus:'WORKING_LABEL',status:'VISUAL_REVIEW_PENDING',mechanic:'전진 후 내려베기·올려베기·횡베기를 연속 재생하는 다검 검객의 3연격',balanceStatus:'NOT_ASSIGNED',runtimeEnabled:false},
 runtimeEnabled:false,skillsAssigned:false,generation:{tool:'built-in image_gen',rasterEditing:false,originalPixelsPreserved:true,sourcePrompt:'prompt-v1.txt',prompts:'prompts/'},
 runtime:{pixi:'8.20.0',gsap:'3.13.0',renderer:'preview/project-v-v3/source/battle/BattleEngine.js',implementation:'source/BlackMoonFX.js',clock:'V3_REGISTERED_GSAP',frameExtraction:'Pixi texture rectangles and runtime vector masks; original PNGs unchanged'},
 audio:{enabled:false,status:'NO_NEW_AUDIO',note:'연출 검수는 무음이며 임의 합성음 없음'},
 rejected:[{asset:'sd-v1',reason:'보통 체형으로 생성되어 SD 비율을 재제작'},{asset:'triple-fx-v1',reason:'외곽 프레임 여백 부족'},{asset:'combo-motion-v1',reason:'12칸 시트의 이웃 동작과 검끝이 겹쳐 4프레임씩 재제작'}]
};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceArt:manifest.sourceArtInfo,sd:manifest.battleSpriteInfo,motion:Object.fromEntries(Object.entries(motion).map(([k,v])=>[k,{frames:v.frameCount,rects:v.frames.map(f=>f.rect)}])),effects:16},null,2));

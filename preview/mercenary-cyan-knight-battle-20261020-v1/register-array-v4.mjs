import fs from 'node:fs/promises';import sharp from 'sharp';import{createHash}from'node:crypto';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex'),m=JSON.parse(await read('manifest.json'));
const bladeUrl='assets/sources/summoned-blades-v4.png',blade=await read(bladeUrl),meta=await sharp(blade).metadata();
const centers=[148,463,769,1080,1390],lengths=[1.35,1.42,1.37,1.39,1.46];
m.summonedWeapons={url:bladeUrl,sha256:hash(blade),columns:5,rows:1,width:meta.width,height:meta.height,source:'built-in image_gen',permission:'array-v4-scope.json',frames:Array.from({length:5},(_,i)=>{
 const x=Math.round(i*meta.width/5),width=Math.round((i+1)*meta.width/5)-x,cx=centers[i]-x;return{index:i,rect:{x,y:0,width,height:meta.height},grip:{x:cx,y:818},tip:{x:cx,y:17},weaponLength:944,lengthInBodies:lengths[i]};
})};
for(const w of m.summonedWeapons.frames){
 const {data,info}=await sharp(blade).extract({left:w.rect.x,top:w.rect.y,width:w.rect.width,height:w.rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const b={x:info.width,y:info.height,right:0,bottom:0};
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>48){b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.right=Math.max(b.right,x);b.bottom=Math.max(b.bottom,y);}
 w.silhouetteBounds=b;
}
for(const key of ['rail-v4','snap-v4']){
 const url='assets/sources/'+key+'.png',bytes=await read(url),meta=await sharp(bytes).metadata();
 const frames=Array.from({length:12},(_,i)=>{
  const row=Math.floor(i/4),x=Math.round(i%4*meta.width/4)+2,y=Math.round(row*meta.height/3)+2;
  const rect=key==='rail-v4'?{x,y:[216,522,832][row]-80,width:380,height:160}:{x,y,width:380,height:Math.round((row+1)*meta.height/3)-y-2};
  return{index:i,rect,pivot:{x:.5,y:key==='rail-v4'?.5:[.53,.51,.49][row]}};
 });
 m.effects[key]={url,columns:4,rows:3,width:meta.width,height:meta.height,sha256:hash(bytes),frames,promptFile:'array-v4-prompts.json'};
}
m.version='CYAN_KNIGHT_ARRAY_REVIEW_20261020_V4_MIXED_ROUTES';m.summonedWeapons.routeModule='array-motion-v4.mjs';m.summonedWeapons.routeRevision='independent-offbeat-curved-diagonal-sharp-mix';m.summary.effectFrames=Object.values(m.effects).reduce((n,s)=>n+s.frames.length,0);m.summary.summonedWeaponDesigns=5;m.summary.weaponSources=6;m.summary.heldWeaponSources=1;m.summary.newV4EffectFrames=24;
m.rejectedVersions??=[];if(!m.rejectedVersions.some(v=>v.version==='ARRAY_V3'))m.rejectedVersions.push({version:'ARRAY_V3',reason:'User rejected repeated central crossing, weak copied blades and requested separate summoned swords with orthogonal, dropping and irregular paths.'});
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify({summonedWeapons:5,newEffects:24,totalEffects:m.summary.effectFrames}));

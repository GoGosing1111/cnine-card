import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex'),m=JSON.parse(await fs.readFile(file('manifest.json')));
const tankOrder=[11,10,2,3,7,6,9,8,3,9,10,11];
const tankGround={2:.975,3:.975,6:.923,7:.923,8:.803,9:.803,10:.90,11:.835};
const tankMuzzle={2:[.83,.55],3:[.82,.545],6:[.74,.565],7:[.565,.59],8:[.78,.345],9:[.605,.45],10:[.7,.5],11:[.7,.5]};
const items={
 'ar-ballistics':{source:'ar-ballistics-v3.png',anchors:[[.5,.60],[.205,.60],[.18,.60],[.5,.60],[.746,.49],[.79,.49],[.795,.49],[.826,.49],[.52,.46],[.5,.46],[.5,.46],[.5,.46]]},
 'artillery-v3':{source:'central-artillery-v3-padded.png',order:tankOrder},
 'wide-barrage':{source:'wide-barrage-v3-padded.png',anchors:Array.from({length:12},(_,i)=>[.5,i<4?.91:i<8?.95:.89])}
};
const report={sources:{},excludedTankSourceFrames:[0,1,4,5],reason:'Opaque effects crossed source grid boundaries; retain the sources but do not load the clipped frames.',selectedTankDistinctFrames:8};
for(const [key,spec]of Object.entries(items)){
 const input=await fs.readFile(file('assets/sources/'+spec.source)),meta=await sharp(input).metadata(),cw=meta.width/4,ch=meta.height/3,cell=Math.ceil(Math.max(cw,ch))+48,pad=24,frames=[],buffers=[],rawCells=[];
 for(let n=0;n<12;n++){const i=spec.order?.[n]??n,left=Math.round(i%4*cw),top=Math.round(Math.floor(i/4)*ch),right=Math.round((i%4+1)*cw),bottom=Math.round((Math.floor(i/4)+1)*ch),w=right-left,h=bottom-top,rect={left,top,width:w,height:h},part=await sharp(input).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});let borderMax=0,opaqueEdge=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1){const a=part.data[(y*w+x)*4+3];borderMax=Math.max(borderMax,a);opaqueEdge+=a>64?1:0;}if(opaqueEdge)throw Error(key+' source frame '+i+' is clipped: '+opaqueEdge);
  const anchor=spec.anchors?.[n]||[.45,tankGround[i]],muzzle=tankMuzzle[i];
  if(key==='artillery-v3'&&![10,11].includes(i)){let min=w,max=0;const lo=Math.floor((tankGround[i]-.14)*h),hi=Math.min(h-1,Math.ceil(tankGround[i]*h));for(let y=lo;y<=hi;y++)for(let x=0;x<w;x++){const a=(y*w+x)*4;if(part.data[a+3]>230&&(part.data[a]+part.data[a+1]+part.data[a+2])/3<115){min=Math.min(min,x);max=Math.max(max,x);}}if(max>min)anchor[0]=(min+max)/2/w;}
  const pixels=await sharp(part.data,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),buf=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:pixels,left:pad,top:pad}]).png().toBuffer(),path=`assets/frames/${key}-v3-${n}.png`;await fs.writeFile(file(path),buf);buffers.push(buf);
  const toP=([x,y])=>({x:(pad+x*w)/cell,y:(pad+y*h)/cell});frames.push({index:n,sourceIndex:i,file:path,sha256:hash(buf),sourceRect:rect,anchor:toP(anchor),muzzle:key==='artillery-v3'?toP(muzzle):undefined,barrelAngleRadians:key==='artillery-v3'?-19*Math.PI/180:undefined,borderMax});rawCells.push({sourceIndex:i,borderMax,opaqueEdge,anchor});
 }
 const atlas=`assets/atlases/${key}-v3.png`,bytes=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%4*cell,top:Math.floor(i/4)*cell}))).png().toBuffer();await fs.writeFile(file(atlas),bytes);m.effects[key]={atlas,sha256:hash(bytes),columns:4,rows:3,cellSize:cell,frameCount:12,source:'assets/sources/'+spec.source,sourceSha256:hash(input),distinctSourceFrames:new Set(frames.map(f=>f.sourceIndex)).size,frames};report.sources[key]=rawCells;
}
for(const key of ['ballistic-shot','artillery','artillery-impact'])m.effects[key].previewEnabled=false;
m.counts={motion:4,retainedMotion:5,effects:56,retainedEffects:36};m.centralArtillery={alignment:'BATTLEFIELD_CENTER',salvos:5,wideFormationBlast:true};m.qa.arV3='qa/ar-v3/runtime-report.json';
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');await fs.writeFile(file('qa/ar-v3/fx-source-validation.json'),JSON.stringify(report,null,2)+'\n');console.log('V3 ballistics + 8 clean artillery poses + 12 wide blasts packed');

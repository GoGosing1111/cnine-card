import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import sharp from 'sharp';
const dir=fileURLToPath(new URL('.',import.meta.url)),file=p=>path.join(dir,p),sha=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await fs.readFile(file('../baseline-v4.png')),repairBytes=await fs.readFile(file('sources/weapon-handle-restoration-v1.png'));
const {data:source,info}=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),repair=await sharp(repairBytes).ensureAlpha().raw().toBuffer();
const W=info.width,H=info.height,out=Buffer.alloc(source.length),selected=new Uint8Array(W*H),generated=new Uint8Array(W*H);
const hand=[[230,617],[281,615],[292,636],[311,650],[326,661],[330,678],[324,695],[319,706],[310,718],[303,724],[289,725],[280,717],[269,716],[260,706],[246,709],[234,701],[222,689],[216,671],[218,648],[226,632]];
const pommel=[[177,597],[188,596],[193,608],[194,615],[202,620],[218,628],[239,640],[235,663],[216,653],[198,644],[187,640],[178,642],[164,640],[160,630],[158,615],[163,606]];
const guard=[[307,678],[327,683],[350,681],[362,675],[372,663],[380,646],[395,647],[398,654],[403,658],[400,662],[390,661],[382,672],[376,688],[375,699],[387,711],[403,723],[424,737],[450,752],[444,755],[421,746],[396,739],[378,735],[366,737],[358,740],[350,742],[345,751],[339,749],[330,757],[324,769],[321,778],[319,781],[300,778],[294,766],[296,763],[304,758],[312,746],[319,731],[323,715],[319,708],[311,706],[307,700]];
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const bands=[];
for(let x=387;x<=1011;x++){
 const center=736+(x-400)*.606,ys=[];
 for(let y=Math.max(0,Math.floor(center-37));y<Math.min(H,center+36);y++){
  const i=(y*W+x)*4,r=source[i],g=source[i+1],b=source[i+2];
  if(source[i+3]>128&&(r+g+b)/3>145&&Math.max(r,g,b)-Math.min(r,g,b)<35)ys.push(y);
 }
 if(!ys.length)continue;
 const top=ys[0]-1,bottom=ys.at(-1)+1;bands.push({x,top,bottom});
 for(let y=top;y<=bottom;y++)selected[y*W+x]=1;
}
const bladeRoot=[[370,696],[388,707],[388,753],[360,738],[352,733],[359,717]];
const grayInset=[[327,693],[367,710],[349,723]];
for(let y=590;y<790;y++)for(let x=150;x<455;x++){
 const i=(y*W+x)*4,g=source[i+1],b=source[i+2];
 const goldContour=inside(x+.5,y+.5,guard)&&(g>b*1.08||inside(x+.5,y+.5,grayInset));
 if(inside(x+.5,y+.5,pommel)||goldContour||inside(x+.5,y+.5,bladeRoot))selected[y*W+x]=1;
}
let originalPixels=0,repairPixels=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const p=y*W+x,i=p*4,occluded=inside(x+.5,y+.5,hand);
 if(selected[p]&&!occluded&&source[i+3]){source.copy(out,i,i,i+4);originalPixels++;}
 else if(occluded&&repair[i+3]){repair.copy(out,i,i,i+4);generated[p]=1;repairPixels++;selected[p]=0;}
 else selected[p]=0;
}
let mismatch=0;for(let p=0;p<selected.length;p++)if(selected[p])for(let k=0;k<4;k++)if(out[p*4+k]!==source[p*4+k])mismatch++;
if(mismatch)throw Error('Original pixels changed');
const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer();await fs.writeFile(file('images/weapon-restored-v2.png'),png);
for(const [name,color]of [['light','#d9dce0'],['dark','#172332']])await sharp(png).extract({left:144,top:584,width:880,height:560}).flatten({background:color}).png().toFile(file('qa/weapon-v2-'+name+'.png'));
await fs.writeFile(file('sources/weapon-selection.json'),JSON.stringify({source:'../baseline-v4.png',sourceSha256:sha(sourceBytes),repairSource:'weapon-handle-restoration-v1.png',repairSourceSha256:sha(repairBytes),output:'images/weapon-restored-v2.png',sha256:sha(png),width:W,height:H,handOcclusion:hand,pommelOutline:pommel,guardOutline:guard,bladeBands:bands,originalPixels,repairPixels,selectedOriginalRgbaMismatches:mismatch,repairScope:'Only original hand-occluded silhouette; generated visible blade is not used',visualReview:'pending'},null,2));
console.log(JSON.stringify({originalPixels,repairPixels,mismatch,sha256:sha(png)}));

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const dir=fileURLToPath(new URL('.',import.meta.url));
const file=p=>path.join(dir,p),sha=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.includes('--idle')){const review=JSON.parse(await fs.readFile(file('qa/static-review.json'),'utf8'));if(!review.staticAssemblyPass||review.sourceSha256!=='fd8eea2da078ba3f7cfcef7da44946612e950ce2b0d0cd778a4b57976e00aa44')throw Error('Static review required before idle');}
for(const p of ['images','sources','qa','runtime'])await fs.mkdir(file(p),{recursive:true});
const bytes=await fs.readFile(file('../baseline-v4.png'));
if(sha(bytes)!=='fd8eea2da078ba3f7cfcef7da44946612e950ce2b0d0cd778a4b57976e00aa44')throw Error('Baseline changed');
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,origin=[512,1450],rad=Math.PI/180;
const toWorld=([x,y])=>[x-origin[0],origin[1]-y];
const mix=(a,b,t)=>a+(b-a)*t,clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const bones=[],bind={};
function bone(name,parent,position,angle=0,length=0){
 const p=toWorld(position),b=parent?bind[parent]:{x:0,y:0,a:0};
 const c=Math.cos(b.a),s=Math.sin(b.a),dx=p[0]-b.x,dy=p[1]-b.y;
 bones.push({name,...parent?{parent}:{},x:dx*c+dy*s,y:-dx*s+dy*c,rotation:angle-b.a/rad,...length?{length}:{}});
 bind[name]={x:p[0],y:p[1],a:angle*rad,index:bones.length-1};
}
bone('root',null,origin);
bone('pelvis','root',[520,650]);
bone('chest','pelvis',[500,430]);
bone('head','chest',[563,288]);
bone('coat_back','pelvis',[397,687]);
bone('coat_back_tip','coat_back',[180,916]);
bone('coat_front','pelvis',[526,739]);
bone('coat_front_tip','coat_front',[483,966]);
bone('weapon_grip','root',[279,674]);
bone('wrist_near','root',[258,615]);
bone('wrist_far','root',[800,642]);
bone('hand_far','wrist_far',[800,642]);
bone('foot_back','root',[132,1346]);
bone('foot_front','root',[799,1330]);
const constraints=[];
function limb(prefix,parent,A,B,C,target){
 const a=toWorld(A),b=toWorld(B),c=toWorld(C);
 const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);
 const angle1=Math.atan2(b[1]-a[1],b[0]-a[0])/rad,angle2=Math.atan2(c[1]-b[1],c[0]-b[0])/rad;
 bone(prefix+'_upper',parent,A,angle1,l1);bone(prefix+'_lower',prefix+'_upper',B,angle2,l2);
 constraints.push({type:'ik',name:prefix+'_ik',target,bones:[prefix+'_upper',prefix+'_lower'],bendPositive:((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>0});
}
limb('arm_near','chest',[352,320],[226,480],[258,615],'wrist_near');
limb('arm_far','chest',[629,386],[701,560],[800,642],'wrist_far');
limb('leg_back','pelvis',[477,718],[272,1081],[132,1346],'foot_back');
limb('leg_front','pelvis',[568,704],[755,1004],[799,1330],'foot_front');
bone('blade_tip','weapon_grip',[1011,1113]);
bone('sole_back','foot_back',[143,1440]);
bone('sole_front','foot_front',[846,1422]);

const polys={
 weapon:[[151,602],[182,596],[236,626],[289,663],[317,679],[343,673],[388,644],[412,647],[395,676],[378,697],[1020,1118],[998,1113],[371,761],[334,749],[324,774],[299,779],[291,754],[307,731],[294,709],[250,689],[210,657],[164,642]],
 hand_near:[[234,603],[284,606],[299,633],[327,663],[327,706],[303,727],[277,720],[248,711],[222,685],[218,649]],
 head:[[431,65],[710,65],[711,232],[645,281],[603,304],[595,338],[553,350],[512,318],[490,265],[431,251]],
 coat_back:[[386,590],[455,602],[435,681],[389,755],[313,836],[239,938],[141,1083],[99,1112],[57,1068],[42,988],[18,945],[11,854],[102,796],[199,727],[299,662]],
 coat_front:[[536,697],[575,722],[575,813],[554,919],[523,1023],[477,1077],[436,1104],[459,1004],[479,904],[484,827]],
 arm_near:[[293,353],[345,391],[308,440],[283,480],[287,531],[286,593],[294,625],[274,655],[230,645],[204,615],[194,554],[174,495],[168,456],[187,405],[235,383]],
 arm_far:[[643,440],[689,451],[711,495],[740,560],[779,594],[825,625],[869,667],[885,717],[866,762],[827,756],[807,726],[789,687],[757,654],[704,615],[661,583],[641,533]],
 leg_back:[[466,701],[532,739],[513,809],[455,883],[407,943],[354,1027],[316,1120],[274,1208],[232,1302],[218,1381],[213,1454],[41,1468],[30,1408],[62,1324],[92,1258],[123,1194],[146,1101],[216,1009],[290,930],[350,851],[395,772]],
 leg_front:[[544,698],[625,683],[669,729],[731,802],[790,886],[823,947],[823,1013],[820,1074],[822,1168],[837,1241],[850,1321],[945,1366],[991,1396],[986,1444],[701,1440],[678,1379],[681,1318],[659,1232],[659,1148],[659,1078],[641,1013],[608,944],[556,866],[513,805]],
};
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function distanceSegment(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);}
function distancePolygon(x,y,p){return inside(x,y,p)?0:Math.min(...p.map((a,i)=>distanceSegment(x,y,a,p[(i+1)%p.length])));}
function owner(x,y){
 for(const n of ['hand_near','weapon','head','coat_back','coat_front','arm_near','arm_far','leg_back','leg_front'])if(inside(x,y,polys[n])){
  if(n==='arm_near')return y<480?'upper_arm_near':y<615?'forearm_near':'hand_near';
  if(n==='arm_far')return y<556?'upper_arm_far':y<649?'forearm_far':'hand_far';
  if(n==='leg_back')return y>1315?'foot_back':y>1090?'calf_back':'thigh_back';
  if(n==='leg_front')return y>1305?'foot_front':y>1090?'calf_front':'thigh_front';
  return n;
 }
 return 'torso';
}
function weights(x,y){
 const swordDistance=Math.min(distancePolygon(x,y,polys.weapon),distancePolygon(x,y,polys.hand_near));
 if(swordDistance<25)return [['weapon_grip',1]];
 const n=owner(x,y);let result;
 const blend=(a,b,t)=>[[a,1-clamp(t)],[b,clamp(t)]];
 if(n==='head')result=blend('chest','head',smooth((333-y)/55));
 else if(n==='coat_back')result=blend('pelvis','coat_back_tip',smooth((y-662)/365)*smooth((442-x)/170));
 else if(n==='coat_front')result=blend('pelvis','coat_front_tip',smooth((y-768)/270));
 else if(n.includes('arm_near'))result=y<452?blend('chest','arm_near_upper',smooth((y-365)/55)):y<530?blend('arm_near_upper','arm_near_lower',smooth((y-445)/70)):blend('arm_near_lower','weapon_grip',smooth((y-567)/72));
 else if(n.includes('arm_far')||n==='hand_far')result=y<515?blend('chest','arm_far_upper',smooth((y-445)/52)):y<595?blend('arm_far_upper','arm_far_lower',smooth((y-519)/70)):blend('arm_far_lower','hand_far',smooth((y-611)/55));
 else if(n==='foot_back'||n==='foot_front')result=[[n,1]];
 else if(n.endsWith('_back')&&(n.startsWith('thigh')||n.startsWith('calf')))result=y<830?blend('pelvis','leg_back_upper',smooth((y-723)/94)):y<1150?blend('leg_back_upper','leg_back_lower',smooth((y-1020)/115)):blend('leg_back_lower','foot_back',smooth((y-1230)/100));
 else if(n.endsWith('_front')&&(n.startsWith('thigh')||n.startsWith('calf')))result=y<822?blend('pelvis','leg_front_upper',smooth((y-713)/100)):y<1110?blend('leg_front_upper','leg_front_lower',smooth((y-955)/130)):blend('leg_front_lower','foot_front',smooth((y-1210)/110));
 else result=blend('pelvis','chest',smooth((656-y)/210));
 if(swordDistance<58){const hold=1-smooth((swordDistance-25)/33);result=result.map(([b,w])=>[b,w*(1-hold)]);result.push(['weapon_grip',hold]);}
 return result.filter(([,w])=>w>1e-8);
}

function partWeights(name,x,y){
 const pair=(a,b,t)=>[[a,1-clamp(t)],[b,clamp(t)]];
 if(name==='weapon'||name==='hand_near')return [['weapon_grip',1]];
 if(name==='head')return pair('chest','head',smooth((333-y)/55));
 if(name==='torso')return pair('pelvis','chest',smooth((656-y)/210));
 if(name==='coat_back')return pair('pelvis','coat_back_tip',smooth((y-662)/365)*smooth((442-x)/170));
 if(name==='coat_front')return pair('pelvis','coat_front_tip',smooth((y-768)/270));
 if(name==='upper_arm_near')return pair('chest','arm_near_upper',smooth((y-365)/55));
 if(name==='forearm_near')return pair('arm_near_lower','weapon_grip',smooth((y-567)/72));
 if(name==='upper_arm_far')return pair('chest','arm_far_upper',smooth((y-445)/52));
 if(name==='forearm_far')return pair('arm_far_lower','hand_far',smooth((y-611)/55));
 if(name==='hand_far')return [['hand_far',1]];
 if(name==='thigh_back')return pair('pelvis','leg_back_upper',smooth((y-723)/94));
 if(name==='thigh_front')return pair('pelvis','leg_front_upper',smooth((y-713)/100));
 if(name==='calf_back')return pair('leg_back_lower','foot_back',smooth((y-1230)/100));
 if(name==='calf_front')return pair('leg_front_lower','foot_front',smooth((y-1210)/110));
 return [[name,1]];
}

// Shared original-image vertices make adjacent part meshes meet exactly.
// PNGs contain original bounding-box pixels; the editable mesh defines the part boundary.
const step=16,groups=new Map(),vertices=new Map();
function point(x,y){const key=x+','+y;if(!vertices.has(key))vertices.set(key,{x,y,key,weights:weights(x,y)});return vertices.get(key);}
for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step){
 const r=Math.min(W,x+step),b=Math.min(H,y+step);let visible=false;
 for(let yy=y;yy<b&&!visible;yy++)for(let xx=x;xx<r;xx++)if(data[(yy*W+xx)*4+3]>0){visible=true;break;}
 if(!visible)continue;
 for(const xy of [[[x,y],[r,y],[r,b]],[[x,y],[r,b],[x,b]]]){
  const name=owner(xy.reduce((a,p)=>a+p[0],0)/3,xy.reduce((a,p)=>a+p[1],0)/3);
  if(!groups.has(name))groups.set(name,[]);groups.get(name).push(xy.map(([xx,yy])=>point(xx,yy)));
 }
}
const slots=[],attachments={},parts=[];
const order=['coat_back','coat_front','thigh_back','calf_back','foot_back','thigh_front','calf_front','foot_front','torso','head','upper_arm_far','forearm_far','hand_far','upper_arm_near','forearm_near','weapon','hand_near'];
const pixelOwner=new Uint8Array(W*H);
for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){
 const x=Math.floor(xx/step)*step,y=Math.floor(yy/step)*step,r=Math.min(W,x+step),b=Math.min(H,y+step);
 const lower=(yy-y)/(b-y)>(xx-x)/(r-x);
 const name=owner(lower?(2*x+r)/3:(x+2*r)/3,lower?(y+2*b)/3:(2*y+b)/3);
 pixelOwner[yy*W+xx]=order.indexOf(name);
}
for(const name of order){
 const faces=groups.get(name);if(!faces)continue;
 const selected=[...new Map(faces.flat().map(v=>[v.key,v])).values()];
 const g=32,x=Math.max(0,Math.floor(Math.min(...selected.map(v=>v.x))/g)*g-g),y=Math.max(0,Math.floor(Math.min(...selected.map(v=>v.y))/g)*g-g),right=Math.min(W,Math.ceil(Math.max(...selected.map(v=>v.x))/g)*g+g),bottom=Math.min(H,Math.ceil(Math.max(...selected.map(v=>v.y))/g)*g+g);
 const w=right-x,h=bottom-y,used=[point(x,y),point(right,y),point(right,bottom),point(x,bottom)],hull=4;
 for(let yy=y+g;yy<bottom;yy+=g)for(let xx=x+g;xx<right;xx+=g)used.push(point(xx,yy));
 const ids=new Map(used.map((v,i)=>[v.key,i])),triangles=[],edges=[];
 const top=[],rightSide=[],bottomSide=[],left=[];
 for(let xx=x+g;xx<=right-g;xx+=g)top.push(ids.get(xx+','+(y+g)));
 for(let yy=y+g;yy<=bottom-g;yy+=g)rightSide.push(ids.get((right-g)+','+yy));
 for(let xx=right-g;xx>=x+g;xx-=g)bottomSide.push(ids.get(xx+','+(bottom-g)));
 for(let yy=bottom-g;yy>=y+g;yy-=g)left.push(ids.get((x+g)+','+yy));
 // Four border fans avoid skinny near-collinear triangles and preserve every inner grid point.
 for(const [a,b,ring]of [[0,1,top],[1,2,rightSide],[2,3,bottomSide],[3,0,left]]){triangles.push(a,b,ring.at(-1));for(let i=0;i<ring.length-1;i++)triangles.push(a,ring[i+1],ring[i]);}
 for(let yy=y+g;yy<bottom-g;yy+=g)for(let xx=x+g;xx<right-g;xx+=g){const a=ids.get(xx+','+yy),b=ids.get((xx+g)+','+yy),c=ids.get((xx+g)+','+(yy+g)),d=ids.get(xx+','+(yy+g));triangles.push(a,b,c,a,c,d);}
 const edgeSet=new Set();for(let t=0;t<triangles.length;t+=3)for(let k=0;k<3;k++){const a=triangles[t+k],b=triangles[t+(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);if(!edgeSet.has(key)){edgeSet.add(key);edges.push(a*2,b*2);}}
 const uvs=[],weighted=[];
 for(const v of used){
  const influences=partWeights(name,v.x,v.y);
  uvs.push((v.x-x)/w,(v.y-y)/h);weighted.push(influences.length);
  const p=toWorld([v.x,v.y]);
  for(const [b,weight] of influences){const m=bind[b],dx=p[0]-m.x,dy=p[1]-m.y,c=Math.cos(m.a),s=Math.sin(m.a);weighted.push(m.index,dx*c+dy*s,-dx*s+dy*c,weight);}
 }
 const pixels=Buffer.alloc(w*h*4),partIndex=order.indexOf(name);let selectedPixels=0,overlapPixels=0;
 for(let yy=y;yy<bottom;yy++)for(let xx=x;xx<right;xx++){
  const src=(yy*W+xx)*4,dst=((yy-y)*w+xx-x)*4;
  data.copy(pixels,dst,src,src+4);
  let keep=pixelOwner[yy*W+xx]===partIndex,overlap=false;
  if(!keep&&data[src+3]>0)for(const [dx,dy]of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1],[-1,1],[1,-1]]){const nx=xx+dx,ny=yy+dy;if(nx>=0&&nx<W&&ny>=0&&ny<H&&pixelOwner[ny*W+nx]===partIndex){keep=true;overlap=true;break;}}
  if(!keep)pixels[dst+3]=0;else if(data[src+3]>0){selectedPixels++;if(overlap)overlapPixels++;}
 }
 const png=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 await fs.writeFile(file('images/'+name+'.png'),png);
 slots.push({name,bone:'root',attachment:name});
 attachments[name]={[name]:{type:'mesh',path:name,uvs,triangles,vertices:weighted,hull,edges,width:w,height:h}};
 parts.push({name,sourceRect:{x,y,width:w,height:h},vertices:used.length,triangles:triangles.length/3,sha256:sha(png),selectedPixels,overlapPixels,selectedOriginalRgbaPreserved:true,unselectedAlphaCleared:true,jointOverlapPixels:2,meshDefinesCutout:false});
}
const idleEnabled=process.argv.includes('--idle');
const animations={setup:{bones:{root:{translate:[{time:0},{time:.1}]}}}};
if(idleEnabled){
 const duration=4.2,tracks={};
 const add=(bone,type,time,values)=>{tracks[bone]??={};tracks[bone][type]??=[];tracks[bone][type].push({time,...values});};
 for(let i=0;i<=50;i++){
  const time=duration*i/50,phase=time<1.45?Math.PI*time/1.45:Math.PI+Math.PI*(time-1.45)/(duration-1.45),breath=(1-Math.cos(phase))/2;
  const cloth=Math.sin(time/duration*Math.PI*2)*(1-Math.cos(time/duration*Math.PI*2))*.5;
  // Hold the nearly straight supporting legs at their bind pose for this breathing idle.
  add('chest','translate',time,{x:.6*breath,y:4.1*breath});
  add('chest','rotate',time,{value:-.24*breath});
  add('head','rotate',time,{value:.34*breath});
  add('wrist_far','translate',time,{x:.7*breath,y:1.0*breath});
  add('coat_back_tip','rotate',time,{value:.65*cloth});
  add('coat_back_tip','translate',time,{x:1.8*cloth,y:.7*breath});
  add('coat_front_tip','rotate',time,{value:-.4*cloth});
 }
 animations.idle={bones:tracks};
}
const ordered=[];function walk(parent){for(const b of bones)if((b.parent||null)===parent){ordered.push(b);walk(b.name);}}walk(null);
const remap=new Map(bones.map((b,i)=>[i,ordered.findIndex(x=>x.name===b.name)]));
for(const byName of Object.values(attachments))for(const a of Object.values(byName)){for(let i=0;i<a.vertices.length;){const n=a.vertices[i++];for(let k=0;k<n;k++){a.vertices[i]=remap.get(a.vertices[i]);i+=4;}}}
for(const [name,b]of Object.entries(bind))b.index=ordered.findIndex(x=>x.name===name);
const skeleton={skeleton:{spine:'4.3.26',images:'./images/',fps:30},bones:ordered,slots,constraints,skins:[{name:'default',attachments}],animations};
await fs.writeFile(file('swordsman.input.json'),JSON.stringify(skeleton));
await fs.writeFile(file('sources/rig-map.json'),JSON.stringify({source:'../baseline-v4.png',sha256:sha(bytes),origin,sourceSize:[W,H],parts,bones:bind,selectionPolygons:polys,sharedBindCoordinates:true,weightsScopedByPart:true,selectionGridSpacing:step,meshGridSpacing:32,hiddenRegionsPainted:false,scope:'Static assembly and restrained idle only; new attack poses need occlusion artwork',nearGripSource:[279,674],bladeTipSource:[1011,1113],soleSource:{back:[143,1440],front:[846,1422]},idle:idleEnabled?{duration:4.2,inhale:1.45,exhale:2.75,weaponHeldStill:true,feetHeldStill:true}:null,userProceedQuote:'어 해봐',finalVisualApproval:false},null,2));
console.log(JSON.stringify({sourceHash:sha(bytes),parts:parts.length,bones:bones.length,ik:constraints.length,meshVertices:parts.reduce((a,p)=>a+p.vertices,0),triangles:parts.reduce((a,p)=>a+p.triangles,0),animations:Object.keys(animations)}));

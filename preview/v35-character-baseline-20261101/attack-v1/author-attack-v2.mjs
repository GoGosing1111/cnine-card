import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import sharp from 'sharp';
const dir=fileURLToPath(new URL('.',import.meta.url)),file=p=>path.join(dir,p),sha=b=>createHash('sha256').update(b).digest('hex');
const original=await fs.readFile(file('../baseline-v4.png'));if(sha(original)!=='fd8eea2da078ba3f7cfcef7da44946612e950ce2b0d0cd778a4b57976e00aa44')throw Error('Source changed');
const prior=await fs.readFile(file('../rig-v1/swordsman-0c78c140e3fb.spine'));if(sha(prior)!=='2e7ac5fefe564f7b3a3dee982ea43e8b81e040bb4739774a83410361fd547477')throw Error('Preserve newer native edits');
const {data:src,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true}),W=info.width,H=info.height;
const paint=await sharp(file('sources/body-underpaint-v2.png')).ensureAlpha().raw().toBuffer(),weaponBytes=await fs.readFile(file('images/weapon-restored-v2.png')),weapon=await sharp(weaponBytes).ensureAlpha().raw().toBuffer();
const selection=JSON.parse(await fs.readFile(file('sources/weapon-selection.json'),'utf8'));
const rad=Math.PI/180,origin=[512,1450],world=([x,y])=>[x-512,1450-y],clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const bones=[],bind={},constraints=[];
function bone(name,parent,pos,angle=0,length=0){const p=world(pos),b=parent?bind[parent]:{x:0,y:0,a:0},dx=p[0]-b.x,dy=p[1]-b.y,c=Math.cos(b.a),s=Math.sin(b.a);bones.push({name,...parent?{parent}:{},x:dx*c+dy*s,y:-dx*s+dy*c,rotation:angle-b.a/rad,...length?{length}:{}});bind[name]={x:p[0],y:p[1],a:angle*rad};}
bone('root',null,origin);bone('pelvis','root',[520,650]);bone('chest','pelvis',[500,430]);bone('head','chest',[563,288]);
bone('coat_back','pelvis',[397,687]);bone('coat_back_tip','coat_back',[180,916]);bone('coat_front','pelvis',[526,739]);bone('coat_front_tip','coat_front',[483,966]);
bone('shoulder_near','chest',[355,328]);bone('pauldron_near','shoulder_near',[355,328]);bone('wrist_far','root',[800,642]);bone('hand_far','wrist_far',[800,642]);bone('foot_back','root',[132,1346]);bone('foot_front','root',[799,1330]);
function limb(prefix,parent,A,B,C,target){const a=world(A),b=world(B),c=world(C);bone(prefix+'_upper',parent,A,Math.atan2(b[1]-a[1],b[0]-a[0])/rad,Math.hypot(b[0]-a[0],b[1]-a[1]));bone(prefix+'_lower',prefix+'_upper',B,Math.atan2(c[1]-b[1],c[0]-b[0])/rad,Math.hypot(c[0]-b[0],c[1]-b[1]));if(prefix!=='arm_near')constraints.push({type:'ik',name:prefix+'_ik',target,bones:[prefix+'_upper',prefix+'_lower'],bendPositive:((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>0});}
limb('arm_near','shoulder_near',[355,328],[236,502],[262,620],'wrist_near');limb('arm_far','chest',[629,386],[701,560],[800,642],'wrist_far');limb('leg_back','pelvis',[477,718],[272,1081],[132,1346],'foot_back');limb('leg_front','pelvis',[568,704],[755,1004],[799,1330],'foot_front');bone('wrist_near','arm_near_lower',[262,620]);bone('weapon_grip','wrist_near',[279,674]);bone('blade_tip','weapon_grip',[1011,1113]);bone('sole_back','foot_back',[143,1440]);bone('sole_front','foot_front',[846,1422]);
const ordered=[];function walk(parent){for(const b of bones)if((b.parent||null)===parent){ordered.push(b);walk(b.name);}}walk(null);ordered.forEach((b,i)=>bind[b.name].index=i);
const upper=[[353,235],[395,236],[421,245],[437,268],[448,306],[442,352],[419,372],[386,393],[351,418],[323,452],[302,481],[301,509],[287,522],[270,530],[239,527],[213,519],[197,503],[184,489],[179,469],[173,455],[182,436],[204,432],[222,410],[243,384],[261,352],[279,314],[300,278],[323,251]];
const fore=[[214,491],[241,487],[269,498],[289,512],[283,543],[281,573],[289,609],[280,628],[257,635],[232,629],[226,609],[212,570],[201,530],[199,511]];
const hand=selection.handOcclusion;
const farUpper=[[634,370],[652,382],[672,420],[682,464],[707,508],[729,536],[739,550],[727,570],[704,585],[680,576],[659,556],[648,528],[641,489],[635,450],[626,409]];
const farFore=[[702,548],[731,552],[749,577],[779,602],[809,627],[821,647],[803,671],[778,664],[758,645],[732,623],[704,605],[685,587],[685,570]];
const farHand=[[774,636],[890,636],[890,778],[774,778]];
const coatBackOutline=[[386,590],[455,602],[435,681],[389,755],[313,836],[239,938],[141,1083],[99,1112],[57,1068],[42,988],[18,945],[11,854],[102,796],[199,727],[299,662]];
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const noCoat=await sharp(file('sources/body-no-coat-registered.png')).ensureAlpha().raw().toBuffer();
const coatFrontOutline=[[536,670],[589,711],[585,820],[565,945],[532,1035],[475,1095],[426,1120],[449,1000],[476,890],[481,810]];
function distancePoly(x,y,p){if(inside(x,y,p))return 0;let distance=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],u=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy));distance=Math.min(distance,Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy));}return distance;}
const body=Buffer.from(paint);let preservedHeadPixels=0,coatRemovedPixels=0;
for(let y=575;y<1145;y++)for(let x=0;x<610;x++)if(distancePoly(x,y,coatBackOutline)<14||distancePoly(x,y,coatFrontOutline)<14){const i=(y*W+x)*4;noCoat.copy(body,i,i,i+4);coatRemovedPixels++;}
for(let y=0;y<338;y++)for(let x=400;x<740;x++){const i=(y*W+x)*4;src.copy(body,i,i,i+4);if(src[i+3])preservedHeadPixels++;}
await sharp(body,{raw:{width:W,height:H,channels:4}}).png().toFile(file('images/body-completed.png'));
const images={body,coat_back:await sharp(file('images/coat_back.png')).ensureAlpha().raw().toBuffer(),coat_front:await sharp(file('images/coat_front.png')).ensureAlpha().raw().toBuffer()},polygons={upper_arm_far:farUpper,forearm_far:farFore,hand_far:farHand,upper_arm_near:upper,forearm_near:fore,hand_near:hand};
for(const [name,poly]of Object.entries(polygons)){const b=Buffer.alloc(src.length);for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inside(x+.5,y+.5,poly))src.copy(b,(y*W+x)*4,(y*W+x)*4,(y*W+x)*4+4);images[name]=b;await sharp(b,{raw:{width:W,height:H,channels:4}}).png().toFile(file('images/'+name+'.png'));}
images.weapon=weapon;images.sleeve_near=await sharp(file('images/sleeve_near.png')).ensureAlpha().raw().toBuffer();images.pauldron_near=await sharp(file('images/pauldron_near.png')).ensureAlpha().raw().toBuffer();
const palette=['pelvis','chest','head','coat_back_tip','coat_front_tip','arm_far_upper','arm_far_lower','hand_far','leg_back_upper','leg_back_lower','foot_back','leg_front_upper','leg_front_lower','foot_front'];
function bodyWeights(x,y){
 const mix=(a,b,t)=>[[a,1-clamp(t)],[b,clamp(t)]];
 if(y<335&&x>400)return mix('chest','head',smooth((342-y)/62));
 const combine=(a,b,t)=>{const m=new Map();for(const [n,w]of a)m.set(n,(m.get(n)||0)+w*(1-t));for(const [n,w]of b)m.set(n,(m.get(n)||0)+w*t);return [...m];};
 const leg=back=>{const prefix=back?'leg_back':'leg_front',foot=back?'foot_back':'foot_front';if(y<840)return mix('pelvis',prefix+'_upper',smooth((y-710)/125));if(y<1140)return mix(prefix+'_upper',prefix+'_lower',smooth((y-(back?1000:945))/(back?150:160)));return mix(prefix+'_lower',foot,smooth((y-1230)/100));};
 return y>700?combine(leg(true),leg(false),smooth((x-500)/100)):mix('pelvis','chest',smooth((656-y)/210));
}
function registered(name,x,y){if(name==='coat_back')return [x*.65+36,y*.65+294];if(name==='coat_front'){const a=9*rad,dx=x-720,dy=y-530;return [545+.55*(dx*Math.cos(a)-dy*Math.sin(a)),700+.55*(dx*Math.sin(a)+dy*Math.cos(a))];}return [x,y];}
const slots=[],attachments={},parts=[];
for(const name of ['coat_back','coat_front','body','upper_arm_far','forearm_far','hand_far','sleeve_near','pauldron_near','forearm_near','weapon','hand_near']){
 const pixels=images[name];let left=W,top=H,right=0,bottom=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(pixels[(y*W+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 const g=32,l=Math.max(0,Math.floor(left/g)*g-g),t=Math.max(0,Math.floor(top/g)*g-g),r=Math.min(W,Math.ceil(right/g)*g+g),b=Math.min(H,Math.ceil(bottom/g)*g+g),w=r-l,h=b-t;
 const pts=[[l,t],[r,t],[r,b],[l,b]];for(let y=t+g;y<b;y+=g)for(let x=l+g;x<r;x+=g)pts.push([x,y]);const ids=new Map(pts.map((v,i)=>[v.join(','),i])),triangles=[],edges=[],rings=[[],[],[],[]];
 for(let x=l+g;x<=r-g;x+=g)rings[0].push(ids.get(x+','+(t+g)));for(let y=t+g;y<=b-g;y+=g)rings[1].push(ids.get((r-g)+','+y));for(let x=r-g;x>=l+g;x-=g)rings[2].push(ids.get(x+','+(b-g)));for(let y=b-g;y>=t+g;y-=g)rings[3].push(ids.get((l+g)+','+y));
 for(let k=0;k<4;k++){const ring=rings[k];triangles.push(k,(k+1)%4,ring.at(-1));for(let i=0;i<ring.length-1;i++)triangles.push(k,ring[i+1],ring[i]);}
 for(let y=t+g;y<b-g;y+=g)for(let x=l+g;x<r-g;x+=g){const a=ids.get(x+','+y),bb=ids.get((x+g)+','+y),c=ids.get((x+g)+','+(y+g)),d=ids.get(x+','+(y+g));triangles.push(a,bb,c,a,c,d);}
 const seen=new Set();for(let i=0;i<triangles.length;i+=3)for(let k=0;k<3;k++){const a=triangles[i+k],bb=triangles[i+(k+1)%3],key=Math.min(a,bb)+','+Math.max(a,bb);if(!seen.has(key)){seen.add(key);edges.push(a*2,bb*2);}}
 const uvs=[],vertices=[];
 for(const [x,y]of pts){uvs.push((x-l)/w,(y-t)/h);const rigid={pauldron_near:'pauldron_near',sleeve_near:'arm_near_upper',upper_arm_near:'arm_near_upper',forearm_near:'arm_near_lower',upper_arm_far:'arm_far_upper',forearm_far:'arm_far_lower',hand_far:'hand_far'},xy=registered(name,x,y),cloth=name.startsWith('coat_'),clothWeight=smooth((xy[1]-(name==='coat_back'?650:750))/400)*.7,weights=name==='body'?new Map(bodyWeights(x,y)):name==='sleeve_near'?new Map([['shoulder_near',.25*(1-smooth((y-300)/150))],['arm_near_upper',1-.25*(1-smooth((y-300)/150))]]):cloth?new Map([['pelvis',1-clothWeight],[name+'_tip',clothWeight]]):new Map([[rigid[name]||'weapon_grip',1]]),names=name==='body'?palette:[...weights.keys()],p=world(xy);vertices.push(names.length);for(const key of names){const v=bind[key],dx=p[0]-v.x,dy=p[1]-v.y,c=Math.cos(v.a),s=Math.sin(v.a);vertices.push(v.index,dx*c+dy*s,-dx*s+dy*c,weights.get(key)||0);}}
 const sourcePng=name==='body'?'body-completed.png':name==='weapon'?'weapon-restored-v2.png':name+'.png',cropped=await sharp(file('images/'+sourcePng)).extract({left:l,top:t,width:w,height:h}).png().toBuffer();await fs.writeFile(file('images/'+name+'-mesh.png'),cropped);
 slots.push({name,bone:'root',attachment:name});attachments[name]={[name]:{type:'mesh',path:name+'-mesh',uvs,triangles,vertices,hull:4,edges,width:w,height:h}};parts.push({name,sourceRect:{x:l,y:t,width:w,height:h},vertices:pts.length,triangles:triangles.length/3,sha256:sha(cropped)});
}
const old=JSON.parse(await fs.readFile(file('../rig-v1/swordsman.input.json'),'utf8')),animations={setup:old.animations.setup,idle:old.animations.idle};
const keys=[
 {t:0,p:[0,0],c:[0,0,0],h:0,g:[279,674,0],f:[0,0],coat:0},
 {t:.12,p:[-8,-8],c:[-2,0,3],h:-2,g:[290,596,50],f:[-7,1],coat:-.6},
 {t:.26,p:[-20,-14],c:[-4,0,6],h:-4,g:[375,458,146],f:[-12,5],coat:-1.2},
 {t:.32,p:[-4,-20],c:[2,0,3],h:-2,g:[450,414,135],f:[-6,3],coat:-1.0},
 {t:.36,p:[22,-29],c:[8,3,-6],h:3,g:[540,450,80],f:[7,5],coat:-.3},
 {t:.4,p:[45,-32],c:[14,8,-16],h:6,g:[700,580,31],f:[20,8],coat:1.2},
 {t:.44,p:[45,-32],c:[14,8,-16],h:6,g:[700,580,31],f:[20,8],coat:1.8},
 {t:.54,p:[55,-40],c:[16,8,-18],h:8,g:[658,624,-24],f:[26,12],coat:3.2},
 {t:.68,p:[42,-34],c:[10,6,-12],h:5,g:[525,676,-12],f:[18,9],coat:2.4},
 {t:.84,p:[20,-21],c:[4,2,-5],h:2,g:[375,698,-3],f:[8,4],coat:-.8},
 {t:1.02,p:[4,-6],c:[0,0,-1],h:0,g:[285,676,0],f:[1,1],coat:-.4},
 {t:1.2,p:[0,0],c:[0,0,0],h:0,g:[279,674,0],f:[0,0],coat:0}
];
// FK arm: shoulder leads, elbow unfolds, wrist releases last. No zero-speed stop at every intermediate key.
const channels={
 upper:[[0,0],[.1,-12],[.2,-6],[.27,8],[.31,18],[.36,58],[.4,74],[.44,74],[.5,67],[.54,55],[.66,45],[.8,23],[.96,0],[1.08,-3],[1.2,0]],
 elbow:[[0,0],[.1,12],[.21,75],[.29,96],[.34,80],[.38,15],[.4,-8],[.44,-8],[.51,-5],[.6,6],[.76,20],[.96,8],[1.2,0]],
 wrist:[[0,0],[.12,-4],[.23,15],[.29,24],[.35,21],[.4,-14],[.44,-14],[.54,-52],[.62,-42],[.8,-24],[1,-6],[1.2,0]],
 shoulderX:[[0,0],[.1,-2],[.22,-8],[.3,2],[.365,14],[.4,20],[.44,20],[.52,16],[.68,8],[.85,0],[1.2,0]],
 shoulderY:[[0,0],[.22,9],[.3,14],[.37,6],[.4,-2],[.44,-2],[.54,-8],[.8,-3],[1.2,0]]
};
function curve(points,t){let i=points.findIndex(p=>p[0]>=t);if(i<=0)return points[i===0?0:points.length-1][1];const a=points[i-1],b=points[i],h=b[0]-a[0],u=(t-a[0])/h;const slope=k=>{if(k===0||k===points.length-1)return 0;const h0=points[k][0]-points[k-1][0],h1=points[k+1][0]-points[k][0],d0=(points[k][1]-points[k-1][1])/h0,d1=(points[k+1][1]-points[k][1])/h1;if(d0*d1<=0)return 0;const w1=2*h1+h0,w2=h1+2*h0;return (w1+w2)/(w1/d0+w2/d1);};return (2*u*u*u-3*u*u+1)*a[1]+(u*u*u-2*u*u+u)*h*slope(i-1)+(-2*u*u*u+3*u*u)*b[1]+(u*u*u-u*u)*h*slope(i);}
const tracks={};function add(bone,type,time,v){tracks[bone]??={};tracks[bone][type]??=[];tracks[bone][type].push({time,...v});}
for(let i=0;i<=120;i++){const time=i/100,body=(field,j=0)=>curve(keys.map(k=>[k.t,Array.isArray(k[field])?k[field][j]:k[field]]),time);
 add('pelvis','translate',time,{x:body('p',0),y:body('p',1)});add('chest','translate',time,{x:body('c',0),y:body('c',1)});add('chest','rotate',time,{value:body('c',2)});add('head','rotate',time,{value:body('h')});
 add('shoulder_near','translate',time,{x:curve(channels.shoulderX,time),y:curve(channels.shoulderY,time)});add('arm_near_upper','rotate',time,{value:curve(channels.upper,time)});add('arm_near_lower','rotate',time,{value:curve(channels.elbow,time)});add('wrist_near','rotate',time,{value:curve(channels.wrist,time)});add('pauldron_near','rotate',time,{value:curve(channels.upper,time)*.18});
 add('wrist_far','translate',time,{x:body('f',0),y:body('f',1)});add('coat_back_tip','rotate',time,{value:body('coat')});add('coat_front_tip','rotate',time,{value:-body('coat')*.55});
}
animations.attack_basic={bones:tracks,events:[{time:.4,name:'visual_contact'}]};
const skeleton={skeleton:{spine:'4.3.26',images:'./images/',fps:30},bones:ordered,slots,constraints,skins:[{name:'default',attachments}],events:{visual_contact:{}},animations};
await fs.writeFile(file('swordsman.input.json'),JSON.stringify(skeleton));await fs.writeFile(file('sources/attack-rig-map.json'),JSON.stringify({sourceSha256:sha(original),weaponSha256:sha(weaponBytes),bodyUnderpaint:'body-underpaint-v2.png',bodyUnderpaintGenerated:true,hiddenLegUnderpaint:'body-underpaint-v3-no-coat.png',clothRegistration:'cloth-registration.json',coatRemovedPixels,preservedHeadPixels,originalArmsSelected:true,nearSleeveUnderpaint:'sleeve-underpaint-v1.png',pauldronSeparated:true,upper,fore,hand,farUpper,farFore,farHand,bones:bind,parts,keyPoses:keys,armChannels:channels,armDriver:'FK shoulder-elbow-wrist chain; weapon inherits hand',interpolation:'monotone cubic with continuous interior velocity',origin,duration:1.2,gripSource:[279,674],wristSource:[262,620],soleSource:{back:[143,1440],front:[846,1422]},status:'BLOCKING_REVIEW_PENDING',userFinalApproval:false},null,2));
console.log(JSON.stringify({parts:parts.length,bones:ordered.length,vertices:parts.reduce((s,p)=>s+p.vertices,0),animations:Object.keys(animations),inputSha256:sha(Buffer.from(JSON.stringify(skeleton)))}));

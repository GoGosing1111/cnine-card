import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import sharp from 'sharp';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),file=p=>path.join(dir,p),rad=Math.PI/180,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const s=JSON.parse(await fs.readFile(file('../attack-v1/swordsman.input.json'),'utf8')),map=JSON.parse(await fs.readFile(file('../attack-v1/sources/attack-rig-map.json'),'utf8'));
const rigs={back:{A:[477,718],B:[301,1055],C:[132,1346]},front:{A:[568,704],B:[758,935],C:[799,1330]}};
for(const [side,{A,B,C}]of Object.entries(rigs)){
 const upper=s.bones.find(b=>b.name==='leg_'+side+'_upper'),lower=s.bones.find(b=>b.name==='leg_'+side+'_lower'),a=Math.atan2(A[1]-B[1],B[0]-A[0])/rad,b=Math.atan2(B[1]-C[1],C[0]-B[0])/rad;
 upper.rotation=a;upper.length=Math.hypot(B[0]-A[0],B[1]-A[1]);lower.x=upper.length;lower.y=0;lower.rotation=b-a;lower.length=Math.hypot(C[0]-B[0],C[1]-B[1]);
 s.constraints.find(c=>c.name==='leg_'+side+'_ik').bendPositive=false;
 s.bones.push({name:'knee_'+side,parent:lower.name,x:0,y:0,rotation:-b});
 Object.assign(rigs[side],{upperLength:upper.length,lowerLength:lower.length,bindBend:lower.rotation});
}
const bind={};
for(let i=0;i<s.bones.length;i++){const b=s.bones[i],p=b.parent?bind[b.parent]:{x:0,y:0,a:0},c=Math.cos(p.a),sn=Math.sin(p.a);bind[b.name]={x:p.x+(b.x||0)*c-(b.y||0)*sn,y:p.y+(b.x||0)*sn+(b.y||0)*c,a:p.a+(b.rotation||0)*rad,index:i};}
const mix=(a,b,t)=>[[a,1-clamp(t)],[b,clamp(t)]],combine=(a,b,t)=>{const m=new Map();for(const[n,w]of a)m.set(n,(m.get(n)||0)+w*(1-t));for(const[n,w]of b)m.set(n,(m.get(n)||0)+w*t);return [...m].filter(([,w])=>w>0);};
function weights(x,y){
 if(y<335&&x>400)return mix('chest','head',smooth((342-y)/62));
 if(y<=700)return mix('pelvis','chest',smooth((656-y)/210));
 const leg=side=>{const k=rigs[side].B[1],prefix='leg_'+side;if(y<830)return mix('pelvis',prefix+'_upper',smooth((y-710)/120));if(y<k)return mix(prefix+'_upper','knee_'+side,smooth((y-(k-110))/110));if(y<k+110)return mix('knee_'+side,prefix+'_lower',smooth((y-k)/110));return mix(prefix+'_lower','foot_'+side,smooth((y-1230)/100));};
 return combine(leg('back'),leg('front'),smooth((x-500)/100));
}
const body=s.skins[0].attachments.body.body,rect=map.parts.find(p=>p.name==='body').sourceRect,vertices=[];
for(let i=0;i<body.uvs.length;i+=2){const x=rect.x+body.uvs[i]*rect.width,y=rect.y+body.uvs[i+1]*rect.height,w=weights(x,y).filter(([,v])=>v>0);vertices.push(w.length);for(const[name,weight]of w){const b=bind[name],dx=x-512-b.x,dy=1450-y-b.y,c=Math.cos(b.a),sn=Math.sin(b.a);vertices.push(b.index,dx*c+dy*sn,-dx*sn+dy*c,weight);}}
body.vertices=vertices;
for(const name of ['coat_back','coat_front']){
 const a=s.skins[0].attachments[name][name],v=a.vertices;
 for(let i=0;i<v.length;){const count=v[i++];for(let k=0;k<count;k++,i+=4){if(v[i]!==bind.pelvis.index)continue;const old=bind.pelvis,newBone=bind[name],c=Math.cos(old.a),sn=Math.sin(old.a),wx=old.x+v[i+1]*c-v[i+2]*sn,wy=old.y+v[i+1]*sn+v[i+2]*c,dx=wx-newBone.x,dy=wy-newBone.y;v[i]=newBone.index;v[i+1]=dx*Math.cos(newBone.a)+dy*Math.sin(newBone.a);v[i+2]=-dx*Math.sin(newBone.a)+dy*Math.cos(newBone.a);}}
}
s.skeleton.images='../';
for(const byName of Object.values(s.skins[0].attachments))for(const a of Object.values(byName))a.path='attack-v1/images/'+a.path;
body.path='attack-v2/images/body-clean-mesh';
await fs.mkdir(file('images'),{recursive:true});
const clean=await sharp(file('../attack-v1/sources/body-no-coat-registered.png')).extract({left:rect.x,top:rect.y,width:rect.width,height:rect.height}).png().toBuffer();
await fs.writeFile(file('images/body-clean-mesh.png'),clean);
await fs.writeFile(file('rig-prepared.json'),JSON.stringify(s));
await fs.writeFile(file('leg-rig.json'),JSON.stringify({rigs,bind,source:'../attack-v1/sources/body-no-coat-registered.png',sourceUse:'Existing ImageGen underpaint, technical rectangular crop only',bodySha256:createHash('sha256').update(clean).digest('hex'),rect,changes:['Anatomical front knee moved from source y1004 to y935','Back knee bend changed to the forward-facing side','Knee volume helper bones','Separate per-leg knee blend regions','Removed painted coat fragments by reusing complete clean underpaint']},null,2));
console.log('Prepared anatomical knee pivots and clean body asset');

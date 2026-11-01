import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),file=p=>path.join(dir,p),hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(file('qa'),{recursive:true});
const parent=await fs.readFile(file('../attack-v1/swordsman-06c1f1563f47.spine'));
if(hash(parent)!=='3ae87ba2a39097cea5b25105db813a2bcefed0afc574a549cc85afac4139a423')throw Error('Preserve changed parent native project');
const bytes=await fs.readFile(file('../attack-v1/swordsman.input.json'));
if(hash(bytes)!=='06c1f1563f47f5f35864cf05d34ed539124878cc828e62e09cfd09d617dbb403')throw Error('Parent input changed');
const skeleton=JSON.parse(await fs.readFile(file('rig-prepared.json'),'utf8'));
const legRig=JSON.parse(await fs.readFile(file('leg-rig.json'),'utf8')).rigs;
// One forward step, a supported diagonal cut, then a separate recovery step.
// Positive Y is up. The back foot remains the plant; the front foot has two explicit flight intervals.
const duration=1.12,contact=.34;
const channels={
 pelvisX:[[0,0],[.08,-12],[.18,-25],[.24,8],[.30,70],[.34,105],[.38,105],[.47,113],[.60,94],[.74,70],[.89,22],[1.02,2],[1.12,0]],
 pelvisY:[[0,0],[.10,-9],[.20,-20],[.28,-58],[.34,-78],[.38,-78],[.47,-88],[.61,-70],[.76,-48],[.92,-22],[1.12,0]],
 chestX:[[0,0],[.18,-9],[.26,5],[.34,25],[.38,25],[.47,30],[.63,17],[.83,5],[1.12,0]],
 chestY:[[0,0],[.18,-4],[.26,4],[.34,8],[.38,8],[.50,5],[.77,0],[1.12,0]],
 chestAngle:[[0,0],[.18,9],[.25,4],[.30,-11],[.34,-23],[.38,-23],[.47,-27],[.62,-19],[.80,-7],[1.02,-1],[1.12,0]],
 headAngle:[[0,0],[.18,-5],[.28,2],[.34,10],[.38,10],[.50,12],[.72,5],[1.12,0]],
 footX:[[0,0],[.12,0],[.21,38],[.29,108],[.31,120],[.70,120],[.82,80],[.96,0],[1.12,0]],
 footY:[[0,0],[.12,0],[.21,18],[.26,12],[.31,0],[.70,0],[.80,18],[.88,10],[.96,0],[1.12,0]],
 footAngle:[[0,0],[.12,0],[.21,5],[.28,3],[.31,0],[.70,0],[.80,3],[.96,0],[1.12,0]],
 upper:[[0,0],[.08,-16],[.16,-12],[.23,10],[.27,31],[.31,62],[.34,82],[.38,82],[.46,70],[.53,52],[.69,39],[.83,15],[.99,-4],[1.12,0]],
 elbow:[[0,0],[.08,18],[.17,81],[.23,99],[.275,72],[.315,12],[.34,-7],[.38,-7],[.47,-5],[.56,5],[.73,27],[.92,12],[1.12,0]],
 wrist:[[0,0],[.08,-6],[.19,23],[.25,25],[.29,12],[.34,-20],[.38,-20],[.47,-51],[.56,-44],[.74,-27],[.96,-6],[1.12,0]],
 shoulderX:[[0,0],[.18,-11],[.25,5],[.31,20],[.34,25],[.38,25],[.47,20],[.69,7],[.89,0],[1.12,0]],
 shoulderY:[[0,0],[.18,14],[.25,20],[.31,8],[.34,-3],[.38,-3],[.50,-11],[.76,-4],[1.12,0]],
 farX:[[0,0],[.18,-45],[.27,-20],[.34,12],[.38,12],[.48,36],[.64,42],[.82,14],[1.12,0]],
 farY:[[0,0],[.18,22],[.26,5],[.34,-52],[.38,-52],[.49,-78],[.65,-45],[.86,-16],[1.12,0]],
 farAngle:[[0,0],[.18,7],[.34,-12],[.38,-12],[.49,-18],[.72,-8],[1.12,0]],
 coatBack:[[0,0],[.16,-3],[.27,-5],[.34,-1],[.42,6],[.53,10],[.69,3],[.86,-4],[1.03,1],[1.12,0]],
 coatFront:[[0,0],[.18,2],[.30,3],[.38,-1],[.49,-6],[.64,-4],[.86,3],[1.02,-.5],[1.12,0]]
};
function curve(points,t){
 let i=points.findIndex(p=>p[0]>=t);if(i<=0)return points[i===0?0:points.length-1][1];
 const a=points[i-1],b=points[i],h=b[0]-a[0],u=(t-a[0])/h;
 const slope=k=>{if(k===0||k===points.length-1)return 0;const h0=points[k][0]-points[k-1][0],h1=points[k+1][0]-points[k][0],d0=(points[k][1]-points[k-1][1])/h0,d1=(points[k+1][1]-points[k][1])/h1;if(d0*d1<=0)return 0;const w1=2*h1+h0,w2=h1+2*h0;return (w1+w2)/(w1/d0+w2/d1);};
 return (2*u*u*u-3*u*u+1)*a[1]+(u*u*u-2*u*u+u)*h*slope(i-1)+(-2*u*u*u+3*u*u)*b[1]+(u*u*u-u*u)*h*slope(i);
}
const tracks={};
function add(bone,type,time,v){tracks[bone]??={};tracks[bone][type]??=[];tracks[bone][type].push({time,...v});}
for(let i=0;i<=112;i++){
 const t=i/100,c=name=>curve(channels[name],t);
 add('pelvis','translate',t,{x:c('pelvisX'),y:c('pelvisY')});
 add('chest','translate',t,{x:c('chestX'),y:c('chestY')});add('chest','rotate',t,{value:c('chestAngle')});add('head','rotate',t,{value:c('headAngle')});
 add('foot_front','translate',t,{x:c('footX'),y:c('footY')});add('foot_front','rotate',t,{value:c('footAngle')});
 add('shoulder_near','translate',t,{x:c('shoulderX'),y:c('shoulderY')});
 add('arm_near_upper','rotate',t,{value:c('upper')});add('arm_near_lower','rotate',t,{value:c('elbow')});add('wrist_near','rotate',t,{value:c('wrist')});
 add('pauldron_near','rotate',t,{value:c('upper')*.18});
 add('wrist_far','translate',t,{x:c('farX'),y:c('farY')});add('hand_far','rotate',t,{value:c('farAngle')});
 add('coat_back','rotate',t,{value:c('coatBack')*.55});add('coat_back_tip','rotate',t,{value:c('coatBack')*.18});
 add('coat_front','rotate',t,{value:c('coatFront')*.55});add('coat_front_tip','rotate',t,{value:c('coatFront')*.18});
 for(const [side,r]of Object.entries(legRig)){
  const dx=r.C[0]+(side==='front'?c('footX'):0)-r.A[0]-c('pelvisX'),dy=r.C[1]-(side==='front'?c('footY'):0)-r.A[1]+c('pelvisY');
  const cosine=Math.max(-1,Math.min(1,(dx*dx+dy*dy-r.upperLength**2-r.lowerLength**2)/(2*r.upperLength*r.lowerLength)));
  const bend=-Math.acos(cosine)*180/Math.PI;add('knee_'+side,'rotate',t,{value:-(bend-r.bindBend)/2});
 }
}
skeleton.animations.attack_basic={bones:tracks,events:[{time:.31,name:'step_land'},{time:contact,name:'visual_contact'},{time:.96,name:'step_recover'}]};
skeleton.events={...skeleton.events,step_land:{},step_recover:{}};
await fs.writeFile(file('swordsman.input.json'),JSON.stringify(skeleton));
await fs.writeFile(file('motion-plan.json'),JSON.stringify({parentNative:'../attack-v1/swordsman-06c1f1563f47.spine',duration,contact,channels,frontFootFlight:[[.12,.31],[.70,.96]],frontFootPlant:[[0,.12],[.31,.70],[.96,1.12]],backFootPlant:[0,1.12],artwork:'Reuses prior immutable images; no raster redraw in this motion pass',purpose:'Forward supported cut, shoulder-elbow-wrist release, delayed coat, separate recovery step',authoring:'external Spine JSON + native Spine CLI',desktopInput:false,userMotionApproval:false},null,2));
console.log(JSON.stringify({inputSha256:hash(Buffer.from(JSON.stringify(skeleton))),duration,contact}));

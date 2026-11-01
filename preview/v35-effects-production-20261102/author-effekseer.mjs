import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url));
const tool=process.env.V35_EFFEKSEER||'C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const t=(k,v)=>`<${k}>${v}</${k}>`;
const rnd=v=>t('Center',v)+t('Max',v)+t('Min',v);
const vec=(a,random=false)=>a.map((v,i)=>t('XYZ'[i],random?rnd(v):v)).join('');
const col=a=>a.map((v,i)=>t('RGBA'[i],v)).join('');
const ease=(a,b)=>t('Start',vec(a,true))+t('End',vec(b,true));
function ring({name,r=3,inner=r-.12,from=0,to=360,angleMotion=null,color=[255,185,75,255],life=22,delay=0,rotation=[0,0,0],spin=[0,0,0],start=[1,1,1],end=start,location=[0,0,0],velocity=[0,0,0],fade=life-2}){
 const angle=(prefix,a,b)=>t(prefix,2)+t(prefix+'_Easing',t('Start',rnd(a))+t('End',rnd(b)));
 const angles=angleMotion?angle('StartingAngle',from,angleMotion[0])+angle('EndingAngle',to,angleMotion[1]):t('StartingAngle_Fixed',from)+t('EndingAngle_Fixed',to);
 const crescent=to-from<359?t('RingShape',t('Type',1)+t('Crescent',t('StartingFade',Math.min(30,(to-from)/3))+t('EndingFade',Math.min(35,(to-from)/3))+angles)):'';
 return t('Node',t('Name',name)+t('CommonValues',t('Life',rnd(life))+t('GenerationTimeOffset',rnd(delay)))+
  t('LocationValues',t('Type',1)+t('PVA',t('Location',vec(location,true))+t('Velocity',vec(velocity,true))))+
  t('RotationValues',t('Type',1)+t('PVA',t('Rotation',vec(rotation,true))+t('Velocity',vec(spin,true))))+
  t('ScalingValues',t('Type',2)+t('Easing',ease(start,end)))+
  t('RendererCommonValues',t('AlphaBlend',2)+t('ZTest','False')+t('ZWrite','False')+t('FadeInType',1)+t('FadeIn',t('Frame',1))+t('FadeOutType',1)+t('FadeOut',t('Frame',fade)))+
  t('DrawingValues',t('Type',4)+t('Ring',crescent+t('VertexCount',96)+t('Outer_Fixed',t('Location',vec([r,0])))+t('Inner_Fixed',t('Location',vec([inner,0])))+t('CenterRatio_Fixed',.65)+t('OuterColor_Fixed',col([...color.slice(0,3),0]))+t('CenterColor_Fixed',col(color))+t('InnerColor_Fixed',col([...color.slice(0,3),0]))))+t('Children',''));
}
function spark(options,length,width){
 const positions=[['LL',[-length,0]],['LR',[0,-width]],['UL',[0,width]],['UR',[length,0]]].map(([k,v])=>t('Position_Fixed_'+k,vec(v))).join('');
 const drawing=t('DrawingValues',t('Type',2)+t('ColorAll',t('Type',0)+t('Fixed',col(options.color)))+t('Sprite',t('Billboard',2)+t('Position',1)+positions));
 return ring(options).replace(/<DrawingValues>.*?<\/DrawingValues>/,drawing);
}
let seed=3502;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const slash=[];
slash.push(ring({name:'Crimson trailing crescent',r:4.3,inner:3.3,from:204,to:300,angleMotion:[245,375],color:[255,37,14,200],life:18,start:[.85,.85,1],end:[1.08,1.08,1],spin:[0,0,-1.0]}));
slash.push(ring({name:'Amber cutting plane',r:4.25,inner:3.77,from:210,to:320,angleMotion:[250,370],color:[255,170,60,255],life:15,delay:1,start:[.88,.88,1],end:[1.06,1.06,1],spin:[0,0,-1.3]}));
slash.push(ring({name:'White-hot leading edge',r:4.2,inner:3.94,from:220,to:330,angleMotion:[265,375],color:[255,252,229,255],life:12,delay:2,start:[.93,.93,1],end:[1.04,1.04,1]}));
for(let i=0;i<7;i++)slash.push(ring({name:`Fragmented trailing filament ${i}`,r:4.45+random()*.4,inner:4.42,from:208+i*17,to:217+i*17,color:[255,105+Math.floor(random()*80),40,190],life:17+i%4,delay:2+i%3,start:[.9,.9,1],end:[1.06,1.06,1],spin:[0,0,-.6]}));
const impact=[];
impact.push(spark({name:'Primary directional contact flash',color:[255,240,195,255],life:12,rotation:[0,0,24],start:[.2,.2,1],end:[1.4,.15,1],fade:10},2.1,.23));
impact.push(spark({name:'Secondary broken flash',color:[255,155,45,225],life:14,rotation:[0,0,114],start:[.1,.1,1],end:[.9,.05,1],fade:12},1.5,.2));
impact.push(ring({name:'Contact pressure core',r:1.15,inner:0,life:9,color:[255,235,187,255],start:[.2,.2,1],end:[1,1,1],fade:7}));
impact.push(ring({name:'Broken pressure halo',r:2.4,inner:2.22,from:5,to:330,life:21,color:[255,142,47,210],start:[.15,.15,1],end:[1.1,1.1,1],spin:[0,0,2.5]}));
for(let i=0;i<24;i++){
 const angle=random()*Math.PI*2,dist=.4+random()*2.3,speed=.08+random()*.1;
 impact.push(spark({name:`Directional heated splinter ${i}`,life:15+Math.floor(random()*17),delay:i%4,color:[255,155+Math.floor(random()*90),80,240],rotation:[0,0,angle*180/Math.PI],start:[.75+random(),.5,1],end:[.03,.03,1],location:[Math.cos(angle)*dist*.15,Math.sin(angle)*dist*.15,0],velocity:[Math.cos(angle)*speed,Math.sin(angle)*speed,0]},.42,.035));
}
const ground=[];
for(let i=0;i<3;i++)ground.push(ring({name:`Ground pressure band ${i}`,r:3.8+i*.2,inner:3.57+i*.2,from:8+i*70,to:300+i*12,life:24+i*3,delay:i*3,color:[255,125+i*32,40,180-i*30],start:[.08,.025,1],end:[1,.25,1],fade:18}));
const specs=[{id:'cleave',nodes:slash,frames:28,units:12,blend:'add'},{id:'contact',nodes:impact,frames:40,units:12,blend:'add'},{id:'ground-wave',nodes:ground,frames:42,units:12,blend:'add'}];
await fs.mkdir(dir+'native',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});
const reports=[];
for(const s of specs){
 const xml='<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',t('Root',t('Name','Root')+t('Children',s.nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',s.frames)+t('IsLoop','False'));
 const source=path.join(dir,'native',s.id+'.efkproj'),native=path.join(dir,'native',s.id+'.efkefc'),runtime=path.join(dir,'native',s.id+'.efk');await fs.writeFile(source,xml);
 async function run(input,output,exportPath){return await new Promise(resolve=>{const args=['-cui','-in',input,'-o',output,'-e',exportPath];const p=spawn(tool,args,{cwd:path.dirname(tool),windowsHide:true,stdio:'pipe'});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);p.on('error',e=>resolve({code:-1,log:e.stack,args}));p.on('exit',code=>resolve({code,log,args}));});}
 const first=await run(source,native,path.join(dir,'qa',s.id+'-import.efk'));
 const reopened=await run(native,path.join(dir,'qa',s.id+'-reopened.efkefc'),runtime);
 const second=await run(path.join(dir,'qa',s.id+'-reopened.efkefc'),path.join(dir,'qa',s.id+'-second.efkefc'),path.join(dir,'qa',s.id+'-second.efk'));
 const original=await fs.readFile(runtime),again=await fs.readFile(path.join(dir,'qa',s.id+'-second.efk'));
 const report={id:s.id,nodes:s.nodes.length,first,reopened,second,roundTripBinaryEqual:original.equals(again),runtimeBytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),note:'Runtime is exported from saved native. XML import float values normalize when saved.'};
 if(first.code||reopened.code||second.code||!report.roundTripBinaryEqual||original.length<1000)throw Error(JSON.stringify(report));reports.push(report);
}
await fs.writeFile(dir+'effects.json',JSON.stringify({tool:'Effekseer',version:'1.70e',runtime:'official EffekseerForWebGL 1.70e',seed:3502,fps:60,effects:specs.map(({nodes,...s})=>({...s,width:512,height:512,pivot:[256,256],source:'native/'+s.id+'.efkefc'}))},null,2));
await fs.writeFile(dir+'qa/effekseer-roundtrip.json',JSON.stringify(reports,null,2));console.log(reports.map(({first,reopened,second,...r})=>r));

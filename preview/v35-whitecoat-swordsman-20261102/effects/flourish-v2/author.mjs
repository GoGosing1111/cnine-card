import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {t,ring,spark} from '../primitives.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),tool='C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const white=[255,250,231,255],gold=[255,180,54,230],pale=[255,226,159,180];
const impact=[];
// Thin, crossed cutting rays replace the old solid circular contact core.
for(const [i,angle] of [0,32,97,145].entries()){
 impact.push(spark({name:'White cutting ray '+i,color:white,life:7+i,rotation:[0,0,angle],start:[.75,1,1],end:[1.3,.015,1],fade:6},i===0?2.6:1.5,.10));
 impact.push(spark({name:'Gold directional pressure '+i,color:gold,life:15+i,rotation:[0,0,angle],start:[.2,1.7,1],end:[1.1,.015,1],delay:1,fade:13},i===0?3.2:1.8,.16));
}
for(let i=0;i<3;i++)impact.push(ring({name:'Broken pressure fragment '+i,r:2.2,inner:2.04,from:15+i*120,to:68+i*120,color:gold,life:16,delay:1,start:[.12,.12,1],end:[1.55,1.05,1],fade:14}));
for(let i=0;i<32;i++){
 const a=i*2.399963,speed=.075+(i%8)*.014;
 impact.push(spark({name:'Radiating blade splinter '+i,color:i%3===0?white:gold,life:18+i%10,delay:i%3,rotation:[0,0,a*180/Math.PI],velocity:[Math.cos(a)*speed,Math.sin(a)*speed,0],start:[.8,1.3,1],end:[.025,.02,1],fade:14},.21+(i%4)*.065,.028));
}
const rise=[
 spark({name:'Vertical finishing edge',color:white,life:10,rotation:[0,0,88],location:[0,-.4,0],start:[.25,1,1],end:[1.2,.01,1],fade:8},2.5,.12),
 spark({name:'Gold ascending pressure',color:[255,209,113,150],life:17,rotation:[0,0,88],location:[0,-.5,0],start:[.1,1,1],end:[1.25,.025,1],fade:15},2.8,.48),
 ring({name:'Upper blade pressure wing',r:2.4,inner:2.25,from:22,to:145,color:pale,life:20,start:[.2,.25,1],end:[1.35,.65,1],fade:18}),
 ring({name:'Lower broken reverse wing',r:2.65,inner:2.55,from:205,to:325,color:gold,life:24,delay:2,start:[.25,.2,1],end:[1.2,.7,1],fade:20})
];
for(let i=0;i<22;i++){
 const x=(i-10.5)/10.5;
 rise.push(spark({name:'Lifting gold blade fragment '+i,color:i%4===0?white:gold,life:24+i%9,delay:i%5,rotation:[0,0,67+i%7*7],location:[x*.6,-1.1,0],velocity:[x*.05,.085+(i%6)*.014,0],start:[.6,1,1],end:[.01,.01,1],fade:20},.23+(i%3)*.07,.026));
}
const specs=[{id:'impact-burst',nodes:impact,frames:38},{id:'rising-release',nodes:rise,frames:44}];
await fs.mkdir(dir+'native',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});const reports=[];
async function run(input,output,exportPath){return new Promise((resolve,reject)=>{const args=['-cui','-in',input,'-o',output,'-e',exportPath],p=spawn(tool,args,{cwd:path.dirname(tool),windowsHide:true,stdio:'pipe'});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);p.on('error',reject);p.on('exit',code=>resolve({args,code,log}));});}
for(const s of specs){
 const source=dir+'native/'+s.id+'.efkproj',native=dir+'native/'+s.id+'.efkefc',runtime=dir+'native/'+s.id+'.efk';
 await fs.writeFile(source,'<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',t('Root',t('Name','Root')+t('Children',s.nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',s.frames)+t('IsLoop','False')));
 const save=await run(source,native,dir+'qa/'+s.id+'-import.efk'),reopen=await run(native,dir+'qa/'+s.id+'-reopened.efkefc',runtime),again=await run(dir+'qa/'+s.id+'-reopened.efkefc',dir+'qa/'+s.id+'-second.efkefc',dir+'qa/'+s.id+'-second.efk');
 const bytes=await fs.readFile(runtime),same=bytes.equals(await fs.readFile(dir+'qa/'+s.id+'-second.efk'));if(save.code||reopen.code||again.code||!same)throw Error(s.id+' native roundtrip');
 reports.push({id:s.id,nodes:s.nodes.length,save,reopen,again,roundTripBinaryEqual:same,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(dir+'effects.json',JSON.stringify({id:'whitecoat-flourish-v2',tool:'Effekseer',version:'1.70e',seed:3502,fps:60,effects:specs.map(({nodes,...s})=>({...s,units:12,width:512,height:512,pivot:[256,256],blend:'add',source:'native/'+s.id+'.efkefc'}))},null,2));
await fs.writeFile(dir+'qa/native.json',JSON.stringify(reports,null,2));console.log('2 richer native Effekseer effects saved and round-trip verified.');

import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {t,ring,spark} from '../../effects/primitives.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),tool='C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const gold=[255,188,65,235],pale=[255,234,186,180],white=[255,251,231,230],nodes=[];
for(const [i,angle] of [75,90,108].entries())nodes.push(spark({name:'Descending cut pressure '+i,color:i===1?white:gold,life:13+i*2,rotation:[0,0,angle],location:[(i-1)*.22,1.15,0],start:[.3,.45,1],end:[1.25,.01,1],fade:11+i*2},i===1?1.75:1.25,i===1?.055:.10));
for(const [i,from] of [8,188].entries())nodes.push(ring({name:'Ground split wing '+i,r:3.1,inner:2.85,from,to:from+150,color:gold,life:26,delay:1,start:[.12,.1,1],end:[1.45,.25,1],fade:22}));
for(const [i,from] of [35,215].entries())nodes.push(ring({name:'Broken outer wake '+i,r:3.3,inner:3.16,from,to:from+105,color:pale,life:31,delay:4,start:[.3,.08,1],end:[1.5,.32,1],fade:25}));
for(let i=0;i<28;i++){
 const a=.2+i/27*(Math.PI-.4),v=.065+(i%6)*.018;
 nodes.push(spark({name:'Ejected impact shard '+i,color:i%5?gold:white,life:24+i%13,delay:i%4,rotation:[0,0,a*180/Math.PI],location:[(i%3-1)*.1,0,0],velocity:[Math.cos(a)*v,Math.sin(a)*v,0],start:[.8,1.1,1],end:[.02,.01,1],fade:20},.18+i%4*.055,.024));
}
const id='tempest-slam',frames=46;await fs.mkdir(dir+'native',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});
async function run(input,output,exportPath){return new Promise((resolve,reject)=>{const args=['-cui','-in',input,'-o',output,'-e',exportPath],p=spawn(tool,args,{cwd:path.dirname(tool),windowsHide:true,stdio:'pipe'});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);p.on('error',reject);p.on('exit',code=>resolve({args,code,log}));});}
const source=dir+'native/'+id+'.efkproj',native=dir+'native/'+id+'.efkefc',runtime=dir+'native/'+id+'.efk';
await fs.writeFile(source,'<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',t('Root',t('Name','Root')+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',frames)+t('IsLoop','False')));
const save=await run(source,native,dir+'qa/'+id+'-import.efk'),reopen=await run(native,dir+'qa/'+id+'-reopened.efkefc',runtime),again=await run(dir+'qa/'+id+'-reopened.efkefc',dir+'qa/'+id+'-second.efkefc',dir+'qa/'+id+'-second.efk');
const bytes=await fs.readFile(runtime),same=bytes.equals(await fs.readFile(dir+'qa/'+id+'-second.efk'));if(save.code||reopen.code||again.code||!same)throw Error('Native effect round-trip failed');
await fs.writeFile(dir+'effects.json',JSON.stringify({id:'whitecoat-tempest-slam-v3',tool:'Effekseer',version:'1.70e',seed:3502,fps:60,effects:[{id,frames,units:12,width:512,height:512,pivot:[256,256],blend:'add',source:'native/'+id+'.efkefc'}]},null,2));
await fs.writeFile(dir+'qa/native.json',JSON.stringify([{id,nodes:nodes.length,save,reopen,again,roundTripBinaryEqual:same,sha256:createHash('sha256').update(bytes).digest('hex')}],null,2));console.log('Tempest ground impact authored in Effekseer and round-trip verified.');

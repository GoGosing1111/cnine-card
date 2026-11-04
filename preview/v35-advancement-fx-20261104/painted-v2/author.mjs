import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),tool=process.env.V35_EFFEKSEER||'C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const t=(k,v)=>`<${k}>${v}</${k}>`,rnd=v=>t('Center',v)+t('Max',v)+t('Min',v),vec=a=>a.map((v,i)=>t('XYZ'[i],v)).join('');
const records=JSON.parse(await fs.readFile(dir+'generation.json','utf8')).filter(r=>r.status!=='REJECTED');
await fs.mkdir(dir+'native/Texture',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});
const reports=[],clips=[],audit=[];
async function run(input,output,exportPath){return new Promise((resolve,reject)=>{const args=['-cui','-in',input,'-o',output,'-e',exportPath],p=spawn(tool,args,{cwd:path.dirname(tool),windowsHide:true,stdio:'pipe'});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);p.on('error',reject);p.on('exit',code=>resolve({args,code,log}));});}
for(const r of records){
 const b=await fs.readFile(dir+r.output),m=await sharp(b).metadata(),nodes=[];
 for(let i=0;i<8;i++){
  const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/2),w=Math.round((i%4+1)*m.width/4)-x,h=Math.round((Math.floor(i/4)+1)*m.height/2)-y;
  const raw=await sharp(b).extract({left:x,top:y,width:w,height:h}).ensureAlpha().raw().toBuffer();let edge=0;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if((xx===0||yy===0||xx===w-1||yy===h-1)&&raw[(yy*w+xx)*4+3]>32)edge++;
  if(edge)throw Error(r.id+' frame '+i+' touches cell edge: '+edge);
  audit.push({id:r.id,frame:i,rect:[x,y,w,h],edgePixels:edge,alphaPreserved:true});
  // Technical cell extraction and uniform sizing only; no recoloring, painted
  // substitutes, masks, inferred in-betweens or modifications to source art.
  await sharp(b).extract({left:x,top:y,width:w,height:h}).resize(384,384,{fit:'contain',background:'#00000000'}).extend({left:64,right:64,top:64,bottom:64,background:'#00000000'}).png().toFile(dir+`native/Texture/${r.id}-${i}.png`);
  const pos=[['LL',[-6,-6]],['LR',[6,-6]],['UL',[-6,6]],['UR',[6,6]]].map(([n,v])=>t('Position_Fixed_'+n,vec(v))).join('');
  nodes.push(t('Node',t('Name',r.id+' painted phase '+i)+t('CommonValues',t('Life',rnd(4))+t('GenerationTimeOffset',rnd(i*4)))+t('RendererCommonValues',t('ColorTexture',`Texture/${r.id}-${i}.png`)+t('AlphaBlend',1)+t('ZTest','False')+t('ZWrite','False')+t('Filter',1))+t('DrawingValues',t('Type',2)+t('Sprite',t('Billboard',2)+t('Position',1)+pos))+t('Children','')));
 }
 const src=dir+'native/'+r.id+'.efkproj',native=dir+'native/'+r.id+'.efkefc',runtime=dir+'native/'+r.id+'.efk';
 await fs.writeFile(src,'<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',t('Root',t('Name','Root')+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',36)+t('IsLoop','False')));
 // Round trip outputs must share the source directory so relative Texture/
 // paths retain their meaning (a binary file exported to qa/ would not).
 const save=await run(src,native,dir+'native/'+r.id+'-import.efk'),reopen=await run(native,dir+'native/'+r.id+'-verified.efkefc',runtime),again=await run(dir+'native/'+r.id+'-verified.efkefc',dir+'native/'+r.id+'-roundtrip.efkefc',dir+'native/'+r.id+'-roundtrip.efk');
 const runtimeBytes=await fs.readFile(runtime),same=runtimeBytes.equals(await fs.readFile(dir+'native/'+r.id+'-roundtrip.efk'));
 if(save.code||reopen.code||again.code||!same)throw Error(r.id+' native round trip');
 reports.push({id:r.id,save,reopen,again,roundTripBinaryEqual:same,sha256:createHash('sha256').update(runtimeBytes).digest('hex')});
 clips.push({id:r.id,frames:19,nativeFrames:36,blend:'normal',width:512,height:512,units:12,pivot:[256,256],source:'native/'+r.id+'.efkefc'});
 console.log(r.id+': 8 painted phases, native verified');
}
await fs.writeFile(dir+'effects.json',JSON.stringify({id:'mercenary-advancement-painted-v2',sourceDate:'2026-11-05',tool:'Effekseer',version:'1.70e',fps:30,nativeFps:60,seed:3504,effects:clips},null,2));
await fs.writeFile(dir+'qa/native.json',JSON.stringify(reports,null,2));await fs.writeFile(dir+'qa/crop-audit.json',JSON.stringify(audit,null,2));

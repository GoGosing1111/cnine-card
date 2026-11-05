import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {t} from '../effects/primitives.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),native=path.join(dir,'native');
await fs.mkdir(native+'/Texture',{recursive:true});await fs.mkdir(dir+'qa',{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),reports=[],cropAudit=[],effects=[];
const binary='C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const rnd=n=>t('Center',n)+t('Max',n)+t('Min',n);
function exportNative(input,output,compiled){const r=spawnSync(binary,['-cui','-in',native+'/'+input,'-o',native+'/'+output,'-e',native+'/'+compiled],{cwd:path.dirname(binary),windowsHide:true,encoding:'utf8',timeout:90000});if(r.status!==0||r.error)throw Error(r.error?.message||r.stderr);}
for(const id of ['rear','front']) {
 const source=dir+'art/'+id+'.png',{data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const unique=new Set(),nodes=[];
 for(let i=0;i<8;i++) {
  const col=i%4,row=Math.floor(i/4),left=Math.round(info.width*col/4),top=Math.round(info.height*row/2);
  const w=Math.round(info.width*(col+1)/4)-left,h=Math.round(info.height*(row+1)/2)-top;
  let border=0,covered=0,empty=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=data[((top+y)*info.width+left+x)*4+3];if(!a)empty++;if(a>32){covered++;if(!x||!y||x===w-1||y===h-1)border++;}}
  cropAudit.push({id,frame:i,rect:[left,top,w,h],border,covered,empty});
  if(border||covered<100||empty<w*h*.2)throw Error(id+' frame '+i+' unsafe alpha/crop '+JSON.stringify(cropAudit.at(-1)));
  const crop=await sharp(source).extract({left,top,width:w,height:h}).png().toBuffer(),size=Math.max(w,h);
  const square=await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite([{input:crop,left:Math.floor((size-w)/2),top:Math.floor((size-h)/2)}]).png().toBuffer();
  const pixels=await sharp(square).resize(384,384).png().toBuffer();await fs.writeFile(native+'/Texture/'+id+'-'+i+'.png',pixels);unique.add(hash(pixels));
  // Raise the foreground ribbons from floor level to hips and shins. This
  // is an editable native placement, shared by every cel, not a cut-out mask.
  const corners=[['LL',-5.8,-5.8],['LR',5.8,-5.8],['UL',-5.8,5.8],['UR',5.8,5.8]].map(([k,x,y])=>t('Position_Fixed_'+k,t('X',x)+t('Y',y+(id==='front'?.9:0)))).join('');
  const material=t('ColorTexture','Texture/'+id+'-'+i+'.png')+t('AlphaBlend',1)+t('ZTest','False')+t('ZWrite','False')+t('Filter',1);
  const sprite=t('Billboard',2)+t('ColorAll',0)+t('ColorAll_Fixed','<R>255</R><G>255</G><B>255</B><A>255</A>')+t('Position',1)+corners;
  nodes.push(t('Node',t('Name','Hakuya ink '+id+' cel '+i)+t('CommonValues',t('Life',rnd(4))+t('GenerationTimeOffset',rnd(i*4)))+t('RendererCommonValues',material)+t('DrawingValues',t('Type',2)+t('Sprite',sprite))+t('Children','')));
 }
 if(unique.size!==8)throw Error(id+' needs eight different drawings');
 const name='ink-'+id,project=t('Root',t('Name','Hakuya Shin ink-white '+id)+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',32)+t('IsLoop','True');
 await fs.writeFile(native+'/'+name+'.efkproj','<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',project));
 exportNative(name+'.efkproj',name+'.efkefc',name+'-initial.efk');
 exportNative(name+'.efkefc',name+'-reopened.efkefc',name+'.efk');
 exportNative(name+'-reopened.efkefc',name+'-verified.efkefc',name+'-verified.efk');
 const bytes=await fs.readFile(native+'/'+name+'.efk');if(!bytes.equals(await fs.readFile(native+'/'+name+'-verified.efk')))throw Error('Native roundtrip '+name);
 reports.push({id:name,drawings:unique.size,roundTripBinaryEqual:true,sourceSha256:hash(await fs.readFile(source)),runtimeSha256:hash(bytes)});
 effects.push({id:name,frames:34,blend:'normal',units:12,width:512,height:512,pivot:[256,256],source:'native/'+name+'.efkefc'});
}
await fs.writeFile(dir+'effects.json',JSON.stringify({effects},null,2));
await fs.writeFile(dir+'qa/native.json',JSON.stringify({tool:'Effekseer 1.70e',reports,cropAudit},null,2));
console.log(reports);

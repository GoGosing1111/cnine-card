import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root='C:/Users/User/Downloads/upload/cnine-card/tmp/cardgu-live-20261027',dir=path.join(root,'assets/ui/player-card/renewal-20261101');
const sharp=createRequire(root+'/package.json')('sharp'),prompts=JSON.parse(fs.readFileSync(new URL('./prompts.json',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(dir,{recursive:true});
const assets=[];
for(const p of prompts.prompts){
 const original=p.id+'.png',runtime=p.id+'.webp',bytes=fs.readFileSync(p.source);fs.writeFileSync(path.join(dir,original),bytes);
 const data=await sharp(bytes).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toBuffer();fs.writeFileSync(path.join(dir,runtime),data);
 const meta=await sharp(bytes).metadata(),stats=await sharp(data).stats();if(!meta.hasAlpha||stats.isOpaque)throw Error('Missing alpha '+p.id);
 assets.push({id:p.id,original,runtime,originalSha256:hash(bytes),runtimeSha256:hash(data),originalSize:[meta.width,meta.height],runtimeSize:[512,512],hasAlpha:true,bytes:data.length});
}
fs.writeFileSync(path.join(dir,'prompts.json'),JSON.stringify(prompts,null,2)+'\n');fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({generator:'image_gen.imagegen',visualApproval:'GENERATED_AND_TECHNICALLY_REVIEWED',assets},null,2)+'\n');
const {TROPHY_CATALOG}=await import('file:///'+root+'/js/player-card-model-v2052.js');
for(const t of TROPHY_CATALOG){const f=t.art.slice(1),target=path.join(root,f);if(!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,execFileSync('git',['-c','gc.auto=0','show','HEAD:'+f],{cwd:root,windowsHide:true,maxBuffer:20e6}));}}
console.log(JSON.stringify({assets}));

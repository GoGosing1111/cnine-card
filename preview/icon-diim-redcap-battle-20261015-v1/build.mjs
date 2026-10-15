// Preparation only: preserves source bytes and never edits a live roster or catalog.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const base=new URL('./',import.meta.url),path=p=>new URL(p,base),hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const readJson=async p=>JSON.parse((await fs.readFile(path(p),'utf8')).replace(/^\uFEFF/,''));
const save=async(p,b)=>{await fs.mkdir(new URL('.',path(p)),{recursive:true});await fs.writeFile(path(p),b);};
const input=await readJson('input.json');
function inspect(data,width,height){let edgeMax=0,nonempty=0,minX=width,minY=height,maxX=-1,maxY=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=data[(y*width+x)*4+3];if(a>0)nonempty++;if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}if(x===0||y===0||x===width-1||y===height-1)edgeMax=Math.max(edgeMax,a);}return {edgeMax,nonempty,transparentFraction:1-nonempty/(width*height),bounds:maxX<0?null:[minX,minY,maxX+1,maxY+1]};}
async function measure(bytes){const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return inspect(data,info.width,info.height);}
const portrait=await fs.readFile(path(input.portrait)),pm=await sharp(portrait).metadata();
const locked='59E79BBB4BB5D40D368DACB63E19D917FB9883ED4E586972211A8C39606687F1';
if(hash(portrait)!==locked)throw Error('Preserved user portrait hash changed');
const manifest={version:1,date:'2026-10-15',id:'ICON_DIIM_REDCAP_BATTLE_PREPARATION',name:input.name,cardId:null,techniqueCode:'AUTONOMOUS_WEAPON',techniqueName:'자율 병기',techniqueAssignment:'USER_CONFIRMED_PREPARATION_ONLY',tuning:null,releaseEnabled:false,acquisitionEnabled:false,registrationEnabled:false,visualApproval:'USER_REVIEW_PENDING',sourceArt:{file:input.portrait,sha256:hash(portrait),size:[pm.width,pm.height],preserved:true},status:'WAITING_FOR_GENERATED_RESOURCES',missing:[]};
for(const name of ['sd','weapon','fx'])try{await fs.access(path(input[name]));}catch{manifest.missing.push(input[name]);}
if(!input.footAnchorSource)manifest.missing.push('input.footAnchorSource (visually measured)');
if(!input.weaponAnchorSource)manifest.missing.push('input.weaponAnchorSource (visually measured)');
if(!manifest.missing.length){
 const bytes=await fs.readFile(path(input.sd)),meta=await sharp(bytes).metadata(),alpha=await measure(bytes),foot=input.footAnchorSource;
 if(!meta.hasAlpha||meta.width<1024||meta.height<1024||alpha.transparentFraction<.1||alpha.edgeMax>12)throw Error('SD requires native transparent alpha and unclipped edges');
 if(!Number.isFinite(foot.x)||!Number.isFinite(foot.y)||foot.x<0||foot.x>meta.width||foot.y<0||foot.y>meta.height)throw Error('Invalid measured sole anchor');
 const rendered=await sharp(bytes).resize(672,672,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer(),scale=672/Math.max(meta.width,meta.height);
 const runtime='assets/diim-sd.webp';await save(runtime,rendered);
 manifest.character={id:'diim-preparation',name:input.name,source:input.sd,sourceSha256:hash(bytes),sourceSize:[meta.width,meta.height],sourceAlpha:alpha,runtime,runtimeSha256:hash(rendered),size:[768,768],runtimeAlpha:await measure(rendered),footAnchor:{x:(48+(672-meta.width*scale)/2+foot.x*scale)/768,y:(48+(672-meta.height*scale)/2+foot.y*scale)/768},releaseEnabled:false};
 const weaponBytes=await fs.readFile(path(input.weapon)),wm=await sharp(weaponBytes).metadata(),wa=await measure(weaponBytes),wp=input.weaponAnchorSource;
 if(!wm.hasAlpha||wm.width<1024||wm.height<1024||wa.transparentFraction<.1||wa.edgeMax>12)throw Error('Weapon requires native transparent alpha and unclipped edges');
 if(!Number.isFinite(wp.x)||!Number.isFinite(wp.y)||wp.x<0||wp.x>wm.width||wp.y<0||wp.y>wm.height)throw Error('Invalid weapon anchor');
 const wr=await sharp(weaponBytes).resize(672,672,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer(),ws=672/Math.max(wm.width,wm.height),weaponRuntime='assets/autonomous-weapon.webp';await save(weaponRuntime,wr);
 manifest.weapon={id:'diim-autonomous-weapon-preparation',name:'자율 병기',visualConcept:'캔디 자동포탑',source:input.weapon,sourceSha256:hash(weaponBytes),sourceSize:[wm.width,wm.height],sourceAlpha:wa,runtime:weaponRuntime,runtimeSha256:hash(wr),size:[768,768],runtimeAlpha:await measure(wr),anchor:{x:(48+(672-wm.width*ws)/2+wp.x*ws)/768,y:(48+(672-wm.height*ws)/2+wp.y*ws)/768},muzzleSource:input.weaponMuzzleSource||null,muzzle:input.weaponMuzzleSource?{x:(48+(672-wm.width*ws)/2+input.weaponMuzzleSource.x*ws)/768,y:(48+(672-wm.height*ws)/2+input.weaponMuzzleSource.y*ws)/768}:null,releaseEnabled:false};
 const source=await fs.readFile(path(input.fx)),m=await sharp(source).metadata(),sourceAlpha=await measure(source);
 if(!m.hasAlpha||m.width!==m.height||m.width<1024||m.width>1536||sourceAlpha.transparentFraction<.1)throw Error('FX requires 1024–1536 square native transparent 4x4 source');
 const cellSize=384,atlasPixels=Buffer.alloc(1536*1536*4),frames=[];
 for(let i=0;i<16;i++){
  const col=i%4,row=Math.floor(i/4),left=Math.round(col*m.width/4),top=Math.round(row*m.height/4),width=Math.round((col+1)*m.width/4)-left,height=Math.round((row+1)*m.height/4)-top;
  const raw=await sharp(source).extract({left,top,width,height}).ensureAlpha().raw().toBuffer(),qa=inspect(raw,width,height);
  if(qa.edgeMax>12||!qa.nonempty)throw Error(`FX frame ${i+1}: clipped edge or empty cell (${qa.edgeMax})`);
  const px=Math.floor((cellSize-width)/2),py=Math.floor((cellSize-height)/2),tile=await sharp(raw,{raw:{width,height,channels:4}}).extend({left:px,top:py,right:cellSize-width-px,bottom:cellSize-height-py,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer(),file=`assets/fx/frames/${String(i).padStart(2,'0')}.webp`;await save(file,tile);
  const decoded=await sharp(tile).ensureAlpha().raw().toBuffer();for(let y=0;y<cellSize;y++)decoded.copy(atlasPixels,((row*cellSize+y)*1536+col*cellSize)*4,y*cellSize*4,(y+1)*cellSize*4);
  frames.push({index:i,file,sha256:hash(tile),rawSha256:hash(raw),sourceRect:{left,top,width,height},...qa});
 }
 if(new Set(frames.map(f=>f.rawSha256)).size!==16)throw Error('Repeated source FX frames');
 const atlas=await sharp(atlasPixels,{raw:{width:1536,height:1536,channels:4}}).webp({lossless:true,effort:6}).toBuffer(),runtimeFx='assets/fx/atlas.webp';await save(runtimeFx,atlas);
 manifest.effect={id:'autonomous-weapon',name:'자율 병기',kind:'SKILL',source:input.fx,sourceSha256:hash(source),sourceSize:[m.width,m.height],sourceAlpha,runtime:runtimeFx,runtimeSha256:hash(atlas),columns:4,rows:4,cellSize,frameCount:16,duration:input.duration,collisionFrame:input.collisionFrame,contactAt:input.duration*input.collisionFrame/15,frames,releaseEnabled:false};
 manifest.status='BUILT_VISUAL_REVIEW_PENDING';
}
await save('manifest.json',JSON.stringify(manifest,null,2)+'\n');
const result=await build({entryPoints:[fileURLToPath(path('source/preview.js'))],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',write:false,outfile:fileURLToPath(path('preview.bundle.js'))});
await save('preview.bundle.js',result.outputFiles[0].text.replace(/[\t ]+$/gm,''));
await import('./build-fixtures.mjs');
console.log(JSON.stringify({status:manifest.status,missing:manifest.missing,cardId:null,technique:'AUTONOMOUS_WEAPON',releaseEnabled:false}));

import {existsSync} from 'node:fs';
if(existsSync(new URL('final-approval-20261004.json',import.meta.url)))throw Error('Final approved assets are immutable; use the recorded originals.');
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir=fileURLToPath(new URL('./',import.meta.url)),repo=path.resolve(dir,'../..');
const read=async p=>JSON.parse(await fs.readFile(path.join(dir,p),'utf8'));
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex').toUpperCase();
const reg=await read('pose-registration.json');
await fs.mkdir(path.join(dir,'assets/runtime'),{recursive:true});
await fs.mkdir(path.join(dir,'assets/frames'),{recursive:true});
const manifest={version:1,status:'USER_REVIEW_PENDING',liveEnabled:false,acquisitionEnabled:false,deploymentEnabled:false,bodyMotion:'NOT_IN_THIS_IMAGE_DELIVERY',skillAssignments:'UNASSIGNED_VISUAL_DRAFTS',characters:[],aura:null};
const pad=64;
for(const c of reg.characters){
 const out={...c};
 const approved=path.join(repo,c.source);if(await hash(approved)!==c.sourceHash)throw Error('Approved art changed: '+c.id);
 const raw=c.preserveExisting?path.join(repo,c.sprite):path.join(dir,c.sprite);
 if(c.preserveExisting&&await hash(raw)!==c.spriteHash)throw Error('Approved SSS sprite changed');
 const meta=await sharp(raw).metadata();
 if(!meta.hasAlpha)throw Error('SD lacks alpha '+c.id);
 out.originalSprite={url:c.sprite,width:meta.width,height:meta.height,sha256:await hash(raw)};
 if(c.preserveExisting){
   out.sprite=c.sprite;out.spriteWidth=meta.width;out.spriteHeight=meta.height;out.padding=0;
 }else{
   out.sprite='assets/runtime/'+c.id+'-sd.png';out.padding=pad;
   await sharp(raw).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toFile(path.join(dir,out.sprite));
   out.spriteWidth=meta.width+pad*2;out.spriteHeight=meta.height+pad*2;
   for(const k of ['feet','emission','axisBack','auraCenter'])if(out[k])out[k]={x:out[k].x+pad,y:out[k].y+pad};
   out.headTop+=pad;
   out.effects={url:'assets/effects/'+c.id+'-skill-sheet-v1.png',columns:4,rows:3,frames:[]};
   const fx=path.join(dir,out.effects.url),fm=await sharp(fx).metadata();if(!fm.hasAlpha||fm.width%4||fm.height%3)throw Error('Invalid effect grid');
   out.effects.width=fm.width;out.effects.height=fm.height;out.effects.sha256=await hash(fx);
   const cw=fm.width/4,ch=fm.height/3;
   for(let i=0;i<12;i++){
     const x=i%4*cw,y=Math.floor(i/4)*ch,url='assets/frames/'+c.id+'-'+String(i+1).padStart(2,'0')+'.png';
     await sharp(fx).extract({left:x,top:y,width:cw,height:ch}).png().toFile(path.join(dir,url));
     // Anchor is the painted bright origin, not the transparent cell's edge.
     const role=i<4?'charge':i<8?'release':'impact';
     const sourceAnchors=c.id==='orikkung'?[.17,.17,.17,.17]:c.id==='ines'?[.25,.25,.25,.25]:[.23,.20,.16,.13];
     const origin={x:role==='release'?sourceAnchors[i-4]*cw:cw*.5,y:ch*.5};
     out.effects.frames.push({index:i,role,url,rect:{x,y,width:cw,height:ch},origin,sha256:await hash(path.join(dir,url))});
   }
 }
 out.spriteSha256=await hash(path.join(out.sprite.startsWith('/')?repo:dir,out.sprite));
 if(out.emission){const dx=out.emission.x-out.axisBack.x,dy=out.emission.y-out.axisBack.y,length=Math.hypot(dx,dy);out.direction={x:dx/length,y:dy/length};out.angle=Math.atan2(dy,dx);}
 out.bodyHeight=out.feet.y-out.headTop;
 manifest.characters.push(out);
}
const aura='assets/aura/limited-rear-aura-sheet-v1.png',am=await sharp(path.join(dir,aura)).metadata();
if(!am.hasAlpha)throw Error('Aura lacks alpha');
manifest.aura={url:aura,columns:4,rows:2,width:am.width,height:am.height,loopSeconds:2.4,sha256:await hash(path.join(dir,aura)),frames:[]};
for(let i=0;i<8;i++){
 const col=i%4,row=Math.floor(i/4),x=Math.round(col*am.width/4),y=Math.round(row*am.height/2);
 manifest.aura.frames.push({rect:{x,y,width:Math.round((col+1)*am.width/4)-x,height:Math.round((row+1)*am.height/2)-y}});
}
const firstAura=manifest.aura.frames[0].rect;
await sharp(path.join(dir,aura)).extract({left:firstAura.x,top:firstAura.y,width:firstAura.width,height:firstAura.height}).png().toFile(path.join(dir,'assets/aura/limited-rear-aura-frame.png'));
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sprites:5,preservedExistingSSS:1,skillSheets:5,individualEffectFrames:60,auraFrames:8,liveEnabled:false}));

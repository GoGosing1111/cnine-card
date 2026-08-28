#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PREVIEW_ROOT=path.join(ROOT,'preview','project-v-v3-event-fx-v1');
const SOURCE_ROOT=path.join(PREVIEW_ROOT,'assets','source');
const FRAME_ROOT=path.join(PREVIEW_ROOT,'assets','frames');
const ATLAS_ROOT=path.join(PREVIEW_ROOT,'assets','atlases');
const FRAME_SIZE=512;
const ATLAS_COLUMNS=4;
const ATLAS_ROWS=3;
const FRAME_COUNT=12;

const EFFECTS=[
  {id:'critical',label:'CRITICAL HIT',labelKo:'치명타',fps:24,collisionFrame:6,mode:'radial',origin:[.5,.56],seed:11},
  {id:'counter',label:'COUNTER EDGE',labelKo:'반격',fps:20,collisionFrame:6,mode:'radial',origin:[.5,.54],seed:23},
  {id:'ultimate',label:'ROYAL ULTIMATE',labelKo:'궁극기',fps:18,collisionFrame:6,mode:'bottom-burst',origin:[.5,.88],seed:37},
  {id:'boss-ultimate',label:'BOSS CALAMITY',labelKo:'보스 궁극기',fps:17,collisionFrame:6,mode:'top-crush',origin:[.5,.9],seed:47},
  {id:'dodge',label:'PHANTOM DODGE',labelKo:'회피',fps:28,collisionFrame:5,mode:'diagonal',origin:[.34,.7],seed:59},
  {id:'revive',label:'LAST STAND',labelKo:'불굴 · 부활',fps:18,collisionFrame:6,mode:'bottom-rise',origin:[.5,.9],seed:71}
];

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smoothstep=(edge0,edge1,value)=>{
  const t=clamp((value-edge0)/(edge1-edge0||1));
  return t*t*(3-2*t);
};

function scalarHash(x,y,seed){
  let value=Math.imul((x|0)^Math.imul(seed,374761393),(y|0)^668265263);
  value=Math.imul(value^(value>>>13),1274126177);
  return ((value^(value>>>16))>>>0)/4294967295;
}

function valueNoise(x,y,seed,cell){
  const gx=x/cell,gy=y/cell;
  const x0=Math.floor(gx),y0=Math.floor(gy);
  const tx=smoothstep(0,1,gx-x0),ty=smoothstep(0,1,gy-y0);
  const top=scalarHash(x0,y0,seed)*(1-tx)+scalarHash(x0+1,y0,seed)*tx;
  const bottom=scalarHash(x0,y0+1,seed)*(1-tx)+scalarHash(x0+1,y0+1,seed)*tx;
  return top*(1-ty)+bottom*ty;
}

function hashNoise(x,y,seed){
  const angle=(seed%17)*.071;
  const rotatedX=x*Math.cos(angle)-y*Math.sin(angle);
  const rotatedY=x*Math.sin(angle)+y*Math.cos(angle);
  return clamp(valueNoise(rotatedX,rotatedY,seed,24)*.62+valueNoise(rotatedX,rotatedY,seed+91,9)*.38);
}

function revealFor(effect,u,v,progress){
  const [ox,oy]=effect.origin;
  const dx=u-ox;
  const dy=v-oy;
  if(effect.mode==='diagonal'){
    const score=clamp((u+(1-v))*.5);
    return 1-smoothstep(progress-.02,progress+.14,score);
  }
  if(effect.mode==='top-crush'){
    const beam=1-smoothstep(.04,.28,Math.abs(dx));
    const downward=1-smoothstep(progress-.04,progress+.12,v);
    const groundBurst=smoothstep(.54,.92,progress)*(1-smoothstep(progress*.9,progress*1.18,Math.hypot(dx*.72,dy)));
    return clamp(Math.max(downward*(.45+.55*beam),groundBurst));
  }
  if(effect.mode==='bottom-rise'){
    const rise=smoothstep(1-progress-.12,1-progress+.06,v);
    const core=1-smoothstep(progress*.72,progress*.98,Math.hypot(dx*.78,dy));
    return clamp(Math.max(rise,core*.72));
  }
  const distance=Math.hypot(dx*(effect.mode==='bottom-burst'?.78:1),dy);
  return 1-smoothstep(progress*.78,progress*.98,distance);
}

async function transparentPeak(sourcePath){
  const {data,info}=await sharp(sourcePath)
    .resize(FRAME_SIZE,FRAME_SIZE,{fit:'contain',background:{r:0,g:0,b:0,alpha:1}})
    .removeAlpha()
    .raw()
    .toBuffer({resolveWithObject:true});
  const output=Buffer.alloc(info.width*info.height*4);
  for(let i=0,j=0;i<data.length;i+=3,j+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    const peak=Math.max(r,g,b);
    if(peak<=2){
      output[j]=0;output[j+1]=0;output[j+2]=0;output[j+3]=0;
      continue;
    }
    const alpha=Math.round(255*Math.pow(clamp((peak-2)/253),.82));
    const lift=255/peak;
    output[j]=Math.round(clamp(r*lift,0,255));
    output[j+1]=Math.round(clamp(g*lift,0,255));
    output[j+2]=Math.round(clamp(b*lift,0,255));
    output[j+3]=alpha;
  }
  return output;
}

function sampleNearest(source,x,y){
  const sx=Math.round(x),sy=Math.round(y);
  if(sx<0||sy<0||sx>=FRAME_SIZE||sy>=FRAME_SIZE)return [0,0,0,0];
  const offset=(sy*FRAME_SIZE+sx)*4;
  return [source[offset],source[offset+1],source[offset+2],source[offset+3]];
}

function frameTransform(effect,frame){
  const pre=frame<=effect.collisionFrame;
  const growth=clamp((frame+1)/(effect.collisionFrame+1));
  const decay=pre?0:clamp((frame-effect.collisionFrame)/(FRAME_COUNT-1-effect.collisionFrame));
  const eased=1-Math.pow(1-growth,2.15);
  const scale=pre?.28+eased*.75:1.03+decay*.22;
  let shiftX=0,shiftY=0;
  if(effect.mode==='diagonal'){
    shiftX=pre?-76*(1-eased):decay*34;
    shiftY=pre?66*(1-eased):-decay*30;
  }else if(effect.mode==='bottom-rise'){
    shiftY=pre?72*(1-eased):-decay*40;
  }else if(effect.mode==='top-crush'){
    shiftY=pre?-66*(1-eased):decay*18;
  }else if(effect.mode==='bottom-burst'){
    shiftY=pre?48*(1-eased):-decay*20;
  }
  return {pre,growth,eased,decay,scale,shiftX,shiftY};
}

function makeFrame(source,effect,frame){
  const output=Buffer.alloc(FRAME_SIZE*FRAME_SIZE*4);
  const transform=frameTransform(effect,frame);
  const [ox,oy]=effect.origin;
  const centerX=ox*FRAME_SIZE;
  const centerY=oy*FRAME_SIZE;
  const opacity=transform.pre?.24+transform.eased*.76:Math.pow(1-transform.decay,.86)*.92;
  const threshold=transform.pre?(1-transform.eased)*118:0;
  const collisionGlow=Math.max(0,1-Math.abs(frame-effect.collisionFrame)/1.65);

  for(let y=0;y<FRAME_SIZE;y+=1){
    for(let x=0;x<FRAME_SIZE;x+=1){
      const sx=(x-centerX-transform.shiftX)/transform.scale+centerX;
      const sy=(y-centerY-transform.shiftY)/transform.scale+centerY;
      let [r,g,b,a]=sampleNearest(source,sx,sy);
      if(a<=threshold)continue;
      const u=sx/FRAME_SIZE,v=sy/FRAME_SIZE;
      const reveal=transform.pre?revealFor(effect,u,v,transform.eased):1;
      if(reveal<=.002)continue;

      let fragment=1;
      if(!transform.pre){
        const noise=hashNoise(x,y,effect.seed);
        const thresholdNoise=transform.decay*.72-.08;
        fragment=smoothstep(thresholdNoise,thresholdNoise+.24,noise);
      }
      const edgeFade=1-smoothstep(.82,1.02,Math.hypot((x-centerX)/(FRAME_SIZE*.72),(y-centerY)/(FRAME_SIZE*.72)));
      const alpha=clamp((a/255)*opacity*reveal*fragment*edgeFade);
      if(alpha<=.002)continue;
      const heat=collisionGlow*Math.pow(a/255,1.8)*.34;
      r=Math.round(r+(255-r)*heat);
      g=Math.round(g+(255-g)*heat);
      b=Math.round(b+(255-b)*heat);
      const offset=(y*FRAME_SIZE+x)*4;
      output[offset]=r;
      output[offset+1]=g;
      output[offset+2]=b;
      output[offset+3]=Math.round(alpha*255);
    }
  }
  return output;
}

async function renderFrame(raw,effect,frame){
  const base=sharp(raw,{raw:{width:FRAME_SIZE,height:FRAME_SIZE,channels:4}}).png({compressionLevel:9,adaptiveFiltering:true});
  const baseBuffer=await base.toBuffer();
  const bloomAlpha=frame===effect.collisionFrame?.48:frame<effect.collisionFrame?.23:.3;
  const bloom=await sharp(baseBuffer).blur(frame===effect.collisionFrame?5.2:3.6).modulate({brightness:1.08,saturation:1.05}).png().toBuffer();
  return sharp({create:{width:FRAME_SIZE,height:FRAME_SIZE,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:bloom,blend:'screen',opacity:bloomAlpha},{input:baseBuffer,blend:'over'}])
    .png({compressionLevel:9,adaptiveFiltering:true})
    .toBuffer();
}

function atlasJson(effect){
  const frames={};
  const animation=[];
  for(let index=0;index<FRAME_COUNT;index+=1){
    const name=`${effect.id}_${String(index).padStart(2,'0')}.png`;
    const x=(index%ATLAS_COLUMNS)*FRAME_SIZE;
    const y=Math.floor(index/ATLAS_COLUMNS)*FRAME_SIZE;
    frames[name]={
      frame:{x,y,w:FRAME_SIZE,h:FRAME_SIZE},
      rotated:false,
      trimmed:false,
      spriteSourceSize:{x:0,y:0,w:FRAME_SIZE,h:FRAME_SIZE},
      sourceSize:{w:FRAME_SIZE,h:FRAME_SIZE}
    };
    animation.push(name);
  }
  return {
    frames,
    animations:{impact:animation},
    meta:{
      app:'cnine-card-v3-event-fx-preview',
      version:'1.0.0',
      image:`${effect.id}-atlas-v1.png`,
      format:'RGBA8888',
      size:{w:FRAME_SIZE*ATLAS_COLUMNS,h:FRAME_SIZE*ATLAS_ROWS},
      scale:'1',
      fps:effect.fps,
      collisionFrame:effect.collisionFrame,
      alpha:true,
      previewOnly:true
    }
  };
}

async function buildEffect(effect){
  const sourcePath=path.join(SOURCE_ROOT,`${effect.id}-source-v1.png`);
  const frameDirectory=path.join(FRAME_ROOT,effect.id);
  await fs.mkdir(frameDirectory,{recursive:true});
  const transparent=await transparentPeak(sourcePath);
  const frames=[];
  for(let index=0;index<FRAME_COUNT;index+=1){
    const raw=makeFrame(transparent,effect,index);
    const png=await renderFrame(raw,effect,index);
    const name=`${effect.id}-${String(index).padStart(2,'0')}.png`;
    await fs.writeFile(path.join(frameDirectory,name),png);
    frames.push(png);
  }
  const atlas=await sharp({create:{
    width:FRAME_SIZE*ATLAS_COLUMNS,
    height:FRAME_SIZE*ATLAS_ROWS,
    channels:4,
    background:{r:0,g:0,b:0,alpha:0}
  }}).composite(frames.map((input,index)=>({
    input,
    left:(index%ATLAS_COLUMNS)*FRAME_SIZE,
    top:Math.floor(index/ATLAS_COLUMNS)*FRAME_SIZE
  }))).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  await fs.writeFile(path.join(ATLAS_ROOT,`${effect.id}-atlas-v1.png`),atlas);
  await fs.writeFile(path.join(ATLAS_ROOT,`${effect.id}-atlas-v1.json`),JSON.stringify(atlasJson(effect),null,2));
  return {...effect,frameSize:FRAME_SIZE,frameCount:FRAME_COUNT,atlasColumns:ATLAS_COLUMNS,atlasRows:ATLAS_ROWS};
}

async function main(){
  await fs.mkdir(FRAME_ROOT,{recursive:true});
  await fs.mkdir(ATLAS_ROOT,{recursive:true});
  const effects=[];
  for(const effect of EFFECTS){
    effects.push(await buildEffect(effect));
    process.stdout.write(`generated ${effect.id}: ${FRAME_COUNT} frames\n`);
  }
  const manifest={
    version:'project-v-v3-event-fx-preview-v1',
    previewOnly:true,
    runtimeConnected:false,
    generatedAt:'2026-08-28',
    renderer:'canvas-atlas',
    frameContract:{count:FRAME_COUNT,width:FRAME_SIZE,height:FRAME_SIZE,layout:'4x3',alpha:true},
    forbiddenMotifs:['circle','magic-ring','rune','diamond','star'],
    effects:effects.map(effect=>({
      id:effect.id,
      label:effect.label,
      labelKo:effect.labelKo,
      fps:effect.fps,
      collisionFrame:effect.collisionFrame,
      frameCount:effect.frameCount,
      frameSize:effect.frameSize,
      atlasColumns:effect.atlasColumns,
      atlasRows:effect.atlasRows,
      atlas:`assets/atlases/${effect.id}-atlas-v1.png`,
      atlasData:`assets/atlases/${effect.id}-atlas-v1.json`,
      framePattern:`assets/frames/${effect.id}/${effect.id}-%02d.png`,
      audio:`assets/audio/${effect.id}.mp3`,
      waveform:`assets/audio/${effect.id}-waveform.svg`
    }))
  };
  await fs.writeFile(path.join(PREVIEW_ROOT,'manifest.json'),JSON.stringify(manifest,null,2));
}

await main();

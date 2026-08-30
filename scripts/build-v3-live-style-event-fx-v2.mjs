#!/usr/bin/env node

import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const SCRIPT_PATH=fileURLToPath(import.meta.url);
const ROOT=path.resolve(path.dirname(SCRIPT_PATH),'..');
const PREVIEW_ROOT=path.join(ROOT,'preview','project-v-v3-live-style-event-fx-v2');
const DEFAULT_SOURCE_ROOT=path.join(PREVIEW_ROOT,'assets','source-sheets');
const DEFAULT_OUTPUT_ROOT=path.join(PREVIEW_ROOT,'assets','atlases');

const ATLAS_COLUMNS=4;
const ATLAS_ROWS=3;
const FRAME_COUNT=ATLAS_COLUMNS*ATLAS_ROWS;
const FRAME_WIDTH=512;
const FRAME_HEIGHT=455;
const ATLAS_WIDTH=FRAME_WIDTH*ATLAS_COLUMNS;
const ATLAS_HEIGHT=FRAME_HEIGHT*ATLAS_ROWS;
const PNG_OPTIONS={compressionLevel:9,adaptiveFiltering:true,palette:false,force:true};

const EFFECTS=Object.freeze([
  Object.freeze({id:'critical',label:'CRITICAL HIT',labelKo:'치명타',fps:24,collisionFrame:6,anchors:{x:.5,y:.56}}),
  Object.freeze({id:'counter',label:'COUNTER EDGE',labelKo:'반격',fps:20,collisionFrame:6,anchors:{x:.5,y:.54}}),
  Object.freeze({id:'ultimate',label:'ROYAL ULTIMATE',labelKo:'궁극기',fps:18,collisionFrame:6,anchors:{x:.5,y:.88}}),
  Object.freeze({id:'boss-ultimate',label:'BOSS CALAMITY',labelKo:'보스 궁극기',fps:17,collisionFrame:6,anchors:{x:.5,y:.9}}),
  Object.freeze({id:'dodge',label:'PHANTOM DODGE',labelKo:'회피',fps:28,collisionFrame:5,anchors:{x:.34,y:.7}}),
  Object.freeze({id:'revive',label:'LAST STAND',labelKo:'불굴 · 부활',fps:18,collisionFrame:6,anchors:{x:.5,y:.9}})
]);
const EFFECT_BY_ID=new Map(EFFECTS.map(effect=>[effect.id,effect]));

const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const frameName=(id,index)=>`${id}_${String(index).padStart(2,'0')}.png`;
const sourceName=id=>`${id}-sheet-v2.png`;
const atlasBaseName=id=>`${id}-impact-atlas-v2`;

function usage(){
  return `Build normalized PROJECT V V3 live-style event FX atlases.

Usage:
  node scripts/build-v3-live-style-event-fx-v2.mjs [options]

Options:
  --effect <id[,id...]>  Build only selected effects (repeatable).
  --source-root <path>   Override source-sheets directory.
  --output-root <path>   Override atlas output directory.
  --self-test            Exercise the full pipeline in an OS temp directory.
  --help                 Show this help.

Effects: ${EFFECTS.map(effect=>effect.id).join(', ')}

Default input:
  preview/project-v-v3-live-style-event-fx-v2/assets/source-sheets/<id>-sheet-v2.png
Default output:
  preview/project-v-v3-live-style-event-fx-v2/assets/atlases/<id>-impact-atlas-v2.png|json`;
}

function optionValue(argv,index,inlineValue,name){
  if(inlineValue!==undefined)return {value:inlineValue,nextIndex:index};
  const value=argv[index+1];
  if(!value||value.startsWith('--'))throw new Error(`${name} 옵션 값이 필요합니다.`);
  return {value,nextIndex:index+1};
}

function parseArgs(argv=process.argv.slice(2)){
  const selected=[];
  let sourceRoot=DEFAULT_SOURCE_ROOT;
  let outputRoot=DEFAULT_OUTPUT_ROOT;
  let selfTest=false;
  let help=false;
  for(let index=0;index<argv.length;index+=1){
    const token=argv[index];
    if(token==='--help'||token==='-h'){help=true;continue}
    if(token==='--self-test'){selfTest=true;continue}
    const [name,inlineValue]=token.split(/=(.*)/s,2);
    if(name==='--effect'){
      const option=optionValue(argv,index,inlineValue,name);index=option.nextIndex;
      selected.push(...option.value.split(',').map(value=>value.trim()).filter(Boolean));
      continue;
    }
    if(name==='--source-root'){
      const option=optionValue(argv,index,inlineValue,name);index=option.nextIndex;
      sourceRoot=path.resolve(process.cwd(),option.value);continue;
    }
    if(name==='--output-root'){
      const option=optionValue(argv,index,inlineValue,name);index=option.nextIndex;
      outputRoot=path.resolve(process.cwd(),option.value);continue;
    }
    throw new Error(`지원하지 않는 옵션입니다: ${token}`);
  }
  const ids=selected.length?[...new Set(selected)]:EFFECTS.map(effect=>effect.id);
  const unknown=ids.filter(id=>!EFFECT_BY_ID.has(id));
  if(unknown.length)throw new Error(`알 수 없는 이벤트 이펙트 ID: ${unknown.join(', ')}`);
  return {effects:ids.map(id=>EFFECT_BY_ID.get(id)),sourceRoot,outputRoot,selfTest,help};
}

async function fileExists(file){
  try{const stat=await fs.stat(file);return stat.isFile()}catch{return false}
}

function centeredGridCrop(width,height){
  const cropWidth=width-(width%ATLAS_COLUMNS);
  const cropHeight=height-(height%ATLAS_ROWS);
  if(cropWidth<ATLAS_COLUMNS||cropHeight<ATLAS_ROWS)throw new Error(`시트가 ${ATLAS_COLUMNS}x${ATLAS_ROWS} 그리드보다 작습니다: ${width}x${height}`);
  return {
    left:Math.floor((width-cropWidth)/2),
    top:Math.floor((height-cropHeight)/2),
    width:cropWidth,
    height:cropHeight,
    cellWidth:cropWidth/ATLAS_COLUMNS,
    cellHeight:cropHeight/ATLAS_ROWS
  };
}

function rgbaMetrics(data,info){
  if(info.channels!==4)throw new Error(`RGBA 분석에 4채널이 필요합니다. 현재 ${info.channels}채널입니다.`);
  const totalPixels=info.width*info.height;
  let transparentPixels=0,translucentPixels=0,visiblePixels=0,minAlpha=255,maxAlpha=0;
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
  for(let pixel=0,offset=3;pixel<totalPixels;pixel+=1,offset+=4){
    const alpha=data[offset];
    minAlpha=Math.min(minAlpha,alpha);maxAlpha=Math.max(maxAlpha,alpha);
    if(alpha===0){transparentPixels+=1;continue}
    visiblePixels+=1;if(alpha<255)translucentPixels+=1;
    const x=pixel%info.width,y=Math.floor(pixel/info.width);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return {
    minAlpha,maxAlpha,totalPixels,transparentPixels,translucentPixels,visiblePixels,
    transparentRatio:Number((transparentPixels/totalPixels).toFixed(8)),
    visibleRatio:Number((visiblePixels/totalPixels).toFixed(8)),
    visibleBounds:visiblePixels?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null
  };
}

async function inspectRgba(input){
  const {data,info}=await sharp(input,{limitInputPixels:100_000_000})
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({resolveWithObject:true});
  return {info,metrics:rgbaMetrics(data,info)};
}

async function validateSource(sourcePath){
  const input=await fs.readFile(sourcePath);
  const metadata=await sharp(input,{limitInputPixels:100_000_000}).metadata();
  if(metadata.format!=='png')throw new Error(`${path.basename(sourcePath)}: PNG 입력만 지원합니다.`);
  if(!metadata.width||!metadata.height)throw new Error(`${path.basename(sourcePath)}: 이미지 크기를 읽지 못했습니다.`);
  if(metadata.hasAlpha!==true)throw new Error(`${path.basename(sourcePath)}: 투명 알파 채널이 없는 이미지입니다.`);
  const analysis=await inspectRgba(input);
  if(analysis.metrics.maxAlpha===0)throw new Error(`${path.basename(sourcePath)}: 모든 픽셀이 완전 투명합니다.`);
  if(analysis.metrics.transparentPixels===0&&analysis.metrics.translucentPixels===0){
    throw new Error(`${path.basename(sourcePath)}: 투명 배경이 확인되지 않습니다. RGBA 투명 시트를 사용하세요.`);
  }
  return {
    input,
    metadata,
    crop:centeredGridCrop(metadata.width,metadata.height),
    alpha:analysis.metrics,
    hash:sha256(input)
  };
}

async function normalizeFrame(sourceInput,crop,index){
  const column=index%ATLAS_COLUMNS,row=Math.floor(index/ATLAS_COLUMNS);
  const extract={
    left:crop.left+column*crop.cellWidth,
    top:crop.top+row*crop.cellHeight,
    width:crop.cellWidth,
    height:crop.cellHeight
  };
  const png=await sharp(sourceInput,{limitInputPixels:100_000_000})
    .extract(extract)
    .resize(FRAME_WIDTH,FRAME_HEIGHT,{fit:'fill',kernel:sharp.kernel.lanczos3})
    .ensureAlpha()
    .toColourspace('srgb')
    .png(PNG_OPTIONS)
    .toBuffer();
  const {info,metrics}=await inspectRgba(png);
  if(info.width!==FRAME_WIDTH||info.height!==FRAME_HEIGHT||info.channels!==4){
    throw new Error(`프레임 ${index}: ${FRAME_WIDTH}x${FRAME_HEIGHT} RGBA 정규화에 실패했습니다.`);
  }
  return {png,extract,metrics,hash:sha256(png)};
}

function atlasJson(effect,{source,frames,atlasHash,atlasAlpha,generatedAt}){
  const duration=Math.round(1000/effect.fps);
  const frameData={};
  const animation=[];
  for(let index=0;index<FRAME_COUNT;index+=1){
    const name=frameName(effect.id,index);
    frameData[name]={
      frame:{
        x:(index%ATLAS_COLUMNS)*FRAME_WIDTH,
        y:Math.floor(index/ATLAS_COLUMNS)*FRAME_HEIGHT,
        w:FRAME_WIDTH,
        h:FRAME_HEIGHT
      },
      rotated:false,
      trimmed:false,
      spriteSourceSize:{x:0,y:0,w:FRAME_WIDTH,h:FRAME_HEIGHT},
      sourceSize:{w:FRAME_WIDTH,h:FRAME_HEIGHT},
      duration
    };
    animation.push(name);
  }
  return {
    frames:frameData,
    animations:{impact:animation},
    meta:{
      app:'PROJECT V V3 LIVE STYLE EVENT FX ATLAS BUILDER',
      version:'2.0.0',
      image:`${atlasBaseName(effect.id)}.png`,
      format:'RGBA8888',
      size:{w:ATLAS_WIDTH,h:ATLAS_HEIGHT},
      scale:'1',
      effect:effect.id,
      label:effect.label,
      labelKo:effect.labelKo,
      fps:effect.fps,
      frameDurationMs:duration,
      durationMs:duration*FRAME_COUNT,
      collisionFrame:effect.collisionFrame,
      collisionHookMs:Math.round(effect.collisionFrame*1000/effect.fps),
      anchors:effect.anchors,
      source:sourceName(effect.id),
      sourceSize:{w:source.metadata.width,h:source.metadata.height},
      sourceCrop:{
        x:source.crop.left,y:source.crop.top,w:source.crop.width,h:source.crop.height,
        cellWidth:source.crop.cellWidth,cellHeight:source.crop.cellHeight
      },
      layout:{columns:ATLAS_COLUMNS,rows:ATLAS_ROWS,frameCount:FRAME_COUNT,frameWidth:FRAME_WIDTH,frameHeight:FRAME_HEIGHT},
      alpha:{required:true,source:source.alpha,atlas:atlasAlpha},
      hashes:{
        algorithm:'sha256',
        source:source.hash,
        atlas:atlasHash,
        frames:Object.fromEntries(frames.map((frame,index)=>[frameName(effect.id,index),frame.hash]))
      },
      generatedAt
    }
  };
}

async function buildEffect(effect,{sourceRoot=DEFAULT_SOURCE_ROOT,outputRoot=DEFAULT_OUTPUT_ROOT,generatedAt=new Date().toISOString()}={}){
  const sourcePath=path.join(sourceRoot,sourceName(effect.id));
  if(!await fileExists(sourcePath))throw new Error(`입력 시트가 없습니다: ${sourcePath}`);
  const source=await validateSource(sourcePath);
  const frames=[];
  for(let index=0;index<FRAME_COUNT;index+=1)frames.push(await normalizeFrame(source.input,source.crop,index));

  const atlas=await sharp({create:{
    width:ATLAS_WIDTH,
    height:ATLAS_HEIGHT,
    channels:4,
    background:{r:0,g:0,b:0,alpha:0}
  }}).composite(frames.map((frame,index)=>( {
    input:frame.png,
    left:(index%ATLAS_COLUMNS)*FRAME_WIDTH,
    top:Math.floor(index/ATLAS_COLUMNS)*FRAME_HEIGHT,
    blend:'over'
  }))).png(PNG_OPTIONS).toBuffer();
  const atlasInspection=await inspectRgba(atlas);
  if(atlasInspection.info.width!==ATLAS_WIDTH||atlasInspection.info.height!==ATLAS_HEIGHT||atlasInspection.info.channels!==4){
    throw new Error(`${effect.id}: ${ATLAS_WIDTH}x${ATLAS_HEIGHT} RGBA atlas 검증에 실패했습니다.`);
  }
  const atlasHash=sha256(atlas);
  const json=atlasJson(effect,{source,frames,atlasHash,atlasAlpha:atlasInspection.metrics,generatedAt});
  const jsonBuffer=Buffer.from(`${JSON.stringify(json,null,2)}\n`,'utf8');
  const pngPath=path.join(outputRoot,`${atlasBaseName(effect.id)}.png`);
  const jsonPath=path.join(outputRoot,`${atlasBaseName(effect.id)}.json`);
  await fs.mkdir(outputRoot,{recursive:true});
  await Promise.all([fs.writeFile(pngPath,atlas),fs.writeFile(jsonPath,jsonBuffer)]);

  const [writtenPng,writtenJson]=await Promise.all([fs.readFile(pngPath),fs.readFile(jsonPath,'utf8')]);
  const parsed=JSON.parse(writtenJson);
  if(sha256(writtenPng)!==parsed.meta.hashes.atlas)throw new Error(`${effect.id}: 기록된 atlas SHA-256 검증에 실패했습니다.`);
  if(Object.keys(parsed.frames).length!==FRAME_COUNT||parsed.animations?.impact?.length!==FRAME_COUNT){
    throw new Error(`${effect.id}: Pixi spritesheet 12프레임 계약 검증에 실패했습니다.`);
  }
  return {
    id:effect.id,
    source:sourcePath,
    sourceSize:`${source.metadata.width}x${source.metadata.height}`,
    sourceCrop:`${source.crop.width}x${source.crop.height}`,
    sourceSha256:source.hash,
    atlas:pngPath,
    atlasData:jsonPath,
    atlasSha256:atlasHash,
    atlasSize:`${ATLAS_WIDTH}x${ATLAS_HEIGHT}`,
    frameSize:`${FRAME_WIDTH}x${FRAME_HEIGHT}`,
    frameCount:FRAME_COUNT,
    fps:effect.fps,
    collisionFrame:effect.collisionFrame,
    anchors:effect.anchors
  };
}

async function preflightSources(effects,sourceRoot){
  const checks=await Promise.all(effects.map(async effect=>({effect,path:path.join(sourceRoot,sourceName(effect.id)),exists:await fileExists(path.join(sourceRoot,sourceName(effect.id)))})));
  const missing=checks.filter(check=>!check.exists);
  if(missing.length)throw new Error(`입력 시트가 없습니다:\n${missing.map(check=>`- ${check.path}`).join('\n')}`);
}

async function createSelfTestSheet(file){
  const width=1536,height=1024,cellWidth=width/ATLAS_COLUMNS,cellHeight=341;
  const blocks=[];
  for(let index=0;index<FRAME_COUNT;index+=1){
    const blockWidth=180+(index%4)*22,blockHeight=120+Math.floor(index/4)*24;
    const block=await sharp({create:{
      width:blockWidth,height:blockHeight,channels:4,
      background:{r:60+index*12,g:220-index*8,b:255-index*5,alpha:.72}
    }}).png(PNG_OPTIONS).toBuffer();
    blocks.push({
      input:block,
      left:Math.floor((index%ATLAS_COLUMNS)*cellWidth+(cellWidth-blockWidth)/2),
      top:Math.floor(Math.floor(index/ATLAS_COLUMNS)*cellHeight+(cellHeight-blockHeight)/2)
    });
  }
  await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(blocks)
    .png(PNG_OPTIONS)
    .toFile(file);
}

async function selfTest(){
  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'cnine-v3-event-fx-v2-'));
  const sourceRoot=path.join(tempRoot,'source-sheets'),outputRoot=path.join(tempRoot,'atlases');
  try{
    await fs.mkdir(sourceRoot,{recursive:true});
    await createSelfTestSheet(path.join(sourceRoot,sourceName('critical')));
    const result=await buildEffect(EFFECT_BY_ID.get('critical'),{sourceRoot,outputRoot,generatedAt:'SELF_TEST'});
    const atlas=JSON.parse(await fs.readFile(result.atlasData,'utf8'));
    if(atlas.meta.size.w!==ATLAS_WIDTH||atlas.meta.size.h!==ATLAS_HEIGHT)throw new Error('self-test atlas 크기 불일치');
    if(atlas.meta.sourceCrop.w!==1536||atlas.meta.sourceCrop.h!==1023)throw new Error('self-test 중앙 grid crop 불일치');
    if(atlas.frames['critical_00.png']?.frame?.h!==FRAME_HEIGHT)throw new Error('self-test frame 계약 불일치');
    process.stdout.write(`${JSON.stringify({selfTest:'PASS',...result},null,2)}\n`);
    return result;
  }finally{
    await fs.rm(tempRoot,{recursive:true,force:true});
  }
}

async function main(argv=process.argv.slice(2)){
  const options=parseArgs(argv);
  if(options.help){process.stdout.write(`${usage()}\n`);return []}
  if(options.selfTest)return [await selfTest()];
  await preflightSources(options.effects,options.sourceRoot);
  const generatedAt=new Date().toISOString();
  const results=[];
  for(const effect of options.effects){
    const result=await buildEffect(effect,{sourceRoot:options.sourceRoot,outputRoot:options.outputRoot,generatedAt});
    results.push(result);
    process.stdout.write(`built ${effect.id}: ${result.frameCount}x ${result.frameSize} -> ${result.atlasSize} sha256=${result.atlasSha256}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    version:'project-v-v3-live-style-event-fx-v2',
    generatedAt,
    layout:{columns:ATLAS_COLUMNS,rows:ATLAS_ROWS,frameCount:FRAME_COUNT,frameWidth:FRAME_WIDTH,frameHeight:FRAME_HEIGHT,atlasWidth:ATLAS_WIDTH,atlasHeight:ATLAS_HEIGHT},
    effects:results
  },null,2)}\n`);
  return results;
}

const isDirect=Boolean(process.argv[1])&&path.resolve(process.argv[1])===path.resolve(SCRIPT_PATH);
if(isDirect){
  try{await main()}catch(error){
    process.stderr.write(`[build-v3-live-style-event-fx-v2] ${error?.stack||error}\n`);
    process.exitCode=1;
  }
}

export {
  ATLAS_COLUMNS,ATLAS_ROWS,FRAME_COUNT,FRAME_WIDTH,FRAME_HEIGHT,ATLAS_WIDTH,ATLAS_HEIGHT,
  EFFECTS,atlasJson,buildEffect,centeredGridCrop,frameName,main,parseArgs,sha256,validateSource
};

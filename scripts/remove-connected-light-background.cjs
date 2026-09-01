#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');

const [, , inputArg, outputArg]=process.argv;
if(!inputArg||!outputArg){
  console.error('Usage: node scripts/remove-connected-light-background.cjs <input.png> <output.png>');
  process.exit(1);
}

const inputPath=path.resolve(inputArg);
const outputPath=path.resolve(outputArg);

function isConnectedLightPixel(data,offset){
  const red=data[offset];
  const green=data[offset+1];
  const blue=data[offset+2];
  const high=Math.max(red,green,blue);
  const low=Math.min(red,green,blue);
  const luminance=(red+green+blue)/3;
  return high-low<=14&&luminance>=205;
}

function removeConnectedLightBackground(data,width,height){
  const pixelCount=width*height;
  const outside=new Uint8Array(pixelCount);
  const queue=new Uint32Array(pixelCount);
  let readIndex=0;
  let writeIndex=0;

  const enqueue=(x,y)=>{
    const pixelIndex=y*width+x;
    if(outside[pixelIndex]||!isConnectedLightPixel(data,pixelIndex*4))return;
    outside[pixelIndex]=1;
    queue[writeIndex++]=pixelIndex;
  };

  for(let x=0;x<width;x+=1){
    enqueue(x,0);
    enqueue(x,height-1);
  }
  for(let y=1;y<height-1;y+=1){
    enqueue(0,y);
    enqueue(width-1,y);
  }

  while(readIndex<writeIndex){
    const pixelIndex=queue[readIndex++];
    const x=pixelIndex%width;
    const y=Math.floor(pixelIndex/width);
    if(x>0)enqueue(x-1,y);
    if(x+1<width)enqueue(x+1,y);
    if(y>0)enqueue(x,y-1);
    if(y+1<height)enqueue(x,y+1);
  }

  let removedPixels=0;
  for(let pixelIndex=0;pixelIndex<pixelCount;pixelIndex+=1){
    if(!outside[pixelIndex])continue;
    data[pixelIndex*4+3]=0;
    removedPixels+=1;
  }
  return removedPixels;
}

async function main(){
  if(!fs.existsSync(inputPath))throw new Error(`Missing input: ${inputPath}`);
  const {data,info}=await sharp(inputPath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const removedPixels=removeConnectedLightBackground(data,info.width,info.height);
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
    .png({compressionLevel:9,adaptiveFiltering:true})
    .toFile(outputPath);
  console.log(JSON.stringify({input:inputPath,output:outputPath,width:info.width,height:info.height,removedPixels}));
}

main().catch(error=>{
  console.error(error);
  process.exit(1);
});

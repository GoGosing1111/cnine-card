import {Assets, Texture} from 'pixi.js';

export const PART_SHEET_3X3=Object.freeze({
  headFront:{column:0,row:0},
  headSide:{column:1,row:0},
  body:{column:2,row:0},
  leftArm:{column:0,row:1},
  rightArm:{column:1,row:1},
  weapon:{column:2,row:1},
  leftLeg:{column:0,row:2},
  rightLeg:{column:1,row:2},
  accessory:{column:2,row:2}
});

const cache=new Map();

function canvas(width,height){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  const result=document.createElement('canvas');
  result.width=width;
  result.height=height;
  return result;
}

function extractCell(resource,{column,row},sheetWidth,sheetHeight){
  const cellWidth=Math.floor(sheetWidth/3);
  const cellHeight=Math.floor(sheetHeight/3);
  const source=canvas(cellWidth,cellHeight);
  const context=source.getContext('2d',{willReadFrequently:true});
  context.drawImage(resource,column*cellWidth,row*cellHeight,cellWidth,cellHeight,0,0,cellWidth,cellHeight);
  const image=context.getImageData(0,0,cellWidth,cellHeight);
  const pixels=image.data;
  let minX=cellWidth,minY=cellHeight,maxX=0,maxY=0;
  const count=cellWidth*cellHeight;
  const connected=new Uint8Array(count);
  const queue=new Int32Array(count);
  let queueStart=0,queueEnd=0;
  const isBackground=index=>{
    const offset=index*4;
    const red=pixels[offset],green=pixels[offset+1],blue=pixels[offset+2];
    return Math.max(red,green,blue)-Math.min(red,green,blue)<24&&Math.min(red,green,blue)>188;
  };
  const enqueue=index=>{
    if(index<0||index>=count||connected[index]||!isBackground(index))return;
    connected[index]=1;queue[queueEnd++]=index;
  };
  for(let x=0;x<cellWidth;x+=1){enqueue(x);enqueue((cellHeight-1)*cellWidth+x)}
  for(let y=0;y<cellHeight;y+=1){enqueue(y*cellWidth);enqueue(y*cellWidth+cellWidth-1)}
  while(queueStart<queueEnd){
    const index=queue[queueStart++];
    const x=index%cellWidth;
    if(x>0)enqueue(index-1);
    if(x<cellWidth-1)enqueue(index+1);
    if(index>=cellWidth)enqueue(index-cellWidth);
    if(index<count-cellWidth)enqueue(index+cellWidth);
  }
  for(let index=0;index<count;index+=1)if(connected[index])pixels[index*4+3]=0;

  // Image-generation sheets occasionally let a neighbouring cell's cape or
  // weapon cross the grid boundary.  Keep the primary connected subject (and
  // tiny details immediately touching it) so a remote fragment cannot inflate
  // the crop and shrink an arm/leg to a few pixels at runtime.
  const foregroundVisited=new Uint8Array(count);
  const components=[];
  const isForeground=index=>pixels[index*4+3]>18;
  for(let seed=0;seed<count;seed+=1){
    if(foregroundVisited[seed]||!isForeground(seed))continue;
    queueStart=0;queueEnd=0;queue[queueEnd++]=seed;foregroundVisited[seed]=1;
    const indices=[];
    let componentMinX=cellWidth,componentMinY=cellHeight,componentMaxX=0,componentMaxY=0;
    while(queueStart<queueEnd){
      const index=queue[queueStart++];
      indices.push(index);
      const x=index%cellWidth,y=Math.floor(index/cellWidth);
      componentMinX=Math.min(componentMinX,x);componentMinY=Math.min(componentMinY,y);
      componentMaxX=Math.max(componentMaxX,x);componentMaxY=Math.max(componentMaxY,y);
      for(let offsetY=-1;offsetY<=1;offsetY+=1){
        for(let offsetX=-1;offsetX<=1;offsetX+=1){
          if(!offsetX&&!offsetY)continue;
          const nextX=x+offsetX,nextY=y+offsetY;
          if(nextX<0||nextX>=cellWidth||nextY<0||nextY>=cellHeight)continue;
          const next=nextY*cellWidth+nextX;
          if(foregroundVisited[next]||!isForeground(next))continue;
          foregroundVisited[next]=1;queue[queueEnd++]=next;
        }
      }
    }
    components.push({indices,area:indices.length,minX:componentMinX,minY:componentMinY,maxX:componentMaxX,maxY:componentMaxY});
  }
  components.sort((a,b)=>b.area-a.area);
  const primary=components[0];
  const keep=new Uint8Array(count);
  if(primary){
    components.forEach((component,index)=>{
      const gapX=Math.max(0,primary.minX-component.maxX,component.minX-primary.maxX);
      const gapY=Math.max(0,primary.minY-component.maxY,component.minY-primary.maxY);
      if(index===0||(component.area>=Math.max(10,primary.area*.012)&&gapX<=12&&gapY<=12)){
        component.indices.forEach(pixelIndex=>{keep[pixelIndex]=1});
      }
    });
  }
  for(let index=0;index<count;index+=1){
    const offset=index*4;
    if(isForeground(index)&&!keep[index])pixels[offset+3]=0;
    if(pixels[offset+3]<=18)continue;
    const x=index%cellWidth,y=Math.floor(index/cellWidth);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  context.putImageData(image,0,0);
  if(minX>maxX||minY>maxY)return Texture.EMPTY;
  const padding=4;
  minX=Math.max(0,minX-padding);minY=Math.max(0,minY-padding);
  maxX=Math.min(cellWidth-1,maxX+padding);maxY=Math.min(cellHeight-1,maxY+padding);
  const width=maxX-minX+1,height=maxY-minY+1;
  const trimmed=canvas(width,height);
  trimmed.getContext('2d').drawImage(source,minX,minY,width,height,0,0,width,height);
  const texture=Texture.from(trimmed);
  texture.label=`part-${column}-${row}`;
  texture.partMeta={column,row,cellWidth,cellHeight,trim:{x:minX,y:minY,width,height},aspect:width/height};
  return texture;
}

/**
 * Loads the required solid-white 3x3 authoring sheet through PixiJS v8
 * Assets.load(), keys white pixels to alpha, and returns tightly trimmed
 * textures. The original white sheet stays in the project for Photoshop.
 */
export async function loadPartSheet(url,manifest=PART_SHEET_3X3){
  const key=`${url}:${JSON.stringify(manifest)}`;
  if(cache.has(key))return cache.get(key);
  const pending=(async()=>{
    const baseTexture=await Assets.load(url);
    const resource=baseTexture.source?.resource;
    if(!resource)throw new Error(`Part sheet resource unavailable: ${url}`);
    const width=resource.naturalWidth||resource.videoWidth||resource.width||baseTexture.width;
    const height=resource.naturalHeight||resource.videoHeight||resource.height||baseTexture.height;
    if(width<3||height<3)throw new Error(`Invalid part sheet dimensions: ${width}x${height}`);
    const parts={};
    Object.entries(manifest).forEach(([name,cell])=>{parts[name]=extractCell(resource,cell,width,height)});
    return {url,width,height,manifest,parts,baseTexture};
  })();
  cache.set(key,pending);
  try{return await pending}catch(error){cache.delete(key);throw error}
}

export function clearPartSheetCache(){
  cache.clear();
}

import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assetRoot=path.join(root,'assets/ui/project-v/account-battle-suits');
const sourceRoot=path.join(assetRoot,'sources');
const animationRoot=path.join(assetRoot,'animations');
const frameWidth=384;
const frameHeight=512;
const columns=4;
const rows=2;
const baselineY=479;
const maximumVisibleWidth=374;
const maximumVisibleHeight=440;

const suits=[
  {slug:'battle-suit-01'},
  {slug:'battle-suit-02'},
  {slug:'battle-suit-03'}
];

const weapons=[
  {slug:'gilded-dragon-ar',row:0},
  {slug:'gilded-dragon-antimateriel',row:1}
];

const isCheckerboardPixel=(red,green,blue,alpha)=>{
  if(alpha===0)return true;
  const minimum=Math.min(red,green,blue);
  const maximum=Math.max(red,green,blue);
  return minimum>=205&&maximum-minimum<=22;
};

function markEdgeConnectedCheckerboard(data,info){
  const {width,height,channels}=info;
  const marked=new Uint8Array(width*height);
  const queue=new Uint32Array(width*height);
  let head=0;
  let tail=0;
  const seed=(x,y)=>{
    const index=y*width+x;
    if(marked[index])return;
    const offset=index*channels;
    const alpha=channels===4?data[offset+3]:255;
    if(!isCheckerboardPixel(data[offset],data[offset+1],data[offset+2],alpha))return;
    marked[index]=1;
    queue[tail++]=index;
  };

  for(let x=0;x<width;x+=1){
    seed(x,0);
    seed(x,height-1);
  }
  for(let y=0;y<height;y+=1){
    seed(0,y);
    seed(width-1,y);
  }

  while(head<tail){
    const index=queue[head++];
    const x=index%width;
    const y=Math.floor(index/width);
    const neighbours=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for(const [nextX,nextY] of neighbours){
      if(nextX<0||nextY<0||nextX>=width||nextY>=height)continue;
      const nextIndex=nextY*width+nextX;
      if(marked[nextIndex])continue;
      const offset=nextIndex*channels;
      const alpha=channels===4?data[offset+3]:255;
      if(!isCheckerboardPixel(data[offset],data[offset+1],data[offset+2],alpha))continue;
      marked[nextIndex]=1;
      queue[tail++]=nextIndex;
    }
  }
  return marked;
}

async function extractAuthoredSprite(sourcePath){
  const bytes=await readFile(sourcePath);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const checkerboard=markEdgeConnectedCheckerboard(data,info);
  const rgba=Buffer.from(data);
  let minimumX=info.width;
  let minimumY=info.height;
  let maximumX=-1;
  let maximumY=-1;
  for(let y=0;y<info.height;y+=1){
    for(let x=0;x<info.width;x+=1){
      const index=y*info.width+x;
      const alphaOffset=index*4+3;
      if(checkerboard[index])rgba[alphaOffset]=0;
      if(rgba[alphaOffset]<16)continue;
      minimumX=Math.min(minimumX,x);
      minimumY=Math.min(minimumY,y);
      maximumX=Math.max(maximumX,x);
      maximumY=Math.max(maximumY,y);
    }
  }
  if(maximumX<minimumX||maximumY<minimumY)throw new Error(`No authored sprite found: ${sourcePath}`);

  const padding=2;
  minimumX=Math.max(0,minimumX-padding);
  minimumY=Math.max(0,minimumY-padding);
  maximumX=Math.min(info.width-1,maximumX+padding);
  maximumY=Math.min(info.height-1,maximumY+padding);
  const width=maximumX-minimumX+1;
  const height=maximumY-minimumY+1;
  return sharp(rgba,{raw:{width:info.width,height:info.height,channels:4}})
    .extract({left:minimumX,top:minimumY,width,height})
    .png()
    .toBuffer();
}

async function buildFrame(sourcePath){
  const sprite=await extractAuthoredSprite(sourcePath);
  const metadata=await sharp(sprite).metadata();
  const scale=Math.min(maximumVisibleWidth/metadata.width,maximumVisibleHeight/metadata.height);
  const width=Math.max(1,Math.round(metadata.width*scale));
  const height=Math.max(1,Math.round(metadata.height*scale));
  const left=Math.floor((frameWidth-width)/2);
  const top=baselineY-height+1;
  const resized=await sharp(sprite).resize(width,height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  return sharp({
    create:{width:frameWidth,height:frameHeight,channels:4,background:{r:0,g:0,b:0,alpha:0}}
  }).composite([{input:resized,left,top}]).raw().toBuffer();
}

async function buildAtlas(suit){
  const rowBuffers=[];
  for(const weapon of weapons){
    const sourcePath=path.join(sourceRoot,`${suit.slug}-${weapon.slug}-imagegen-authored-v1.png`);
    const frame=await buildFrame(sourcePath);
    const row=Buffer.alloc(frameWidth*columns*frameHeight*4);
    for(let y=0;y<frameHeight;y+=1){
      const sourceOffset=y*frameWidth*4;
      for(let column=0;column<columns;column+=1){
        frame.copy(row,(y*frameWidth*columns+column*frameWidth)*4,sourceOffset,sourceOffset+frameWidth*4);
      }
    }
    rowBuffers.push(row);
  }

  const atlas=Buffer.alloc(frameWidth*columns*frameHeight*rows*4);
  for(let row=0;row<rows;row+=1){
    const rowBuffer=rowBuffers[row];
    rowBuffer.copy(atlas,row*rowBuffer.length);
  }
  const outputPath=path.join(animationRoot,`${suit.slug}-gilded-dragon-horizontal-fire-atlas-v1.png`);
  await sharp(atlas,{raw:{width:frameWidth*columns,height:frameHeight*rows,channels:4}})
    .png({compressionLevel:9})
    .toFile(outputPath);
  return path.relative(root,outputPath);
}

await mkdir(animationRoot,{recursive:true});
for(const suit of suits)console.log(`Wrote ${await buildAtlas(suit)}`);

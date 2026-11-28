import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

// One rigid, chamfered game prop. The plates, grilles and emitter are UVs from
// the original painted side, front and rear views; no per-pose drawing or roll.
const out=new URL('../../',import.meta.url);
const old=JSON.parse(await readFile(new URL('turret-turn-v2.json',out),'utf8'));
const oldSheet=await readFile(new URL('turret-turn-v2.webp',out));
const art={};
async function crop(name){
  const {x:left,y:top,w:width,h:height}=old.frames[name].frame;
  return sharp(oldSheet).extract({left,top,width,height});
}
for(const name of ['east','north','south'])art[name]=await (await crop(name)).ensureAlpha().raw().toBuffer();
const width=352,height=240,axis=[176,106],elevation=.53,up=Math.sqrt(1-elevation**2);
const count=96,cellW=240,headH=164,baseH=213,columns=12,rows=count/columns;
const scale=cellW/width;
const mesh=[];
// Length, half-width, crown and underside. The socket passes through local (0,0,0).
const stations=[
  [-127,49,32,-25],[-118,61,45,-35],[-96,66,51,-41],[-64,66,53,-43],
  [-29,66,47,-42],[9,65,43,-40],[58,63,39,-37],[108,59,35,-32],[139,54,32,-29],[153,47,23,-20]
];
const sideU=[55,62,80,110,145,184,231,277,315,329];
const shoulder=[63,57,56,55,58,64,65,65,65,75];
const belt=[79,76,75,77,78,82,84,85,83,89];
const skirt=[124,134,144,145,146,145,145,139,131,122];
const lower=[132,142,150,151,151,151,149,143,135,124];
const topRow=[148,137,126,106,96,79,66,48,35,29];
const topWidth=[39,47,47,48,46,44,42,41,34,26];
const shape=[[-.73,1],[.73,1],[1,.70],[1,-.62],[.72,-1],[-.72,-1],[-1,-.62],[-1,.70]];
function vertex(i,j){
  const [x,r,hi,lo]=stations[i],[z,h]=shape[j];
  return [x,h>=0?hi*h:-lo*h,r*z];
}
function face(points,texture,uv,brightness=1){
  for(let i=1;i<points.length-1;i++)mesh.push({points:[points[0],points[i],points[i+1]],uv:[uv[0],uv[i],uv[i+1]],texture,brightness});
}
function sideUV(i,j){
  const value=j===0||j===1?shoulder[i]:j===2||j===7?belt[i]:j===3||j===6?skirt[i]:lower[i];
  return [sideU[i],value];
}
for(let i=0;i<stations.length-1;i++){
  for(let j=0;j<shape.length;j++){
    const next=(j+1)%shape.length,ij=[[i,j],[i,next],[i+1,next],[i+1,j]];
    const crown=j===0;
    const uv=ij.map(([a,b])=>crown?[176+shape[b][0]/.73*topWidth[a],topRow[a]]:sideUV(a,b));
    face(ij.map(([a,b])=>vertex(a,b)),crown?'north':'east',uv,j===4?.57:j===3||j===5?.82:j===1||j===7?1.05:1);
  }
}
for(const end of [0,stations.length-1]){
  const front=end>0;
  const poly=shape.map((_,j)=>vertex(end,j));
  const uv=shape.map(([z,h])=>[176+(front?-z:z)*(front?54:55),front?182-h*32:182-h*33]);
  face(poly,front?'south':'north',uv);
}
function project([x,y,z],cos,sin){
  const depth=x*sin+z*cos;
  return [axis[0]+x*cos-z*sin,axis[1]+elevation*depth-up*y,up*depth+elevation*y];
}
function raster(angle){
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const rgba=Buffer.alloc(width*height*4),depthBuffer=new Float32Array(width*height).fill(-Infinity);
  for(const {points,uv,texture,brightness} of mesh){
    const [a,b,c]=points.map(p=>project(p,cos,sin));
    const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],den=bx*cy-by*cx;
    if(Math.abs(den)<.001)continue;
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])));
    const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    const tex=art[texture];
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=x+.5-a[0],dy=y+.5-a[1],v=(dx*cy-dy*cx)/den,w=(bx*dy-by*dx)/den,u=1-v-w;
      if(Math.min(u,v,w)<-.00001)continue;
      const depth=u*a[2]+v*b[2]+w*c[2],index=y*width+x;
      if(depth<depthBuffer[index])continue;
      const tx=Math.round(uv[0][0]*u+uv[1][0]*v+uv[2][0]*w),ty=Math.round(uv[0][1]*u+uv[1][1]*v+uv[2][1]*w);
      const src=(ty*width+tx)*4,dst=index*4,opaque=tex[src+3]>100;
      const shell=[67,56,54];
      for(let k=0;k<3;k++)rgba[dst+k]=Math.min(255,Math.round((opaque?tex[src+k]:shell[k])*brightness));
      rgba[dst+3]=255;depthBuffer[index]=depth;
    }
  }
  return sharp(rgba,{raw:{width,height,channels:4}});
}
const base=await (await crop('base')).png().toBuffer();
const collar=Buffer.from('<svg width="352" height="312" xmlns="http://www.w3.org/2000/svg"><path d="M139 149a37 12 0 0 0 74 0v12a37 12 0 0 1-74 0Z" fill="#423c3c" stroke="#282428" stroke-width="3"/><ellipse cx="176" cy="149" rx="37" ry="11" fill="#746a61" stroke="#3a3230" stroke-width="3"/></svg>');
const socket=await sharp(base).composite([{input:collar}]).png().toBuffer();
const layers=[],frames={},muzzles=[];
function frame(name,x,y,w,h){
  frames[name]={frame:{x,y,w,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w,h},sourceSize:{w,h}};
}
for(let i=0;i<count;i++){
  const angle=i*2*Math.PI/count,x=i%columns*cellW,y=Math.floor(i/columns)*headH;
  const head=await raster(angle).resize(cellW,headH,{fit:'fill'}).png().toBuffer();
  layers.push({input:head,left:x,top:y});
  frame('yaw-'+i,x,y,cellW,headH);
  const muzzle=project([153,0,0],Math.cos(angle),Math.sin(angle));
  muzzles.push(muzzle.slice(0,2).map(v=>Math.round(v*scale*100)/100));
}
layers.push({input:await sharp(socket).resize(cellW,baseH,{fit:'fill'}).png().toBuffer(),left:0,top:rows*headH});
frame('base',0,rows*headH,cellW,baseH);
const sheetWidth=columns*cellW,sheetHeight=rows*headH+baseH,image='turret-turn-v3.webp';
await writeFile(new URL(image,out),await sharp({create:{width:sheetWidth,height:sheetHeight,channels:4,background:'#00000000'}})
  .composite(layers).webp({quality:90,alphaQuality:100,effort:5}).toBuffer());
await writeFile(new URL('turret-turn-v3.json',out),JSON.stringify({frames,meta:{image,scale:'1',size:{w:sheetWidth,h:sheetHeight}},
  aim:{count,projection:elevation,axis:axis.map(v=>v*scale),muzzles}})+'\n');
const rest=await raster(-3*Math.PI/4).png().toBuffer();
await writeFile(new URL('defense-turret-v3.webp',out),await sharp(socket).composite([{input:rest,left:0,top:0}]).webp({quality:94,alphaQuality:100}).toBuffer());

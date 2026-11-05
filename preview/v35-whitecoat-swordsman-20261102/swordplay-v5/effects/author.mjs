import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {t,ring,spark} from '../../effects/primitives.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const binary = 'C:/Users/User/Tools/v35-production/effekseer-170e/Tool/Effekseer.exe';
const native = path.join(dir, 'native');
const textureDir = path.join(native, 'Texture');
const qa = path.join(dir, 'qa');
await fs.mkdir(textureDir, {recursive:true});
await fs.mkdir(qa, {recursive:true});
const reports = [], crops = [], effects = [];
const ids = ['flash','thrust','wheel','rain'];
const art = JSON.parse(await fs.readFile(path.join(dir,'../art/generation.json'),'utf8'));
const framesPerDrawing = 4;

function uniform(value) {
  return t('Center', value) + t('Max', value) + t('Min', value);
}
function drawingNode(id, index) {
  const corners = [['LL',-5.45,-5.45],['LR',5.45,-5.45],['UL',-5.45,5.45],['UR',5.45,5.45]];
  const vertices = corners.map(([name,x,y]) => t('Position_Fixed_'+name,t('X',x)+t('Y',y))).join('');
  const timing = t('Life',uniform(framesPerDrawing)) + t('GenerationTimeOffset',uniform(index*framesPerDrawing));
  const material = t('ColorTexture','Texture/'+id+'-'+index+'.png') + t('AlphaBlend',1) +
    t('ZTest','False') + t('ZWrite','False') + t('Filter',1);
  const sprite = t('Billboard',2) + t('ColorAll',0) +
    t('ColorAll_Fixed','<R>255</R><G>255</G><B>255</B><A>255</A>') + t('Position',1) + vertices;
  return t('Node',t('Name',id+' sword phase '+(index+1))+t('CommonValues',timing)+
    t('RendererCommonValues',material)+t('DrawingValues',t('Type',2)+t('Sprite',sprite))+t('Children',''));
}
function exportNative(input, editable, compiled) {
  const result = spawnSync(binary,['-cui','-in',input,'-o',editable,'-e',compiled],{
    cwd:path.dirname(binary), windowsHide:true, timeout:90000, encoding:'utf8'
  });
  if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr || 'Effekseer export failed');
}

// Pick the nearest transparent seam. Each cel uses the same scale and the
// same row/column pivot, including on sheets with slightly uneven gutters.
function splits(counts, divisions) {
  const pitch = counts.length / divisions;
  const cuts = [0];
  for (let i=1; i<divisions; i++) {
    const center = i*pitch;
    let best = Math.round(center), score = Infinity;
    for (let p=Math.ceil(center-pitch*.22); p<=Math.floor(center+pitch*.22); p++) {
      const value=(counts[p-1]+counts[p]+counts[p+1])*10000 + Math.abs(p-center);
      if (value < score) { score=value; best=p; }
    }
    cuts.push(best);
  }
  cuts.push(counts.length);
  return cuts;
}

async function saveEffect(name, nodes, frames, blend, drawings=0) {
    const sourceFile=path.join(native,name+'.efkproj'), editable=path.join(native,name+'.efkefc');
    const runtime=path.join(native,name+'.efk'), reopened=path.join(native,name+'-reopened.efkefc');
    const project=t('Root',t('Name','Root')+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+
      t('Version',3)+t('StartFrame',0)+t('EndFrame',frames)+t('IsLoop','False');
    await fs.writeFile(sourceFile,'<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',project));
    exportNative(sourceFile,editable,path.join(native,name+'-initial.efk'));
    exportNative(editable,reopened,runtime);
    const bytes=await fs.readFile(runtime);
    const initialEqual=bytes.equals(await fs.readFile(path.join(native,name+'-initial.efk')));
    const checked=path.join(native,name+'-verified.efk');
    exportNative(reopened,path.join(native,name+'-verified.efkefc'),checked);
    if (!bytes.equals(await fs.readFile(checked))) throw Error('Native reopen differs: '+name);
    reports.push({id:name,drawings,nodes:nodes.length,initialImportBinaryEqual:initialEqual,roundTripBinaryEqual:true,sha256:createHash('sha256').update(bytes).digest('hex')});
    effects.push({id:name,frames,blend,units:12,width:512,height:512,pivot:[256,256],source:'native/'+name+'.efkefc'});
}
for (const id of ids) {
  const source=path.join(dir,'../art',art[id].revision?.file || id+'.png');
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info;
  const alpha=(x,y)=>data[(y*width+x)*4+3];
  const rows=new Array(height).fill(0);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) if (alpha(x,y)>32) rows[y]++;
  const ys=splits(rows,2), rects=[];
  for (let row=0; row<2; row++) {
    const columns=new Array(width).fill(0);
    for (let y=ys[row]; y<ys[row+1]; y++) for (let x=0; x<width; x++) if (alpha(x,y)>32) columns[x]++;
    const xs=splits(columns,4);
    for (let col=0; col<4; col++)
      rects.push({left:xs[col],top:ys[row],width:xs[col+1]-xs[col],height:ys[row+1]-ys[row]});
  }
  const canvasSize=Math.max(...rects.flatMap(r=>[r.width,r.height]));
  const textures=new Set();
  for (const [index,r] of rects.entries()) {
    let border=0, covered=0;
    for (let y=0; y<r.height; y++) for (let x=0; x<r.width; x++) {
      if (alpha(r.left+x,r.top+y)<=32) continue;
      covered++;
      if (!x || !y || x===r.width-1 || y===r.height-1) border++;
    }
    crops.push({id,index,rect:r,covered,border});
    if (!covered || border) throw Error(id+' cel '+index+' has '+border+' cut-edge pixels, '+covered+' painted pixels');
    const buffer=await sharp(source).extract(r).png().toBuffer();
    const cell=await sharp({create:{width:canvasSize,height:canvasSize,channels:4,background:'#00000000'}})
      .composite([{input:buffer,gravity:'centre'}]).png().toBuffer();
    const file=path.join(textureDir,id+'-'+index+'.png');
    await sharp(cell).resize(384,384).png().toFile(file);
    textures.add(createHash('sha256').update(await fs.readFile(file)).digest('hex'));
  }
  if (textures.size!==8) throw Error('Repeated drawing in '+id);
  await saveEffect('v5-'+id,rects.map((_,index)=>drawingNode(id,index)),2+framesPerDrawing*8,'normal',textures.size);
}
const silver=[204,232,255,255], ivory=[255,251,230,255], gold=[255,182,78,242];
const splinters=[];
for (let i=0;i<46;i++) {
  const angle=i*2.39996, speed=.035+(i%9)*.013;
  const vx=Math.cos(angle)*speed, vy=Math.sin(angle)*speed;
  splinters.push(spark({name:'Sheared steel '+i,color:[silver,ivory,gold][i%3],life:13+i%12,
    delay:i%3,rotation:[0,0,angle*180/Math.PI],location:[vx*2,vy*2,0],velocity:[vx,vy,0],
    start:[1,1,1],end:[.15,.05,1],fade:9+i%8},.18+(i%7)*.09,.025+(i%3)*.009));
}
await saveEffect('v5-splinters',splinters,30,'add');
const rims=[];
for (let i=0;i<6;i++) {
  const from=i*60+4;
  rims.push(ring({name:'Travelling blade front '+i,r:4.8-i%2*.20,inner:4.62-i%2*.20,
    from,to:from+124,angleMotion:[from+98,from+225],color:[silver,gold,ivory][i%3],life:27+i%2*4,
    delay:i%3*2,start:[.14,.05,1],end:[1.05,.40+i%2*.075,1],fade:15}));
}
await saveEffect('v5-rimlight',rims,38,'add');
await fs.writeFile(path.join(qa,'crop-audit.json'),JSON.stringify(crops,null,2));
await fs.writeFile(path.join(qa,'native.json'),JSON.stringify(reports,null,2));
await fs.writeFile(path.join(dir,'effects.json'),JSON.stringify({id:'whitecoat-swordmaster-v5',sourceDate:'2026-11-05',
  tool:'Effekseer',version:'1.70e',fps:60,seed:3502,effects},null,2));
console.log(reports);

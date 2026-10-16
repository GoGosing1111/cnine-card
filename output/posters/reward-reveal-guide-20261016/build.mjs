import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const dir=fileURLToPath(new URL('./',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const width=2048,height=3072;
const source=JSON.parse(await readFile(dir+'content.json','utf8'));
assert.equal(source.brand,'리버스콜');
assert.deepEqual(source.contents.map(c=>c.id),['CORE','LICH','MADARA','COOP_HARD']);
assert.ok(!/weight|probability|확률|%/.test(JSON.stringify(source)));
const byId=Object.fromEntries(source.contents.map(c=>[c.id,c]));
assert.deepEqual(byId.LICH.minimum,byId.COOP_HARD.minimum);
assert.deepEqual(byId.LICH.rewards,byId.COOP_HARD.rewards);
const rowsFor=id=>[byId[id].minimum,...byId[id].rewards];
const key=r=>r.ref||r.type;
const order=(id,list)=>list.map(k=>{const r=rowsFor(id).find(r=>key(r)===k);assert.ok(r,k);return r;});
const groups=[
 {number:'01',title:'붕괴코어 레이드',top:620,rowTop:760,ids:['CORE'],rows:order('CORE',['MASTER_STAR','COIN','STARLIGHT_ARMOR_CORE','EASTERN_ARMS_WEAPON_BLUEPRINT','MAYBACH_VISION6_BLUEPRINT'])},
 {number:'02',title:'이스겐 레이드 · 격전지 격전',top:1280,rowTop:1420,ids:['LICH','COOP_HARD'],rows:order('LICH',['COIN','EMPEROR_ENERGY','SUIT_CORE_4','SUIT_CORE_5','EASTERN_ARMS_WEAPON_BLUEPRINT','MAYBACH_VISION6_BLUEPRINT','SECRET_WEAPON_BLUEPRINT_CHAPTER_1'])},
 {number:'03',title:'바르센 레이드',top:2100,rowTop:2240,ids:['MADARA'],rows:order('MADARA',['COIN','EMPEROR_ENERGY','SUIT_CORE_5','SUIT_CORE_6','EASTERN_ARMS_WEAPON_BLUEPRINT','SECRET_WEAPON_BLUEPRINT_CHAPTER_1','SECRET_WEAPON_BLUEPRINT_CHAPTER_2'])}
];
const fonts={body:{file:'C:/Windows/Fonts/malgun.ttf',name:'Malgun Gothic'},bold:{file:'C:/Windows/Fonts/malgunbd.ttf',name:'Malgun Gothic Bold'},display:{file:root+'assets/fonts/clan-camp/BlackHanSans-Regular.ttf',name:'Black Han Sans'},latin:{file:root+'assets/fonts/battle/RussoOne-Regular.ttf',name:'Russo One'}};
const layers=[],typeLayers=[],bounds=[],artSources=[];
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function text(text,x,y,size,{font='bold',color='#f2f1ec',maxWidth=1800}={}){
 const f=fonts[font],{data,info}=await sharp({text:{text:`<span foreground="${color}">${xml(text)}</span>`,font:`${f.name} ${size}`,fontfile:f.file,dpi:72,rgba:true}}).png().toBuffer({resolveWithObject:true});
 assert.ok(info.width<=maxWidth,`Text too wide: ${text}: ${info.width}/${maxWidth}`);
 assert.ok(x+info.width<=width-80&&y+info.height<=height-55,'Text outside safe area: '+text);
 typeLayers.push({input:data,left:x,top:y});bounds.push({text,x,y,width:info.width,height:info.height,size});
}
async function icon(file,x,y,size){
 const bytes=await readFile(root+file),{data,info}=await sharp(bytes).resize(size,size,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
 layers.push({input:data,left:x+Math.round((size-info.width)/2),top:y+Math.round((size-info.height)/2)});
 artSources.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await icon('assets/ui/brand/reverse-call-20261016/icon-192.png',120,92,100);
await text('REVERSE CALL',244,119,44,{font:'latin',color:'#e9e1ff',maxWidth:700});
await text('연출 보상 안내',122,256,116,{font:'display',color:'#f8efdb',maxWidth:1150});
await text('지금 만날 수 있는 콘텐츠별 보상',128,420,39,{font:'body',color:'#c5c9d6',maxWidth:1000});
await text('현재 개방된 콘텐츠',128,514,34,{color:'#d1e7ac',maxWidth:700});

const rules=[];
for(const group of groups){
 await text(group.number,130,group.top+13,44,{font:'latin',color:'#a89b84',maxWidth:70});
 await text(group.title,232,group.top,group.ids.length===2?63:68,{maxWidth:1490});
 await text('ON',1833,group.top+20,32,{font:'latin',color:'#cceba8',maxWidth:100});
 rules.push(`<circle cx="1805" cy="${group.top+38}" r="7" fill="#cceba8"/><path d="M128 ${group.top+96}H1920" stroke="#c1a475" stroke-opacity=".5" stroke-width="2"/>`);
 for(let index=0;index<group.rows.length;index++){
  const row=group.rows[index],col=index%2,top=group.rowTop+Math.floor(index/2)*154,left=col?1070:128;
  await icon(row.image,left,top,126);
  const names=row.name==='마이바흐 비전 6 차량설계도'?['마이바흐 비전 6','차량설계도']:[row.name];
  for(let i=0;i<names.length;i++)await text(names[i],left+160,top+9+i*43,38,{maxWidth:660});
  const amount=row.type==='COIN'?`${row.quantity/100000000}억 코인`:row.quantity===50000?'5만 개':`${row.quantity.toLocaleString('ko-KR')}개`;
  await text(amount,left+160,top+16+names.length*43,33,{font:'body',color:'#e8c98c',maxWidth:650});
 }
}
rules.push('<path d="M128 2890H1920" stroke="#9b9faf" stroke-opacity=".3" stroke-width="2"/>');
await text('봉인 선택 후 보상 목록 중 1종 획득',128,2930,32,{color:'#e6ded0',maxWidth:1750});
await text('2026.10.16 기준 · 콘텐츠별 수령 조건 및 한도 적용',128,2990,28,{font:'body',color:'#a0a8b9',maxWidth:1750});
const decorative=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rules.join('')}</svg>`);
await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite([{input:decorative},...typeLayers]).png().toFile(dir+'typography-layer.png');
const background=await sharp(dir+'background-v1.png').metadata();
assert.equal(background.width/background.height,2/3);
const output=dir+'reward-reveal-guide-20261016.png';
await sharp(dir+'background-v1.png').resize(width,height).composite([...layers,{input:dir+'typography-layer.png'}]).png().toFile(output);
await sharp(output).jpeg({quality:95,chromaSubsampling:'4:4:4',mozjpeg:true}).toFile(dir+'reward-reveal-guide-20261016.jpg');
await sharp(output).resize({width:1024}).png().toFile(dir+'preview-1024.png');
await sharp(output).extract({left:128,top:620,width:1792,height:590}).png().toFile(dir+'qa-core-text.png');
const outputBytes=await readFile(output);
const manifest={date:'2026-10-16',brand:source.brand,readAt:source.asOf,dimensions:[width,height],activeContents:source.contents.map(c=>({id:c.id,name:c.name,revision:c.revision})),rewardRows:groups.map(g=>({contents:g.ids,rows:g.rows})),probabilitiesDisplayed:false,artGeneration:'Built-in image_gen; text-free background; prompt.txt',typography:'Separate verified font layer; no AI-drawn lettering',fonts:{body:'Windows Malgun Gothic; raster export only; font not redistributed',display:'Black Han Sans (existing project font)',latin:'Russo One (existing project font)'},assets:[...new Map(artSources.map(a=>[a.file,a])).values()],text:bounds,files:['reward-reveal-guide-20261016.png','reward-reveal-guide-20261016.jpg'],sha256:createHash('sha256').update(outputBytes).digest('hex'),publication:'Created for user review; no external publication'};
assert.ok(!bounds.some(b=>/%|확률|비중/.test(b.text)));
assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),19);
await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,dimensions:[width,height],rewardRows:19,contentCount:4,probabilitiesDisplayed:false,sha256:manifest.sha256}));

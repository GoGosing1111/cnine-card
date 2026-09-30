import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const dir=fileURLToPath(new URL('./',import.meta.url));
const scale=2,width=2048,height=3072;
const fonts={
  serif:{file:dir+'fonts/NotoSerifKR-ranked-900.ttf',name:'Noto Serif KR Heavy',license:'SIL OFL 1.1'},
  body:{file:'C:/Windows/Fonts/malgun.ttf',name:'Malgun Gothic',license:'Windows system font, raster output only'},
  bold:{file:'C:/Windows/Fonts/malgunbd.ttf',name:'Malgun Gothic Bold',license:'Windows system font, raster output only'},
  mono:{file:fileURLToPath(new URL('../../../assets/fonts/clan-camp/IBMPlexMono-Medium.ttf',import.meta.url)),name:'IBM Plex Mono Medium',license:'SIL OFL 1.1'}
};
const lines=[
  {text:'숲켓몬',x:512,y:31,size:42,font:'serif',color:'gold'},
  {text:'SOOPKETMON  /  RANKED',x:512,y:93,size:13,font:'mono',color:'#d9c299',spacing:4500},
  {text:'랭크전',x:512,y:139,size:166,font:'serif',color:'gold'},
  {text:'개편 예고',x:512,y:315,size:145,font:'serif',color:'gold'},
  {text:'더 공정한 경쟁, 더 다양한 전략',x:512,y:494,size:36,font:'bold',color:'#fbf8ef'},
  {text:'점수 산식 개선 · 매칭 개선 · 용병 밸런스 점검',x:512,y:1190,size:34,font:'bold',color:'#f1dfbc'},
  {text:'10.01(목) 20:15 시즌 종료',x:512,y:1268,size:60,font:'serif',color:'gold'},
  {text:'정산·보상 지급 완료 후 랭크전 일시 중지',x:512,y:1355,size:35,font:'bold',color:'#fff9ec'},
  {text:'현재 시즌 보상은 기존 기준대로 지급됩니다',x:512,y:1434,size:25,font:'body',color:'#d0d6df'},
  {text:'재개 일정은 추후 안내',x:512,y:1474,size:25,font:'body',color:'#d0d6df'}
];
assert.equal(lines[0].text,'숲켓몬');
assert.equal(new Date('2026-10-01T11:15:04Z').toLocaleString('en-US',{timeZone:'Asia/Seoul',weekday:'short'}),'Thu');
const art=dir+'art-master-v1.png',artInfo=await sharp(art).metadata();
assert.equal(artInfo.width/artInfo.height,2/3,'Art must remain exact 2:3');
const overlays=[],bounds=[];
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const line of lines){
  const font=fonts[line.font],mark=`<span foreground="${line.color==='gold'?'#ffffff':line.color}"${line.spacing?` letter_spacing="${line.spacing*scale}"`:''}>${xml(line.text)}</span>`;
  let {data,info}=await sharp({text:{text:mark,font:`${font.name} ${line.size*scale}`,fontfile:font.file,dpi:72,rgba:true}}).png().toBuffer({resolveWithObject:true});
  assert.ok(info.width<928*scale,`Text exceeds safe width: ${line.text}`);
  if(line.color==='gold'){
    const gradient=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><defs><linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff9e8"/><stop offset=".50" stop-color="#f5e4c3"/><stop offset="1" stop-color="#d6b581"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#gold)"/></svg>`);
    data=await sharp(gradient).composite([{input:data,blend:'dest-in'}]).png().toBuffer();
  }
  const left=Math.round(line.x*scale-info.width/2),top=Math.round(line.y*scale);
  const pad=6*scale;
  const shadow=await sharp({create:{width:info.width,height:info.height,channels:4,background:{r:1,g:3,b:10,alpha:.8}}}).composite([{input:data,blend:'dest-in'}]).extend({top:pad,bottom:pad,left:pad,right:pad,background:'#00000000'}).blur(1.5*scale).png().toBuffer();
  overlays.push({input:shadow,left:left-pad,top:top-pad+2*scale},{input:data,left,top});
  bounds.push({...line,left,top,width:info.width,height:info.height});
}
const separators=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 1536"><defs><linearGradient id="rule"><stop stop-color="#b69460" stop-opacity="0"/><stop offset=".25" stop-color="#e2c28d" stop-opacity=".6"/><stop offset=".75" stop-color="#e2c28d" stop-opacity=".6"/><stop offset="1" stop-color="#b69460" stop-opacity="0"/></linearGradient></defs><path d="M270 475H754 M140 1165H884 M140 1248H884 M260 1410H764" stroke="url(#rule)" stroke-width="1"/></svg>`);
const typeFile=dir+'typography-layer.png';
await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite([{input:separators},...overlays]).png().toFile(typeFile);
const output=dir+'ranked-reform-poster-v1.png';
await sharp(art).resize(width,height,{kernel:'lanczos3'}).composite([{input:typeFile}]).png().toFile(output);
await sharp(output).jpeg({quality:95,mozjpeg:true,chromaSubsampling:'4:4:4'}).toFile(dir+'ranked-reform-poster-v1.jpg');
await sharp(output).resize({width:390}).png().toFile(dir+'mobile-qa-390.png');
await sharp(output).extract({left:720,top:25,width:608,height:210}).png().toFile(dir+'brand-qa-zoom.png');
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const manifest={created:'2026-09-30',version:1,purpose:'Ranked reform announcement for review; not published',output:'ranked-reform-poster-v1.png',dimensions:[width,height],artDimensions:[artInfo.width,artInfo.height],artGeneration:'Built-in image_gen; text-free cleanup with same tool',typography:'All Korean text typeset separately with verified font glyphs; no AI-drawn lettering in final',fonts:{serif:{file:'fonts/NotoSerifKR-ranked-900.ttf',license:fonts.serif.license},body:{systemFont:'Windows Malgun Gothic',redistributed:false},bold:{systemFont:'Windows Malgun Gothic Bold',redistributed:false},mono:{file:'../../../assets/fonts/clan-camp/IBMPlexMono-Medium.ttf',license:fonts.mono.license}},copy:lines.map(l=>l.text),bounds,season:{name:'시즌 18',endKst:'2026-10-01T20:15:04+09:00',pause:'After settlement and reward delivery',reopen:null},unconfirmed:['Daily match limits','Separate match mode','Specific balance values','Reopening date'],sha256:await hash(output),artSha256:await hash(art)};
await writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,dimensions:manifest.dimensions,artDimensions:manifest.artDimensions,sha256:manifest.sha256,bounds:bounds.map(b=>({text:b.text,x:b.left,y:b.top,width:b.width,height:b.height}))},null,2));

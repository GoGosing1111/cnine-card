import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const art='assets/posters/clan-season3-art-v2.png',output='assets/posters/clan-season3-announcement-v2.png';
const heading=root+'assets/fonts/clan-camp/BlackHanSans-Regular.ttf';
const body='C:/Windows/Fonts/malgun.ttf',bold='C:/Windows/Fonts/malgunbd.ttf';
const scale=2,layers=[];
const lines=[
 ['숲켓몬',512,25,72,'heading','#f7dfae'],
 ['새로운 시즌, 새로운 클랜.',512,955,29,'body','#f8ecd3'],
 ['01  참가 모집',323,1047,32,'heading','#f6d89b'],
 ['9월 28일 (월)',323,1097,29,'bold','#ffffff'],
 ['챔피언스리그 종료 즉시',323,1140,23,'body','#f6f4f1'],
 ['시즌 3 참가 신청 시작',323,1172,20,'body','#c4d2dc'],
 ['02  클랜 드래프트',717,1047,32,'heading','#f6d89b'],
 ['9월 29일 (화) 21:00',717,1097,29,'bold','#ffffff'],
 ['신청 마감과 동시에 자동 시작',717,1140,22,'body','#f6f4f1'],
 ['모집 종료 → 클랜 편성',717,1172,20,'body','#c4d2dc'],
 ['정규 클랜전',512,1234,32,'heading','#f6d89b'],
 ['매주 화 · 목 · 토 · 일',512,1281,35,'heading','#ffffff'],
 ['21:00 — 22:00',512,1325,40,'bold','#f6d89b'],
 ['첫 정규전  10월 1일 (목) 21:00',512,1367,20,'body','#e1e8ed'],
 ['모든 시간은 한국 시간(KST) 기준',512,1440,18,'body','#e1e8ed'],
 ['챔스 종료일 변경 시, 실제 종료 다음 날 21시에 드래프트가 진행됩니다.',512,1475,16,'body','#c4d2dc'],
];
const fonts={heading:{file:heading,name:'Black Han Sans'},body:{file:body,name:'Malgun Gothic'},bold:{file:bold,name:'Malgun Gothic Bold'}};
for(const [text,x,y,size,type,color] of lines){
 const font=fonts[type],escaped=text.replaceAll('&','&amp;').replaceAll('<','&lt;');
 const rendered=await sharp({text:{text:`<span foreground="${color}">${escaped}</span>`,font:`${font.name} ${size*scale}`,fontfile:font.file,dpi:72,rgba:true}}).png().toBuffer({resolveWithObject:true});
 if(rendered.info.width>(type==='heading'&&y===25?800:(x===512?920:390))*scale)throw Error(`Text exceeds safe width: ${text}`);
 layers.push({input:rendered.data,left:Math.round(x*scale-rendered.info.width/2),top:y*scale});
}
await sharp(root+art).resize(2048,3072).composite(layers).png().toFile(root+output);
const manifest={version:2,output,dimensions:[2048,3072],art,mode:'Built-in image_gen art and cleanup; real-font Korean typography',fonts:{heading:'BlackHanSans-Regular.ttf (OFL)',body:'Windows Malgun Gothic (raster output only)'},copy:lines.map(([text])=>text),sources:['assets/ui/player-card/champions-league-v2109.png','assets/ui/clan/clan-command-room-v1.webp'],sha256:createHash('sha256').update(await readFile(root+output)).digest('hex'),typographyPolicy:'Brand and all schedule text use real Korean font glyphs. No generated 숲 lettering.'};
await writeFile(root+'assets/posters/clan-season3-announcement-v2.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:root+output,...manifest}));

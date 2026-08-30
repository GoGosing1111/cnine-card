import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

const manifestPath='assets/ui/project-v/characters/superstar/manifest-v1.json';
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));

assert.equal(manifest.format,'PROJECT_V_TIER_BATTLE_SPRITE_MANIFEST_V1');
assert.equal(manifest.scope,'BATTLE_ENGINE_ONLY');
assert.equal(manifest.rarity,'SUPERSTAR');
assert.equal(manifest.characters.length,9);
assert.equal(new Set(manifest.characters.map(row=>row.cardId)).size,9);
assert.deepEqual(
  manifest.characters.slice(-3).map(row=>[row.cardId,row.title,row.member,row.sourceArt]),
  [
    ['CN-F7D77F561A7949EE','Zeus','Zeus','assets/cards/47979411.jpg'],
    ['CN-A041807B14B54C89','Son Heung min','Son Heung min','assets/cards/6496413.jpg'],
    ['CN-17EDFC0B27E54069','Erling Haaland','Erling Haaland','assets/cards/hol.jpg']
  ]
);

const responsiveSource=fs.readFileSync('js/responsive-superstar-battle-sprites-v1896.js','utf8');
const responsiveSandbox={window:{CNineResponsiveBattleSprites:{}}};
vm.runInNewContext(responsiveSource,responsiveSandbox);

const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
function inspectPng(buffer){
  assert(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature 오류');
  let cursor=8,width=0,height=0,colorType=-1;const chunks=[];
  while(cursor<buffer.length){
    const length=buffer.readUInt32BE(cursor),type=buffer.toString('ascii',cursor+4,cursor+8),data=buffer.subarray(cursor+8,cursor+8+length);
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);colorType=data[9]}
    if(type==='IDAT')chunks.push(data);
    cursor+=12+length;
    if(type==='IEND')break;
  }
  assert.equal(colorType,6,'SUPERSTAR SD는 RGBA PNG여야 합니다.');
  assert.equal(width,1200,'SUPERSTAR SD 폭은 1200px이어야 합니다.');
  assert.equal(height,1400,'SUPERSTAR SD 높이는 1400px이어야 합니다.');
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(width*height*4);let source=0;
  for(let y=0;y<height;y++){
    const filter=raw[source++];
    for(let x=0;x<stride;x++){
      const current=raw[source++],left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,diagonal=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
      let predict=0;
      if(filter===1)predict=left;else if(filter===2)predict=up;else if(filter===3)predict=Math.floor((left+up)/2);else if(filter===4)predict=paeth(left,up,diagonal);
      pixels[y*stride+x]=(current+predict)&255;
    }
  }
  let minX=width,minY=height,maxX=-1,maxY=-1,visible=0,transparent=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const alpha=pixels[(y*width+x)*4+3];
    if(alpha===0)transparent++;
    if(alpha>18){visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  }
  assert(visible>0,'보이는 캐릭터 픽셀이 없습니다.');
  assert(transparent>width*height*.35,'투명 배경 면적이 부족합니다.');
  return {left:minX,top:minY,right:width-1-maxX,bottom:height-1-maxY};
}

for(const row of manifest.characters){
  assert(fs.existsSync(row.sourceArt),`원본 카드 누락: ${row.sourceArt}`);
  assert(fs.existsSync(row.battleSprite),`전투 SD 누락: ${row.battleSprite}`);
  const data=fs.readFileSync(row.battleSprite);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex').toUpperCase(),row.sha256,`${row.cardId} SHA 불일치`);
  const margin=inspectPng(data);
  assert(margin.left>=48&&margin.right>=48&&margin.top>=48&&margin.bottom>=48,`${row.cardId} 안전 여백 48px 미달: ${JSON.stringify(margin)}`);
  const responsive=responsiveSandbox.window.CNineResponsiveBattleSprites[row.battleSprite];
  assert(responsive,`${row.cardId} 768px 전투 변형 매핑 누락`);
  const responsivePath=responsive.replace(/^\//,'');
  assert(fs.existsSync(responsivePath),`${row.cardId} 768px 전투 변형 누락: ${responsivePath}`);
  const responsiveData=fs.readFileSync(responsivePath);
  assert.equal(responsiveData.toString('ascii',0,4),'RIFF',`${row.cardId} WebP RIFF signature 오류`);
  assert.equal(responsiveData.toString('ascii',8,12),'WEBP',`${row.cardId} WebP signature 오류`);
  assert(responsiveData.length<data.length,`${row.cardId} 768px 변형이 원본보다 작아야 합니다.`);
}

const adapter=fs.readFileSync('js/project-v-tier-battle-art-adapter-v1.js','utf8');
assert.match(adapter,/SUPERSTAR:\s*'\/assets\/ui\/project-v\/characters\/superstar\/manifest-v1\.json\?v=3-haaland'/);

console.log('project-v SUPERSTAR SD assets v1: 9/9 RGBA + manifest + safe-margin + 768px WebP PASS');

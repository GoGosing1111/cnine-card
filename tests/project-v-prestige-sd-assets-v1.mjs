import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

const manifestPath='assets/ui/project-v/characters/prestige/manifest-v1.json';
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const expectedNewIds=[
  'CN-7D9F82B5283044B8','CN-1F115DF0A0C94E86','CN-765D30C0C1E44A18','CN-9B9094FC8CF14C24',
  'CN-C68D9F67244040E7','CN-1F1B0939F5D94E57','CN-856132DE93704FB8','CN-132824AC77054E08',
  'CN-212DB3265D9945CA','CN-82C02C0D8F4445C3','CN-78B98E429ACC4C5B','CN-E7AA20D2C8F04C03',
  'CN-57C561CA1F874657','CN-A3F1F6D28EFA4702','CN-F75C2DD33ACE48C6','CN-1FFB6DB18678417D'
];

assert.equal(manifest.format,'PROJECT_V_TIER_BATTLE_SPRITE_MANIFEST_V1');
assert.equal(manifest.scope,'BATTLE_ENGINE_ONLY');
assert.equal(manifest.rarity,'PRESTIGE');
assert.equal(manifest.characters.length,28);
assert.equal(new Set(manifest.characters.map(row=>row.cardId)).size,28);
for(const id of expectedNewIds)assert(manifest.characters.some(row=>row.cardId===id),`신규 PRESTIGE 누락: ${id}`);

const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
function inspectPng(buffer){
  assert(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature 오류');
  let cursor=8,width=0,height=0,colorType=-1;const chunks=[];
  while(cursor<buffer.length){const length=buffer.readUInt32BE(cursor),type=buffer.toString('ascii',cursor+4,cursor+8),data=buffer.subarray(cursor+8,cursor+8+length);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);colorType=data[9]}if(type==='IDAT')chunks.push(data);cursor+=12+length;if(type==='IEND')break}
  assert.equal(colorType,6,'PRESTIGE SD는 RGBA PNG여야 합니다.');
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(width*height*4);let source=0;
  for(let y=0;y<height;y++){const filter=raw[source++];for(let x=0;x<stride;x++){const current=raw[source++],left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,diagonal=y&&x>=4?pixels[(y-1)*stride+x-4]:0;let predict=0;if(filter===1)predict=left;else if(filter===2)predict=up;else if(filter===3)predict=Math.floor((left+up)/2);else if(filter===4)predict=paeth(left,up,diagonal);pixels[y*stride+x]=(current+predict)&255}}
  let minX=width,minY=height,maxX=-1,maxY=-1,visible=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=pixels[(y*width+x)*4+3];if(alpha>18){visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}}
  assert(visible>0,'보이는 캐릭터 픽셀이 없습니다.');
  return {safeMargin:Math.min(minX,minY,width-1-maxX,height-1-maxY)};
}

for(const row of manifest.characters){
  assert(fs.existsSync(row.sourceArt),`원본 카드 누락: ${row.sourceArt}`);
  assert(fs.existsSync(row.battleSprite),`전투 SD 누락: ${row.battleSprite}`);
  const data=fs.readFileSync(row.battleSprite);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex').toUpperCase(),row.sha256,`${row.cardId} SHA 불일치`);
  if(expectedNewIds.includes(row.cardId))assert(inspectPng(data).safeMargin>=48,`${row.cardId} 안전 여백 48px 미달`);
}

const adapter=fs.readFileSync('js/project-v-tier-battle-art-adapter-v1.js','utf8');
assert.match(adapter,/prestige\/manifest-v1\.json\?v=2-full-roster/);
const preview=fs.readFileSync('preview/project-v-prestige-sd-v1/prestige-sd-battle.js','utf8');
assert.match(preview,/fetch\(manifestUrl/);
assert.doesNotMatch(preview,/const roster=\[/,'프리뷰에 PRESTIGE roster를 하드코딩하면 안 됩니다.');

console.log('project-v PRESTIGE SD assets v1: 28/28 manifest + 16 new RGBA safe-margin PASS');

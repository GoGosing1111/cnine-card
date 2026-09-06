import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'assets/ui/project-v/characters/fur/manifest-v2.json');
const spriteRelative='assets/ui/project-v/characters/fur/fur-cn-5d0e2e4d58c9416f-sd-v1.png';
const spritePath=path.join(root,spriteRelative);
const expectedHash='CE63406916F6BD6C03DDE62E0E25910FB104C130A8A86803E95C2ABA4078BA2F';

const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

function visibleBounds(rgba,width,height,threshold=18){
  let minX=width,minY=height,maxX=-1,maxY=-1,transparent=0,partial=0;
  for(let y=0;y<height;y+=1){
    for(let x=0;x<width;x+=1){
      const alpha=rgba[(y*width+x)*4+3];
      if(alpha===0)transparent+=1;
      else if(alpha<255)partial+=1;
      if(alpha<=threshold)continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
  }
  return {minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1,transparent,partial};
}

test('치타구 FUR는 카드 원화와 분리된 투명 전투 SD로 연결된다',async()=>{
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const entry=manifest.characters.find(row=>row.cardId==='CN-5D0E2E4D58C9416F');
  assert.ok(entry,'치타구 FUR manifest 항목이 없습니다.');
  assert.equal(entry.title,'치타구');
  assert.equal(entry.member,'이예준');
  assert.equal(entry.sourceArt,'assets/cards/cheetah-face-card-portrait-2x3-v1.png');
  assert.notEqual(entry.sourceArt,entry.battleSprite);
  assert.equal(entry.battleSprite,spriteRelative);
  assert.equal(entry.scaleMultiplier,0.8);
  assert.ok(entry.scaleMultiplier<=1.7/2,'치타구 표시 크기는 이전 설정의 절반 이하여야 합니다.');
  assert.equal(sha256(spritePath),expectedHash);
  assert.equal(entry.sha256,expectedHash);

  const {data,info}=await sharp(spritePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1350);
  assert.equal(info.height,1350);
  assert.equal(info.channels,4);
  const bounds=visibleBounds(data,info.width,info.height);
  assert.ok(bounds.transparent>info.width*info.height*.65,'배경이 실제 투명이 아닙니다.');
  assert.ok(bounds.partial>1000,'알파 가장자리 품질이 없습니다.');
  assert.ok(bounds.width>=1180&&bounds.height>=680,'전투 실루엣이 지나치게 작습니다.');
  assert.ok(bounds.minX>=64&&info.width-1-bounds.maxX>=64,'좌우 안전 여백이 부족합니다.');
  assert.ok(info.height-1-bounds.maxY>=64,'하단 안전 여백이 부족합니다.');
});

test('치타구 반응형 자산과 V3 캐시·라우팅 계약이 함께 갱신된다',async()=>{
  for(const [width,extension] of [[384,'avif'],[384,'webp'],[768,'avif'],[768,'webp']]){
    const file=path.join(root,`assets/responsive/project-v/fur/fur-cn-5d0e2e4d58c9416f-sd-v1-${width}.${extension}`);
    assert.ok(fs.existsSync(file),`${path.basename(file)} 누락`);
    const metadata=await sharp(file).metadata();
    assert.equal(metadata.width,width);
    assert.equal(metadata.height,width);
    assert.equal(metadata.hasAlpha,true);
  }

  const responsive=fs.readFileSync(path.join(root,'js/responsive-battle-sprites-v1815.js'),'utf8');
  const adapter=fs.readFileSync(path.join(root,'js/project-v-tier-battle-art-adapter-v1.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  assert.match(responsive,/fur-cn-5d0e2e4d58c9416f-sd-v1\.png/);
  assert.match(responsive,/fur-cn-5d0e2e4d58c9416f-sd-v1-768\.webp/);
  assert.match(adapter,/manifest-v2\.json\?v=4-cheetah-scale/);
  assert.match(adapter,/scaleMultiplier: Math\.min\(2, Math\.max\(\.5, Number\(entry\.scaleMultiplier\) \|\| 1\)\)/);
  assert.match(app,/project-v-tier-battle-art-adapter-v1\.js\?v=3\.7\.1-cheetah-scale/);
  assert.match(index,/responsive-battle-sprites-v1815\.js\?v=2059-cheetah-scale/);
  assert.match(index,/js\/app\.js\?v=2059-cheetah-scale/);
  assert.match(worker,/soop-card-shell-v2059-cheetah-scale/);
});

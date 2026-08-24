import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {extname, join, resolve} from 'node:path';
import {inflateSync} from 'node:zlib';

const rootUrl=new URL('../',import.meta.url);
const rootPath=fileURLToPath(rootUrl);
const manifestUrl=new URL('assets/ui/project-v/characters/zenith/manifest-v1.json',rootUrl);
const manifest=JSON.parse(await readFile(manifestUrl,'utf8'));

const liveRoster=[
  ['CN-519C181C18DF4B8E','토마토','토마토','assets/cards/ZENITH/1.jpg'],
  ['CN-BE9EB8304A744ECF','박틸다','박틸다','assets/cards/ZENITH/10.jpg'],
  ['CN-5330101EFDDA4222','박세라','박세라','assets/cards/ZENITH/11.jpg'],
  ['CN-6B0D4B65D6F04355','애순이','애순이','assets/cards/ZENITH/12.jpg'],
  ['CN-F4C52E065FCC441D','히댕','히댕','assets/cards/ZENITH/15.jpg'],
  ['CN-9F67D5944A8140A8','유소나','유소나','assets/cards/ZENITH/16.jpg'],
  ['CN-B111FA6D946248C9','배그나','배그나','assets/cards/ZENITH/18.jpg'],
  ['CN-2DA48F7E57304017','박삐삐','박삐삐','assets/cards/ZENITH/19.jpg'],
  ['CN-D4726E03B2E14AA2','고라니율','고라니율','assets/cards/ZENITH/2.jpg'],
  ['CN-C2901530814B48AA','민서율','민서율','assets/cards/ZENITH/3.jpg'],
  ['CN-98F767704E3C42F7','지붕위소희','지붕위소희','assets/cards/ZENITH/4.jpg'],
  ['CN-864782C6CB6A4200','류하','류하','assets/cards/ZENITH/5.jpg'],
  ['CN-B66A455F7BB24AC7','도도희','도도희','assets/cards/ZENITH/6.jpg'],
  ['CN-D84DF50E37F64A95','임쥬아','임쥬아','assets/cards/ZENITH/8.jpg'],
  ['CN-A78E3513D30349DA','빵귤이','빵귤이','assets/cards/ZENITH/7778.jpg'],
  ['CN-BCC2127067794E77','남수댕','댕무라사키','assets/cards/ZENITH/dengmura7.png'],
  ['CN-C34437B5F12C4EDB','디임','디임','assets/cards/ZENITH/20.jpg'],
  ['CN-C6EB6FF1D7D940A0','지유나','지유나','assets/cards/ZENITH/21.jpg'],
  ['CN-AC54A948BBDC40A0','뮤니','뮤니','assets/cards/ZENITH/25.jpg'],
  ['CN-BA51755F72C0475E','졈니','졈니','assets/cards/ZENITH/26.jpg'],
  ['CN-8EA5637062014D9F','쁠리','쁠리','assets/cards/ZENITH/V1.jpg'],
  ['CN-0505936A0CBB4E59','남수댕','구수댕','assets/cards/남수댕/031.webp'],
  ['CN-A5A786E91B314805','나무늘봉순','봉순','assets/cards/bongson2.jpg']
];

assert.equal(manifest.schemaVersion,2,'ZENITH manifest schemaVersion은 2여야 합니다.');
assert.equal(manifest.scope,'BATTLE_ENGINE_ONLY','ZENITH SD는 전투엔진 전용이어야 합니다.');
assert.equal(manifest.rarity,'ZENITH');
assert.equal(manifest.rosterSnapshot?.expectedCount,23);
assert.equal(manifest.rosterSnapshot?.identityKey,'cardId');
assert.equal(manifest.assetContract?.format,'PNG');
assert.equal(manifest.assetContract?.canvasMode,'RGBA_ALPHA_0');
assert.equal(manifest.assetContract?.minimumSafeMarginPx,48);
assert.equal(manifest.routingContract?.battleEngineOnly,true);
assert.equal(manifest.routingContract?.battleArtField,'battleSprite');
assert.equal(manifest.routingContract?.dexArtField,'sourceArt');
assert.equal(manifest.routingContract?.deckArtField,'sourceArt');
assert.equal(manifest.routingContract?.cardDetailArtField,'sourceArt');
assert.equal(manifest.routingContract?.neverFallbackSourceArtInBattle,true);
assert(manifest.routingContract?.prohibitedConsumers?.includes('DEX'));
assert(manifest.routingContract?.prohibitedConsumers?.includes('DECK'));
assert.equal(manifest.visualApprovalRecord?.status,'APPROVED');
assert.equal(manifest.visualApprovalRecord?.approvedCount,23);
assert.equal(manifest.visualApprovalRecord?.source,'USER_FINAL_APPROVAL');

assert.deepEqual(
  manifest.characters.map(entry=>[entry.cardId,entry.member,entry.title,entry.sourceArt]),
  liveRoster,
  'manifest가 잠근 운영 ZENITH 23명과 일치하지 않습니다.'
);
assert(!manifest.characters.some(entry=>entry.cardId==='CN-0AC1F17733A24BEB'),'비활성 다크도도희가 포함되면 안 됩니다.');

const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const paeth=(left,up,upperLeft)=>{
  const estimate=left+up-upperLeft;
  const leftDistance=Math.abs(estimate-left);
  const upDistance=Math.abs(estimate-up);
  const diagonalDistance=Math.abs(estimate-upperLeft);
  return leftDistance<=upDistance&&leftDistance<=diagonalDistance?left:upDistance<=diagonalDistance?up:upperLeft;
};

const inspectRgbaPng=(buffer,alphaThreshold)=>{
  assert(buffer.subarray(0,8).equals(pngSignature),'PNG signature가 올바르지 않습니다.');
  let cursor=8;
  let ihdr=null;
  let sawEnd=false;
  const idat=[];
  while(cursor<buffer.length){
    assert(cursor+12<=buffer.length,'PNG chunk header가 잘렸습니다.');
    const length=buffer.readUInt32BE(cursor);
    const type=buffer.toString('ascii',cursor+4,cursor+8);
    const dataStart=cursor+8;
    const dataEnd=dataStart+length;
    assert(dataEnd+4<=buffer.length,`${type} PNG chunk가 잘렸습니다.`);
    const data=buffer.subarray(dataStart,dataEnd);
    if(type==='IHDR')ihdr=data;
    if(type==='IDAT')idat.push(data);
    if(type==='IEND'){sawEnd=true;break}
    cursor=dataEnd+4;
  }
  assert(ihdr&&ihdr.length===13,'IHDR가 없습니다.');
  assert(sawEnd,'IEND가 없습니다.');
  assert(idat.length>0,'IDAT가 없습니다.');
  const width=ihdr.readUInt32BE(0);
  const height=ihdr.readUInt32BE(4);
  const bitDepth=ihdr[8];
  const colorType=ihdr[9];
  const compression=ihdr[10];
  const filterMethod=ihdr[11];
  const interlace=ihdr[12];
  assert.equal(bitDepth,8,'PNG는 8-bit여야 합니다.');
  assert.equal(colorType,6,'PNG color type은 RGBA(6)여야 합니다.');
  assert.equal(compression,0);
  assert.equal(filterMethod,0);
  assert.equal(interlace,0,'검수기는 non-interlaced RGBA PNG만 허용합니다.');

  const bytesPerPixel=4;
  const stride=width*bytesPerPixel;
  const inflated=inflateSync(Buffer.concat(idat));
  assert.equal(inflated.length,height*(stride+1),'PNG scanline 길이가 IHDR와 다릅니다.');
  const pixels=Buffer.allocUnsafe(width*height*bytesPerPixel);
  let sourceOffset=0;
  for(let y=0;y<height;y++){
    const filter=inflated[sourceOffset++];
    assert(filter>=0&&filter<=4,`지원하지 않는 PNG filter ${filter}`);
    const rowOffset=y*stride;
    const priorOffset=(y-1)*stride;
    for(let x=0;x<stride;x++){
      const raw=inflated[sourceOffset++];
      const left=x>=bytesPerPixel?pixels[rowOffset+x-bytesPerPixel]:0;
      const up=y>0?pixels[priorOffset+x]:0;
      const upperLeft=y>0&&x>=bytesPerPixel?pixels[priorOffset+x-bytesPerPixel]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4)predictor=paeth(left,up,upperLeft);
      pixels[rowOffset+x]=(raw+predictor)&255;
    }
  }

  let transparent=0,opaque=0,partial=0;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const alpha=pixels[(y*width+x)*4+3];
      if(alpha===0)transparent++;
      else if(alpha===255)opaque++;
      else partial++;
      if(alpha>alphaThreshold){
        if(x<minX)minX=x;
        if(x>maxX)maxX=x;
        if(y<minY)minY=y;
        if(y>maxY)maxY=y;
      }
    }
  }
  assert(maxX>=0&&maxY>=0,'보이는 알파 픽셀이 없습니다.');
  let edgeAlphaClear=true;
  for(let x=0;x<width;x++){
    if(pixels[x*4+3]>alphaThreshold||pixels[((height-1)*width+x)*4+3]>alphaThreshold)edgeAlphaClear=false;
  }
  for(let y=0;y<height;y++){
    if(pixels[(y*width)*4+3]>alphaThreshold||pixels[(y*width+width-1)*4+3]>alphaThreshold)edgeAlphaClear=false;
  }
  const bounds={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
  const margins={left:minX,top:minY,right:width-1-maxX,bottom:height-1-maxY};
  return {
    width,height,backgroundAlpha:pixels[3],edgeAlphaClear,bounds,margins,
    safeMarginPx:Math.min(...Object.values(margins)),
    alphaPixels:{transparent,opaque,partial}
  };
};

const responsiveWidthHint=value=>{
  const match=String(value).match(/(?:^|[^0-9])(384|768)(?:[^0-9]|$)/);
  return match?Number(match[1]):null;
};

const collectResponsiveVariants=responsive=>{
  const variants=[];
  const visit=(value,trail=[],inheritedWidth=null)=>{
    if(typeof value==='string'){
      const format=extname(value).slice(1).toLowerCase();
      if(format==='avif'||format==='webp'){
        const width=inheritedWidth||[...trail].reverse().map(responsiveWidthHint).find(Boolean)||responsiveWidthHint(value);
        variants.push({format,width,path:value});
      }
      return;
    }
    if(Array.isArray(value)){value.forEach((child,index)=>visit(child,[...trail,String(index)],inheritedWidth));return}
    if(!value||typeof value!=='object')return;
    const localWidth=Number.isFinite(Number(value.width))?Number(value.width):inheritedWidth;
    for(const [key,child] of Object.entries(value)){
      if(key==='width'||key==='height')continue;
      visit(child,[...trail,key],localWidth||responsiveWidthHint(key));
    }
  };
  visit(responsive);
  return variants;
};

const inspectWebpSize=buffer=>{
  assert.equal(buffer.toString('ascii',0,4),'RIFF','WebP RIFF header가 없습니다.');
  assert.equal(buffer.toString('ascii',8,12),'WEBP','WebP signature가 없습니다.');
  let cursor=12;
  while(cursor+8<=buffer.length){
    const type=buffer.toString('ascii',cursor,cursor+4);
    const length=buffer.readUInt32LE(cursor+4);
    const dataStart=cursor+8;
    assert(dataStart+length<=buffer.length,`${type} WebP chunk가 잘렸습니다.`);
    if(type==='VP8X'&&length>=10){
      return {width:1+buffer.readUIntLE(dataStart+4,3),height:1+buffer.readUIntLE(dataStart+7,3)};
    }
    if(type==='VP8 '&&length>=10){
      assert(buffer.subarray(dataStart+3,dataStart+6).equals(Buffer.from([0x9d,0x01,0x2a])),'VP8 frame header가 없습니다.');
      return {width:buffer.readUInt16LE(dataStart+6)&0x3fff,height:buffer.readUInt16LE(dataStart+8)&0x3fff};
    }
    if(type==='VP8L'&&length>=5){
      assert.equal(buffer[dataStart],0x2f,'VP8L signature가 없습니다.');
      const b1=buffer[dataStart+1],b2=buffer[dataStart+2],b3=buffer[dataStart+3],b4=buffer[dataStart+4];
      return {width:1+(b1|((b2&0x3f)<<8)),height:1+((b2>>6)|(b3<<2)|((b4&0x0f)<<10))};
    }
    cursor=dataStart+length+(length&1);
  }
  assert.fail('WebP dimensions chunk를 찾지 못했습니다.');
};

const inspectAvifSize=(buffer,expectedWidth)=>{
  assert.equal(buffer.toString('ascii',4,8),'ftyp','AVIF ftyp box가 없습니다.');
  const brands=buffer.subarray(8,32).toString('ascii');
  assert(/avif|avis/.test(brands),'AVIF compatible brand가 없습니다.');
  const candidates=[];
  for(let cursor=4;cursor+16<=buffer.length;cursor++){
    if(buffer.toString('ascii',cursor,cursor+4)!=='ispe')continue;
    const boxSize=buffer.readUInt32BE(cursor-4);
    if(boxSize<20||cursor-4+boxSize>buffer.length)continue;
    const width=buffer.readUInt32BE(cursor+8);
    const height=buffer.readUInt32BE(cursor+12);
    if(width>0&&height>0)candidates.push({width,height});
  }
  assert(candidates.length>0,'AVIF ispe dimensions box를 찾지 못했습니다.');
  return candidates.find(candidate=>candidate.width===expectedWidth)||candidates[0];
};

const expectedSpritePaths=new Set();
for(const [index,entry] of manifest.characters.entries()){
  const label=`${entry.cardId} ${entry.member}`;
  assert.equal(entry.order,index+1,`${label}: order 불일치`);
  assert(/^CN-[A-F0-9]{16}$/.test(entry.cardId),`${label}: cardId 형식 오류`);
  const expectedSprite=`assets/ui/project-v/characters/zenith/zenith-${entry.cardId.toLowerCase()}-sd-v1.png`;
  assert.equal(entry.battleSprite,expectedSprite,`${label}: canonical battleSprite 경로 불일치`);
  assert(!expectedSpritePaths.has(entry.battleSprite),`${label}: battleSprite 경로 중복`);
  expectedSpritePaths.add(entry.battleSprite);
  await stat(new URL(entry.sourceArt,rootUrl));
  const spriteUrl=new URL(entry.battleSprite,rootUrl);
  const sprite=await readFile(spriteUrl);
  const hash=createHash('sha256').update(sprite).digest('hex').toUpperCase();
  assert.equal(hash,entry.sha256,`${label}: SHA-256 불일치`);
  const actual=inspectRgbaPng(sprite,manifest.assetContract.alphaThreshold);
  assert.deepEqual(entry.canvas,{width:actual.width,height:actual.height,mode:'RGBA',backgroundAlpha:actual.backgroundAlpha},`${label}: canvas 메타데이터 불일치`);
  assert.deepEqual(entry.qa.alphaBounds,actual.bounds,`${label}: alpha bounds 불일치`);
  assert.deepEqual(entry.qa.margins,actual.margins,`${label}: margin 불일치`);
  assert.deepEqual(entry.qa.alphaPixels,actual.alphaPixels,`${label}: alpha pixel 집계 불일치`);
  assert.equal(entry.qa.safeMarginPx,actual.safeMarginPx,`${label}: safeMarginPx 불일치`);
  assert.equal(entry.placement.safeMarginPx,actual.safeMarginPx,`${label}: placement safeMarginPx 불일치`);
  assert(actual.safeMarginPx>=manifest.assetContract.minimumSafeMarginPx,`${label}: ${manifest.assetContract.minimumSafeMarginPx}px 안전 여백 미달`);
  assert.equal(actual.edgeAlphaClear,true,`${label}: 이미지 가장자리에 보이는 픽셀이 닿았습니다.`);
  assert.equal(actual.backgroundAlpha,0,`${label}: 캔버스 배경 alpha가 0이 아닙니다.`);
  assert(actual.alphaPixels.transparent>0,`${label}: 투명 픽셀이 없습니다.`);
  assert.equal(entry.qa.assetStatus,'TECHNICAL_PASS',`${label}: TECHNICAL_PASS가 아닙니다.`);
  assert.equal(entry.qa.transparentRgbaVerified,true,`${label}: RGBA 검증 상태 불일치`);
  assert.equal(entry.qa.edgeAlphaClear,true,`${label}: edge QA 상태 불일치`);
  assert.equal(entry.qa.magentaStageReady,true,`${label}: MAGENTA 검수 준비 상태 불일치`);
  assert.equal(entry.qa.darkStageReady,true,`${label}: DARK_STAGE 검수 준비 상태 불일치`);
  assert.equal(entry.qa.sourceIdentityReviewed,true,`${label}: 원본 정체성 검토 상태 불일치`);
  assert.equal(entry.qa.visualApproval,true,`${label}: 사용자 최종 시각 승인이 반영되지 않았습니다.`);
  const expectedFootAnchor=[
    Number(((actual.bounds.x+(actual.bounds.width-1)/2)/actual.width).toFixed(6)),
    Number(((actual.bounds.y+actual.bounds.height)/actual.height).toFixed(6))
  ];
  assert.deepEqual(entry.placement.footAnchor,expectedFootAnchor,`${label}: footAnchor 불일치`);
  if(entry.responsive!==undefined){
    const variants=collectResponsiveVariants(entry.responsive);
    assert.deepEqual(
      variants.map(variant=>`${variant.format}-${variant.width}`).sort(),
      ['avif-384','avif-768','webp-384','webp-768'],
      `${label}: responsive 384/768 AVIF+WebP 구성이 불완전합니다.`
    );
    for(const variant of variants){
      assert(variant.path.startsWith('assets/'),`${label}: responsive 경로는 assets/로 시작해야 합니다.`);
      assert(!variant.path.includes('..')&&!variant.path.includes('\\')&&!variant.path.includes(':'),`${label}: responsive 경로가 안전하지 않습니다.`);
      const derivative=await readFile(new URL(variant.path,rootUrl));
      const dimensions=variant.format==='webp'?inspectWebpSize(derivative):inspectAvifSize(derivative,variant.width);
      assert.equal(dimensions.width,variant.width,`${label}: ${variant.format} 실제 width가 ${variant.width}px가 아닙니다.`);
      assert(dimensions.height>0,`${label}: ${variant.format} height가 올바르지 않습니다.`);
    }
  }
}

const spriteDirectory=new URL('assets/ui/project-v/characters/zenith/',rootUrl);
const actualSpriteNames=(await readdir(spriteDirectory)).filter(name=>name.endsWith('.png')).sort();
const expectedSpriteNames=[...expectedSpritePaths].map(path=>path.split('/').at(-1)).sort();
assert.deepEqual(actualSpriteNames,expectedSpriteNames,'ZENITH 디렉터리에 manifest 밖 PNG가 있거나 canonical PNG가 누락됐습니다.');

const collectTextFiles=async target=>{
  const absolute=resolve(rootPath,target);
  const info=await stat(absolute);
  if(info.isFile())return [absolute];
  const output=[];
  for(const entry of await readdir(absolute,{withFileTypes:true})){
    const child=join(absolute,entry.name);
    if(entry.isDirectory())output.push(...await collectTextFiles(child));
    else if(['.js','.mjs','.html','.css'].includes(extname(entry.name)))output.push(child);
  }
  return output;
};

const productionTargets=['index.html','service-worker.js','js','functions','admin','css'];
const productionFiles=(await Promise.all(productionTargets.map(collectTextFiles))).flat();
const forbiddenRefs=[manifest.manifestId,'assets/ui/project-v/characters/zenith/','zenith-cn-'];
const approvedBattleConsumers=new Set([
  resolve(rootPath,'js/project-v-battle-art-adapter-v1.js'),
  resolve(rootPath,'js/responsive-battle-sprites-v1815.js')
]);
for(const file of productionFiles){
  // 전투 어댑터와 전투 전용 반응형 맵만 BATTLE_ENGINE_ONLY 자산을 읽을 수 있다.
  // 덱/도감/뽑기 렌더러는 계속 전면 금지한다.
  if(approvedBattleConsumers.has(file))continue;
  const source=await readFile(file,'utf8');
  for(const needle of forbiddenRefs){
    assert(!source.includes(needle),`전투 전용 ZENITH SD가 운영 deck/dex 경로에 노출됐습니다: ${file.slice(rootPath.length)} (${needle})`);
  }
}

const previewHtml=await readFile(new URL('preview/project-v-zenith-sd-v1/index.html',rootUrl),'utf8');
const previewJs=await readFile(new URL('preview/project-v-zenith-sd-v1/zenith-sd-battle.js',rootUrl),'utf8');
assert.match(previewHtml,/v=5-bongsun/,'프리뷰 cache key가 전체 로스터 검수 버전이 아닙니다.');
assert.match(previewHtml,/TECHNICAL PASS 23 \/ 23 · VISUAL APPROVAL PENDING/);
assert.match(previewJs,/fetch\(MANIFEST_URL,\{cache:'no-store'\}\)/,'manifest를 동적으로 불러오지 않습니다.');
assert.match(previewJs,/\?sha=\$\{actor\.sha256\.slice\(0,16\)\}/,'스프라이트 cache key가 콘텐츠 해시 기반이 아닙니다.');
assert.match(previewJs,/for\(const format of \['avif','webp'\]\)/,'프리뷰가 AVIF/WebP 후보를 우선하지 않습니다.');
assert.match(previewJs,/preferred\.push\(actor\.battleSprite\)/,'PNG master fallback이 없습니다.');
assert.doesNotMatch(previewJs,/const roster=\[/,'프리뷰에 roster를 하드코딩하면 안 됩니다.');

console.log('project-v ZENITH SD assets v1: 23/23 TECHNICAL_PASS + VISUAL_APPROVED, battle-only contract OK');

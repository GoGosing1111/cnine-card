import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';

const rootUrl=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,rootUrl));
const text=path=>readFile(new URL(path,rootUrl),'utf8');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex').toUpperCase();

test('아포칼립스 보스 71/72는 승인된 투명 SD로 전투에만 연결된다',async()=>{
  const manifest=JSON.parse(await text('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'));
  const expected=[
    {
      id:71,
      name:'에드워드 엘릭',
      sourceArt:'assets/tower/apo1.jpg',
      sprite:'assets/ui/project-v/monsters/hunt-tower/hunt-071-automail-alchemist-boss-sd-v1.png',
      webp:'assets/ui/project-v/monsters/hunt-tower/hunt-071-automail-alchemist-boss-sd-v1-768.webp',
      responsive:'assets/responsive/project-v/monsters/hunt-071-automail-alchemist-boss-sd-v1-768.webp'
    },
    {
      id:72,
      name:'히무라 켄신',
      sourceArt:'assets/tower/apo2.jpg',
      sprite:'assets/ui/project-v/monsters/hunt-tower/hunt-072-reverse-blade-swordsman-boss-sd-v1.png',
      webp:'assets/ui/project-v/monsters/hunt-tower/hunt-072-reverse-blade-swordsman-boss-sd-v1-768.webp',
      responsive:'assets/responsive/project-v/monsters/hunt-072-reverse-blade-swordsman-boss-sd-v1-768.webp'
    }
  ];

  assert.equal(manifest.format,'PROJECT_V_MONSTER_BATTLE_SPRITE_MANIFEST_V1');
  assert.equal(manifest.scope,'BATTLE_ENGINE_ONLY');
  for(const item of expected){
    const entry=manifest.sprites.find(candidate=>Number(candidate.monsterId)===item.id);
    assert(entry,`monster ${item.id} manifest 누락`);
    assert.equal(entry.name,item.name);
    assert.equal(entry.sourceArt,item.sourceArt);
    assert.equal(entry.battleSprite,item.sprite);
    assert.equal(entry.battleSpriteWebp,item.webp);
    assert.equal(entry.isBoss,true);
    assert(entry.modes.includes('APOCALYPSE'));
    assert.equal(entry.qa?.technicalPass,true);
    assert.equal(entry.qa?.visualApproval,true);
    assert.equal(entry.qa?.transparentRgbaVerified,true);
    assert.equal(entry.qa?.edgeAlphaClear,true);
    assert(entry.qa?.safeMarginPx>=48);
    await read(item.sourceArt);

    const sprite=await read(item.sprite);
    assert.equal(sha256(sprite),entry.sha256);
    const spriteImage=sharp(sprite,{failOn:'error'});
    const metadata=await spriteImage.metadata();
    assert.deepEqual(
      {format:metadata.format,width:metadata.width,height:metadata.height,channels:metadata.channels,hasAlpha:metadata.hasAlpha},
      {format:'png',width:1350,height:1350,channels:4,hasAlpha:true}
    );
    const {data,info}=await spriteImage.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const edgeAlpha=[];
    for(let x=0;x<info.width;x++){
      edgeAlpha.push(data[(x)*4+3],data[((info.height-1)*info.width+x)*4+3]);
    }
    for(let y=0;y<info.height;y++){
      edgeAlpha.push(data[(y*info.width)*4+3],data[(y*info.width+info.width-1)*4+3]);
    }
    assert(edgeAlpha.every(alpha=>alpha===0),`monster ${item.id} PNG 가장자리는 완전 투명이어야 합니다.`);

    const webp=await read(item.webp);
    assert.equal(sha256(webp),entry.battleSpriteWebpSha256);
    const webpMetadata=await sharp(webp).metadata();
    assert.equal(webpMetadata.format,'webp');
    assert.equal(webpMetadata.width,768);
    assert.equal(webpMetadata.height,768);
    const responsiveMetadata=await sharp(await read(item.responsive)).metadata();
    assert.equal(responsiveMetadata.format,'webp');
    assert.equal(responsiveMetadata.width,768);
    assert.equal(responsiveMetadata.height,768);
  }

  delete globalThis.ProjectVMonsterBattleArt;
  await import(`../js/project-v-monster-battle-art-adapter-v1.js?test=${Date.now()}`);
  const adapter=globalThis.ProjectVMonsterBattleArt.createAdapter({manifest});
  for(const item of expected){
    const original={id:item.id,name:item.name,image:item.sourceArt,mode:'APOCALYPSE'};
    const art=adapter.resolveForV3(original,{mode:'APOCALYPSE'});
    assert(art);
    assert.equal(art.monsterId,item.id);
    assert.match(art.primaryUrl,new RegExp(`${item.webp.replaceAll('/','\\/')}\\?v=`));
    const adapted=adapter.adaptBattlePayload({monster:original},{mode:'APOCALYPSE'});
    assert.equal(original.image,item.sourceArt,'원본 몬스터 데이터는 변형하면 안 됩니다.');
    assert.equal(adapted.monster.image,art.primaryUrl);
    assert.equal(adapted.monster.projectVMonsterArt.kind,'MONSTER_SD');
  }

  const adapterSource=await text('js/project-v-monster-battle-art-adapter-v1.js');
  const appSource=await text('js/app.js');
  const indexSource=await text('index.html');
  const responsiveMap=await text('js/responsive-battle-sprites-v1815.js');
  assert.match(adapterSource,/manifest-v1\.json\?v=8-apocalypse-signatures/);
  assert.match(appSource,/project-v-monster-battle-art-adapter-v1\.js\?v=5\.4\.0-apocalypse-signatures/);
  assert.match(indexSource,/responsive-battle-sprites-v1815\.js\?v=2058-cheetah-sd/);
  for(const item of expected){
    assert(responsiveMap.includes(`"${item.sprite}":"/${item.responsive}"`));
    assert(responsiveMap.includes(`"${item.webp}":"/${item.responsive}"`));
  }
});

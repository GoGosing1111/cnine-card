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
      name:'에논',
      sourceArt:'preview/monster-original-ip-20261013-v1/assets/hunt-071-eltu-source-v1.png',
      sprite:'preview/monster-original-ip-sd-20261013-v1/assets/hunt-071-eltu-sd-v1.png',
      sha256:'F890EEBD38AA7D24C2ADAAC97887F4F6E547B553243A21B64BF3C7361820632B'
    },
    {
      id:72,
      name:'나기',
      sourceArt:'preview/monster-original-ip-20261013-v1/assets/hunt-072-yujin-source-v1.png',
      sprite:'preview/monster-original-ip-sd-20261013-v1/assets/hunt-072-yujin-sd-v1.png',
      sha256:'91DEEFF4413601A21B792FFBB1708901D06B0713B820FC7F7FA1E4D99F376D42'
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
    assert.equal(entry.battleSpriteWebp,undefined);
    assert.equal(entry.sha256,item.sha256);
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
      {format:'png',width:1254,height:1254,channels:4,hasAlpha:true}
    );
    const {data,info}=await spriteImage.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const edgeAlpha=[];
    for(let x=0;x<info.width;x++){
      edgeAlpha.push(data[(x)*4+3],data[((info.height-1)*info.width+x)*4+3]);
    }
    for(let y=0;y<info.height;y++){
      edgeAlpha.push(data[(y*info.width)*4+3],data[(y*info.width+info.width-1)*4+3]);
    }
    // Preserve the approved originals: Nagi has 49 antialiased edge samples
    // at alpha 1/255; Enon is alpha 0. Never rewrite art to satisfy the old canvas.
    assert(edgeAlpha.every(alpha=>alpha<=(item.id===72?1:0)),`monster ${item.id} approved edge alpha must not increase`);


  }

  delete globalThis.ProjectVMonsterBattleArt;
  await import(`../js/project-v-monster-battle-art-adapter-v1.js?test=${Date.now()}`);
  const adapter=globalThis.ProjectVMonsterBattleArt.createAdapter({manifest});
  for(const item of expected){
    const original={id:item.id,name:item.name,image:item.sourceArt,mode:'APOCALYPSE'};
    const art=adapter.resolveForV3(original,{mode:'APOCALYPSE'});
    assert(art);
    assert.equal(art.monsterId,item.id);
    assert.match(art.primaryUrl,new RegExp(`${item.sprite.replaceAll('/','\\/')}\\?v=`));
    const adapted=adapter.adaptBattlePayload({monster:original},{mode:'APOCALYPSE'});
    assert.equal(original.image,item.sourceArt,'원본 몬스터 데이터는 변형하면 안 됩니다.');
    assert.equal(adapted.monster.image,art.primaryUrl);
    assert.equal(adapted.monster.projectVMonsterArt.kind,'MONSTER_SD');
  }

  const adapterSource=await text('js/project-v-monster-battle-art-adapter-v1.js');
  const appSource=await text('js/app.js');
  const indexSource=await text('index.html');
  const responsiveMap=await text('js/responsive-battle-sprites-v1815.js');
  assert.match(adapterSource,/manifest-v1\.json\?v=20261013-original-ip-v1/);
  assert.match(appSource,/project-v-monster-battle-art-adapter-v1\.js\?v=20261013-original-ip-v1/);
  assert.match(indexSource,/responsive-battle-sprites-v1815\.js\?v=2060-nonblocking-fx/);

});

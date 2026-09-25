import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('all six live atlases are the exact user-approved pixels and retain their generation records',async()=>{
  for(const [folder,preview] of [['z-thunder-v3','assets.json'],['z-normal-lightning-v3','normal-assets.json']]){
    const m=JSON.parse(await read('assets/ui/project-v/account-battle-suits/'+folder+'/manifest.json'));
    const source=JSON.parse(await read('preview/z-body-thunder-v3/'+preview));
    assert.equal(m.status,'USER_APPROVED_LIVE');assert.equal(m.liveEnabled,true);assert.equal(m.approval.userMessage,'ㅇㅋ 전체 승인');
    for(const [key,spec] of Object.entries(m.atlases)){
      const bytes=await readFile(new URL('..'+spec.url,import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),source.atlases[key].sha256);
      const master=await readFile(new URL('../'+spec.source.file,import.meta.url));
      assert.equal(createHash('sha256').update(master).digest('hex'),spec.source.sha256);
    }
  }
});
test('production preloader, skill factory and cache refresh are connected through the common Z controller',async()=>{
  const sword=await read('preview/project-v-v3/source/battle/ZBodySwordAnimation.js');
  assert.match(sword,/ZBodyNormalFX\.preload\(\)/);assert.match(sword,/ZBodyThunderFX\.preload\(\)/);
  assert.match(sword,/battleSuitSkillEffectFactories\.set\(Z_BODY_AREA_SKILL\.code,this\.skillFactory\)/);
  assert.match(sword,/this\.intrinsicArea=Boolean\(textures\.thunderblade\)/);
  const wrapper=await read('js/battle-v3-live.js'),entry=await read('preview/project-v-v3/source/project-v-pixi-battle.src.js');
  assert.match(wrapper,/20260926-z-lightning-area-v3/);assert.match(entry,/20260926-z-lightning-area-v3/);
  assert.match(await read('index.html'),/zFx=20260926/);assert.equal((await read('js/app.js')).match(/zFx=20260926/g).length,2);
  const preview=await read('preview/z-body-thunder-v3/source/review-entry.js');
  assert.doesNotMatch(preview,/battleSuitSkillEffectFactories\s*=|new ZBodyThunderFX|new ZBodyNormalFX/,'review must exercise production registration');
});
test('the shipped main and continuous PVE engines contain the approved six-atlas runtime',async()=>{
  for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','pve-v3/battle.bundle.js']){
    const source=await read(file);
    for(const key of ['normal-lightning-wake-atlas.png','normal-lightning-surge-atlas.png','normal-lightning-slash-atlas.png','normal-lightning-impact-atlas.png','z-thunder-v3/blade-atlas.png','z-thunder-v3/ground-atlas.png'])assert.ok(source.includes(key),file+' '+key);
    assert.ok(source.includes('BATTLE_SUIT_Z_THUNDER_JUDGMENT'));
  }
});

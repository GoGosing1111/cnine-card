import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('new magic workbench is versioned and keeps the existing app cache contract',()=>{
  const index=read('index.html'),worker=read('service-worker.js'),app=read('js/app.js');
  assert.match(index,/magic-workbench-v1\.css\?v=20260922/);
  assert.match(index,/magic-workbench-v1\.js\?v=20260922/);
  assert.match(worker,/FRESH_ACCOUNT_SCRIPTS\.add\('\/js\/magic-workbench-v1\.js'\)/);
  assert.match(app,/cardIds:snapshot,presetNo,magicCardIds:magicSnapshot/);
  assert.match(app,/if\(window.MagicWorkbench\)return window.MagicWorkbench.render/);
  assert.match(read('functions/api/[[path]].js'),/magicBattleLoadout\(env,defUserRole,'PVP',\{presetNo:1\}\)/);
});
test('ranked magic slots are five separate selectors with escaped labels and no duplicate choices',()=>{
  const context={addEventListener(){}};context.window=context;vm.createContext(context);
  vm.runInContext(read('js/magic-workbench-v1.js'),context);
  const html=context.MagicWorkbench.rankedMarkup({selectedPreset:2,magicDraft:[7,0,0,0,0],magicPresets:{2:[7,0,0,0,0]}},{cards:[{id:7,name:'<script>bad</script>',quantity:1,scopes:{pvp:true},enhancementLevel:2,effectiveTriggerChance:10,imageUrl:'javascript:alert(1)'}]});
  assert.equal((html.match(/data-ranked-magic=/g)||[]).length,5);
  assert.equal((html.match(/value="7"\s+disabled/g)||[]).length,4);
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>')&&!html.includes('javascript:'));
  assert.match(html,/방어전은 항상 1번 프리셋/);
});

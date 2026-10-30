import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('desktop sidebar starts at the top without the redundant content label',async()=>{
  const [html,css,build]=await Promise.all([
    read('preview/lobby-clarity-v1/index.html'),
    read('preview/lobby-clarity-v1/style.css'),
    read('scripts/build-adventure-lobby-v2107.mjs')
  ]);
  assert.doesNotMatch(html,/sidebar-label[^>]*>콘텐츠/);
  assert.match(css,/\.sidebar\{[^}]*padding:8px 18px 32px/);
  assert.match(css,/@media\(max-width:1200px\)\{[^\r\n]*\.sidebar\{padding:8px 12px 30px\}/);
  assert.match(build,/data-standalone[^']*\.sidebar\{padding-top:8px\}/);
});

test('card and equipment destinations use separate top-level categories',async()=>{
  const [html,app]=await Promise.all([
    read('preview/lobby-clarity-v1/index.html'),
    read('preview/lobby-clarity-v1/app.js')
  ]);
  assert.match(html,/data-category="cards"[^>]*>[\s\S]*?<b>카드·용병·펫<\/b><small>도감 · 강화 · 편성<\/small>/);
  assert.match(html,/data-category="equipment"[^>]*>[\s\S]*?<b>장비 - 제작<\/b><small>장비 · 제작 · 합성<\/small>/);
  assert.doesNotMatch(html,/data-category="growth"|카드와 장비/);
  assert.match(app,/cards:\{title:'카드·용병·펫',icon:'cards'/);
  assert.match(app,/equipment:\{title:'장비 - 제작',icon:'forge'/);
  assert.match(app,/group==='equipment'\|\|group==='crafting'\|\|id==='equipmentForge'\)return 'equipment'/);
  assert.match(app,/equipmentForge',title:'장비 강화',category:'equipment'/);
  assert.match(app,/mercenaryDex:'보유 용병 확인·편성과 전체 용병 정보'/);
  assert.doesNotMatch(app,/mercenaryHangar',title:'용병 지휘소',category:'cards'/);
});

test('legacy tutorial opens the growth guide and every destination exists in the live route contract',async()=>{
  const [legacy,bridge,lobby,adapter,app]=await Promise.all([
    read('preview/lobby-clarity-v1/tutorial/index.html'),read('preview/lobby-clarity-v1/tutorial/bridge.js'),
    read('preview/lobby-clarity-v1/index.html'),read('js/soopketmon-v21-exact-shell-adapter.js'),read('preview/lobby-clarity-v1/app.js')
  ]);
  const {STEPS,ROUTES,LIMITED_NOTICE}=await import('../ui/growth-guide/content.mjs');
  assert.match(legacy,/bridge\.js\?v=20261024-growth-guide/);
  assert.match(bridge,/location\.replace\(guide.href\)/);
  assert.match(bridge,/searchParams\.set\('account',account\)/);
  assert.match(lobby,/data-src="\/ui\/growth-guide\/\?v=20261030-1"/);
  assert.match(lobby,/초보유저 성장팁/);
  assert.doesNotMatch(lobby,/처음 오셨나요|첫 이용 안내/);
  for(const step of STEPS)for(const block of step.blocks)for(const [route] of block.links||[]){
    assert.ok(ROUTES[route],route+' must have a standalone fallback');
    const inAdapter=adapter.includes(route+': Object.freeze(');
    const standaloneEntry=app.includes("{id:'"+route+"',title:")&&app.includes(route+":'"+ROUTES[route]+"'");
    assert.ok(inAdapter||standaloneEntry,route+' must exist in the live navigation contract or an explicit standalone lobby destination');
  }
  const {safePublicPath}=await import('../packaging/windows-client/lib/policy.mjs');
  for(const file of ['index.html','app.js','content.mjs','style.css'])assert.ok(safePublicPath('/ui/growth-guide/'+file),'guide must be downloadable by the desktop client');
  assert.match(LIMITED_NOTICE,/GM 권한.*수량이 늘어날.*복각 시즌/);
  assert.ok(STEPS.some(step=>step.id==='icons')&&STEPS.some(step=>step.id==='equipment'));
});

test('release ships the current guide and legacy redirect while preserving authoring files in Git',async()=>{
  const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');
  for(const file of ['ui/growth-guide/index.html','ui/growth-guide/app.js','ui/growth-guide/content.mjs','ui/growth-guide/style.css','assets/ui/growth-guide-20261024/guide-plate.webp','preview/lobby-clarity-v1/tutorial/index.html','preview/lobby-clarity-v1/tutorial/bridge.js'])assert.ok(isProductionFile(file),file+' must ship');
  for(const file of ['assets/ui/growth-guide-20261024/guide-plate-source.png','assets/ui/growth-guide-20261024/manifest.json','preview/lobby-clarity-v1/tutorial/app.js','preview/lobby-clarity-v1/tutorial/style.css'])assert.ok(!isProductionFile(file),file+' must remain authoring-only');
  const legacy=await read('preview/lobby-clarity-v1/tutorial/index.html');
  assert.doesNotMatch(legacy,/(?:src="app\.js|href="style\.css)/);
});


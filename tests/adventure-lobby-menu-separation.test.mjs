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
  assert.match(html,/data-category="cards"[^>]*>[\s\S]*?<b>카드·용병<\/b><small>도감 · 강화 · 편성<\/small>/);
  assert.match(html,/data-category="equipment"[^>]*>[\s\S]*?<b>제작소<\/b><small>장비 · 제작 · 합성<\/small>/);
  assert.doesNotMatch(html,/data-category="growth"|카드와 장비/);
  assert.match(app,/cards:\{title:'카드·용병',icon:'cards'/);
  assert.match(app,/equipment:\{title:'제작소',icon:'forge'/);
  assert.match(app,/group==='equipment'\|\|group==='crafting'\|\|id==='equipmentForge'\)return 'equipment'/);
  assert.match(app,/equipmentForge',title:'장비 강화',category:'equipment'/);
  assert.match(app,/mercenaryDex:'보유 용병 확인·편성과 전체 용병 정보'/);
  assert.doesNotMatch(app,/mercenaryHangar',title:'용병 지휘소',category:'cards'/);
});

test('optional tutorial mirrors the same card and equipment split',async()=>{
  const [html,app]=await Promise.all([
    read('preview/lobby-clarity-v1/tutorial/index.html'),
    read('preview/lobby-clarity-v1/tutorial/app.js')
  ]);
  assert.doesNotMatch(html,/sidebar-label[^>]*>콘텐츠|data-category="growth"|성장·수집/);
  assert.match(html,/data-category="cards"/);
  assert.match(html,/data-category="equipment"/);
  assert.match(app,/cards:\{title:'카드·용병',icon:'cards'/);
  assert.match(app,/equipment:\{title:'장비·제작',icon:'forge'/);
});

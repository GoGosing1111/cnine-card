import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rerollEnhancementTransfer} from '../functions/_high_grade_reroll.js';

const text=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('selected enhanced card transfers its level even when duplicate copies remain',()=>{
  assert.deepEqual(rerollEnhancementTransfer(13),{
    breakthroughTransferred:true,
    breakthroughLevel:13,
    sourceBreakthroughAfter:0
  });
  assert.deepEqual(rerollEnhancementTransfer(0),{
    breakthroughTransferred:false,
    breakthroughLevel:0,
    sourceBreakthroughAfter:0
  });
});

test('server and client enforce the selected-card enhancement transfer contract',async()=>{
  const [server,client,app,index]=await Promise.all([
    text('functions/_high_grade_reroll.js'),
    text('js/high-grade-reroll-v1354.js'),
    text('js/app.js'),
    text('index.html')
  ]);
  assert.match(server,/UPDATE user_cards SET quantity=quantity-1,breakthrough_level=0/);
  assert.doesNotMatch(server,/breakthroughTransferred=sourceQuantity===1/);
  assert.doesNotMatch(server,/CASE WHEN quantity<=1 THEN 0 ELSE breakthrough_level END/);
  assert.match(server,/sourceQuantity<=1\|\|transfer\.breakthroughLevel>0/);
  assert.match(client,/선택 강화 \+\$\{level\} 결과 카드로 이전 · 남은 중복은 \+0/);
  assert.doesNotMatch(client,/원본 강화.*유지/);
  assert.match(app,/high-grade-reroll-v1354\.js\?v=1923-enhancement-transfer/);
  assert.match(index,/js\/app\.js\?v=1940-superstar-advancement/);
});

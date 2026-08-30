import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../admin/admin-v1170-user-card-grant.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');

test('CMS 카드 수동 지급은 실제 고급 강화 등급을 +13까지 허용한다',()=>{
  assert.match(api,/const manualGrantMaxLevel=grade=>\{[\s\S]*?HIGH_BREAKTHROUGH_GRADES\.includes\(grade\)\)return 13;[\s\S]*?BREAKTHROUGH_GRADES\.includes\(grade\)\?10:0;/);
  assert.deepEqual([...api.matchAll(/const HIGH_BREAKTHROUGH_GRADES=\[([^\]]+)\]/g)].map(match=>match[1]).at(0)?.match(/[A-Z]+/g),['MA','LIMITED','FUR','ZENITH']);
  assert.match(api,/if\(card\.grade==='LIMITED'\)return json\(\{error:'LIMITED 등급 카드는 이 기능으로 지급할 수 없습니다\.'/);
});

test('CMS 유저 관리 화면은 서버 maxBreakthrough를 입력 상한으로 그대로 사용한다',()=>{
  assert.match(client,/level\.max=String\(max\)/);
  assert.match(client,/level>Number\(selectedCard\.maxBreakthrough\|\|0\)/);
  assert.match(client,/FUR·ZENITH·MA는 \+13까지 지급 가능/);
  assert.match(index,/admin-v1170-user-card-grant\.js\?v=1937-card-grant-plus13/);
});

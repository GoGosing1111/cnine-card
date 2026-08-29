import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const functionSource=/function dailyQuestAdminExcluded\(user,settings\)\{[\s\S]*?\n\}/.exec(api)?.[0];

assert.ok(functionSource,'dailyQuestAdminExcluded 함수가 있어야 한다');
const dailyQuestAdminExcluded=Function(`${functionSource};return dailyQuestAdminExcluded;`)();

test('adminTestAllowed=true면 ADMIN과 OWNER 모두 일일퀘스트를 이용할 수 있다',()=>{
  const settings={adminTestAllowed:true};
  assert.equal(dailyQuestAdminExcluded({role:'ADMIN'},settings),false);
  assert.equal(dailyQuestAdminExcluded({role:'OWNER'},settings),false);
});

test('adminTestAllowed=false면 ADMIN과 OWNER 운영계정을 모두 차단한다',()=>{
  const settings={adminTestAllowed:false};
  assert.equal(dailyQuestAdminExcluded({role:'ADMIN'},settings),true);
  assert.equal(dailyQuestAdminExcluded({role:'OWNER'},settings),true);
});

test('일반 유저는 운영계정 테스트 설정과 관계없이 제외하지 않는다',()=>{
  assert.equal(dailyQuestAdminExcluded({role:'USER'},{adminTestAllowed:true}),false);
  assert.equal(dailyQuestAdminExcluded({role:'USER'},{adminTestAllowed:false}),false);
});

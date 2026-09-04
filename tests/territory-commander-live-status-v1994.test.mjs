import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('영토전 전술 작전은 투표 없이 현재 진영 지휘관이 직접 발동한다',async()=>{
  const [server,client,legacy]=await Promise.all([
    read('functions/_territory_war.js'),
    read('js/territory-war-v1811.js'),
    read('js/territory-war-v1362.js')
  ]);
  assert.match(server,/async function activateCommanderOperation/);
  assert.match(server,/현재 지정된 진영 지휘관만 전술 작전을 발동할 수 있습니다/);
  assert.match(server,/counter_command_\$\{round\.id\}_\$\{mine\.side\}/);
  assert.match(server,/path==='territory-war\/activate-operation'\|\|path==='territory-war\/vote-operation'/);
  assert.doesNotMatch(server,/function operationRequiredVotes|async function voteOperation/);
  assert.match(client,/territory-war\/activate-operation/);
  assert.match(client,/지휘관 전술 명령/);
  assert.match(client,/지휘관 전용/);
  assert.doesNotMatch(client,/작전 투표|voteOperation|requiredVotes|myVote|team\.votes/);
  assert.match(legacy,/territory-war\/activate-operation/);
  assert.doesNotMatch(legacy,/작전 투표|voteOperation|requiredVotes|myVote|team\.votes/);
});

test('진행 중 주요 콘텐츠는 영토전 모집·준비·실전을 모두 노출한다',async()=>{
  const [api,app,index]=await Promise.all([
    read('functions/api/[[path]].js'),
    read('js/app.js'),
    read('index.html')
  ]);
  assert.match(api,/r\.status IN \('RECRUITING','PREPARING','ACTIVE'\)/);
  assert.match(api,/WHEN 'PREPARING' THEN 'PREPARING' ELSE 'BATTLE'/);
  assert.match(api,/WHEN 'PREPARING' THEN r\.starts_at ELSE r\.ends_at END deadline_at/);
  assert.match(app,/FORMATION:\{state:'편성 접수',deadline:'편성 마감'\}/);
  assert.match(app,/BATTLE:\{state:'공성 진행',deadline:'종료까지'\}/);
  assert.match(index,/territory-war-v1811\.js\?v=1994-commander-direct-live-status/);
  assert.match(index,/app\.js\?v=2005-battle-suit-independent-fire/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const html=read('mercenary-codex/index.html');
const client=read('mercenary-codex/app.mjs');
const css=read('mercenary-codex/style.css');

test('용병도감은 내 용병을 기본으로 표시하고 전체 도감을 같은 화면에서 전환한다',()=>{
  assert.match(client,/view=params\.get\('view'\)==='all'\?'all':'owned'/);
  assert.match(html,/id="ownedView"[^>]*aria-selected="true"/);
  assert.match(html,/id="allView"[^>]*aria-selected="false"/);
  assert.match(html,/id="ownedCount"/);
  assert.match(html,/id="loadoutName"/);
  assert.match(client,/catalog\.cards\.filter\(c=>ownedCard\(c\.code\)\)/);
  assert.match(client,/Lv\.\$\{fmt\(owned\.level\)\} · 보유/);
});

test('선택 상세에서 기존 원자 편성 계약만 호출하고 유실 응답을 같은 요청으로 복구한다',()=>{
  assert.match(client,/requestId:crypto\.randomUUID\(\),mercenaryCode,revision:account\.loadout\.revision/);
  assert.match(client,/localStorage\.setItem\(pendingKey\(\),JSON\.stringify\(pending\)\)/);
  assert.match(client,/api\(`mercenaries\/v3\/\$\{pending\.action\}`/);
  assert.match(client,/data-recover-loadout/);
  assert.match(client,/data-unequip/);
  assert.doesNotMatch(client,/cardIds|mercenaries\/v3\/(?:open|draw|train)/);
});

test('별도 지휘소 진입과 관련 링크는 통합 내 용병 화면으로 수렴한다',()=>{
  const legacy=read('mercenary-hangar/index.html');
  assert.match(legacy,/location\.replace\('\/mercenary-codex\/\?view=owned'\)/);
  for(const path of ['js/mercenary-deck-slot.mjs','js/mercenary-pack-live.mjs','admin/hyper-pack-v2076.js']){
    const source=read(path);assert.match(source,/\/mercenary-codex\/\?view=owned/,path);assert.doesNotMatch(source,/\/mercenary-hangar\//,path);
  }
  const lobby=read('js/adventure-lobby-v2107.js');
  assert.match(lobby,/mercenaryDex:'보유 용병 확인·편성과 전체 용병 정보'/);
  assert.doesNotMatch(lobby,/mercenaryHangar',title:'용병 지휘소'/);
});

test('보유·편성 상태와 핵심 조작은 데스크톱과 모바일에서 명확히 유지된다',()=>{
  assert.match(css,/\.roster-view-tabs button\[aria-selected=true\]/);
  assert.match(css,/\.deployment-card\.active/);
  assert.match(css,/\.row-active/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.workspace-heading\{display:grid/);
  assert.match(css,/\.deployment-actions button\{min-height:48px\}/);
});

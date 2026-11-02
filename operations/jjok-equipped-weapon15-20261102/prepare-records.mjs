import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
let source=(await fs.readFile(new URL('../jjok-equipped-armor15-20261102/record-completion.mjs',import.meta.url),'utf8')).replaceAll('\r\n','\n');
function replace(from,to){assert(source.includes(from),'Missing record fragment: '+from);source=source.replaceAll(from,to);}
replace('jjok-equipped-armor15-20261102','jjok-equipped-weapon15-20261102');
replace('summary.changedEquipment,4','summary.changedEquipment,1');
replace('changedEquipment:4','changedEquipment:1');
replace("'prepare-runner.mjs'","'prepare-discovery.mjs','prepare.mjs','prepare-records.mjs'");
replace('ops: set Jjok equipped armor and accessory to level 15','ops: set Jjok equipped weapon to level 15');
const start=source.indexOf('const entry=`'),end=source.indexOf('const dir=',start);assert(start>=0&&end>start);
const entry=[
 'const entry=`## [C9]족쪽이 장착 무기 15강 완료 — 2026-11-02',
 '',
 '- **운영 완료:** **${summary.completedAtKst}·감사${summary.auditId}**, **[C9]족쪽이 ID303**의 장착 무기 **東方軍火商(동방무기상) 0→15강**. 고유 장비 ID3033292392·카탈로그ID40·코드EQ_1788486888336·장착 보존. 기존 강화 상태 없음→level15/revision1.',
 '- 완료키 **${summary.operationKey}**. 같은 요청 새키 재실행·이후 정상 변경 덮기 금지. 무기 상태/감사/영수증 단일거래·기존 강화행 충돌시 중단. 앞선 방어구 작업키 재실행0·기존4개15강과 revision 그대로 유지.',
 '- 관련3검사·USER_LOCK/DB 이중잠금 실패/정상 원복·독립 READ ONLY·실제 장비조회5개15강/전투 강화합계·SELECT 전용 재실행쓰기0·inventory/랭크 캐시 갱신·잠금 반환. 다른 장비/연마/수량/재화/재료 보존·비용0·메시지/게임재배포/유지관리/예약0.',
 '- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git 자동정리 OFF.',
 '',
 '`;',
 ''
].join('\n');
source=source.slice(0,start)+entry+source.slice(end);
await fs.writeFile(new URL('record-completion.mjs',import.meta.url),source,{flag:'wx'});

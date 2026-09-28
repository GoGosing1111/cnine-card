# 전투 결과 대기 중 반복 렌더링 중단

2026-09-28 후속: 결과 동기화가 사망 모션을 재시작한 직후 정지하여 시체가 서 보이는 회귀를 수정했다. HP 0의 유한 DEAD 모션을 마지막 자세로 확정한 뒤 렌더링을 정지한다. 결과 화면 최적화는 유지하며 [후속 수정 기록](battle-hunt-presentation-fixes-20260928.md)을 따른다.

## 원인과 변경 범위

- 사용자 제보: PWA에서 전투 결과 화면을 오래 열어 두면 같은 Chrome의 SOOP 영상이 느려지거나 멈추고, 전투 화면을 닫으면 풀림.
- 실제 공용 V3 번들과 라이브 래퍼에서 결과 표시 후에도 Pixi ticker와 캐릭터 GSAP 대기 타임라인이 계속 실행됨을 재현했다. 기존에는 모달을 닫아야 Pixi가 멈췄고, 카드의 대기 타임라인은 전투 이벤트 타임라인 정리 대상에서도 빠져 있었다.
- 공용 엔진에 `completePlayback()`을 추가하고 라이브 `play()` 정리와 `showResult()`에서 호출한다. 확정된 마지막 상태를 한 번 그린 뒤 Pixi와 전투 소유 타임라인·슈트 대기·카드 대기를 멈춘다. 마지막 캔버스와 결과 UI는 유지한다.
- 완료 시 `requestedVisible=false`로 기록해 창을 숨겼다가 돌아와도 이전 전투를 재가동하지 않는다. 다음 전투의 `resetSession()`/`setVisible(true)`는 기존 엔진·캔버스를 재사용하고 정상 재개한다. 일반 화면 닫기도 같은 대기 모션 정리를 사용한다.
- 전역 GSAP ticker, 서버 피해·승패·보상, 전투 시계·웨이브 규칙, 스킬 효과 자산, 운영 계정은 변경하지 않는다. 공용 소스의 기존 10개 소비 번들을 빌드하고 메인 로더와 앱 쿼리를 갱신한다. 런타임 식별자는 `20260928-result-idle`이다.

## 재현 및 관련 검수

- `tests/v3-completion-idle-20260928.test.mjs`: 실제 공용 번들, 라이브 래퍼, 3개 아트 어댑터 및 라이브 CSS를 Chrome에서 실행한다. 서버 응답만 격리된 fixture로 대체하며 운영 API는 호출하지 않는다. 검수 전 사운드 OFF.
- 수정 전 실제 결과 화면에서 300ms 동안 PVE 72회, PVP 71회의 렌더 호출과 각각 5개의 대기 타임라인이 남았다. 창 숨김/복귀 후에도 계속 실행됐다.
- 수정 후 같은 측정 구간에서 PVE/PVP 모두 렌더 0회, ticker 정지, 활성 대기 타임라인 0개. 숨김/복귀에도 정지 유지. 다음 전투는 같은 엔진·캔버스에서 렌더·대기 모션 정상 재개. 즉시 결과 표시와 닫기도 정지 확인.
- PC 1440×1000 PVE, 모바일 390×844 PVP의 결과 표시·최종 HP·캔버스 유지·브라우저 오류 없음 확인. 화면 증빙: `C:/Users/User/.codex/tmp/v3-completion-20260928/fixed/`. 수정 전 증빙: 같은 경로의 `baseline/`.
- 이 수치는 격리된 로컬 Chrome의 전투 렌더 호출 측정이다. 사용자의 실제 PWA/SOOP 동시 재생이나 CPU/GPU 사용률을 측정한 결과로 표현하지 않는다.

## Scoped 배포 선택

- 직전 운영 소스: `3c2172e1cdef12550daf13d722a202eefd678922`, Pages `9cc01c91-2b37-49d4-9d71-e041d8e61af4` (Wrangler production 목록 확인).
- 그 이후 기존 커밋은 수용소 배포 결과 문서와 운영 지급 기록이며 다른 게임 실행 변경은 없다. 이번 변경은 전투 종료 수명 관리에 한정된 버그 수정이다.
- 선택 검사: `tests/v3-completion-idle-20260928.test.mjs`, `tests/v3-common-grid-v1.test.mjs`, `tests/v3-fluid-combat-v2126.test.mjs`, `tests/battle-suit-skill-chip-runtime-v2046.test.mjs`. 완료·재입장, 생성 번들 일치, 결과 데이터 표시, 서버 피해와 연속 전투 시계·취소/정리 회귀를 확인한다.
- 배포 도구가 공용 V3 수정에 필수인 `tests/pve-battlefield-entry-v2117.test.mjs`를 추가한다. 출시 플래그·캐시·Hyperdrive 검사와 지정 `npm run deploy:production -- --scoped`를 사용한다. 무관한 전체 게이트를 실행하지 않는다.

## 운영 반영 결과

- 운영 소스: `d819fb672a208b2376ce1d716bdcaf33c23efb34`. 깨끗한 작업 트리·`origin/main` 일치 상태에서 지정 scoped 배포 종료 코드 0.
- 선택 회귀 및 필수 로더 회귀 **49/49 통과**. 최종 브라우저 측정도 PVE/PVP 완료·숨김/복귀·즉시 결과·닫기에서 반복 렌더 0회와 활성 대기 타임라인 0개, 다음 전투 정상 재개를 확인했다. 최종 증빙: `C:/Users/User/.codex/tmp/v3-completion-20260928/release/`.
- 출시 플래그·캐시 호환·Hyperdrive query cache OFF 검사 통과. Pages: https://6783f1d1.cnine-card.pages.dev . clan-draft Worker: `74f13b5a-2f07-43cf-8f26-aa39c22b1e8b`.
- 2026-09-28 04:54 KST 운영 별칭의 `index.html`과 실제 로더 쿼리로 연결된 `js/app.js`, `js/battle-v3-live.js`, 공용 전투 번들 모두 HTTP 200·소스 SHA-256 일치 확인. 런타임 식별자와 완료 정리 함수도 반영됐다. 증빙: `C:/Users/User/.codex/tmp/v3-completion-20260928/production-check.json`.
- 이 결과 기록은 문서만 커밋·원격 반영하고 재배포하지 않는다. 사용 중인 PWA는 완전히 닫았다가 다시 열어 변경된 앱/전투 스크립트를 로드한다.

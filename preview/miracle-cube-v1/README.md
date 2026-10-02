# 미라클 큐브 — 2026-10-03

프리미엄 큐브를 대체할 최상위 용병 큐브의 실제 화면은 `/miracle-cube/`, OWNER 설정은 `/admin/miracle-cube.html`이다. 관리자 연출 미리보기는 `/miracle-cube/?admin=1`에서 제공한다. 미리보기는 서버 개봉 API를 호출하지 않고 큐브 차감·용병 지급도 하지 않는다. 임의 시연 확률을 운영 기본값으로 사용하지 않는다.

## 전용 리소스

`assets/ui/miracle-cube-v1/`에 닫힌 큐브, 실제 뚜껑·패널이 펼쳐지는 8단계 투명 시트, 소환실 배경을 보존했다. built-in `image_gen`으로 제작했고 원본 PNG·SHA-256은 `manifest.json`, 전체 프롬프트는 이 폴더의 `prompts.json`에 기록했다. 프로젝트용 WebP는 `scripts/build-miracle-cube-assets-v1.mjs`로 크기·인코딩만 변환하며 원본은 보존한다.

같은 화면에서 봉인 해제 → 패널 개방 → 코어 방출 → 서버 확정 용병 원화 공개로 이어진다. 8개 실제 형태 프레임을 재생하며 장시간 교차 투명 합성을 하지 않는다. C~S 기본 타임라인, SS·SSS의 추가 기대 시간을 구분한다. 10개 개봉은 가장 높은 등급부터 결과를 보여주고 모든 획득 카드·중복 수량을 선택해 확인한다.

기존 공통 메뉴, Noto Sans KR·Barlow Condensed, 네이비 패널과 라임 조작 버튼을 계승했다. 용병은 `sourceArt`를 표시하며 전투 SD로 대체하지 않는다. 기존 공용 `CNineUiFxVendor`의 GSAP 3.13.0으로 하나의 타임라인을 사용한다. UI용 Canvas 2D가 투명 시트·광원·입자를 그리며 전투 렌더러를 변경하지 않는다.

## 사운드·조작

기존 실제 녹음·폴리 편집 음원 `assets/sfx/v3-advancement-awakening-v1/`의 `riposte-advancement-v1.mp3`, `afterimage-advancement-v1.mp3`, `immortal-advancement-v1.mp3`를 잠금·개방·방출에 재사용한다. 원천과 라이선스는 `preview/project-v-advancement-fx-v1/assets/audio/PROVENANCE.md`, `manifest.json`의 Mixkit Sound Effects Free License 기록을 따른다. 기본 음량은 OFF이며 버튼으로 활성화한다. 합성 오실레이터를 추가하지 않았다.

연출 건너뛰기, 모션 축소, 화면 비활성화 시 일시정지·음원 정리, 결과 닫기를 지원한다. 응답이 끊긴 개봉은 계정별 요청 ID를 보관하고 사용자가 ‘이전 개봉 결과 확인’을 누르면 영수증을 먼저 읽는다. 결과 연출은 서버의 지급 결과만 표시한다.

## 확률·개방

등급 C/B/A/S/SS/SSS와 각 등급 안의 용병 확률을 각각 100% 기준으로 저장한다. 소수점 6자리 정수 단위로 검증하며 최종 당첨 확률도 표시한다. 같은 용병의 중복 획득은 기존 중복 보유 수량에 추가한다. 리미티드와 전역 획득 OFF 용병은 차단한다. 하이퍼팩 가중치를 수정하지 않는다.

기본 상태는 OFF·확률 미설정이다. 프리미엄 큐브 전량 종료가 운영에 먼저 반영됐으므로 신규 MIRACLE_CUBE만 사용한다. 종료된 보유분·드랍·보정 정책을 복구하거나 기존 아이템 코드로 개봉하지 않는다. OWNER가 등급 및 용병 확률을 유효하게 저장해야 ON이 가능하다.

검수는 `tests/miracle-cube-20261003.test.mjs`와 루프백 전용 `tests/miracle-cube-20261003.browser.mjs`를 실행한다. 실제 등록 등급·확률과 검수용 격리 편성을 혼동하지 않는다. 최종 운영 기록은 `docs/miracle-cube-20261003.md`에 기록한다.

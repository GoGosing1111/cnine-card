# 영토전 모집신청 · 편성 · 내 전투단 UI

영토전 입장 직후 모집신청 화면을 개편한다. 참가 신청, 남은 모집 시간, 실제 참가 인원과 신청 상태를 한 조작 패널에 모으고 모바일 390×844에서도 신청 버튼을 첫 화면 안에 배치했다. 진영 편성 단계와 내 전투단에는 소속 진영, 등록 전투력, PVP 덱 준비 상태와 기존 최신화 조건을 표시한다.

## 디자인 기준과 자산

- `docs/ui-fixed-reference-20260915.md`의 로비·용병도감·장비강화 기준: Noto Sans KR 한글, Barlow Condensed 숫자, 차콜 `#080c17`, 패널 `#111828`, 경계 `#28324a`, 본문 `#f3f5ff`, 보조문 `#8b97b0`, 라임 `#c8ff6b`.
- 사용자 첨부 `codex-clipboard-74522d6c-7837-4539-94c9-a497cee72047.png`의 라임 심볼·숲켓몬 로고를 무가공 복사해 사용한다. SOOP 플랫폼 로고로 대체하지 않는다.
- 내장 ImageGen으로 신청용 라임, 보조용 네이비, 취소용 로즈, 새로고침·닫기용 사각 버튼을 각각 생성했다. 모든 버튼 문자는 접근 가능한 실제 텍스트다. 비활성·저장 중·포커스·키보드·동작 줄이기와 44px 이상 터치 영역을 유지한다.
- 전장 배경은 기존 삼면 전선 지도와 두 진영 성채를 참조해 생성했다. 원본은 `preview/territory-formation-20261013-v1/assets/`, 런타임 자산과 로고 해시는 `assets/ui/territory-war/formation-v1/manifest.json`에 보존한다. 버튼 프롬프트는 `prompts-v2.json`, 배경 프롬프트는 `prompts.json`이다. 이전 금색 버튼 시안은 사용하지 않는다.
- 독립 미리보기 `preview/territory-formation-20261013-v1/index.html`는 예시 데이터만 표시하고 운영 API를 호출하지 않는다.

## 연결과 검수

`js/territory-formation-20261013.js`와 전용 CSS를 메인 로더에 연결한다. 기존 영토전의 모집·취소·덱 최신화·보상 수령 핸들러를 그대로 사용한다. 자동 참가 취소 제한, 편성 완료 후 최신화 잠금, 불완전 덱 복구, 휴전 중 최신화, OFF 중 보상 수령을 유지한다. 서버 코드·경제 수치·참가자·운영 모드는 수정하지 않는다.

로컬 실제 앱과 가상 API로 PC 1440×1050 / 모바일 390×844를 확인했다. 모집·신청 완료·편성·미완성 덱·미참가·휴전 중 전투단·긴 진영명·OFF·OFF 보상을 검수했다. 신청/취소/최신화/수령/닫기, 모든 표시 버튼의 생성 자산 연결과 44px 터치 영역, 이미지 로딩·가로 넘침, 실제 사용 폰트와 모바일 첫 화면 신청 버튼을 확인했다. JS 오류 없음. 결과는 `preview/territory-formation-20261013-v1/qa-report.json`에 보존한다.

## 배포 범위

단일 콘텐츠의 표현 계층 변경으로 scoped 배포를 사용한다. 선택 회귀는 `tests/territory-formation-ui-20261013.test.mjs`, `tests/territory-my-team-v2062.test.mjs`다. 이미 완료한 PC·모바일 브라우저 검사를 반복하거나 무관한 게임 전체 검사를 추가하지 않는다.

2026-10-13 11:16 KST 읽기 확인: 운영 커밋 `78932ff80f41d1bb0c0fc0a9c5f3db7a91a35619`, Pages `a522fddd.cnine-card.pages.dev`. 영토전 모드 OFF, 70회 DISABLED/V6, WAITING 146명, 네트워크 회차/거점 0건. 해당 상태를 임의로 모집 시작으로 변경하지 않는다. 공식 `npm run deploy:production -- --scoped`의 출시 플래그·캐시·Hyperdrive 검사를 유지한다.

## 운영 반영 완료

- 2026-10-13 11:21 KST 운영 확인 완료. 소스 `c9c49aeec58f81d0643eff9f38e5492de4a0d065`, Pages `6827c351-8d7d-4254-9bb2-b8a87f96a3fc`.
- 관련 회귀 14/14 PASS, PC·모바일 모집신청과 편성/전투단 브라우저 검사 PASS. 출시 플래그·캐시·Hyperdrive 검사 통과.
- 메인 로더·JS·CSS·로고·생성 버튼 4종·배경·자산 색인·미리보기 총 13개 운영 파일이 로컬 결과와 일치한다. 서비스 상태 200, 비인증 영토전 상태 401.
- OFF, 70회 DISABLED/V6, WAITING 146명, 네트워크 회차/거점 0건 및 설정 해시가 배포 전과 같다. 실제 계정의 모집신청·취소·보상 요청을 실행하지 않았다.
- API runtime `77828fd6-59eb-4390-9ed3-2ca66d6bd9e8`, clan-draft `4bb45096-d546-4641-bcaa-ee9adcfb941d`. 세부 영수증은 `territory-formation-ui-20261013-release.json`이다.
- 공개 미리보기: https://cnine-card.pages.dev/preview/territory-formation-20261013-v1/

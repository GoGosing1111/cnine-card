# 사이드메뉴 보상 · 시즌패스 접근 조건

사용자 지시: “시즌패스 보상탭에 추가하고 2차인증 가입일 3일 안된사람은 아예 메뉴자체가 안보이게”, 후속 “사이드메뉴 보상”.

- PC 사이드메뉴 **보상 → 시즌패스**, 모바일 **전체 메뉴 → 보상 → 시즌패스**로 진입한다. 전체 메뉴에서도 보상 분류에 한 번 표시하며 검색·메뉴 수에 포함한다. 기존 생성 문장 이미지를 사용한다.
- 서버가 확인한 ACTIVE 계정, 2차 인증 완료, 가입 시각부터 정확히 72시간 경과를 모두 만족해야 보인다. 후원 등록 전이라도 이 조건을 만족하면 달력을 볼 수 있으며 실제 수령은 기존 후원 기간·당일 보상 조건을 따른다.
- `server-support/status`와 `server-support/info`의 `seasonPassVisible`로 판정한다. 응답을 받기 전·조회 실패·미인증·가입 72시간 미만에는 항목이 없고 검색에도 나오지 않는다. ID 1 OWNER의 기존 서버 안내 미리보기는 유지하되 시즌패스 진입에는 예외를 주지 않는다.
- 서버 안내/후원 화면의 시즌패스 바로가기도 같은 조건을 적용한다. 달력을 열 때 재조회하며 계정 변경 중 늦게 도착한 응답은 무시한다. 같은 계정의 인증 상태 갱신에도 메뉴를 다시 판정한다.
- 기존 30일 보상·수량·수령 거래·CMS ON/OFF·후원 등록은 변경하지 않는다. 운영 계정에 보상을 지급하거나 설정을 수정하지 않았다.

검수: 실제 공용 로비 번들·메뉴 계약·후원 API와 로컬 SQLite 계정으로 Chrome 1440×1000, 390×844를 확인했다. 사이드 보상/모바일 분류 이동, 검색과 메뉴 수, 달력 30칸·닫기 후 키보드 포커스, 가입 72시간 미달·미인증·정지 계정 숨김, 미인증 OWNER 안내 우회 차단, 독립 페이지 메뉴, 같은 계정 인증 갱신, 계정 전환 시 이전 응답 무시를 통과했다. PC·모바일 화면을 직접 확인했으며 가로 넘침과 스크립트 오류가 없다.

증빙: `C:/Users/User/.codex/tmp/supporter-season-pass-20261010/qa-menu.mjs`, `menu-report.json`, `menu-desktop-rewards.png`, `menu-mobile-rewards.png`, `menu-mobile-calendar.png`, `menu-mobile-ineligible.png`. 생성 번들과 소스 일치 검사도 통과했다.

국소 메뉴·표시 조건 수정으로 scoped 배포한다. 공통 인증/세션이나 DB 기반 변경이 아니다. 직전 운영 기준 `1e35b3e65ae659172f5ba44414655392381a7e42`(Pages `72611894`) 위에서 `tests/supporter-season-pass-menu-20261011.test.mjs`의 SQLite·PostgreSQL 경계/접근 검사와 Worker 컴파일을 지정 배포 명령에서 한 번 실행한다. 거래 구현과 무관한 전체 검사는 반복하지 않는다. 운영 결과는 후속 JSON에 기록한다.

운영 반영 완료: 관련 검사 2건과 Worker 컴파일을 통과하고 소스 `eac3d88d601be170f8d65a17539fe8f6b086a1dc`를 scoped 배포했다. Pages `7262cc90`, API runtime `95ae8adb-cb72-453e-a861-77e19ed88697`다. 운영 메인·서비스워커·로비 번들·후원 모듈 4개가 로컬 배포본과 SHA-256 일치하며 서비스 상태 200, 미로그인 후원 status/info 401을 확인했다. [운영 검증 기록](supporter-season-pass-menu-20261011.json). 후속 기록은 문서 전용이며 재배포하지 않는다.

## 시즌패스·후원 화면 캡처 차단 검토

사용자 후속 “시즌패스랑 후원관련 캡처 막을수있나도 검토해봐라”에 따라 현재 `manifest.webmanifest`의 standalone PWA와 웹 모듈 구조를 확인했다. 검토 요청으로 캡처 방해 코드나 워터마크를 운영 화면에 추가하지 않았다.

이후 사용자 “일단 가능한 선에서만 막아 우회는 어쩔수없고”로 범위 내 구현을 지시했다. 실제 적용·검수·배포 기록은 [시즌패스·후원 화면 캡처 억제](supporter-screen-guard-20261011.md)를 따른다.

- 현재 웹/PWA 구조에서는 운영체제의 화면 캡처·외부 녹화까지 일괄 차단하거나 모든 캡처를 확실히 감지할 수 없다. W3C의 [PWA 캡처 방지 제안 논의](https://github.com/w3c/manifest/issues/1154)는 구현된 manifest 속성이 아니며, 모든 브라우저에서의 보장 문제를 지적한다.
- [`Permissions-Policy: display-capture`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture)는 해당 문서가 `getDisplayMedia()`를 호출할 권한을 제어한다. 화면 자체가 다른 프로그램에 캡처되지 않게 보호하는 설정으로 사용할 수 없다.
- [`visibilitychange`](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)는 탭/창의 표시 상태 이벤트다. 다른 탭으로 전환할 때 화면을 가릴 수 있지만 일반 스크린샷·OBS 감지로 간주해서는 안 된다. 우클릭·복사·PrintScreen 키 차단도 운영체제 전체 캡처 방지 보장이 아니다.
- 웹에서 현실적인 보조책은 시즌패스/후원 영역에 계정 식별 코드·시각 워터마크를 표시해 무단 공유를 억제하는 것이다. 개발자 도구 제거·잘라내기로 우회할 수 있어 완전 차단이나 확정 증거가 아니다. 기존 서버 접근 제한은 허가되지 않은 계정의 조회를 막는 별도 보호다.
- Android 전용 앱을 별도로 운영하면 [`FLAG_SECURE`](https://developer.android.com/security/fraud-prevention/activities)로 해당 화면의 OS 캡처·일부 화면 공유를 제한할 수 있다. 현재 웹 코드에 넣는 CSS/JavaScript 옵션은 아니며, 외부 카메라 촬영까지 막는 수단도 아니다.

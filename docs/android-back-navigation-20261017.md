# Android 1.1.1 인게임 뒤로가기 수정

사용자 10:20 실기기 제보에서 인벤토리/PVP의 Android 뒤로가기가 1.1.0 게임 준비 화면으로 복귀했다. 원인은 메뉴 전환이 SPA 내부 상태만 변경하는데 `GameActivity.onBackPressed()`가 WebView 방문 기록이 없으면 Activity를 종료한 것이다. 보안 차단 설정과 별개의 내비게이션 결함이다.

## 수정 범위

- APK에 `packaging/android-direct/web/game-back.js`를 포함하고 OS 뒤로가기 때 고정 스크립트를 실행한다. 신뢰 게임 출처를 확인하고 결과만 받으며 네이티브 명령을 웹 페이지에 노출하는 브리지는 추가하지 않는다.
- 열린 HTML dialog와 공통 메뉴의 shadow DOM dialog는 기존 cancel 이벤트를 사용한다. 상세창은 기존 닫기 버튼을 누른다. 닫기가 막혀 있거나 처리 중이면 뒤로가기를 소비하여 런처 이탈을 막는다. 전투·보상 완료나 DOM 강제 삭제를 직접 실행하지 않는다.
- 인벤토리/PVP 등 실제 게임 메뉴는 기존 `SoopketmonV21ExactShell.navigate('home')`으로 이동한다. PVP 저장 중/미저장 편성 및 기존 화면 이탈 보호를 유지한다.
- 독립 페이지의 실제 WebView 방문 기록과 자식 창 닫기는 유지한다. 로비는 두 번 누르기 안내 후 2초 이내 두 번째 입력에서만 준비 화면으로 돌아간다. 스크립트 오류·아직 로딩 중인 페이지는 즉시 앱 종료로 처리하지 않는다.
- 버전 `1.1.1` / code `4`, 기존 packageId·서명·리소스 저장·업데이트 피드를 유지한다. 기존 빌드 폴더를 사용할 때도 Gradle versionCode와 생성 설정이 맞도록 준비 스크립트를 보완했다.

## 검증

`tests/android-back-navigation-20261017.browser.mjs`는 현재 저장소의 실제 index/app/router와 APK에 포함되는 동일 스크립트를 실행했다. 모든 API는 가짜 사용자 응답으로 대체했고 실제 계정 요청은 보내지 않았다.

10개 확인 통과: 실제 인벤토리가 브라우저 기록을 만들지 않는 원인 재현, 인벤토리/PVP→로비, 로비 결과 구분, 공통 메뉴 먼저 닫기, 바탕 메뉴 유지, 상세 닫기 1회, 처리 중 창 보호, 실제 PVP 저장 중 이동 차단, JS 오류 0건. 기록/이미지는 `docs/qa/android-back-navigation-20261017/`다.

Android assembleRelease/lintRelease와 APK 서명·패키지·버전·zipalign·연결 검증을 통과했다. Lint 오류 0, 기존 경고 63이다. 변경 없는 리소스 저장소의 전체 재다운로드 검사는 반복하지 않았다. APK 내부 `assets/game-back.js`를 직접 읽어 브라우저 검수 소스와 같은 SHA-256 `f36b97ac389af0d3f3e3f2fc8320178b38b0280609cb850ac148d092e2d782ad`임을 확인했다.

최종 파일 `ReverseCall-Android-1.1.1.apk`: 3,665,960 bytes, SHA-256 `60d806890f694e18112dc132dd2f46c6d7a995c365d086a3c83b2a493c7107e3`. 기존 Android 패키지/서명과 DK 대상 회귀 2개도 통과했다.

**연결된 Android 실기기가 없어 수정 APK의 실제 OS 뒤로가기·업데이트 설치를 직접 검수하지 못했다.** 사용자 첨부는 이전 1.1.0의 오류 증거이며 새 버전의 성공 증거로 사용하지 않는다.

이번 변경은 APK 전용이다. 웹 게임·서버는 재배포하지 않고 Android 릴리스 `android-v1.1.1`과 전용 피드만 발행한다. Windows 최신 릴리스는 유지한다. 1.1.0 이용자는 준비 화면의 다시 확인 → 업데이트 설치 또는 새 APK 덮어 설치로 전환한다.

2026-10-17 10:28 KST 소스 `815393374b96bbf190ce899c4e7e8df1748980a8`로 Android 1.1.1을 공개하고 공개 다운로드의 해시를 확인했다. Windows 최신 릴리스는 `v0.1.7`로 그대로였다. 발행 영수증은 같은 검수 폴더 `publish-receipt.json`에 보존하고 후속 커밋에서 검증한 바이너리의 피드를 반영한다.

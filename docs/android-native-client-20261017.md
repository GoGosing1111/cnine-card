# Android 전용 파일 저장과 APK 업데이트 — 2026-10-17

사용자 `추가 구현 해`와 `전용 리소스 저장 방식으로 전환 (권장)` 선택을 적용한다. 기존 1.0.1은 TWA였으며 APK 수동 설치와 브라우저 캐시를 사용했다. 1.1.0은 자체 Android WebView와 앱 내부 영구 파일 저장소, 별도 APK 업데이트 피드를 사용한다. DK 배포 대상은 <https://www.playdk.kr/board/skm/1336497>다.

## 동작

- 실행/게임에서 런처 복귀 → 새 APK 확인·다운로드 → 필수 게임 파일 검사·준비 → 게임 시작. Android 설치는 별도 `업데이트 설치` 버튼과 OS의 최종 확인을 거친다. 전투 중 설치하지 않는다.
- 게임 주소는 `https://cnine-card.pages.dev/?source=android&distribution=dk`. WebView 프로필은 Chrome/PWA와 분리되므로 기존 개인키로 한 번 다시 로그인해야 할 수 있다. 서버 계정·보유·진행 정보는 기존 계정으로 이어진다.
- `filesDir/resources-v1/objects/<sha256>`에 파일을 보관한다. 일반 HTTP/PWA 캐시의 유지 여부에 의존하지 않는다. 앱 삭제/앱 데이터 삭제 시 로컬 파일과 로그인 상태는 없어지며 다시 준비한다.
- 기존 `/client/windows/manifest.json`의 정적 파일 목록·해시·크기·필수 여부를 읽는다. Windows 실행파일 최소 버전을 Android에 적용하지 않는다. Android 버전은 전용 피드에서 관리한다.
- HTML/JS/CSS/폰트/WASM 등 필수 파일부터 4개 연결로 준비하고, 이미지·음원·영상은 요청할 때 검증·저장한다. 다운로드 중 임시 파일은 제공하지 않는다. 크기와 SHA-256이 맞아야 활성화한다.
- 다음 준비에서 필수 파일 해시를 다시 검사한다. 같은 크기/수정 시각으로 손상돼도 다시 받는다. 같은 해시는 재사용하며 변경된 파일만 다운로드한다. 실패하면 이전 완성 목록을 유지한다.
- 플레이 중 목록을 고정한다. 다음 런처 준비에서 새 목록을 반영한다. 768 MiB를 기준으로 오래된 선택 파일을 정리하되 현재/이전 필수 파일은 보존한다. 실행 중 즉시 제한하는 엄격한 최대치는 아니다.
- 저장 허용 경로·파일 형식·HTTPS 출처를 제한한다. `/api`, POST, 인증/계정 응답, WebSocket은 가로채서 저장하지 않는다. 게임 이용에는 인터넷이 필요하다. 별도 네이티브 JavaScript 브리지는 노출하지 않는다.
- 자체 프로필에서 `/service-worker.js` 등록을 차단하고 정적 요청은 네이티브 저장소로 처리한다. 다른 브라우저의 캐시나 서비스워커는 변경하지 않는다. 저장된 미디어의 HEAD/단일 Range 요청을 지원한다.

## 앱 업데이트와 배포

- 패키지 `dev.pages.cnine_card.twa`, 버전 `1.1.0`, versionCode `3`, minSdk 24, targetSdk 36. 패키지 문자열은 기존 APK 위에 설치하기 위한 호환 식별자다.
- 원래 인증서 SHA-256: `1A:16:4D:EA:3A:2B:E5:F9:FA:53:AE:10:7E:D0:B7:5E:5E:A5:65:86:23:7B:DD:F2:73:E4:76:28:6C:24:1E:15`.
- 서명된 APK: `ReverseCall-Android-1.1.0.apk`, 3,664,063 bytes, SHA-256 `28dee54f29a7abae49156c6f8e1d5eebd2dd8c91a72e1596a47975be7d3797cd`.
- Android 피드: <https://raw.githubusercontent.com/GoGosing1111/cnine-card/main/packaging/android-direct/latest.json>.
- 다운로드 URL: <https://github.com/GoGosing1111/cnine-card/releases/download/android-v1.1.0/ReverseCall-Android-1.1.0.apk>.
- 고정 피드에서 더 큰 versionCode만 받는다. APK URL·리다이렉트 호스트·크기·SHA-256·패키지·버전·배포 인증서 및 현재 설치 인증서를 확인한다. 시스템 설치기에는 검증된 APK 한 파일만 임시 읽기 권한으로 전달한다.
- 설치 허용 설정/설치 취소/다운로드 실패는 현재 앱을 제거하지 않는다. 기존 1.0.1에는 업데이트 기능이 없어서 이번 1.1.0은 한 번 직접 설치한다.
- 공개 바이너리 먼저 → 공개 다운로드 해시 확인 → `latest.json` 커밋·푸시 순서다. `publish-apk.mjs`는 Android prerelease와 `make_latest:false`를 사용하고 Windows 최신 릴리스가 그대로인지 확인한다. 기존 릴리스 파일을 덮어쓰지 않는다.
- DK 게시글 본문·설치안내·운영자 업로드 안내는 APK 전달 폴더에 있다. DK 게시 완료로 기록하지 않는다. Play 등록은 이번 범위가 아니다.

## 실제 검증과 한계

- Java 저장소/정책 회귀 20개 통과: 필수만 최초 다운로드, 두 번째 실행 네트워크 0건, 선택 리소스 재사용, 같은 크기/시각 손상 복구, 변경 파일만 받기, 실패 시 이전 버전 유지, 경로/API/POST 제한, 미디어 범위, 잘못된 APK 주소/서명/패키지/다운그레이드 거부.
- 실제 운영 releaseId `ab72fc6a9d11b1e2a71f523b3ae70146f13d1339f9f7a7dfd8e5d9f0c3dbbcfb`: 필수 고유 파일 **1,579개 / 103,193,657 bytes (98.4 MiB)** 검증·저장 성공. 두 번째 준비 추가 다운로드 **0건**. 이 수치는 해당 운영 목록 기준이며 이후 파일 변경에 따라 달라진다.
- 저장된 실제 파일을 브라우저 요청에 연결하여 390px 로그인 화면 확인: 디스크 응답 238건, 온라인 응답 10건, pageerror 0건. 로그인/재화 쓰기 요청은 실행하지 않았다.
- Android/Play 기존 패키지·서명·브랜드·배포 대상 회귀 5개 통과. APK `assembleRelease`/`lintRelease`, v2 서명, zipalign, 컴파일된 패키지/버전/URL/SDK/보안 설정, 네이티브 소스 해시, 운영 인증서 연결 및 승인 아이콘 검증을 수행했다.
- Lint Error/Fatal 0, Warning 63. 생성 아이콘/미사용 템플릿 리소스와 Android 호환 속성·문구·용량 API 등에 관한 경고다. 오류와 구분해 전달 기록에 보존한다.
- ImageGen 배경·버튼은 `packaging/android-direct/art/` 원본·WebP·프롬프트·SHA-256에 보존하고 실제 Native UI에 연결했다. 실시간 상태·진행률·문구는 Android View다. 브라우저 참고 레이아웃은 320×568, 390×844, 800×1200, 1100×760에서 가로 넘침/버튼 크기/이미지 표시를 확인했다. 작은 화면은 세로 스크롤로 모든 버튼에 접근한다.
- **연결된 Android 기기 없음.** 브라우저 참고 이미지와 JVM 검증은 실제 Android 화면·설치·로그인·WebGL 전투·OS 뒤로가기·다음 버전 설치 허용/취소 검수가 아니다. 해당 실기기 확인은 미완료다. 기술 검수를 사용자 시각 승인으로 기록하지 않는다.

## 범위와 증거

`packaging/android-direct/native/`가 실행 코드이며 `prepare-native.mjs`가 외부 Android 프로젝트에 복사한다. Bubblewrap은 승인 아이콘과 빌드 골격만 생성하고 browser-helper 의존성은 제거한다. APK·빌드 폴더·서명 키·암호는 저장소 밖에 둔다. 빌드 명령은 `packaging/android-direct/README.txt`를 따른다.

공개 가능한 검수 자료는 `docs/qa/android-native-client-20261017/`, 전체 전달물은 `C:/Users/User/Downloads/ReverseCall-Android-1.1.0-DK/`다. 필수 파일 100MB 캐시와 비공개 서명 정보는 검수 자료에 포함하지 않는다.

게임 웹/서버 실행 코드를 변경하지 않았으므로 관련 패키징 검사와 범위 커밋·푸시, Android 릴리스/피드 발행으로 끝낸다. Pages/Worker와 무관한 전체 게임 검사·운영 재배포는 하지 않는다.

## Android 채널 발행

2026-10-17 10:09 KST, 소스 커밋 `c31ba82d1167813836e7d0397c48cf4086549a6b`로 `android-v1.1.0` prerelease를 공개했다. APK·체크섬·업데이트 JSON 업로드 해시와 공개 APK 다운로드 해시가 일치했다. Windows 최신 릴리스는 `v0.1.7`로 유지됐다. 발행 영수증은 검수 폴더의 `publish-receipt.json`이며, 이 후속 커밋에서 검증한 바이너리를 가리키는 Android 피드를 공개한다.

플랫폼 동작 근거: [Android 외부 배포](https://developer.android.com/distribute/marketing-tools/alternative-distribution), [설치 요청 허용](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()), [설치 Intent](https://developer.android.com/reference/android/content/Intent#ACTION_INSTALL_PACKAGE), [뒤로가기 호환 설정](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture), [GitHub 릴리스 API](https://docs.github.com/en/rest/releases/releases).

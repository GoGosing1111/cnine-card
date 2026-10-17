리버스콜 Google Play 신규 등록 준비 — 2026-10-12

운영자: YAKCODE
문의: elspe3821@gmail.com
앱: 리버스콜 / dev.pages.cnine_card.twa / 1.0.0 (1)

구성
- Bubblewrap 1.27.0 / Android Browser Helper 기반 Trusted Web Activity.
- Android 7.0(API 24) 이상, compile/target API 36.
- 기존 HTTPS PWA와 같은 서버·계정을 사용한다.
- 추가 결제·광고·분석 SDK를 포함하지 않는다. 웹 서비스의 데이터 처리/결제 기능은 별도 심사 대상이다.
- 승인된 20261016 리버스콜 R 아이콘을 사용한다. 시즌패스는 소개하지 않는다.
- 여기에는 빌드 설정과 등록 문구만 보관한다. Android 프로젝트, APK/AAB, SDK, 개인 서명 키는 웹 배포 디렉터리 밖에 둔다.

빌드 (PowerShell 7 / Node 22 / JDK 17)
1. 저장소 밖의 별도 폴더에 npm install --prefix <tools> --no-audit --no-fund @bubblewrap/cli@1.27.0
2. <tools>/jdk/<jdk-17>/bin/java.exe 및 <tools>/sdk에 Android command-line tools, platform-tools, platforms;android-36, build-tools;36.0.0 설치.
3. $env:PLAY_TOOLS_ROOT='<tools>'
   node scripts/play-store/generate-android.mjs '<비어 있는 외부 Android 프로젝트 폴더>'
4. ./scripts/play-store/build-android.ps1 -ProjectDirectory '<Android 프로젝트 폴더>' -ToolsDirectory '<tools>' -SigningDirectory '<외부 비공개 서명 폴더>'
5. app/build/outputs/apk/release/app-release.apk와 app/build/outputs/bundle/release/app-release.aab 확인.

서명
- 첫 빌드 시 업로드 키와 credentials.json을 지정 비공개 폴더에 한 번 생성한다.
- 이후 업데이트에는 같은 키를 재사용한다. 키 또는 암호 하나가 없으면 자동 재생성하지 않는다.
- 키/암호를 Git, 웹사이트, 스토어 이미지 또는 전달용 ZIP에 넣지 않는다. 암호화된 별도 백업을 보관한다.
- upload-certificate.der는 공개 인증서로 제출 자료에 포함해도 된다.
- .well-known/assetlinks.json의 현재 지문은 직접 배포 APK의 업로드 키 인증서다.
- Google Play App Signing을 사용하면 실제 Play 배포 APK의 서명은 다를 수 있다. 콘솔의 '앱 서명 키 인증서' SHA-256을 이 파일에 추가해야 한다. 업로드 키 지문과 혼동하지 않는다.

검증 범위
- assembleRelease, bundleRelease, lintRelease 및 APK/AAB 서명, bundletool validate.
- 실제 웹 모바일 도감/장비 진입, 로비 복귀/뒤로가기 확인.
- Android 실기기 설치·로그인·앱 복귀·뒤로가기·알림은 별도 기기 테스트가 필요하다.
- 등록 준비는 심사 승인이나 상용 배포를 의미하지 않는다. 제출 전 항목은 submission-checklist.ko.txt를 따른다.

공식 문서
TWA: https://developers.google.com/chromeos/app-development/publish/pwa-in-play
Bubblewrap: https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli
대상 API: https://developer.android.com/google/play/requirements/target-sdk

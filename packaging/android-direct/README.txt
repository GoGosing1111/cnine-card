리버스콜 Android 전용 리소스 클라이언트 / DK 직접 배포

사용자 요청: 마켓 없이 DK에서 배포, APK 자동 업데이트 추가, 전용 리소스 저장 방식으로 전환.
배포 안내 대상: https://www.playdk.kr/board/skm/1336497
버전/파일/서명 단일 기준: distribution.json

1.1.0 / versionCode 3부터 자체 WebView와 앱 전용 영구 파일 저장소를 사용한다.
기존 1.0.1 TWA를 같은 패키지·서명으로 덮어 설치하며 이번 버전은 한 번 직접 설치해야 한다.
Chrome/PWA와 프로필이 분리되어 기존 개인키로 다시 로그인해야 할 수 있다.
필수 HTML/JS/CSS/폰트/WASM을 먼저 검증·저장하고 이미지/음원은 요청 시 저장한다.
다음 실행에서는 변경·누락·손상 파일만 받는다. API·POST·계정 응답·실시간 통신은 정상 온라인 경로다.
768 MiB 기준 정리는 다음 런처 준비 때 진행한다. 현재/이전 필수 파일은 보존하므로 엄격한 최대 용량은 아니다.
게임 파일 목록은 플레이 중 고정한다. 보유·재화·전투 판정은 기존 서비스를 사용한다.
APK·Android 빌드 폴더·서명 키는 웹 저장소 밖에 둔다. DK 게시글을 자동 수정하지 않는다.

APK 업데이트
앱 실행/런처 복귀 시 고정 Android 피드를 확인하고 새 APK를 자동 다운로드한다.
SHA-256·크기·패키지·버전·설치된 앱 및 원래 인증서를 검증한다.
게임 중 설치하지 않으며 '업데이트 설치' → Android 설치 허용/최종 확인이 필요하다.
다운로드 실패·설치 취소 시 기존 앱과 준비된 리소스를 보존한다.
Android 릴리스는 prerelease/비최신 태그로 발행한다. Windows 최신 릴리스/latest.yml은 변경하지 않는다.

빌드 (PowerShell 7, 기존 Bubblewrap 1.27.0 / JDK 17 / Android API 36 도구)
pwsh -File scripts/android-direct/build-apk.ps1 -ProjectDirectory <빈 외부 빌드 폴더> -ToolsDirectory <기존 Android 도구 폴더> -SigningDirectory <원래 비공개 서명 폴더> -OutputDirectory <빈 외부 전달 폴더>

원래 upload-key.jks와 credentials.json을 반드시 재사용한다. 키가 없거나 인증서가 바뀌면 중단하며 자동 생성하지 않는다.
Bubblewrap은 승인 아이콘 변형과 Gradle 골격 생성에만 사용한다. prepare-native.mjs가 자체 Java/Manifest/전용 ImageGen 자산을 연결하고 TWA 의존성을 제거한다.
APK assembleRelease/lintRelease 후 apksigner, zipalign, 컴파일된 패키지·버전·시작 URL·SDK·네이티브 Manifest·원본 해시, 운영 Digital Asset Links와 승인 아이콘 해시를 검증한다.
완료 폴더: APK, SHA256SUMS.txt, release.json, android-update.json, 설치안내.txt, DK-게시글-본문.txt, 운영자-업로드안내.txt, 공개 검수 자료 review/.
이 전달물에는 키·암호·계정 세션을 포함하지 않는다.

저장소 핵심 회귀 (PLAY_TOOLS_ROOT는 기존 도구 폴더)
node scripts/android-direct/test-native.mjs <외부 검수 폴더>
node scripts/android-direct/test-native.mjs <외부 검수 폴더> --live
--live는 실제 필수 파일 전체를 내려받아 두 번째 준비에서 추가 다운로드가 없는지 확인한다.
node --test tests/android-direct-release-20261017.test.mjs tests/play-store-release-20261012.test.mjs
ui-preview.html은 이미지의 브라우저 레이아웃 참고용이며 Android 네이티브 화면 검수 증거가 아니다.

배포
1. 검수 후 작업 범위 커밋/푸시. Android 패키징 변경으로 웹 게임을 재배포하지 않는다.
2. node scripts/android-direct/publish-apk.mjs <검증된 전달 폴더> (읽기 검증)
3. node scripts/android-direct/publish-apk.mjs <검증된 전달 폴더> --publish
4. APK 공개·검증 후 생성된 packaging/android-direct/latest.json을 커밋/푸시한다.
5. 공개 피드와 APK 해시를 확인한다. 이미 게시된 Android 버전 파일은 덮어쓰지 않는다.
6. DK에 APK 또는 실제 다운로드 링크와 DK-게시글-본문.txt를 올린다. 스크립트는 DK 글을 편집하지 않는다.

Android 실기기의 설치·로그인·전투·뒤로가기·재실행 확인은 컴파일/브라우저 검사로 대신하지 않는다.
1.0.1 위 업데이트 및 다음 APK의 설치 허용·취소도 실기기에서 별도로 확인한다.
Android 7.0 이상 설치 대상이며 최신 지원 Android System WebView 및 인터넷 연결이 필요하다.
DK의 APK 첨부 허용 여부·용량 제한은 실제 업로드 시 확인한다. 막히면 승인된 HTTPS 파일 호스팅의 직접 링크를 사용하며 확장자 위장으로 우회하지 않는다.
이 작업에서는 Play 등록/심사, DK 게시, Windows GitHub 최신 릴리스 변경을 하지 않는다.

다음 APK는 같은 packageId·서명과 더 큰 versionCode를 사용한다. 별도 Google Play 앱 서명을 도입하면 APK 업데이트 호환성을 따로 검토한다.
구현·검수·배포 기록: docs/android-native-client-20261017.md
공식 웹 배포 안내: https://developer.android.com/distribute/marketing-tools/alternative-distribution

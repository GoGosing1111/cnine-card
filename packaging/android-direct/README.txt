리버스콜 Android APK / DK 직접 배포

사용자 요청: 마켓 없이 DK 게시글에서 설치 파일을 배포할 수 있도록 준비.
배포 안내 대상: https://www.playdk.kr/board/skm/1336497
버전/파일/서명 단일 기준: distribution.json

기존 Android TWA를 같은 패키지·서명으로 갱신한다. Play 준비 자료는 별도로 보존한다.
리버스콜 공식 R 아이콘과 현재 HTTPS 게임을 사용한다. 별도 경제/계정/전투 로직은 없다.
게임 콘텐츠는 운영 웹 서비스에서 로드하며 APK 자체는 다음 버전 수동 설치로 업데이트한다.
APK·Android 빌드 폴더·서명 키는 웹 저장소 밖에 둔다. DK 게시글을 자동 수정하지 않는다.

빌드 (PowerShell 7, 기존 Bubblewrap 1.27.0 / JDK 17 / Android API 36 도구)
pwsh -File scripts/android-direct/build-apk.ps1 -ProjectDirectory <빈 외부 빌드 폴더> -ToolsDirectory <기존 Android 도구 폴더> -SigningDirectory <원래 비공개 서명 폴더> -OutputDirectory <빈 외부 전달 폴더>

원래 upload-key.jks와 credentials.json을 반드시 재사용한다. 키가 없거나 인증서가 바뀌면 중단하며 자동 생성하지 않는다.
APK assembleRelease/lintRelease 후 apksigner, zipalign, 컴파일된 패키지·버전·시작 URL·SDK·보안 설정, 운영 Digital Asset Links와 승인 아이콘 해시를 검증한다.
완료 폴더: APK, SHA256SUMS.txt, release.json, 설치안내.txt, DK-게시글-본문.txt, 운영자-업로드안내.txt, 공개 검수 자료 review/.
이 전달물에는 키·암호·계정 세션을 포함하지 않는다.

Android 실기기의 설치·로그인·전투·뒤로가기·재실행 확인은 컴파일/브라우저 검사로 대신하지 않는다.
Android 7.0 이상 설치 대상이지만 TWA 지원 브라우저와 인터넷 연결이 필요하며 기기/브라우저 지원 여부는 별도다.
DK의 APK 첨부 허용 여부·용량 제한은 실제 업로드 시 확인한다. 막히면 승인된 HTTPS 파일 호스팅의 직접 링크를 사용하며 확장자 위장으로 우회하지 않는다.
이 작업에서는 Play 등록/심사, DK 게시, Windows GitHub 최신 릴리스 변경을 하지 않는다.

다음 APK는 같은 packageId·서명과 더 큰 versionCode를 사용한다. 별도 Google Play 앱 서명을 도입하면 APK 업데이트 호환성을 따로 검토한다.
공식 웹 배포 안내: https://developer.android.com/distribute/marketing-tools/alternative-distribution
TWA 웹 연결 안내: https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide

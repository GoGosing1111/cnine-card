# 리버스콜 Android APK · DK 배포 준비

사용자는 마켓 등록 없이 DK에서 배포할 APK를 요청하고 대상 게시글을 `https://www.playdk.kr/board/skm/1336497`로 지정했다. 기존 TWA와 원래 서명을 이어서 리버스콜 1.0.1을 빌드했다. DK에 올릴 실제 설치 파일과 본문·설치 안내가 준비됐다. 게시글 수정·파일 업로드는 실행하지 않았다.

## 전달물

- 폴더: `C:/Users/User/Downloads/ReverseCall-Android-1.0.1-DK/`
- APK: `ReverseCall-Android-1.0.1.apk`, 4,272,099 bytes (4.07 MiB).
- SHA-256: `7f2cd240f0ec72c336dbcc42d469c8608958214ef299f25cadac842e6b5332a3`.
- 같은 폴더의 `DK-게시글-본문.txt`, `설치안내.txt`, `운영자-업로드안내.txt`, `SHA256SUMS.txt`, `release.json`을 제공한다. `review/`는 공개 인증서, APK 설정·서명·lint와 모바일 웹 검수 기록이다. 개인 키·암호·계정은 포함하지 않는다.
- DK 첨부 제한은 확인되지 않았다. 허용되는 경우 APK 원본을 첨부하며, 제한되는 경우 승인된 HTTPS 파일 호스팅의 직접 다운로드 링크를 게시하도록 안내했다.

## 앱과 업데이트

- 이름 리버스콜, 공식 2026-10-16 R 심벌 원본에서 파생된 아이콘.
- 기존 패키지 `dev.pages.cnine_card.twa`, 버전 1.0.1 / code 2. 과거 실제 1.0.0 APK(code 1)의 패키지와 서명을 대조했다.
- 서명 인증서 SHA-256: `1A:16:4D:EA:3A:2B:E5:F9:FA:53:AE:10:7E:D0:B7:5E:5E:A5:65:86:23:7B:DD:F2:73:E4:76:28:6C:24:1E:15`.
- 시작 URL: `https://cnine-card.pages.dev/?source=android&distribution=dk`.
- Android 최소 API 24 / target·compile API 36. 네이티브 CPU 라이브러리가 없는 단일 universal APK.
- Bubblewrap 1.27.0, JDK 17.0.20.1, Gradle 8.11.1, AGP 8.9.1을 기존 로컬 도구에서 재사용했다.
- 웹 게임과 같은 서버·계정을 사용하며 온라인 접속이 필요하다. TWA 지원 브라우저가 필요하고 검증 실패 시 custom tab으로 열린다. APK가 모든 기기/브라우저에서 확인됐다고 주장하지 않는다.
- APK 자체는 같은 키·더 높은 versionCode의 파일로 수동 업데이트한다. 기존 준비본과의 서명/버전 호환 조건을 확인했지만 실제 기기의 덮어쓰기 설치는 미검수다. Play 등록과 Windows 자동 업데이트 공급처는 변경하지 않았다.

## 확인 결과

- `assembleRelease`, `lintRelease` 성공. 오류 0, 경고 18. 기존 TWA 템플릿의 방향 잠금 1, 데이터 추출 규칙 1, 미사용 리소스 7, 아이콘 중복 3, 런처 형태 5, 단색 런처 아이콘 1이다. 새로 게임/권한을 확장하지 않고 기존 설정을 유지했다.
- `apksigner verify --verbose --print-certs`: v2 서명 유효, 서명자 1명, 기존 인증서와 일치. 최소 API 24이므로 v1 서명은 요구하지 않는다.
- `zipalign -c -P 16 4`: 통과. 컴파일된 package/version/label/SDK/시작 URL과 cleartext OFF·backup OFF, debug OFF 확인.
- 운영 `/.well-known/assetlinks.json`: HTTP 200·JSON·패키지와 서명 일치. 생성에 사용하는 아이콘 2종은 운영 파일 SHA-256과 승인 색인이 일치한다.
- 관련 Node 검사 5개 통과: `tests/android-direct-release-20261017.test.mjs`, `tests/play-store-release-20261012.test.mjs`. 이전 Play 검사의 구 브랜드 아이콘 상수는 현재 승인 색인 검증으로 정정했다.
- Chrome의 390×844 모바일 웹 모드에서 실제 시작 URL HTTP 200, 로그인 입력·접속 버튼 화면 내 배치, 가로 넘침 없음, 페이지 오류 없음. 화면을 직접 확인했다. 최초 검수 스크립트의 버튼명을 실제 `기존 계정으로 접속`으로 고쳐 확인했으며 앱 코드는 변경하지 않았다.
- `adb devices -l`: 연결 기기 없음. Android 설치·로그인·TWA 주소창 제거·OS 뒤로가기·전투·재실행은 실기기 검수 대기다. 웹 에뮬레이션을 실기기 검사로 기록하지 않았다.

검수 요약은 `docs/qa/android-direct-apk-20261017/release.json`과 `mobile-web-smoke.json`에 있다. DK는 지정 URL의 브라우저 응답만 확인했으며 게시/업로드 검수는 아니다.

## 재현과 소스 반영

`packaging/android-direct/README.txt`와 `scripts/android-direct/build-apk.ps1`을 사용한다. 새 빌드는 빈 외부 프로젝트·전달 폴더와 기존 Android 도구·비공개 서명 폴더를 지정한다. 서명 불일치·비어 있지 않은 출력·웹 저장소 내부 경로는 중단한다.

변경은 Android 빌드·전달 도구, 설정, 관련 검사와 기록뿐이다. 운영 연결 파일이 이미 정상 배포되어 있으므로 게임 파일·DB·Pages·Worker 재배포는 필요 없다. APK는 저장소 밖에 두고 준비 소스를 범위 커밋으로 보존한다.

공식 근거: [Android의 웹사이트 APK 배포 안내](https://developer.android.com/distribute/marketing-tools/alternative-distribution), [TWA 연결 안내](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide).

# 리버스콜 Windows 클라이언트

독립 Electron 런처와 전용 WPF 화면의 Windows x64 설치 파일. 실제 파일 설치·제거는 내장 NSIS 엔진이 무인으로 수행한다. 게임의 기존 HTTPS 원점과 계정을 사용하며 웹/PWA 소스·계정·서비스워커 저장소를 변경하지 않는다. 0.1.5부터 게임 파일과 런처 실행 파일 모두 업데이트한다.

## ASCII User-Agent — 0.1.10

앱 시작 시 세션·창 생성 전에 전역 User-Agent를 설정하고 게임 전용 세션에도 같은 값을 적용한다. 네트워크 앱 식별자는 `Reversecall/0.1.10`이며 실제 Chromium·Electron 버전과 Windows x64 브라우저 형식을 유지한다. 한글 표시 이름 `리버스콜`, 기존 앱 ID·프로필·설치 GUID는 변경하지 않는다. DK 페이지·새 창·iframe과 HTTPS 전달 요청의 헤더를 격리 서버에서 검증한다. 기록: `docs/qa/windows-user-agent-20261027/README.md`.

## 보라색 런처 — 0.1.9

성문 배경과 REVERSE CALL 입체 글자, 짙은 보라색 패널·행동 버튼을 사용한다. 기존 R 심벌·계정·설치 GUID·자동 업데이트를 유지한다. 첫 게임 로딩도 같은 배경과 제목을 쓴다. 원화·프롬프트 색인은 `art/manifest.json`, 검수 기록은 `docs/qa/launcher-purple-20261024/README.md`다.

## 리버스콜 전환 — 0.1.7

사용자 첨부 R 심벌을 웹·PWA·Windows 공통 아이콘으로 적용하고 모든 화면의 서비스명을 리버스콜로 변경했다. 실행 파일은 `ReverseCall.exe`이며 기존 0.1.5/0.1.6 자동 업데이트 공급처와 설치 GUID는 유지한다. 기존 `%APPDATA%/숲켓몬` 프로필을 명시적으로 사용하여 이름 변경으로 로그인과 리소스 캐시가 초기화되지 않는다. 새 설치 및 업데이트 바로가기는 리버스콜로 표시한다.

## 빌드

게임 저장소 루트에서 실행한다. 빌드 디렉터리는 저장소 밖의 절대 경로여야 한다.

```powershell
node scripts/build-windows-client.mjs C:/Users/User/.codex/tmp/soopketmon-windows-build-20261015 --stage-only
Push-Location C:/Users/User/.codex/tmp/soopketmon-windows-build-20261015
npm ci
node node_modules/electron/install.js
Pop-Location
node scripts/build-windows-client.mjs C:/Users/User/.codex/tmp/soopketmon-windows-build-20261015
```

결과: 외부 빌드 디렉터리의 `release/ReverseCall-Setup-0.1.9-x64.exe`. 사용자에게는 `Setup`을 안내한다. `Engine`과 `.blockmap`, `latest.yml`은 자동 업데이트에 필요하며 공개 릴리스에 함께 업로드한다. 현재 코드 서명 인증서는 설정되지 않았다. 일반 사용자 권한으로 설치하며 바로가기와 제거 프로그램을 제공한다. 사용자 범위 선택 화면은 생략하고 현재 사용자로 자동 설정한다. 삭제 시 앱 데이터는 보존한다.

설치 안내문 원본 `LICENSE.txt`는 UTF-8로 관리한다. 빌드 스크립트가 NSIS에 넣는 `build-resources/LICENSE.txt`를 UTF-8 BOM·CRLF로 생성하므로 반드시 위 스크립트로 스테이징한 뒤 빌드한다. 명시적 `nsis.license` 경로는 electron-builder의 지역별 라이선스 인코딩 보정을 거치지 않는다. 관련 회귀 검사는 `node --test tests/windows-installer-20261015.test.mjs`다.

설치기는 `installer/window.xaml`과 `installer/Setup.cs`의 전용 창·버튼·입력창·진행·완료 화면을 사용한다. 승인 로고와 새 성채 포털 원화를 네이비·라임 디자인으로 표시한다. 회색 NSIS 페이지는 표시하지 않는다. 완료 시 사용자가 ‘리버스콜 실행’을 눌러 실행한다. `art/prompt-installer-gateway-v1.json`에 built-in image_gen 프롬프트와 원본을 보존한다.

`scripts/build-windows-installer.mjs`가 Windows 기본 .NET Framework 컴파일러로 UI·원화·UTF-8 안내문·설치 엔진을 단일 EXE에 포함한다. WebView2 등의 추가 다운로드는 없다. 설치 엔진 SHA-256과 설치된 app.asar SHA-256을 검사하고, 실행 중인 게임과 잘못된 설치 경로를 차단한다. 임시 파일 추출은 실제 바이트 진행률, NSIS 작업은 진행 중 표시를 사용한다. `--preview`는 설치·게임 실행을 하지 않는 디자인 검수다.

0.1.3은 폐차장 진입의 ‘같은 게임 화면에서 다시 요청하세요’ 오류도 수정한다. `protocol.handle`에서 빠진 Origin을 Electron의 신뢰할 수 있는 `request.initiatorOrigin`으로 전달한다. Referer로 출처를 추측하지 않고 기존 서버 출처 검사는 유지한다. 현재 0.1.5 이상은 런처 자동 업데이트를 이용하고, 그보다 오래된 설치판만 최신 Setup을 한 번 설치한다.

## 런처 자동 업데이트 — 0.1.5

0.1.4 이하 사용자는 게임과 런처를 종료한 뒤 최신 Setup을 **한 번** 설치한다. 0.1.5부터는 런처 시작·게임 종료·수동 확인·4시간 유휴 확인 때 GitHub Releases의 최신 안정 버전을 확인하고 자동 다운로드한다. 다운로드가 끝나면 ‘업데이트 후 다시 시작’으로 무인 설치 후 다시 열린다. 진행 중인 게임이나 게임 팝업, 리소스 준비가 있으면 설치를 차단한다. 단순 종료·Windows 종료에서는 설치하지 않는다.

`electron-updater` 6.8.9와 NSIS를 사용하며 파일 SHA-512를 검증한다. 다운로드 실패·해시 불일치는 현재 설치판을 교체하지 않으며 다시 확인으로 재시도한다. 확인 실패 중에도 게임 이용은 가능하다. 앱 ID·NSIS GUID·사용자 데이터 경로를 유지하여 기존 경로·로그인·화면 크기·리소스가 보존된다. 원격 게임 페이지에는 업데이트 명령을 노출하지 않는다.

업데이트 공급처는 공개 저장소 `GoGosing1111/cnine-card`의 GitHub Releases다. 이 저장소의 **최신 안정 릴리스는 Windows 클라이언트용 `vX.Y.Z`**로 유지하고 게임 웹 배포 태그를 최신 릴리스로 지정하지 않는다. 패키지에 GitHub 자격 증명은 넣지 않는다. 아래 발행 스크립트는 운영자의 Git credential 또는 `GH_TOKEN`을 발행 프로세스에서만 사용한다.

다음 런처 변경 시 `package.json`·잠금 파일·`lib/policy.mjs`의 버전을 함께 올린다. 저장소 밖의 **독립 node_modules**에서 `npm ci` 후 빌드한다(Windows junction은 의존성 누락 가능). 로컬 Electron 배포본을 재사용하려면 스테이징 후 electron-builder에 `--config.electronDist=<동일 버전 dist 절대경로>`를 전달하고 `node scripts/build-windows-installer.mjs <빌드폴더>`로 WPF 설치기를 만든다.

```powershell
# 빌드·관련 검수를 마친 뒤 소스/패키지/설치기 해시를 검사
node scripts/publish-windows-client.mjs <빌드폴더>
# 범위 커밋을 main에 푸시한 뒤 발행
node scripts/publish-windows-client.mjs <빌드폴더> --publish
```

발행 스크립트는 소스와 app.asar, NSIS와 SHA-512 메타데이터, WPF 영수증을 대조한다. 초안 릴리스에 파일을 업로드하고 GitHub의 SHA-256까지 확인한 뒤 마지막에 공개한다. 기존 버전의 파일은 덮어쓰지 않는다. 게임 서버·Pages 재배포는 필요하지 않다. 실제 설치·자동 교체·재실행 검수는 `docs/windows-client-updater-20261016.md`를 따른다.

## 화면 크기 — 0.1.4

게임 화면에서 Ctrl + 마우스 휠로 50~200%를 10%p씩 조절한다. Ctrl + ＋/－도 같은 기능이며 Ctrl + 0은 100% 복원이다. 글씨와 화면 전체에 Chromium 확대 배율을 적용한다. 일반 휠은 스크롤을 유지한다. 게임 창과 허용된 새 창에 적용하며 런처 배율은 바꾸지 않는다. 크기는 앱 사용자 데이터의 `game-display-v1.json`에 저장하고 재실행·페이지 이동·새로고침 후 복원한다.

이 기능은 현재 버전에도 포함된다. 0.1.5 이상은 런처에서 최신 버전으로 갱신하며 계정 데이터는 유지된다. 검수 기록은 `docs/windows-client-zoom-20261016.md`를 따른다.

## 리소스

- `scripts/prepare-production-assets.mjs`가 실제 배포 파일의 SHA-256·크기·필수 여부를 `client/windows/manifest.json`에 생성한다. 이후 배포도 지정된 공식 배포 명령을 사용해야 한다.
- 첫 실행 전 HTML/JS/CSS/폰트 등 필수 파일을 검증한다. 이미지·음원은 요청 시 검증해 저장한다. 모든 리소스를 미리 받거나 완전 오프라인 게임으로 만드는 구현이 아니다.
- 필수 파일을 전부 검증한 뒤 활성 버전을 원자적으로 교체한다. 파일별 SHA-256 저장소로 변경분만 받으며 실패 시 이전 버전을 보존한다.
- 0.1.6부터 검사한 전체 용량과 실제 다운로드를 구분한다. 필수 파일이 모두 정상이면 게임 시작 때 prepare를 반복하지 않고, 선택 리소스 목록만 바뀌면 검증 후 목록만 교체한다. 동일 버전 목록은 다시 쓰지 않는다. 다운로드 표시에는 변경·누락·손상 파일의 실제 전송 바이트만 사용하며, 검사·복구는 같은 길이의 손상도 SHA-256으로 확인한다.
- 앱 사용자 데이터의 `resources-v1/`만 관리한다. 약 4GB 정리 기준은 다음 게임 시작 전 적용하며 현재 실행 중인 게임에서는 파일을 정리하거나 리소스 버전을 바꾸지 않는다.
- API·로그인·서버 판정은 기존 온라인 서비스에 전달한다. 전용 프로필의 서비스워커만 차단하며 일반 브라우저/PWA에는 영향이 없다.

## 검수

0.1.6의 공통 확인창은 `lib/game-dialogs.mjs`와 `renderer/dialog.*`다. 기본 확인·알림·입력을 sandbox preload에서 교체하고 동기 반환값을 유지한다. 주 게임 창, 허용된 팝업과 콘텐츠 iframe, F5/Ctrl+R 안내에 적용한다. 표시 문구·거래·보상 판정은 변경하지 않는다. 새 릴리스의 사용자 안내는 `release-notes.txt`를 갱신한다. 상세 검수와 배포 기록은 `docs/windows-client-dialogs-20261016.md`를 따른다.

```powershell
node --test tests/windows-client-20261015.test.mjs
node --test --test-name-pattern='Pages staging' tests/image-delivery-20261015.test.mjs
node tests/windows-client-20261015.browser.mjs <외부빌드폴더> <검수출력폴더>
node tests/windows-client-origin-20261015.browser.mjs <외부빌드폴더> <검수출력폴더>
node tests/windows-installer-native-20261015.mjs <외부빌드폴더> <검수출력폴더>
```

Playwright는 외부 설치를 사용하거나 `PLAYWRIGHT_MODULE`에 ESM 모듈 위치를 지정한다. 실제 코어 전장 검수는 `tests/serve-core-raid-abandon-qa.mjs`를 실행하고, `scripts/build-windows-client-manifest.mjs`로 외부에 목록을 만든 뒤 `tests/windows-client-game-20261015.browser.mjs <빌드폴더> <목록경로> <출력폴더>`를 실행한다. 운영 API 쓰기 없이 로컬 SQL/API로 실행한다.

QA 환경변수는 패키징되지 않은 개발 앱에서만 사용한다. 원격 게임 창에는 Node·런처 IPC를 노출하지 않는다. 계정 인증 정보는 리소스 목록과 캐시에 저장하지 않는다.

출처 검수는 임시 인증서의 SPKI만 허용한 별도 Electron 프로필과 로컬 HTTPS 서버를 쓴다. 운영 URL의 호스트 해석은 검수 프로세스 안에서만 로컬로 지정한다. 실제 서버의 `assertJointOrigin`으로 수정 전 403·수정 후 200 및 외부/불투명 출처 차단을 확인한다. 인증서 저장소와 운영 서버는 변경하지 않는다. OpenSSL 경로는 `OPENSSL_PATH`로 지정할 수 있다.

설치 검수는 새 임시 디렉터리·고유 앱 ID·고유 실행 파일명·고유 레지스트리 GUID를 사용하며 기존 클라이언트를 설치하거나 종료하지 않는다. QA 전용 자동 설치 코드는 `INSTALLER_QA`로 컴파일할 때만 들어간다. 결과와 설치기 캡처는 `docs/windows-installer-20261015.md`를 따른다.

## 디자인 원본

`art/prompt-launcher-citadel-v1.json`이 built-in image_gen 프롬프트·원본·파생 파일 색인이다. 환경 그림만 새로 제작했고 기존 리버스콜 승인 로고·지휘관 원화·앱 아이콘을 복사해 사용한다. 게임 시작, 실제 다운로드 상태, 리소스 복구, 안내를 네이비·라임 기준으로 통합했다.

자세한 검수·배포 기록은 `docs/windows-client-20261015.md`를 따른다.

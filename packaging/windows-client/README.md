# 숲켓몬 Windows 클라이언트

독립 Electron 런처와 전용 WPF 화면의 Windows x64 설치 파일. 실제 파일 설치·제거는 내장 NSIS 엔진이 무인으로 수행한다. 게임의 기존 HTTPS 원점과 계정을 사용하며 웹/PWA 소스·계정·서비스워커 저장소를 변경하지 않는다. 게임 파일 업데이트는 지원하고 런처 실행 파일 자체의 자동 교체는 아직 지원하지 않는다.

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

결과: 외부 빌드 디렉터리의 `release/Soopketmon-Setup-0.1.3-x64.exe`. `Soopketmon-Engine-*`는 내장 엔진이므로 사용자에게 전달하지 않는다. 현재 코드 서명 인증서는 설정되지 않았다. 일반 사용자 권한으로 설치하며 바로가기와 제거 프로그램을 제공한다. 사용자 범위 선택 화면은 생략하고 현재 사용자로 자동 설정한다. 삭제 시 앱 데이터는 보존한다.

설치 안내문 원본 `LICENSE.txt`는 UTF-8로 관리한다. 빌드 스크립트가 NSIS에 넣는 `build-resources/LICENSE.txt`를 UTF-8 BOM·CRLF로 생성하므로 반드시 위 스크립트로 스테이징한 뒤 빌드한다. 명시적 `nsis.license` 경로는 electron-builder의 지역별 라이선스 인코딩 보정을 거치지 않는다. 관련 회귀 검사는 `node --test tests/windows-installer-20261015.test.mjs`다.

설치기는 `installer/window.xaml`과 `installer/Setup.cs`의 전용 창·버튼·입력창·진행·완료 화면을 사용한다. 승인 로고와 새 성채 포털 원화를 네이비·라임 디자인으로 표시한다. 회색 NSIS 페이지는 표시하지 않는다. 완료 시 사용자가 ‘숲켓몬 실행’을 눌러 실행한다. `art/prompt-installer-gateway-v1.json`에 built-in image_gen 프롬프트와 원본을 보존한다.

`scripts/build-windows-installer.mjs`가 Windows 기본 .NET Framework 컴파일러로 UI·원화·UTF-8 안내문·설치 엔진을 단일 EXE에 포함한다. WebView2 등의 추가 다운로드는 없다. 설치 엔진 SHA-256과 설치된 app.asar SHA-256을 검사하고, 실행 중인 게임과 잘못된 설치 경로를 차단한다. 임시 파일 추출은 실제 바이트 진행률, NSIS 작업은 진행 중 표시를 사용한다. `--preview`는 설치·게임 실행을 하지 않는 디자인 검수다.

0.1.3은 폐차장 진입의 ‘같은 게임 화면에서 다시 요청하세요’ 오류도 수정한다. `protocol.handle`에서 빠진 Origin을 Electron의 신뢰할 수 있는 `request.initiatorOrigin`으로 전달한다. Referer로 출처를 추측하지 않고 기존 서버 출처 검사는 유지한다. 이전 설치자는 게임을 종료한 뒤 새 설치 파일로 갱신해야 한다.

## 리소스

- `scripts/prepare-production-assets.mjs`가 실제 배포 파일의 SHA-256·크기·필수 여부를 `client/windows/manifest.json`에 생성한다. 이후 배포도 지정된 공식 배포 명령을 사용해야 한다.
- 첫 실행 전 HTML/JS/CSS/폰트 등 필수 파일을 검증한다. 이미지·음원은 요청 시 검증해 저장한다. 모든 리소스를 미리 받거나 완전 오프라인 게임으로 만드는 구현이 아니다.
- 필수 파일을 전부 검증한 뒤 활성 버전을 원자적으로 교체한다. 파일별 SHA-256 저장소로 변경분만 받으며 실패 시 이전 버전을 보존한다.
- 앱 사용자 데이터의 `resources-v1/`만 관리한다. 약 4GB 정리 기준은 다음 게임 시작 전 적용하며 현재 실행 중인 게임에서는 파일을 정리하거나 리소스 버전을 바꾸지 않는다.
- API·로그인·서버 판정은 기존 온라인 서비스에 전달한다. 전용 프로필의 서비스워커만 차단하며 일반 브라우저/PWA에는 영향이 없다.

## 검수

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

`art/prompt-launcher-citadel-v1.json`이 built-in image_gen 프롬프트·원본·파생 파일 색인이다. 환경 그림만 새로 제작했고 기존 숲켓몬 승인 로고·지휘관 원화·앱 아이콘을 복사해 사용한다. 게임 시작, 실제 다운로드 상태, 리소스 복구, 안내를 네이비·라임 기준으로 통합했다.

자세한 검수·배포 기록은 `docs/windows-client-20261015.md`를 따른다.

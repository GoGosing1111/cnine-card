# Windows 런처 0.1.5 자동 업데이트 — 2026-10-16

사용자 선택: **앞으로 런처 자체도 자동 업데이트 — 최초 1회 새 버전 설치 필요**.

## 동작

- 기존 0.1.4 이하 설치판은 자동 교체 기능이 없으므로 0.1.5 Setup을 한 번 설치한다. Ctrl + 휠 확대도 포함한다.
- 이후 앱 시작, 게임 종료, 수동 업데이트 확인, 게임 창이 없는 4시간 유휴 확인 때 최신 안정 버전을 확인한다. 다운로드는 게임 파일 준비와 별도로 자동 진행한다.
- 완료 후 ‘업데이트 후 다시 시작’을 누르면 NSIS가 현재 설치 경로를 갱신하고 새 런처를 실행한다. 게임 창·게임 팝업 또는 리소스 준비 중에는 버튼과 메인 프로세스에서 모두 차단한다.
- 일반 종료·Windows 종료 때 설치하지 않는다. 다운로드·확인 실패 중에도 게임을 사용할 수 있고 다음 확인에서 재시도한다. 부분 파일·SHA-512 불일치는 교체하지 않는다. 이전/같은 버전·사전 공개 버전으로 내리지 않는다.
- 앱 ID `kr.yakcode.soopketmon`, 실행 파일 `Soopketmon.exe`, NSIS GUID `c69fcbf2-955f-5c48-8ff1-55c03889cb40`, 사용자 데이터 및 세션 파티션을 유지한다.

## 구현과 배포

`packaging/windows-client/lib/client-updater.mjs`가 electron-updater **6.8.9**의 확인·검증 다운로드·명시적 설치를 관리한다. 라이브러리는 운영 의존성으로 패키징한다. 기존 Electron **44.7.2**와 electron-builder **26.15.3**, WPF 수동 설치 화면을 유지한다. 원격 게임에는 런처 브리지를 노출하지 않으며 재시작 IPC도 기존 로컬 메인 프레임 인증을 통과해야 한다.

공급처는 공개 GitHub 저장소 [GoGosing1111/cnine-card Releases](https://github.com/GoGosing1111/cnine-card/releases)다. `app-update.yml`은 이 공개 공급처만 포함하고 인증 토큰을 포함하지 않는다. 앞으로 최신 안정 릴리스는 Windows용 `vX.Y.Z`로 유지한다. `Setup`은 초기 수동 설치, `Engine`·blockmap·latest.yml은 자동 업데이트용이다.

`scripts/publish-windows-client.mjs`는 패키지와 소스, 설치 ID, WPF/NSIS 영수증, SHA-512 메타데이터를 확인하고 초안에 업로드한다. GitHub의 파일 SHA-256까지 대조한 뒤 마지막에 공개한다. 기존 버전은 덮어쓰지 않는다. 버전 변경·빌드·발행 명령은 `packaging/windows-client/README.md`를 따른다. 게임 서버와 Pages는 변경·재배포하지 않는다.

공식 구현 근거: [electron-builder v26 Auto Update](https://www.electron.build/v26/docs/features/auto-update/)의 NSIS 및 GitHub 공급처, 자동 다운로드와 수동 quitAndInstall 흐름. 최신 v27 전용 API를 혼용하지 않고 설치한 6.8.9 소스의 실제 API를 확인했다.

## 검수

1. 관련 Node 검사 **27개 통과**: 기존 리소스/출처/설치 안내문 검사와 신규 업데이트의 동시 확인 합치기, 버전 조건, 설치 중복 차단, 실행 중 차단, 다운로드 오류·재시도, 종료 시 취소.
2. `tests/windows-client-updater-native-20261016.mjs`로 별도 앱 ID·GUID·실행 파일명·사용자 데이터의 **실제 설치판 0.1.5 → 0.1.6** 교체를 검수했다. 0.1.6은 검수 전용이며 배포 버전은 0.1.5다.
3. 실제 electron-updater로 공급처 장애 → 게임 이용 가능, SHA-512 불일치 → 기존 파일 보존, 정상 재시도 → 준비 상태, 게임과 남은 팝업 → 설치 차단을 확인했다.
4. 실제 재시작 버튼 → 무인 NSIS → 새 실행 파일 자동 실행을 통과했다. 한글·공백 설치 경로, 합성 로그인 쿠키, 110% 화면 크기와 활성 리소스 목록을 보존했다. 기존 운영 설치 레지스트리는 변경되지 않았다.
5. 기본 리소스 브라우저 회귀도 통과했다. 전용 쿠키/API 요청, 정적 캐시 재사용, 복구, 원격 Node·런처 브리지 차단, 팝업만 남은 상태에서 런처 닫기·복귀를 확인했다. 운영 게임 API 쓰기는 없다.
6. 최소 950×680 창에서 다운로드 완료 안내와 재시작/게임 시작 버튼이 겹치거나 잘리지 않는 것을 확인했다. 캡처 `docs/qa/windows-client-updater-20261016/update-ready.png`.

첫 검수 빌드는 Windows node_modules junction 때문에 전이 의존성이 누락되어 실패했다. 운영 빌드는 독립 npm ci로 정상 패키징됐으며 검수도 잠금 파일 기반 독립 운영 의존성 설치로 수정 후 통과했다. 실패 기록은 `qa-packaging-junction-failure.json`, 최종 실제 교체 기록은 `report.json`이다. 무관한 게임 전체 게이트는 반복하지 않았다.

## 배포 파일

- 버전: **0.1.5**
- Setup: `Soopketmon-Setup-0.1.5-x64.exe`, **117,385,728 bytes**
- Setup SHA-256: `7a9c5a19d80d859a3f8c0fee32cdb761b20a272c06b575db19682684a0f9dfb4`
- 자동 업데이트 Engine: **113,855,943 bytes**
- Engine SHA-256: `6d32a90a620f5ea8ce71658f2168519dd707d432e7659cde9abd82a148fdd04e`
- 로컬 전달 폴더: `C:/Users/User/Downloads/Soopketmon-Windows-0.1.5-20261016/`

## 공개 완료

- 소스 커밋 `01fcd915668d93250e931978579d401d4a4730ba`를 main에 반영하고 [v0.1.5 릴리스](https://github.com/GoGosing1111/cnine-card/releases/tag/v0.1.5)를 공개했다. Setup·Engine·blockmap·latest.yml·SHA256SUMS의 GitHub SHA-256이 로컬 빌드와 일치한다. 영수증은 `publish-receipt.json`이다.
- [0.1.5 설치 파일](https://github.com/GoGosing1111/cnine-card/releases/download/v0.1.5/Soopketmon-Setup-0.1.5-x64.exe)을 바로 내려받을 수 있다. 로컬 전달 폴더에도 동일한 파일을 저장했다.
- `tests/windows-client-updater-feed-20261016.mjs`의 실제 Electron GitHub 공급처 검사 통과: 최신 버전 0.1.5, 현재 버전에 추가 업데이트 없음, 공개 SHA-512/파일 크기 일치, 설치 파일 HTTP 206 다운로드와 실행 파일 헤더 확인. 결과는 `public-feed.json`이다.
- 사용자 PC의 기존 설치판은 직접 교체하지 않았다. 이번 버전을 한 번 설치하면 이후에는 런처 안에서 업데이트한다.

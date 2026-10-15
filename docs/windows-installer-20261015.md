# Windows 0.1.3 전용 설치기·폐차장 요청 수정 — 2026-10-15

사용자 요청: 기본 회색 설치 화면 전체 교체, 설치 완료 화면 변경, 한글 깨짐 해결, 사용자 범위 선택 생략. 후속으로 설치형 클라이언트의 **폐차장** 진입 중 ‘같은 게임 화면에서 다시 요청하세요’ 오류를 함께 수정했다. 붕괴 코어 오류와 혼동하지 않는다.

## 설치기

- 기본 NSIS 창 대신 WPF 전용 창을 제작했다. 창 테두리·최소화·닫기·설치 위치·버튼·체크박스·진행·완료·이용 안내까지 네이비와 라임으로 통일했다. 승인 로고와 성채 포털 원화를 사용한다.
- 새 이미지 원본과 built-in image_gen 프롬프트는 `packaging/windows-client/art/installer-gateway-v1-source.png`, `prompt-installer-gateway-v1.json`이다. 이미지 원본은 보존하며 XAML 레이어로 화면에 배치한다.
- 현재 사용자로 설치한다. 설치 범위 선택과 관리자 권한 요청은 없고 경로 변경과 바탕화면 바로가기 선택은 유지한다. 설치 완료 후 실행은 사용자가 누른다.
- NSIS는 단일 EXE 안에서 무인 설치 엔진으로 실행한다. .NET Framework WPF를 사용하며 WebView2를 추가로 받지 않는다. 엔진 해시·설치된 app.asar 해시, 디스크 여유, 실제 경로, 게임 실행 중 여부를 확인한다.
- 안내문 원본은 UTF-8이고 NSIS 입력은 BOM 포함 UTF-8·CRLF로 생성한다. 사용자에게 표시되는 안내는 WPF에서 UTF-8로 명시적으로 읽는다. 이전 깨진 텍스트를 재사용하지 않는다.
- 진행률은 추출한 바이트이며, 엔진 설치 중에는 진행 중 애니메이션을 사용한다. 진행 중을 임의 백분율로 표시하지 않는다. 완료 화면도 같은 전용 디자인이다.

## 폐차장 오류 원인과 수정

게임 전용 세션의 HTTPS 프로토콜 처리기는 정적 리소스를 디스크에서 읽고, API는 `session.fetch`로 서버에 전달한다. Electron 44.7.2의 `protocol.handle`로 받은 요청에는 Chromium이 자동 부여하는 Origin 헤더가 아직 없었다. 이 요청을 메인 프로세스에서 다시 전송하면서 출처 문맥이 사라져 `Origin: 없음 / Sec-Fetch-Site: none`으로 도착했다. 서버의 `functions/_joint_request.js`는 출처가 게임 원점과 같지 않으면 `JOINT_ORIGIN`, HTTP 403과 해당 문구를 반환한다.

`lib/network-request.mjs`는 게임 원점으로 보내는 비 GET/HEAD 요청에 Origin이 없을 때 Electron이 제공한 `request.initiatorOrigin`을 전달한다. 이미 있는 Origin은 덮어쓰지 않는다. Referer나 현재 표시된 창 URL을 근거로 신뢰하지 않는다. 외부·불투명 출처는 그대로 전달되어 서버에서 거절된다. 서버의 보안 검사·전투 판정·입장권·보상 코드는 수정하지 않았다.

공식 API 근거: [Electron protocol.handle의 initiatorOrigin](https://www.electronjs.org/docs/latest/api/protocol), [session.fetch의 프로토콜 전달](https://www.electronjs.org/docs/latest/api/session#sesfetchinput-init). 실제 원인과 수정 효과는 아래 격리 HTTPS 재현으로 확인했다.

## 검수

- 네이티브 HTTPS로 `/api/scrapyard/v3/run` 요청을 전송하고 실제 서버의 `assertJointOrigin`을 적용했다. 수정 전 Origin 누락/403을 재현하고 수정 후 게임 Origin/`same-origin`/200을 확인했다. Authorization·JSON 본문·전용 세션 쿠키 유지, Referer가 없는 정상 요청, 외부·불투명 출처 거절까지 통과했다. 운영 요청은 0회다.
- 실제 Electron 런처에서 다운로드·캐시 재사용·복구·API 전달·원격 Node/IPC 차단 검사가 통과했다. 전송 출처 검사는 HTTP로 주소를 바꾸는 일반 QA 프록시가 아닌 별도 HTTPS 검수로 수행했다.
- 반복 스테이징의 한글 BOM/내용 보존 검사를 통과했다. 컴파일된 설치 경로 검사에서 드라이브 상대 경로·루트·시스템·사용자 루트·기존 파일 폴더를 거절하고 한글/공백 경로를 허용했다.
- 고유 QA 앱으로 실제 설치 → app.asar 해시 확인 → 무인 제거까지 통과했다. 현재 사용자 등록과 기존 숲켓몬 레지스트리 보존을 확인했다. QA 앱을 게임으로 실행하거나 운영 계정에 접속하지 않았다.
- 실제 전용 설치창과 완료창을 직접 확인했다. 캡처: `qa/windows-installer-20261015/setup-design.png`, `setup-complete.png`. 캡처는 설치하지 않는 디자인 미리보기이며 실제 파일 설치 검수는 별도 보고서다.

## 전달

0.1.3은 설치 파일 갱신이다. 기존 PWA나 서버에 점검·재배포를 하지 않는다. 런처 실행 파일 자동 교체가 아직 없으므로 기존 사용자는 게임을 종료하고 새 설치 파일을 실행해야 한다. 기존 로그인·다운로드 데이터는 설치 경로와 별도의 사용자 데이터 폴더에 보존된다.

전달 파일: `C:/Users/User/Downloads/Soopketmon-Windows-0.1.3-20261015/Soopketmon-Setup-0.1.3-x64.exe`.
파일 크기 116,979,712바이트, SHA-256 `71adce46871d5d91663721a25a9b593068c66cb638b43e4bb4310aec44e792a6`.
내장 app.asar SHA-256 `8799cb799f3d76bd5ebe07820cfcea802535cc3513a79739335bfe6566460bf5`.
코드 서명 인증서와 공개 업로드 채널은 새로 설정하지 않았다. 검수 보고서와 빌드 영수증은 같은 QA 폴더에 보존한다.

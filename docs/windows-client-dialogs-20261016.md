# Windows 0.1.6 공통 확인창 / 콘텐츠 현황 보스 이름

사용자 요청은 Windows의 모든 기본 확인 멘트 디자인 통일이며, 후속으로 콘텐츠 현황에서 월드레이드의 옛 IP 이름이 보이는 오류를 함께 수정한다.

후속으로 같은 용량의 업데이트가 반복되는 현상을 함께 수정했다. 기존 코드는 정상 파일이 준비되어도 게임 시작마다 prepare를 실행하고, 전체 검사 바이트를 다운로드 용량처럼 표시했다. 선택 이미지·음원 목록만 바뀌어도 releaseId 차이만으로 업데이트 버튼이 나타났다. 기존 검수에서도 반복 리소스 다운로드는 0건이었으며, 사용자의 과거 네트워크 트래픽을 측정한 것은 아니다.

## 변경 없는 실행

- 업데이트 정보와 필수 파일 SHA-256을 확인하고, 모두 정상이면 바로 준비 완료로 표시한다. 목록만 달라진 경우 활성 목록만 원자적으로 교체한다. 같은 목록은 다시 쓰지 않는다.
- 준비 완료 상태의 게임 시작은 prepare와 다운로드 단계를 생략한다. 캐시 용량 정리는 기존대로 게임 시작 전에 수행한다.
- 새 다운로드 총량은 해시로 중복을 제거한 변경·누락·손상 파일의 합이다. 전체 파일 검사 바이트와 실제 네트워크 전송 바이트를 분리해 표시한다. 수동 검사·복구와 취소·실패 시 이전 활성 목록 보존은 유지한다.
- 작은 업데이트 정보 조회는 최신 버전 확인을 위해 남는다. 선택 이미지·음원은 실제 이용 시 받고, 런처 자체의 새 버전은 별도의 자동 업데이트 패널에서 표시한다.

## 클라이언트

`packaging/windows-client/lib/game-dialogs.mjs`와 `renderer/dialog.html/css/js`를 공통으로 사용한다. 런처와 같은 네이비·라임, 승인 아이콘·한글 글꼴, 읽기 쉬운 본문과 고정 하단 버튼을 적용했다. 확인·알림·입력·F5/Ctrl+R 안내와 실행 오류에 사용한다. 새 일러스트를 생성하거나 승인 원본을 수정하지 않았다.

- sandbox preload가 페이지의 첫 스크립트 전에 confirm/alert/prompt를 교체한다. 동기 IPC 결과를 기다리는 동안 별도 모달 렌더러가 응답하므로 기존 boolean/undefined/string/null 계약을 유지한다. Promise를 confirm 반환값으로 넣지 않는다.
- 주 게임 창, 허용 팝업, 조직 등 삽입 콘텐츠에 같은 preload를 적용한다. `nodeIntegrationInSubFrames`는 프레임 preload 실행에 사용하며 sandbox=true·contextIsolation=true·nodeIntegration=false를 유지한다. 실제 main/iframe에서 require/process/ipcRenderer/런처 브리지 미노출을 검수했다.
- 등록된 게임 WebContents와 실제 연결 프레임·허용 HTTPS 출처만 요청할 수 있다. 답변·초기 데이터·크기 IPC는 정확한 로컬 대화상자 메인 프레임만 허용한다. 범용 IPC나 업데이트 명령을 페이지에 노출하지 않는다.
- 취소·X·ESC·기본 초점 Enter·창 종료는 취소다. 입력은 빈 문자열과 취소 null을 구분한다. 부모 창 종료·탐색·렌더러 종료·앱 종료·로딩 실패 때 대기 요청을 취소하고 정리한다. 동시에 겹치는 요청은 별도의 동의로 합치지 않는다.
- 문구는 textContent로만 표시한다. 긴 본문은 스크롤하고 하단 버튼은 보존한다. Ctrl+휠 설정을 100~200%로 반영하되 모니터 영역에 맞추며, 독립 zoomMode로 런처에 확대가 전파되지 않는다. 50~90% 게임 설정에서도 확인창은 최소 100% 가독성을 유지한다.
- 실제 비용·확률·보상·거래와 웹/PWA 호출부는 바꾸지 않았다. 앱 ID·NSIS GUID·사용자 데이터·자동 업데이트 공급처도 보존했다.

근거 API: Electron의 [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge), [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox), [독립 창 확대](https://www.electronjs.org/docs/latest/api/web-contents#contentssetzoommodemode). 고정 Electron 44.7.2에서 실제 실행했다.

## 월드레이드 이름

원인: `live-operations`는 raid_bosses.name을 그대로 JSON.stringify하여 다른 raid 응답의 현재 IP 표시 변환을 우회했다. `presentOriginalIpResponse`의 해당 경로 분기를 사용하도록 연결했다.

| 저장된 이전 이름 | 현재 승인 표시 이름 |
| --- | --- |
| 나가토 | 오르제 |
| 요리이치 | 렌조 |
| 이치고 | 제노 |
| 족사이언 | 가르온 |

RAID 항목의 title만 변환한다. 알려지지 않은 이름·다른 종류의 콘텐츠·진행 단계·참여자 수·마감 시각·ID·15초 집계 캐시/30초 폴링은 유지한다. DB 마이그레이션과 운영 쓰기는 없다.

## 검수와 산출물

- 관련 Node 검사 29개와 기존 IP 응답 회귀 3개 통과. 리소스·출처·자동 업데이트·설치 안내문과 새 레이드 이름 변환을 확인했다.
- 반복 업데이트 수정 후 관련 리소스 Node 검사 17개 통과(기존 14개 + 선택 목록 활성화/변조·취소 방어/실제 다운로드 용량 3개). `tests/windows-client-repeat-update-20261016.browser.mjs`의 실제 Electron 4개 시나리오에서 변경 없는 재실행과 선택 목록 갱신 각각 리소스 다운로드 0회, 필수 파일 1개 변경 시 해당 24바이트만 전송, 같은 길이 손상 파일 1개만 복구를 확인했다. 정상 시작에서는 다운로드 단계가 발생하지 않는다.
- `tests/windows-client-dialogs-20261016.browser.mjs`: 실제 Electron의 14개 시나리오 통과. 취소 후 후속 작업 0회, 승인 1회, 알림 대기, 입력 기본값/한글/빈 값/취소, 문자열 HTML 비실행, 긴 본문, 위조 응답/요청 거부, 첫 스크립트·팝업·프레임, 부모 창 종료 정리, 불신 sandbox 프레임 차단, F5 취소, 200%와 런처 100% 분리를 확인했다.
- 기존 Ctrl+휠 21개 시나리오와 다운로드/복구/쿠키/팝업 브라우저 회귀 통과. 모든 계정 요청은 격리 fixture이며 운영 API 쓰기 0회다.
- 네이티브 capturePage 이미지로 확인·입력·알림·긴 문구·200%를 직접 확인했다. CDP screenshot의 확대 시 잘림은 검수 캡처 도구 문제여서 네이티브 캡처로 교정했다. 확대가 파일 로딩 후 초기화되던 구현 문제는 isolated zoomMode로 수정 후 검수했다.
- 증빙: `docs/qa/windows-client-dialogs-20261016/`. 빌드는 저장소 밖 독립 npm ci와 같은 Electron 배포본으로 NSIS 및 WPF Setup을 만들었다. 패키지/원본 일치, app.asar·Engine·Setup 해시와 기존 설치 ID를 발행 스크립트에서 확인했다.
- Setup: 117,390,848 bytes, SHA-256 `d98308fc174d280212d21bc555d0116716c92eab74632dbc00fe42d2314d8a85`.
- Engine: 113,860,924 bytes, SHA-256 `d50b005b1e4228927c005680092bef0565773db16c15492c386c03f7411291d8`.

운영 반영 결과는 배포 후 아래에 기록한다. 0.1.5 사용자는 런처의 **업데이트 후 다시 시작**으로 적용하며, 그 이전 버전은 최신 Setup을 한 번 설치한다.

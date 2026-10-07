# BGM 플레이리스트 선택 — 2026-10-08

사용자 요청에 따라 로비·카드상점의 BGM에 **곡 선택** 버튼과 플레이리스트를 연결한다. 기존 DEMO 5에 새로 첨부한 DEMO 8·9·10·12를 추가한다.

## 음원과 사용 방법

| 표시 이름·파일명 | 원본 | 길이 |
| --- | --- | --- |
| 숲켓몬 OST1.mp3 | DEMO 5.mp3 | 3:38 |
| 숲켓몬 OST2.mp3 | DEMO 8.mp3 | 1:25 |
| 숲켓몬 OST3.mp3 | DEMO 9.mp3 | 2:19 |
| 숲켓몬 OST4.mp3 | DEMO 10.mp3 | 1:31 |
| 숲켓몬 OST5.mp3 | DEMO 12.mp3 | 2:27 |

- `assets/bgm/soopketmon-ost-20261008.json`에 파일·원본·바이트 수·SHA-256을 기록한다. 한글·공백 파일명은 URL 경로를 인코딩한다. 음원 바이트를 재인코딩하거나 수정하지 않는다.
- 곡 목록에서 직접 선택하거나 이전·다음 버튼으로 이동한다. 현재 곡과 재생 시간을 표시하며 순서 재생·전체 반복을 유지한다.
- 사용자 후속 `음량 기본 15세팅해놓고 늘릴수 있으면좋겠네? UI는 마음에 듬`에 따라 승인된 UI를 유지하고 기본 음량을 **15%**로 설정한다. 플레이어에서 0~100%를 조절하고 개인 음량을 기기에 저장한다. 기본 버튼은 개인 설정을 해제해 CMS 기본 음량으로 되돌린다. CMS 정기 조회는 개인 음량을 덮어쓰지 않는다.
- 선택한 곡은 URL로 기기에 저장한다. 새로고침·CMS 목록 재정렬에도 같은 곡을 선택하고, 로비↔카드상점 이동에서는 한 플레이어로 이어 재생한다.
- 음소거 중 곡을 골라도 OFF를 유지한다. BGM 켜기를 누르면 선택한 곡을 재생한다. 다른 화면·로그아웃·CMS OFF에서는 재생과 패널을 정리한다.
- 패널은 PC·모바일 공통 네이비/라임 기준을 사용한다. 키보드 선택, Escape 닫기·포커스 복귀, 동작 줄이기를 지원한다. 목록은 기존 CMS 최대 20곡을 지원한다.

## 관련 검증

`tests/card-shop-bgm-20261008.test.mjs`에서 원본 해시와 실제 메인 앱의 PC 1440×1000·모바일 390×844를 확인한다. Chromium은 `--mute-audio`, 계정은 격리 응답이다.

- 5곡 모두 MP3 디코딩·재생 시간 진행·15% 기본 음량·동시 플레이어 1개·오디오 오류 없음.
- 직접 곡 선택, 이전/다음 경계 이동, 마지막 곡 종료 후 첫 곡 재생, CMS 재정렬·정기 설정 반영 시 선택/현재 시간 보존.
- 음소거 유지·새로고침 복원·로비/카드상점 연속 재생·잘못된 음원 안내·CMS OFF 시 패널 정리.
- 음량 슬라이더 0/100% 경계·키보드 증감·실제 Audio.volume 적용·새로고침 기억·15% 기본 복원. 음량을 높여도 OFF 선택은 유지한다.
- 미디어 태그의 volume 변경을 무시하는 기기는 동일 플레이어의 Web Audio GainNode로 음량을 조절한다. 이 제한은 [Apple 오디오 안내](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html), 대체 제어는 [Web Audio 안내](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/PlayingandSynthesizingSounds/PlayingandSynthesizingSounds.html)를 참고했다. 해당 조건을 격리 브라우저에서 재현해 gain 적용·기본 복원·단일 노드·음소거를 확인한다. 실제 iOS 기기 검수로 표현하지 않는다.
- 터치 버튼 44px, 패널 가로/세로 잘림 없음, 키보드 닫기와 포커스 복귀, 유휴 상태의 불필요한 DOM 교체 없음.

검수 결과와 스크린샷은 체크아웃 밖 `../bgm-playlist-test.log`, `../qa-bgm-playlist/`에 저장한다. MP3의 HTTP Range 응답을 지원하는 격리 경로로 실제 곡 종료를 확인했다.

최종 관련 검사 4개(원본 해시, 음량 제한 기기 대체 제어, PC 실제 앱, 모바일 실제 앱)를 통과했다. 최종 화면에서 음량 조절 추가 후에도 5곡과 닫기·이전/다음·기본 버튼이 모두 화면 안에 표시되는 것을 확인했다.

## 운영 반영 방식

클라이언트 BGM과 음원에 한정된 변경으로 `npm run deploy:production -- --scoped`를 사용한다. 메인 로더와 서비스 워커의 캐시 버전을 함께 갱신하고 BGM 스크립트를 network-first 목록에 추가한다.

직전 실제 운영 기준은 `adc0b9f9baf0c69723f385a7ed680c96d97c9520`, Pages `24cfb234-bfc5-49ae-a171-2e3626725425`다. 지정 검사 파일은 `tests/card-shop-bgm-20261008.test.mjs`이며 API 기본값 수정에 필요한 Worker 컴파일·출시·Hyperdrive 검사를 함께 실행한다.

배포된 클라이언트와 5곡 원본 해시를 확인한 뒤 `scripts/ops/bgm-playlist-20261008.mjs`로 운영 BGM 설정 한 행을 잠가 목록과 기본 음량 15%를 저장한다. 직전 설정 일치, 기존 ON/반복 보존, 관리 로그와 일회 영수증의 원자적 저장을 확인한다. 영수증 키는 `ops:lobby-bgm-playlist:20261008:v1`이며 재실행으로 후속 CMS 편집을 덮어쓰지 않는다.

## 운영 완료 — 2026-10-08 04:52 KST

- 코드 커밋: `71f5dc6338c8e0c247e716877e033b38495a136c` (`origin/main` 반영).
- 지정 배포의 관련 검사 4개, Worker 컴파일, 출시 보호, Hyperdrive 검사를 모두 통과했다.
- Pages: `de1388a8-ac72-4112-a814-519091f615ee`, [배포 주소](https://de1388a8.cnine-card.pages.dev).
- API Worker: `e49d5cf9-b82a-4d27-80f4-35caaf10697b`; clan-draft Worker: `ee7f57f3-caff-4f76-adc1-0377244dcef3`.
- 운영 기본 주소에서 5곡 모두 HTTP 200·오디오 형식·바이트 수·SHA-256 일치를 확인했다. 메인 HTML·서비스 워커·BGM 코드·관리 화면도 배포 커밋과 해시가 일치하고 `/api/health`는 200이다.
- 운영 CMS 반영 완료: BGM ON, 기본 음량 **15%**, 전체 반복 ON, **숲켓몬 OST1~5**. 영수증과 설정·관리 로그를 다시 조회해 일치 확인했다. 관리 로그 ID는 `42598`이다.
- 운영 증거: 체크아웃 밖 `../qa-bgm-playlist/production-proof.json`, `production-activation.json`; 배포 검사 화면: `../qa-bgm-playlist-release/`.

이 완료 기록은 문서만 변경하므로 내용·diff 확인과 범위 커밋·원격 반영으로 종료하고 재배포하지 않는다.

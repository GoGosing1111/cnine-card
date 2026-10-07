# SX슈트 · 푸른 사신 — 영상 참조 베기 V2

2026-10-07 최신 검수판. **사용자 프리뷰 승인 대기**, runtimeEnabled=false. 공용 V3 전장과 기존 X슈트 런타임을 사용한다. 운영 활성화·CMS·제작식·능력치·계정 지급은 반영하지 않았다.

## 보기

- [전투 프리뷰](http://127.0.0.1:8975/preview/battle-suit-sx-v1/) — 공격 / 검무 / 궁극기, 배속·일시정지·프레임 이동·이펙트 OFF.
- [수정한 목·어깨와 원본 비교](http://127.0.0.1:8975/preview/battle-suit-sx-v1/comparison.html?pose=spin-01).
- [PC 재생 영상](review-desktop-v2.webm), [모바일 재생 영상](review-mobile-v2.webm).
- [PC 영상 프레임](qa/slash-v2/filmstrip-desktop.png), [모바일 영상 프레임](qa/slash-v2/filmstrip-mobile.png).

서버: node preview/battle-suit-sx-v1/serve.mjs. localhost 8975의 읽기 전용 서버다. 실제 V3 카드 도크·진형·지원 유닛·대상 모델과 격리된 z-body-live-v1/fixture.json을 사용한다. API 호출과 실계정 변경은 없다.

## 사용자 기준과 영상 참조

찌르기처럼 보이는 공격 반복을 교체하고 주변 오라를 진하게, 검신에 청색 오라를 추가한다. 두 첨부 영상을 참고해 스킬을 다시 구성하며 사용자의 “프리뷰 보고 승인함”을 따른다. 목 오류가 지적된 회전 자세는 전신을 다시 그려 교체한다. 원본 색감, 성인 비율·다리 길이, 곧은 대검과 열린 칭호는 보존한다.

| 사용자 영상 | 확인한 흐름 | SX 반영 |
|---|---|---|
| TzyFdcJ5…mp4 / 5.83초 | 빠른 교차 검격·축적되는 검흔·폭발 | 검무의 교차 연격 6회와 마지막 검격 |
| mvgCey2q…mp4 / 11.40초 | 몸통 회전·큰 검풍·응축 후 마무리 | 궁극기의 회전 베기 3회와 큰 내려베기 |

원본 이름·해시·디코딩 시간은 [메타데이터](qa/references/metadata.json)에 보존했다. [첫 영상 장면](qa/references/reference-1-filmstrip.png), [둘째 영상 장면](qa/references/reference-2-filmstrip.png)을 확인하고 SX의 새 작화와 청색 효과를 제작했다. 참조 영상의 픽셀을 게임 자산으로 복사하지 않았다.

## 현재 동작

| 동작 | 길이 | 구성 |
|---|---:|---|
| 대기 | 4.8초 반복 | 승인 원본·짙은 코발트 오라·검신 에너지·발밑 광원·칭호 |
| 잔영 대시 | 1.75초 | 준비·가속·제동·이동/복귀 잔상 |
| 청령 일섬 | 1.60초 | 양손 준비·대각선 내려베기·반대 방향 후속 동작 |
| 청령 검무 · 잔영난무 | 3.90초 | 내려베기/올려베기 교차 6회·검흔 폭발과 최종 검격·복귀 |
| 창천사신검 | 5.70초 | 회전 검풍 3회·양손 응축·거대 내려베기·지면 파열·복귀 |

공격 적중 0.43초. 검무 적중 0.58/0.82/1.06/1.30/1.54/1.78/2.48초. 궁극기 적중 0.80/1.35/1.90/3.53초. motion.mjs의 공용 시계로 제어한다. 이동이 멈춘 뒤 검격을 수행하며 수평 검을 내민 고정 자세를 밀어 넣는 방식은 활성 공격에서 제외했다. 피해·HP·승패·보상은 계산하지 않는다.

## 연결 작화와 목 교체

내장 **image_gen**으로 머리·목·어깨·몸·손·대검·다리를 함께 그렸다.

- [내려베기](assets/connected/slash-v2/down.png): 1~3번 사용. 4번은 오른발이 원본 가장자리에 닿아 제외.
- [올려베기](assets/connected/slash-v2/up.png): 1~3번 사용. 4번은 짧은 세로 검 때문에 제외.
- [회전·응축·마무리](assets/connected/slash-v2/spin.png): 2~4번 사용. 사용자에게 목 오류를 지적받은 1번은 실행에서 제외.
- [목 수정 전신](assets/connected/slash-v2/spin-neck-v1.png): 고개·목·상체가 같은 방향을 향하도록 전신 재작화. connected-pose-repairs.json의 spin-v2:0으로 연결했다. 머리나 무기를 절취 합성하지 않았다.

새 베기 자세 10장, 기존 대시 8장·준비 2장을 합쳐 현재 **20개 전신**을 재생한다. 전체 패킹 42장 중 나머지는 제작 이력이다. manifest.activeMotion과 비교 화면은 현재 자세만 표시한다.

시트별 균일 배율을 적용하며 웅크린 자세를 세로로 늘리거나 다리·목을 따로 변형하지 않는다. 원화와 실제 재생에서 목/어깨 연결, 검 중심축과 가드, 골반→무릎→발목 길이를 확인했다.

## 오라·스킬 효과·칭호

- 주변 오라: 고유 코발트 작화, 일반 합성 alpha **1.0**.
- [검신 오라](assets/sources/fx-blade.png): 12프레임. 승인 원본과 모든 자세의 검 시작점·끝점을 따라간다.
- [교차 검흔·폭발](assets/sources/fx-flurry.png), [회전 검풍](assets/sources/fx-tempest.png), [거대 내려베기](assets/sources/fx-cleave.png): 각 12프레임 신규 제작.
- 현재 효과 10종/120프레임. 전체 보존 12종/144프레임 중 옛 execution/bladestorm은 로드하지 않는다.
- 6개 잔상은 실제 과거 전신 자세·위치·방향을 사용한다. 본체 틴트 0xffffff, x/y 동일 배율.
- 열린 은빛 검 날개와 Noto Serif KR 900 “푸른 사신”, 글자 y=20을 유지한다. 동작의 최고 검끝 높이를 기준으로 칭호 공간을 확보해 빠른 베기 때 높이가 요동하지 않는다.
- 무음 프리뷰다. 효과는 본체·검 원본을 재색칠하지 않는 별도 계층이며 중단·이탈·OFF 시 함께 정리된다.

## 승인 원본·생성 프롬프트

[승인 원본](assets/sources/sx-standing-approved-20261007.png)의 SHA-256:
0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b.
대기와 종료에는 이 정확한 파일을 사용한다. 이전 V8 dash-a/attack-a의 부분 작화 승인과 색감 기준도 보존하며 현재 전체 모션 승인으로 확대하지 않는다.

실제 내장 이미지 생성 프롬프트:
[베기·검신](slash-v2-prompts.json), [영상 참조·회전 자세](video-skill-reference-plan.json), [교차 검흔·검풍·거대 검격](video-fx-prompts.json), [목·어깨 수정](neck-correction-prompt.json).

모든 프로젝트 자산은 이 프리뷰 폴더에 저장했다. 기준점·배율은 pose-registration-connected.json, 출처/해시/알파/패킹 결과는 manifest.json에 기록한다.

## 검증과 승인 상태

- 관련 테스트 **6/6 통과**: 승인 해시, 42개 전신의 출처/알파/균일 배율, 144개 보존 효과의 셀 여백, 베기 각도와 지면 접점, 반려 자세 제외, 단일 공용 런타임과 운영 OFF.
- [PC·모바일 기능 검사](qa/slash-v2/browser-report.json): 각 12회 접점, 검신 오라 끝점 오차 1e-5 픽셀 이하, 주변 오라 alpha 1, 배속/일시정지/반복/중단/이탈/효과 OFF. 콘솔·리소스 오류와 가로 넘침 0.
- [화면 범위 검사](qa/slash-v2/framing/contact-title-recheck.json): 목 수정 자세·양손 준비·폭발·마무리·모든 접점에서 몸/검끝/칭호 잘림 0. 큰 검풍은 화면 가장자리까지 번지는 연출이다.
- [실제 녹화](qa/slash-v2/recording-report.json), [영상 디코딩 확인](qa/slash-v2/video-decode-report.json): PC/모바일 각 약 17.2초, 각 15개 실제 프레임. 마지막에는 효과 OFF 공격을 0.5배속으로 기록했다.
- 중간 PNG 덮어쓰기에서 Windows 파일 저장 오류가 발생해 최종 화면은 별도 framing 폴더에 저장했다. 이전 캡처를 현재 증거로 사용하지 않는다.

이번 범위는 프리뷰이며 게임 전체 게이트·운영 배포를 하지 않는다. [CF-Pages-Skip] 범위 커밋으로 보존한다. 기술 검증은 사용자 시각 승인을 대신하지 않는다. **프리뷰 최종 승인 후** 운영 연결을 별도로 진행한다.

~~~powershell
node preview/battle-suit-sx-v1/pack-connected.mjs
node preview/battle-suit-sx-v1/build.mjs
node --test preview/battle-suit-sx-v1/qa.test.mjs
node preview/battle-suit-sx-v1/serve.mjs
# 변경 범위에 필요한 검사만
node preview/battle-suit-sx-v1/qa-browser.mjs
node preview/battle-suit-sx-v1/qa-recheck.mjs
node preview/battle-suit-sx-v1/record-review.mjs
node preview/battle-suit-sx-v1/qa-video.mjs
~~~

qa/ 바로 아래 보고서와 review-desktop.webm / review-mobile.webm는 V8 이력이다. 현재 증거는 **qa/slash-v2/**, **review-*-v2.webm**다. 옛 머리 절취 합성 파일과 반려 자세는 이력으로만 보존한다.

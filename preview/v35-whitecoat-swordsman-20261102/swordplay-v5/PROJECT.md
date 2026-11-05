# 하쿠야 신 · 검성 스킬 4종

2026-11-05 로컬 V3.5 검수본. 하쿠야 신의 기존 공격 모션을 2배속으로 재생하고, 네 기술에 별도 이펙트를 연결했다. [영상과 기술별 재생](../review.html) · [3인 상대 전장](http://127.0.0.1:18766/?case=whitecoat-squad)

| 스킬 | 대상 | 사용하는 Spine 동작 | 주요 효과 | 정상 재생 길이 |
| --- | --- | --- | --- | --- |
| 절광발도 | 단일 | 발도 `skill_iai` | 뽑힌 날에서 펼쳐지는 은백색 반월과 올려베기 끝의 쇳가루 | 0.60초 |
| 삼첩관통 | 단일 | 흑금 단공 `skill_rift` | 찌르기 한 번에 길이와 각도가 다른 세 겹의 검흔이 뒤따름 | 0.67초 |
| 회천검압 | 광역 | 회전·도약 연격 `skill_tempest` | 회전 중 풀리는 간극이 있는 검륜, 착지에 맞춘 두 번째 파면과 대상별 절단선 | 0.88초 |
| 만검낙성 | 광역 | 천형 종결 `skill_verdict` | 상공에서 대상을 겨누는 검선, 대검 군집, 대상 발밑에 따로 꽂히는 검과 파편 | 1.34초 |

## 원본과 제작

- 캐릭터는 [Spine Professional 정본](../whitecoat-skills-v4-51fecca13bde.spine)과 같은 runtime을 사용한다. 네 동작의 준비·접촉·회수 시점에서 기존 기술과 신규 기술의 전신 작화, 액터 좌표, HUD 위치와 원본 시각을 대조했다. 원본 SHA-256은 `b0abcbf1bda97b8d700328b9453e0a61fbec96cf0063e21a1907bef444a57ef6`이다.
- ImageGen으로 검광 연속 작화 4시트 32장을 만들었다. [최초 프롬프트](art-prompts.json), [수정 프롬프트](art/revision-prompts.json), [원본 파일과 해시](art/generation.json)를 보존했다. 삼첩관통과 회천검압은 두 번째 시트를 채택했다. 순수 검술 방향으로 확정하기 전의 작화와 기술명은 이 버전에 사용하지 않았다.
- [절광발도](effects/native/v5-flash.efkefc) · [삼첩관통](effects/native/v5-thrust.efkefc) · [회천검압](effects/native/v5-wheel.efkefc) · [만검낙성](effects/native/v5-rain.efkefc). Effekseer 1.70e에서 각 8장과 전환 타이밍을 편집할 수 있다. 보조 효과로 [강철 파편 46개](effects/native/v5-splinters.efkefc), [회전 검륜 테두리](effects/native/v5-rimlight.efkefc)를 제작했다. 검날 궤적의 기존 재질과 이전 Blender 착지 파편도 재사용한다.
- 네 주 효과는 흰 날과 검은 단면을 유지하는 normal 합성을, 추가 파편과 검륜 테두리는 additive 합성을 사용한다. 6개 편집본의 재열기·재출력 바이너리가 일치했다. 공식 Effekseer WebGL로 60fps PNG 204장을 출력했다. 런타임은 빈 선행 프레임을 제거한 200개 프레임 참조와 고유 패킹 프레임 121개다. [PNG 아틀라스·피벗·해시](effects/runtime/fx-manifest.json). 신규 아틀라스 합계 6.94MiB, 디코드 39.60MiB다.
- [이전에 지정 영상의 0.5배속에서 확인한 동작](../skills-v4/reference/analysis.json) 중 짧은 발검, 진행 방향이 읽히는 검흔, 타격 직후의 정지와 잔향을 참고했다. 이번 이펙트 원화는 하쿠야 신에 맞춰 제작했다.

## V3 재생과 검수

V3가 등록한 GSAP 타임라인에서 검사 공격 시계에만 2를 곱한다. 전장 기본 계수 1.3일 때 2.6, 검수 0.5배일 때 1.3이다. 이동·Spine 프레임·검광·히트스톱을 같은 시각으로 진행한다. 검날 궤적은 손과 칼끝 소켓에서, 독립 낙검은 각 대상의 발 위치에서 구한다. 검의 원근 투영을 보존하기 위해 낙검 본체에는 균일 배율을 적용했다.

단일기는 지정 대상 한 명, 광역기는 V3 형식의 `hits[].targetId`로 들어온 대상만 적용한다. 대상별 최종 HP·보호막·피해를 한 번씩 재생하고 재탐색·중복 ID·아군·사망 대상은 추가 피해를 만들지 않는다. 로컬 검수 전장은 기존 V3 카드·진형과 명시적인 예제 이벤트를 사용한다. 운영 로스터, 실제 서버 발동·계수·밸런스는 별도 단계다.

- [정상 영상](qa/four-skills.webm) · [실제 전투 시계 0.5배](qa/four-skills-half.webm) · [효과 OFF](qa/four-skills-body.webm). 같은 네 동작과 개별 적중을 촬영하고 영상 메타데이터에 길이와 탐색 정보를 기록했다.
- [전장 검사](qa/verification.json) · [녹화와 기술별 시간](qa/recording.json) · [영상 재생·버튼·구형 편성](qa/review.json) · [기존 V3 이벤트 회귀](qa/event-integration.json). 1440px 아군·390px 적 진영을 검수했다. 물리 기기 성능과 최종 시각 승인은 미검증이다.
- [네 기술의 실제 전장](qa/four-cuts.png) · [녹화에서 해독한 정상·0.5배·OFF 비교](qa/video-phases.png). 회천검압 절정의 ON/OFF 유효 픽셀 폭은 PC 약 82%, 390px 약 80%다.

## 재현

저장소 루트의 PowerShell에서 아래 순서로 실행한다. 기존 Spine 원본과 패킹된 캐릭터를 그대로 읽는다.

```powershell
$hero = 'preview/v35-whitecoat-swordsman-20261102'
$edition = "$hero/swordplay-v5"
node "$edition/effects/author.mjs"
node "$hero/skills-v4/effects/bake.mjs" "$edition/effects"
node "$edition/effects/pack.mjs"
node preview/v35-v3-upgrade-20261101/build.mjs
& 'preview/v35-v3-upgrade-20261101/start-review.ps1'
node "$edition/qa/verify.mjs"
node "$edition/qa/record.mjs"
node "$edition/qa/review.mjs"
node "$hero/qa/event-integration.mjs" "$edition/qa"
```

# 하쿠야 신 · 몸을 감싸는 흑백 검기

2026-11-05 사용자 후속 지시: V1은 중앙이 맞지 않고 캐릭터와 어울리지 않아 반려. 흑백을 조화해 몸을 감싸는 새 효과를 제작한다. **현재 검토본은 aura-v2**이며, 이전 태극 원판/청백색 링은 보존 이력이다.

[현재 재생 화면](../review.html) · [V3 전장](http://127.0.0.1:18766/?case=whitecoat-squad) · [원화와 프롬프트](art/generation.json)

## 재생 화면 수정 · 2026-11-05

사용자 재생 불가 신고를 확인했다. 원본 WebM의 실제 프레임과 별도 Chrome 재생은 정상이었지만, 사용 중인 내장 브라우저에서는 재생 시간이 끝난 상태에서 영상 영역이 비어 있었다. 내장 브라우저의 정확한 디코더/합성 원인까지 확정하지는 않았다.

정상·0.5배·효과 OFF 세 영상을 불투명 H.264 MP4로 변환하고 즉시 재생 가능한 faststart와 60fps로 저장했다. [MP4·원본 해시](playback/manifest.json). 원본 WebM은 변경하지 않았으며 MP4를 열 수 없는 환경에서는 원본으로 대체한다. 로컬 서버에 MP4 MIME을 추가했다. 녹화 조회를 기다리기 전에 사용자 클릭 안에서 재생을 시작하고, 전체 영상 버튼은 처음부터 시작하도록 수정했다. 재생/일시정지·처음부터·반복 선택을 추가하고 기본 음소거 자동 반복 재생을 적용했다.

내장 브라우저의 **숨김 탭에서 MP4 5.6441초, paused=false, readyState=4**와 실제 캐릭터·전투 화면 표시를 확인했다. 사용자 탭을 클릭하거나 새로고침하지 않았다. 별도 화면 없는 Chrome PC1440/모바일390에서 [56개 검사](qa/playback-fix/verification.json)를 통과했다. 세 영상의 실제 불투명 픽셀·시간 진행, 모든 스킬 탐색, 정지/재시작/완료/반복, 늦은 녹화 기록 응답, MP4 실패 시 원본 대체, 원본 해시와 HTTP 탐색 응답을 검사했다. [전환 스크립트](qa/playback-fix/convert.mjs) · [검사 스크립트](qa/playback-fix/verify.mjs). 캐릭터 작화·Spine·게임 전투 코드는 이번 수정에서 변경하지 않았다.

## 새 제작

내장 **ImageGen 4회**로 새 검기 시트를 만들었다. 채택한 뒤쪽/앞쪽 2시트는 각각 8개, 총 **16개 고유 작화**다. 검은 먹빛 흐름과 은백색 칼바람으로 구성하고, 뒤쪽은 양옆으로 올라오는 열린 곡선, 앞쪽은 허리와 정강이를 지나는 두 가닥 흐름이다. 정지 원판 회전은 사용하지 않는다. 첫 시트의 잘림과 다음 시트의 반투명 회색 바탕은 반려 이력으로 보존했고, 최종 두 시트의 실제 투명 배경·셀 경계·고유 이미지 해시를 확인했다.

Effekseer **1.70e 네이티브 2종**에 8장씩 배치하고 앞쪽 띠를 허리·정강이 높이로 올렸다. [편집 원본](native/ink-rear.efkefc) / [앞쪽 원본](native/ink-front.efkefc), 실제 CUI 저장·재열기·재출력 바이트 일치를 [기록](qa/native.json)했다. 공식 Effekseer WebGL로 68PNG를 출력하고 각 작화의 안정된 시점 16장을 두 atlas로 패킹했다. 네이티브 emitter가 교체되는 중첩 프레임 대신 각 작화의 중간 프레임을 선택했다.

런타임은 기존 Pixi/GSAP에서 2.4초의 공용 시간 주기로 이웃 작화를 겹쳐 연결한다. 검은 기운을 보존하는 normal 합성을 사용하며 전장에서는 흑백 대비와 농도를 보강한다. 앞뒤 레이어는 각각 몸보다 앞/뒤에 붙이고 중심은 **정수리 방향과 양발 중간점 사이의 몸 축**에 둔다. 고정 좌우 이동값이 없으며 큰 자세의 기울기·도약·팀 반전을 따른다. 흰 윤곽은 0.55px로 줄여 몸 위의 강한 테두리를 완화했다.

효과의 원본은 AI 작화 시트이며, 현재 Spine 캐릭터 원화/자세를 새로 그리거나 Blender 작업을 추가한 것은 아니다. 기존 Spine 편집본·네 공격 모션·2배 공격 속도·서버 타격 계약을 보존했다.

## 확인 범위

- [121개 검사](qa/verification.json): PC1440·모바일390·반대 진영390/320, 몸 축 정렬·앞뒤 계층·얼굴 위치와 앞쪽 효과의 여백, 네 스킬의 정지/되감기/타격 정지/피해1회, 효과 토글/대기 배속/죽음/복귀/숨김/폐기. 기존 원화의 불투명 픽셀과 Spine native 해시 보존 확인.
- [V3 이벤트 검사](qa/event-integration.json), [새 녹화](qa/recording.json), [영상 재생 검사](qa/review-video.json)로 실제 전투 재생과 리뷰 연결을 확인한다.
- PC 확대, 모바일 및 네 스킬 캡처를 시각 확인했다. 수치 검사는 사용자 시각 승인을 대체하지 않는다. 실기기 성능이나 전체 DNF급 품질 달성으로 기록하지 않는다.
- 런타임은 **1296×648 atlas 2장, 디코딩 6.407MiB**다. 현재 효과의 디코딩 픽셀만 계산한 값이며 전장 전체·필터 임시 GPU 메모리는 포함하지 않는다.

현재는 로컬 전장 검토본이며 운영 용병 등록/배포는 하지 않았다. 반려 V1과 모든 원본·프롬프트·중간 자료를 보존한다.

```powershell
node preview/v35-whitecoat-swordsman-20261102/aura-v2/author.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/effects/bake.mjs preview/v35-whitecoat-swordsman-20261102/aura-v2
node preview/v35-whitecoat-swordsman-20261102/aura-v2/pack.mjs
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/verify.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/event-integration.mjs preview/v35-whitecoat-swordsman-20261102/aura-v2/qa
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/record.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/review-video.mjs
```

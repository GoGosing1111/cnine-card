# 하쿠야 신 · 태극 아우라와 흰 형광 윤곽

2026-11-05 사용자 요청: 전투 캐릭터 등 뒤에서 자연스럽게 회전·움직이는 태극 문양과 아우라, 캐릭터 테두리의 흰 형광빛. 현재 V3 로컬 검토 전장에 연결했다.

[재생 화면](../review.html) · [실제 전장에서 시전](http://127.0.0.1:18766/?case=whitecoat-squad) · [정상 영상](qa/four-skills.webm) · [0.5배](qa/four-skills-half.webm) · [효과 OFF](qa/four-skills-body.webm)

## 제작과 연결

- 청백색 태극은 정확한 두 곡선 형태의 [SVG 원본](taegeuk.svg)을 PNG로 출력했다. 새 캐릭터 그림이나 AI 작화 생성은 수행하지 않았다. 문양은 공용 시간 10초에 한 바퀴, 주변 기운은 4초에 한 주기를 갖고 미세한 상하 이동·밝기 변화가 더해진다. 실제 벽시계 속도는 기존 V3 배속을 따른다.
- 바깥 기운은 **Effekseer 1.70e, 10노드**의 [편집 원본](native/taegeuk-orbit.efkefc)이다. 실제 CUI 저장/재열기/재출력 바이트 일치. 공식 Effekseer WebGL을 숨김 오프라인 렌더러로 사용해 62PNG를 출력했고 60프레임을 1920×1152 atlas에 넣었다. 인접 프레임을 보간 합성해 루프의 튐을 줄였다. Blender 소재는 이번 아우라에 추가하지 않았다.
- [HakuyaAura](HakuyaAura.mjs)는 현재 Spine 자세의 head socket에서 등 위치를 계산한다. 같은 배우 view에서 몸보다 먼저 그리므로 움직임·점프·반대 방향을 따라가며 얼굴과 검 위에 문양을 덮지 않는다.
- [WhiteOutlineFilter](WhiteOutlineFilter.mjs)는 현재 자세의 실제 알파를 샘플링해 **흰색 윤곽과 부드러운 외곽 광채**를 합성한다. 사각 이미지 테두리나 정지된 그림자를 붙이는 방식이 아니다. 기존 V3 WebGL/Pixi 필터 한 개를 캐릭터에만 적용했다. 검사한 불투명 원화 1,925픽셀의 RGB 최대 차이 0, 바깥 발광 5,980픽셀 확인. 모든 반투명 픽셀의 무변경을 뜻하지 않는다.
- 대기는 기존 `simpleTimelines`에 등록한 GSAP 한 개, 공격은 기존 공격 타임라인이 몸·아우라·스킬 효과를 함께 갱신한다. 독립 ticker/추가 canvas는 없다. 일시정지·배속·되감기·타격 정지·취소·숨김·사망/부활·세션 폐기에 연결했다. 효과 OFF는 아우라와 흰 윤곽도 끄고 같은 시간으로 복원한다.
- 태극 PNG+orbit atlas는 **691,978바이트**, 디코딩 픽셀 합계 **10.6875MiB 추가**다. 필터 임시 렌더 타깃이나 기존 전장 자산은 제외한 추정이며 실제 GPU 메모리·실기기 성능 측정은 아니다.

## 확인한 결과

- [121개 검사](qa/verification.json): PC1440·모바일390·반대 진영390/320px, 네 스킬의 위치·반전·히트스톱·되감기·중복 타격 방지·기존2배 공격속도, 효과 토글/대기 배속/사망/부활/숨김/복귀/폐기, shader 오류 0. 기존 Spine 편집본 SHA-256 일치.
- [기존 V3 이벤트 9개 검사](qa/event-integration.json): 실제 `playEvents` 타격/회피/연속HP/배속/접촉 전 취소/복귀/새 전투 연결.
- [영상과 페이지 16개 검사](qa/review-video.json): 정상/.5/OFF 세 영상의 실제 디코딩·시간 진행·장면 탐색, PC/390폭, Range206. [녹화 기록](qa/recording.json)에 각 스킬의 관측 자세와 타격 대상 기록.
- 실제 전장 캡처, 확대, 모바일 및 정상 녹화에서 추출한 대기·회전베기 프레임을 시각 확인했다. 영상 전체 연속 시청·물리 모바일 성능 검수·사용자 최종 시각 승인을 주장하지 않는다.
- 초기 shader precision 불일치로 캐릭터가 표시되지 않은 중간 캡처(`idle-first`, `wheel-first`, `no-outline-debug`)는 수정 전 디버그 이력이다. 정본은 `idle-stage.png`, `idle-closeup.png`와 세 새 영상이다.

현재 상태는 **로컬 전장 검토본**이다. 운영 용병/스킬 등록이나 라이브 배포는 수행하지 않았다. 승인 일러스트·배경 포함 일러스트·Spine 원본·기존 네 공격의 자세와 스킬 리소스를 보존한다.

## 재현

```powershell
node preview/v35-whitecoat-swordsman-20261102/aura-v1/author.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/effects/bake.mjs preview/v35-whitecoat-swordsman-20261102/aura-v1
node preview/v35-whitecoat-swordsman-20261102/aura-v1/pack.mjs
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v1/qa/verify.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/event-integration.mjs preview/v35-whitecoat-swordsman-20261102/aura-v1/qa
node preview/v35-whitecoat-swordsman-20261102/aura-v1/qa/record.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v1/qa/review-video.mjs
```

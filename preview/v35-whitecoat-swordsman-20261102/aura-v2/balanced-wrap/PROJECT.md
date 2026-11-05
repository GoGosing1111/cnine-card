# 하쿠야 신 · 넓은 흑백 검기와 좌우 균형

2026-11-05 후속 요청: 기존 효과의 형태는 유지하며 몸을 더 넓게 감싸게 한다. 확대 후보 `wide-wrap/qa/candidate-d.png`에서 오른쪽 상승 검기가 더 커 보인다는 사용자 지적을 추가 반영했다. **현재 정본 배치는 balanced-wrap**이다.

## 배치

기존 ImageGen 작화16장과 Effekseer atlas2장을 그대로 사용한다. 기존 V2 대비 뒤쪽 가로1.52배/세로1.30배, 앞쪽 가로1.40배/세로1.20배로 확장했다. 아래로 커져 발밑에 몰리는 부분은 작화의 세로 위치를 올려 발목 근처에 두고, 어깨 위와 몸 양옆의 범위를 넓혔다. 몸 축의 중심·기울기·진영 반전은 기존 Spine 자세를 따른다.

원본 뒷면 작화가 오른쪽에 강한 은백색 상승 줄기를 갖고 있으므로, 기준점 이동만으로는 눈에 보이는 쏠림을 해결할 수 없었다. 같은 작화의 좌우 반전 흐름을 동일 프레임·동일 세기로 한 쌍 배치했다. 기존 필터 안에서 두 흐름을 합친 뒤 normal 합성하므로 어두운 먹빛도 남고, 그리는 순서 때문에 한쪽이 더 밝아지지 않는다. 앞쪽 띠의 연속 흐름은 유지했다. 추가 atlas나 새 원화 생성은 없으며 뒤쪽 스프라이트만2개 늘었다.

## 검수

- [중심 검사](qa/centering.json): 뒤쪽8작화 및 중간 전환8시점의 실제 렌더 픽셀을 비교했다. 좌우 반전 RGBA 픽셀 차이0, 광량/알파 합계 차이는 부동소수점 오차 범위, 검은 불투명 픽셀은 매 시점3,698개 이상으로 확인했다. 이는 뒤쪽 검기의 몸 축 기준 검사이며 앞쪽 띠를 좌우 복제한 것은 아니다.
- [전투 검사121건](qa/verification.json): PC1440·모바일390·적 진영390/320, 네 스킬의 중심 추적·정지·타격 정지·되감기·속도·피해·삭제 수명 검사를 통과했다. 얼굴 타원 범위를 앞쪽8작화 전체에 대조해 가림을 확인한다. 확대 전의 단순 텍스처 Y값 조건을 실제 이동·배율이 포함된 픽셀 검사로 보강했다.
- [새 정상/0.5배/효과 OFF 녹화](qa/recording.json)와 호환용 [MP4](playback/manifest.json)를 검토 화면에 연결했다. PC1440/모바일390 [재생 검사56건](qa/playback-check/verification.json)을 통과했다. 이전 재생 오류 수정과 자동 반복/처음부터/일시정지는 유지한다.
- `wide-wrap`의 오른쪽 편향 확대 후보·녹화·검사 기록은 중간 이력이다. 사용자 첨부 후보와 V1/V2 원화·프롬프트·native·기존 녹화를 모두 보존한다.

캐릭터 정본 `.spine`·승인 원화·네 공격 동작·2배 전투 속도는 변경하지 않았다. V3 공통 소스는 앞선 검수와 같은 `50bb3ab9cf9200f8034e4bb8afb3feccd524d0ef`로 고정해 재빌드했다. 배치 조정은 `../HakuyaAura.mjs`에서 수행했으며 Effekseer 네이티브 재제작이나 Spine 리깅 변경을 한 것은 아니다. 현재 로컬 검토본이며 실기기 성능/사용자 최종 시각 승인/운영 등록·배포는 아니다.

```powershell
$env:V35_SOURCE_REF = '50bb3ab9cf9200f8034e4bb8afb3feccd524d0ef'
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v2/balanced-wrap/qa/centering.mjs
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/verify.mjs preview/v35-whitecoat-swordsman-20261102/aura-v2/balanced-wrap/qa
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/record.mjs preview/v35-whitecoat-swordsman-20261102/aura-v2/balanced-wrap/qa
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/playback-fix/convert.mjs preview/v35-whitecoat-swordsman-20261102/aura-v2/balanced-wrap/qa preview/v35-whitecoat-swordsman-20261102/aura-v2/balanced-wrap/playback
node preview/v35-whitecoat-swordsman-20261102/aura-v2/qa/playback-fix/verify.mjs aura-v2/balanced-wrap
```

# 흰 코트 검사 · 회전·도약 연격

2026-11-02. 사용자 “그래서 이제 화려한 던파급 액션 만들어야지”를 적용한 **기존 V3 로컬 전장용 신규 액션**이다. 낮은 발도 → 몸을 틀어 역베기 → 도약·공중 내려베기 → 착지·회복으로 자세와 타격 리듬을 확장했다. 새 교체 작화 8개, 파생 Spine 편집 원본, 새 Effekseer 착지 효과 1개를 제작했다. DNF급 전체 품질 달성이나 사용자 최종 시각 승인을 뜻하지 않는다.

## 재생과 편집 원본

- [검토 화면](../review.html): 정상 속도 효과 ON/OFF 각 3회. 실제 전장에서는 **회전·도약 연격** 버튼을 누른다. 주소 `http://127.0.0.1:18766/?case=whitecoat`, 적 방향 `?case=whitecoat-enemy`.
- [새 Spine 원본](../whitecoat-action-v3-93718185df11.spine): 실제 Professional 4.3.26 import/save/reopen/export. SHA-256 `6060250d7e614e59ed5b09044f93ad65beca438eeb878ee44f25674cf5f24901`. 옆의 `../images/`가 필요하다.
- [입력 JSON](../whitecoat-action-v3.input.json): SHA-256 `93718185df11432ce7d9a52b99f6c9db7ecae2a5f3ca074a8f089127cf7c6635`.
- [게임 전달 폴더](../runtime-action-v3-93718185df11/whitecoat.json): JSON/atlas/PNG 2페이지. 2042×2009, 2021×1637. **7뼈·1슬롯·18전신 region attachment·8애니메이션**. 팔다리 메시/IK 리깅으로 설명하지 않는다.
- [선택 작화 비교](qa/pose-lineup.png), [실제 전장 여섯 장면](qa/action-review.png), [동작 계약](action.json), [자세별 기준점](pose-registration.json).

기존 `whitecoat-c3ad326c9e61.spine`과 초기 10자세/입력/등록표, V1/V2 효과·영상은 보존한다. 새 native는 이 원본에서 파생했다. 원본에 이후 편집이 있으면 생성 입력으로 덮지 않고 편집본부터 이어간다.

## 새 작화와 생성 기록

내장 ImageGen에 [승인 일러스트](../source/approved-illustration.png)와 기존 전투 자세를 참조해 두 4칸 시트를 만들었다. 검은 눈 무늬·긴 흑발/땋은 머리·가슴 문신·흰 금장 코트·검은 하의·발목 감개와 맨발·검을 외형 기준으로 유지했다. 칼끝/손/발이 시트 경계에서 잘리지 않게 여백을 재편집했다. 총 4회 생성·편집 결과를 모두 보존했으며 마지막 두 시트에서 8자세를 채택했다.

| 선택 원본 | 새 자세 |
| --- | --- |
| [turn-sheet-v2.png](art/turn-sheet-v2.png) | 회전 준비, 몸을 틀어 베기, 도약 전 압축, 이륙 |
| [air-sheet-v2.png](art/air-sheet-v2.png) | 공중 준비, 내려베기, 착지, 회복 |

[전체 프롬프트](source/prompts.json), [생성 원본·해시·선택 이력](source/generation.json), [동작 설계](source/motion-brief.json)를 보존했다. `art/turn-sheet-v1.png`·`art/air-sheet-v1.png`는 미선택 이력이다. 투명 PNG에 일반 사각형 crop과 균일 축소·등록만 적용했다. 인체/검을 마스크나 변형으로 억지로 이어 붙이지 않았다. [crop 검사](qa/crop-audit.json)의 8칸 모두 경계 알파 침범 0이다. 공중 자세는 가상의 바닥 기준점을 사용해 무릎을 접은 몸을 지면까지 늘이지 않았다. Krita/Aseprite 수작업이나 신규 Runway 생성은 하지 않았다.

## 연격과 이펙트

| 구간 | native 시각 | 동작/표현 |
| --- | --- | --- |
| 낮은 발도 | 0.08 → 0.30초 | 준비 후 빠른 접근, 직선 검광과 첫 타격 정지 0.035초 |
| 몸통 회전 | 0.48 → 0.64초 | 뒤쪽으로 틀어 준비 → 반대 방향 베기, 곡선 검광과 정지 0.050초 |
| 도약·내려베기 | 0.75 → 1.22초 | 다리 압축 → 도약 → 머리 위 준비 → 내려베기 → 착지, 정지 0.085초 |
| 회복·복귀 | 1.39 → 2.12초 | 낮은 착지에서 회복, 기존 편성 위치 복귀 |

Native 길이는 2.12초, 공용 타임라인의 정지 구간 포함 2.29초다. 기존 V3 기본 1.3배에서 실제 약 1.76초다. 도약은 native root의 포물선 이동, 자세는 교체 작화다. 공중 이동 때 체력바도 높이를 따라가 손·칼을 덮지 않으며, 종료/취소/죽음 때 원래 위치를 복원한다. 망토·장식의 미세 물리는 추가하지 않았다.

연출상 접촉은 3번이지만 **기존 V3 피해 콜백은 마무리 1번**이다. native 1.22초, 정지 포함 공용 시각 1.305초에 기존 HP/방벽 스냅샷과 타격 전달을 적용한다. 첫 두 검격은 시각 연출이다. 정식 용병/서버 다단히트 스킬을 새로 등록한 것은 아니다.

`TempestEffects.mjs`는 실제 손/칼끝 기준점과 과거 루트 위치를 써 직선·회전·공중·착지 궤적을 구분한다. 공중 검광은 내려오는 칼끝을 따라간다. 0.035/0.070초 전의 실제 Spine 자세를 공유 atlas로 재생해 짧은 잔상 2개를 만든다. 몸·루트·잔상·검광·대상 반동이 같은 등록 GSAP 타임라인을 사용한다. 별도 게임 캔버스나 독립 실시간 시계는 없다.

[Effekseer 원본](effects/native/tempest-slam.efkefc)은 내려오는 압력선, 갈라진 타원형 지면 잔광, 위/옆으로 흩어지는 파편을 갖는 35노드 효과다. 1.70e CUI 저장/재열기/export의 바이트 동일성을 확인했다. 같은 버전 공식 WebGL로 원본 46프레임을 출력하고, 선행 빈 2프레임을 제외한 44프레임을 패킹했다. 편집기 Recorder의 CUI 이미지 출력으로 설명하지 않는다. CUI의 비차단 Logger 경로 진단도 로그에 남겼다.

기존 Runway 흰색/금색 검광 재질, V2 Effekseer 적중 파열, Blender 입체 파편은 재사용했다. 이번에 Blender 모델을 새로 만들거나 Runway/Layer 결제·연결·크레딧 사용을 한 것은 아니다.

## 확인한 결과

- [네이티브 왕복](qa/native.json): 새 편집본 저장/재열기/export. 기존 7개 애니메이션은 유지했다.
- [재생 23검사](qa/verification.json): 세 타격 정지의 몸/효과 동결, 최종 피해 1회, 탐색 중복 방지, 직접 탐색/24·60fps 동일 결과, 일시정지, 효과 토글, 타격 전후 취소, 숨김, 죽음·부활, 복귀, 한 캔버스, 정상속도 OFF/ON 각 3회, 0.25배/2배, 적 반전과 390px을 확인했다. 최대 검 기준점 오차는 약 0.000066 전장 좌표 단위다.
- [기존 이벤트 9검사](qa/event-integration.json): 실제 TURN/회피/연속 공격/숨김/재진입 경로. [기존 공격 교차 재생](qa/legacy.json): 연격 뒤 기본·발도 각 2회, 타격 1회와 원위치/체력바 복구. 기존 mixed/cardgu 경로도 각 2회 확인했다.
- [실제 전장 캡처](qa/inspection.json): 효과 OFF/ON 주요 자세, 공중 체력바 간섭 수정 후 확인. 실제 화면과 정상 영상에서 추출한 프레임을 눈으로 검수했다.
- [정상속도 녹화](qa/recording.json), [영상/페이지 검사](qa/review-video.json): 실제 V3 시계로 재생, PC/390px 두 영상의 프레임 변화·탐색/재개·가로 넘침 없음·HTTP Range 206 확인. 초기 VP9 자동 캡처에서 첫 발도 구간이 빠져 보여, 렌더 직후 수동 프레임 요청 방식의 VP8로 교체했다. 이후 첫 발도와 후속 자세가 담기는 것을 확인했다. 전장 재생 속도를 바꾸거나 정지 프레임으로 정상속도 녹화를 대신하지 않았다.

연속 영상 전체 시청, 물리 모바일 기기 성능, 모든 용병/모드 조합, 사용자 최종 시각 승인, DNF급 완성은 미검수다. 교체 작화 사이의 추가 중간 그림·발도/납도 연결·양발 보행/후퇴·사운드는 남은 개선 범위다. 좌우 반전은 기존 view 반전이며 별도 반대편 작화가 아니다.

현재 2페이지 캐릭터 atlas, 사용 효과 atlas, Runway mip chain의 디코딩 추정은 약 **63.90MiB**다. 기준 대기 PNG와 기존 V3 자산은 제외한 수치이며 실제 전체 GPU 메모리나 실기기 FPS 측정값이 아니다. 잔상은 같은 atlas를 공유한다.

## 재현과 보존

보존된 ImageGen 원본과 기존 의존성을 재사용한다. [crop 준비](prepare-art.mjs) → [입력 작성](author.mjs) → [Spine CLI](native.mjs) → [Effekseer 제작](effects/author.mjs) → 기존 `effects/bake-effekseer.mjs`·`effects/pack.mjs`에 이 `action-v3/effects` 경로 전달 → `../v35-v3-upgrade-20261101/build.mjs` 순서다. native 해시가 바뀌었으면 자동 생성으로 덮지 않는다. 초기/V1/V2 검수 폴더를 새 검사 출력으로 덮지 않는다.

이번 검수 도구는 `qa/inspect.mjs`, `qa/verify.mjs`, `qa/legacy.mjs`, `qa/record.mjs`, `qa/review-panels.mjs`, `qa/review-video.mjs`다. 기존 `../qa/event-integration.mjs`에는 이 `action-v3/qa` 경로를 출력 대상으로 전달한다. `qa/diagnose-capture.mjs`는 렌더 직후 원본 프레임과 디코딩을 대조하는 진단 도구다.

사용자 화면 조작, 운영 배포/계정 쓰기, 메시지, 유지관리/삭제/예약은 하지 않았다. 원본 일러스트·이전 native·V1/V2 효과와 QA·이전 검/Blender 파편을 보존하며, 범위 커밋과 원격 저장은 `[CF-Pages-Skip]`로 분리한다.

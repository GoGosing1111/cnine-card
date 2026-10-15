# 조직 세력전 UI — interface-v2 (2026-10-15)

사용자가 반려한 두꺼운 금장 판타지 버튼을 공통 ImageGen 현대 조직 UI 자산으로 교체한다. 세력전의 실제 46개 행정경계, 전체/서울/선택 확대, API, 권한, 전투, 공동자금과 개인 보상은 변경하지 않는다.

## 버튼 표면 감사

| 조작 | 표면 |
| --- | --- |
| 전황·편성·자금·기록 탭 | tab-default / tab-selected |
| 광역 전체·서울 확대·선택 지역 확대 | action-default / action-selected |
| 지도 + / −, 새로고침 | icon-default / icon-selected |
| 지역·부대·행동대장 선택 필드 | action-default / action-disabled |
| 출정·점령·전투 입장·교전·편성 저장 | action-primary |
| 공격대 선택 | action-default / action-selected |
| 편성 관리·조직원 추가·주둔 배치 | action-default |
| 조직원 편성 해제·전투실 닫기·알림 닫기 | icon-default / icon-selected |
| 편성원 전투 알림·작전 정보 | action-default |
| 나중에 참여·재시도·과거 정산·본부로 이동 | action-default |
| 전투 결과 복귀 | action-primary (상위 프레임에서도 동일 파일 사용) |
| 권한 없음·쿨다운·미편성·진행 중 비활성 | action-disabled |

주요 패널도 dossier-panel.webp의 9분할 표면(상/우/하/좌 12/11/12/11%, 표시 경계 14px)을 공유한다.

모든 표면은 `assets/ui/organization/interface-v2/`의 래스터 이미지를 사용한다. CSS는 배치·텍스트·크기·상태별 이미지 선택만 담당하며 기존 action-gold.png / answer-steel.png 버튼은 더 이상 참조하지 않는다. 버튼 위 텍스트와 기능 아이콘은 접근성 있는 HTML/SVG로 유지한다.

팔레트는 charcoal / deep teal / graphite, 본문은 ivory, 주 조작만 절제한 amber로 통일한다. 사용자 기능을 담은 버튼과 선택 필드는 기본 44px 이상이며 반복 편성 해제는 기존 줄 구성에 맞춰 별도 소형 표면을 사용한다.

## 검수

- 통과: PC 1440px / 모바일 390px 전황·서울·지역 확대·편성·읽기 전용·자금·침공 알림. 10개 화면 상태의 실제 버튼·선택 필드·본부 링크 112개를 감사해 모두 interface-v2 이미지 사용을 확인했다. 권한 없음과 이미 편성됨 등 비활성 24개도 action-disabled 표면을 사용한다.
- 통과: 실제 V3 전투실·공격·결과 복귀·쿨다운 비활성 버튼. 새 자산 404 없음, 단일 공격 요청, 원래 HP 갱신 및 복귀 흐름 유지.
- 출력 위치: `preview/organization-interface-v2/faction/`, `preview/organization-interface-v2/faction-battle/`.
- `control-audit.json`에 렌더된 버튼/필드의 실제 이미지 경로와 비활성 상태를 기록한다.

- 독립 시각검수: 지도·편성·알림·전투실·결과 복귀 6개 캡처에서 이미지 표면 통일, 상태 구분, 텍스트 잘림·깨진 모서리·구형 금장 버튼 잔존 없음 확인. 알림 닫기 포커스 링은 접근성을 위해 유지한다.

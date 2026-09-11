# 폐차장 신규 SD 4종 제작·배경 제거 기록

2026-09-11 전체 V3 출시 준비 중 빠진 압축 설비·용광로 SD를 제작했다. 기존 승인 외곽 2종을 수정하지 않았다.

| 캐릭터 | 원화 기준 | 생성 원본 / 전투 PNG |
| --- | --- | --- |
| 극성 회수기 | `assets/ui/scrapyard/monsters/polarity-reclaimer-v1698.webp` | `assets/polarity-sd-source-v1.png` / `polarity-sd-v1.png` |
| 유압거신 아틀라스 | `hydraulic-titan-atlas-v1698.webp` | `assets/atlas-sd-source-v1.png` / `atlas-sd-v1.png` |
| 신더트랙 라바저 | `cindertrack-ravager-v1698.webp` | `assets/ravager-sd-source-v1.png` / `ravager-sd-v1.png` |
| 용광로 군주 몰로크 | `furnace-sovereign-moloch-v1698.webp` | `assets/moloch-sd-source-v1.png` / `moloch-sd-v1.png` |

이미지 생성은 각 원화와 기존 기어죠 전투 SD를 참조했다. 생성 요청의 공통 조건은 단일 전신·왼쪽 3/4·작은 화면에서 읽히는 2D 기계 몬스터·정돈된 외곽선·원화의 장치와 색 보존·프레임/문구/UI 없음·투명 배경이었다. 극성 회수기의 4개 갈고리/전자석, 아틀라스의 압력계/프레스 주먹, 라바저의 4족/용광로 균열, 몰로크의 뿔/용광로/망치/방패를 각각 지정했다.

생성 결과는 1254×1254 RGB에 체크무늬가 그려져 있었다. 사용자가 **“배경만 코드로 제거”**를 명시적으로 승인했다. `scripts/extract-scrapyard-sd-v1.py`가 원본 해시를 검증하고 연결된 중성 배경과 검수한 틈만 제거한다. 캐릭터 RGB 변경은 0픽셀이다. 금속 내부의 밝은 부분을 전역 색상 키로 삭제하지 않는다. 두 원본/완성본을 모두 보존한다.

`sd-completion-qa-v1.json`에 원본·결과 해시, 실루엣 경계, 투명 픽셀 수를 기록했다. 어두운/밝은 배경에서 검수했고 브라우저에서는 390/1366px 모든 구역과 용광로 16마리 완주를 확인했다. 새 SD의 최종 시각 승인은 대기이며 운영 도감/전투를 자동 전환하지 않았다.

전투는 기존 PixiJS 8.20.0 / GSAP 3.13.0의 `ScrapyardBattleEngine`과 공통 `BattleEngine.timeline()`을 그대로 사용한다. 새 스킬 또는 사운드는 만들지 않았다. 공격·피격·KO·탄착과 등장 0.48초 타임라인은 기존 검수 계약을 따른다.

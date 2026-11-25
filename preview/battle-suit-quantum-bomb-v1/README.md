# 배틀슈트 스킬칩 · 양자폭탄

적 진형 중앙에 둥근 올리브색 탄체가 수직으로 낙하한다. 착탄 순간 섬광과 지면 먼지가 먼저 퍼지고, 불이 비치는 연기 기둥이 솟구친 뒤 버섯구름과 잔불로 흩어진다. 이 프리뷰는 로컬 시각 검수판이다. [전투 영상](./review/quantum-bomb.mp4) · [모바일 전투 화면](./review/mobile-blast.png)

## 재생

프로젝트 루트에서 `node preview/battle-suit-skill-chip-v1/serve.mjs`를 실행한다. 프리뷰에서 재생 속도와 시점을 조정하고 같은 전장의 헬기폭격·로켓런처로 이동할 수 있다. [양자폭탄 프리뷰](http://127.0.0.1:8791/preview/battle-suit-quantum-bomb-v1/) · [스킬칩 장착 프리뷰](http://127.0.0.1:8791/preview/battle-suit-skill-chip-v1/loadout.html)

| 시전 후 | 전투 연출 |
| --- | --- |
| 0.00초 | 대상 진형 바닥에 조준점 표시 |
| 0.32~0.83초 | 탄체가 조준점과 같은 X축으로 낙하 |
| 0.83~0.90초 | 탄체가 바닥에 닿고 짧게 정지 |
| 0.90초 | 살아 있는 적마다 한 번 피격, 폭발은 진형에 한 번 표시 |
| 0.90~3.60초 | 지면 충격파, 화염 기둥, 연기 소멸 |

전투 시작 시 발동한 뒤 30초마다 반복한다. 검수용 피해 배율은 각 적에게 슈트 1발 기준 12배다. 헬기폭격과 양자폭탄 중 한 개를 로켓런처·8방향 유도탄과 함께 장착할 수 있다. 두 칩을 교체할 때는 현재 장착된 쪽의 슬롯을 선택한다.

## 원화와 재생 방식

헬기폭격의 V3 실행 화면과 24프레임 폭발 원화를 기준으로 불꽃, 연기의 명암, 바닥 먼지를 맞췄다. 전용 투명 원화는 낙하 8프레임, 폭발 24프레임이다. 헬기폭격·로켓런처와 같은 섬광, 먼지, 연기, 불씨, 배기 텍스처와 기존 CC0 녹음 효과음을 함께 사용한다. 낙하 모양과 착탄 리듬은 던파 공식 자료를 참고했다. [기존 스킬칩 자산·음원 기록](../battle-suit-skill-chip-v1/manifest.json) · [던파 공식 컨셉아트](https://df.nexon.com/community/news/magazine/120334)

PixiJS 8.20의 지면 레이어와 전경 레이어에 같은 착탄점을 사용한다. 전투에서는 V3 공용 GSAP 3.13 시계를 따라가며 서버의 첫 유효 피격에 폭발을 표시한다. PC와 모바일에서 양 끝의 적을 포함하도록 충격파 범위를 잡고, 세로 화면에서는 구름 윗부분이 화면 안쪽으로 퍼지게 했다. [원본 PNG와 패킹 해시](./assets/atlases.json) · [생성 프롬프트](./prompts.json) · [칩 아이콘 원본과 해시](../../assets/ui/project-v/skill-chips/manifest-v1.json)

## 검증

영상은 로컬 서버 전투 계산에서 얻은 첫 시전과 적 3명의 피격 이벤트를 V3의 `playEvents`로 재생해 녹화했다. 스킬 한 번, 피격 세 번과 최종 HP를 확인했다. 스크럽 가능한 프리뷰에서는 같은 세 적의 배치에서 낙하축, 충격파 범위와 연기 소멸을 PC 및 모바일 크기의 Chromium으로 검사했다. [화면 측정값과 전투 검증 결과](./review/checks.json)

```sh
node preview/battle-suit-quantum-bomb-v1/pack-assets.mjs
node scripts/build-v3-grid-consumers.mjs
npm run test:skill-chips
npm run test:battle-suit
node --test tests/prime-draw-skill-chips.test.mjs
```

프리뷰 서버를 실행한 상태에서 `node preview/battle-suit-quantum-bomb-v1/record-review.mjs`로 다시 녹화한다. Playwright와 FFmpeg의 설치 위치는 `PLAYWRIGHT_MODULE`, `FFMPEG_PATH`로 지정할 수 있다.

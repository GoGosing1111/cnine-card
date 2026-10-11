# 아르덴 에너지 · 동방무기 상위 비밀무기 설계도

2026-10-11 사용자 요청: 아르덴 에너지와 비밀무기 설계도 1장·2장·3장 리소스 제작. 설계도는 수량별 묶음이 아니라 서로 다른 세 도면이다.

최신 지시: **“아르덴 에너지는 승인이고 나머지는 동방무기 상위버전 설계도로 사용할거야”**. 아르덴 에너지는 사용자 시각 승인, 설계도 세 장은 동방무기 상위 버전용 검수 시안으로 기록한다.

## 파일 및 용도

| 리소스 | 구분 | 원본 PNG / 512px WebP 공통 경로 | 상태 |
| --- | --- | --- | --- |
| 아르덴 에너지 | 청록 결정·백금·금세공 | `assets/items/arden-energy-v1` | 원본 전체 승인 |
| 비밀무기 설계도 1장 | 금룡 총기 외형 도안·I | `assets/items/secret-weapon-blueprint-chapter-1-v1` | 사용자 검수 대기 |
| 비밀무기 설계도 2장 | 쌍룡 동력 문양·II | `assets/items/secret-weapon-blueprint-chapter-2-v1` | 사용자 검수 대기 |
| 비밀무기 설계도 3장 | 금룡 최종 봉인·III | `assets/items/secret-weapon-blueprint-chapter-3-v1` | 사용자 검수 대기 |

각 경로에 `.png`와 `.webp`가 있다. 원본은 1254×1254 RGBA PNG이며 생성 도구의 출력 바이트를 그대로 보존한다. WebP는 Sharp의 비율 유지 512px 축소, quality 92·alphaQuality 100·effort 6으로 별도 내보냈다.

승인된 에너지 PNG의 SHA-256은 `406e959495ada5973f751ab73b2117cb829984799dbaf595df69beec30608af4`다. 원본을 재생성·수정·재압축하지 않는다. 전체 파일 해시와 바이트 수는 [manifest](../preview/arden-energy-secret-blueprints-v1/manifest.json), 승인 범위는 [승인 기록](../preview/arden-energy-secret-blueprints-v1/energy-approval-20261011.json)을 따른다.

## 제작 및 검수

- **도구:** 내장 `image_gen.imagegen`. 아르덴 승인 V5·엠퍼러 에너지·기존 동방무기 설계도를 직접 확인한 뒤 제작했다.
- 실제 생성 명세는 [prompts.json](../preview/arden-energy-secret-blueprints-v1/prompts.json)에, 설계도 가장자리 여백 보정 명세는 [padding-prompts.json](../preview/arden-energy-secret-blueprints-v1/padding-prompts.json)에 기록했다. 초기 청록 설계도 시안은 용도 정정 전 이력이며 최종 자산에 사용하지 않는다.
- 설계도는 남색 도면지·금룡·상아색 말린 모서리·절제된 붉은 보석을 공유하고 중앙 도안과 장 번호를 구분했다. 1장 총기의 후방 몸체에서 총구까지 이어지는 축은 직선으로 확인했다. 장식적 판타지 도안이며 실제 제작 치수나 공법은 포함하지 않는다.
- 관련 검사만 실행했다. `preview/arden-energy-secret-blueprints-v1/qa.mjs`가 PNG/WebP 8개의 규격·알파·해시·가장자리 잘림을 확인했다. 에너지 원본 해시는 고정값과 일치했고 모든 파일의 가장자리 가시 픽셀은 0이었다.
- Playwright로 PC 1440px·모바일 390px에서 이미지 4종 로딩, 가로 넘침 없음, 네 확대창과 Escape 닫기, 배경 전환, 64px·128px 축소 표시를 확인했다. 두 화면과 밝은 배경의 투명 경계를 직접 검수했다. 보고서 시각은 `2026-10-11T14:26:40.928Z`, 오류 0건이다.
- 결과와 화면은 [qa/report.json](../preview/arden-energy-secret-blueprints-v1/qa/report.json) 및 같은 폴더 PNG 5장에 보존했다. 변경하지 않은 게임 시스템의 전체 검사는 실행하지 않았다.

## 범위 및 정적 배포

검수 갤러리: `/preview/arden-energy-secret-blueprints-v1/`. 어두운/밝은 배경, 원본 확대 및 PNG·WebP 다운로드를 제공한다.

이번 변경은 정적 이미지·독립 검수 페이지·승인 기록이다. 재료 카탈로그, 제작식, 비용, 성공 확률, 보상 풀, 기존 아르덴 장비 및 동방무기 운영 설정은 변경하지 않았다. 설계도 이미지 제작을 사용자 최종 승인으로 기록하지 않는다.

배포 선정: **assets-only**. 확인한 직전 운영 Pages는 `29184409-4787-426a-9cc2-0e6c0e929e04`, 소스 `b1864e1a02348fd14202af1098046bef23cbf53a`다. 범위 커밋과 원격 반영 후 `ASSET_DEPLOY_BASE`를 이 값으로 지정하여 `npm run deploy:production -- --assets-only`를 사용한다. 깨끗한 후보·원격 일치·변경 파일 범위·운영 Hyperdrive 검사는 유지한다.

배포 완료: 소스 `d27aa4ec129d67dd3633dd0273c966af16e48950`, Pages `73fb6207-afad-41fb-befc-d30a6d39fe65`. `--assets-only` 범위 검사와 운영 Hyperdrive query cache OFF 확인 후 정상 배포했다.

2026-10-11 23:34:35 KST 운영 확인: [검수 갤러리](https://cnine-card.pages.dev/preview/arden-energy-secret-blueprints-v1/) HTTP 200, 동방무기 용도·에너지 승인 문구 확인. 원본 PNG와 512px WebP 8개 모두 HTTP 200이고 SHA-256이 검수한 로컬 파일과 일치했다. [배포 영수증](arden-energy-secret-blueprints-20261011.json)에 파일별 결과를 보존한다. 이 배포 기록 추가는 문서 변경이므로 재배포하지 않는다.

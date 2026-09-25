# 저격 오리꿍 SS 출시 · 2026-09-26

사용자 승인: “승인 SS용병으로 올리고 잘안나오게 처리해 스킬 SD이미지 다 만들어서 적용해라 원거리에서는 가장 강한 포지션으로 이름은 저격 오리꿍”.

## 범위 및 정책

- V-050 / SS / 후열 SNIPER / 이름 저격 오리꿍. 승인 원화 V3 그대로 보존.
- 전용 MS-050 에메랄드 대물저격: 720%, 2턴, 자원 25. SS 기본 전투력 120000. 후열 최고 공격력 표적, 없으면 전열. 방어·회피·보호막·호위 적용.
- 알파 SD와 실제 사격 모션 6장, 탄착/파편/소멸 16장, 기존 라이선스 녹음·폴리 연결.
- 운영 SS 등급 확률 500ppm(0.05%) 보존, SS 내부 1% 선택으로 전체 0.0005%. 다른 SS 상대 가중치와 다른 등급·재화·비용·개봉 플래그 보존.
- CMS와 추첨 정책은 한 PostgreSQL 트랜잭션으로 저장하고 두 감사 기록 및 중복 방지 영수증을 남긴다. 계정 재화·보유 카드·덱을 임의 변경하지 않는다.
- 구현·자산·출처·밸런스 검증은 [제작 기록](../preview/mercenary-sniper-orikkung-v1/README.md).

## 배포 범위 선택

- 직전 운영 배포: `5e280386-f7a0-4e15-8e5a-4d31e27f68e1`, 소스 `972976dc44a4a56c1be2f332cfc9c426f4389d79`. Wrangler 운영 배포 목록으로 확인.
- 코드 기준 origin/main `89b9a0696a3d8a928b039e5d717254261d05c736`의 Z-body 번개 연출·광역 스킬을 보존하여 통합했다.
- 기존 용병 등록·단일 사격·개체 가중치 확장 한 종이며, 인증·DB 기반·스키마·의존성·인프라 변경이 없다. 공용 생성 번들이 바뀌므로 실제 메인 로더·번들 및 PVE/PVP 핵심 경로를 검사하는 scoped 배포로 선정.
- 최종 명령: `npm run deploy:production -- --scoped`.
- `SCOPED_DEPLOY_REASON`: 저격 오리꿍 SS 단일 용병 출시; 등록·희귀 추첨·원자성·PVE/PVP·공용 번들 연결 및 기존 용병 회귀 검사.
- `SCOPED_DEPLOY_CHECKS=[]`; functions 변경에 따른 `check:worker`는 지정 배포 도구가 자동 추가.

선택 검사:

```json
[
  "tests/mercenary-sniper-orikkung-live.test.mjs",
  "tests/mercenary-sniper-orikkung-rarity.test.mjs",
  "tests/mercenary-draw-weighted-v1.test.mjs",
  "tests/mercenary-draw-cms-v1.test.mjs",
  "tests/mercenary-cms-live-v1.test.mjs",
  "tests/mercenary-skills-v1.test.mjs",
  "tests/mercenary-s-skills-v3.test.mjs",
  "tests/mercenary-bikini-joeun-live.test.mjs",
  "tests/mercenary-heukwol-live.test.mjs",
  "tests/mercenary-cryvern-release.test.mjs",
  "tests/mercenary-ranged-balance.test.mjs",
  "tests/mercenary-fusion-transactions.test.mjs",
  "tests/mercenary-fusion-eight.test.mjs",
  "tests/mercenary-codex-live-v2098.test.mjs",
  "tests/pve-battlefield-entry-v2117.test.mjs",
  "tests/project-v-v3-live-payload-v1.mjs",
  "tests/z-body-thunder-fx-v3.test.mjs"
]
```

## 검수 근거

- 운영 CMS 57 기준 원거리 13종·전투력 3구간·4종 덱·양 진영·32 시드, PVP 9984전과 PVE 비교. 모든 원거리 비교 우세, SS 상대 69.8~76.4%. 모든 상황의 승리를 보장하는 수치가 아니다.
- PC 1440×1000 / 모바일 390×1000: 도감 원화/SD/스킬, 가로 넘침 없음, 6포즈·16프레임, 탐색/배속/취소 확인.
- 실제 로컬 계정 PVE/PVP API 응답 → 배포 V3 엔진/래퍼로 재생. 일반 5장+별도 용병, 한 번의 스킬 피해, 서버 확정 HP 일치, 오류 없음.
- 스크린샷·실행 결과: 작업 트리 바깥 `../qa/sniper-orikkung-20260926/`.
- 재시도와 실패 원자성은 SQLite·PostgreSQL에서 검증하며 운영 계정 대상으로 유료 개봉/자동 전투를 실행하지 않는다.

운영 배포 및 저장 결과는 완료 후 아래에 기록한다.

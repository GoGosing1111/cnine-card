# 엠퍼러 장비 CMS 등록 — 2026-09-09

사용자 승인: “엠퍼러 장비 cms등록해 설정은 내가할태니 유저공개만 풀어놓고”.

## 범위

| 코드 | 표시명 | 슬롯 / 종류 | 이미지 |
| --- | --- | --- | --- |
| EMPEROR_TOP | 엠퍼러 슈트 | TOP / TOP | `/assets/items/emperor-suit-v1.png` |
| EMPEROR_BOTTOM | 엠퍼러 레깅스 | BOTTOM / BOTTOM | `/assets/items/emperor-leggings-v1.png` |
| EMPEROR_SHOES | 엠퍼러 슈즈 | SHOES / SHOES | `/assets/items/emperor-shoes-v1.png` |
| EMPEROR_DUAL_DISK | 엠퍼러 듀얼디스크 | ACCESSORY / DUAL_DISK | `/assets/items/emperor-dual-disk-v1.png` |

- 활성/유저 공개는 1. 전투력/PVE/PVP는 미설정 값 0.
- 등급은 CMS 스키마 기본값 NORMAL을 임시 사용하며, 신규 엠퍼러 등급이나 전투력 정책을 정하지 않는다.
- MYTHIC을 임의로 지정하지 않는다. 현재 블랙미라클은 활성/공개된 MYTHIC 장비를 자동으로 포함하므로 공개-only 요청에 맞지 않는다.
- 보급상자는 `supply_enabled=0`, `supply_weight=0`을 **명시**한다. 운영 DB의 과거 기본값이 1이므로 생략하면 안 된다.
- 제작/합성 레시피, 드롭/연금술 풀, 계정 지급, 사용자 재화는 추가·변경하지 않는다.
- 승인된 1254×1254 PNG 4장은 원본 해시 그대로 보존한다. 재생성/리사이즈하지 않는다.
- 동시 작업 중인 V3 연속 PVE 개편 브랜치는 운영 배포에 합치지 않는다.

## 적용 / 검증

1. 운영 main에서 분리한 작업 트리에 이 요청의 이미지·운영 작업 모듈·검증·문서만 추가한다.
2. `node --test tests/emperor-equipment-cms-v1.test.mjs`로 원본 이미지 해시, 4종 등록, 공개, 보급 제외, 기존 장비 보존, 중복 실행과 롤백을 확인한다.
3. 범위 파일만 커밋하고 `npm run release:gate` 통과 후 `npm run deploy:production`으로 이미지 경로를 먼저 게시한다.
4. 운영 URL에서 이미지 4종의 실제 바이트 SHA-256을 대조한 뒤, 인증된 일회성 운영 도구로 `registerEmperorCatalog`를 실행한다.
5. 같은 트랜잭션의 `app_meta.ops_emperor_equipment_cms_20260909_v1` 영수증을 확인하고 별도 읽기 전용 조회로 4행과 비활성 획득 경로를 재검증한다.

`scripts/ops/emperor-equipment-cms-v1.mjs`는 운영자 전용 일회성 함수다. 앱 런타임이나 자동 마이그레이션에서 import하지 않는다. 재실행은 사용자 후속 CMS 설정을 초기화하지 않는다. 운영 토큰·DB 접속정보·개인 데이터는 커밋하지 않는다.

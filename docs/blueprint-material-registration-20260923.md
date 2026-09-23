# 설계도 2종 재료 아이템 등록 · 2026-09-23

사용자 요청: “둘다 아이템 등록해놔 나중에 재료로 사용할거야”.

## 등록 결과

| 이름 | 아이템 코드 | 이미지 |
| --- | --- | --- |
| 동방무기상 무기설계도 | `EASTERN_ARMS_WEAPON_BLUEPRINT` | `assets/items/eastern-arms-weapon-blueprint-v1.png` |
| 마이바흐 비전 6 차량설계도 | `MAYBACH_VISION6_BLUEPRINT` | `assets/items/maybach-vision6-blueprint-v1.png` |

- 두 항목 모두 `inventory_items`에 `category=MATERIAL`, `rarity=SPECIAL`(카탈로그 기본값), `is_active=1`로 등록했다.
- 정렬 순서는 각각 215001, 215002다. 방금 제작한 투명 PNG 원본을 연결했다.
- `MATERIAL` 공통 계약에 따라 인벤토리 `usable=0`, 안내 `재료 전용 · 사용 불가`가 적용된다.
- 제작소 CMS의 활성 아이템 목록과 합성 재료 선택 조건으로 두 항목이 조회된다. 추후 제조법·필요 수량을 이 코드에 연결하면 된다.
- 이번 등록 시점의 보유 재고 행·지급 수량·제작식 연결은 모두 0이다. 판매·드롭·상자 보상 설정은 수정하지 않았다.
- 기존 공용 API의 재료 계약을 사용하며 런타임·초기화 마커·기능 플래그 변경은 없다. 운영 DB 카탈로그 행은 재배포 후에도 유지된다.

## 운영 반영

- 적용 시각: 2026-09-23 16:01:30 KST.
- 대상: 기존 Neon 운영 `cnine` DB, `cnine_migrator`.
- 실행 SQL: [blueprint-material-catalog-20260923.sql](releases/blueprint-material-catalog-20260923.sql).
- 완료 영수증: `ops:blueprint-material-catalog:20260923:v1`, `COMPLETED`.
- 관리자 감사 ID: `35117`, 등록 행수 2.
- 카탈로그·관리자 감사·완료 영수증은 하나의 트랜잭션으로 처리했다.
- 완료 후 재실행은 메타데이터를 덮어쓰지 않는다. 최초 적용 중 코드·이름 충돌은 전체 롤백한다.

## 검증

- 격리 PGlite에서 8개 확인: 운영 DB 이름 가드, 두 재료 등록과 재고 보존, 재실행 시 후속 편집 보존, 코드 충돌 전체 롤백, 이름 중복 거절, 감사 실패 전체 롤백, 활성 OWNER 검사, 잘못된 완료 영수증 거절.
- 운영 등록 후 별도 읽기 트랜잭션에서 두 카탈로그 행과 완료 영수증을 확인했다.
- 실제 `/api/inventory` 소스의 SELECT를 운영 DB에서 조회해 두 항목의 이미지·수량 0·`usable=0`을 확인했다.
- 제작소 CMS와 동일한 활성 카탈로그 조회에서 두 재료를 확인했다.
- 두 이미지 URL은 HTTP 200이며 배포된 파일의 SHA-256이 제작 원본과 일치했다.
- 기록·SQL만 범위 커밋하고, 프로젝트의 등록 메타데이터 전용 배포 규칙을 적용한다.

## 이미지 출처

두 이미지 모두 이 작업에서 이미 제작·배포한 내장 imagegen 결과다. 이번 등록에서는 이미지 파일을 변경하지 않았다.

- [동방무기상 원화·프롬프트](eastern-arms-weapon-blueprint-v1.md)
- [마이바흐 비전 6 원화·프롬프트](maybach-vision6-blueprint-v1.md)

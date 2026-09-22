# 핑두 리페어 쿠폰 · 2026-09-22

## 확정 범위

- 사용자 요청: 장비 강화 파괴 복구용 **핑두 리페어 쿠폰** 생성.
- 후속 답변: **1장·직전 단계·추가 코인 및 기한 없음**.
- 아이템: `PINGDU_REPAIR_COUPON`, `MATERIAL` / `SPECIAL`. 인벤토리 직접 소비가 아니라 장비 강화 센터 → 장비 복구 → 본인 파괴 기록 선택 후 사용한다.
- 복구 재료 1장, 코인 0, `PREVIOUS`, `expiresHours:0`. 한 파괴 기록은 한 번만 복구하며, 기존 소모 강화 재료는 돌려주지 않는다.
- 운영 조회 시 정책 r1/OFF, 복구 `enabled:false` 및 미설정 상태였다. 공개 설정 r1/공개 ON/실행 OFF. 해당 실행 상태와 강화·보호권 정책은 보존한다. 이번 작업으로 강화·복구가 열리지 않는다.
- 유저 지급·판매처·드롭·상자·뽑기 보상풀 추가 없음.

## 구현

- `functions/_forge_repair_catalog.js`: 독립 마커 `pingdu_repair_catalog_20260922_v1`. 이전 runtime/protection 마커가 있는 DB에서도 등록되며, 아이템과 완료 마커가 같은 트랜잭션이다. 기존 운영자 메타데이터는 덮어쓰지 않는다.
- 인증된 인벤토리와 OWNER 강화 CMS에서 카탈로그를 준비한다. 인벤토리는 본인 수량·이미지·전용 복구 안내를 반환하며 직접 사용 API도 차단한다.
- 기존 원자적 복구 거래를 재사용한다. 복구 쿠폰 차감·장비 생성·강화 단계·파괴 기록 완료·감사 내역이 함께 성공/롤백된다. 쿠폰 부족, 타인 기록, 이미 복구된 기록은 거절한다.
- 견적이 재료 이름과 이미지를 반환하고 실제 복구 패널은 해당 이미지를 사용한다. 승인 강화 연출 자산은 수정하지 않는다.
- `scripts/ops/pingdu-repair-policy-20260922.sql`: 사용자 확정 복구 기준만 운영 초안에 1회 적용한다. DB/OWNER/기존 r1·OFF·미설정 정책을 검증하고 CAS·관리자 로그·완료 마커를 같은 트랜잭션으로 처리한다. 이미 완료됐으면 후속 CMS 편집을 덮어쓰지 않는다.

## 검증

- 관련 DB·정책·인벤토리 테스트 61개: SQLite/PostgreSQL의 등록 원자성, 기존 마커, 미지급, CMS 저장, 계정 격리, 직접 소비 차단, +8 복구, 오래된 기록, 재시도, 중복 견적, 쿠폰 부족, 실패 롤백.
- 운영 적용 SQL도 격리 PostgreSQL에서 검증: DB 가드, OFF 보존, 다른 정책 불변, 감사 실패 전체 롤백, 정책 충돌, 재실행 시 후속 편집 보존.
- 로컬 실화면 1440×1000 / 390×844: 실제 CMS 선택·저장, 인벤토리 상세·수량·사용 안내, 복구 견적의 쿠폰 이미지·1장·0코인·기한 없음·+8, 가로 넘침 없음.
- 격리 계정 실제 버튼 복구 후 쿠폰 2→1, 코인 9,999,900 유지, +8 장비 1개 및 미복구 기록 0 확인. 운영 계정에서 검수용 지급/파괴/복구는 하지 않았다.
- 로컬 검수 서버: `node scripts/qa-pingdu-repair-coupon.mjs`, 127.0.0.1:8963 전용. 운영 SQL/계정과 연결되지 않는다.
- 전체 출시 검사는 `npm run deploy:production` 내부의 `npm run release:gate`로 실행한다. 운영 등록은 배포 완료 후 위 원자적 SQL로 수행하고 별도 조회로 확인한다.

## 이미지

내장 imagegen으로 전용 네이비·로즈골드 쿠폰을 제작했다. 기존 장비 보호권 이미지는 유지했다.

- 원본: `assets/items/pingdu-repair-coupon-v1.png`, 1254×1254 RGBA, 1,555,624 bytes.
- 서비스: `assets/items/pingdu-repair-coupon-v1.webp`, 384×384 RGBA, 35,836 bytes. 균일 축소, quality 90/alphaQuality 100. 알파 0~255 검증.
- 원본 SHA-256: `CF769422203227B5DB0A0B2BE39B1F2B777855FBCF7C2651EBA1575E150F634E`.
- 서비스 SHA-256: `D554D9CD1BF2C29F2B9B1AD6BDAEB935156BD42A7AF9E60D7A1ED09A1CC6F447`.

최종 생성 프롬프트 (built-in):

```text
Use case: stylized-concept.
Asset type: production inventory item icon for a premium fantasy RPG, equipment-destruction recovery coupon named 핑두 리페어 쿠폰 (the name is metadata only, do not write text in artwork).
Primary request: one luxurious repair voucher, a thick horizontal dark navy metal ticket with soft rose-gold edging and notched ticket corners. In the middle, a clearly readable silver sword emblem with a glowing rose-pink repair seam joining two previously broken blade sections; a single elegant circular restoration arrow around the sword emblem. Polished high-end 2D game item painting, clean dimensional metal planes, a few pink crystal accents, restrained micro detail, readable at 64 px.
Composition: one isolated ticket centered at a mild three-quarter angle, fills 78% of a square 1024 x 1024 canvas, generous empty margin. No extra objects, no frame.
Scene/backdrop: genuinely transparent background with actual alpha, no floor, no environment, no baked checkerboard, no rectangular shadow.
Lighting: bright silver and rose-gold highlights, concentrated pink magic on the repair seam, distinct navy body silhouette. Preserve clarity at small icon size.
Constraints: absolutely no letters, words, numbers, logos, watermark, UI or card frame. One voucher only, not a poster, no character, no shield. Do not use flat vector clipart.
```

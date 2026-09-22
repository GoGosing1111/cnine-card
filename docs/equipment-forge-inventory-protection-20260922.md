# 장비 강화 목록 스크롤 · 장착 표시 · 장비 보호권

## 요청과 반영

- 장비가 많아도 강화 버튼이 밀리지 않도록 보유 목록과 더 불러오기만 내부 스크롤 영역으로 묶었다. PC에서는 강화 무대/정보 높이를 따르고, 태블릿·모바일에서는 제한된 높이의 세로 목록을 사용한다.
- 장비 종류 필터/새로고침/복구 탭 전환은 목록 처음으로, 장비 선택과 다음 페이지 추가는 현재 스크롤 위치로 유지한다. 목록에 키보드 포커스를 줄 수 있고 선택 후 포커스도 보존한다.
- 서버의 개별 장비 `equipped === true`만 방패 아이콘과 ‘장착 중’ 배지로 표시한다. 같은 장비 종류의 다른 복제품, 파괴 기록에는 장착 배지를 붙이지 않는다. 선택 무대에도 장착 상태를 표시한다.
- 기존 승인 연출·원본 22개, 공용 메뉴, 재화/전투력/확률/보호 소모 정책은 변경하지 않는다.

## 보호권 등록과 CMS

- 아이템 코드: `EQUIPMENT_PROTECTION_TICKET`, 이름: **장비 보호권**, 분류: `MATERIAL`, 표시 등급: `SPECIAL`.
- `/admin/#equipment-forge` → 보호권 · 획득처 → 보호권 아이템에서 선택 가능하다. 선택한 아이템의 원본 이름/코드와 카탈로그 이미지를 미리 보여준다.
- 카탈로그 등록은 별도 `equipment_protection_catalog_20260922_v1` 마커로 처리한다. 과거 runtime fast gate가 이미 있어도 CMS/인벤토리 진입에서 실행되며, 카탈로그와 완료 마커는 한 트랜잭션이다. 재시도는 중복 등록하지 않으며 기존 운영자 메타데이터를 덮어쓰지 않는다.
- 등록은 재화 지급이나 운영 정책 선택이 아니다. 운영자가 편집한 초안(작업 중 조회 시 r1/OFF), 보호권 코드/소모 횟수/확률, 획득처 설정, 강화 OFF와 공동 출시 잠금은 자동 변경하지 않는다. 상점·상자·뽑기 풀에도 자동 추가하지 않는다.
- 인벤토리 실제 API는 본인 보유 수량과 신규 수량, 보호권 이미지를 반환한다. 기본 ‘보유한 아이템만’에서 0개는 숨기고 1개 이상이면 표시한다. 인벤토리 직접 사용은 불가하며 장비 강화에서 사용하는 재료임을 안내한다.

## 이미지 자산

- 내장 imagegen으로 신규 제작, 승인된 기존 보호 모듈 이미지는 무수정 보존.
- 원본: `assets/items/equipment-protection-ticket-v1.png` — 1254×1254 RGBA, 1,623,588 bytes.
- 서비스: `assets/items/equipment-protection-ticket-v1.webp` — 384×384 RGBA, 35,126 bytes. 비율 유지 축소, WebP quality 90/alphaQuality 100. 투명 알파 최소 0/최대 255 확인.
- 원본 SHA-256: `E18A0008F24B59A81F96778C80BBEF2CD09B2E6E274F01BD8DEADA69886F7B3E`.
- 서비스 SHA-256: `1C960ACC2A99449DA47BAE29D6DC3B8A14C34BA18C19792C54632B0DFE4A5FC4`.

### 최종 생성 프롬프트

```text
Use case: stylized-concept.
Asset type: polished collectible equipment-protection voucher icon for the SOOPKETMON game's inventory and enhancement CMS, a new production raster asset.
Primary request: one premium equipment-protection ticket, immediately recognizable as a protective coupon rather than a wearable shield. A substantial horizontal navy metal pass with subtly clipped/notched ticket corners and silver-white edging, an inset emerald crystal shield emblem centered on the pass. Refined fantasy/sci-fi game-item illustration with clean dimensional metal planes and luminous mint-green energy enclosed inside the shield. No objects around it.
Composition: single isolated object centered, slight three-quarter perspective, large readable silhouette filling about 78% of a square 1024 by 1024 canvas, ample transparent margin; readable at 64 pixels. Strong separation between dark navy body, silver rim, emerald shield. Restrained surface detailing, clean edges, no excessive tiny machinery, no rays or particles scattered outside.
Scene/backdrop: genuinely transparent background with actual alpha, no floor, no environment, no drop-shadow rectangle, no checkerboard baked into pixels.
Text: absolutely no text, letters, numbers, serials, logos, watermarks, UI or card frame. This is the item artwork itself.
Constraints: one voucher only, not a set, not an infographic, no dragon design. Crisp polished high-end 2D game illustration; do not use a generic flat vector symbol.
```

## 검증

- 장비 강화 브라우저: 1920/1440/1366/1024/820/390/320px, 120개 3페이지 로딩. 목록 스크롤/키보드/선택 위치/장착 5개/동일 장비 미장착 복제품/복구/로그아웃/공용 메뉴/가로 넘침 검사. 장비가 40→120개로 늘어도 작업 영역과 강화 버튼의 문서상 위치는 변하지 않는다.
- CMS 브라우저: 1440/1024/390/360px. 새 보호권 선택·이미지 로딩, 저장/재조회, 기존 CAS·확률·공개 설정 분리, 가로 넘침 검사.
- 실제 게임 인벤토리 브라우저: 1440×900, 1024×768, 390×844, 320×740, 1440×560. 격리된 3개 보유 계정으로 원화·수량·전용 사용 안내·직접 사용 비활성 표시를 확인. 기존 개봉/필터/검색/선택/복귀 포함 95개 검증 통과. 운영 계정에 검수용 지급 없음.
- 강화 관련 단위/DB 테스트 58개 및 인벤토리 9개 통과. SQLite와 PostgreSQL에서 등록 원자성·재시도·과거 fast marker·CMS 카탈로그·실제 인벤토리 SQL/응답·미지급·운영 초안 불변을 검증한다.
- Cloudflare/Workers 스킬에 따라 인증 후 제한된 카탈로그 조회, 기존 Hyperdrive 연결, 재시도 가능한 독립 마커를 사용한다. 배포는 깨끗한 범위 커밋/`origin/main` 일치 후 `npm run deploy:production`의 전체 `release:gate`를 그대로 따른다.

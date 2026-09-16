# 강구열 · DK 클랜 유니폼 아바타

기존 카드도감 `assets/cards/강구열/01.webp`의 얼굴과 검은 가르마 머리, 자연스러운 체형을 참고했다. 유니폼 가슴 중앙에는 사용자가 지정한 **현재 숲켓몬 DK 클랜 마크** `assets/ui/clan/marks/dk-clan-mark-v1.webp`를 크게 적용했다.

초기 Dplus KIA 브랜드 해석은 사용자에게 반려됐다. 이 폴더에는 해당 브랜드 표시를 제거하고 현재 게임 DK 클랜 마크로 교정한 최종 시안만 보관한다.

- 로비: `assets/avatar-kangguyeol-dk-lobby-source-art-v1.png` — 1024×1536 RGB PNG, 무대 배경 및 별도 포즈.
- 장비창: `assets/avatar-kangguyeol-dk-equipment-source-art-v1.png` — 1024×1536 RGBA PNG, 별도 전신 포즈, 네이티브 알파 보존.
- 제작: 내장 `image_gen` 도구. 생성 원본을 무가공 복사했다.
- 사용자 승인: `그래 아바타 라이브에 배포하고 DK클랜에 11일 기간제로 지급해` (2026-09-16).
- 운영 카탈로그: `A-19 / KANGGUYEOL_DK / DK 강구열`. 실제 등록 명세는 `catalog.json`이다.
- 현재 DK 클랜원에게 지급 시점부터 정확히 11일(950,400초)의 EVENT 소유권을 지급한다. 별도 전투·재화 효과나 판매는 없다.
- 기존 장착 상태는 유지하고 보유 아바타 목록에서 직접 선택한다. 기존 24시간 교체 제한을 그대로 적용한다.

## 운영 자산 및 연결

- 로비 WebP: 1024×1536 / 모바일 640×960.
- 장비창 WebP: 640×1664 RGBA. 승인 원본의 좌우 투명 여백을 잘라내고 하단 128px 투명 여백을 추가해 전신과 신발이 기존 장비창에 들어간다. 인물 비율·포즈·얼굴·DK 마크는 변경하지 않는다.
- `build-assets.mjs`가 원본 해시를 검증하고 배포 파일과 `manifest.json`을 만든다. 원본 PNG는 보존한다.
- 기존 `avatar_catalog_v1` 및 `avatar_user_ownership_v1.expires_at`을 사용한다. 별도 서버 기능이나 자동 지급 마이그레이션은 추가하지 않는다.
- 운영 작업 키: `ops:dk-avatar-11days:season5:KANGGUYEOL_DK:20260916:v1`. 해당 작업의 영수증과 관리자 감사 로그로 등록·지급 인원·시각·만료를 확인한다. 재실행은 같은 영수증을 조회하며 기간을 연장하지 않는다.

## 검증

- `tests/avatar-kangguyeol-dk-11days.test.mjs`: PostgreSQL 호환 DB에서 실 API의 카탈로그·11일 소유권·장착·이미지 응답·만료 후 차단·효과 없음·비대상자 차단·기존 데이터 보존 검증.
- 기존 운영 `character-loadout-v2.js` / `character-loadout-v2.css`를 검수 화면에 그대로 사용했다.
- PC 1265px / 모바일 390px에서 로비 이미지, 장비창 전신, DK 마크 가독성, 신발·손 잘림, 탭 전환을 직접 확인했다.
- 배포 전 필수 `npm run release:gate`, 배포는 `npm run deploy:production`을 사용한다.

전체 생성·교정 프롬프트는 `final-prompts.md`에 기록한다.

# 토끼 구수댕 펫 설정 등록 — 2026-10-02

사용자 재첨부 승인 원본과 이름 `토끼 구수댕`을 오늘 제작한 OWNER CMS의 **펫·동료 준비 → 펫 설정**에 추가한다. 코드는 `PET-GUSUDAENG`다.

- 원화: `assets/ui/pets/gusudaeng/pet-tokki-gusudaeng-approved-20261002.png`
- SHA-256: `F632CE546F455947662E7C68CC11DADBB4F28907B2D28F74EFB3A3DFAB558349`
- 원본을 재생성·재압축·변형하지 않고 그대로 복사한다. 1254×1254 RGBA PNG다.
- `shared/pet-art-catalog-v1.mjs`에 원화 승인 항목으로 추가한다. 기존 봉순·조은·희야·디임 4종의 원본·승인 대기 상태는 유지한다. CMS의 개수 표시는 목록에 따라 갱신한다.
- 저장은 기존 OWNER CMS의 초안 추가·낙관적 버전 확인·CMS 저장 흐름을 사용한다. 기존 설정을 보존하고 새 행만 추가한다. `battleSprite`는 비워 두고 버프 증가율은 `null`, `enabled`는 `false`로 저장한다. 실제 보유·편성·획득·실전 기능은 활성화하지 않는다.

## 검수·배포 범위

작은 콘텐츠 추가와 선택 문구 수정이며 공통 인증·DB·경제·전투 구조를 변경하지 않는다. 직전 운영 배포는 Cloudflare Pages 프로젝트의 canonical deployment에서 확인한 `20f3a98e21bf65036063cfaae26c7a9dd8caf261` (배포 `9c12ec58-5682-4b20-96e8-902770e0065f`, 2026-10-02 12:17:18 UTC)다. 이 기준 이후의 기존 변경은 운영 확인 기록 문서뿐이다.

관련 회귀는 `tests/pet-equipment-20261002.test.mjs`로 한정한다. 승인 이미지 해시·기존 4종 보존·CMS 저장·준비 잠금·장착창 목록을 검증한다. Worker 구문 검사 `check:worker`를 함께 선택하며 전체 게임 검사는 실행하지 않는다. 같은 테스트를 별도로 중복 실행하지 않고 `npm run deploy:production -- --scoped`에서 한 번 수행한다.

격리된 로컬 fixture의 실제 CMS 처리기로 PC 1440×1050과 모바일 390×844에서 새 승인 항목 선택·초안 추가·CMS 저장·다시 불러오기를 확인했다. 이름·원화 경로가 유지되고 SD와 증가율은 비어 있으며 검수 사용은 꺼져 있다. 두 화면 모두 가로 넘침이 없다. 운영 배포 후 새 항목 저장과 원본 파일 해시만 짧게 재확인한다.

## 운영 반영 결과

- 배포 커밋: `b311b2e3a75429ba2208aec3e5eb5643e2af529e`
- 지정 scoped 명령 성공. 관련 테스트 9/9, Worker 구문·운영 출시 잠금·Hyperdrive 캐시 검사가 통과했다.
- Pages 운영 배포: `3bf173d3-5808-4615-9436-428e1f99d035`, `https://3bf173d3.cnine-card.pages.dev`, 2026-10-02 12:36:36 UTC. Cloudflare canonical deployment의 production/success/commit 일치를 확인했다.
- API runtime 버전: `5d118e01-4b22-4476-b14d-8d6ebbebf45a`. 기존 clan-draft 지정 배포도 완료했다.
- 저장된 OWNER 세션으로 실제 CMS에서 승인 일러스트를 초안 추가하고 **CMS 버전 1 저장 완료**를 확인했다. 기존 버전 0의 빈 목록에 `PET-GUSUDAENG` 1행을 추가했다. `battleSprite` 빈 문자열, 버프 증가율 미정, 검수 사용 OFF이며 공개·획득·실전 OFF다.
- 운영 원화 경로는 HTTP 200이고 SHA-256이 승인 원본과 완전히 일치했다. `/admin/`의 새 스크립트 캐시 버전 `20261002-pet-gusudaeng`도 반영됐다.

이 후속 운영 기록은 문서만 변경하므로 diff 확인·범위 커밋·원격 반영으로 종료하며 테스트와 배포를 반복하지 않는다.

# 장비 강화 센터 유저 선공개 · v2084

2026-09-12 사용자 지시: `장비강화 라이브 배포,유저공개만 해놓고 강화는 ON되야 가능하게`, 후속 `방어구도 되야한다`.

## 공개 범위

- `/equipment-forge/`: 승인 V2의 배경·타이포그래피·PixiJS/GSAP 연출 모듈을 재사용한 운영 화면. 장비 화면의 강화 센터 버튼으로 진입한다.
- 무기 `WEAPON`, 상의 `TOP`, 하의 `BOTTOM`, 신발 `SHOES`, 장신구 `ACCESSORY`의 실제 보유 인스턴스를 조회한다. 같은 종류도 개별 ID로 표시하며 계정별 소유·활성·공개·장착 슬롯을 검증한다. 배틀슈트는 별도 체계이므로 이번 대상에서 제외한다.
- 카탈로그 원본 이미지·기본 PVE/PVP 전투력을 표시한다. 방어구는 세로 비율을 유지한다. 강화 단계·확률·비용·보호권 수량은 미정 상태로 표시하며 프리뷰 시연값을 계정 정보로 사용하지 않는다.
- 승인본 22개 파일은 원래 해시를 보존한다. 공개 호스트는 프리뷰의 `app.mjs`, `model.mjs`와 가상 추첨을 불러오지 않는다. 결과 연출은 승인 모듈만 보존하고 실행 버튼은 잠근다.

## 공개·실행 설정

OWNER CMS `/admin/#equipment-forge`에서 공개 여부와 안내문을 저장한다. `app_meta.equipment_forge_public_settings_v1`에 버전과 작성자를 저장하고 `admin_logs`에 같은 트랜잭션으로 기록한다. 동시 저장은 이전 버전·원문 CAS로 거부하며 감사 기록 실패 시 설정도 롤백한다.

이번 운영값은 **공개 ON / 강화·복구 OFF**다. `FORGE_EXECUTION_IMPLEMENTED=false`를 유지한다. CMS의 ON 선택은 비활성이고 강제 PATCH ON도 `409 FORGE_NOT_READY`로 거부한다. DB에 수동 ON이 들어가더라도 실행 API는 `503 FORGE_NOT_READY`다. 설정값만으로 준비되지 않은 재화 차감·파괴·복구가 열리지 않는다.

향후 ON 전환에는 운영 확률·최대 단계·비용·전투력·보호권/복구 정책 확정, 원자 처리 서버와 전투력 연결 검수, V3·용병과 공동 활성화 조건이 필요하다. 성공/유지/파괴 3종, 성공률 최소 10%, 보호권 게임 내 극희귀 획득·상자 제외는 고정한다.

## API 계약

| 경로 | 현재 동작 |
| --- | --- |
| `GET /api/character/equipment/forge/status` | 공개 상태·실행 OFF·지원 슬롯·고정 규칙·미정 정책 |
| `GET /api/character/equipment/forge/state` | 로그인 계정의 개별 장비·코인 조회; `group=all/weapon/armor/accessory`, `beforeId`, `limit` 1~100 |
| `/api/character/equipment/forge/quote`, `enhance`, `restore`, `receipt` | 인증 후 비공개 403, OFF 423, 강제 ON 503; 상태·재화 변경 없음 |
| `GET /api/admin/equipment-forge` | OWNER 설정·버전·준비 조건 조회 |
| `PATCH /api/admin/equipment-forge` | OWNER 공개/안내 저장, 버전 충돌 409, ON 거부 |

공개 조회는 `no-store` 요청과 기존 API 응답 캐시 금지를 사용한다. 로그아웃·계정 변경·공개 OFF 시 이전 인벤토리를 지우고, 대기 중 이미지 조회도 무효화한다. 강화·복구 버튼을 DOM에서 강제로 활성화해도 클라이언트는 실행 요청을 보내지 않으며 서버도 별도로 차단한다.

## 검수·배포

- `npm run test:equipment-forge-public`: 기존 승인/준비 31개와 신규 PostgreSQL 호환 계층 8개 검사. 개별 소유·상의/하의/신발 페이지 이동·OFF·강제 ON·OWNER·동시 저장·감사 실패 롤백·기존 코인/장비 보존을 검증한다.
- `tests/equipment-forge-public-v2084.browser.mjs`: Chrome WebGL, 1440/1024/390/360px, 무기·방어구 선택, OFF 버튼, 복구/안내, 로그아웃·공개 OFF, 가로 넘침·브라우저 오류 검사 및 모바일 CMS 저장.
- 운영 앱/장비 모듈과 서비스워커 캐시는 `2084-forge-public`로 갱신한다. 승인 프리뷰 자산 버전은 그대로 유지한다.
- 깨끗한 최신 main 후보를 범위 커밋·푸시한 뒤 `npm run deploy:production`의 `release:gate`를 통과한다. 임시 DB 작업 도구·키·QA 이미지·로그는 배포 루트 밖에 둔다.
- 롤백은 이전 e39f6093 배포로 복귀하거나 CMS 공개 OFF로 숨긴다. 신규 장비 상태 스키마·재화 변경이 없어 장비 복구 마이그레이션은 필요하지 않다. CMS 저장값은 재배포로 덮어쓰지 않는다.

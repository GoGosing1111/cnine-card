# 베르칸 흑금 천우 PVE 연결 · SSS 확률 정정

2026-09-30 흑금 천우 운영 PVE 연결, PVP 광역기 제외 유지, 획득 ON을 반영했다. 같은 회차에 SSS 전체 확률을 0.1%로 올린 설정은 사용자의 후속 정정에 따라 잘못된 적용으로 확인됐다. **현재 운영 SSS 전체 확률은 기존 0.005%다.** 회수 및 보상 기록은 `docs/sss-rate-incident-20260930.md`에 있다.

## 적용 범위

- 베르칸 V-055에 기존 MS-055 흑금 낙성과 추가 MS-056 흑금 천우를 함께 배정한다. 천우는 서버에서 PVE만 허용한다. 비용·재사용 조건에 따른 기존 순환 선택을 사용한다.
- 천우는 살아 있는 적 전체를 각각 한 번 타격한다. 기존 낙성과 동일한 **총 배율 5.6 / 비용 35 / 재사용 5행동**을 사용하고 대상 수로 총 피해 예산을 나눈다. 회피·방어·보호막·제압·대상 제외 규칙과 서버 확정 피해를 유지한다.
- 기존 16프레임 화살비, 베르칸 모션, V3 PixiJS 8.20.0 / GSAP 3.13.0을 재사용한다. 원화·SD·이펙트 이미지 바이트는 변경하지 않았다. 1.62초에 서버 결과를 한 번씩 반영하고 등록된 V3 시계·취소·잔향 정리를 사용한다.
- 당시에는 모드별 `bodyPixels` 확대를 제거하고 512px 프레임 배율을 고정했다. 이후 PVP 검수에서 사격·낙성 모션 속 인물이 대기 자세보다 작게 그려진 사실을 확인했다. 후속 수정은 프레임마다 실제 몸 높이를 기준으로 캐릭터와 활 발사점을 함께 보정한다. 원본 PNG는 변경하지 않는다.
- 실제 화면 검수에서 베르칸의 기본 전투 높이도 380으로 일반 캐릭터 260보다 크게 지정된 것을 발견했다. 베르칸만 260으로 맞춘다. 다른 SSS 캐릭터의 배치 높이는 변경하지 않는다.
- 운영 CMS의 이전 54종/34스킬 문서는 읽기 확장으로 보존하고, 명시적인 감사 저장에서 베르칸·천우를 포함한 55종/36스킬로 저장한다. 다른 용병 배정과 운영 편집값은 보존한다.
- 당시 SSS 전체 확률을 50ppm(0.005%)에서 1000ppm(0.1%)으로 잘못 변경했다. 02:30 KST에 50ppm으로 복구하고, 이 설정에서 발생한 SSS 지급분을 회수했다. 다른 등급·재화 확률과 수량은 변경하지 않았다. 하이퍼팩 개봉은 기존 ON을 확인하며 별도 구형 개봉 플래그는 변경하지 않는다.

## 검수 및 배포 범위

작은 변경: 기존 베르칸의 추가 스킬 연결과 감사 가능한 운영 확률 설정. 공통 인증·DB 기반·스키마·의존성을 변경하지 않는다. 공용 V3 소비 번들은 같은 소스에서 재빌드했다.

- 직전 운영 Pages: `7bba117a-78e9-43c0-9b78-e1f9488c9860`, 배포 기준 SHA `9c706a93be8d3b8230567167ab5ca4fffde1ed50` (실제 Pages 목록 확인).
- 선택 검사: `tests/mercenary-berkan-area-20260930.test.mjs`, `tests/berkan-area-release-20260930.test.mjs`, `preview/mercenary-berkan-area-v1/qa.test.mjs`, 배포 도구가 추가하는 `tests/pve-battlefield-entry-v2117.test.mjs`, `check:worker`.
- 서버 재현: 정식 군단토벌 생성 경로에서 낙성·천우 모두 발생, 천우 12대상 결과 유지. PVP는 같은 시드에서 천우 배정 전후 타임라인 완전 일치. 제압·회피·보호막·미대상·비용·재사용·GSAP 한 번 반영/취소 확인.
- 운영 저장: 두 버전 설정과 CMS/확률/관리자 감사 기록을 단일 트랜잭션으로 변경한다. 이전 버전 충돌·감사 저장 실패 시 전체 롤백, 같은 작업 ID 재실행 시 중복 저장 금지.
- 실제 Chrome 1440×1000, 390×844, 음소거: 공용 V3의 `playMercenaryEvent`로 MS-056 실행, 적 5명 결과 1회씩 반영, 천우 연속 프레임 표시, PVP 이벤트 차단, 가로 넘침 및 콘솔 오류 없음. 검수 증거는 `C:/Users/User/AppData/Local/Temp/cnine-berkan-area-20260930/`에 보존했다.
- 전투 런타임 캐시 `20260930-berkan-area`, 로비 로더 `berkan=20260930-area-live`.

## 운영 반영 결과

- 2026-09-30 02:21 KST 적용. 소스 `6e1c5a6f2b3d24b981f4fb7b2aeac8c2b1635e26`, Pages `93fbdba6-6e7e-4a1e-87e5-662ca91def70`, API Worker `d086bdac-5627-46aa-b252-9ff84d1930f3`, Clan Worker `4bc65554-8334-4eff-8a4a-40bdf9c5c8ee`.
- `npm run deploy:production -- --scoped`의 선택 검사 20개·Worker 컴파일·출시 플래그·Hyperdrive 검사 통과. 당시 PC/모바일 확인은 512px 스프라이트 프레임의 높이만 측정하여 프레임 안의 실제 인물 축소를 놓쳤다. 베르칸 기본 배치 높이는 260이다.
- `berkan-area-sss-uniform-20260930-v1` 단일 트랜잭션 완료: CMS revision 60, 당시 확률 revision 27, 관리자 감사 ID 37958, CMS·확률 감사 영수증 각 1건. MS-055/MS-056 동시 배정, MS-056 `REVIEWED`·5.6/5/35, 당시 SSS 1000ppm, 개봉 모드 ON 확인. 확률 revision 27은 현재 사용하지 않는다.
- 운영 Pages에서 천우 manifest, 공용 V3 번들, 천우 프리뷰 번들, 로비 앱 파일의 SHA-256이 검수 파일과 일치하고 HTTP 200 응답을 확인했다. 결과 파일은 `C:/Users/User/AppData/Local/Temp/cnine-berkan-area-20260930/apply-result.json` 및 같은 폴더 `browser-qa.json`에 보존했다.
- 02:30 KST `sss-total-0005-restored-20260930-v1`로 확률 revision 28을 저장해 SSS 전체 50ppm을 확인했다. 당시 미완료 개봉 계획 0건, 관리자 감사 ID 38019. 이후 지급 회수 및 보상은 별도 운영 트랜잭션으로 완료했다.

## 베르칸 SD 시전 크기 후속 수정

- 원인: 대기 프레임의 실제 인물 높이는 약 427px, 사격·낙성 프레임은 약 305px인데, 이전 검수는 투명한 512px 셀의 높이만 비교했다. 발사 및 스킬의 실제 인물 높이를 프레임별 `sourceBounds`로 맞추고 활끝 좌표도 같은 배율로 계산한다. 종료 시 중립 포즈 배율을 원본 SD에 맞게 복구해 다음 시전에서 갑자기 커지는 문제도 막는다.
- 범위: 베르칸 PVP 사격·MS-055 및 PVE MS-056의 클라이언트 연출. 원본 이미지, 서버 피해·확률·재화·스킬 배정은 변경하지 않는다. 기존 캐시 `20260930-berkan-area`에서 `20260930-berkan-scale`로 갱신한다.
- 직전 운영 배포 기준 SHA `6e1c5a6f2b3d24b981f4fb7b2aeac8c2b1635e26`. 국소 수정이므로 `preview/mercenary-berkan-sss-v1/qa.test.mjs`, `preview/mercenary-berkan-area-v1/qa.test.mjs`, `tests/mercenary-berkan-area-20260930.test.mjs`와 공용 번들/로더 회귀를 선택하고 `npm run deploy:production -- --scoped`를 사용한다.
- 실제 V3 화면 1440×1000 / 390×844 검수: PVP MS-055에서 대기 인물 높이 126.875/164.938px, 시전 126.579/164.553px. PVE MS-056에서도 같은 크기를 유지하고 5명 피해를 각각 한 번만 반영했다. PVP의 MS-056 차단, 화면 잘림·가로 넘침·콘솔 오류 없음. 증거는 `C:/Users/User/AppData/Local/Temp/cnine-berkan-area-20260930/berkan-pvp-size-qa.json`, `browser-qa.json` 및 같은 폴더의 PC·모바일 스크린샷이다.
- 운영 반영: 커밋 `2a87927e`를 `origin/main`에 반영하고 scoped 검사 23개, 출시 플래그, Hyperdrive 검사를 통과했다. Pages 배포 `https://7be25ef7.cnine-card.pages.dev`, API Worker `b00ea09d-fa00-4cd3-803c-951e00537cd9`, Clan Worker `18dd8253-7d9c-4deb-9ad9-45a8f77880b5`. 운영 `cnine-card.pages.dev`에서 `index.html`, 로비 앱, 전투 로더, 공용 V3 번들, 베르칸 두 프리뷰 번들의 HTTP 200 및 로컬 SHA-256 일치를 확인했다.

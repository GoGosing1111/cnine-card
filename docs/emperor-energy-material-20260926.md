# 엠퍼러 에너지 재료 — 2026-09-26

사용자 요청: 미스틱 에너지의 상위 엠퍼러 에너지 리소스를 만들고 재료 아이템으로 추가한다.

## 등록 내용

- 코드 `EMPEROR_ENERGY`, 이름 `엠퍼러 에너지`, 부제 `EMPEROR ENERGY`.
- 분류 `MATERIAL`, 등급 `EMPEROR`, 활성 재료 목록 등록. 정렬 174901로 미스틱 에너지(174900) 다음에 배치한다.
- 인벤토리 API와 제작소 CMS 조회, 해당 아이템 관리자 지급 요청에서 동일한 등록 함수를 사용한다.
- 기존 재료와 같이 직접 사용은 불가하다. 미보유 상태에서는 `보유한 아이템만` 필터를 해제해 확인한다.
- 이번 요청은 재료 등록이다. 제작 레시피·비용·성공 확률·드롭·상점·보상 풀·유저 지급은 추가하지 않는다.
- 기존 행이 있으면 CMS 설정을 보존한다. 등록과 완료 표식을 하나의 트랜잭션으로 저장하며, 실패한 등록은 다시 시도할 수 있다. 완료 표식은 DB별 30분 캐시로 반복 조회를 줄인다.
- 인벤토리 등급순에서 `EMPEROR`는 `MYTHIC` 바로 위다. 엠퍼러 표기는 황금색이다.

## 리소스

내장 imagegen으로 생성. [실제 프롬프트](art-prompts/emperor-energy-v1.txt).

- 원본: `assets/items/emperor-energy-v1.png`, 1254×1254 RGBA, 1,533,273 bytes. 생성 원본을 그대로 보존한다.
- 런타임: `assets/items/emperor-energy-v1.webp`, 512×512 RGBA, 79,484 bytes. Sharp 균일 축소 + WebP quality 90, alpha quality 100.
- PNG SHA-256: `C82868130E7C3129BC0DEFDD89716921341D336A02B6FD0E65E8A90976374818`.
- WebP SHA-256: `3054E7C2DB08E637EABBC1B4049CFE2BBD57F4FC6B1A26B8C41D3F00C6E78658`.

## 범위 검수·배포

- 분류: 작은 변경. 아이템 한 종의 등록·표시이며 DB 스키마, 인증, 거래 공통 기반, 의존성 변경이 없다.
- 작업 기준: `2c1e95bb13d87f559ee5c3e4950ca35c9da2b0bf` (`origin/main`).
- 직전 운영 배포: `830ce03a-7a86-41b7-9619-15514d52ff68`, 커밋 `20142a8ade5953ab04b81715e97925c676785fdb`. Cloudflare production deployment 목록에서 확인했다.
- 직전 운영 이후 이미 main에 있던 변경은 원화·독립 프리뷰·문서이며 게임 실행 코드 변경은 없다. 이번 배포에 포함되지만 신규 용병 연결·활성화는 추가하지 않는다.
- 로컬 실제 게임 인벤토리 UI: 1440×1000, 390×844에서 재료 필터, 등급 표시, 이미지, 상세, 검색, 미보유 표시와 사용 비활성 확인. 가로 넘침·깨진 이미지·브라우저 예외 0. 캡처와 보고서는 작업 트리 바깥 `../qa-emperor-energy/`에 보관한다.
- 배포 명령: `npm run deploy:production -- --scoped`.
- `SCOPED_DEPLOY_BASE`: 위의 직전 운영 커밋 전체 SHA.
- `SCOPED_DEPLOY_TESTS`: `["tests/emperor-energy-20260926.test.mjs","tests/inventory-ui-v2125.test.mjs","tests/workshop-mystic-energy-v1931.test.mjs","tests/equipment-synthesis-material-v2008.test.mjs"]`.
- `SCOPED_DEPLOY_CHECKS`: `["check:worker"]`.
- 선정 이유: 새 재료의 중복·재시도 등록, 원본 및 런타임 알파, 인벤토리 분류·사용 제한·등급순, 기존 미스틱 제작과 추가 합성 재료 회귀를 확인한다. 최종 테스트는 배포 과정에서 한 번 실행한다.
- 인벤토리 CSS 및 app 로더의 `inventory` 캐시 키를 `20260926-emperor-energy`로 갱신한다. 기존 앱/서비스 워커 공통 버전은 유지한다.

초기 범위 검사에서 28/29 통과 후 업로드 전에 중단했다. 원본 PNG 가장자리 5픽셀에 알파 1/255 잔광이 있어 모든 가장자리를 정확히 0으로 요구한 자산 검사만 실패했다. 가시 경계는 (223,16)~(1032,1234)로 잘리지 않았고 실제 런타임 WebP 테두리는 모두 알파 0이다. 원본을 변형하지 않고 원본 검사의 허용치만 1/255로 명시했다. 게임 코드·이미지는 동일하므로 재시도에서는 해당 `tests/emperor-energy-20260926.test.mjs`와 Worker 검사만 실행하고 이미 통과한 인벤토리·미스틱·합성 검사는 재사용한다.

## 완료 결과

- 관련 검사 총 29개 통과: 기존 인벤토리·미스틱 제작·합성 재료 24개, 새 재료 등록/재시도/표시/자산 검사 5개.
- Worker 문법·번들 컴파일, 깨끗한 범위 커밋과 `origin/main` 일치, 출시·캐시 호환, Hyperdrive 캐시 OFF 확인 후 지정 배포 완료.
- 운영 코드 커밋 `5158f8e7`, Pages 배포 `https://6005b3bd.cnine-card.pages.dev`.
- 운영 도메인 `https://cnine-card.pages.dev`의 index/app/인벤토리 CSS/PNG/WebP 5개 파일을 HTTP 200 및 로컬 SHA-256 일치로 확인했다.
- 운영 PostgreSQL에서 `EMPEROR_ENERGY`가 `MATERIAL`/`EMPEROR`/활성 1 및 지정 이미지로 등록되고 완료 표식이 `1`임을 읽기 전용으로 확인했다. 조회 전에 이미 게임 등록 경로가 실행된 상태였으며 추가 수동 DB 쓰기는 필요하지 않았다.
- 확인 도구는 작업 트리 바깥에 보관하고 임시 원격 확인 세션은 종료했다. 이 결과 기록은 문서만 변경하므로 운영 재배포하지 않는다.

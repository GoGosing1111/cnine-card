# SX슈트 승인 리소스 운영 업로드

2026-10-07 사용자 요청: **운영서버에 업로드 커밋해**. 정지 원본, 오라·대시·검무 및 창천멸진 V3 궁극기의 승인된 자산과 재생 페이지를 운영 정적 서버에 공개한다. 기존 승인 파일을 재생성·재압축·재패킹하거나 타이밍을 변경하지 않는다.

## 운영 경로

- [리소스 색인](https://cnine-card.pages.dev/assets/ui/project-v/account-battle-suits/sx-v1/manifest.json)
- [오라·대시·검무 재생](https://cnine-card.pages.dev/preview/battle-suit-sx-v1/)
- [창천멸진 궁극기 재생](https://cnine-card.pages.dev/preview/battle-suit-sx-v1/ultimate-v3/)
- [궁극기 PC 영상](https://cnine-card.pages.dev/preview/battle-suit-sx-v1/ultimate-v3/review-desktop-v3.webm)

운영 색인은 공개 URL과 승인 시 SHA-256을 제공한다. 리소스는 이미 검수한 경로를 그대로 사용하므로 폴더 이동으로 인한 상대 경로 오류나 이미지 중복 생성을 피한다. 영상·문서와 실제 재생 자산을 색인에서 구분한다. 전투 피해·능력치·소유권을 처리하는 게임 런타임은 이번 업로드로 활성화하지 않는다.

승인된 텍스트 파일의 LF 줄바꿈은 SX 폴더의 `.gitattributes`로 고정했다. Windows의 새 배포 체크아웃에서 CRLF로 자동 변환되던 7개 기록/구현 파일도 승인 당시 바이트와 같게 배포한다. 실행 내용이나 승인 해시를 바꿔 맞추지 않는다.

기준 승인은 `preview/battle-suit-sx-v1/approval-aura-dash-skill-20261007.json`과 `preview/battle-suit-sx-v1/ultimate-v3/approval-20261007.json`이다. 과거 매니페스트·프리뷰 문구의 승인 대기 표현은 작성 당시 기록이며 이 두 승인 기록이 우선한다. 기본 공격·미사용 자세·칭호 단독의 별도 승인이나 CMS 신규 장비·제작식·전투력·계정 지급은 이 업로드에 포함하지 않는다.

## 배포 범위와 검사

Cloudflare 운영 배포 목록에서 확인한 직전 배포는 **5d96aaac-9a80-4ff7-a997-d2b1e98c4fad**, 소스 커밋 **f09a22f4f7e93b8e5f48a9f908d0f371d8bd9bf0**이다. 이 커밋부터 후보까지 게임 JS·CSS·전투 공용 엔진·서버·의존성 변경은 없다. SX 프리뷰·문서와 이미 수행된 아이젠 지급 작업의 기록·수동 운영 도구·테스트가 추가돼 있다. 수동 작업 도구를 배포 과정에서 실행하지 않는다.

전체 차이에 `scripts/ops/`와 `tests/`가 포함되어 엄격한 자산 전용 경로의 허용 범위를 넘으므로 **`npm run deploy:production -- --scoped`**를 사용한다. 출시 플래그·캐시·Hyperdrive·깨끗한 커밋 검사를 유지하고 관련 검사만 선택한다.

```powershell
$env:SCOPED_DEPLOY_BASE = 'f09a22f4f7e93b8e5f48a9f908d0f371d8bd9bf0'
$env:SCOPED_DEPLOY_REASON = '승인된 SX 자산과 재생 페이지 운영 업로드; 게임 실행 코드 변경 없이 승인 해시·검신·광역 타이밍 관련 회귀만 검사'
$env:SCOPED_DEPLOY_TESTS = '["preview/battle-suit-sx-v1/ultimate-v3/qa.test.mjs"]'
$env:SCOPED_DEPLOY_CHECKS = '[]'
npm run deploy:production -- --scoped
```

원본 작업 폴더의 중간 캡처와 ignored 파일이 업로드되지 않도록 별도 깨끗한 배포 체크아웃을 사용한다. 이미 통과한 PC·모바일 전체 재생 검사와 영상 디코딩은 재사용한다. 배포 후에는 운영 URL의 응답·파일 해시와 실제 재생/중단만 짧게 확인한다. 완료 결과는 이 문서 아래에 기록하며 기록만 추가한 뒤 운영을 다시 배포하지 않는다.

## 1차 업로드와 운영 경로 보정

커밋 `06cab440`을 scoped 배포했다. 관련 검사 3/3, 출시·캐시·Hyperdrive 검사를 통과했다. Pages 배포는 `3e0f9a15-9b4d-451b-9bbd-71c787237970`, API runtime `0ac4cd97-0b15-4566-a185-b1767ff74ba1`, clan-draft `80f734c2-6ca5-4ce8-8040-058f9e6da015`다. 새 파일 500개 업로드가 완료됐으며 기존 파일 13,844개는 재사용했다.

운영 확인에서 리소스 색인 전체와 대표 파일 해시는 통과했지만 기본 연출 페이지의 Pixi 배경 두 경로가 `/preview/assets/`로 해석돼 404가 발생했다. `battle.html`에 명시적 base URL을 추가하고 부모 iframe의 버전 쿼리를 갱신했다. 승인된 이미지·모션·렌더러·번들은 변경하지 않았다. 운영 URL에 수정 HTML만 연결한 PC 1440px·모바일 390px 검사에서 해당 요청을 포함해 리소스 오류 0건을 확인했다.

보정은 위 1차 운영 커밋을 `ASSET_DEPLOY_BASE`로 지정한 `npm run deploy:production -- --assets-only`로 반영한다. 차이는 프리뷰 HTML 2개와 이 문서뿐이므로 이미 완료한 전체 자산 검사와 게임 테스트·변경 없는 Worker 배포를 반복하지 않는다. 최종 운영 재생 결과는 아래 완료 기록을 따른다.

## 운영 확인 완료

**2026-10-07 17:46 KST**, 최종 커밋 `863088450012de28ff7280ae2ba8c9d1bbb8739c`의 운영 배포 **f1f08b53-1a1b-42a4-86f9-f8887086cc53**를 확인했다. 경로 보정 배포는 새 파일 3개만 올리고 기존 14,341개를 재사용했으며 API/clan-draft Worker는 재배포하지 않았다.

- 운영 기본 도메인에서 색인의 **73개 파일 모두 HTTP 200**, 대표 이미지·효과·번들·승인 기록 **11개 SHA-256 일치**.
- PC 기본 프리뷰의 검무 실제 재생·중단, 모바일 궁극기 실제 재생·적 5개 반응·중단 확인. 콘솔 오류·리소스 오류·가로 넘침 0, 중단 후 효과·잔상·등록 타임라인 0.
- [운영 확인 원시 기록](sx-approved-resource-upload-20261007-production.json), [PC 화면](../preview/battle-suit-sx-v1/qa/production-20261007/desktop-base.png), [모바일 궁극기 화면](../preview/battle-suit-sx-v1/qa/production-20261007/mobile-ultimate.png).

운영 업로드는 완료됐다. 승인된 색감·모션·타이밍은 그대로이며 게임 내 SX슈트 장비·피해·제작·지급 설정은 변경하지 않았다. 이 완료 기록은 문서·증거 커밋만 원격 반영하고 재배포하지 않는다.

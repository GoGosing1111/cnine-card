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

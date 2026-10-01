# 발테르 SSS 리미티드 — 승인 원화·전체 전투 프리뷰 배포 후보

2026-10-01 사용자 이름 확정: **발테르**. 후속 프리뷰 등록 지시에 따라 **SSS · 리미티드**를 확정했다. [리미티드 컬렉션](../../mercenary-limited-frame-slim-v3-20261001/?v=valter-20261002#valter)에 사용자가 2026-10-02 지정한 슬림 V3 광원 프레임으로 함께 표시한다. V8 일러스트와 V17 전투 외형·모션·크기·주변 아우라·내려찍기 속도는 승인본이다. 이 후보는 원화와 독립 전투 프리뷰를 함께 게시할 수 있도록 준비한다. 운영 업로드는 사용자의 **운영배포 지시 후** 실행한다.

- 원화: `/assets/ui/project-v/mercenaries/approved-20260930/crimson-silver-knight-source-art-approved-v8.png`
- 전체 프리뷰: `/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1&v=17-valter-sss-limited#battle`
- 이름·원화·SD 승인 기준: `/assets/ui/project-v/mercenaries/mercenary-valter-approval-20261001.json`
- 원화 1024×1536 RGB PNG와 투명 SD·원본 대검·V13 활성 아틀라스는 무가공 보존한다. 준비·시전·타격·복귀는 승인 V17이며 전체 재생 1.2, 내려찍기 3.6이다.

## 최종 검토

이름은 프리뷰 표제·플레이어·캐릭터·로딩 이름에 반영했다. 소개란의 대검 강격 이미지를 실제 활성 V13 아틀라스 프레임으로 맞추고, 메인 이미지는 승인 원화 자체를 표시한다. 원화와 SD를 혼용하지 않는다. `review-report.json`과 `qa/`는 최신 운영 파일을 사용하는 별도 후보의 PC·모바일 검토 결과다. `files.json`은 이 후보의 파일 목록·크기·SHA-256과 공용 의존성을 고정한다. 과거 반려본·생성 원본·미사용 모션은 제작 브랜치에 보존하며 공개 후보에 넣지 않는다.

검토 완료: PC 1440×1000·모바일 390×844에서 10종 동작, 전체 7종 연속 시연(각 약 23초), 효과음 타격 동기화, 일시정지·중단·승인 대기 복귀를 확인했다. 자산·콘솔 오류와 화면 넘침은 0건이다. 승인 원화와 SD, 원본 대검·활성 스프라이트 해시는 일치한다. 최신 운영 로더가 구버전 프리뷰 엔진을 교체하던 연결 문제를 현재 공용 엔진 기반 빌드로 해결했고 운영 공용 코드 자체는 수정하지 않았다.

## 배포 순서

1. 사용자의 운영배포 지시를 확인한다. 그 전에 운영 업로드·main 병합·런타임 활성화를 하지 않는다.
2. `codex/valter-release-ready`의 준비 커밋을 당시 최신 `origin/main`에 반영한다. 기존 변경과 충돌하면 충돌 부분만 해결·재검토한다. 준비 기준 SHA는 `readiness.json`에 기록한다.
3. `node preview/mercenary-crimson-silver-knight-battle-v1/release/verify.mjs`로 승인 자산과 후보 파일 일치를 확인한다. 이미 확인한 게임 전체 검사를 반복하지 않는다.
4. 깨끗한 배포 디렉터리와 `HEAD=origin/main`을 확보하고, **실제 마지막 운영 배포의 SHA**를 `ASSET_DEPLOY_BASE`로 넣는다. 준비 기준/부모 커밋으로 대신하지 않는다. 아래 명령은 이 후보처럼 `assets/`·`preview/`에만 변경이 있을 때의 경로다.

```powershell
$env:ASSET_DEPLOY_BASE = '<배포 직전에 확인한 마지막 운영 배포 SHA>'
npm run deploy:production -- --assets-only
```

5. 기존 배포 스크립트의 캐시·Hyperdrive 검사를 그대로 통과시킨다. 업로드 후 원화 해시, 프리뷰 이름·첫 대기·대표 스킬·자산 응답을 한 번 확인한다. 실패 시 같은 배포 절차로 이전 승인 커밋을 복구한다. 직접 `wrangler pages deploy`를 실행하거나 dirty 배포 예외를 켜지 않는다.

원화·프리뷰 게시 준비와 실전 플레이어블 용병 등록은 별개다. 프리뷰 코드 `V-996`은 운영 코드로 쓰지 않는다. SSS 등급과 리미티드 에디션은 사용자 지정이다. 능력치·스킬 소유/획득·전투 API 연결은 이 후보에서 임의 지정하지 않는다. 기존 공동 출시/콘텐츠 게이트를 유지한다.

## 배포 자산 조건

개별 파일은 [Cloudflare Pages 공식 자산 한도](https://developers.cloudflare.com/pages/platform/limits/#file-size)의 25 MiB 이하여야 한다(2026-10-01 확인). 실제 후보 파일 크기·누락·해시는 준비 검사로 확인한다. 사용 라이브러리는 기존 PixiJS 8.20.0 / GSAP 3.13.0이며 실제 렌더링·단일 시각은 `source/KnightFX.js`, `skill.mjs`, 기존 V3 엔진을 사용한다.

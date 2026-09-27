# ICON 통합 프리뷰 — 2026-09-27

사용자 요청: 아이콘등급의 원화/SD/스킬을 한 번에 볼 수 있는 프리뷰.

기존 `preview/icon-battle-assets-v1/`를 7종 통합 검수판으로 정리한다. 공통 사진 카드 렌더러와 승인 프레임, 기존 SD 및 16프레임 효과를 재사용하고 인물 선택 시 원화·SD·스킬을 동기화한다. 카드 설정 시안의 오래된 4종 링크 문구를 7종 통합 프리뷰로 바로잡았다. CMS가 여는 주소는 그대로다.

추가 DB/API 조회·경제/카드 등록·공용 전투 엔진·원본 이미지/SD/FX·의존성 변경 없음. 기존 CMS 한정 공개와 진화·획득 미정, 게임 전투 OFF 정책을 유지한다. 모바일은 원화/SD 2열 다음에 전투를 배치한다.

## 검수 및 범위 선택

- PC 1440×1080: 7종 모두 원화/SD/이름/스킬 일치, 충돌 프레임 4, 중단 후 activeSprites=0 및 registered=false. regularCards=5, canvas=1, private atlas=1.
- 모바일 390×844: 원화·SD 가독성/잘림, 가로 넘침 없음, 깨진 이미지 없음. 0.5배속 재생, 10번 프레임 탐색 및 중단 확인.
- 초기 전장 로딩 중 캐릭터 클릭에서 actors 준비 전 접근 오류를 발견해 준비 완료 후 최신 선택만 구성하도록 보호했다. 수정한 실제 번들에서 새로고침 직후 선택과 정상 시연 확인, 신규 콘솔 오류 없음.
- 공용 V3 로더나 게임 엔진은 수정하지 않는다. 기존 효과 재생·정리·출시 잠금 회귀 `preview/icon-battle-assets-v1/qa.test.mjs` 및 Pages 확장자 없는 프리뷰 경로 회귀 `tests/icon-preview-pages-url.test.mjs`만 지정 배포에서 한 번 실행한다.
- 관련 UI/리소스 프리뷰 범위로 한정되므로 `npm run deploy:production -- --scoped`를 사용한다. Cloudflare 배포 목록으로 확인한 직전 실제 운영 소스는 `d18ef29da1d218b85a34d7309cf97aeed8a00de6`, Pages `5f2364b5`다. 최신 main의 별도 메시지/공방 수정과 문서·운영 도구 커밋을 보존해 그 위에 프리뷰 변경만 얹는다. 배포 결과는 하단에 추가한다.

검수 증빙은 `C:/Users/User/.codex/worktrees/icon-card-registration-20260927/qa/icon-showcase-selection.json`, `icon-showcase-desktop.png`, `icon-showcase-mobile.png`에 보관한다.

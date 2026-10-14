# 시즌 성장 로드맵 포스터 — 2026-10-14

## 요청과 결과
사용자가 지정한 이번 시즌 키워드 **성장**, 플레이를 통한 손실 없는 성장, 단계별 클리어, SSS 조각 제작, 군단토벌 용병 장비, 노력에 따른 칭호·트로피 획득을 한 장에 담았다. 다음 시즌의 **카드·용병 전술과 조합**은 하단 별도 영역으로 구분했다. 시즌 번호·출시일·경제 수치는 추가하지 않았다.

- 공유 PNG: `assets/posters/soopketmon-season-growth-roadmap-20261014-v1.png` (2160 × 3240, 2:3)
- 편집용 원본: `preview/season-growth-roadmap-20261014-v1/index.html`
- 생성 원화·최종 파일 SHA-256·글꼴 라이선스: 같은 디렉터리의 `manifest.json`
- 최종 이미지 생성 프롬프트: `prompt.json`
- 생성 방식: built-in image_gen 1회, 글자 없는 원화. 생성된 PNG의 원본 바이트를 보존했다.
- 조판: Noto Sans KR / Black Han Sans / IBM Plex Mono, 저장소에 보존된 SIL OFL 1.1 글꼴. 한글은 브라우저의 실제 글꼴 계층으로 렌더링했다.
- 상태: 사용자 시각 검토용 완성본. 사용자 채택·승인을 임의로 기록하지 않는다.

## 검수
`node preview/season-growth-roadmap-20261014-v1/render.mjs`로 출력했다. 1080 × 1620 / DPR 2 데스크톱 출력 및 390 × 585 모바일 프리뷰를 확인했다. 문구 대조, 폰트 로딩, 이미지 로딩, 브라우저 오류 및 프레임 밖 텍스트 확인을 통과했다. `qa/render-check.json`에 결과를 보존했다.

전체 포스터와 모바일 축소본을 직접 확인했다. `qa/brand-font-check.png`에서 브랜드 **숲켓몬**의 ㅅ·ㅜ·ㅍ과 받침을 확대 확인했다. 제목·설명·단계·다음 시즌 구분에 잘림이나 원화와의 충돌이 없었다.

## 배포 범위
포스터 자산과 편집용 프리뷰, 검수 기록만 추가한다. 게임 실행 코드·서버 거래·경제·확률·기능 플래그·인게임 공지 등록은 변경하지 않는다. 자산 전용 배포 규칙에 따라 무관한 게임 검사를 실행하지 않는다.

직전 운영 기준: `cdd6c14316c33f6e1284e697d938983984b3cf04`, Pages `25a86e42-1f66-40fb-9a28-2891ce940cd5`. 기준 이후 기존 변경은 배포 기록 문서뿐이며, 현재 변경은 모두 `assets/`, `preview/`, `docs/` 범위다.

배포 명령: `ASSET_DEPLOY_BASE=cdd6c14316c33f6e1284e697d938983984b3cf04 npm run deploy:production -- --assets-only` (PowerShell에서는 해당 환경 변수를 설정). 깨끗한 범위 커밋·origin/main 일치·Hyperdrive 캐시 조건을 유지한다.

## 운영 반영 결과
소스 `287b1d746163b31b9593be16b2b2b9290b1faa5a`를 Pages `84b4e65e`로 자산 전용 배포했다. Hyperdrive 캐시 OFF 확인을 통과했다. API 런타임과 클랜 워커는 재배포하지 않았다. 운영 PNG 200 응답·2160 × 3240 크기·로컬과 SHA-256 일치, 프리뷰 200 응답 및 브랜드·다음 시즌 문구를 확인했다. 근거는 `docs/season-growth-roadmap-poster-20261014-live.json`에 보존한다.

- PNG: https://cnine-card.pages.dev/assets/posters/soopketmon-season-growth-roadmap-20261014-v1.png
- 편집용 프리뷰: https://cnine-card.pages.dev/preview/season-growth-roadmap-20261014-v1/

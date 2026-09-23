# 롯데 아윤 등록·클랜 편입·시즌 지급 — 2026-09-24

- 요청: 첨부 원화를 **롯데 아윤**으로 등록하고 투명 장비창 전신을 제작한다. 김아윤을 롯데로 편입하고 롯데 전원에게 남은 시즌 동안 T1 조은과 같은 옵션으로 지급한다.
- 운영 확인: 김아윤은 ID 5209, ACTIVE, PLAYDK 인증 완료, 랭크전 5장 덱 보유, 현 시즌 무소속이다. 롯데는 ID 6, 현 시즌 19/20명이며 편입 후 20명이다.
- 시즌 ID 5 / 번호 2 / ACTIVE. 만료 기준은 `clan_seasons.ends_at=2026-09-27T13:00:00.000Z` (**9월 27일 22:00 KST**)다. 지급일에서 임의의 일수를 더하지 않는다.
- 운영 T1 조은 `T1_JOEUN` v3의 옵션은 `COIN_GAIN_PERCENT:75`, `RAID_EXTRA_ENTRY:10`이다. A-26 `LOTTE_AYOON`은 같은 두 옵션, EVENT, 공개·활성 ON, 판매 OFF로 등록한다.
- 지급은 김아윤 편입 후 현재 롯데 전원 20명에게 직접 기간제 소유권을 부여한다. 재화·자동 장착·다른 아바타 설정은 변경하지 않는다.
- 원본·생성·파생 리소스와 해시는 `preview/avatar-lotte-ayoon-v1/manifest.json`, 생성 도구/프롬프트는 같은 폴더 `prompts.md`에 기록했다. 내장 image_gen, 실제 생성 알파 보존.
- PC 1440×1000 / 모바일 390×844에서 실제 공용 장비창 컴포넌트의 전신, 구두, 알파 경계와 로딩을 확인했다. 가로 넘침과 콘솔 오류가 없다.

## 검증·배포 범위

작은 수정이다. 새 자산·카탈로그와 일회성 운영 지급만 추가하며 게임 런타임·DB 스키마·전투 기반은 바꾸지 않는다. 운영 지급 스크립트가 포함되어 `npm run deploy:production -- --scoped`를 사용한다.

직전 운영 배포는 배포 직전에도 Cloudflare Pages `5969be11-5a8a-4dda-b61c-b41b1c2bccd8`, 소스 `633b3aed5188cce7fda61a57f8385b814cf77227`임을 확인했다. 이를 `SCOPED_DEPLOY_BASE`로 사용했다.

선정 검사:

- `tests/avatar-lotte-ayoon-season-20260924.test.mjs`: 현 시즌 종료 시각, 정확한 명단, T1 옵션 복사, 장착·만료, 반복 지급 방지, 옵션/명단/종료 변경 거부, 소유권 또는 감사 로그 실패 시 전체 롤백.
- `tests/clan-member-assignment-v2049.test.mjs`: 기존 OWNER 편입 기능의 정원·덱·검증·원자성·재시도 계약. 운영 클랜 편입에 그대로 사용하는 경로다.
- 배포 도구의 깨끗한 범위 커밋·origin/main·출시 플래그·캐시·Hyperdrive 검사를 유지한다. 같은 검사 별도 사전 반복은 하지 않는다.

## 운영 결과

- 구현 커밋 `87cdaeb5`, `origin/main` 반영 후 `npm run deploy:production -- --scoped` 완료.
- 선정 검사 **23/23 통과**. 운영 출시 플래그·깨끗한 소스·캐시 호환 검사와 Hyperdrive 쿼리 캐시 OFF / Pages·clan-draft 바인딩 일치 검사 통과.
- Pages 배포: `https://7e28f75f.cnine-card.pages.dev`. 지정 배포 스크립트의 clan-draft 버전: `c65b40ce-1777-4a1b-9b5b-7af3404f7119`.
- 운영 기본 도메인의 신규 WebP 3종이 모두 HTTP 200이며 로컬 매니페스트와 SHA-256이 일치했다. 운영 프리뷰에서도 A-26 롯데 아윤과 두 리소스 연결을 확인했다.
- **2026-09-24 03:10:19 KST** 김아윤(ID 5209) 롯데 편입 완료. 기존 OWNER 편입 경로가 PLAYDK 인증·덱·정원·현재 시즌·진행 전투를 검증했으며, 클랜 멤버와 드래프트 소속·감사 로그·복구 기록을 원자적으로 저장했다. 기존 19명 유지, 최종 20/20명.
- 편입 복구 키: `clan_member_assignment_v2049:28a49794-6ef4-42e4-8e23-e8aeaea64e06`.
- **2026-09-24 03:10:20 KST** 롯데 20명에게 `LOTTE_AYOON` 지급 완료. 만료는 모두 `2026-09-27 13:00:00 UTC` = **9월 27일 22:00 KST**.
- 지급 영수증: `ops:avatar-lotte-ayoon-clan-season-grant:20260924:v1`, 상태 COMPLETED. 감사 로그 `OPS_AVATAR_CLAN_SEASON_GRANT`, ID **35418**.
- 별도 운영 연결에서 편입·드래프트 소속, 정확한 20명 명단/소유권, 만료·획득 시각·source_ref, T1 조은과 동일한 옵션 2개, 활성·공개·판매 상태 및 감사 로그 1건을 대조했다.
- 계정 자동 장착과 재화 변경은 없다. 운영 실행·확인 기록은 `C:/Users/User/.codex/tmp/lotte-ayoon-ops-20260924/`에 보존했다. 실행용 임시 원격 세션은 각 작업 후 종료했다.

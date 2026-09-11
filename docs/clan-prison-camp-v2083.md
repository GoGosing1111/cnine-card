# 행정부 포로수용소 V2083

2026-09-12 사용자 요청: 클랜 시즌 종료 시 최하위 클랜 전원을 수용하고 채팅을 허용한다. 기본 형기는 **8시간**, 운영자는 조기 석방할 수 있다. 승인된 수용동 사진을 유지하면서 삭막하고 공포스러운 화면으로 전면 재설계한다.

## 적용 범위

- 행정부 메뉴의 `포로수용소` / 클라이언트 경로 `prisoncamp`.
- 정규 시즌의 기존 공식 순위(`CLAN_RANKED_TEAMS_SQL`)에서 마지막 클랜이 대상이다. 승점·승수·전투 통계·기존 동률 순서를 그대로 사용한다.
- 클랜 운영 모드 `ON`, 두 팀 이상, 완료된 정규전이 있는 시즌의 `SETTLEMENT` 처리에만 적용한다. TEST/OFF, 취소만 된 시즌, 이미 정산 완료한 과거 시즌에는 새 형기를 만들지 않는다. 챔피언스 토너먼트 결과로 다시 수감하지 않는다.
- 정산 시점의 클랜장과 모든 클랜원을 저장한다. 접속 여부, 활동량, OWNER 여부에 따른 수감 면제는 없다. 이후 클랜 이동·탈퇴로 수감을 피하지 못한다.
- 실제 정산 처리 시각부터 8시간이다. 로그인·공통 상태 조회에서도 만료된 정규 시즌을 확인하므로 클랜 화면을 열어야만 정산되는 문제를 방지한다. 기존 요청 기반 시즌 진행을 사용하며 별도 예약 작업을 생성하지 않는다.
- 형기 종료를 서버 시각으로 판정한다. 클라이언트 타이머 변경으로 잠금이 풀리지 않으며, 화면은 5초 간격 상태 조회에서 석방을 반영한다.
- 기존 제재 감옥이 동시에 적용되면 제재 감옥을 우선한다. 제재 감옥 석방 명령이 남은 수용소 형기까지 해제하지 않는다.

## 서버와 데이터

`functions/_clan_prison_camp.js`의 스키마는 SQLite/D1 및 운영 PostgreSQL 호환 계층을 지원한다.

| 테이블 | 내용 |
| --- | --- |
| `clan_prison_camps` | 시즌별 한 건의 수감 사유, 순위, 정산·만료 시각, 생성 토큰 |
| `clan_prison_captives` | 시즌·유저별 수감 당시 역할, 운영자 석방 시각·주체·사유 |
| `clan_prison_chat` | 공개 채팅과 전송 당시 포로/방문객 구분 |
| `clan_prison_chat_cooldowns` | 유저별 원자적 전송 간격 제어 |

수감 명부와 시즌 정산 완료 기록은 같은 DB 트랜잭션으로 저장한다. 시즌 기본키와 생성 토큰으로 중복 정산이 명부·형기를 다시 쓰거나 이미 석방한 사용자를 재수감하지 못하게 한다. 정산 중 실패하면 수감 기록도 롤백한다.

모든 수용소 API는 인증이 필요하고 응답을 캐시하지 않는다.

| API | 동작 |
| --- | --- |
| `GET /api/prison-camp/status` | 본인 수감 상태, 활성 수감자 전체, 최근 메시지 80건 |
| `POST /api/prison-camp/chat` | 포로·방문객의 공개 메시지 전송 |
| `POST /api/prison-camp/release` | `{seasonId, userId?}` 개별/시즌 전체 조기 석방 |

석방 권한은 프로젝트의 기존 운영자 권한 기준인 `OWNER`다. 제한된 ADMIN 및 일반 사용자는 서버에서 거절한다. 석방 화면은 대상·시즌·인원수를 보여주는 확인창을 사용하며, 재요청은 추가 변경 없이 처리된다.

채팅은 Unicode 기준 1~200자, 유저별 2초 간격이다. 역할 표시는 서버에서 정하고 닉네임·메시지를 HTML 이스케이프한다. 전송과 속도 제한 갱신은 같은 트랜잭션이다. 최대 200건을 보존하며, 빈 수용동에는 채널이 닫히고 새 수감 회차 시작 전에 이전 빈 채널 기록을 정리한다.

기존 공통 플레이어 API 잠금에 수용소 상태를 포함한다. 제재 감옥의 채팅·때리기·영치금 예외 경로로 빠져나가는 요청도 수용소 포로에게는 423으로 거절한다.

## 화면 및 원본 자산

`js/clan-prison-camp-v2083.js`, `css/clan-prison-camp-v2083.css`를 실제 앱·V21 메뉴·잠금 화면에 연결한다. 배경을 주 화면으로 사용하고 큰 한글 제목, 동색 봉쇄 표시, 수감자 명부, 올리브색 면회 통신을 한 화면으로 구성한다. 기존 V21 외곽 메뉴는 재사용하며 수용소 안의 중복 화면 제목·여백만 경로에 한정해 정리한다.

- 승인 사진: `assets/ui/prison/clan-camp-block-v2083.png` — 1536×1024, 2,382,391 bytes. 생성 원본을 재압축·수정하지 않았다.
- SHA-256: `4FE601BE62E34D77C0C6E57EE32C14034B64A7BD9193A008E6E6AB7EEDD7F676`.
- 제목: Black Han Sans Regular. 숫자·식별 표기: IBM Plex Mono Medium. 정적 파일을 자체 제공하며 각 OFL 라이선스도 `assets/fonts/clan-camp/`에 보관한다.
- [Black Han Sans 공식 배포](https://github.com/google/fonts/tree/main/ofl/blackhansans), [IBM Plex Mono 공식 배포](https://github.com/google/fonts/tree/main/ofl/ibmplexmono).
- 폰트 SHA-256: Black Han Sans `31960809284026681774A8E52DC19EBCAD26CF69B0AD9D560F288296FBB52739`, IBM Plex Mono `A9B4C49BB299E05B5F6C481E7FB5E78943D2793249A0C8874AB574A2D1EA6755`.

사진 생성 입력:

```text
Use case: stylized-concept
Asset type: cinematic environment background for a Korean browser game's prisoner-of-war camp interface; image asset only.
Primary request: Create ONE wide landscape raster image, 1536 x 1024 pixels, of an austere abandoned concrete detention block. It must feel desolate, frightening, oppressive and physically confining.
Scene/backdrop: A deep narrow corridor seen from outside locked cells, heavy iron cell bars looming very close on both the left and right edges, thick concrete pillars, distant locked barred door. Damp crumbling concrete, dark water stains, puddles reflecting sparse sickly cold fluorescent fixtures. Thin atmospheric fog builds depth down the corridor. One restrained deep red alarm glow far within the scene.
Style/medium: Premium cinematic horror game environment concept art, sophisticated realistic atmospheric environment painting, tactile textured materials and controlled painterly detail.
Composition/framing: Landscape, eye-level perspective, strong corridor depth and enclosing foreground bars. Keep the main corridor environment visible in the center-left for a minimal interface overlay; let the right third fall naturally into darker but still textured shadows for UI. Full-bleed artwork with no border.
Lighting/mood: Oppressive darkness with carefully readable tonal depth, sparse cold lights, very limited deep red accent, grounded puddle reflections and fog. Avoid washed-out highlights.
Constraints: Absolutely no people, characters, silhouettes of people, animals, blood, gore, bodies, text, numbers, lettering, logos, emblems, symbols, watermarks, card frames, interface elements or UI. No cartoon treatment. No generic gradient background.
```

## 검증 및 출시

- `npm run test:prison`: 기존 감옥 12건 + 신규 수용소 12건, **24/24 통과**. 실제 SQLite와 PostgreSQL 호환 계층의 PGlite에서 명부 전체, 클랜장/OWNER 포함, 재시도, 롤백, 형기 경계, 개별·전체 석방, 채팅 속도·길이·권한을 검증했다.
- `npm run test:navigation`: **6/6 통과**. 수용소의 행정부 분류·V21 경로도 신규 회귀 검사에 포함한다.
- 로컬 가상 계정 22명으로 데스크톱 1366×900, 모바일 390×844를 직접 검수했다. 독립 화면뿐 아니라 운영 CSS·V21 셸·제재 잠금 틀과 결합한 배치도 확인했다. 수감자·방문객 메시지, 운영자 개인·전원 석방, 확인 취소, 빈 채널, 명부 스크롤, 입력창 노출을 확인했다. 운영 계정이나 재화를 검수용으로 변경하지 않았다.
- 프로젝트 UI 품질 기준을 `AGENTS.md`에 추가했다. 기능 검사 통과를 사용자 시각 승인으로 간주하지 않는다.
- 앱·서비스워커·메뉴 캐시 버전은 `2083-clan-prison-camp`로 일치시킨다. 기존 회귀 검사의 고정 버전 기대값만 함께 갱신한다.
- 운영 반영은 깨끗한 동일 `origin/main` 후보에서 `npm run release:gate` 통과 후 `npm run deploy:production`으로만 진행한다. 이 기능을 위해 다른 준비 중인 콘텐츠나 기능 플래그를 변경하지 않는다.

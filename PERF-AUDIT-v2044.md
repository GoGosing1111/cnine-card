# cnine-card 성능 점검 보고 — 최근 신규 기능 (2026-09-03 ~ 09-06, base `5ec6e19~1` → HEAD `2156e02`)

점검 범위: 최근 3일간 87커밋(프라임 뽑기, 숲켓랜드, 스트리머 라운지, 챌린저, 감옥 커뮤니티, 클랜 참여 보상, 재정금고, 붕괴 코어 레이드, 일괄 진화, 전직 패스, 메시지 일괄 수령, 승부예측 MATCHDAY 등). 코드 근거만 적었고 추정 수치는 표기했다. 실사이트 실측(Playwright)은 이 세션 컨테이너에서 `cnine-card.pages.dev` 아웃바운드가 차단되어 못 했다 — 사장님 Chrome에서 실행하면 바로 측정 가능 (아래 "다음 단계").

---

## 1. 결론 요약

"로딩이 길어졌다"의 가장 큰 단일 원인은 **프라임 뽑기 연출 번들(PixiJS+GSAP 통째, 678KB)이 index.html에서 부팅 시 무조건 로드**되는 것이고, "렉이 늘었다"의 서버 쪽 원인은 **신규 모듈 6곳의 스키마 확인(ensure*)이 메모이즈되지 않아 요청마다 D1 왕복이 1~2회씩 추가**된 것이다. 이 프로젝트에서 D1 왕복 1회는 실측 104~395ms(`[[path]].js:9003` 주석)라, 왕복 +1은 곧 체감 0.1~0.4초다.

| 구분 | base | HEAD | 증가 |
|---|---|---|---|
| 부팅 시 로드하는 js/css 파일 수 | 82 | 90 | +8 |
| 부팅 페이로드 raw | 2.53 MB | 3.39 MB | **+907 KB (+34%)** |
| 부팅 페이로드 gzip | 660 KB | 923 KB | **+270 KB (+40%)** |
| 서버 import 그래프 (콜드스타트 파싱 대상) | 2.59 MB / 35파일 | 3.11 MB / 57파일 | **+512 KB (+20%)** |

부팅 증가분의 75%(678KB raw / 207KB gz)가 프라임 번들 하나다.

---

## 2. 클라이언트 (로딩·렉)

### C1. [최대] prime-draw 번들 eager 로드 — `index.html:127`
`js/prime-draw-live-v1985.bundle.js`(678KB, PixiJS+GSAP 내장)가 `<script defer>`로 부팅마다 로드된다. 번들은 `window.PrimeDrawLiveV1985={play,destroy}`만 노출하고 유일한 소비자는 `js/app.js:4043`(프라임 뽑기 "보상 확정" 클릭 후). 로비·전투·도감 어디에도 필요 없다.
비용: 매 부팅 207KB(gz) 다운로드 + 메인스레드 파싱/컴파일(중급 모바일 대략 150~400ms 추정). `defer`는 순서 실행이라 이 번들 실행이 끝나야 뒤의 `pve-command-v2-live`, `core-protocol-raid`, **`soopketmon-v21-exact-shell-adapter`(로비 셸, `v21-ui-ready` 붙이는 주체)**가 실행된다 → 로딩 화면이 그만큼 늘어난다.
수정: `js/app.js:877` `FEATURE_RESOURCE_MANIFEST`에 `primeDraw:{scripts:['js/prime-draw-live-v1985.bundle.js?v=...'],ready:()=>typeof window.PrimeDrawLiveV1985?.play==='function'}` 추가, `app.js:4043` 직전에 `await ensureFeatureResources('primeDraw')`, `index.html:127` 삭제. soopketland/treasury/prediction이 이미 쓰는 방식이라 새 코드 거의 없음.

### C2. [높음] PixiJS+GSAP 복사본이 번들 4개에 각각 내장
`package.json` esbuild 스크립트 4개 모두 `--external` 없이 `--bundle`.

| 번들 | 크기 | 소스 크기 | 로드 시점 |
|---|---|---|---|
| `js/prime-draw-live-v1985.bundle.js` | 678KB / 207KB gz | 23KB | 부팅(C1) |
| `js/soopketland-v2039.bundle.js` | 678KB / 208KB gz | 30KB | lazy (`app.js:920`) |
| `js/ranked-challenger-fx-v2032.bundle.js` | 641KB / 196KB gz | **6KB** | 챌린저 엠블럼 표시 시 (`app.js:2561`) |
| `preview/project-v-v3/project-v-pixi-battle.bundle.js` | 880KB / 264KB gz | — | 전투 진입 시 |

한 세션에서 프라임+숲켓랜드+챌린저 배지+전투를 보면 2.88MB raw / 875KB gz 를 받고, 그중 약 1.9MB / 580KB 가 같은 라이브러리 중복이다. 각각 별도 컴파일·별도 WebGL 컨텍스트라 모바일에서 컨텍스트 상한/`context lost` 위험도 커진다.
수정: `js/vendor-pixi-gsap.bundle.js` 하나(`window.PIXI`, `window.gsap` 노출)로 빼고 4개는 `--external:pixi.js --external:gsap` + 글로벌 shim으로 빌드. 매니페스트 `scripts` 앞에 vendor를 넣으면 `loadFeatureScript`가 1회만 받는다. 특히 챌린저 엠블럼은 6KB 로직 때문에 641KB를 받는 상태.

### C3. [높음] 서비스워커가 script/style을 매 부팅 network-first 재검증 + Cache Storage 재기록
`service-worker.js:114-118` `['script','style','worker']`→`networkFirst`, `:98-101` `fetch(...,{cache:'no-cache'})` 후 `response.ok`면 무조건 `cache.put`. `_headers`의 `/js/* /css/*`는 `max-age=0, must-revalidate`. `isVersioned()`는 정의돼 있지만 font에만 쓰인다.
비용: 부팅마다 조건부 요청 90개(304) + 약 3.4MB를 Cache Storage에 다시 씀(저사양 기기 디스크 I/O). 기존 구조지만 파일 수·바이트가 늘어 체감이 커진 항목.
수정: `?v=` 붙은 script/style은 `cacheFirst(request,SHELL_CACHE)`. 주석의 "누락 시 영구 고정" 우려는 SHELL_CACHE 이름이 배포마다 바뀌어 activate에서 구 캐시가 삭제되므로 이미 해소됨. 최소한 304면 `cache.put` 생략.

### C4. [중] 부팅 API 직렬 3단
`js/app.js:4374` `detectApi()`(`service/status`) → `:4391` `verifyStartupSession()`(`me/summary`) → `:4432` `syncUniqueAdvancementFeatureState()`(`unique-advancement/feature`, ttl 0) → 그제야 `renderShell`. 3 RTT + D1 지연 3회가 로딩 화면에 그대로 얹힌다.
수정: `me/summary`와 `unique-advancement/feature`를 `Promise.all`, 또는 feature 상태를 `me/summary` 응답에 포함.

### C5. [중] `core-protocol-raid-v1924.js` 전역 MutationObserver 상시 등록
`:646-648` `observe(document.documentElement,{subtree:true,childList:true})`. 같은 패턴의 전역 옵저버가 부팅 스크립트에 이미 20개 이상이라, innerHTML 교체·1초 카운트다운 textContent 갱신마다 콜백 N개가 돈다. 
수정: PVE 허브 진입점에서 `CoreProtocolRaidV1924.openActive()` 직접 호출, 옵저버 제거(또는 `#pveRaidHubView` 있을 때만 observe, `renderShell` 이탈 시 disconnect).

### C6. [중] 스트리머 라운지 60초 폴링 (신규, 로비 상시)
`js/streamer-lounge-v2036.js:122` 모듈 최상위 `setInterval(60000)` → `/api/streamer-profiles` `cache:'no-store'`. 서버(`_streamer_lounge.js:3-8`)는 인메모리 캐시 없이 요청당 D1 2회, 캐시 헤더 없음. 로비 분당 요청이 4→5회(live-operations 30s, chief/status 60s, runtime-command 45s에 추가). 접속자 수 × 1/min 만큼 D1에 그대로 간다.
수정: 서버 isolate 메모 30~60s + `Cache-Control: public, max-age=30`(live-operations `[[path]].js:5048` 방식), 클라이언트 `no-store` 제거, `document.hidden`/홈 이탈 시 clearInterval.

### C7. [중] 일괄 진화 UI — 원본 이미지 로드 + 클릭마다 그리드 통째 재생성
`js/evolution.js:15` `<img src="${card.image}">` — `responsive-card-images`(192/384px avif)를 안 쓰고 원본(평균 334KB, 최대 9.4MB, `app.js:966` 주석) 요청. `:71` `renderGrid()`가 선택 클릭마다 `grid.innerHTML=` 전체 재생성.
수정: `app.js:3429` `responsiveCardImageMarkup` 재사용, 선택 토글은 해당 버튼 클래스만 갱신.

### C8. [중·화면 한정] 승부예측 15초 폴링마다 리스트·보드 전체 innerHTML 재렌더
`js/coin-prediction-v2033.js:261,162`. 뷰 이탈 시 `stop()`은 호출되므로 누수는 아님. 응답 버전이 같으면 렌더 생략하면 됨.

### C9. [낮음] CSS
감옥: `prison-v1950.css:41` backdrop-filter blur 3중(v2031에서 `.prison-community` 추가) + 배경 9s infinite transform + 캐릭터 drop-shadow 애니메이션 — 매 프레임 재래스터. 수감자만 보는 화면이라 범위는 좁다. 진화: `evolution-v2035.css:108` 전체화면 `backdrop-filter:blur(8px)` 오버레이 + 진행바 infinite — 일괄 진화 처리 중 유지. 반투명 단색으로 대체 권장. 나머지 신규 CSS(라운지, 예측, 챌린저, 클랜)는 비용 낮고 reduced-motion 게이트 있음.

문제 없음 확인: 감옥 1초 카운트다운/5초 폴링·treasury 30초 폴링은 `renderShell`에서 정리됨. 로비 홈에 video/gif autoplay 없음. shell adapter의 `homeRouteGuard`는 개선.

---

## 3. 서버 (API / D1)

### S1. [최대] `ensureClanParticipationSchema` 메모가 절대 히트하지 않음 — `_clan_participation.js:11,65,73`
`const schemaReady=new WeakSet()` 에 `env.DB`를 키로 넣는데, `env.DB`는 `instrumentD1()`이 **요청마다 `new Proxy(db)`로 새로 만든다**(`[[path]].js:8976, 9028-9029`). 그래서 모든 `clan/*` 요청이 매번 `SELECT value FROM app_meta`를 한 번 더 한다(+1 왕복). 
수정: 다른 ensure와 같이 모듈 스코프 promise/boolean.

### S2. [높음] `inventory` GET에 미메모 ensure 2개(읽기 1 + **쓰기 1**) — `[[path]].js:5233-5234`
`ensureBattleSuitCoreCatalog`(`_battle_suit_materials.js:13`, 매번 app_meta 읽기) → `ensureUniqueAdvancementPassCatalog`(`_unique_advancement.js:24`, 매번 `INSERT ... ON CONFLICT DO NOTHING` **쓰기**) → 기존 `UPDATE inventory_items`(:5235) → SELECT. 인벤토리 열 때마다 순차 7왕복, 그중 쓰기 2회라 읽기 복제(v1790)도 무효화된다(쓰기 뒤 읽기는 primary 북마크 대기).
수정: 둘 다 모듈 promise 메모(완료 마커 확인 후 고정). 기존 `UPDATE inventory_items`도 마찬가지로 1회 마이그레이션으로 옮길 것.

### S3. [높음] 메시지 "보상 일괄 수령" = 클라이언트 순차 루프 × 풀 프로필 — `js/app.js:4060-4067`, `[[path]].js:7132-7155`
서버 라우트 없이 클라이언트가 `messages/claim`을 N번 순차 호출. 매 호출이 DO 유저락 + 점검/세션 배치 + 감옥 조회 + 보상 + claim 배치 + **전체 `profile()` 12쿼리**. 메시지 20건이면 약 300쿼리·락 20회가 순차로 돈다.
수정: `messages/claim-all` 서버 라우트 1개(락 1회, 단일 배치, 마지막에 프로필 1회) 또는 최소한 claim 응답을 v1791의 `BATTLE_PARTIAL` 경량 프로필로.

### S4. [중] `coin-prediction/state` 병렬 1단계 → 순차 3단계 + 전체 스캔 — `_coin_prediction.js:69-84`
count/카테고리 집계가 `coin_prediction_events` 전체에 `datetime()` 함수 조건 + `LEFT JOIN app_meta ON key='prefix'||CAST(id AS TEXT)`(`_coin_prediction_categories.js:6`) — 행마다 문자열 결합 후 PK 조회, 인덱스 무용. 예측 화면 유저 15~60초 폴링마다. 그리고 `bet`에 이벤트 락(DELETE→INSERT 순차 + unlock)이 붙어 베팅당 +3 순차 왕복(`:49,93,113`).
수정: count를 이벤트 조회와 다시 병렬로, 카테고리를 이벤트 테이블 컬럼으로 이동(app_meta는 점검 플래그·세션·락이 몰리는 핫 테이블), 락은 `INSERT ... ON CONFLICT DO UPDATE WHERE expired` 1문.

### S5. [중] `prison/status` 5초 폴링에 +2단계 — `_prison_community.js:77-111`, `[[path]].js:4777`
`prisonCommunityRoomState`가 `ensureActiveCases`(매번 케이스 누락 SELECT) + 5문 배치를 별도 단계로 추가. 
수정: 케이스 개설은 수감 명령 시점(관리자 경로)으로 이동, 5문 배치를 `prisonRoomState`의 기존 배치(:4766)에 합쳐 1왕복.

### S6. [중] `territory-war/*` 전 요청에 `ensureGamstDeckRepairV2005` +1 — `_territory_war.js:1271`, `_gamst_deck_repair_v2005.js:65`
완료 마커가 있어도 매번 app_meta를 읽음. `state-lite` 12초 폴링마다. 모듈 메모로.

### S7. [중] 랭크 챌린저 top10 캐시 없음 — `[[path]].js:756-764, 6819`
`pvp/config`마다 `pvp_profiles×users` 전체 정렬 LIMIT 10. 인덱스는 `season_score`만 커버해 tie 정렬 시 sort 발생. `cachedRuntimeSetting` 10초 캐시 + `(season_score DESC,wins DESC)` 인덱스.

### S8. [중] 재정금고 state 전체 스캔 — `_administration_treasury.js:121-130`
`tax_receipts WHERE status='COMPLETED' GROUP BY source_type`(인덱스 없음, 코인 구매 1건당 1행 무한 누적), `ledger ORDER BY datetime(created_at)`(함수 적용으로 인덱스 불가). 구매 배치에 4문 추가된 것 자체는 같은 배치라 왕복 증가 없음(잘 함). 단 모든 코인 구매가 `treasury WHERE id=1` 한 행을 UPDATE 하므로 구매가 그 행에서 직렬화됨.
수정: 소스별 누적을 계정 행 컬럼으로(구매 배치 UPDATE에 합산), `ledger(created_at)` 인덱스 + `datetime()` 제거.

### S9. [중·대상 한정] 붕괴 코어 `raid/core/status` 5초 폴링 순차 9~12왕복 + 매 폴링 전역 DELETE — `_raid_core_protocol.js:951-1027, 1178-1236`
ensure 미메모, `readSettings` 캐시 없음, `releaseTerminalMemberships` 전역 DELETE 쓰기를 매 폴링. MEMBER_TABLE에 `user_id` 선두 인덱스 없음(`:1074`). 현재 TEST 모드라 테스트 계정만 영향이지만 오픈하면 그대로 터진다. 숲켓랜드 `soopketland/state`(`_soopket_land.js:85-142`)도 순차 7~11왕복, 스트리머/OWNER 한정.

### S10. [콜드스타트] `/health` 전용 일회성 스크립트 157KB가 전 요청 스크립트에 포함
`_targeted_*` 7종, `_gamst_card_retirement`, `_gamst_deck_repair_v2005`, `_iyejun_fur_reroll_recovery_v2023` — `/health`(`[[path]].js:4826-4894`)에서만 순차 호출. import 그래프 +512KB(+20%) 중 157KB. 콜드 isolate 첫 요청의 순차 ensure 체인도 늘었다(아바타 foundation 7단계 +2, 클랜 8단계 +4). 배포 직후·스케일아웃 시 "무한 로딩" 체감의 한 축.
수정: 완료된 일회성 스크립트는 import 제거(마커만 남김), `/health`가 외부 모니터에 노출돼 있으면 요청당 ~15 순차 왕복이므로 분리.

### 핫 라우트 왕복 정리 (warm isolate, 전처리 포함)

| 라우트 | 빈도 | 순차 단계 / 쿼리 | base 대비 |
|---|---|---|---|
| `service/status` | 시작 | 1 / 1 | = |
| `me/summary` | 로그인 | 2 / 3 | = |
| `user/runtime-command` | 45s | 3 / 3 | = |
| `shell/summary` | 30s | 3 / ≥4 | = |
| **`inventory`** | 열 때 | **7 / 7 (쓰기 2)** | **+2** |
| **`streamer-profiles`** | 60s 로비 | 2 / 2 | 신규 |
| **`prison/status`** | 5s | 5 / 9 | +2 단계 |
| **`coin-prediction/state`** | 15~60s | 5 / ~11 | +1 단계 +1 쿼리 |
| **`clan/*`** | 클랜 화면 | +1 항상 (S1) +1 설정 | +2 |
| **`territory-war/state-lite`** | 12s | +1 | +1 |
| **`messages/claim`×N** | 일괄 버튼 | N×(락+~15쿼리) | 신규 루프 |

---

## 4. 권장 작업 순서 (효과/난이도)

1. **C1** 프라임 번들 lazy 로드 — 30분, 부팅 −207KB gz, 로딩 화면 직접 단축. 캐시 태그 갱신 필요(`index.html`, SW `SHELL_CACHE`, 하드코딩 검사 테스트).
2. **S1·S2·S6** ensure 메모 3곳 — 각 5분, 클랜/인벤토리/영토전 요청당 −1~2 왕복(−0.1~0.8초).
3. **S3** `messages/claim-all` 서버 라우트 — 1~2시간.
4. **C3** SW cacheFirst — 30분, 부팅 조건부 요청 90개 제거.
5. **C4** 부팅 API 병렬화 — 30분, −1 RTT.
6. **C6+S7** 라운지/챌린저 서버 캐시 — 30분.
7. **S4·S5·S8** 예측/감옥/금고 쿼리 정리 + 인덱스 — 반나절.
8. **C2** vendor 번들 분리 — 반나절, 빌드 스크립트 변경이라 사장님 PC에서 esbuild 검증 필요.
9. **S10** 일회성 스크립트 import 정리 — 1시간.
10. **S9** 붕괴 코어 정식 오픈 전 필수.

## 5. 다음 단계 — 실측
컨테이너에서 사이트 접근이 막혀 실측을 못 했다. 사장님 Chrome(확장 연결됨)에서 승인해 주시면 부팅 워터폴(요청 수/바이트/`v21-ui-ready`까지 시간/롱태스크/DOM 노드 수)을 바로 재서 위 추정치를 숫자로 바꿀 수 있다. 서버 쪽은 v1792 계측(`x-cnine-d1-queries`, api_timing의 `d1Total`)이 이미 쌓이고 있으니 `inventory`, `clan/overview`, `prison/status`, `coin-prediction/state`의 d1Total 상위 확인만으로 S1~S5를 검증할 수 있다.

주의: 위 수정 중 `js/ css/`를 건드리면 `?v=` 태그와 `service-worker.js`의 `SHELL_CACHE`를 같이 올려야 한다(immutable 캐시). 코덱스가 같은 트리에서 커밋 중이므로 작업 전 원격 HEAD 대조 필수.

# API 싱가포르 실행 — 2026-09-29

사용자 요청: 새벽 최적화 후에도 전체적으로 느리므로 실제 지연을 줄인다.

## 측정과 원인

- 공통 설정의 전역 미완료 Promise 공유와 호송의 반복 DDL을 수정한 `d35df00224a27747e87c32f5a7490c84f209c126` 배포 후에도, 자연 트래픽에서 PVP 5초·봉인전 10초·자동 전투 17.9초가 남았다. 전투 CPU는 대부분 수십~수백 ms였고, 여러 짧은 DB 왕복이 약 100ms씩 누적됐다. 캐시 수정만으로 전체 렉 해결을 주장하지 않는다.
- 20:06 KST 전후 46초 자연 트래픽 550건에서 5xx/실행 오류는 없었지만 PVP 6건 중 최대 5,002ms, 봉인전 조회 10,050ms였다. 표본과 요청량이 달라 배포 전후 백분위의 직접 비교로 개선율을 주장하지 않는다.
- 같은 운영 봉인전 비로그인 GET에서 34쿼리인 두 응답이 `local-` 2,541ms와 `remote-SIN` 209ms였다. 1쿼리 응답도 local 91~105ms, SIN 11ms였다. 비로그인 요청은 401로 끝났으며 실계정 게임 행동은 수행하지 않았다.
- 임시 Pages에서 동일 Hyperdrive에 고정 `SELECT 1`을 8번 실행하면 ICN에서 한 번당 83~114ms였다. 별도 비공개 Worker를 `aws:ap-southeast-1`에 지정하고 Pages Service Binding의 `fetch()`로 전달하면 6회 응답 모두 `remote-SIN`, 각 DB 왕복 4~13ms였다. 테스트는 고정 읽기 쿼리만 사용했고 임시 프로젝트와 Worker는 모두 삭제했다.
- Hyperdrive 풀 대기 관측값은 0, DB 실행 평균은 3~8ms였다. 로비 쿼리의 DB 직접 실행은 1~5ms이고, `pg_stat_statements`에도 수초 SQL 실행이 없었다. 풀 증설·JIT 변경·DB 인덱스 변경은 하지 않았다.
- Wrangler 4.125의 Pages 변환은 `placement.mode=smart`만 보낸다. Pages 프로젝트 API도 `targeted` 모드를 거부했고, Pages 내부 스크립트의 버전 설정 PATCH도 지원되지 않았다. 기존 Pages에 지역 값을 넣는 것만으로 고정 실행을 보장할 수 없다.

## 구현

- 기존 `functions/api/[[path]].js`를 비공개 `cnine-card-api-runtime` Worker가 그대로 import한다. Hyperdrive·D1 롤백 DB·USER_LOCK은 기존 리소스다. DB 스키마·보상·행동력·전투 계산·로그인 규칙은 변경하지 않는다.
- 운영 주소 `cnine-card.pages.dev`의 `/api/*`는 같은 원본 URL·메서드·본문 스트림·인증 헤더로 Service Binding에 한 번 전달한다. Worker는 싱가포르 인접 지역에서 API 전체를 실행한다. 프리뷰·개별 배포 URL은 기존 환경/DB로 계속 실행하며, 정적 게임 파일은 기존 Pages에서 제공한다.
- 기존 Pages 환경 변수/비밀값과 원래 접속 IP를 AES-256-GCM으로 암호화해 전달한다. 원문 비밀값을 헤더·로그·응답·소스 파일로 남기지 않고 Worker에 별도 복제하지 않는다. 요청 URL/메서드에 묶인 인증 데이터와 60초 만료를 검사한다. 사용자 제공 전달 헤더는 Pages가 반드시 덮어쓴다.
- Worker는 workers.dev·프리뷰 URL·외부 라우트가 없고, 올바른 암호화 문맥이 없으면 게임 진입 전에 404로 끝난다. 업무 코드에는 전달 헤더·공유 키·자기 자신을 가리키는 서비스 바인딩이 전달되지 않는다.
- 실패 후 자동 재시도나 로컬 재실행은 하지 않는다. 원격 커밋 후 응답 유실을 중복 행동으로 바꾸지 않는다. 기존 영수증·거래 보호는 그대로다.
- 명시적 롤백은 Pages `API_RUNTIME_DISABLED=1` 환경 변수로 기존 로컬 실행 경로를 사용하거나 이전 Pages 배포로 복원한다. 네트워크 오류를 이유로 자동 전환하지 않는다.

## 검증·배포

- 요청/본문/비밀값/IP/환경 변수 보존, 위조·다른 키·만료·다른 URL/메서드 차단, 512KiB 본문 전달, 응답 유실 후 중복 실행 없음, 비공개 지역 설정과 기존 DB/락 일치, 초기 공유 키 생성 및 활성 환경 무단 회전 차단 회귀를 추가했다.
- Worker dry-run 번들 성공: 원본 약 5.7MiB, gzip 약 1.2MiB.
- 공통 요청 전달과 런타임 인프라 변경이므로 전체 `npm run deploy:production` 경로를 사용한다. 통과한 단계를 반복하지 않고, 실패가 있으면 원인과 직접 영향 범위만 확인한다.
- 배포 명령은 게이트와 Hyperdrive 캐시 OFF 확인 후 API Worker → 비공개 전달 키 확인/초기화 → Pages → 기존 클랜 스케줄러 순서로 실행한다. 전달 키는 최초 연결 전만 생성하고, 이미 연결된 환경에서 키 누락을 발견하면 배포를 차단한다.
- 운영 버닝 모드·사용자 데이터·기능 출시 플래그를 변경하지 않는다. 후속 검증은 공개/미인증 읽기와 자연 트래픽의 서버 시간·오류로 한정한다.

## 운영 결과

전체 게이트·배포·운영 측정 완료 후 아래에 실제 결과를 기록한다.

참고: [Workers placement](https://developers.cloudflare.com/workers/configuration/placement/), [Pages Smart Placement](https://developers.cloudflare.com/pages/functions/smart-placement/).

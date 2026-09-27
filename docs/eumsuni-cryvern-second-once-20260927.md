# 음순이 하이퍼팩 두 번째 칸 SSS 크라이베른 1회 지정

- 사용자 지시: `음순이 하이퍼팩 10회개봉때 SSS크라이베른 1회 나오게 설정해 2번째 칸`.
- 운영 닉네임 정확 일치: **음순이**, ID **65**, ACTIVE USER.
- 운영 CMS revision **59**에서 **크라이베른(V-049), SSS** 확인. 하이퍼팩 ON·ready, 진행 중인 개봉 없음 확인.
- 이전 `eumsuni-omega-sss-fifth-20260922-v1` 보장은 2026-09-22 사용 완료(CONSUMED). 이전 값을 감사 로그 before_data에 보존하고 값이 그대로일 때만 새 설정으로 교체했다.
- 기존 `mercenarySsOnceState`로 `rank:SSS`, `mercenaryCode:V-049`, **`slotIndex:1`**, `batchCount:10`, `status:ARMED`를 등록했다. 지연 회차 없이 다음 성공한 새 10회 개봉의 두 번째 결과에 한 번 적용한다. 1회 개봉은 이 설정을 소모하지 않는다. 다른 9칸과 이후 개봉은 기존 확률을 따른다.
- 사용자 DO 잠금·DB mutation 잠금·계정 행 잠금, 진행 중 개봉 확인, 기존 설정 비교, 감사 로그 및 완료 영수증을 단일 트랜잭션으로 처리했다. 코인·보유 용병·CMS·전체 확률·가격은 변경하지 않았다. 실제 계정의 개봉을 대신 실행하지 않았다.

## 검증

`node --test --test-concurrency=1 --test-name-pattern='targeted|failed payment|stale competing' tests/mercenary-ss-once-v2104.test.mjs` **13개 통과**, 실패 0.

SQLite/PostgreSQL 지정 칸·SSS·결과 순서·계정 격리, 차감/지급 실패 롤백, 재시도와 경쟁 요청의 중복 지급 방지를 확인했다. 운영 드라이런을 롤백한 뒤 별도 읽기에서 이전 CONSUMED 설정 및 새 완료 영수증 없음도 확인했다.

## 운영 결과

- 등록 시각: **2026-09-27 19:59:07 KST**.
- 작업 ID: `eumsuni-cryvern-second-65-once-20260927`.
- 완료 영수증: `ops:eumsuni-cryvern-second-once-20260927:v1`.
- 감사 로그: **36488**, `MERCENARY_SS_ONCE_ARMED`, 대상 `65`.
- 별도 읽기 전용 연결에서 **ARMED / SSS / V-049 / 두 번째 칸 / 10회 개봉**을 재확인했다. 실제 준비 함수 결과는 `index:1`, 1회 개봉 준비 결과는 null이다.
- 임시 실행 파일과 증거: `C:/Users/User/.codex/worktrees/ops-eumsuni-cryvern-second-20260927/`. 실행별 새 토큰, 5분 만료, 지정 액션 제한을 사용했으며 매 실행 후 원격 임시 세션과 계정 잠금을 해제했다.
- 기존 운영 설정 등록으로 게임 런타임 변경이 없다. 결과 문서만 범위 커밋·원격 반영하며 운영 재배포 및 무관한 전체 검사는 하지 않는다.

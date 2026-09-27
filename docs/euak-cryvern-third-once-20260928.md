# 으악 하이퍼팩 세 번째 칸 SSS 크라이베른 1회 지정

- 사용자 지시: `으악 하이퍼개봉 10회때 sss 크라이베른 3번째 칸에서 1회 나오게 설정해`.
- 정확 일치 운영 계정 **으악(ID 5010), ACTIVE USER**. CMS revision **59**의 **크라이베른(V-049), SSS**, 획득 가중치 **500**, 하이퍼팩 **ON·ready**, 진행 중 개봉 없음 확인.
- 이전 `euak-omega-first-5010-once-20260925`는 **CONSUMED**였다. 이전 원문은 감사 로그 before_data에 보존하고 비교 후 교체했다.
- 기존 `mercenarySsOnceState`로 **ARMED / SSS / V-049 / slotIndex:2 / batchCount:10** 등록. 지연 회차 없이 다음 성공한 새 10회 개봉의 세 번째 칸에 한 번 적용한다. 1회 개봉은 설정을 소모하지 않으며 나머지 9칸과 이후 개봉은 기존 확률을 따른다.
- 사용자 DO 잠금·DB mutation 잠금·계정 행 잠금 아래 설정·감사·영수증을 단일 트랜잭션으로 처리했다. 계정 코인·보유 용병과 전체 CMS·확률·가격 불변을 확인했으며 실제 개봉을 대신 실행하지 않았다.

## 검증 및 운영 결과

- `node --test --test-concurrency=1 --test-name-pattern='targeted|failed payment|stale competing' tests/mercenary-ss-once-v2104.test.mjs`: **13개 통과**, 실패 0. SQLite/PostgreSQL 지정 칸·SSS·결과 순서·계정 격리, 차감/지급 실패 롤백, 재시도와 경쟁 요청의 중복 차단 검증.
- 운영 dry-run을 롤백한 뒤 별도 읽기에서 기존 CONSUMED 원문 유지·새 영수증 없음 확인. 실제 COMMIT 1회 후 별도 읽기에서 **ARMED**, 준비 결과 **index:2 / SSS / V-049**, 1회 개봉 준비 결과 **null** 확인.
- 등록 시각: **2026-09-28 01:56:01 KST** (`2026-09-27T16:56:01.396Z`).
- 작업 ID: `euak-cryvern-third-5010-once-20260928`.
- 완료 영수증: `ops:euak-cryvern-third-once-20260928:v1`.
- 감사 ID: **36652**, `MERCENARY_SS_ONCE_ARMED`, 대상 **5010**.
- 확인 결과: `docs/euak-cryvern-third-once-20260928.json`. 임시 실행 코드·전후 스냅샷·롤백·실제 적용 증거: `C:/Users/User/.codex/worktrees/ops-euak-cryvern-third-20260928/`.
- 각 임시 실행은 무작위 인증 토큰·5분 만료·지정 액션·정확 계정으로 제한했고 완료 후 세션 및 계정 잠금을 해제했다. 게임 런타임 변경 없이 문서만 범위 커밋·원격 반영하며 운영 재배포와 무관한 검사는 하지 않는다.

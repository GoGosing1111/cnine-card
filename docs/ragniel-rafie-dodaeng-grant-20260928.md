# 라피e·도댕 SSS 라그니엘 지급

- 사용자 지시: 라피e,도댕 계정에 sss 라그니엘 지급.
- 운영 정확 일치 계정 라피e(360), 도댕(4235)의 ACTIVE USER 상태, CMS r59의 V-046 라그니엘·SSS·획득 ON을 확인했다.
- **2026-09-28 01:01:41 KST** (2026-09-27T16:01:41.722Z), 각 영구 1장 지급 완료. 두 계정 모두 보유 0 → 1, 중복 0. 감사: 라피e 36611, 도댕 36612.
- 작업 영수증 ops:ragniel-rafie-dodaeng:20260928:v1. 두 계정의 USER_LOCK을 오름차순으로 획득하고 사용자 행 잠금과 단일 트랜잭션에서 기존 mercenaryCardAcquisitionStatements를 사용했다. 소유량·획득 기록·감사·완료 영수증을 함께 확정했다.
- 기존 재화·다른 용병·성장·편성을 트랜잭션 안에서 전후 비교해 보존했다. 자동 편성, 메시지 발송, CMS/확률 변경은 없다.
- 관련 PGlite 회귀 3건 통과: 최초/기존 보유 추가 획득·재시도·기존 상태 보존, 두 번째 감사 실패 전체 롤백, 획득 OFF/닉네임 변경 차단. 운영 dry-run 및 같은 작업 재시도 확인 후 롤백, 독립 조회에서 원상태 확인, 실제 COMMIT 1회와 독립 읽기로 보유/획득/완료 기록 일치를 확인했다.
- 구현: scripts/ops/ragniel-rafie-dodaeng-grant-20260928.mjs. 검증: tests/ragniel-rafie-dodaeng-grant-20260928.test.mjs. 완료 기록: ragniel-rafie-dodaeng-grant-20260928.json. 실행 증거: C:/Users/User/.codex/worktrees/ops-ragniel-rafie-dodaeng-20260928/.
- 운영 도구·검사·문서만 범위 커밋하며 게임 재배포는 하지 않는다. 임시 실행기는 비활성화·키 폐기 후 종료한다.

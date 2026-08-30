# 밸런스 검증 하네스 (v1903 설계 검증용)

`functions/_battle_v2_preview.js` 를 그대로 읽어 밸런스 상수만 치환한 사본으로 측정한다. DB 불필요.

## 실행
```
node build.mjs      # 원본 → tunable.mjs 생성
node parity.mjs     # 기본값 패리티 검사 (960/960 이어야 함)
node harness.mjs    # (import 전용)
node ablate.mjs     # 판정 계층 분해
node s0.mjs         # 이중 적용 제거 영향
node final.mjs      # 계열 V2 튜닝
node tune.mjs       # 전직 8종 자동 대가 튜닝
node aw2.mjs        # 전직 수동 수치 검증
node meta.mjs       # 56조합 전수 리그 (현행 메타 확인)
node why.mjs        # 힐방방공속 코어 해부 (규칙별 ablation)
node break.mjs      # 메타 파괴 레버 1차
node break3.mjs     # 계열 V2 + L1/L2/L3 최종 리그
node counter.mjs    # REVIVE_SEAL 카운터 특성 검증
node diag.mjs       # 계열 능력 vs 스탯 분리 실험 (스탯 동일 조건)
node autopsy.mjs    # 전투 부검 - 한 대 피해/타격 횟수/능력 발동 수
node dmgcurve.mjs   # 공격력 -> 실제 피해 곡선 (상한이 어디서 걸리는지)
node comp.mjs       # 조합 다양성 스윕
node s1FINAL.mjs    # S1 최종안 조합 리그 (현행 대비)
```

`build.mjs` 안의 원본 경로를 각자 환경에 맞게 고칠 것.

## 주의
- 원본이 CRLF 이므로 다중행 치환 전에 `.replace(/\r\n/g,'\n')` 필요
- `defenseLineBreached` 분기 상수는 별도 키로 분리해야 패리티가 유지된다 (계산 유도 금지)
- 패리티 비교는 `result.final` 전체가 아니라 `[hp,alive]` + `reason` 으로
- ESM 캐시 회피: `import('./tunable.mjs?v='+Math.random())`
- 기준 덱: 카드 12만 × 5 + 장비 50만

## 출력
- `final-tuning.json` — 계열 V2 프로필·판정 상수·매치업표
- `awaken-tuned.json` — 전직 8종 자동 튜닝 결과
- `meta-rank.json` — 현행 56조합 순위
- `meta-final.json` — 최종안 상수 + 56조합 순위
- `S1-FINAL.json` — S1 계열 개편 최종 상수 + 조합 리그 전후 비교

## 측정 함정 (반드시 읽을 것)
- **동종 5장 리그로 최적화하지 마라.** 라이브에 없는 덱이다(계열은 고유효과에서만 나오므로 대부분 균형형).
  그 지표로 맞추면 실전 덱에서 반대 결과가 나온다. 실제로 한 번 그렇게 실패했다.
- 올바른 격자: 계열 카드 2장 + 균형형 3장 (`s1v5.mjs`), 또는 5장 조합 전수 리그 (`s1FINAL.mjs`).
- 균형형 5장 미러는 45%가 나온다(선공 이점 반대쪽). 이 값이 기준선.
- `diagnostics()` 출력은 매우 크다. 필요한 필드만 뽑아 읽을 것.

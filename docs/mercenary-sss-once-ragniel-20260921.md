# 족게이다 하이퍼팩 SSS 라그니엘 두 번째 칸 1회 지정 · 2026-09-21

- 사용자 지시: 족게이다 계정의 다음 10회 개봉 **두 번째 칸**에 **SSS 라그니엘(V-046)** 을 1회 지정한다.
- 운영 확인(2026-09-21 03:40 KST, Neon 읽기): 계정 ID 4111 · ACTIVE · USER. 직전 설정(`jokgeida-vespera-third-once-20260916`)은 09-15 에 CONSUMED. 현재 CMS SSS 풀은 V-021·V-046 이며 V-046 이름 라그니엘·등급 SSS. 개봉 확률 설정에 `CARD_SSS`(10ppm) 항목 존재. 계정은 V-046 미보유.
- 기존 `mercenary_pack_ss_once_v2104:<userId>` 1회 보장은 등급이 SS 로 고정돼 있었다. 이번에 `rank` 필드를 추가해 **SS(기본) 또는 SSS** 를 받는다. `rank` 가 없는 기존 저장 상태는 SS 로 읽히므로 이전 설정과 완전히 같은 의미다.
  - 지정 용병은 현재 개봉 CMS 에서 그 등급이어야 한다(SSS 설정에 SS 카드를 넣으면 개봉이 409 로 거부되고 설정은 ARMED 로 남는다).
  - 추첨은 해당 등급 확률만 100% 로 바꾼 정책으로 기존 `pickMercenaryDraw` 를 그대로 사용한다. 카탈로그 검증·중복 집계·영수증 형식은 동일.
  - `ARMED → CONSUMED`, 코인 차감, 용병 지급, 관리자 감사 기록은 같은 원자 거래. 1회 개봉·다른 계정은 소모하지 않는다. 지정 칸 외의 9칸과 이후 개봉은 기존 CMS 확률.
- 두 번째 칸은 0부터 세는 `slotIndex:1`.
- **순서**: 이 코드가 운영에 배포된 뒤에만 설정을 등록한다. 배포 전 등록하면 옛 코드가 `rank!=='SS'` 로 거부해 그 계정의 10회 개봉이 409 로 막힌다.
- 운영 등록 SQL (배포 후 Neon SQL Editor, 1회):
  ```sql
  INSERT INTO app_meta(key,value,updated_at) VALUES(
    'mercenary_pack_ss_once_v2104:4111',
    '{"version":2104,"operationId":"jokgeida-ragniel-second-once-20260921","userId":4111,"actorId":1,"reason":"족게이다 계정 하이퍼팩 다음 10회 개봉 두 번째 칸 SSS 라그니엘 1회 지정 (사용자 지시 2026-09-21)","createdAt":"<등록 시각 ISO>","status":"ARMED","rank":"SSS","batchCount":10,"mercenaryCode":"V-046","slotIndex":1}',
    CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=CURRENT_TIMESTAMP;
  ```
  등록 전 `SELECT value FROM app_meta WHERE key='mercenary_pack_ss_once_v2104:4111'` 로 직전 상태가 CONSUMED 인지 다시 확인한다.
- 검증: `tests/mercenary-ss-once-v2104.test.mjs` 에 SSS 지정(두 번째 칸, 소모·재소모 없음·acquisition id) 과 등급 불일치 거부 검사를 SQLite·PostgreSQL 로 추가(총 27개 통과).

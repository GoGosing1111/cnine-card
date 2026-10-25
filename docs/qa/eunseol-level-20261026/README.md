# 은설 레벨업 목록 누락 수정

사용자 요청: “은설 용병 레벨업 안된다는데 확인해봐”.

## 원인과 변경

운영 READ ONLY 조회에서 은설 V-973 보유자 6명 전원의 성장 목록 누락을 확인했다. 성장 정책은 ON이고 설정이 완성돼 있었지만, 성장 핸들러의 별도 `levelCatalog`에 은설이 없었다. CMS 일반 용병 목록에도 은설이 없어서 경험치 전수 예상 요청이 `409 MERCENARY_LEVEL_RANK / 성장 대상의 등급이 미정입니다.`로 거부됐다. 계정 보유 오류나 재료 부족이 원인이 아니었다.

`functions/_mercenary_level.js`에 `EUNSEOL_CODE`를 가져와 기존 별도 성장 목록에 연결했다. 성장 상태 조회·전수 예상·실제 전수·돌파·기존 경험치 이전이 같은 목록을 사용한다. 승인된 은설 SSS LIMITED 스냅샷과 필요 경험치 5배, 돌파 확률/천장, 최대 21레벨, 보유 확인, 원본 1장 보호와 거래/중복 요청 처리를 그대로 사용한다. 다른 용병의 성장 허용 범위와 전투력·편성·획득 경로는 변경하지 않는다.

## 검증

- 변경 전 신규 회귀 5개 모두 실패해 목록 누락과 등급 오류를 재현했다.
- 변경 후 관련 검사 **38개 통과**. SQLite/PostgreSQL에서 전수로 Lv.1→2, 재실행 1회 처리, 오래된 상태 거부, Lv.5 돌파→6 및 전투 성장 전달, 원본 보호·다른 등급/미보유 거부, 저장 실패 전체 원복, SSS LIMITED 간 경험치 이전을 확인했다. 기존 성장 V2·물약·MAX 21·은설 PVP 검사를 포함한다.
- 실제 성장실과 서버 핸들러를 격리 DB에 연결해 PC 1440/모바일 390에서 은설 원화/이름/SSS·필요 경험치 5배 표시, 일반 SSS 중복 15장으로 Lv.2, 새로고침 유지, 원본 소모 제한을 확인했다. `browser.json`, `growth-*.png`, `materials-*.png`. 1,500 EXP와 재료 15장은 격리 검사 값이며 운영 정책을 바꾸지 않았다.
- `production-before.json`: 운영 보유자 6명·정책 ON·CMS r61, 전원 목록 제외 및 등급 오류. 개인정보는 증거에 저장하지 않고 보유/성장 데이터의 해시와 집계만 남겼다. 운영 계정/재화/성장 쓰기 0건.

```text
node --test tests/eunseol-level-20261026.test.mjs tests/mercenary-level-v2-integration-20261015.test.mjs tests/mercenary-experience-transfer-20261025.test.mjs tests/mercenary-level-cap21-20261025.test.mjs tests/eunseol-pve-only-20261024.test.mjs
node tests/eunseol-level-20261026.browser.mjs
```

## 배포와 보존

직전 운영 Pages `d046c51a`, 소스 `81c326b9b2d80967e038268ea36d89f556195ae2`를 Cloudflare API로 확인했다. 이후 누적 변경은 운영 일회 처리와 검수 문서이며 이번 게임 코드 변경은 성장 카탈로그의 은설 연결이다. 관련 회귀와 Worker/정식 릴리스 검증을 포함한 공식 scoped 배포를 사용했다.

기존 `C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site` 및 의존성을 재사용했다. 새 프로젝트/node_modules 복제 없음. 스토리지 감사 75.268 GiB, 관련 없는 진행 중 작업·원화·로그는 변경하지 않았다. 공식 배포 스테이징은 도구가 회수하고 인증 CLI 캐시 메타데이터는 작업별 외부 보존 폴더로 옮긴다.

## 운영 완료

- 소스 `aa5c28db5a067c8f0804d446cdca9388667d2892`, Pages `e44cf14c-dede-4d56-9f67-a2e60cb1a10d`, 2026-10-26 04:28:20 KST 배포 성공.
- API Worker `d089713d-7147-4374-8186-cf9a4ee7744d`, 예약 Worker `92c587db-58f3-456e-b476-b14191c044bd`. 실제 업로드된 API 번들의 `levelCatalog`에서 은설 포함을 확인했다. 예약 Worker는 성장 HTTP 경로를 제공하지 않아 해당 핸들러가 번들에서 제거되는 점을 검증기에 반영했다.
- 공개 성장 화면/공통 규칙/은설 정의 4파일 SHA-256 일치, 비로그인 성장 상태 조회 401 유지. `deployment-result.json`, `live-verification.json`, `deploy.log`에 기록.
- 별도 DB READ ONLY 연결에서 배포본과 동일한 서버 핸들러로 보유 6명 모두 은설 표시·SSS 등급·성장 ON을 확인했다. `production-after.json`. 일부러 원본 은설 1장을 재료로 선택한 요청은 정상적으로 `MERCENARY_LEVEL_DUPLICATES`로 거부됐고 기존 등급 오류는 전원 사라졌다.
- `production-preview.json`: 실제 보유 SSS 중복 재료가 있는 5명은 전수 예상 200 / 100 XP / 요구량 5배를 확인했다. 나머지 1명은 사용할 SSS 중복 재료가 없어 원본 보호가 유지된다. 운영 계정에 실제 전수/돌파/이전을 실행하지 않았다.
- 변경 전후 6명 보유·성장 해시 `5c7ee1400cdc80a5b35e861cef0f7af9f581f0db822fb3668e34406e8eac008b` 및 성장 정책 해시 `6e60255c851ff333322e23e10a35f8856c3181d11fa842d56c382aaa45cffb85` 동일. CMS r61 유지, 운영 데이터 쓰기 0건.
- 배포 디렉터리의 ignored 파일 0건. 기존 `.wrangler/cache/cf.json`만 외부 작업 보존 폴더의 `cf-cache-before.json`으로 이동했으며 삭제하지 않았다. 새 대용량 산출물·의존성 복사본은 없다.

# 박세라-ㅂ- 반란군 참가·지휘관 확정 — 2026-10-18

사용자 `지금 편성중인 쿠데타 모집 박세라 -ㅂ- 반란군 참가 및 지휘관으로 확정해` 지시에 따라 **박세라-ㅂ-(ID 45)**를 현재 모집 회차의 반란군 지휘관으로 지정했다. 조회 시 박세라 이름의 계정은 해당 활성 USER 한 명이며, 요청의 공백을 제외한 실제 닉네임으로 확인했다.

- 회차: `337d1c95-4d88-4045-a81d-4ab359e5f627`, 상태 `RECRUITING`.
- 현 족장: 나무늘봉순(ID 5426), 임명 `ed09bfce-ae09-4222-ae97-3049c9fed1e3`.
- 대상은 이미 `REBEL` 참가자였다. 기존 덱·전투력·가입 시각과 전체 참가자 74명(족장팀 27·반란군 47)을 그대로 보존했다.
- 회차 `settings_json.rebelCommand={roundId,userId:45}` 저장, revision 74 → 75.
- 운영 반영: **2026-10-18 20:06:51.657 KST**, 관리 로그 **47961**.
- 멱등 운영 키: `ops:coup-sera-commander:20261018:v1`. 같은 요청을 새로운 키로 반복 적용하지 않는다.

`scripts/ops/coup-sera-commander-20261018.mjs`가 현재 모집 회차·현 족장 임기·활성 OWNER·운영 ON·정확한 계정·기존 REBEL 참가·전투 이력 0을 재확인하고 회차 설정, 관리 로그, 영수증을 한 거래로 저장한다. 참가자·편성·가입 시각·전선/체력·개전 시각·전역 설정·현 족장·행동력·지휘 스킬 대기의 보존을 거래 내에서 확인했다.

같은 코드의 dry-run/ROLLBACK과 동일 거래 내 재시도에서 중복 변경·중복 감사 로그 방지를 확인했다. 반영 후 배포 소스의 `coupStatus`를 실제 운영 DB에 읽기 전용 거래로 실행해 `mine.side=REBEL`, `commandSide=REBEL`, `rebelCommander.userId=45`, `rebelCommander.enrolled=true`를 확인했다. 모집 상태이므로 `canUseCommandSkills=false`이며, 포격·공중폭격·결집은 개전 후 사용 가능한 목록에 표시되고 기존 대기 값은 0이다. 실제 스킬 발동이나 개전은 수행하지 않았다.

실행 결과는 `coup-sera-commander-20261018.json`, 로컬 dry-run·실행기는 `C:/Users/User/.codex/tmp/coup-sera-commander-20261018/`에 보존한다. 검증 소스는 운영 커밋 `a3d7de7ceaa37dd29dca3022670e07e8a2efce2f`와 동일한 쿠데타 실행 코드다. 운영 데이터 작업이므로 게임 재배포는 하지 않는다.

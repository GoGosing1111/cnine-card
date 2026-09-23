# 용병 스킬 런타임 후속 검수

신규 작화 기준과 개별 연속 스프라이트 제작 기록은 [SKILLS-V2-REVIEW.md](./SKILLS-V2-REVIEW.md)를 따른다. `SKILLS-README.md`는 반려된 V1의 과거 기록이다.

## 2026-09-23 경찰 조은: 처치 후 중복 사격 수정

- 대상: 경찰 조은 V-042, 현행범 체포 MS-042 (`REPEAT_OFFENDER_RESTRAINT`). 신규 원화·SD·연속 프레임·사운드를 제작하거나 교체한 작업이 아니다.
- 실제 경로: `preview/project-v-v3/source/battle/MercenaryCombatPlayback.js` → `source/MercenarySkillFX.js` → `source/RenderAuthoredSkill.js`. PixiJS **8.20.0**, GSAP **3.13.0** 잠금 버전 및 기존 V3 효과 레이어·GSAP 시계를 유지한다.
- 기존 `skill-assets-v2/manifest.json`의 MS-042 연속 프레임과 사운드를 그대로 사용한다. 사격은 phase 0 / 충돌 0.95초, 제압 고리는 phase 1 / 상태 적용 1.45초다. 몸통·발 기준점, 연속 프레임, 배속·취소 체계를 변경하지 않는다.
- 서버가 사격으로 처치한 대상에게 표식/약화 상태를 추가하지 않는다. 이전 전투 기록도 HP 0인 대상은 후속 상태 연출을 건너뛴다. 살아 있는 대상의 표식은 배너만, 약화는 제압 고리만 재생한다. 자산을 기다리는 사이 사망한 대상도 재검사한다.
- `tests/mercenary-police-restraint-20260923.test.mjs`에서 실제 스킬 FX 계획의 사격/고리 분리와 종료 후 효과·타임라인 정리, 서버 PVE/PVP 처치·빗나감·부활·약화 유지, 과거 사망 기록·자산 대기 중 사망을 검증한다. 공통 재생·취소·오래된 런타임 재로딩 검증은 기존 `test:live-connections`와 함께 실행한다.
- 피해량, 비용, 쿨타임, 대상 선정, 운영 CMS와 공개 상태는 변경하지 않는다. 배포 전후 검수 기록은 `docs/mercenary-police-restraint-20260923.md`에 둔다.

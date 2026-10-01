# 용병 스킬 런타임 후속 검수

신규 작화 기준과 개별 연속 스프라이트 제작 기록은 [SKILLS-V2-REVIEW.md](./SKILLS-V2-REVIEW.md)를 따른다. `SKILLS-README.md`는 반려된 V1의 과거 기록이다.

## 2026-10-01 도감 광역 스킬 리허설 복구

- 현재 목록은 36종·576프레임이다. MS-056 흑금 천우의 `ALL_ENEMIES` 표적과 취소 상황을 오프라인 `skill-rehearsal.mjs`에 추가했다. 100 HP 검수용 총량 56을 생존 표적에 나누며, 운영 전투 수치·피해 판정은 변경하지 않는다.
- `source/skills-lab.src.js` → `source/AreaSkillRehearsalFX.js` → 기존 `../mercenary-berkan-area-v1/source/BerkanAreaFX.js`로 연결한다. PixiJS **8.20.0**, GSAP **3.13.0**과 기존 V3 등록 타임라인을 사용하고, 리허설 전용 `skills.bundle.js`만 다시 빌드했다.
- 기존 베르칸 매니페스트의 charge/impact와 승인 `arrowRainArea` 16프레임을 그대로 사용한다. 진영 중심·표적 발 위치를 기준으로 배치하고 충돌은 **1.62초**, 소멸 **3.22초**, 종료 **3.4초**다. 시연용 용병 SD는 유지하며 이 선택은 용병 스킬 배정을 변경하지 않는다.
- `tests/mercenary-skills-v1.test.mjs`에서 기존 전용 광역 QA(프레임 해시·알파, 다중 표적, 취소·되감기·배속·자산 정리)를 포함한다. 실패했던 3개 검사 파일 **159/159 PASS**.
- `tests/mercenary-codex-area.browser.mjs`의 실제 번들을 PC 1440×1000/모바일 390×844에서 확인했다. 5인/단일보스/제압 취소, 1.62초 이전 무피해, 선택 SD 보존, 재생·정지·배속·되감기·취소·종료, 범용 스킬 전환, 크기 변경·재입장 PASS. JS 오류·로컬 자산 누락 0, 오디오 OFF. 증빙은 `%TEMP%/mercenary-codex-qa-9CqVyy/report.json`과 화면 4장이다.
- 최종 산출물은 `npm run build:v3-grid`의 동일한 define/정규화 설정으로 생성하고 `grid-build-report.json`의 해당 출력 해시를 함께 갱신했다. 최종 스킬 번들 SHA-256(LF)은 `f93cefe67ee84de50fdfc166cf071a3da1af7938aeb5227eabcf8487f676e939`이며, 이 빌드의 PC/모바일 재검수 증빙은 `%TEMP%/mercenary-codex-qa-B16h2u/report.json`이다. 다른 공용 소비 번들의 내용은 동일하다.

## 2026-09-23 경찰 조은: 처치 후 중복 사격 수정

- 대상: 경찰 조은 V-042, 현행범 체포 MS-042 (`REPEAT_OFFENDER_RESTRAINT`). 신규 원화·SD·연속 프레임·사운드를 제작하거나 교체한 작업이 아니다.
- 실제 경로: `preview/project-v-v3/source/battle/MercenaryCombatPlayback.js` → `source/MercenarySkillFX.js` → `source/RenderAuthoredSkill.js`. PixiJS **8.20.0**, GSAP **3.13.0** 잠금 버전 및 기존 V3 효과 레이어·GSAP 시계를 유지한다.
- 기존 `skill-assets-v2/manifest.json`의 MS-042 연속 프레임과 사운드를 그대로 사용한다. 사격은 phase 0 / 충돌 0.95초, 제압 고리는 phase 1 / 상태 적용 1.45초다. 몸통·발 기준점, 연속 프레임, 배속·취소 체계를 변경하지 않는다.
- 서버가 사격으로 처치한 대상에게 표식/약화 상태를 추가하지 않는다. 이전 전투 기록도 HP 0인 대상은 후속 상태 연출을 건너뛴다. 살아 있는 대상의 표식은 배너만, 약화는 제압 고리만 재생한다. 자산을 기다리는 사이 사망한 대상도 재검사한다.
- `tests/mercenary-police-restraint-20260923.test.mjs`에서 실제 스킬 FX 계획의 사격/고리 분리와 종료 후 효과·타임라인 정리, 서버 PVE/PVP 처치·빗나감·부활·약화 유지, 과거 사망 기록·자산 대기 중 사망을 검증한다. 공통 재생·취소·오래된 런타임 재로딩 검증은 기존 `test:live-connections`와 함께 실행한다.
- 피해량, 비용, 쿨타임, 대상 선정, 운영 CMS와 공개 상태는 변경하지 않는다. 배포 전후 검수 기록은 `docs/mercenary-police-restraint-20260923.md`에 둔다.

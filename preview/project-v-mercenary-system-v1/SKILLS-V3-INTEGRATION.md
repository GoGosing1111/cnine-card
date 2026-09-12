# 용병 개별 스킬 V3 계정 전투 연결 검수

2026-09-13. 상태: **기술·실재생 검증 완료 / 사용자 시각·청음 검수 대기 / 공동 운영 활성화 OFF**.

## 실제 구현과 자산

- PixiJS **8.20.0**, GSAP **3.13.0**, 기존 V3 Application·effectLayer·combatLayer·카드 도크를 재사용한다.
- `source/MercenarySkillFX.js`, `source/RenderAuthoredSkill.js`: 기존 `skill-assets-v2/manifest.json`의 스킬별 개별 16프레임, 준비→충돌→소멸. 반려된 정지 이미지 V1은 사용하지 않는다. 아틀라스/프레임 해시는 원본 매니페스트에 보존한다.
- `../project-v-v3/source/battle/MercenaryCombatPlayback.js`: 서버 이벤트의 대상·단계를 공통 GSAP에 재생한다. 연출은 HP·대상·피해·승패를 다시 계산하지 않는다. HP/방벽은 해당 서버 충돌 시점에서만 반영한다.
- `source/MercenaryAttachmentPoints.js`, `../../assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json`: SD 43종의 해시 고정 무기/시전 손/몸통 좌표. 전체 PNG 정규화 좌표이며 Pixi의 전체 변환을 통해 좌우 진영·발끝 앵커·대기 동작·접근·모바일 배율을 반영한다. PNG 원본은 무변경이다.
- `source/MercenarySkillAudio.js`: 기존 배틀슈트 `SkillChipAudio.js`의 녹음 재생·출력 지연 보정기를 재사용한다. V3가 가진 AudioContext를 공유하며 두 번째 컨텍스트·렌더러·라이브러리를 만들지 않는다.

## 단계·충돌 계약

단계 시점은 `shared/mercenary-skills-v1.mjs`의 각 `visual.impacts`가 기준이다. 계정 전투는 서버 `skillPhaseIndex`를 따라 준비와 확정된 각 단계를 재생한다. 두 번째 탄이 첫 번째 탄의 크기/파편으로 되돌아가지 않으며 같은 단계의 광역 표적을 다음 단계로 세지 않는다. 정화/회복, 검격/균열 폭발, 첫 탄/후속탄을 분리한다. 독 부착·접근 지연 같은 부가 기록이 직전 직접 타격을 한 번 더 재생하지 않는다.

배정과 외형은 독립이다. 총기/활은 해당 SD 무기 끝에서 방출하고 다른 외형의 방출 스킬은 시전 손을 사용한다. 이 좌표 설정은 카드 소유 스킬·등급·CMS 배정을 정하지 않는다. 시연 용병을 바꿔도 사용자 배정 문서는 쓰지 않는다.

시연은 FX의 V3 등록 GSAP가, 계정 전투는 기존 `BattleEngine.timeline`이 시계를 가진다. 사운드는 같은 시작 시점·재생 위치·배율로 예약한다. 정지/탐색 시 원음을 멈추고 재개할 때 남은 구간을 재예약한다. 취소/화면 이탈/폐기 시 음원·타임라인·효과 객체를 정리한다. 늦은 아틀라스 응답은 취소한 재생을 다시 시작하지 않는다. 배틀슈트 공통 시간 이벤트는 기존 스킬칩 컨트롤러로 전달한다.

## 음향 출처와 가공

`skill-audio-v1.json`은 **기존 녹음 9파일 / 스킬별 프로필 17종**이다. 신규 원음 17개 제작이 아니다. 파일별 SHA-256, 원음 ID·URL·라이선스, 전역 PCM 피크와 처리 방법을 기록했다.

- 실총 M4A1/AK47/TAC50 대용 M200: 기존 `../project-v-v3/assets/audio/firearm-qc-v1/manifest.json`의 Freesound CC0 원음.
- 검풍/충돌/마법/수계: 기존 `../project-v-v3-event-fx-v1/assets/audio/manifest.json`의 Mixkit 녹음·폴리 합성본. 치명타는 V4, 나머지는 V2다. 반려된 치명타 V3 및 과거 절차적 합성음은 사용하지 않는다.
- 원본 MP3는 바꾸지 않는다. Web Audio에서 구간 선택, 이득, 페이드, 패닝과 공유 배속을 적용한다. 각 스킬의 준비/충돌/잔향은 별도 원음 구간이다. 충돌 구간의 실제 최대 피크를 연출 충돌에 정렬한다.
- 측정 재현: `python scripts/record-mercenary-skill-audio.py`. 이 도구는 기존 파일을 디코딩해 메타데이터를 쓰며 오디오를 새로 합성하거나 원음을 덮어쓰지 않는다.

## 수행한 검증

- `node --test tests/mercenary-presentation-v3.test.mjs`: 43 SD 해시/부착점/진영 반전, 17프로필의 3계층·정확한 피크·취소·두 번째 타격, 보존 원음 해시.
- `node scripts/qa-v3-mercenary-skills.mjs`: 1440px·390px에서 17종씩 **34회 실재생**, 충돌 프레임·자원 풀·공유 등록 시계·정지·배속·취소/복귀·음원 중단·가로 넘침 검사. 브라우저 디코딩 원음 9종의 피크가 기록값과 ±20ms 이내다.
- `node scripts/qa-v3-mercenary-account.mjs`: 실제 인증된 보유/개봉/별도 편성/훈련/성장/복구와 양 진영의 실제 서버 스킬 이벤트.
- `npm run test:skill-chips`: 기존 배틀슈트 42개 검사 통과. 원음·효과·타임라인 계약은 유지한다.
- 로그·캡처는 후보 작업 트리 밖 `../qa/mercenary-skills-final/`, `../qa/mercenary-skills-final.log`에 보존한다.
- `node scripts/qa-v3-mercenary-frames.mjs`: 17종 첫 충돌·마지막 단계 × PC/모바일, 68장. 전체 V3 iframe 합성 화면으로 캡처했으며 `../qa/mercenary-impact-review/index.html`에서 비교한다.
- 최종 공동 후보 회귀는 `npm run release:prepare:v3`의 45개 명령·1,390개 테스트가 통과했다. 실제 운영 게이트와 배포는 보류다.

기능 검증은 사용자의 시각·청음 승인으로 대체되지 않는다. 사용자 확인 전 신규 효과/음향을 운영에 활성화하지 않는다.

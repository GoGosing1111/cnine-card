# 용병 7역할 기본 공격 검수

- 일자: 2026-09-13 / 상태: `USER_APPROVED_LIVE_CONNECTION`. 사용자 답변: “검수 완료, 라이브에 연결”.
- 검수 화면: `/preview/mercenary-role-attacks-v2100/`.
- 7종 × 16프레임 = 112개 고유 프레임. 실제 출력 원본은 1254×1254 RGBA, 런타임 네이티브 셀은 314×314다. 원본 바이트 보존, 정확한 셀 추출, 무손실 WebP 인코딩만 했다.
- 생성: 기본 제공 ImageGen, 역할별 독립 호출. 프롬프트·원본 파일명은 `assets/generation-inputs.json`, 원본/프레임/런타임 해시는 `assets/manifest.json`.
- 제압 V1의 충돌 프레임 5·6에서 셀 가장자리 알파 초과를 발견해 V2를 재제작했다. 다른 6종을 재생성하지 않았다. V2 포함 전체 112프레임의 여백 알파 ≤5 및 고유 픽셀 해시를 검사했다.

| CMS 역할 | 공격·타격 형태 | 충돌 / 총 길이(초) | 기존 녹음 프로필 |
| --- | --- | --- | --- |
| GUARDIAN · 수호 | 방패 강타, 은철 파편과 압력 먼지 | .29 / .86 | MS-003 |
| VANGUARD · 돌격 | 중량 검격, 붉은 절단면과 금속 파쇄 | .28 / .83 | MS-001 |
| ASSASSIN · 기습 | 가는 그림자 절단, 보랏빛 흑요 파편 | .22 / .68 | MS-010 |
| MARKSMAN · 사격 | 짧은 탄착, 황동 불꽃과 화약 연기 | .24 / .69 | MS-009 |
| SNIPER · 저격 | 집속 관통, 루비색 압력파와 가는 파편 | .36 / .90 | MS-004 |
| CONTROLLER · 제압 | 구속 전류, 꺾이는 번개와 이온 파쇄 | .29 / .82 | MS-042 |
| SUPPORT · 지원 | 집속 광탄, 백색·청록 광편의 분산 | .28 / .80 | MS-028 |

## 공용 런타임 계약

PixiJS 8.20.0 / GSAP 3.13.0. `../project-v-v3/source/battle/MercenaryRoleAttackFX.js`의 Pixi AnimatedSprite는 `autoUpdate:false`이며, 전달받은 V3 GSAP 타임라인 하나가 프레임·방출·접근·반동·충돌·소멸을 제어한다. 원래 V3 `BattleEngine`, 그리드, 캐릭터, 실제 일반 카드 아트 어댑터를 재사용한다. 별도 렌더러나 두 번째 Pixi 사본을 만들지 않는다.

프레임 0~3은 무기/시전 준비와 방출, 프레임 4는 충돌, 5~15는 파편과 소멸이다. 기본 1.3 재생 배율에 0.5/1/2배 컨트롤을 적용한다. 검수용 프레임 탐색은 타임라인을 정지하며 서버 피해를 다시 생성하지 않는다.

무기 기준점은 `MercenaryAttachmentPoints.js`의 해시 검증된 총구·시전 접점, 대상은 실제 SD 몸통 접점을 사용한다. 서 있는 위치에서 발사하는 무기는 반동 10px, 근접 무기는 실제 표적에 접근한다. 화면 이탈·세션 교체·취소는 등록된 타임라인과 표시 객체를 정리하고 공유 텍스처는 파괴하지 않는다. 준비 중 대상이 사라지면 빈 자리에 충돌을 표시하지 않는다.

신규 사운드 원음을 만들지 않았다. `preview/project-v-mercenary-system-v1/skill-audio-v1.json`의 녹음 자산 ID·URL·SHA-256·Mixkit/CC0 출처·라이선스를 그대로 사용한다. `MercenarySkillAudio`와 `SkillChipAudio`의 공용 WebAudio Context, 준비/충돌/잔향 분리 및 PCM 피크 기준을 재사용한다. 0.5/1/2배에서 예측 출력 피크와 충돌 차이 ≤20ms, 재생 종료 후 소스 0개를 확인했다. 기존 타격의 소멸 정리가 다음 타격음을 끊지 않도록 선택된 오디오 계획의 소유권을 확인한다.

## 검증 기록

- `node scripts/build-mercenary-role-atlases-v2100.mjs`: 원본 알파·셀 잘림·실제 프레임 고유성·원본 해시 검사 통과.
- `node scripts/build-mercenary-role-review-v2100.mjs`: 운영 CMS 53의 43종 역할 연결과 기존 공용 V3 빌드 통과. `catalog-snapshot.json`은 읽기 전용이며 기본 공격 검수 fixture에서만 스킬을 생략한다.
- `node --test tests/mercenary-performance-v2100.test.mjs tests/mercenary-role-assets-v2100.test.mjs`: 성능 회귀와 자산 검사.
- 실제 Edge/Pixi WebGL: 1440px·390px에서 7역할 전부 16프레임 탐색, 접점이 대상 몸통 내부임을 확인, 원거리 반동/근접 접근, 정지 상태 프레임 고정, 2배 재생 1회 충돌, 종료 후 역할 이펙트 0개.
- 활·마법·창·건틀릿 추가 검사: 준비 중 대상 제거 시 충돌 표시 없음, 취소 뒤 객체 0개.
- 전체 서버 타임라인: 배정 스킬 포함 PVP/PVE 및 기본 공격 양 진영 PVP 완료, 잔여 역할/스킬 이펙트 0개.
- 오디오 0.5/1/2배 피크 동기화와 소스 정리 통과. 자동 검수 요약은 `verification.json`.

기존 배틀슈트 로켓런처·헬기폭격과 동일한 연속 프레임/충돌/소멸 기준으로 기술 검수했다. 후속 시각·타격음 확인 및 라이브 연결 승인은 `assets/user-approval.json`에 7종 해시와 함께 기록했다. 현재 검수 화면도 별도 패치 없이 운영 공용 엔진의 기본 공격을 그대로 사용한다.

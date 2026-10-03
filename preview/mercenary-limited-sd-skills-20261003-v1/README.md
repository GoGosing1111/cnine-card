# 리미티드 SD·스킬 이미지·후광 오라 검수
2026-10-04 수정 · built-in image_gen 제작 · 새 제작물 USER_REVIEW_PENDING

## 현재 검수본
- [검수 화면](index.html?character=valter)은 **발테르 V-996**을 기본으로 표시한다. 사용자의 2026-10-04 명시적 정정이 이전 베르칸 해석을 대체한다.
- 화면 높이 비율로 크게 띄우던 배치를 제거하고 **기존 V3 용병 슬롯·발판·진형 배율**을 사용한다. 일반 카드 5장과 상대 카드들을 함께 표시해 실제 크기를 비교한다.
- 임의의 200/250 몸체 높이·확대/축소율을 사용하지 않는다. **기존 일반 전투 SD의 fullBodyHeight**를 직접 재사용한다. 현재 기준 260이며 진형 배율·이름표·발판 위치도 공용 V3 값을 사용한다. 신규 패킹의 투명 여백은 원본 이미지 크기로 환산한다.
- 발테르의 **승인 V17 전신 실루엣 광원·테두리 광원·기존 오라 시트·지면 고리·상승 입자**를 기존 KnightFX 코드 그대로 함께 표시한다. 새 뒤쪽 오라로 기존 주변 이펙트를 대체하지 않는다. 기존 한 시계에 연결하며 원본 모션·이펙트 파일은 수정하지 않는다.
- 독립된 뒤쪽 오라는 몸체 폭보다 넓게 펼치고, 발테르에는 **붉은색 `#ff2437`**을 적용한다. 발 위치는 승인된 픽셀 피벗으로 발판 중앙에 고정한다.
- 발테르의 승인 SD·V17 모션·무기·효과 원본은 바이트 그대로 보존한다. 베르칸 V-055는 이 리미티드 검수 목록에 포함하지 않는다.
- 신규 SD는 나무늘봉순·조은·이네스·오리꿍·디임 5종이다. 인간형은 대두/치비로 만들지 않았고 원화의 성인 비율을 유지했다.
- 신규 5종은 **정지 SD와 스킬 이미지 제작 범위**다. 발테르의 기존 승인 모션·스킬 시연도 승인된 원래 발테르 크기로 맞췄다.
- 실제 확인 영상: [V3 재생 영상](qa/limited-sd-aura-skills-review.webm)

## 제작물
| 캐릭터 | 신규 SD | 스킬 이미지 시안 | 후광 |
|---|---|---|---|
| 나무늘봉순 V-990 SS | 원화의 저격총·허스키 보존, 전방 조준 | 빙결 저격 12프레임 | 얼음빛 청색 |
| 조은 V-991 SS | 확장 레일 중화기, 자연스러운 양손 파지 | 청광 레일포 12프레임 | 전기 청색 |
| 이네스 V-992 SS | 승인 얼굴·귀·의상, 전방 손바닥 발사점 | 자수정 나선 12프레임 | 자수정 보라 |
| 오리꿍 V-993 SS | 오리 체형·석궁 유지 | 황금 석궁 12프레임 | 금색 |
| 디임 V-994 SS | 백금 의상·결정 지팡이 유지 | 월광 결정 12프레임 | 은백 청색 |
| 발테르 V-996 SSS | **기존 승인 SD 그대로 재사용** | 기존 승인 스킬 유지 | **붉은색** |

스킬 명칭은 그림을 구분하는 가칭이며 새 리미티드 5종의 공식 스킬 배정·수치·획득·편성 활성화가 아니다. 발테르와 신규 5종의 운영 획득·편성·전투 잠금은 유지한다.

- 신규 SD 원본: `assets/sd/` 5장
- 패킹된 투명 SD: `assets/runtime/` 5장. 원본 RGBA에 동일한 64px 투명 여백만 추가한다.
- 스킬 원본 시트: `assets/effects/` 5장 × 12프레임
- 충전·발사·적중 개별 PNG: `assets/frames/` 60장
- 후광 루프: `assets/aura/limited-rear-aura-sheet-v1.png` 8프레임. 공통 희귀도 오라를 캐릭터별 색으로 표시한다.
- 파일 규격·SHA-256: [manifest.json](manifest.json)
- 발·등·총구/손바닥 좌표와 무기 축: [pose-registration.json](pose-registration.json)

## 승인 발테르 리소스 보존
- [승인 기록](../../assets/ui/project-v/mercenaries/mercenary-valter-approval-20261001.json)
- [승인 SD PNG](../../assets/ui/project-v/mercenaries/limited-20261002/valter-approved-sd.png)
- SD SHA-256: `D2CAB7DDE716CF9A0554AF44A03A448A7BCCD9E402928D87620C72C73879A6CC`
- [기존 V17 모션·스킬 시연](../mercenary-crimson-silver-knight-battle-v1/)
- [공통 전장 표시 기준](display-policy.mjs)
- [보존 파일 감사](preservation-report.json)

## 생성 입력과 프롬프트
모든 신작 래스터는 **built-in image_gen**으로 만들었다. 원화·승인 SD를 덮어쓰지 않았다.
- [SD 프롬프트 5종](prompts-sd.json)
- [각 스킬 프롬프트 5종](prompts-effects.json)
- [오라 프롬프트와 사용자 참조](prompt-aura.json)
- [SD 출력 출처](generated-sd-provenance.json), [효과 출력 출처](generated-fx-provenance.json), [오라 출력 출처](generated-aura-provenance.json)

총기 전체를 단일 강체로 보고 총몸·총열·총구·상하 레일의 연속된 직선을 검수했다. 발사 효과는 이미지 셀의 빈 가장자리가 아니라 **그려진 발광 시작점**을 총구 바로 앞에 맞춘다. 효과는 기록된 무기 축에 따라 동일 비율로 배치하고 회전한다. 마법은 손바닥, 석궁은 화살 전방을 별도 기준으로 사용한다. 손 위치에 맞춰 무기를 비선형 변형하지 않는다.

## 재현·검수
```powershell
node preview/mercenary-limited-sd-skills-20261003-v1/pack-assets.mjs
node preview/mercenary-limited-sd-skills-20261003-v1/build.mjs
node --test preview/mercenary-limited-sd-skills-20261003-v1/qa.test.mjs
$env:X_BODY_PREVIEW_PORT='8978'
node preview/mercenary-limited-sd-skills-20261003-v1/serve.mjs
node preview/mercenary-limited-sd-skills-20261003-v1/qa-browser.mjs
node preview/mercenary-limited-sd-skills-20261003-v1/record-review.mjs
```
- 기존 V3 BattleEngine·전장·카드 도크를 재사용한다. PixiJS·GSAP 각 1개, 연출용 공용 시계 1개.
- PC 1440px·모바일 390px에서 6종 표시, 총구 정렬, 오라/효과 ON/OFF, 0.25/1/2배속, 일시정지, 탐색, 중단을 확인한다.
- 원화/기존 SSS SD 해시, 진짜 알파, 60개 개별 효과 PNG의 존재·해시, 운영 잠금을 관련 검사로 확인한다.
- 브라우저 증빙: [검수 결과](qa/browser-report.json), [PC](qa/desktop-page.png), [모바일](qa/mobile-page.png)
- 신규 5종의 원화 파생 SD는 사용자 시각 승인 전이다. 완성 전투 모션 공정의 몸 시트·승인 무기 픽셀 합성·실전 스킬 연결은 이번 정지 이미지 산출물에 포함하지 않는다.

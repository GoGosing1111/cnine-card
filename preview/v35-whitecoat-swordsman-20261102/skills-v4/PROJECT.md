# 흰 코트 검사 · 관통 / 잔영 협공 / 검흔 종결

2026-11-02. 사용자 “훌륭하네”는 앞선 **action-v3 회전·도약 연격**에 대한 긍정 피드백으로 보존한다. 이번 후속 요청은 새롭고 화려한 스킬·이펙트 제작과 지정 영상의 **0.5배속** 참고다. `skills-v4`는 리소스의 네 번째 제작 단계이며 V4 쿼터뷰 엔진을 뜻하지 않는다.

현재 결과는 **새 자세 12개, 고유 기술 3개, 새 Effekseer 효과 5종과 준비 컷인**을 기존 V3에 연결한 로컬 검수본이다. 전신 교체 작화 방식이다. 팔다리 메시/IK, 정식 서버 스킬 등록, 운영 배포, DNF급 전체 품질 달성으로 확대하지 않는다.

## 참고와 적용

[던파TV · 진(眞) 검귀](https://www.youtube.com/watch?v=HzCF1Iot0ew)를 화면 없는 Chrome에서 **playbackRate=0.5로 처음부터 끝까지** 재생했다. 원본 32.921초, 실제 경과 65.934초, 시간/배속 기록이 있는 표시 프레임 131개와 접촉 시트 9장을 확인했다. 매 원본 프레임을 추출하거나 영상 전체를 연속 시청했다는 뜻은 아니다. 일부 캡처 간격은 부하로 길어졌다. [분석 기록](reference/analysis.json); 원본 캡처 증거는 프로젝트 루트 `output/reference-review/dnf-whitecoat-skills-20261102/half-speed.json`에 있다. DNF 캐릭터·텍스처·영상은 게임 리소스에 넣지 않았다.

- 4.5~5.75초: 빠른 관통, 어두운 내부와 밝은 절단면, 별도 접촉 파열 → **흑금 단공**.
- 6.5~8.5초, 9.75~12.9초: 위치·각도가 다른 협공, 겹치는 곡선과 비어 있는 중심 → **잔영 삼재**.
- 17.5~20.5초, 23.5~28.8초: 준비/컷인, 검흔 누적 후 집중 파열, 짧은 밝기 정점과 잔향 → **천형 종결**.

흰 코트 원화의 검정·금색·백색 정체성에 맞춰 새 작화를 만들었다. 참고 영상의 색이나 캐릭터를 복사하지 않았다.

## 세 기술

| 기술 | 본체와 공간 | 주 효과 | native 시각 접촉 / 최종 피해 |
| --- | --- | --- | --- |
| 흑금 단공 `skill_rift` | 낮게 모음 → 빠른 관통 → 반대쪽 제동 → 회수 | 지나간 자리에 고정되는 수평 먹빛 검흔, 밝은 날, 짧은 파열과 자세 잔상 | 0.48초 / 0.48초 1회 |
| 잔영 삼재 `skill_echo` | 본체의 지휘 → 좌·우·상단 잔영 → 본체 내려베기 | 세 방향의 큰 초승달 검광, 마지막 수직 절단·지면 압력 | 0.57 / 0.89 / 1.21 / 1.51초, 마지막만 피해 1회 |
| 천형 종결 `skill_verdict` | 칼을 세워 집중 → 컷인 → 양손 준비 → 내려베기·납도 | 세 방향 검흔 누적, 중심의 왕관 모양 파열, 교차 섬광, 지면 압력과 입체 파편 | 0.66 / 1.02 / 1.36 / 1.78초, 마지막만 피해 1회 |

native 길이는 1.67 / 2.62 / 3.30초다. 시각 타격 정지까지 포함하면 1.735 / 2.78 / 3.485초이며 V3 기본 1.3배 속도를 그대로 적용한다. 별도 피해 계산이나 다단 피해를 추가하지 않았다. 잔영은 공유 Spine atlas를 쓰는 별도 시각 배우이며 같은 등록 GSAP 시간에서 갱신된다.

## 실제 제작 파일

- [Spine 정본](../whitecoat-skills-v4-51fecca13bde.spine), [runtime](../runtime-skills-v4-51fecca13bde/whitecoat.json), [native 검증](qa/native.json): Pro 4.3.26 실제 저장·재열기·내보내기, 1스켈레톤/7뼈/1슬롯/**30전신 attachment/11애니메이션**. 이전 18자세와 8애니메이션 보존. 새 원본 해시 `b0abcbf1bda97b8d700328b9453e0a61fbec96cf0063e21a1907bef444a57ef6`.
- [원화 생성 내역](source/generation.json), [자세 프롬프트](source/pose-prompts.json), [효과 프롬프트](source/effect-prompts.json), [컷인 프롬프트](source/cutin-prompt.txt). 내장 ImageGen 8회: 자세 시트 4개 중 3개 선택, 효과 시트 3개, 컷인 1개. 칼을 잘못 잡은 초기 관통 시트도 반려 기록으로 보존했다.
- [12자세 기준점](pose-inputs.json), [30자세 등록](pose-registration.json), [동작 계약](actions.json), [새 자세 비교](qa/pose-lineup.png). 일반 사각형 분리와 균일 배율만 사용했다. 신체/칼의 마스크 절삭이나 픽셀 덧칠은 하지 않았다.
- [Effekseer 소스](effects/native/), [native 검증](effects/qa/native.json), [프레임 출력](effects/qa/effekseer-bake.json), [게임용 패킹](effects/runtime/fx-manifest.json). **3개 8장 연속 작화 효과 + 절단 파편 + 지면 압력**을 1.70e CUI에서 저장/재열기/내보냈다. 같은 폴더에서 텍스처 상대 경로를 유지한 왕복 export 바이트가 같다. 다른 폴더 export에서 텍스처 경로가 달라지는 문제를 먼저 수정했다.
- 공식 WebGL 1.70e는 오프라인 출력에만 사용했다. 원본 PNG **160프레임**, 빈 선행 프레임을 제외한 runtime **156프레임 참조**. normal 검흔은 실제 알파와 검은 내부를 보존하고, additive 섬광/압력은 별도 합성한다. 동일 출력 프레임은 atlas 위치만 공유하여 신규 효과 디코딩 추정을 60.95→38.71MiB로 줄였다. 생성 원본·출력 프레임은 보존했다.
- Runway 검 궤적 재질, 기존 Effekseer 접촉 파열, Blender [contact-debris.blend](../../v35-effects-production-20261102/native/contact-debris.blend)를 재사용했다. 새 Blender 모델이나 Runway 생성·결제는 하지 않았다. 이번 작업에 Krita/Aseprite/Layer를 썼다고 기록하지 않는다.

## V3 연결과 검수

검토 화면은 [review.html](../review.html), 실제 전장은 `http://127.0.0.1:18766/?case=whitecoat`다. **흑금 단공 / 잔영 삼재 / 천형 종결** 버튼과 **0.5배 검수**를 제공한다. 기존 기본 베기·발도·회전/도약 연격도 유지한다.

공유 체크아웃에서 다른 작업 중이던 V3 로더와 번들의 버전 불일치를 발견했다. 공유 파일을 바꾸지 않고, 한 `origin/main` 커밋의 V3 모듈을 Git 객체에서 읽어 번들하고 같은 커밋의 로더를 검수 폴더에 고정했다. 정확한 커밋·파일 해시는 [build.json](../../v35-v3-upgrade-20261101/qa/build.json)에 있다. 기존 의존성과 자산을 재사용하며 전체 체크아웃 복사·운영 소스 수정은 없다.

- [68개 재생 검사](qa/verification.json): 3기술의 타격 정지, 최종 1회 피해, 탐색 중 중복 피해 방지, 직접 탐색/24fps 결과 일치, 효과 OFF/ON, 정지·취소·숨김·죽음·부활·편성/HUD/상대 위치 복귀, 기존 3공격, 적 방향/390px, 단일 canvas. 최초 검사에서 관통 잔영의 이전 변환행렬과 이동 중 칼끝 고정 문제를 찾아 현재 전역 변환과 지속 추적으로 수정했다.
- [7개 녹화](qa/recording.json): 정상 속도 ON/OFF 기술별 3회, 실제 V3 0.5배속 세 기술 각 1회, 합계 **21회·최종 피해 21회**. VP8 postrender 캡처, 런타임 시계를 바꾸지 않는다. 정상속도 기록에서 새 자세가 실제 렌더된 것을 확인했다.
- [영상/페이지/기존 경로](qa/review-video.json), [기존 TURN/회피/세션 전환](qa/event-integration.json): 실제 디코딩 프레임, PC/390px 영상 진행·탐색·재개·0.5배 버튼·Range 응답, 기존 mixed/cardgu 경로를 점검한다. 최종 결과와 관측 한계는 해당 JSON을 따른다.

시각 검수는 새 작화 12장, 기술별 주요 전장 캡처, 정상 속도 ON/OFF 영상의 시간별 추출 프레임, 적 방향/390px 캡처를 확인한 범위다. 연속 영상 전체 시청, 물리 모바일 성능, 전 PVP/협동 조합을 검사한 것으로 확대하지 않는다. 사용자 화면은 조작하지 않았다.

## 남은 품질 범위와 재현

새 기술의 사용자 최종 시각 평가는 아직 받지 않았다. 교체 자세 사이의 추가 중간 작화, 연속 발도/납도, 양발 보행·후퇴, 사운드, 정식 서버 스킬 등록과 동시 출전 실기기 성능은 후속 범위다. 망토·장식 미세 흔들림은 사용자 지시대로 필수에서 제외한다. 상대 방향은 좌우 반전이며 별도 반대쪽 작화가 아니다.

현재 전체 검수 로드 구성의 디코딩 추정은 **128.93MiB**다. Spine 4개 atlas 약46.59MiB와 효과·기존 재질·컷인 mipmap 약82.34MiB의 합계이며, 기준 대기 PNG/기존 V3 전장 자산/렌더 타깃은 제외한다. 실기기 GPU 사용량이나 FPS 보장 수치가 아니다. 최종 정상 녹화에서 관측한 최대 렌더 간격은 38.3ms이며 숨김 Chrome/해당 PC 조건에만 해당한다.

보존된 AI 원본에서 다시 패킹하고 편집 원본을 만드는 순서:

```powershell
node preview/v35-whitecoat-swordsman-20261102/skills-v4/prepare-art.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/author.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/native.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/effects/author.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/effects/bake.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/effects/pack.mjs
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/qa/verify.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/qa/record.mjs
node preview/v35-whitecoat-swordsman-20261102/skills-v4/qa/review-video.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/event-integration.mjs preview/v35-whitecoat-swordsman-20261102/skills-v4/qa
```

최신 `.spine`에 사용자가 추가 편집하면 덮어쓰지 않고 그 파일에서 이어간다. 원화/기존 native/기존 작화/반려안/프롬프트/해시/영상은 보존한다. 운영 배포·계정 쓰기·메시지·유지관리·삭제·예약은 하지 않았다.

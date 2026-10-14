# 백색 포격 · 머리 선명도와 광륜 복원 V2

사용자 요청은 승인된 흑백 총기 캐릭터의 전투 리소스 제작이다. 총구 앞 탄환 정렬, 카이론과 다른 스킬·광역기, 적중한 적의 해골 표식과 적 진형 앞 자주포를 사용한다. 후속 지적에 따라 초기 시트의 거친 머리·얼굴과 광륜 누락을 수정했다. `백색 포격`, `백탄 낙인`, `망령 포대`는 연출 설명용 명칭이며 캐릭터 이름이나 확정 스킬명이 아니다.

현재 검수본은 `index.html`, 전체 시연 녹화는 `review.html`, 확대 그림은 `qa/character-detail.png`다. **원화 V3 승인과 새 전투 시안의 최종 시각 승인은 별개이며 전투 시안은 승인 대기다.** 이름·등급·운영 코드·능력치·서버 피해·획득/편성은 추가하지 않았다.

## 수정 내용

- 얼굴·머리를 큰 단일 자세 원본에서 다시 제작했다. 1,254px 원본 5장을 1,536px 투명 셀에 패킹하고, 신체 유효 높이는 720px로 보존한다. 이전 저해상도 시트를 확대하거나 선명화 필터로 대체하지 않았다.
- 머리 뒤 원형 광륜은 필수 후면 레이어다. 모든 자세의 머리 좌표에 고정하며 대기 중 몸·발·광륜 중심은 움직이지 않는다. 12개의 광원 작화만 6초에 걸쳐 변화한다. 동작만 보기/취소는 기술 검수용으로 레이어를 숨긴다.
- 승인 원화의 총기 픽셀 61,742개를 선택하여 같은 RGBA를 모든 자세에 합성했다. 균일 배율 0.68, 이동·회전만 사용하며 비선형 변형이나 총기 재생성은 없다. 원화에서 손에 가렸던 파지는 새 자세의 손 레이어가 덮는다. 총몸부터 총구까지 하나의 직선 강체다.
- 준비·조준·반동·포격 지시·발포 지시의 실제 자세 5개와, 광륜/은탄/해골/자주포/지면 폭발 각 12프레임(총 60개 효과)을 사용한다. 반복 재생은 새 작화 수로 세지 않는다. 별도의 대시·피격·쓰러짐 작화는 이 묶음에 포함하지 않는다.
- 단발은 실제 총구에서 발사한다. 스킬은 은탄 3개를 총구 앞 축에 정렬한 뒤 정밀 사격하고, 적중한 적 위에 해골을 형성·해체한다. 광역기는 적 진형 앞 지면에서 자주포를 출현시킨 뒤 포신 반동·포탄 비행·5개 적 지점의 폭쇄를 연결한다.
- 카이론의 쌍우지 20/24연사·공중 수직 미사일·회전 스코프와 다른 연출이다. 카이론의 원화·자산·게임 로직은 변경하지 않았다.

## 원본과 반려 이력

승인 원화: `../monochrome-gunner-illustration-20261015-v1/approval-aura-v3-20261015.json`. SHA-256 `3b67b37e9e3ab1e017552c6d6864c0469056edc1332c2555c9f4cc6f5e3ffe65`.

초기 `body-aim.png`, `body-skill.png`, `body-command.png`, `body-move-rejected.png`는 반려 이력으로만 보존한다. 2×2 제작 중 머리 디테일이 거칠어졌다는 사용자 교정이 우선하므로, 현재는 큰 단일 자세를 사용한다. `battle-base-v2.png`는 가장자리 여유가 부족한 중간본, `battle-base-v3.png`는 새 몸 제작의 스타일 입력이다. 그 중간본의 재생성된 총기는 최종 패킹에 사용하지 않았다.

실제 생성 도구는 built-in image_gen이며 원본과 전체 프롬프트는 `source-index.json`, `assets/sources/`, `prompts/`에 보존한다. Node/sharp는 승인된 기술 공정인 알파 선택·원본 총기 강체 합성·피벗 등록·패킹·검수 접촉 시트 생성에만 사용했다. 손·관절·머리·의상·효과의 창작은 이미지 생성 원본이다.

몸 원본에는 광륜이 포함되어 있다. 독립 재생을 위해 기술 마스크로 광륜을 분리하고 생성된 전용 광륜을 다시 머리 뒤에 표시한다. `assets/frames/{ready,brace,recoil,commandPoint,commandFire}-0.png`는 본체/총기 레이어이므로 **이 파일만 최종 완성 그림으로 제시하지 않는다.** 완성 보기에는 `qa/*-with-halo.png` 또는 V3 시연을 사용한다.

## 11단계 제작·검수

| 단계 | 증빙 |
| --- | --- |
| 01 승인 원화 고정 | 승인 JSON, 원화 복사본 SHA-256 일치 |
| 02 동작·타격 설계 | `skill.mjs`: 총구 점화·발사·적중·잔향·복귀 시간 |
| 03 몸 자세 작화 | 큰 단일 자세 원본 5장과 프롬프트; 초기 다중 시트 반려 기록 |
| 04 원본 무기 강체 | `rifle-lock.json`, `extract-approved-rifle.mjs`, `assets/locked/rifle-provenance.json` |
| 05 연속 효과 작화 | 5종 × 12프레임, 각각 생성·발사/반동·해체 변화 |
| 06 알파·등록·패킹 | `pose-registration-v2.json`, `pack-assets.mjs`, 개별 프레임·아틀라스·manifest |
| 07 타격·지면 | 총구 축 정렬 오차 0, 적중점 오차 0, 몸 지면 이동 오차 0 |
| 08 공통 V3 | 기존 BattleEngine·BattleCharacter·진형·카드 도크·아트 어댑터, 등록된 GSAP 단일 시계 |
| 09 PC·모바일 | 1440×1080 / 390×844; 정지·탐색·0.25/0.5/1/2배·중단·대상 소실·동작 줄이기·탭 숨김·dispose PASS |
| 10 영상·재현 | PC·모바일 각 19초 실제 캔버스 녹화, 디코딩 재생, X 기준 영상 재생 확인 |
| 11 시각 승인 | **사용자 최종 시각 승인 대기. 운영 연결 OFF** |

`qa-assets.test.mjs` 관련 검사 5개와 `qa-runtime.mjs` PC·모바일 검수가 통과했다. 대기 실재생 각각 34회 표본에서 몸 상태 1개·광륜 위치 1개·광원 상태 34개를 확인했다. 생성 시트의 투명 픽셀을 일부 뷰어가 파란 노이즈로 보이는 현상이 있어 광륜·기준 스프라이트·초기 시트 표본의 실제 가시 픽셀 색을 점검했으며 가시 파란 픽셀은 없었다. 최초 브라우저 검수는 닫힌 검수 패널을 열지 않은 테스트 조작 오류로 중단됐고, 패널 열기 동작을 추가한 최종 검수는 통과했다.

수치·구조 검수와 시각 검수는 별개다. 승인 원화와 새 얼굴의 캐릭터성, 자세 간 전환, 화려함의 최종 채택은 사용자가 판단한다. 반려본을 현재 승인본으로 바꾸지 않는다.

원격의 별도 카이론·헬리오스 수정과 진무 지급 커밋까지 병합한 뒤 공통 로더 버전이 달라져 이 프리뷰 번들을 다시 빌드했다. 본 리소스·동작·효과 실행 코드는 그대로이며 PC·모바일 로딩·광륜·스킬·광역기·정리 경로만 추가 확인했다. 최신 번들 해시는 `qa/loader-sync-report.json`에 기록한다. 기존 전체 시연과 자산 검수를 반복하지 않았다.

## 재현

```powershell
node preview/mercenary-monochrome-artillery-battle-v1/extract-approved-rifle.mjs
node preview/mercenary-monochrome-artillery-battle-v1/pack-assets.mjs
node preview/mercenary-monochrome-artillery-battle-v1/build-detail-preview.mjs
node preview/mercenary-monochrome-artillery-battle-v1/build-source-index.mjs
node preview/mercenary-monochrome-artillery-battle-v1/build-preview-shell.mjs
node preview/mercenary-monochrome-artillery-battle-v1/build.mjs
node --test preview/mercenary-monochrome-artillery-battle-v1/qa-assets.test.mjs
node preview/mercenary-monochrome-artillery-battle-v1/serve.mjs
# 별도 터미널
node preview/mercenary-monochrome-artillery-battle-v1/qa-runtime.mjs
node preview/mercenary-monochrome-artillery-battle-v1/inspect-video.mjs
```

로컬 주소: `http://127.0.0.1:8877/preview/mercenary-monochrome-artillery-battle-v1/`. 무음 시각 검수다. 프리뷰 자산·문서 범위 커밋으로 보존하며 게임 운영 배포/출시 활성화는 수행하지 않는다.
